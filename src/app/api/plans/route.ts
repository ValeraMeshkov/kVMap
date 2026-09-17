import { NextResponse } from "next/server";
import { createPlanWithDefaults, fetchPlans } from "@/lib/layout";

export async function GET() {
  const plans = await fetchPlans();
  return NextResponse.json(plans);
}

export async function POST() {
  const plan = await createPlanWithDefaults();
  return NextResponse.json(plan);
}
