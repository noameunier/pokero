import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function securityHeaders(extra = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'SAMEORIGIN',
    ...extra,
  };
}

function sendFile(response, filePath, statusCode = 200) {
  const extension = extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${join(root, 'assets')}`) || filePath.endsWith('sw.js');
  response.writeHead(
    statusCode,
    securityHeaders({
      'content-type': MIME_TYPES[extension] ?? 'application/octet-stream',
      'cache-control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    }),
  );
  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, securityHeaders({ allow: 'GET, HEAD' }));
    response.end('Method Not Allowed');
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\0')) {
    response.writeHead(400, securityHeaders());
    response.end('Bad Request');
    return;
  }

  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, normalized);

  if (!filePath.startsWith(root)) {
    response.writeHead(403, securityHeaders());
    response.end('Forbidden');
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(response, filePath);
    return;
  }

  // Repli SPA : toute route inconnue sert l'application, sauf les chemins techniques.
  if (pathname.startsWith('/api') || pathname.startsWith('/socket.io')) {
    response.writeHead(404, securityHeaders({ 'content-type': 'application/json; charset=utf-8' }));
    response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } }));
    return;
  }

  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) {
    response.writeHead(503, securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
    response.end("Application non construite. Lancez 'pnpm build'.");
    return;
  }
  sendFile(response, indexPath);
});

server.listen(port, host, () => {
  console.log(`Pokero web écoute sur http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
