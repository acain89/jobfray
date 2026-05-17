import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/post-token";

export const runtime = "nodejs";

const completePostSchema = z.object({
  postId: z.string().trim().min(1),
  token: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(500).optional().default(""),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = completePostSchema.safeParse(body);

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
        workerInterests: {
          where: {
            status: "ACCEPTED",
          },
          take: 1,
          select: {
            id: true,
            workerId: true,
            worker: {
              select: {
                ratingAverage: true,
                ratingCount: true,
                completedJobCount: true,
              },
            },
          },
        },
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

    if (post.status !== "MATCHED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Only matched jobs can be completed.",
        },
        { status: 400 },
      );
    }

    const acceptedInterest = post.workerInterests[0];

    if (!acceptedInterest) {
      return NextResponse.json(
        {
          ok: false,
          error: "No accepted worker found.",
        },
        { status: 400 },
      );
    }

    const currentRatingAverage = Number(acceptedInterest.worker.ratingAverage);
    const currentRatingCount = acceptedInterest.worker.ratingCount;
    const nextRatingCount = currentRatingCount + 1;
    const nextRatingAverage =
      (currentRatingAverage * currentRatingCount + input.rating) / nextRatingCount;

    await prisma.$transaction([
      prisma.post.update({
        where: {
          id: post.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      }),

      prisma.worker.update({
        where: {
          id: acceptedInterest.workerId,
        },
        data: {
          ratingAverage: nextRatingAverage,
          ratingCount: nextRatingCount,
          completedJobCount: {
            increment: 1,
          },
        },
      }),
    ]);

    console.log(
      `JobFray review submitted for post ${post.id}: ${input.rating} stars — ${input.review}`,
    );

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("POST /api/post/manage/complete failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to complete job.",
      },
      { status: 500 },
    );
  }
}