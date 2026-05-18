import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { twilioClient, twilioPhoneNumber } from "@/lib/twilio";
import { createPostSchema } from "@/lib/post-validation";
import { geocodeAddress } from "@/lib/mapbox";
import { createFuzzyCoordinates } from "@/lib/location-fuzz";
import {
  generateSecureToken,
  generateVerificationCode,
  hashToken,
} from "@/lib/post-token";
import {
  enforceRateLimit,
  getRequestIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = createPostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid post details.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;

    const ip = getRequestIp(request);

const rateLimit =
  enforceRateLimit({
    key: `post-create:${ip}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

if (!rateLimit.allowed) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Too many posts created. Try again later.",
    },
    { status: 429 },
  );
}  

    const category = await prisma.category.findFirst({
      where: {
        id: input.categoryId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      return NextResponse.json(
        {
          ok: false,
          error: "Choose a valid category.",
        },
        { status: 400 },
      );
    }

    const verificationCode = generateVerificationCode();
    const managementToken = generateSecureToken();
    const codeHash = await bcrypt.hash(verificationCode, 10);
    const managementTokenHash = hashToken(managementToken);

    const now = new Date();
    const verificationExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const postExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

let privateLatitude: number | null =
  null;

let privateLongitude: number | null =
  null;

let publicLatitude: number | null =
  null;

let publicLongitude: number | null =
  null;

const geocoded =
  await geocodeAddress(
    `${input.exactAddress}, ${input.zip}`,
  );

if (geocoded) {
  privateLatitude =
    geocoded.latitude;

  privateLongitude =
    geocoded.longitude;

  const fuzzy =
    createFuzzyCoordinates({
      latitude:
        geocoded.latitude,

      longitude:
        geocoded.longitude,

      seed: managementToken,
    });

  publicLatitude =
    fuzzy.latitude;

  publicLongitude =
    fuzzy.longitude;
}

     if (
      input.photoUrls.length > 3
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Maximum 3 photos allowed.",
        },
        {
          status: 400,
        },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const existingContact = await tx.posterContact.findFirst({
        where: {
          phone: input.phone,
        },
        select: {
          id: true,
        },
      });

      const posterContact =
        existingContact ??
        (await tx.posterContact.create({
          data: {
            phone: input.phone,
          },
          select: {
            id: true,
          },
        }));

      const post = await tx.post.create({
        data: {
          type: "JOB",
          status: "PENDING_PHONE",
          posterContactId: posterContact.id,
          categoryId: input.categoryId,
          title: input.title,
          description: input.description,
          payAmountCents: input.payAmountCents,
          needBy: input.needBy,
          zip: input.zip,
          exactAddress: input.exactAddress,
          privateLatitude,
          privateLongitude,
          publicLatitude,
          publicLongitude,
          managementTokenHash,
          expiresAt: postExpiresAt,
        },
        select: {
          id: true,
        },
      });

      if (input.photoUrls.length > 0) {
        await tx.postPhoto.createMany({
          data: input.photoUrls.map((url, index) => ({
            postId: post.id,
            url,
            sortOrder: index,
          })),
        });
      }

      await tx.smsVerification.create({
        data: {
          phone: input.phone,
          codeHash,
          purpose: `POST:${post.id}`,
          expiresAt: verificationExpiresAt,
        },
      });

      return post;
    });

      const normalizedPhone =
      input.phone.replace(/\D/g, "");

    if (
      twilioClient &&
      twilioPhoneNumber
    ) {
      try {
        await twilioClient.messages.create({
          body:
            `JobFray verification code: ${verificationCode}`,

          from: twilioPhoneNumber,

          to: normalizedPhone.startsWith("1")
            ? `+${normalizedPhone}`
            : `+1${normalizedPhone}`,
        });
      } catch (smsError) {
        console.error(
          "Twilio verification send failed:",
          smsError,
        );

        return NextResponse.json(
          {
            ok: false,
            error:
              "Unable to send verification code.",
          },
          {
            status: 500,
          },
        );
      }
    } else {
      console.log(
        `DEV ONLY — JobFray post verification code for ${input.phone}: ${verificationCode}`,
      );
    }

    return NextResponse.json({
      ok: true,
      postId: created.id,
      phone: input.phone,
      managementToken,
    });
  } catch (error) {
    console.error("POST /api/post/create failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to create post.",
      },
      { status: 500 },
    );
  }
}