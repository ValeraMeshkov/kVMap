import PlanEditor from "@/components/PlanEditor";
import { fetchLayout, fetchPlans, resolvePlanId } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planKey } = await searchParams;
  const planId = await resolvePlanId(planKey);
  const [plans, layout] = await Promise.all([
    fetchPlans(),
    fetchLayout(planId),
  ]);
  const activePlan = plans.find((p) => p.id === planId) ?? plans[0];

  return (
    <PlanEditor
      key={planId}
      initial={layout}
      plans={plans}
      activePlan={activePlan}
    />
  );
}
