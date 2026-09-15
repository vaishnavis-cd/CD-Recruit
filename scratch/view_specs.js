const fs = require('fs');

const text = fs.readFileSync('scratch/figma_specs.txt', 'utf8');

const lines = text.split('\n');

console.log('Total lines:', lines.length);

// Search for key sections
const keywords = ['Nav bar', 'Heading 1', 'Button', '5 Core Modules', 'Frame 8', 'Say-Do', 'Footer'];

keywords.forEach(kw => {
  console.log(`\n================ KEYWORD: "${kw}" ================`);
  const matching = lines.filter(l => l.toLowerCase().includes(kw.toLowerCase()));
  console.log(matching.slice(0, 15).join('\n'));
});
