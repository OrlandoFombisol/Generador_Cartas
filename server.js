const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 4200;

const server = http.createServer((req, res) => {
  // Rutas por defecto (ignorar query string)
  const rawPath = req.url.split('?')[0];
  let filePath = rawPath === '/' ? 'index.html' : rawPath;
  filePath = path.join(__dirname, filePath);

  // Prevenir acceso fuera del directorio
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Acceso denegado');
    return;
  }

  // Tipos MIME comunes
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pdf': 'application/pdf'
  };

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Leer y servir el archivo
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 - Archivo no encontrado</h1><p>${req.url}</p>`);
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log('\n  ====================================================');
  console.log('   Generador de Cartas - Arenas Inmobiliaria');
  console.log('  ====================================================');
  console.log(`   Servidor activo en: ${url}`);
  console.log('   Presione Ctrl+C para detener.');
  console.log('  ====================================================\n');
  exec(`start ${url}`);
});
