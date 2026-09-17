import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { fetchLayout, resolvePlan } from "@/lib/layout";

// Путь к JSON, который читает python-пайплайн в plan_v0 (работает только когда
// сайт запущен локально рядом с этой папкой — на деплое просто отдаём файл на скачивание).
const TARGET_PATH = resolve(process.cwd(), "../plan_v0/layout_coords.json");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const plan = await resolvePlan(body.planKey ?? null);
  const layout = await fetchLayout(plan.id);
  // На диск (для python-пайплайна) пишем только основной план V1 — варианты (V2, V3, ...)
  // не должны молча подменять файл, который читает Blender.
  const isMainPlan = plan.key === "V1";

  let existing: Record<string, unknown> = {};
  if (existsSync(TARGET_PATH)) {
    try {
      existing = JSON.parse(readFileSync(TARGET_PATH, "utf-8"));
    } catch {
      existing = {};
    }
  }

  const houses: Record<string, unknown> = {};
  for (const h of layout.houses) {
    houses[h.key] = {
      tl: [h.tlX, h.tlY],
      size: [h.sizeW, h.sizeH],
      kind: h.kind === "house" ? undefined : h.kind,
      render_scale: h.renderScale,
      render_offset: [h.renderOffsetX, h.renderOffsetY],
      rotation_deg: h.rotationDeg,
      asset: h.asset,
      label: h.label,
    };
    // убираем undefined-поля (kind у обычных домиков не пишем, как в исходном файле)
    Object.keys(houses[h.key] as object).forEach((k) => {
      if ((houses[h.key] as Record<string, unknown>)[k] === undefined) {
        delete (houses[h.key] as Record<string, unknown>)[k];
      }
    });
  }

  const rivers = layout.waterways
    .filter((w) => w.kind === "river")
    .map((w) => ({
      id: w.key,
      width_m: w.widthM,
      path: w.points.map((p) => [p.x, p.y]),
      label: w.label,
    }));
  const streams = layout.waterways
    .filter((w) => w.kind === "stream")
    .map((w) => ({
      id: w.key,
      width_m: w.widthM,
      path: w.points.map((p) => [p.x, p.y]),
      label: w.label,
    }));
  const ponds = layout.ponds.map((p) => ({
    id: p.key,
    path: p.points.map((pt) => [pt.x, pt.y]),
    label: p.label,
  }));
  const flags = layout.flagLines.map((f) => ({
    id: f.key,
    path: f.points.map((pt) => [pt.x, pt.y]),
    label: f.label,
  }));
  const paths = layout.paths
    .filter((p) => p.kind !== "road")
    .map((p) => ({
      id: p.key,
      width_m: p.widthM,
      path: p.points.map((pt) => [pt.x, pt.y]),
      label: p.label,
    }));
  const roads = layout.paths
    .filter((p) => p.kind === "road")
    .map((p) => ({
      id: p.key,
      width_m: p.widthM,
      path: p.points.map((pt) => [pt.x, pt.y]),
      label: p.label,
    }));

  const merged = {
    ...existing,
    meta: {
      ...((existing.meta as object) ?? {}),
      title: layout.meta.title,
      plot_w: layout.meta.plotW,
      plot_h: layout.meta.plotH,
      px_per_m: layout.meta.pxPerM,
    },
    roads,
    water: { rivers, streams, ponds },
    paths,
    flags,
    houses,
  };

  const text = JSON.stringify(merged, null, 2) + "\n";

  let wroteToDisk = false;
  if (isMainPlan) {
    try {
      writeFileSync(TARGET_PATH, text, "utf-8");
      wroteToDisk = true;
    } catch {
      wroteToDisk = false;
    }
  }

  return NextResponse.json({ wroteToDisk, path: TARGET_PATH, json: merged });
}
