import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/post-token";

export const runtime = "nodejs";

const closePostSchema = z.object({
  postId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = closePostSchema.safeParse(body);

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

    if (post.status === "COMPLETED" || post.status === "DELETED") {
      return NextResponse.json({
        ok: true,
      });
    }

    await prisma.post.update({
      where: {
        id: post.id,
      },
      data: {
  status: "DELETED",
       },
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("POST /api/post/manage/close failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to close post.",
      },
      { status: 500 },
    );
  }
}