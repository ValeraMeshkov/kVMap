import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, number | string> = {};
  if (body.label !== undefined) data.label = body.label;
  if (body.widthM !== undefined) data.widthM = body.widthM;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.waterway.update({ where: { id }, data });
    }
    if (Array.isArray(body.points)) {
      await tx.waterwayPoint.deleteMany({ where: { waterwayId: id } });
      await tx.waterwayPoint.createMany({
        data: body.points.map((p: { x: number; y: number }, i: number) => ({
          waterwayId: id,
          orderIndex: i,
          x: p.x,
          y: p.y,
        })),
      });
    }
  });

  const waterway = await prisma.waterway.findUniqueOrThrow({
    where: { id },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json(waterway);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.waterway.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
