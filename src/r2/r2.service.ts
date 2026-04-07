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
  private readonly endpoint: string;
  private readonly isConfigured: boolean;

  constructor() {
    const raw = (process.env.R2_ACCOUNT_ID ?? '').trim();
    const explicitEndpoint = (process.env.R2_ENDPOINT ?? '').trim();
    this.bucket = (process.env.R2_BUCKET ?? '').trim();
    this.publicUrl = (process.env.R2_PUBLIC_URL ?? '').trim();

    // R2_ACCOUNT_ID can be:
    //   • just the account id          → 3255c5a2dad5ac23d47d4efc0c66a19a
    //   • full endpoint URL             → https://3255c5a...r2.cloudflarestorage.com
    //   • endpoint with trailing slash  → https://3255c5a...r2.cloudflarestorage.com/
    // Normalise to a clean https:// endpoint.
    let endpoint = '';
    if (explicitEndpoint) {
      endpoint = explicitEndpoint.startsWith('http')
        ? explicitEndpoint.replace(/\/+$/, '')
        : `https://${explicitEndpoint}.r2.cloudflarestorage.com`;
    } else if (raw) {
      endpoint = raw.startsWith('http')
        ? raw.replace(/\/+$/, '')
        : `https://${raw}.r2.cloudflarestorage.com`;
    }

    this.endpoint = endpoint;

    const hasCreds = Boolean(
      (process.env.R2_ACCESS_KEY_ID ?? '').trim() &&
      (process.env.R2_SECRET_ACCESS_KEY ?? '').trim(),
    );
    this.isConfigured = Boolean(this.endpoint && this.bucket && hasCreds);

    this.logger.log(
      `R2 endpoint: ${this.endpoint || '(not configured)'}, bucket: ${this.bucket || '(not set)'}`,
    );

    this.client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint || undefined,
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
    if (!this.isConfigured) {
      throw new Error(
        'R2 is not configured. Set R2_ENDPOINT (or R2_ACCOUNT_ID), R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.',
      );
    }

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

    if (uploadUrl.includes('s3.auto.amazonaws.com')) {
      throw new Error(
        'Invalid R2 upload URL generated. Ensure R2 endpoint is set to https://<account-id>.r2.cloudflarestorage.com (or set R2_ENDPOINT).',
      );
    }

    return { key, uploadUrl };
  }

  /**
   * Generate a presigned GET URL so the admin can view a file in R2.
   * Falls back to the public URL if R2_PUBLIC_URL is configured.
   */
  async presignDownload(key: string, expiresIn = 3600): Promise<string> {
    if (!this.isConfigured && !this.publicUrl) {
      throw new Error(
        'R2 is not configured. Set R2_ENDPOINT (or R2_ACCOUNT_ID), R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.',
      );
    }

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
