import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deletePhoto } from '../src/lib/photo-store.mjs';

const origin = process.argv[2] || 'http://localhost:4322';
const bytes = await readFile(
  new URL('../public/assets/iconos/calor-termometro.webp', import.meta.url),
);
let id;
try {
  const upload = await fetch(new URL('/api/fotos/', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'image/webp' },
    body: bytes,
  });
  if (upload.status !== 201)
    throw new Error(`Subida fallida: ${upload.status} ${await upload.text()}`);
  const { url } = await upload.json();
  id = url.match(/^\/foto\/([0-9a-f-]+)\/$/)?.[1];
  assert.ok(id);

  const page = await fetch(new URL(url, origin));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /DESCARGAR FOTO/);

  const image = await fetch(new URL(`/api/fotos/${id}`, origin));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  await deletePhoto(id);
  const removedUrl = url;
  id = null;
  assert.equal((await fetch(new URL(removedUrl, origin))).status, 404);
  console.log('HTTP: subida, página del QR y descarga verificadas.');
} finally {
  if (id) await deletePhoto(id);
}
