const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/figma_metadata.json', 'utf8'));

console.log('File Name:', data.file_name);
console.log('Last Modified:', data.last_modified);
console.log('Pages count:', data.pages.length);

function walk(node, depth = 0) {
  const indent = '  '.repeat(depth);
  let info = `${indent}- [${node.type}] "${node.name}" (id: ${node.id})`;
  
  if (node.characters) {
    info += ` -> TEXT: "${node.characters.replace(/\n/g, ' ')}"`;
  }
  if (node.size) {
    info += ` (${Math.round(node.size.width || 0)}x${Math.round(node.size.height || 0)})`;
  }
  console.log(info);

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
}

data.pages.forEach((page) => {
  console.log(`\n================ PAGE: ${page.name} (${page.id}) ================`);
  page.children.forEach((child) => walk(child, 0));
});
