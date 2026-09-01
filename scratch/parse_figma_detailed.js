const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/figma_metadata.json', 'utf8'));

let out = `# Figma Metadata Analysis for PROCTORA

- **File Name**: ${data.file_name}
- **Last Modified**: ${data.last_modified}

`;

function extractSections(nodes) {
  const sections = [];
  
  function walk(node, path = []) {
    const currentPath = [...path, node.name];
    
    if (node.characters) {
      sections.push({
        id: node.id,
        name: node.name,
        type: node.type,
        text: node.characters,
        path: currentPath.join(' > '),
        size: node.size,
        fills: node.fills,
        style: node.style
      });
    }
    
    if (node.children) {
      node.children.forEach(c => walk(c, currentPath));
    }
  }

  nodes.forEach(n => walk(n));
  return sections;
}

const allText = extractSections(data.pages[0].children);

out += `## Extracted Text Elements & Components (${allText.length} text items)\n\n`;

allText.forEach(item => {
  out += `### [${item.id}] "${item.text.replace(/\n/g, ' ')}"\n`;
  out += `- **Path**: ${item.path}\n`;
  if (item.size) out += `- **Size**: ${Math.round(item.size.width)}x${Math.round(item.size.height)}\n`;
  if (item.style) {
    out += `- **Font**: ${item.style.fontFamily || 'default'} ${item.style.fontWeight || ''} (${item.style.fontSize}px)\n`;
  }
  out += `\n`;
});

fs.writeFileSync('scratch/figma_summary.md', out, 'utf8');
console.log('Saved figma_summary.md with', allText.length, 'extracted text items.');
