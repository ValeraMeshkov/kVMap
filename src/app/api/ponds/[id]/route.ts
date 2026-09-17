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
      await tx.pond.update({ where: { id }, data });
    }
    if (Array.isArray(body.points)) {
      await tx.pondPoint.deleteMany({ where: { pondId: id } });
      await tx.pondPoint.createMany({
        data: body.points.map((p: { x: number; y: number }, i: number) => ({
          pondId: id,
          orderIndex: i,
          x: p.x,
          y: p.y,
        })),
      });
    }
  });

  const pond = await prisma.pond.findUniqueOrThrow({
    where: { id },
    include: { points: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json(pond);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.pond.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
