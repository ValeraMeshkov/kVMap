import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePlanId } from "@/lib/layout";

export async function POST(req: Request) {
  const body = await req.json();
  const planId = typeof body.planId === "string" && body.planId ? body.planId : await resolvePlanId(null);
  const kind: string = body.kind === "stream" ? "stream" : "river";
  const prefix = kind === "river" ? "REKA" : "RUCH";

  const existing = await prisma.waterway.findMany({ where: { planId }, select: { key: true } });
  const numRe = new RegExp(`^${prefix}(\\d+)$`);
  const nums = existing
    .map((w) => numRe.exec(w.key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = body.key ?? `${prefix}${nextNum}`;

  const points: { x: number; y: number }[] =
    Array.isArray(body.points) && body.points.length >= 2
      ? body.points
      : [
          { x: 40, y: 80 },
          { x: 70, y: 80 },
        ];

  const waterway = await prisma.waterway.create({
    data: {
      planId,
      key,
      kind,
      label: body.label ?? (kind === "river" ? "Новая река" : "Новый ручей"),
      widthM: body.widthM ?? (kind === "river" ? 4 : 1.5),
      points: { create: points.map((p, i) => ({ orderIndex: i, x: p.x, y: p.y })) },
    },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });

  return NextResponse.json(waterway);
}
