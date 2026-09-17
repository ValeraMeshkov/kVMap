import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePlanId } from "@/lib/layout";

export async function POST(req: Request) {
  const body = await req.json();
  const planId = typeof body.planId === "string" && body.planId ? body.planId : await resolvePlanId(null);
  const keyPrefix = typeof body.keyPrefix === "string" && body.keyPrefix ? body.keyPrefix : "H";
  const existing = await prisma.house.findMany({ where: { planId }, select: { key: true } });
  const keyRe = new RegExp(`^${keyPrefix}(\\d+)$`);
  const nums = existing
    .map((h) => keyRe.exec(h.key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = body.key ?? `${keyPrefix}${nextNum}`;

  const house = await prisma.house.create({
    data: {
      planId,
      key,
      label: body.label ?? "Новый домик",
      kind: body.kind ?? "house",
      asset: body.asset ?? "assets/house_glass_mirror.png",
      tlX: body.tlX ?? 20,
      tlY: body.tlY ?? 20,
      sizeW: body.sizeW ?? 15,
      sizeH: body.sizeH ?? 15,
      rotationDeg: body.rotationDeg ?? 0,
      renderScale: body.renderScale ?? 1,
      renderOffsetX: body.renderOffsetX ?? 0,
      renderOffsetY: body.renderOffsetY ?? 0,
    },
  });

  return NextResponse.json(house);
}
