import assert from 'node:assert/strict';
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
  const bytes = webp();
  s3.on(PutObjectCommand).resolves({});
  s3.on(HeadObjectCommand).resolves({ LastModified: new Date() });
  s3.on(GetObjectCommand).resolves({
    Body: { transformToByteArray: async () => bytes },
  });
  const id = await savePhoto(bytes);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f-]{36}$/);
  const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
  assert.equal(put.Bucket, 'test-private-space');
  assert.equal(put.Key, `photos/${id}.webp`);
  assert.equal(put.ACL, undefined);
  assert.deepEqual(Buffer.from((await readPhoto(id)).bytes), bytes);
  assert.equal(isWebP(Buffer.from('not an image')), false);
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
        Key: 'photos/old.webp',
        LastModified: new Date(Date.now() - 49 * 60 * 60 * 1000),
      },
      { Key: 'photos/new.webp', LastModified: new Date() },
    ],
  });
  s3.on(DeleteObjectCommand).resolves({});
  await removeExpiredPhotos();
  assert.equal(s3.commandCalls(DeleteObjectCommand).length, 1);
  assert.equal(
    s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key,
    'photos/old.webp',
  );
});
