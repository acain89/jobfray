import { NextRequest, NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {

     const ip = getRequestIp(request);

const rateLimit =
  enforceRateLimit({
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
    { status: 429 },
  );
}    

    const formData = await request.formData();
    const files = formData.getAll("files");

    if (files.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No files uploaded.",
        },
        { status: 400 },
      );
    }

    if (files.length > 3) {
      return NextResponse.json(
        {
          ok: false,
          error: "Maximum 3 images allowed.",
        },
        { status: 400 },
      );
    }

    const uploadedUrls: string[] = [];

    for (const entry of files) {
      if (!(entry instanceof File)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Invalid upload.",
          },
          { status: 400 },
        );
      }

      if (!allowedMimeTypes.has(entry.type)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Only JPG, PNG, and WEBP images are allowed.",
          },
          { status: 400 },
        );
      }

      if (entry.size > 8 * 1024 * 1024) {
        return NextResponse.json(
          {
            ok: false,
            error: "Each image must be under 8MB.",
          },
          { status: 400 },
        );
      }

      const bytes = await entry.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploaded = await new Promise<{
        secure_url: string;
      }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "jobfray",

            moderation: "webpurify",
            resource_type: "image",
            transformation: [
              {
                width: 1600,
                height: 1600,
                crop: "limit",
                quality: "auto",
                fetch_format: "auto",
              },
            ],
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Upload failed."));
              return;
            }

            resolve({
              secure_url: result.secure_url,
            });
          },
        );

        stream.end(buffer);
      });

      uploadedUrls.push(uploaded.secure_url);
    }

    return NextResponse.json({
      ok: true,
      urls: uploadedUrls,
    });
  } catch (error) {
    console.error("POST /api/uploads/images failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Image upload failed.",
      },
      { status: 500 },
    );
  }
}