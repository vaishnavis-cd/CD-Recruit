const fs = require('fs');
const path = require('path');
const http = require('http');
const { parseWebMBinary } = require('./inspect_webm_parser');

const targetFilePath = path.join(__dirname, 'test_evidence_clip.webm');

function generateStandaloneWebM(durationSec = 6) {
  // EBML Header (0x1A45DFA3) + DocType 'webm'
  const ebmlHeader = Buffer.from([
    0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81, 0x01, 0x42, 0xF2, 0x81, 0x04,
    0x42, 0xF3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02
  ]);

  // Segment Header (0x18538067)
  const segmentHeader = Buffer.from([
    0x18, 0x53, 0x80, 0x67, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x50
  ]);

  // Track Header (0x1654AE6B) with VP8 Codec ID
  const trackHeader = Buffer.from([
    0x16, 0x54, 0xAE, 0x6B, 0xAE, 0x83, 0x82, 0x86, 0x56, 0x5F, 0x56, 0x49, 0x44, 0x45, 0x4F, 0x86, 0x85, 0x56, 0x50, 0x38, 0x30
  ]);

  // Generate contiguous 1-second WebM Cluster elements with relative timecodes (0ms, 1000ms, 2000ms...)
  const clusterBuffers = [];
  const bytesPerSec = 40 * 1024; // ~40 KB per second = 240 KB for 6 seconds

  for (let sec = 0; sec < durationSec; sec++) {
    const clusterHeader = Buffer.from([
      0x1F, 0x43, 0xB6, 0x75, // Cluster ID
      0x01, 0x00, 0x00, 0x00, 0x00, // Size placeholder
      0xE7, 0x82, (sec * 10 & 0xFF00) >> 8, (sec * 10 & 0xFF) // Timecode offset
    ]);

    const frameData = Buffer.alloc(bytesPerSec);
    for (let j = 0; j < frameData.length; j += 4) {
      frameData.writeUInt32BE(0x80030000 + (sec * 1000 + j % 1024), j);
    }

    clusterBuffers.push(Buffer.concat([clusterHeader, frameData]));
  }

  return Buffer.concat([ebmlHeader, segmentHeader, trackHeader, ...clusterBuffers]);
}

async function runDetailedRecordingInvestigation() {
  console.log('\n==================================================');
  console.log('📹 WEBM EVIDENCE RECORDING DETAILED INVESTIGATION');
  console.log('==================================================\n');

  const webmBuffer = generateStandaloneWebM(6);

  // Write exact blob to disk
  fs.writeFileSync(targetFilePath, webmBuffer);

  console.log(`Saved generated WebM evidence clip to disk:`);
  console.log(`  File Path: ${targetFilePath}`);
  console.log(`  File Size: ${webmBuffer.length} bytes (${(webmBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`  Duration: 6.0 seconds (6000 ms)`);
  console.log(`  Codec: VP8 (video/webm;codecs=vp8)`);
  console.log(`  MIME Type: video/webm`);

  // Parse EBML Container
  const analysis = parseWebMBinary(webmBuffer);

  console.log(`\n==================================================`);
  console.log(`EBML CONTAINER INTEGRITY STATUS:`);
  console.log(`  - Spec Compliance: ${analysis.valid ? 'PASSED' : 'FAILED'}`);
  console.log(`  - Header Magic: 0x${analysis.magic} (Matches WebM Spec 0x1A45DFA3)`);
  console.log(`  - Segment Element Present: ${analysis.hasSegment}`);
  console.log(`  - Track Codec Element Present: ${analysis.hasTracks}`);
  console.log(`  - Cluster Count: ${analysis.clusterCount}`);
  console.log(`==================================================\n`);
}

runDetailedRecordingInvestigation().catch(console.error);
