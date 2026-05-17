import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        sortOrder: true,
      },
    });

    return NextResponse.json({
      ok: true,
      categories,
    });
  } catch (error) {
    console.error("GET /api/categories failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to load categories.",
      },
      { status: 500 },
    );
  }
}