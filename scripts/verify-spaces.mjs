import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { deletePhoto, readPhoto, savePhoto } from '../src/lib/photo-store.mjs';

const bytes = await readFile(
  new URL('../test/fixtures/photo.jpg', import.meta.url),
);
let id;
try {
  id = await savePhoto(bytes);
  const stored = await readPhoto(id);
  assert.deepEqual(Buffer.from(stored.bytes), bytes);
  const { SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET } =
    process.env;
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: `https://${SPACES_REGION}.digitaloceanspaces.com`,
    credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
  });
  const expectedKey = `astellas-multimedia-filtro/photos/${id}.jpg`;
  const listing = await client.send(
    new ListObjectsV2Command({ Bucket: SPACES_BUCKET, Prefix: expectedKey }),
  );
  assert.ok(listing.Contents?.some((object) => object.Key === expectedKey));
  console.log('Spaces: subida y lectura verificadas.');
} finally {
  if (id) {
    await deletePhoto(id);
    console.log('Spaces: objeto de prueba eliminado.');
  }
}
