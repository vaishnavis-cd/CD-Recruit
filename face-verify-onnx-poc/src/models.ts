import * as fs from 'fs';
import * as path from 'path';
import type * as ort from 'onnxruntime-node';

// Load ONNX Runtime module (prefer native onnxruntime-node, fall back to onnxruntime-web WASM backend)
export let ortModule: typeof import('onnxruntime-node');
try {
  if (process.platform === 'win32') {
    const binDir = path.join(__dirname, '..', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'win32', 'x64');
    if (fs.existsSync(binDir)) {
      process.env.PATH = `${binDir};${process.env.PATH}`;
    }
  }
  ortModule = require('onnxruntime-node');
} catch (e) {
  ortModule = require('onnxruntime-web');
}

const MODELS_DIR = path.join(__dirname, '..', 'models');

const RETINAFACE_MODEL_PATHS = [
  path.join(MODELS_DIR, 'retinaface.onnx'),
  path.join(MODELS_DIR, 'det_10g.onnx'),
  path.join(MODELS_DIR, 'scrfd_2.5g_bnkps.onnx'),
];

const ARCFACE_MODEL_PATHS = [
  path.join(MODELS_DIR, 'arcface.onnx'),
  path.join(MODELS_DIR, 'w600k_r50.onnx'),
  path.join(MODELS_DIR, 'glint360k_r100.onnx'),
];

export interface LoadedModels {
  retinaface: ort.InferenceSession;
  arcface: ort.InferenceSession;
}

/**
 * Loads both RetinaFace and ArcFace ONNX models once at application startup.
 */
export async function loadModels(): Promise<LoadedModels> {
  const retinaPath = RETINAFACE_MODEL_PATHS.find((p) => fs.existsSync(p));
  const arcPath = ARCFACE_MODEL_PATHS.find((p) => fs.existsSync(p));

  if (!retinaPath || !arcPath) {
    const errorMsg = [
      '\n[ERROR] Model file(s) missing from models/ directory!',
      `RetinaFace path status: ${retinaPath ? 'FOUND' : 'MISSING'}`,
      `ArcFace path status   : ${arcPath ? 'FOUND' : 'MISSING'}`,
      '\nPlease download the required ONNX models into face-verify-onnx-poc/models/:',
      '  1. RetinaFace Model -> models/retinaface.onnx',
      '  2. ArcFace Model    -> models/arcface.onnx\n',
    ].join('\n');
    throw new Error(errorMsg);
  }

  const retinaface = await ortModule.InferenceSession.create(retinaPath);
  const arcface = await ortModule.InferenceSession.create(arcPath);

  return { retinaface, arcface };
}
