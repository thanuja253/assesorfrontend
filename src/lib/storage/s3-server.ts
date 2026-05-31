import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getMaxUploadBytes } from "@/lib/storage/config";

let s3Client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getS3Config() {
  return {
    region: process.env.AWS_REGION?.trim() || "ap-south-1",
    bucket: requireEnv("AWS_S3_BUCKET"),
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
  };
}

export function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const cfg = getS3Config();
  s3Client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return s3Client;
}

export async function uploadBufferToS3(input: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<{ bucket: string; key: string }> {
  const { bucket } = getS3Config();
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType || "application/octet-stream",
      CacheControl: input.cacheControl ?? "private, max-age=31536000",
    }),
  );

  return { bucket, key: input.key };
}

export async function createPresignedUploadUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { bucket } = getS3Config();
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
  });
  return getSignedUrl(client, command, { expiresIn: input.expiresInSeconds ?? 900 });
}

export function assertUploadSize(byteLength: number): void {
  const max = getMaxUploadBytes();
  if (byteLength > max) {
    const mb = Math.round(max / (1024 * 1024));
    throw new Error(`File exceeds maximum upload size of ${mb} MB.`);
  }
}
