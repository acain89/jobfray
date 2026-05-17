import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPostSchema } from "@/lib/post-validation";
import {
  generateSecureToken,
  generateVerificationCode,
  hashToken,
} from "@/lib/post-token";

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

    console.log(
      `DEV ONLY — JobFray post verification code for ${input.phone}: ${verificationCode}`,
    );

    return NextResponse.json({
      ok: true,
      postId: created.id,
      phone: input.phone,
      managementToken,
      devVerificationCode: verificationCode,
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