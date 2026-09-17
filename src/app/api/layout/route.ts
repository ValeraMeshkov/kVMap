import { NextResponse } from "next/server";
import { fetchLayout, resolvePlanId } from "@/lib/layout";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const planId = await resolvePlanId(searchParams.get("plan"));
  const layout = await fetchLayout(planId);
  return NextResponse.json(layout);
}
