const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { scanAvatars } = require('./generate-manifest.cjs');
const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8'
};

// Scan avatars on server start
scanAvatars();

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);

  if (!/^(index\.html|character-preview\.html|invite\.html|js\/[\w./-]+|css\/[\w./-]+|assets\/[\w./-]+|vendor\/[\w.-]+)$/.test(relative) || relative.split('/').includes('..')) {
    res.writeHead(404).end();
    return;
  }

  // Auto-scan avatar folder on manifest or avatar API request
  if (relative === 'assets/avatars/manifest.json') {
    scanAvatars();
  }

  fs.readFile(path.join(root, relative), (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(relative)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(8767, '127.0.0.1', () => console.log('http://127.0.0.1:8767'));
}

module.exports = server;
