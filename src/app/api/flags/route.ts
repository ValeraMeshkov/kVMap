import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePlanId } from "@/lib/layout";

export async function POST(req: Request) {
  const body = await req.json();
  const planId = typeof body.planId === "string" && body.planId ? body.planId : await resolvePlanId(null);
  const existing = await prisma.flagLine.findMany({ where: { planId }, select: { key: true } });
  const nums = existing
    .map((f) => /^FLAG(\d+)$/.exec(f.key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = body.key ?? `FLAG${nextNum}`;

  const points: { x: number; y: number }[] =
    Array.isArray(body.points) && body.points.length >= 2
      ? body.points
      : [
          { x: 0, y: 60 },
          { x: 44, y: 60 },
          { x: 88, y: 60 },
          { x: 132, y: 60 },
          { x: 176, y: 60 },
          { x: 220, y: 60 },
        ];

  const flagLine = await prisma.flagLine.create({
    data: {
      planId,
      key,
      label: body.label ?? "Граница территории",
      points: { create: points.map((p, i) => ({ orderIndex: i, x: p.x, y: p.y })) },
    },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });

  return NextResponse.json(flagLine);
}
