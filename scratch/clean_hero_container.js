const fs = require('fs')
const path = require('path')

const svgPath = path.join(__dirname, '../frontend/candidate-web/public/hero_container.svg')
let content = fs.readFileSync(svgPath, 'utf8')

// Split by <path
const lines = content.split(/\n/)

console.log('Total lines in SVG:', lines.length)

// Filter out path line 4 (which draws "Paste your assessment invite link...")
// Path 4 starts with M186.844
const cleanedLines = lines.filter((line) => {
  if (line.includes('d="M186.844')) {
    console.log('Found and removed path 4!')
    return false
  }
  return true
})

fs.writeFileSync(svgPath, cleanedLines.join('\n'), 'utf8')
console.log('Cleaned SVG saved successfully!')
