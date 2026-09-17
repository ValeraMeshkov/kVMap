import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, string> = {};
  if (body.label !== undefined) data.label = body.label;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.flagLine.update({ where: { id }, data });
    }
    if (Array.isArray(body.points)) {
      await tx.flagPoint.deleteMany({ where: { flagLineId: id } });
      await tx.flagPoint.createMany({
        data: body.points.map((p: { x: number; y: number }, i: number) => ({
          flagLineId: id,
          orderIndex: i,
          x: p.x,
          y: p.y,
        })),
      });
    }
  });

  const flagLine = await prisma.flagLine.findUniqueOrThrow({
    where: { id },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json(flagLine);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.flagLine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
