import "server-only";

import { v2 as cloudinary } from "cloudinary";

const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME;

const apiKey =
  process.env.CLOUDINARY_API_KEY;

const apiSecret =
  process.env.CLOUDINARY_API_SECRET;

const isConfigured = Boolean(
  cloudName &&
    apiKey &&
    apiSecret,
);

if (!isConfigured) {
  console.error(
    "Cloudinary environment variables are missing.",
  );
}

cloudinary.config({
  secure: true,

  cloud_name: cloudName,

  api_key: apiKey,

  api_secret: apiSecret,
});

export { cloudinary };

export function isCloudinaryConfigured(): boolean {
  return isConfigured;
}

export function assertCloudinaryConfigured(): void {
  if (!isConfigured) {
    throw new Error(
      "Cloudinary is not configured.",
    );
  }
}