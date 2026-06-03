/** When true, also send raw files in FormData (multipart bridge during API migration). */
export function shouldKeepFormDataFilesWithS3(): boolean {
  return process.env.NEXT_PUBLIC_S3_KEEP_FORMDATA_FILES === "true";
}

export function getCloudfrontBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "").replace(/\/$/, "");
}
