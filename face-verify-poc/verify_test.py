import os
import sys
import time
import warnings
from pathlib import Path

# Force UTF-8 encoding for Windows console to support emoji logging in DeepFace
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Suppress TensorFlow deprecation warnings and info logs
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
warnings.filterwarnings("ignore")

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

# Configure Keras binding for DeepFace
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
    
    try:
        import tensorflow._api.v2.compat.v2 as tf_v2_compat
        _patch_internal_obj(tf_v2_compat)
    except Exception:
        pass

    import tf_keras
    import tf_keras.src.utils
    import tf_keras.src.engine.training
    import tf_keras.src.applications
    import tf_keras.src.saving.saving_api
    import tf_keras.api._v2.keras as tf_keras_v2

    sys.modules["tensorflow.keras"] = tf_keras_v2
    sys.modules["keras"] = tf_keras_v2
except Exception:
    pass

# DeepFace import
try:
    from deepface import DeepFace
except ImportError as err:
    print(f"[ERROR] Failed to import DeepFace: {err}")
    print("        Please run: pip install -r requirements.txt")
    sys.exit(1)

# -----------------------------------------------------------------------------
# HARDCODED TEST PAIRS
# Format: (img1_relative_or_abs_path, img2_relative_or_abs_path, expected_label)
# expected_label options: "same" (same person) or "different" (different persons)
# -----------------------------------------------------------------------------
TEST_PAIRS = [
    # Example 1: Same person comparison (replace with your real image filenames in images/)
    ("images/candidate_selfie.jpg", "images/candidate_id.jpg", "same"),
    
    # Example 2: Different persons comparison
    ("images/candidate_selfie.jpg", "images/other_person_id.jpg", "different"),
    
    # Example 3: Add additional test pairs here...
]

# Model Configuration
MODEL_NAME = "ArcFace"
# Options: 'mtcnn' (recommended for face cropping), 'retinaface', 'ssd', 'skip'
DETECTOR_BACKEND = "mtcnn"
DISTANCE_METRIC = "cosine"   # Options: 'cosine', 'euclidean', 'euclidean_l2'
ARCFACE_THRESHOLD = 0.58     # Strict KYC threshold (default DeepFace 0.68 is too loose for ID proof verification)


def run_verification():
    print("=" * 70)
    print("   DEEPFACE + ARCFACE STANDALONE PROOF-OF-CONCEPT TEST")
    print("=" * 70)
    print(f"Model Name       : {MODEL_NAME}")
    print(f"Detector Backend : {DETECTOR_BACKEND}")
    print(f"Distance Metric  : {DISTANCE_METRIC}")
    print(f"Total Configured : {len(TEST_PAIRS)} pair(s)")
    print("-" * 70)
    print()

    total_tested = 0
    passed_expectation = 0
    failed_expectation = 0
    skipped_count = 0

    base_dir = Path(__file__).parent.resolve()

    for idx, (img1_rel, img2_rel, expected_label) in enumerate(TEST_PAIRS, start=1):
        img1_path = (base_dir / img1_rel).resolve()
        img2_path = (base_dir / img2_rel).resolve()

        img1_name = img1_path.name
        img2_name = img2_path.name

        print(f"[{idx}/{len(TEST_PAIRS)}] Testing Pair: {img1_name} vs {img2_name}")
        print(f"    Expected Match : {expected_label.upper()}")

        # File existence check
        if not img1_path.exists():
            print(f"    [SKIP] Image 1 not found: {img1_path}")
            skipped_count += 1
            print("-" * 70)
            continue
        if not img2_path.exists():
            print(f"    [SKIP] Image 2 not found: {img2_path}")
            skipped_count += 1
            print("-" * 70)
            continue

        start_time = time.time()
        try:
            # Call DeepFace verify engine
            result = DeepFace.verify(
                img1_path=str(img1_path),
                img2_path=str(img2_path),
                model_name=MODEL_NAME,
                detector_backend=DETECTOR_BACKEND,
                distance_metric=DISTANCE_METRIC,
                enforce_detection=False  # Avoid hard crash if face angle/lighting is low contrast
            )

            elapsed = time.time() - start_time
            raw_distance = result.get("distance", 0.0)
            # DeepFace returns default threshold 0.68; for KYC ID verification, 0.58 is standard strict threshold
            threshold = ARCFACE_THRESHOLD if ARCFACE_THRESHOLD is not None else result.get("threshold", 0.68)
            is_verified = (raw_distance <= threshold)

            # Determine actual outcome label
            actual_label = "same" if is_verified else "different"

            # Check if DeepFace output matches expected label
            matches_expected = (actual_label.lower() == expected_label.lower())
            
            if matches_expected:
                passed_expectation += 1
                status_str = "PASS ✓ (Matches Expectation)"
            else:
                failed_expectation += 1
                status_str = "FAIL ✗ (Differs from Expectation)"

            total_tested += 1

            # Print formatted results
            print(f"    Verified Boolean : {is_verified} (Actual: {actual_label.upper()})")
            print(f"    Raw Distance     : {raw_distance:.4f}")
            print(f"    Threshold Used   : {threshold:.4f}")
            print(f"    Processing Time  : {elapsed:.2f} seconds")
            print(f"    Outcome          : {status_str}")

        except Exception as e:
            print(f"    [ERROR] Verification failed for this pair: {e}")
            import traceback
            traceback.print_exc()

        print("-" * 70)

    # Summary Report
    print()
    print("=" * 70)
    print("                  VERIFICATION TEST SUMMARY")
    print("=" * 70)
    print(f"Total Configured Pairs : {len(TEST_PAIRS)}")
    print(f"Total Evaluated        : {total_tested}")
    print(f"Skipped (Missing Files): {skipped_count}")
    print(f"Passed Expectations    : {passed_expectation} / {total_tested}" if total_tested > 0 else "Passed Expectations    : 0")
    print(f"Failed Expectations    : {failed_expectation} / {total_tested}" if total_tested > 0 else "Failed Expectations    : 0")
    print("=" * 70)

if __name__ == "__main__":
    run_verification()
