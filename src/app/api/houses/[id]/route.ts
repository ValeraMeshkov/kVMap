import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const FIELDS = [
  "label",
  "kind",
  "asset",
  "tlX",
  "tlY",
  "sizeW",
  "sizeH",
  "rotationDeg",
  "renderScale",
  "renderOffsetX",
  "renderOffsetY",
] as const;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, number | string> = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  const house = await prisma.house.update({ where: { id }, data });
  return NextResponse.json(house);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.house.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
