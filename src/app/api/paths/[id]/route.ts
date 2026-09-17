import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, string | number> = {};
  if (body.label !== undefined) data.label = body.label;
  if (body.widthM !== undefined) data.widthM = body.widthM;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.path.update({ where: { id }, data });
    }
    if (Array.isArray(body.points)) {
      await tx.pathPoint.deleteMany({ where: { pathId: id } });
      await tx.pathPoint.createMany({
        data: body.points.map((p: { x: number; y: number }, i: number) => ({
          pathId: id,
          orderIndex: i,
          x: p.x,
          y: p.y,
        })),
      });
    }
  });

  const path = await prisma.path.findUniqueOrThrow({
    where: { id },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json(path);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.path.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
