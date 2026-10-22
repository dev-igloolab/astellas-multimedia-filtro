import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const PHOTO_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const prefix = 'photos/';
const idPattern = /^[0-9a-f]{8}-[0-9a-f-]{36}$/;
let client;

function storage() {
  const { SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET } =
    process.env;
  if (!SPACES_REGION || !SPACES_BUCKET || !SPACES_KEY || !SPACES_SECRET)
    throw new Error('Falta configurar DigitalOcean Spaces');
  client ||= new S3Client({
    region: 'us-east-1',
    endpoint: `https://${SPACES_REGION}.digitaloceanspaces.com`,
    credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
    forcePathStyle: false,
  });
  return { client, bucket: SPACES_BUCKET };
}

function objectKey(id) {
  return idPattern.test(id || '') ? `${prefix}${id}.webp` : null;
}

function expiresAt(lastModified) {
  return new Date(new Date(lastModified).getTime() + PHOTO_LIFETIME_MS);
}

function missing(error) {
  return (
    error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    error.$metadata?.httpStatusCode === 404
  );
}

export function isWebP(bytes) {
  return (
    bytes.length >= 20 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.length &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))
  );
}

export async function savePhoto(bytes) {
  if (!isWebP(bytes) || bytes.length > MAX_PHOTO_BYTES)
    throw new Error('INVALID_PHOTO');
  const { client, bucket } = storage();
  const id = `${Math.floor(Date.now() / 1000).toString(16)}-${randomUUID()}`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey(id),
      Body: bytes,
      ContentType: 'image/webp',
      CacheControl: 'private, no-store',
    }),
  );
  return id;
}

export async function deletePhoto(id) {
  const key = objectKey(id);
  if (!key) return;
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getPhotoInfo(id) {
  const key = objectKey(id);
  if (!key) return null;
  const { client, bucket } = storage();
  try {
    const object = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    const expiration = expiresAt(object.LastModified);
    if (expiration.getTime() <= Date.now()) {
      await deletePhoto(id);
      return null;
    }
    return { expiresAt: expiration };
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function readPhoto(id) {
  const info = await getPhotoInfo(id);
  if (!info) return null;
  const { client, bucket } = storage();
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey(id) }),
    );
    return { ...info, bytes: await object.Body.transformToByteArray() };
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function removeExpiredPhotos() {
  const { client, bucket } = storage();
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents || []) {
      if (
        object.LastModified &&
        expiresAt(object.LastModified).getTime() <= Date.now()
      ) {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }),
          );
        } catch (error) {
          console.error('No se pudo borrar una foto vencida.', error);
        }
      }
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
}

const cleanupTimer = setInterval(
  () => removeExpiredPhotos().catch(console.error),
  60 * 60 * 1000,
);
cleanupTimer.unref();
if (process.env.SPACES_BUCKET) removeExpiredPhotos().catch(console.error);
