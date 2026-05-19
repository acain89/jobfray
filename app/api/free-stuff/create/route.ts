import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createFreeStuffPostSchema } from "@/lib/post-validation";
import {
  generateSecureToken,
  generateVerificationCode,
  hashToken,
} from "@/lib/post-token";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { twilioClient, twilioPhoneNumber } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = createFreeStuffPostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid listing details.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const ip = getRequestIp(request);

    const rateLimit = enforceRateLimit({
      key: `free-stuff-create:${ip}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many listings created. Try again later.",
        },
        { status: 429 },
      );
    }

    const verificationCode = generateVerificationCode();
    const managementToken = generateSecureToken();
    const codeHash = await bcrypt.hash(verificationCode, 10);
    const managementTokenHash = hashToken(managementToken);

    const now = new Date();
    const verificationExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const postExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

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
          type: "FREE_STUFF",
          status: "PENDING_PHONE",
          posterContactId: posterContact.id,
          title: input.title,
          description: input.description,
          zip: input.zip,
          managementTokenHash,
          expiresAt: postExpiresAt,
        },
        select: {
          id: true,
        },
      });

      await tx.postPhoto.createMany({
        data: input.photoUrls.map((url, index) => ({
          postId: post.id,
          url,
          sortOrder: index,
        })),
      });

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

    const normalizedPhone = input.phone.replace(/\D/g, "");

    if (twilioClient && twilioPhoneNumber) {
      await twilioClient.messages.create({
        body: `JobFray verification code: ${verificationCode}`,
        from: twilioPhoneNumber,
        to: normalizedPhone.startsWith("1")
          ? `+${normalizedPhone}`
          : `+1${normalizedPhone}`,
      });
    } else {
      console.log(
        `DEV ONLY — JobFray free-stuff verification code for ${input.phone}: ${verificationCode}`,
      );
    }

    return NextResponse.json({
      ok: true,
      postId: created.id,
      phone: input.phone,
      managementToken,
    });
  } catch (error) {
    console.error("POST /api/free-stuff/create failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to create listing.",
      },
      { status: 500 },
    );
  }
}