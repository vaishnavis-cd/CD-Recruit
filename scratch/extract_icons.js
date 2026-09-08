const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../frontend/candidate-web/public/problem_section.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

const regex = /id="(image\d+_61_422)"[^>]*xlink:href="data:image\/png;base64,([^"]+)"/g;
let match;
const map = {
  'image0_61_422': 'icon-takehomes-3d.png',
  'image1_61_422': 'icon-liveinterviews-3d.png',
  'image2_61_422': 'icon-resumescreens-3d.png'
};

while ((match = regex.exec(svg)) !== null) {
  const id = match[1];
  const b64 = match[2];
  const filename = map[id];
  if (filename) {
    const outPath = path.join(__dirname, '../frontend/candidate-web/src/assets', filename);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`Successfully extracted ${filename} (${b64.length} base64 chars)`);
  }
}
