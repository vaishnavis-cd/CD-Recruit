import json
import os
import sys
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.responses import JSONResponse

# Force UTF-8 encoding on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Suppress TensorFlow deprecation warnings and info logs
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# On Windows, register virtualenv DLL search paths for TensorFlow/MSVC C++ runtimes
if sys.platform == "win32":
    venv_dir = os.path.dirname(os.path.dirname(sys.executable))
    scripts_dir = os.path.join(venv_dir, "Scripts")
    os.environ["PATH"] = venv_dir + ";" + scripts_dir + ";" + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory"):
        if os.path.exists(venv_dir):
            try: os.add_dll_directory(venv_dir)
            except Exception: pass
        if os.path.exists(scripts_dir):
            try: os.add_dll_directory(scripts_dir)
            except Exception: pass

try:
    import tensorflow as tf
    
    def _patch_internal_obj(target):
        if target and hasattr(target, "__internal__"):
            internal_mod = getattr(target, "__internal__")
            if not hasattr(internal_mod, "register_load_context_function"):
                reg_fn = getattr(internal_mod, "register_call_context_function", lambda fn: fn)
                setattr(internal_mod, "register_load_context_function", reg_fn)

    _patch_internal_obj(tf)
    if hasattr(tf, "compat") and hasattr(tf.compat, "v2"):
        _patch_internal_obj(tf.compat.v2)

    import tf_keras
    import tf_keras.api._v2.keras as tf_keras_v2
    sys.modules["tensorflow.keras"] = tf_keras_v2
    sys.modules["keras"] = tf_keras_v2
except Exception:
    pass

from deepface import DeepFace

app = FastAPI(title="CD-Recruit Face Verification Service", version="1.0.0")

# Cosine distance threshold for ArcFace verification
# Distances <= 0.68 are considered a face match
THRESHOLD = 0.68
MODEL_NAME = "ArcFace"
DETECTOR_BACKEND = "mtcnn"


def extract_face_embedding(img_bytes: bytes) -> list[float]:
    """
    Decodes image bytes, runs DeepFace.represent using ArcFace and mtcnn.
    Returns the 512-d float embedding list or raises ValueError if no face detected.
    """
    nparr = np.frombuffer(img_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_bgr is None:
        raise ValueError("Could not decode image bytes into a valid image")

    # DeepFace accepts BGR numpy arrays directly when loaded via cv2
    results = DeepFace.represent(
        img_path=img_bgr,
        model_name=MODEL_NAME,
        detector_backend=DETECTOR_BACKEND,
        enforce_detection=False,
    )

    if not results or len(results) == 0:
        raise ValueError("No face detected in uploaded image")

    # If enforce_detection=False, check face area / confidence or embedding validity
    first_result = results[0]
    embedding = first_result.get("embedding")
    
    # Check if face was actually detected or if region is empty/invalid
    face_area = first_result.get("facial_area", {})
    if face_area.get("w", 0) == 0 or face_area.get("h", 0) == 0:
        raise ValueError("No face detected in uploaded image")

    if not embedding or not isinstance(embedding, list):
        raise ValueError("No face detected in uploaded image")

    return [float(x) for x in embedding]


def compute_cosine_distance(u: list[float], v: list[float]) -> float:
    """
    Computes cosine distance between two float vectors:
    distance = 1.0 - (u . v) / (||u|| * ||v||)
    """
    u_arr = np.array(u, dtype=np.float64)
    v_arr = np.array(v, dtype=np.float64)

    norm_u = np.linalg.norm(u_arr)
    norm_v = np.linalg.norm(v_arr)

    if norm_u == 0 or norm_v == 0:
        return 1.0

    dot_product = np.dot(u_arr, v_arr)
    cosine_sim = dot_product / (norm_u * norm_v)
    # Clamp cosine similarity to [-1.0, 1.0] to prevent floating point inaccuracies
    cosine_sim = max(-1.0, min(1.0, float(cosine_sim)))
    return float(1.0 - cosine_sim)


@app.get("/health")
def health():
    return {"status": "ok", "service": "face-verify", "model": MODEL_NAME}


@app.post("/enroll")
async def enroll(image: UploadFile = File(...)):
    """
    Accepts multipart form-data: `image` (file)
    Extracts ArcFace embedding vector.
    Returns 422 if no face detected.
    Returns JSON: { "embedding": [float, ...], "model": "ArcFace" }
    """
    try:
        contents = await image.read()
        embedding = extract_face_embedding(contents)
        return {"embedding": embedding, "model": MODEL_NAME}
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Face enrollment failed: {str(exc)}",
        )


@app.post("/verify")
async def verify(
    image: UploadFile = File(...),
    embedding: str = Form(...),
):
    """
    Accepts multipart form-data: `image` (file, live selfie) + `embedding` (JSON string of float array)
    Extracts embedding from uploaded image.
    Computes cosine distance directly.
    Returns JSON: { "matched": bool, "distance": float, "threshold": float }
    """
    try:
        try:
            stored_embedding = json.loads(embedding)
            if not isinstance(stored_embedding, list):
                raise ValueError("Embedding must be a JSON array of floats")
        except Exception as json_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid embedding JSON string: {str(json_err)}",
            )

        contents = await image.read()
        live_embedding = extract_face_embedding(contents)

        distance = compute_cosine_distance(live_embedding, stored_embedding)
        matched = bool(distance <= THRESHOLD)

        return {
            "matched": matched,
            "distance": round(distance, 4),
            "threshold": THRESHOLD,
        }
    except HTTPException:
        raise
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Face verification failed: {str(exc)}",
        )
