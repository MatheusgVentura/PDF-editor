const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const ROOT = __dirname;
const PREFERRED_PORT = 8420;
const MAX_PORT_ATTEMPTS = 10;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf'
};

function getMimeType(ext) {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

function serveFile(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Arquivo nao encontrado');
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(path.extname(filePath)) });
    res.end(data);
  });
}

function handleRequest(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const resolved = path.normalize(path.join(ROOT, urlPath));
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 - Proibido');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Arquivo nao encontrado');
      return;
    }
    serveFile(req, res, resolved);
  });
}

function openBrowser(url) {
  let command;
  switch (process.platform) {
    case 'win32':
      command = `start "" "${url}"`;
      break;
    case 'darwin':
      command = `open "${url}"`;
      break;
    default:
      command = `xdg-open "${url}"`;
  }
  exec(command, (err) => {
    if (err) {
      console.log(`Nao foi possivel abrir o navegador automaticamente. Acesse: ${url}`);
    }
  });
}

function startServer(port, attemptsLeft) {
  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      startServer(port + 1, attemptsLeft - 1);
    } else {
      console.error(`Nao foi possivel iniciar o servidor: ${err.message}`);
      process.exitCode = 1;
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  Editor de PDF rodando em:');
    console.log(`  ${url}`);
    console.log('');
    console.log('  Pressione Ctrl+C para encerrar.');
    console.log('');
    openBrowser(url);
  });
}

startServer(PREFERRED_PORT, MAX_PORT_ATTEMPTS);
