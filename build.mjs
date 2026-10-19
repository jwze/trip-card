import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, 'src');
const output = path.join(root, 'build');

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), `${name}/`));
    } else {
      files.push(name);
    }
  }
  return files.sort();
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

const files = await listFiles(source);
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file).update(await readFile(path.join(source, file)));
}
const version = hash.digest('hex').slice(0, 12);
const worker = await readFile(path.join(source, 'service-worker.js'), 'utf8');
await writeFile(path.join(output, 'service-worker.js'), worker
  .replace('__VERSION__', version)
  .replace('/* __ASSETS__ */ []', JSON.stringify(files.filter(file => file !== 'service-worker.js'))));
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built trip-card (${version}) → build/`);
