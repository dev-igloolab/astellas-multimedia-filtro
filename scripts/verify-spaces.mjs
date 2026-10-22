import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deletePhoto, readPhoto, savePhoto } from '../src/lib/photo-store.mjs';

const bytes = await readFile(
  new URL('../public/assets/iconos/calor-termometro.webp', import.meta.url),
);
let id;
try {
  id = await savePhoto(bytes);
  const stored = await readPhoto(id);
  assert.deepEqual(Buffer.from(stored.bytes), bytes);
  console.log('Spaces: subida y lectura verificadas.');
} finally {
  if (id) {
    await deletePhoto(id);
    console.log('Spaces: objeto de prueba eliminado.');
  }
}
