// Tiny static + API-proxy server for end-to-end testing of the built dist.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT = 5173;
const BACKEND = { host: '127.0.0.1', port: 8787 };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function proxy(req, res) {
  const headers = { ...req.headers, host: `${BACKEND.host}:${BACKEND.port}` };
  delete headers['content-length']; // let node recompute
  const opts = { host: BACKEND.host, port: BACKEND.port, path: req.url, method: req.method, headers };
  const up = http.request(opts, (down) => {
    res.writeHead(down.statusCode || 200, down.headers);
    down.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end('proxy error: ' + e.message); });
  // collect body then send so GET (no body) is handled cleanly
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => { up.end(Buffer.concat(chunks)); });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url === '/api') return proxy(req, res);
  let urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' || urlPath === '' ? 'index.html' : urlPath);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      const hasExt = path.extname(urlPath).length > 0;
      if (hasExt) { res.writeHead(404); res.end('not found'); return; }
      filePath = path.join(ROOT, 'index.html'); // SPA fallback
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`static+proxy on http://127.0.0.1:${PORT}`));
