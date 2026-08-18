# Standalone ONNX Runtime Face Verification POC (Node.js + TypeScript)

This is a completely isolated Node.js/TypeScript proof-of-concept for face verification using **ONNX Runtime** with **RetinaFace/SCRFD** (face detection & 5-point landmark localization) + **ArcFace** (512-dim embedding extraction).

---

## 📁 Directory Structure

```
face-verify-onnx-poc/
├── models/             # Folder for downloaded .onnx files (git-ignored)
│   └── .gitkeep
├── images/             # Folder for candidate test images (git-ignored)
│   └── .gitkeep
├── package.json        # Dependencies (onnxruntime-node, sharp, typescript)
├── tsconfig.json       # TypeScript configuration
├── verify_test.ts      # Core detection, alignment, embedding & verification logic
├── .gitignore          # Ignores large binaries and node_modules
└── README.md           # Setup, model links, alignment & preprocessing docs
```

---

## 🌐 Public ONNX Model Sources & Download Commands

The standard models come directly from InsightFace's official pre-converted ONNX model zoo.

### 1. RetinaFace / SCRFD (Detection + 5 Landmarks)
* **Model Name**: `det_10g.onnx` (SCRFD 10G Detection Model)
* **Source URL**: `https://huggingface.co/public-data/insightface-onnx/resolve/main/det_10g.onnx`
* **Download Command (PowerShell / Command Prompt)**:
  ```powershell
  curl.exe -L -o models/retinaface.onnx "https://huggingface.co/public-data/insightface-onnx/resolve/main/det_10g.onnx"
  ```

### 2. ArcFace (512-Dim Feature Extraction)
* **Model Name**: `w600k_r50.onnx` (ArcFace ResNet50 trained on WebFace600K)
* **Source URL**: `https://huggingface.co/public-data/insightface-onnx/resolve/main/w600k_r50.onnx`
* **Download Command (PowerShell / Command Prompt)**:
  ```powershell
  curl.exe -L -o models/arcface.onnx "https://huggingface.co/public-data/insightface-onnx/resolve/main/w600k_r50.onnx"
  ```

---

## 🚀 Install & Run Instructions

1. **Install Dependencies**:
   ```bash
   cd face-verify-onnx-poc
   npm install
   ```

2. **Download Models into `models/`**:
   Execute the `curl` commands listed above to place `retinaface.onnx` and `arcface.onnx` in `models/`.

3. **Copy Test Images into `images/`**:
   Copy your candidate verification images into `face-verify-onnx-poc/images/`:
   * `candidate_selfie.jpg`
   * `candidate_id.jpg`
   * `other_person_id.jpg`

4. **Run Verification Script**:
   ```bash
   npm test
   ```

---

## 📐 Face Alignment Template & Transformation Logic

ArcFace feature extraction models require faces to be aligned to a standardized 112x112 canonical facial template.

### Canonical ArcFace 112x112 Landmark Template:
| Landmark | Target X | Target Y |
| :--- | :--- | :--- |
| **Left Eye** | `38.2946` | `51.6963` |
| **Right Eye** | `73.5318` | `51.5014` |
| **Nose Tip** | `56.0252` | `71.7366` |
| **Left Mouth Corner** | `41.5493` | `92.3655` |
| **Right Mouth Corner** | `70.7299` | `92.2041` |

*Source: InsightFace / ArcFace reference implementation (Umeyama 5-point alignment target for 112x112 resolution).*

### Alignment Algorithm:
1. **Least-Squares Similarity Transform (Umeyama)**: We compute the optimal 2D similarity transform matrix $M = \begin{bmatrix} a & -b & t_x \\ b & a & t_y \end{bmatrix}$ that maps detected facial landmarks onto the canonical template.
2. **Inverse Transformation & Bilinear Sampling**: To warp the image onto a 112x112 canvas without needing C++ OpenCV bindings, we compute the inverse mapping $(x_{in}, y_{in}) = M^{-1}(x_{out}, y_{out})$ and perform bilinear pixel interpolation directly on raw RGB image buffers loaded via `sharp`.

---

## 🧪 ArcFace Tensor Preprocessing Specification

| Parameter | Specification | Explanation |
| :--- | :--- | :--- |
| **Input Shape** | `[1, 3, 112, 112]` | Single-batch, 3 channels (RGB), 112x112 height & width (NCHW format). |
| **Channel Order** | `RGB` | InsightFace ArcFace models expect standard RGB channel order. |
| **Pixel Range** | `[-1.0, 1.0]` | Normalized via `(pixel - 127.5) / 128.0`. |
| **Embedding Vector** | `Float32Array(512)` | Output is L2-normalized unit vector (512 float values). |

---

## 📏 Cosine Distance Formula

$$\text{Distance} = 1 - \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$

* Same-person pair: distance is low (typically $< 0.58$).
* Different-person pair: distance is high (typically $> 0.70$).
