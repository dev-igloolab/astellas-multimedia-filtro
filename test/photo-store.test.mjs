import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  getPhotoInfo,
  isJpeg,
  isWebP,
  readPhoto,
  removeExpiredPhotos,
  savePhoto,
} from '../src/lib/photo-store.mjs';

process.env.SPACES_REGION = 'sfo3';
process.env.SPACES_BUCKET = 'test-private-space';
process.env.SPACES_KEY = 'test-key';
process.env.SPACES_SECRET = 'test-secret';

const s3 = mockClient(S3Client);
const jpeg = await readFile(new URL('./fixtures/photo.jpg', import.meta.url));
function webp() {
  const bytes = Buffer.alloc(20);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(12, 4);
  bytes.write('WEBP', 8);
  bytes.write('VP8 ', 12);
  return bytes;
}

test('guarda la foto privada y la recupera con un identificador opaco', async () => {
  s3.reset();
  const bytes = jpeg;
  s3.on(PutObjectCommand).resolves({});
  s3.on(HeadObjectCommand).resolves({ LastModified: new Date() });
  s3.on(GetObjectCommand).resolves({
    Body: { transformToByteArray: async () => bytes },
  });
  const id = await savePhoto(bytes);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f-]{36}$/);
  const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
  assert.equal(put.Bucket, 'test-private-space');
  assert.equal(put.Key, `astellas-multimedia-filtro/photos/${id}.jpg`);
  assert.equal(put.ContentType, 'image/jpeg');
  assert.equal(put.ACL, undefined);
  const photo = await readPhoto(id);
  assert.deepEqual(Buffer.from(photo.bytes), bytes);
  assert.equal(photo.contentType, 'image/jpeg');
  assert.equal(isJpeg(bytes), true);
  assert.equal(isJpeg(webp()), false);
  assert.equal(isWebP(Buffer.from('not an image')), false);
});

test('mantiene accesibles las fotos WebP de los QR anteriores', async () => {
  s3.reset();
  const id = `12345678-${crypto.randomUUID()}`;
  const bytes = webp();
  s3.on(HeadObjectCommand, {
    Key: `astellas-multimedia-filtro/photos/${id}.jpg`,
  }).rejects({ name: 'NotFound' });
  s3.on(HeadObjectCommand, {
    Key: `astellas-multimedia-filtro/photos/${id}.webp`,
  }).resolves({ LastModified: new Date() });
  s3.on(GetObjectCommand).resolves({
    Body: { transformToByteArray: async () => bytes },
  });
  const photo = await readPhoto(id);
  assert.deepEqual(Buffer.from(photo.bytes), bytes);
  assert.equal(photo.contentType, 'image/webp');
  assert.equal(photo.extension, 'webp');
  assert.equal(
    s3.commandCalls(GetObjectCommand)[0].args[0].input.Key,
    `astellas-multimedia-filtro/photos/${id}.webp`,
  );
});

test('deja de servir y elimina fotos al cumplirse 48 horas', async () => {
  s3.reset();
  s3.on(HeadObjectCommand).resolves({
    LastModified: new Date(Date.now() - 49 * 60 * 60 * 1000),
  });
  s3.on(DeleteObjectCommand).resolves({});
  const id = `12345678-${crypto.randomUUID()}`;
  assert.equal(await getPhotoInfo(id), null);
  assert.equal(s3.commandCalls(DeleteObjectCommand).length, 1);
  assert.equal(await getPhotoInfo('../otro'), null);
  assert.equal(s3.commandCalls(HeadObjectCommand).length, 1);
});

test('la limpieza recorre y borra únicamente objetos vencidos', async () => {
  s3.reset();
  s3.on(ListObjectsV2Command).resolves({
    Contents: [
      {
        Key: 'astellas-multimedia-filtro/photos/old.webp',
        LastModified: new Date(Date.now() - 49 * 60 * 60 * 1000),
      },
      {
        Key: 'astellas-multimedia-filtro/photos/new.webp',
        LastModified: new Date(),
      },
    ],
  });
  s3.on(DeleteObjectCommand).resolves({});
  await removeExpiredPhotos();
  assert.equal(s3.commandCalls(DeleteObjectCommand).length, 1);
  assert.equal(
    s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key,
    'astellas-multimedia-filtro/photos/old.webp',
  );
});
