import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif' };

export function createStaticServer({ directory = path.join(project, 'src'), base = '/' } = {}) {
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (base !== '/' && pathname === base.slice(0, -1)) {
        response.writeHead(301, { Location: base }).end();
        return;
      }
      if (!pathname.startsWith(base)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const relative = pathname.slice(base.length) || 'index.html';
      const filename = path.resolve(directory, relative);
      const boundary = path.relative(directory, filename);
      if (boundary.startsWith('..') || path.isAbsolute(boundary)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const content = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || '/';
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('Base must start and end with /');
  const directory = path.join(project, process.argv.includes('--build') ? 'build' : 'src');
  const port = Number(process.env.PORT || 3001);
  createStaticServer({ directory, base }).listen(port, '127.0.0.1', () => {
    console.log(`trip-card → http://localhost:${port}${base}`);
  });
}
