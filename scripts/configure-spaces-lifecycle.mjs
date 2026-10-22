import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const { SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET } = process.env;
if (!SPACES_REGION || !SPACES_BUCKET || !SPACES_KEY || !SPACES_SECRET)
  throw new Error('Falta configurar DigitalOcean Spaces');

const client = new S3Client({
  region: 'us-east-1',
  endpoint: `https://${SPACES_REGION}.digitaloceanspaces.com`,
  credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
});

let rules = [];
try {
  const current = await client.send(
    new GetBucketLifecycleConfigurationCommand({ Bucket: SPACES_BUCKET }),
  );
  rules = current.Rules || [];
} catch (error) {
  if (
    error.name !== 'NoSuchLifecycleConfiguration' &&
    error.$metadata?.httpStatusCode !== 404
  )
    throw error;
}

const id = 'astellas-photos-2-days';
rules = rules.filter((rule) => rule.ID !== id);
rules.push({
  ID: id,
  Status: 'Enabled',
  Prefix: 'photos/',
  Expiration: { Days: 2 },
});
await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: SPACES_BUCKET,
    LifecycleConfiguration: { Rules: rules },
  }),
);
const verified = await client.send(
  new GetBucketLifecycleConfigurationCommand({ Bucket: SPACES_BUCKET }),
);
const photoRule = verified.Rules?.find((rule) => rule.ID === id);
if (
  photoRule?.Status !== 'Enabled' ||
  photoRule?.Expiration?.Days !== 2 ||
  photoRule?.Prefix !== 'photos/'
)
  throw new Error('No se pudo verificar la regla de expiración');
console.log(
  'Regla de expiración para photos/: 2 días. Se conservaron las demás reglas.',
);
