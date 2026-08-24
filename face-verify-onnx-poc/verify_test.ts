import * as fs from 'fs';
import * as path from 'path';
import { loadModels, verifyFaces, ONNX_ARCFACE_THRESHOLD } from './src/index';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const IMAGES_DIR = path.join(__dirname, 'images');

const MODEL_NAME = 'ArcFace';
const DETECTOR_BACKEND = 'RetinaFace';
const DISTANCE_METRIC = 'cosine';

// Test pairs matching the original Python DeepFace POC
const TEST_PAIRS = [
  { img1: 'candidate_selfie.jpg', img2: 'candidate_id.jpg', expected: 'same' },
  { img1: 'candidate_selfie.jpg', img2: 'other_person_id.jpg', expected: 'different' },
];

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runPocTest() {
  console.log('='.repeat(70));
  console.log('   DEEPFACE + ARCFACE STANDALONE PROOF-OF-CONCEPT TEST');
  console.log('='.repeat(70));
  console.log(`Model Name       : ${MODEL_NAME}`);
  console.log(`Detector Backend : ${DETECTOR_BACKEND}`);
  console.log(`Distance Metric  : ${DISTANCE_METRIC}`);
  console.log(`Total Configured : ${TEST_PAIRS.length} pair(s)`);
  console.log('-'.repeat(70));
  console.log();

  let models;
  try {
    models = await loadModels();
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  let totalTested = 0;
  let passedExpectation = 0;
  let failedExpectation = 0;
  let skippedCount = 0;

  for (let i = 0; i < TEST_PAIRS.length; i++) {
    const pair = TEST_PAIRS[i];
    const path1 = path.join(IMAGES_DIR, pair.img1);
    const path2 = path.join(IMAGES_DIR, pair.img2);

    console.log(`[${i + 1}/${TEST_PAIRS.length}] Testing Pair: ${pair.img1} vs ${pair.img2}`);
    console.log(`    Expected Match : ${pair.expected.toUpperCase()}`);

    if (!fs.existsSync(path1)) {
      console.log(`    [SKIP] Image 1 not found: ${path1}`);
      skippedCount++;
      console.log('-'.repeat(70));
      continue;
    }
    if (!fs.existsSync(path2)) {
      console.log(`    [SKIP] Image 2 not found: ${path2}`);
      skippedCount++;
      console.log('-'.repeat(70));
      continue;
    }

    const tStart = Date.now();
    const result = await verifyFaces(path1, path2, models);
    const elapsedSeconds = (Date.now() - tStart) / 1000.0;

    if (result.distance !== null) {
      const isVerified = result.matched;
      const actualLabel = isVerified ? 'same' : 'different';
      const matchesExpected = actualLabel.toLowerCase() === pair.expected.toLowerCase();

      let statusStr = '';
      if (matchesExpected) {
        passedExpectation++;
        statusStr = 'PASS ✓ (Matches Expectation)';
      } else {
        failedExpectation++;
        statusStr = 'FAIL ✗ (Differs from Expectation)';
      }

      totalTested++;

      console.log(`    Verified Boolean : ${isVerified ? 'True' : 'False'} (Actual: ${actualLabel.toUpperCase()})`);
      console.log(`    Raw Distance     : ${result.distance.toFixed(4)}`);
      console.log(`    Threshold Used   : ${result.threshold.toFixed(4)}`);
      console.log(`    Processing Time  : ${elapsedSeconds.toFixed(2)} seconds`);
      console.log(`    Outcome          : ${statusStr}`);
    } else {
      failedExpectation++;
      totalTested++;
      console.log(`    Verified Boolean : False (Error)`);
      console.log(`    Error            : ${result.error}`);
      console.log(`    Outcome          : FAIL ✗ (Differs from Expectation)`);
    }

    console.log('-'.repeat(70));
  }

  // Summary Report matching Python format
  console.log();
  console.log('='.repeat(70));
  console.log('                  VERIFICATION TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Configured Pairs : ${TEST_PAIRS.length}`);
  console.log(`Total Evaluated        : ${totalTested}`);
  console.log(`Skipped (Missing Files): ${skippedCount}`);
  console.log(`Passed Expectations    : ${passedExpectation} / ${totalTested}`);
  console.log(`Failed Expectations    : ${failedExpectation} / ${totalTested}`);
  console.log('='.repeat(70));
}

if (require.main === module) {
  runPocTest().catch(console.error);
}
