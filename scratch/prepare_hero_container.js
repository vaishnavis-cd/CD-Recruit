const fs = require('fs')
const path = require('path')

const origPath = 'C:/Users/KarthikSrinivasanNar/Downloads/Container (4).svg'
const targetPath = path.join(__dirname, '../frontend/candidate-web/public/hero_container.svg')

let content = fs.readFileSync(origPath, 'utf8')
fs.writeFileSync(targetPath, content, 'utf8')
console.log('Restored original hero_container.svg!')
