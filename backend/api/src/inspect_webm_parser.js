const fs = require('fs');
const path = require('path');

function parseWebMBinary(buffer) {
  console.log(`Analyzing WebM Buffer (${buffer.length} bytes / ${(buffer.length / 1024).toFixed(1)} KB)...`);
  
  if (buffer.length < 4) {
    return { valid: false, error: 'Buffer too small (< 4 bytes)' };
  }

  const magic = buffer.slice(0, 4).toString('hex').toUpperCase();
  console.log(`Header Magic (Offset 0): 0x${magic}`);

  if (magic !== '1A45DFA3') {
    return { valid: false, error: `Invalid EBML Header magic: 0x${magic} (Expected 0x1A45DFA3)` };
  }

  // Scan for EBML elements
  let hasSegment = false;
  let hasTracks = false;
  let hasCluster = false;
  let clusterCount = 0;
  let firstClusterTimecode = null;

  for (let i = 0; i < buffer.length - 4; i++) {
    const hex4 = buffer.slice(i, i + 4).toString('hex').toUpperCase();
    if (hex4 === '18538067') hasSegment = true;
    if (hex4 === '1654AE6B') hasTracks = true;
    if (hex4 === '1F43B675') {
      hasCluster = true;
      clusterCount++;
      if (firstClusterTimecode === null && i + 8 < buffer.length) {
        // Read potential timecode offset after cluster ID
        firstClusterTimecode = buffer.readUInt16BE(i + 5);
      }
    }
  }

  console.log(`EBML Analysis Summary:`);
  console.log(`  - Has Segment Element (0x18538067): ${hasSegment}`);
  console.log(`  - Has Tracks Element (0x1654AE6B): ${hasTracks}`);
  console.log(`  - Has Cluster Element (0x1F43B675): ${hasCluster}`);
  console.log(`  - Total Clusters Found: ${clusterCount}`);
  console.log(`  - First Cluster Relative Timecode: ${firstClusterTimecode !== null ? firstClusterTimecode + ' ms' : 'N/A'}`);

  return {
    valid: hasSegment && hasTracks && hasCluster,
    magic,
    hasSegment,
    hasTracks,
    hasCluster,
    clusterCount,
    firstClusterTimecode
  };
}

module.exports = { parseWebMBinary };

if (require.main === module) {
  const sample = Buffer.from([
    0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81, 0x01, 0x42, 0xF2, 0x81, 0x04,
    0x42, 0xF3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02,
    0x18, 0x53, 0x80, 0x67, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x50, 0x16, 0x54, 0xAE, 0x6B, 0xAE, 0x83,
    0x1F, 0x43, 0xB6, 0x75, 0x01, 0xE7, 0x81, 0x00
  ]);
  parseWebMBinary(sample);
}
