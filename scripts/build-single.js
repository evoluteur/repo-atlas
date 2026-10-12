// Bundle index.html + src/* into one self-contained page.
//   node scripts/build-single.js            -> dist/repo-atlas.html   (full document)
//   node scripts/build-single.js --fragment -> dist/repo-atlas.fragment.html (body only, for hosts that add their own <head>)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// Inline the local stylesheet and scripts; CDN scripts (D3) and font links stay as they are.
const inlined = [];
html = html
  .replace(/<link rel="stylesheet" href="(src\/[^"]+\.css)" \/>/, (_, f) => (inlined.push(f), `<style>\n${read(f)}\n</style>`))
  .replace(/<script src="(src\/[^"]+\.js)"><\/script>/g, (_, f) => (inlined.push(f), `<script>\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`));
if (!inlined.some((f) => f.endsWith('.css')) || !inlined.some((f) => f.endsWith('.js'))) {
  throw new Error('build-single: did not find the src/ stylesheet and scripts in index.html');
}
if (/(?:href|src)="(?:src|data)\//.test(html)) throw new Error('build-single: a local file is still referenced');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
if (process.argv.includes('--fragment')) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const links = (html.match(/<link [^>]*>/g) || []).join('\n');
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const frag = `${title}\n${links}\n${style}\n${body}`;
  fs.writeFileSync(path.join(root, 'dist/repo-atlas.fragment.html'), frag);
  console.log('dist/repo-atlas.fragment.html', frag.length);
} else {
  fs.writeFileSync(path.join(root, 'dist/repo-atlas.html'), html);
  console.log('dist/repo-atlas.html', html.length);
}
