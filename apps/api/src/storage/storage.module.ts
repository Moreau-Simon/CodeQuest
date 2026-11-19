import { Global, Inject, Injectable, Module } from '@nestjs/common';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { STORAGE_CLIENT, STORAGE_SERVICE, type StorageHealth } from './storage.constants';

export const STORAGE_BUCKETS = {
  assets: env.MINIO_BUCKET_ASSETS,
  avatars: env.MINIO_BUCKET_AVATARS,
  secrets: env.MINIO_BUCKET_SECRETS
} as const;

export type StorageBucket = keyof typeof STORAGE_BUCKETS;

/** URLs signées de courte durée (15 min par défaut — T031). */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

@Injectable()
export class StorageService implements StorageHealth {
  constructor(@Inject(STORAGE_CLIENT) private readonly client: S3Client) {}

  private bucketOf(bucket: StorageBucket): string {
    return STORAGE_BUCKETS[bucket];
  }

  async ensureBuckets(): Promise<void> {
    for (const bucket of Object.values(STORAGE_BUCKETS)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    }
  }

  async checkHealth(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: STORAGE_BUCKETS.assets }));
  }

  presignedPut(
    bucket: StorageBucket,
    key: string,
    contentType: string,
    ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucketOf(bucket), Key: key, ContentType: contentType }),
      { expiresIn: Math.min(ttlSeconds, DEFAULT_SIGNED_URL_TTL_SECONDS) }
    );
  }

  presignedGet(
    bucket: StorageBucket,
    key: string,
    ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketOf(bucket), Key: key }),
      { expiresIn: Math.min(ttlSeconds, DEFAULT_SIGNED_URL_TTL_SECONDS) }
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_CLIENT,
      useFactory: () =>
        new S3Client({
          endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.MINIO_ACCESS_KEY,
            secretAccessKey: env.MINIO_SECRET_KEY
          }
        })
    },
    { provide: STORAGE_SERVICE, useClass: StorageService }
  ],
  exports: [STORAGE_CLIENT, STORAGE_SERVICE]
})
export class StorageModule {}
