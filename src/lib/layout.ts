import { prisma } from "@/lib/prisma";
import type { LayoutDTO, PlanSummary } from "@/lib/types";

const MAIN_PLAN_KEY = "V1";

// Эти объекты — общие для всех планов: живут в V1 и просто подмешиваются в любой
// другой план при чтении. Редактировать (двигать/удалять/менять размер) их можно
// только находясь на V1 — на остальных планах фронтенд их блокирует по planId.
const SHARED_HOUSE_ASSETS = [
  "assets/admin_building.png",
  "assets/large_building.png",
];
const SHARED_WATERWAY_KINDS = ["river", "stream"];

export async function fetchPlans(): Promise<PlanSummary[]> {
  return prisma.plan.findMany({ orderBy: { createdAt: "asc" } });
}

async function ensureDefaultPlan(): Promise<PlanSummary> {
  const existing = await prisma.plan.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.plan.create({
    data: { key: MAIN_PLAN_KEY, title: "План v0 — зеркальные боксы" },
  });
}

export async function resolvePlan(
  planKey?: string | null,
): Promise<PlanSummary> {
  if (planKey) {
    const plan = await prisma.plan.findUnique({ where: { key: planKey } });
    if (plan) return plan;
  }
  return ensureDefaultPlan();
}

export async function resolvePlanId(planKey?: string | null): Promise<string> {
  const plan = await resolvePlan(planKey);
  return plan.id;
}

async function mainPlanId(): Promise<string> {
  const main = await resolvePlan(MAIN_PLAN_KEY);
  return main.id;
}

export async function fetchLayout(planId: string): Promise<LayoutDTO> {
  const mainId = await mainPlanId();

  const [meta, houses, waterways, ponds, paths, flagLines] = await Promise.all([
    prisma.meta.findUnique({ where: { id: 1 } }),
    prisma.house.findMany({
      where: {
        OR: [
          { planId },
          { planId: mainId, asset: { in: SHARED_HOUSE_ASSETS } },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.waterway.findMany({
      where: {
        OR: [
          { planId },
          { planId: mainId, kind: { in: SHARED_WATERWAY_KINDS } },
        ],
      },
      include: { points: { orderBy: { orderIndex: "asc" } } },
    }),
    prisma.pond.findMany({
      where: { OR: [{ planId }, { planId: mainId }] },
      include: { points: { orderBy: { orderIndex: "asc" } } },
    }),
    prisma.path.findMany({
      where: { planId },
      include: { points: { orderBy: { orderIndex: "asc" } } },
    }),
    prisma.flagLine.findMany({
      where: { OR: [{ planId }, { planId: mainId }] },
      include: { points: { orderBy: { orderIndex: "asc" } } },
    }),
  ]);

  return {
    meta: meta
      ? {
          title: meta.title,
          plotW: meta.plotW,
          plotH: meta.plotH,
          pxPerM: meta.pxPerM,
        }
      : { title: "План v0", plotW: 220, plotH: 160, pxPerM: 6.9818 },
    houses,
    waterways,
    ponds,
    paths,
    flagLines,
  };
}

// Новый план — это просто новая вкладка с тем же ключом-нумерацией (V2, V3, ...).
// Общие объекты (река, ручьи, пруд, границу, A1/B1) никуда не копируем — они и так
// подмешиваются из V1 при чтении layout'а (см. fetchLayout).
export async function createPlanWithDefaults(): Promise<PlanSummary> {
  const plans = await prisma.plan.findMany({ orderBy: { createdAt: "asc" } });
  if (plans.length === 0) await ensureDefaultPlan();

  const nums = plans
    .map((p) => /^V(\d+)$/.exec(p.key)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const key = `V${nextNum}`;

  return prisma.plan.create({ data: { key, title: `План ${key}` } });
}

// V1 удалить нельзя — в нём живут общие объекты (река, пруд, ручьи, граница, A1/B1),
// которые подмешиваются во все остальные планы.
export async function deletePlan(planId: string): Promise<void> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.key === MAIN_PLAN_KEY) return;

  await prisma.$transaction([
    prisma.house.deleteMany({ where: { planId } }),
    prisma.waterway.deleteMany({ where: { planId } }),
    prisma.pond.deleteMany({ where: { planId } }),
    prisma.path.deleteMany({ where: { planId } }),
    prisma.flagLine.deleteMany({ where: { planId } }),
    prisma.plan.delete({ where: { id: planId } }),
  ]);
}
