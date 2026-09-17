import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deletePlan } from "@/lib/layout";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (plan.key === "V1") {
    return NextResponse.json({ error: "main_plan_protected" }, { status: 400 });
  }
  await deletePlan(id);
  return NextResponse.json({ ok: true });
}
