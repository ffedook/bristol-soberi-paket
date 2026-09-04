import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir) {
  let a = [];
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const p = dir + '/' + f.name;
    if (f.isDirectory()) a.push(...(await walk(p)));
    else if (f.name !== 'sw.js') a.push(p);
  }
  return a;
}
const files = await walk('dist');
const hash = createHash('sha256');
for (const p of files) hash.update(await readFile(p));
const cache = 'bristol-' + hash.digest('hex').slice(0, 12);
const urls = ['./', ...files.map((p) => './' + p.slice(5))];
await writeFile(
  'dist/sw.js',
  `const CACHE=${JSON.stringify(cache)},URLS=${JSON.stringify(urls)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('bristol-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).catch(()=>e.request.mode==='navigate'?caches.match('./'):Response.error())));});`,
);
console.log('Offline precache:', files.length, 'files,', cache);
