import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePlanId } from "@/lib/layout";

export async function POST(req: Request) {
  const body = await req.json();
  const planId = typeof body.planId === "string" && body.planId ? body.planId : await resolvePlanId(null);
  const keyPrefix = typeof body.keyPrefix === "string" && body.keyPrefix ? body.keyPrefix : "P";
  const existing = await prisma.path.findMany({ where: { planId }, select: { key: true } });
  const keyRe = new RegExp(`^${keyPrefix}(\\d+)$`);
  const nums = existing
    .map((p) => keyRe.exec(p.key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = body.key ?? `${keyPrefix}${nextNum}`;

  const points: { x: number; y: number }[] =
    Array.isArray(body.points) && body.points.length >= 2
      ? body.points
      : [
          { x: 80, y: 60 },
          { x: 110, y: 60 },
          { x: 140, y: 60 },
        ];

  const path = await prisma.path.create({
    data: {
      planId,
      key,
      kind: body.kind ?? "footpath",
      label: body.label ?? "Дорожка",
      widthM: body.widthM ?? 1.5,
      points: { create: points.map((p, i) => ({ orderIndex: i, x: p.x, y: p.y })) },
    },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });

  return NextResponse.json(path);
}
