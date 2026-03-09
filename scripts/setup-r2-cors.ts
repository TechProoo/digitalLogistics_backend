/**
 * One-time script to configure CORS on the R2 bucket so the browser
 * can PUT files directly via presigned URLs.
 *
 * Run with:  npx ts-node scripts/setup-r2-cors.ts
 *   or:      npx tsx scripts/setup-r2-cors.ts
 */
import 'dotenv/config';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

async function main() {
  const raw = (process.env.R2_ACCOUNT_ID ?? '').trim();
  const bucket = (process.env.R2_BUCKET ?? '').trim();

  if (!raw || !bucket) {
    console.error('❌  R2_ACCOUNT_ID and R2_BUCKET must be set in .env');
    process.exit(1);
  }

  const endpoint = raw.startsWith('http')
    ? raw.replace(/\/+$/, '')
    : `https://${raw}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            // Allow browser uploads from any origin (presigned URLs are self-authenticating)
            AllowedOrigins: ['*'],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  console.log(`✅  CORS configured on bucket "${bucket}" at ${endpoint}`);
}

main().catch((err) => {
  console.error('❌  Failed to set CORS:', err.message);
  process.exit(1);
});
