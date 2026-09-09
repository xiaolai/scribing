// Local development server. Run after `npm run build`; no font/source downloads.
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..'),
  port = Number(process.env.PORT || 8765);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw Error('PORT must be an integer from0 through65535');
if (!fs.existsSync(path.join(root, 'dist/scribing.js'))) {
  console.error('Build the demo bundle first: npm run build');
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  let file;
  try {
    file = path.resolve(
      root,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
  } catch {
    return res.writeHead(400).end();
  }
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const stat = fs.statSync(file);
    if (!stat.isFile()) return res.writeHead(404).end();
    res.setHeader(
      'Content-Type',
      types[path.extname(file)] || 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});
server.on('error', (e) => {
  console.error(
    `Demo server failed: ${e.message}. Choose another port with PORT=8766 npm run serve-demo.`,
  );
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Scribing demo: http://127.0.0.1:${server.address().port}/demo/multilingual/`,
  ),
);
