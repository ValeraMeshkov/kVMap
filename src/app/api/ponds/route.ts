import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePlanId } from "@/lib/layout";

export async function POST(req: Request) {
  const body = await req.json();
  const planId = typeof body.planId === "string" && body.planId ? body.planId : await resolvePlanId(null);
  const existing = await prisma.pond.findMany({ where: { planId }, select: { key: true } });
  const nums = existing
    .map((p) => /^PRUD(\d+)$/.exec(p.key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = body.key ?? `PRUD${nextNum}`;

  const points: { x: number; y: number }[] = Array.isArray(body.points) && body.points.length >= 3
    ? body.points
    : (() => {
        const n = body.pointCount ?? 12;
        const cx = body.centerX ?? 110;
        const cy = body.centerY ?? 80;
        const r = body.radiusM ?? 8;
        return Array.from({ length: n }, (_, i) => {
          const angle = (i / n) * Math.PI * 2;
          return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        });
      })();

  const pond = await prisma.pond.create({
    data: {
      planId,
      key,
      label: body.label ?? "Новый пруд",
      points: { create: points.map((p, i) => ({ orderIndex: i, x: p.x, y: p.y })) },
    },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });

  return NextResponse.json(pond);
}
