// Импортирует текущий plan_v0/layout_coords.json в базу — стартовое состояние редактора.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const COORDS_PATH = resolve(__dirname, "../../plan_v0/layout_coords.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function main() {
  const raw = readFileSync(COORDS_PATH, "utf-8");
  const data: Json = JSON.parse(raw);

  // Сид всегда наполняет план V1 — остальные вкладки (V2, V3, ...) не трогаем.
  const plan = await prisma.plan.upsert({
    where: { key: "V1" },
    update: {},
    create: { key: "V1", title: data.meta?.title ?? "" },
  });
  const planId = plan.id;

  await prisma.waterwayPoint.deleteMany({ where: { waterway: { planId } } });
  await prisma.waterway.deleteMany({ where: { planId } });
  await prisma.pondPoint.deleteMany({ where: { pond: { planId } } });
  await prisma.pond.deleteMany({ where: { planId } });
  await prisma.flagPoint.deleteMany({ where: { flagLine: { planId } } });
  await prisma.flagLine.deleteMany({ where: { planId } });
  await prisma.house.deleteMany({ where: { planId } });
  await prisma.meta.deleteMany();

  await prisma.meta.create({
    data: {
      id: 1,
      title: data.meta.title,
      plotW: data.meta.plot_w,
      plotH: data.meta.plot_h,
      pxPerM: data.meta.px_per_m,
    },
  });

  for (const [key, house] of Object.entries<Json>(data.houses ?? {})) {
    await prisma.house.create({
      data: {
        planId,
        key,
        label: house.label ?? key,
        kind: house.kind ?? "house",
        asset: house.asset ?? "assets/house_glass_mirror.png",
        tlX: house.tl[0],
        tlY: house.tl[1],
        sizeW: house.size[0],
        sizeH: house.size[1],
        rotationDeg: house.rotation_deg ?? 0,
        renderScale: house.render_scale ?? 1,
        renderOffsetX: house.render_offset?.[0] ?? 0,
        renderOffsetY: house.render_offset?.[1] ?? 0,
      },
    });
  }

  const water = data.water ?? {};
  for (const river of water.rivers ?? []) {
    await prisma.waterway.create({
      data: {
        planId,
        key: river.id,
        kind: "river",
        label: river.label ?? river.id,
        widthM: river.width_m ?? 8,
        points: {
          create: river.path.map((p: number[], i: number) => ({
            orderIndex: i,
            x: p[0],
            y: p[1],
          })),
        },
      },
    });
  }
  for (const stream of water.streams ?? []) {
    await prisma.waterway.create({
      data: {
        planId,
        key: stream.id,
        kind: "stream",
        label: stream.label ?? stream.id,
        widthM: stream.width_m ?? 2,
        points: {
          create: stream.path.map((p: number[], i: number) => ({
            orderIndex: i,
            x: p[0],
            y: p[1],
          })),
        },
      },
    });
  }
  for (const pond of water.ponds ?? []) {
    const path: [number, number][] =
      pond.path ??
      (() => {
        const n = 12;
        const [cx, cy] = pond.center;
        const r = pond.radius_m ?? 8;
        return Array.from({ length: n }, (_, i) => {
          const angle = (i / n) * Math.PI * 2;
          return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as [
            number,
            number,
          ];
        });
      })();
    await prisma.pond.create({
      data: {
        planId,
        key: pond.id,
        label: pond.label ?? pond.id,
        points: {
          create: path.map((p, i) => ({ orderIndex: i, x: p[0], y: p[1] })),
        },
      },
    });
  }

  for (const flag of data.flags ?? []) {
    await prisma.flagLine.create({
      data: {
        planId,
        key: flag.id,
        label: flag.label ?? flag.id,
        points: {
          create: flag.path.map((p: number[], i: number) => ({
            orderIndex: i,
            x: p[0],
            y: p[1],
          })),
        },
      },
    });
  }

  const houseCount = await prisma.house.count();
  const waterwayCount = await prisma.waterway.count();
  const pondCount = await prisma.pond.count();
  const flagCount = await prisma.flagLine.count();
  console.log(
    `Импортировано: домиков=${houseCount}, водоёмов(рек/ручьёв)=${waterwayCount}, прудов=${pondCount}, линий флажков=${flagCount}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
