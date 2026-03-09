import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    const raw = (process.env.R2_ACCOUNT_ID ?? '').trim();
    this.bucket = (process.env.R2_BUCKET ?? '').trim();
    this.publicUrl = (process.env.R2_PUBLIC_URL ?? '').trim();

    // R2_ACCOUNT_ID can be:
    //   • just the account id          → 3255c5a2dad5ac23d47d4efc0c66a19a
    //   • full endpoint URL             → https://3255c5a...r2.cloudflarestorage.com
    //   • endpoint with trailing slash  → https://3255c5a...r2.cloudflarestorage.com/
    // Normalise to a clean https:// endpoint.
    let endpoint: string | undefined;
    if (raw) {
      if (raw.startsWith('http')) {
        // Already a full URL — use as-is (strip trailing slashes)
        endpoint = raw.replace(/\/+$/, '');
      } else {
        // Bare account ID — build the endpoint
        endpoint = `https://${raw}.r2.cloudflarestorage.com`;
      }
    }

    this.logger.log(
      `R2 endpoint: ${endpoint ?? '(not configured)'}, bucket: ${this.bucket || '(not set)'}`,
    );

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  /**
   * Generate a presigned PUT URL so the frontend can upload directly to R2.
   * Returns { key, uploadUrl }.
   */
  async presignUpload(
    folder: string,
    filename: string,
    contentType: string,
  ): Promise<{ key: string; uploadUrl: string }> {
    // Build a unique key: drivers/<uuid>-<sanitised-filename>
    const sanitised = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${randomUUID()}-${sanitised}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 600, // 10 minutes
    });

    return { key, uploadUrl };
  }

  /**
   * Generate a presigned GET URL so the admin can view a file in R2.
   * Falls back to the public URL if R2_PUBLIC_URL is configured.
   */
  async presignDownload(key: string, expiresIn = 3600): Promise<string> {
    // If a public custom domain is set, just return that.
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/+$/, '')}/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }
}
