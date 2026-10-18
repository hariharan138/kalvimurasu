const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'nmms-pwa');
const output = path.join(root, 'www');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of fs.readdirSync(source)) {
  if (file === 'assets' || /\.(html|css|js|svg|webmanifest)$/.test(file)) {
    if (file !== 'sw.js') fs.cpSync(path.join(source, file), path.join(output, file), { recursive: true });
  }
}
// Native assets are bundled; service workers would keep obsolete app code after upgrades.
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8')
  .replace(/<script>if\('serviceWorker'[^<]+<\/script>/, '')
  .replace('<script src="questions.js">', '<script>window.NMMS_NATIVE = true;</script><script src="questions.js">');
fs.writeFileSync(path.join(output, 'index.html'), html);
console.log('Mobile assets bundled in www/');
