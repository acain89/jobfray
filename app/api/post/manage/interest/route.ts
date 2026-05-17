import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/post-token";

export const runtime = "nodejs";

const manageInterestSchema = z.object({
  postId: z.string().trim().min(1),
  token: z.string().trim().min(1),
  interestId: z.string().trim().min(1),
  action: z.enum(["ACCEPT", "REJECT"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = manageInterestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;

    const post = await prisma.post.findFirst({
      where: {
        id: input.postId,
        managementTokenHash: hashToken(input.token),
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!post) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid manage link.",
        },
        { status: 403 },
      );
    }

    if (post.status !== "LIVE") {
      return NextResponse.json(
        {
          ok: false,
          error: "This post is no longer accepting workers.",
        },
        { status: 400 },
      );
    }

    const interest = await prisma.workerInterest.findFirst({
      where: {
        id: input.interestId,
        postId: post.id,
        status: "PENDING",
      },
      select: {
        id: true,
      },
    });

    if (!interest) {
      return NextResponse.json(
        {
          ok: false,
          error: "Offer not found.",
        },
        { status: 404 },
      );
    }

    const now = new Date();

    if (input.action === "REJECT") {
      await prisma.workerInterest.update({
        where: {
          id: interest.id,
        },
        data: {
          status: "REJECTED",
          rejectedAt: now,
        },
      });

      return NextResponse.json({
        ok: true,
      });
    }

    await prisma.$transaction([
      prisma.workerInterest.update({
        where: {
          id: interest.id,
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
        },
      }),

      prisma.workerInterest.updateMany({
        where: {
          postId: post.id,
          id: {
            not: interest.id,
          },
          status: "PENDING",
        },
        data: {
          status: "REJECTED",
          rejectedAt: now,
        },
      }),

     prisma.post.update({
  where: {
    id: post.id,
  },
  data: {
    status: "MATCHED",
  },
}),
    ]);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("POST /api/post/manage/interest failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to update offer.",
      },
      { status: 500 },
    );
  }
}