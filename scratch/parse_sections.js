const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/figma_metadata.json', 'utf8'));

const topFrame = data.pages[0].children.find(c => c.name === 'Slide 16:9 - 1') || data.pages[0].children[0];

console.log('Top Frame:', topFrame.name, topFrame.size);

function printTopChildren(node, depth = 0) {
  if (!node.children) return;
  node.children.forEach(c => {
    let desc = `${'  '.repeat(depth)}- [${c.type}] "${c.name}" (id: ${c.id})`;
    if (c.size) desc += ` (${Math.round(c.size.width)}x${Math.round(c.size.height)})`;
    console.log(desc);
    if (depth < 2 && c.children) {
      printTopChildren(c, depth + 1);
    }
  });
}

printTopChildren(topFrame, 0);
