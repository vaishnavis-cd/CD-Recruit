const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/figma_metadata.json', 'utf8'));
const topFrame = data.pages[0].children.find(c => c.name === 'Slide 16:9 - 1') || data.pages[0].children[0];

function formatColor(c) {
  if (!c) return 'none';
  if (typeof c === 'string') return c;
  if (c.r !== undefined) {
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);
    const a = c.a !== undefined ? c.a : 1;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return JSON.stringify(c);
}

let lines = ['=== FULL FIGMA SPEC TREE ==='];

function inspectNode(node, depth = 0) {
  const indent = '  '.repeat(depth);
  let info = `${indent}• [${node.type}] "${node.name}" (id: ${node.id})`;
  
  if (node.size) {
    info += ` size: ${Math.round(node.size.width)}x${Math.round(node.size.height)}`;
  }
  if (node.characters) {
    info += ` text: "${node.characters.replace(/\n/g, '\\n')}"`;
  }
  if (node.style) {
    info += ` font: ${node.style.fontFamily} ${node.style.fontWeight} ${node.style.fontSize}px line-height: ${node.style.lineHeightPx ? Math.round(node.style.lineHeightPx) : 'auto'}px`;
  }
  if (node.fills && node.fills.length > 0) {
    const f = node.fills[0];
    if (f.type === 'SOLID') {
      info += ` bg: ${formatColor(f.color)}`;
    } else if (f.type === 'GRADIENT_LINEAR') {
      info += ` bg: LINEAR_GRADIENT`;
    } else if (f.type === 'IMAGE') {
      info += ` bg: IMAGE`;
    }
  }

  lines.push(info);

  if (node.children) {
    node.children.forEach(child => inspectNode(child, depth + 1));
  }
}

inspectNode(topFrame, 0);

fs.writeFileSync('scratch/figma_specs.txt', lines.join('\n'), 'utf8');
console.log('Successfully wrote clean UTF8 scratch/figma_specs.txt with', lines.length, 'lines.');
