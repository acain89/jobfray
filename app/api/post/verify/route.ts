import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPostSchema } from "@/lib/post-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = verifyPostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid verification code.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;

    const normalizedPhone =
      input.phone.replace(/\D/g, "");

    const post = await prisma.post.findUnique({
      where: {
        id: input.postId,
      },
      select: {
        id: true,
        status: true,
        posterContactId: true,
      },
    });

    if (!post || post.status !== "PENDING_PHONE") {
      return NextResponse.json(
        {
          ok: false,
          error: "This post cannot be verified.",
        },
        { status: 400 },
      );
    }

    const verification = await prisma.smsVerification.findFirst({
      where: {
        phone: normalizedPhone,
        purpose: `POST:${post.id}`,
        verifiedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!verification) {
      return NextResponse.json(
        {
          ok: false,
          error: "Verification code expired. Please create the post again.",
        },
        { status: 400 },
      );
    }

    if (verification.attempts >= 5) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many attempts. Please create the post again.",
        },
        { status: 429 },
      );
    }

        const normalizedCode =
      input.code
        .replace(/\D/g, "")
        .slice(0, 6);

    const matches =
      await bcrypt.compare(
        normalizedCode,
        verification.codeHash,
      );

    if (!matches) {
      await prisma.smsVerification.update({
        where: {
          id: verification.id,
        },

        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "Incorrect verification code.",
        },
        {
          status: 400,
        },
      );
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.smsVerification.update({
        where: {
          id: verification.id,
        },
        data: {
          verifiedAt: now,
        },
      }),

      prisma.posterContact.update({
        where: {
          id: post.posterContactId,
        },
        data: {
          phoneVerifiedAt: now,
        },
      }),

      prisma.post.update({
        where: {
          id: post.id,
        },
        data: {
          status: "LIVE",
          phoneVerifiedAt: now,
          liveAt: now,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      postId: post.id,
    });
  } catch (error) {
    console.error("POST /api/post/verify failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to verify post.",
      },
      { status: 500 },
    );
  }
}