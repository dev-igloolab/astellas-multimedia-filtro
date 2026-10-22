import assert from 'node:assert/strict';
import { test } from 'node:test';

function mockImages(t) {
  const originalImage = globalThis.Image;
  let decodes = 0;
  globalThis.Image = class {
    async decode() {
      decodes++;
    }
  };
  t.after(() => {
    if (originalImage) globalThis.Image = originalImage;
    else delete globalThis.Image;
  });
  return () => decodes;
}

test('La precarga concurrente y la descarga reutilizan la misma imagen decodificada', async (t) => {
  const decodes = mockImages(t);
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(new Blob(['image'])),
  );
  const { preloadImages, warmAsset, assetUrl } =
    await import('../src/lib/assets.js?reuse');
  await Promise.all([...preloadImages(), ...preloadImages()]);
  const count = fetchMock.mock.callCount();
  assert.ok(count > 0);
  assert.equal(decodes(), count);
  const [first, second] = await Promise.all([
    warmAsset('logo'),
    warmAsset('logo'),
  ]);
  assert.equal(first, second);
  assert.equal(fetchMock.mock.callCount(), count);
  assert.equal(decodes(), count);
  assert.equal(assetUrl('logo'), first.src);
});

test('Un recurso fallido se puede precargar de nuevo', async (t) => {
  const decodes = mockImages(t);
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return new Response('image', { status: attempts === 1 ? 503 : 200 });
  });
  const { warmAsset } = await import('../src/lib/assets.js?retry');
  await assert.rejects(warmAsset('logo'), /No se pudo descargar/);
  await warmAsset('logo');
  assert.equal(attempts, 2);
  assert.equal(decodes(), 1);
});
