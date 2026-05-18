import { NextRequest, NextResponse } from "next/server";

import { cloudinary } from "@/lib/cloudinary";

import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_FILE_SIZE_BYTES =
  8 * 1024 * 1024;

const MAX_FILES = 3;

function normalizeMimeType(
  mimeType: string,
): string {
  return mimeType.trim().toLowerCase();
}

function getSafeFilename(
  filename: string,
): string {
  return filename
    .replace(/[^a-zA-Z0-9.\-_]/g, "")
    .slice(0, 120);
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error(
        "Missing Cloudinary environment variables.",
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Image uploads are temporarily unavailable.",
        },
        {
          status: 500,
        },
      );
    }

    const ip = getRequestIp(request);

    const rateLimit = enforceRateLimit({
      key: `uploads:${ip}`,
      limit: 25,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many uploads. Try again later.",
        },
        {
          status: 429,
        },
      );
    }

    const formData =
      await request.formData();

    const files = formData
      .getAll("files")
      .filter(
        (entry): entry is File =>
          entry instanceof File,
      );

    if (files.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No images selected.",
        },
        {
          status: 400,
        },
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Maximum 3 images allowed.",
        },
        {
          status: 400,
        },
      );
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const mimeType =
        normalizeMimeType(file.type);

      if (
        !allowedMimeTypes.has(mimeType)
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Only JPG, PNG, WEBP, and HEIC images are allowed.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        file.size <= 0 ||
        file.size >
          MAX_FILE_SIZE_BYTES
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Each image must be under 8MB.",
          },
          {
            status: 400,
          },
        );
      }

      const bytes =
        await file.arrayBuffer();

      if (bytes.byteLength === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "One of the selected images was empty.",
          },
          {
            status: 400,
          },
        );
      }

      const buffer =
        Buffer.from(bytes);

      const uploaded =
        await new Promise<{
          secure_url: string;
        }>((resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder: "jobfray",

                resource_type:
                  "image",

                moderation:
                  "webpurify",

                overwrite: false,

                use_filename: true,

                unique_filename: true,

                filename_override:
                  getSafeFilename(
                    file.name ||
                      "jobfray-upload",
                  ),

                transformation: [
                  {
                    width: 1600,
                    height: 1600,
                    crop: "limit",
                    quality: "auto",
                    fetch_format:
                      "auto",
                  },
                ],
              },

              (
                error,
                result,
              ) => {
                if (
                  error ||
                  !result
                ) {
                  reject(
                    error ??
                      new Error(
                        "Upload failed.",
                      ),
                  );

                  return;
                }

                resolve({
                  secure_url:
                    result.secure_url,
                });
              },
            );

          uploadStream.on(
            "error",
            reject,
          );

          uploadStream.end(buffer);
        });

      uploadedUrls.push(
        uploaded.secure_url,
      );
    }

    return NextResponse.json({
      ok: true,
      urls: uploadedUrls,
    });
  } catch (error) {
    console.error(
      "POST /api/uploads/images failed:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Image upload failed. Please try again.",
      },
      {
        status: 500,
      },
    );
  }
}