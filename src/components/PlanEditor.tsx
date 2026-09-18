"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import type {
  FlagLineDTO,
  HouseDTO,
  LayoutDTO,
  PathDTO,
  PlanSummary,
  PondDTO,
  WaterwayDTO,
} from "@/lib/types";
import { HOUSE_VARIANTS, SAUNA_VARIANTS } from "@/lib/types";

type Props = {
  initial: LayoutDTO;
  plans: PlanSummary[];
  activePlan: PlanSummary;
};

type Selection =
  | { kind: "house"; id: string }
  | { kind: "waterway"; id: string }
  | { kind: "pond"; id: string }
  | { kind: "path"; id: string }
  | { kind: "flag"; id: string }
  | null;

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

function jitterOffset(range: number) {
  return (Math.random() - 0.5) * range;
}

// Админский флаг ставится вручную в localStorage (isAdmin = "true") — без отдельной
// системы прав. useSyncExternalStore читает его безопасно (без SSR-рассинхронизации).
function subscribeIsAdmin(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getIsAdminSnapshot() {
  return localStorage.getItem("isAdmin") === "true";
}
function getIsAdminServerSnapshot() {
  return false;
}

const HOUSE_ASSET_META: Record<string, { label: string; dot: string }> = {
  "assets/house_glass_mirror.png": { label: "Барнхаус", dot: "bg-amber-400" },
  "assets/admin_building.png": {
    label: "Административное здание",
    dot: "bg-sky-400",
  },
  "assets/well_booth.png": { label: "Скважина", dot: "bg-cyan-400" },
  "assets/large_building.png": {
    label: "Большое здание",
    dot: "bg-orange-400",
  },
  "assets/salt_lick.png": { label: "Соляной столб", dot: "bg-lime-400" },
  ...Object.fromEntries(
    HOUSE_VARIANTS.map((v) => [
      v.value,
      { label: v.label, dot: "bg-amber-400" },
    ]),
  ),
  ...Object.fromEntries(
    SAUNA_VARIANTS.map((v) => [
      v.value,
      { label: v.label, dot: "bg-orange-300" },
    ]),
  ),
};

function houseMeta(h: HouseDTO) {
  return (
    HOUSE_ASSET_META[h.asset] ?? { label: "Постройка", dot: "bg-neutral-400" }
  );
}

// A1 (админ. здание) и B1 (большое здание) — единственные в своём роде, удалять их
// нельзя вообще никогда (даже с V1). Двигать/менять их можно — но только с V1,
// это уже решает общий планово-объектный isLocked.
const PERMANENT_HOUSE_KEYS = new Set(["A1", "B1"]);
function isPermanentHouse(h: HouseDTO) {
  return PERMANENT_HOUSE_KEYS.has(h.key);
}

// Порядок групп ключей в списке объектов: барнхаусы, потом остальные постройки по типу.
const HOUSE_KEY_PREFIX_ORDER = ["H", "A", "W", "B", "C"];
function sortHousesByKey(hs: HouseDTO[]) {
  return [...hs].sort((a, b) => {
    const [, prefixA, numA] = /^([A-Za-z]+)(\d+)$/.exec(a.key) ?? [
      ,
      a.key,
      "0",
    ];
    const [, prefixB, numB] = /^([A-Za-z]+)(\d+)$/.exec(b.key) ?? [
      ,
      b.key,
      "0",
    ];
    const orderA = HOUSE_KEY_PREFIX_ORDER.indexOf(prefixA);
    const orderB = HOUSE_KEY_PREFIX_ORDER.indexOf(prefixB);
    const rankA = orderA === -1 ? HOUSE_KEY_PREFIX_ORDER.length : orderA;
    const rankB = orderB === -1 ? HOUSE_KEY_PREFIX_ORDER.length : orderB;
    if (rankA !== rankB) return rankA - rankB;
    if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
    return Number(numA) - Number(numB);
  });
}

function ObjectListRow({
  active,
  dot,
  code,
  title,
  meta,
  onClick,
}: {
  active: boolean;
  dot: string;
  code: string;
  title: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        active
          ? "bg-neutral-700/70 ring-1 ring-amber-400/70"
          : "bg-neutral-800/50 hover:bg-neutral-800"
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="w-12 shrink-0 font-mono text-neutral-500">{code}</span>
      <span className="flex-1 truncate text-neutral-200">{title}</span>
      {meta && (
        <span className="shrink-0 font-mono text-[10px] text-neutral-500">
          {meta}
        </span>
      )}
    </button>
  );
}

export default function PlanEditor({ initial, plans, activePlan }: Props) {
  const router = useRouter();
  const [meta] = useState(initial.meta);
  const [houses, setHouses] = useState<HouseDTO[]>(initial.houses);
  const [waterways, setWaterways] = useState<WaterwayDTO[]>(initial.waterways);
  const [ponds, setPonds] = useState<PondDTO[]>(initial.ponds);
  const [paths, setPaths] = useState<PathDTO[]>(initial.paths);
  const [flagLines, setFlagLines] = useState<FlagLineDTO[]>(initial.flagLines);
  const [selection, setSelection] = useState<Selection>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [showDeletePlanConfirm, setShowDeletePlanConfirm] = useState(false);
  const [housePickerOpen, setHousePickerOpen] = useState(false);
  const [saunaPickerOpen, setSaunaPickerOpen] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const isAdmin = useSyncExternalStore(
    subscribeIsAdmin,
    getIsAdminSnapshot,
    getIsAdminServerSnapshot,
  );

  const planId = activePlan.id;

  // Общие объекты (река/ручьи/пруд/граница/A1/B1) физически принадлежат V1 и просто
  // подмешиваются во все планы — редактировать их можно только находясь на V1.
  // V1 — общий/эталонный план: без admin там нельзя редактировать вообще ничего
  // (только смотреть). V2, V3, ... редактирует кто угодно.
  const isV1 = activePlan.key === "V1";
  const canEditActivePlan = !isV1 || isAdmin;
  const isLocked = useCallback(
    (objPlanId: string) => objPlanId !== planId || !canEditActivePlan,
    [planId, canEditActivePlan],
  );

  function switchPlan(key: string) {
    router.push(`/?plan=${encodeURIComponent(key)}`);
  }

  async function addPlan() {
    setCreatingPlan(true);
    try {
      const res = await fetch("/api/plans", { method: "POST" });
      const plan: PlanSummary = await res.json();
      switchPlan(plan.key);
    } finally {
      setCreatingPlan(false);
    }
  }

  async function confirmDeletePlan() {
    if (activePlan.key === "V1") return;
    setDeletingPlan(true);
    try {
      await fetch(`/api/plans/${activePlan.id}`, { method: "DELETE" });
      setShowDeletePlanConfirm(false);
      switchPlan("V1");
    } finally {
      setDeletingPlan(false);
    }
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runExport = useCallback(async () => {
    await fetch("/api/export", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ planKey: activePlan.key }),
    });
  }, [activePlan.key]);

  const scheduleExport = useCallback(() => {
    if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    exportTimerRef.current = setTimeout(() => {
      exportTimerRef.current = null;
      runExport();
    }, 700);
  }, [runExport]);

  useEffect(() => {
    return () => {
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    };
  }, []);

  const worldToSvgY = useCallback((y: number) => meta.plotH - y, [meta.plotH]);

  function niceStep(range: number) {
    const rough = range / 8;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return step * mag;
  }

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // --- сохранение на сервер ---
  const patchHouse = useCallback(
    async (id: string, data: Partial<HouseDTO>) => {
      setPendingSaves((s) => s + 1);
      try {
        await fetch(`/api/houses/${id}`, {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(data),
        });
        scheduleExport();
      } finally {
        setPendingSaves((s) => s - 1);
      }
    },
    [scheduleExport],
  );

  const patchWaterway = useCallback(
    async (
      id: string,
      data: Partial<Pick<WaterwayDTO, "label" | "widthM">> & {
        points?: { x: number; y: number }[];
      },
    ) => {
      setPendingSaves((s) => s + 1);
      try {
        await fetch(`/api/waterways/${id}`, {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(data),
        });
        scheduleExport();
      } finally {
        setPendingSaves((s) => s - 1);
      }
    },
    [scheduleExport],
  );

  const patchPond = useCallback(
    async (
      id: string,
      data: Partial<Pick<PondDTO, "label">> & {
        points?: { x: number; y: number }[];
      },
    ) => {
      setPendingSaves((s) => s + 1);
      try {
        await fetch(`/api/ponds/${id}`, {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(data),
        });
        scheduleExport();
      } finally {
        setPendingSaves((s) => s - 1);
      }
    },
    [scheduleExport],
  );

  const patchPath = useCallback(
    async (
      id: string,
      data: Partial<Pick<PathDTO, "label" | "widthM">> & {
        points?: { x: number; y: number }[];
      },
    ) => {
      setPendingSaves((s) => s + 1);
      try {
        await fetch(`/api/paths/${id}`, {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(data),
        });
        scheduleExport();
      } finally {
        setPendingSaves((s) => s - 1);
      }
    },
    [scheduleExport],
  );

  const patchFlag = useCallback(
    async (
      id: string,
      data: Partial<Pick<FlagLineDTO, "label">> & {
        points?: { x: number; y: number }[];
      },
    ) => {
      setPendingSaves((s) => s + 1);
      try {
        await fetch(`/api/flags/${id}`, {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(data),
        });
        scheduleExport();
      } finally {
        setPendingSaves((s) => s - 1);
      }
    },
    [scheduleExport],
  );

  // --- обновление от других участников (поллинг, пока сами ничего не тащим) ---
  useEffect(() => {
    const t = setInterval(async () => {
      if (draggingRef.current) return;
      try {
        const res = await fetch(
          `/api/layout?plan=${encodeURIComponent(activePlan.key)}`,
          {
            cache: "no-store",
          },
        );
        if (!res.ok) return;
        const data: LayoutDTO = await res.json();
        setHouses(data.houses);
        setWaterways(data.waterways);
        setPonds(data.ponds);
        setPaths(data.paths);
        setFlagLines(data.flagLines);
      } catch {
        // тихо игнорируем — сеть могла моргнуть
      }
    }, 4000);
    return () => clearInterval(t);
  }, [activePlan.key]);

  // --- перетаскивание домика ---
  const startHouseDrag = useCallback(
    (e: React.PointerEvent, house: HouseDTO) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "house", id: house.id });
      if (isLocked(house.planId)) return;
      draggingRef.current = true;
      const start = toSvgPoint(e.clientX, e.clientY);
      const startTlX = house.tlX;
      const startTlY = house.tlY;

      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const dxWorld = p.x - start.x;
        const dyWorld = -(p.y - start.y);
        setHouses((hs) =>
          hs.map((h) =>
            h.id === house.id
              ? { ...h, tlX: startTlX + dxWorld, tlY: startTlY + dyWorld }
              : h,
          ),
        );
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const dxWorld = p.x - start.x;
        const dyWorld = -(p.y - start.y);
        patchHouse(house.id, {
          tlX: startTlX + dxWorld,
          tlY: startTlY + dyWorld,
        });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchHouse, isLocked],
  );

  // --- поворот домика ---
  const startRotateDrag = useCallback(
    (e: React.PointerEvent, house: HouseDTO) => {
      e.stopPropagation();
      e.preventDefault();
      if (isLocked(house.planId)) return;
      draggingRef.current = true;
      const centerSvg = {
        x: house.tlX + house.sizeW / 2,
        y: worldToSvgY(house.tlY - house.sizeH / 2),
      };
      function angleAt(clientX: number, clientY: number) {
        const p = toSvgPoint(clientX, clientY);
        const dx = p.x - centerSvg.x;
        const dy = p.y - centerSvg.y;
        return (Math.atan2(dx, -dy) * 180) / Math.PI;
      }
      function onMove(ev: PointerEvent) {
        const deg = angleAt(ev.clientX, ev.clientY);
        setHouses((hs) =>
          hs.map((h) => (h.id === house.id ? { ...h, rotationDeg: deg } : h)),
        );
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const deg = angleAt(ev.clientX, ev.clientY);
        patchHouse(house.id, { rotationDeg: deg });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, worldToSvgY, patchHouse, isLocked],
  );

  // --- перетаскивание реки/ручья целиком (все точки сразу) ---
  const startWaterwayDrag = useCallback(
    (e: React.PointerEvent, waterway: WaterwayDTO) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "waterway", id: waterway.id });
      if (isLocked(waterway.planId)) return;
      draggingRef.current = true;
      const original = waterway.points;
      const start = toSvgPoint(e.clientX, e.clientY);

      function apply(dxWorld: number, dyWorld: number) {
        setWaterways((ws) =>
          ws.map((w) =>
            w.id !== waterway.id
              ? w
              : {
                  ...w,
                  points: original.map((pt) => ({
                    ...pt,
                    x: pt.x + dxWorld,
                    y: pt.y + dyWorld,
                  })),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(p.x - start.x, -(p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const dxWorld = p.x - start.x;
        const dyWorld = -(p.y - start.y);
        const points = original.map((pt) => ({
          x: pt.x + dxWorld,
          y: pt.y + dyWorld,
        }));
        patchWaterway(waterway.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchWaterway, isLocked],
  );

  // --- перетаскивание точки реки/ручья ---
  const startPointDrag = useCallback(
    (e: React.PointerEvent, waterway: WaterwayDTO, pointId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "waterway", id: waterway.id });
      if (isLocked(waterway.planId)) return;
      draggingRef.current = true;
      const original = waterway.points;
      const start = toSvgPoint(e.clientX, e.clientY);
      const pt = original.find((p) => p.id === pointId)!;
      const startX = pt.x;
      const startY = pt.y;

      function apply(newX: number, newY: number) {
        setWaterways((ws) =>
          ws.map((w) =>
            w.id !== waterway.id
              ? w
              : {
                  ...w,
                  points: w.points.map((p) =>
                    p.id === pointId ? { ...p, x: newX, y: newY } : p,
                  ),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(startX + (p.x - start.x), startY - (p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const newX = startX + (p.x - start.x);
        const newY = startY - (p.y - start.y);
        const points = original.map((pp) =>
          pp.id === pointId ? { x: newX, y: newY } : { x: pp.x, y: pp.y },
        );
        patchWaterway(waterway.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchWaterway, isLocked],
  );

  // --- перетаскивание пруда целиком (все точки сразу) ---
  const startPondDrag = useCallback(
    (e: React.PointerEvent, pond: PondDTO) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "pond", id: pond.id });
      if (isLocked(pond.planId)) return;
      draggingRef.current = true;
      const original = pond.points;
      const start = toSvgPoint(e.clientX, e.clientY);

      function apply(dxWorld: number, dyWorld: number) {
        setPonds((ps) =>
          ps.map((p) =>
            p.id !== pond.id
              ? p
              : {
                  ...p,
                  points: original.map((pt) => ({
                    ...pt,
                    x: pt.x + dxWorld,
                    y: pt.y + dyWorld,
                  })),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(p.x - start.x, -(p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const dxWorld = p.x - start.x;
        const dyWorld = -(p.y - start.y);
        const points = original.map((pt) => ({
          x: pt.x + dxWorld,
          y: pt.y + dyWorld,
        }));
        patchPond(pond.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchPond, isLocked],
  );

  // --- перетаскивание одной точки пруда ---
  const startPondPointDrag = useCallback(
    (e: React.PointerEvent, pond: PondDTO, pointId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "pond", id: pond.id });
      if (isLocked(pond.planId)) return;
      draggingRef.current = true;
      const original = pond.points;
      const start = toSvgPoint(e.clientX, e.clientY);
      const pt = original.find((p) => p.id === pointId)!;
      const startX = pt.x;
      const startY = pt.y;

      function apply(newX: number, newY: number) {
        setPonds((ps) =>
          ps.map((p) =>
            p.id !== pond.id
              ? p
              : {
                  ...p,
                  points: p.points.map((pp) =>
                    pp.id === pointId ? { ...pp, x: newX, y: newY } : pp,
                  ),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(startX + (p.x - start.x), startY - (p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const newX = startX + (p.x - start.x);
        const newY = startY - (p.y - start.y);
        const points = original.map((pp) =>
          pp.id === pointId ? { x: newX, y: newY } : { x: pp.x, y: pp.y },
        );
        patchPond(pond.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchPond, isLocked],
  );

  // --- перетаскивание дорожки целиком (все точки сразу) ---
  const startPathDrag = useCallback(
    (e: React.PointerEvent, pathLine: PathDTO) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "path", id: pathLine.id });
      draggingRef.current = true;
      const original = pathLine.points;
      const start = toSvgPoint(e.clientX, e.clientY);

      function apply(dxWorld: number, dyWorld: number) {
        setPaths((ps) =>
          ps.map((p) =>
            p.id !== pathLine.id
              ? p
              : {
                  ...p,
                  points: original.map((pt) => ({
                    ...pt,
                    x: pt.x + dxWorld,
                    y: pt.y + dyWorld,
                  })),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(p.x - start.x, -(p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const dxWorld = p.x - start.x;
        const dyWorld = -(p.y - start.y);
        const points = original.map((pt) => ({
          x: pt.x + dxWorld,
          y: pt.y + dyWorld,
        }));
        patchPath(pathLine.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchPath],
  );

  // --- перетаскивание одной точки дорожки ---
  const startPathPointDrag = useCallback(
    (e: React.PointerEvent, pathLine: PathDTO, pointId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "path", id: pathLine.id });
      draggingRef.current = true;
      const original = pathLine.points;
      const start = toSvgPoint(e.clientX, e.clientY);
      const pt = original.find((p) => p.id === pointId)!;
      const startX = pt.x;
      const startY = pt.y;

      function apply(newX: number, newY: number) {
        setPaths((ps) =>
          ps.map((p) =>
            p.id !== pathLine.id
              ? p
              : {
                  ...p,
                  points: p.points.map((pp) =>
                    pp.id === pointId ? { ...pp, x: newX, y: newY } : pp,
                  ),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(startX + (p.x - start.x), startY - (p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const newX = startX + (p.x - start.x);
        const newY = startY - (p.y - start.y);
        const points = original.map((pp) =>
          pp.id === pointId ? { x: newX, y: newY } : { x: pp.x, y: pp.y },
        );
        patchPath(pathLine.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchPath],
  );

  // --- перетаскивание линии флажков целиком (все точки сразу) ---
  // линию флажков целиком двигать нельзя — только отдельные точки (форма границы)
  const startFlagDrag = useCallback(
    (e: React.PointerEvent, flagLine: FlagLineDTO) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "flag", id: flagLine.id });
    },
    [],
  );

  // --- перетаскивание одной точки линии флажков ---
  const startFlagPointDrag = useCallback(
    (e: React.PointerEvent, flagLine: FlagLineDTO, pointId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSelection({ kind: "flag", id: flagLine.id });
      if (isLocked(flagLine.planId)) return;
      draggingRef.current = true;
      const original = flagLine.points;
      const start = toSvgPoint(e.clientX, e.clientY);
      const pt = original.find((p) => p.id === pointId)!;
      const startX = pt.x;
      const startY = pt.y;

      function apply(newX: number, newY: number) {
        setFlagLines((fs) =>
          fs.map((f) =>
            f.id !== flagLine.id
              ? f
              : {
                  ...f,
                  points: f.points.map((pp) =>
                    pp.id === pointId ? { ...pp, x: newX, y: newY } : pp,
                  ),
                },
          ),
        );
      }
      function onMove(ev: PointerEvent) {
        const p = toSvgPoint(ev.clientX, ev.clientY);
        apply(startX + (p.x - start.x), startY - (p.y - start.y));
      }
      function onUp(ev: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        draggingRef.current = false;
        const p = toSvgPoint(ev.clientX, ev.clientY);
        const newX = startX + (p.x - start.x);
        const newY = startY - (p.y - start.y);
        const points = original.map((pp) =>
          pp.id === pointId ? { x: newX, y: newY } : { x: pp.x, y: pp.y },
        );
        patchFlag(flagLine.id, { points });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toSvgPoint, patchFlag, isLocked],
  );

  // --- добавление домика/постройки ---
  async function createHouse(
    label: string,
    asset: string,
    size: [number, number],
    keyPrefix?: string,
    tag?: string,
  ) {
    if (!canEditActivePlan) return;
    const jitter = jitterOffset(6);
    const tlX = meta.plotW / 2 - size[0] / 2 + jitter;
    const tlY = meta.plotH / 2 + size[1] / 2 + jitter;
    const res = await fetch("/api/houses", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        planId,
        label,
        asset,
        sizeW: size[0],
        sizeH: size[1],
        tlX,
        tlY,
        keyPrefix,
      }),
    });
    const created: HouseDTO = await res.json();
    const house = tag
      ? { ...created, label: `${created.key} - ${tag}` }
      : created;
    if (tag) patchHouse(house.id, { label: house.label });
    setHouses((hs) => [...hs, house]);
    setSelection({ kind: "house", id: house.id });
    scheduleExport();
  }

  async function addHouseVariant(assetValue: string) {
    const variant = HOUSE_VARIANTS.find((v) => v.value === assetValue);
    if (!variant) return;
    await createHouse(
      variant.tag,
      variant.value,
      variant.size,
      undefined,
      variant.tag,
    );
  }

  async function addSaunaVariant(assetValue: string) {
    const variant = SAUNA_VARIANTS.find((v) => v.value === assetValue);
    if (!variant) return;
    await createHouse(
      variant.tag,
      variant.value,
      variant.size,
      "S",
      variant.tag,
    );
  }

  async function addPillar() {
    await createHouse(
      "Соляной столб для животных",
      "assets/salt_lick.png",
      [2, 2],
      "C",
    );
  }

  async function deleteSelectedHouse() {
    if (selection?.kind !== "house") return;
    const id = selection.id;
    const house = houses.find((h) => h.id === id);
    if (house && (isLocked(house.planId) || isPermanentHouse(house))) return;
    await fetch(`/api/houses/${id}`, { method: "DELETE" });
    setHouses((hs) => hs.filter((h) => h.id !== id));
    setSelection(null);
    scheduleExport();
  }

  // --- добавление реки/ручья ---
  async function addWaterway(kind: "river" | "stream") {
    if (!canEditActivePlan) return;
    const jitter = (Math.random() - 0.5) * 20;
    const cx = meta.plotW / 2;
    const cy = meta.plotH / 2 + jitter;
    const half = 15;
    const res = await fetch("/api/waterways", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        planId,
        kind,
        points: [
          { x: cx - half, y: cy },
          { x: cx + half, y: cy },
        ],
      }),
    });
    const waterway: WaterwayDTO = await res.json();
    setWaterways((ws) => [...ws, waterway]);
    setSelection({ kind: "waterway", id: waterway.id });
    scheduleExport();
  }

  async function deleteSelectedWaterway() {
    if (selection?.kind !== "waterway") return;
    const id = selection.id;
    const waterway = waterways.find((w) => w.id === id);
    if (waterway && (isLocked(waterway.planId) || waterway.kind === "river"))
      return;
    await fetch(`/api/waterways/${id}`, { method: "DELETE" });
    setWaterways((ws) => ws.filter((w) => w.id !== id));
    setSelection(null);
    scheduleExport();
  }

  async function addWaterwayPoint() {
    if (selection?.kind !== "waterway") return;
    const id = selection.id;
    const wp = waterways.find((w) => w.id === id);
    if (!wp || wp.points.length === 0 || isLocked(wp.planId)) return;
    const last = wp.points[wp.points.length - 1];
    const prev = wp.points.length > 1 ? wp.points[wp.points.length - 2] : last;
    const dx = last.x - prev.x || 5;
    const dy = last.y - prev.y || 0;
    const newPoint = { x: last.x + dx, y: last.y + dy };
    const newPoints = [...wp.points.map((p) => ({ x: p.x, y: p.y })), newPoint];
    setWaterways((ws) =>
      ws.map((w) =>
        w.id !== id
          ? w
          : {
              ...w,
              points: [
                ...w.points,
                {
                  id: `tmp-${crypto.randomUUID()}`,
                  x: newPoint.x,
                  y: newPoint.y,
                  orderIndex: w.points.length,
                },
              ],
            },
      ),
    );
    await patchWaterway(id, { points: newPoints });
  }

  async function removeWaterwayPoint(pointId: string) {
    if (selection?.kind !== "waterway") return;
    const id = selection.id;
    const wp = waterways.find((w) => w.id === id);
    if (!wp || wp.points.length <= 2 || isLocked(wp.planId)) return;
    const newPoints = wp.points
      .filter((p) => p.id !== pointId)
      .map((p) => ({ x: p.x, y: p.y }));
    setWaterways((ws) =>
      ws.map((w) =>
        w.id !== id
          ? w
          : { ...w, points: w.points.filter((p) => p.id !== pointId) },
      ),
    );
    await patchWaterway(id, { points: newPoints });
  }

  // --- добавление пруда ---
  async function addPond() {
    if (!canEditActivePlan) return;
    const jitter = (Math.random() - 0.5) * 20;
    const res = await fetch("/api/ponds", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        planId,
        centerX: meta.plotW / 2 + jitter,
        centerY: meta.plotH / 2 + jitter,
        radiusM: 8,
        pointCount: 12,
      }),
    });
    const pond: PondDTO = await res.json();
    setPonds((ps) => [...ps, pond]);
    setSelection({ kind: "pond", id: pond.id });
    scheduleExport();
  }

  async function deleteSelectedPond() {
    if (selection?.kind !== "pond") return;
    const id = selection.id;
    const pond = ponds.find((p) => p.id === id);
    if (pond && isLocked(pond.planId)) return;
    await fetch(`/api/ponds/${id}`, { method: "DELETE" });
    setPonds((ps) => ps.filter((p) => p.id !== id));
    setSelection(null);
    scheduleExport();
  }

  // --- вставка точки на самом длинном ребре пруда ---
  async function addPondPoint() {
    if (selection?.kind !== "pond") return;
    const id = selection.id;
    const pd = ponds.find((p) => p.id === id);
    if (!pd || pd.points.length < 2 || isLocked(pd.planId)) return;
    const n = pd.points.length;
    let bestIdx = 0;
    let bestLen = -1;
    for (let i = 0; i < n; i++) {
      const a = pd.points[i];
      const b = pd.points[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > bestLen) {
        bestLen = len;
        bestIdx = i;
      }
    }
    const a = pd.points[bestIdx];
    const b = pd.points[(bestIdx + 1) % n];
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const newPoints = [
      ...pd.points.slice(0, bestIdx + 1).map((p) => ({ x: p.x, y: p.y })),
      midpoint,
      ...pd.points.slice(bestIdx + 1).map((p) => ({ x: p.x, y: p.y })),
    ];
    setPonds((ps) =>
      ps.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              points: [
                ...p.points.slice(0, bestIdx + 1),
                {
                  id: `tmp-${crypto.randomUUID()}`,
                  x: midpoint.x,
                  y: midpoint.y,
                  orderIndex: bestIdx + 1,
                },
                ...p.points.slice(bestIdx + 1),
              ],
            },
      ),
    );
    await patchPond(id, { points: newPoints });
  }

  async function removePondPoint(pointId: string) {
    if (selection?.kind !== "pond") return;
    const id = selection.id;
    const pd = ponds.find((p) => p.id === id);
    if (!pd || pd.points.length <= 3 || isLocked(pd.planId)) return;
    const newPoints = pd.points
      .filter((p) => p.id !== pointId)
      .map((p) => ({ x: p.x, y: p.y }));
    setPonds((ps) =>
      ps.map((p) =>
        p.id !== id
          ? p
          : { ...p, points: p.points.filter((pt) => pt.id !== pointId) },
      ),
    );
    await patchPond(id, { points: newPoints });
  }

  // --- добавление дорожки ---
  async function createPath(opts: {
    kind?: string;
    label?: string;
    widthM?: number;
    keyPrefix?: string;
  }) {
    if (!canEditActivePlan) return;
    const jitter = (Math.random() - 0.5) * 20;
    const cx = meta.plotW / 2;
    const cy = meta.plotH / 2 + jitter;
    const half = 15;
    const res = await fetch("/api/paths", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        planId,
        kind: opts.kind,
        label: opts.label,
        widthM: opts.widthM,
        keyPrefix: opts.keyPrefix,
        points: [
          { x: cx - half, y: cy },
          { x: cx + half, y: cy },
        ],
      }),
    });
    const pathLine: PathDTO = await res.json();
    setPaths((ps) => [...ps, pathLine]);
    setSelection({ kind: "path", id: pathLine.id });
    scheduleExport();
  }

  async function addPath() {
    await createPath({});
  }

  async function addRoad() {
    await createPath({
      kind: "road",
      label: "Дорога / парковка (щебень)",
      widthM: 3,
      keyPrefix: "R",
    });
  }

  async function deleteSelectedPath() {
    if (selection?.kind !== "path") return;
    const id = selection.id;
    await fetch(`/api/paths/${id}`, { method: "DELETE" });
    setPaths((ps) => ps.filter((p) => p.id !== id));
    setSelection(null);
    scheduleExport();
  }

  async function addPathPoint() {
    if (selection?.kind !== "path") return;
    const id = selection.id;
    const pl = paths.find((p) => p.id === id);
    if (!pl || pl.points.length === 0) return;
    const last = pl.points[pl.points.length - 1];
    const prev = pl.points.length > 1 ? pl.points[pl.points.length - 2] : last;
    const dx = last.x - prev.x || 5;
    const dy = last.y - prev.y || 0;
    const newPoint = { x: last.x + dx, y: last.y + dy };
    const newPoints = [...pl.points.map((p) => ({ x: p.x, y: p.y })), newPoint];
    setPaths((ps) =>
      ps.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              points: [
                ...p.points,
                {
                  id: `tmp-${crypto.randomUUID()}`,
                  x: newPoint.x,
                  y: newPoint.y,
                  orderIndex: p.points.length,
                },
              ],
            },
      ),
    );
    await patchPath(id, { points: newPoints });
  }

  async function removePathPoint(pointId: string) {
    if (selection?.kind !== "path") return;
    const id = selection.id;
    const pl = paths.find((p) => p.id === id);
    if (!pl || pl.points.length <= 2) return;
    const newPoints = pl.points
      .filter((p) => p.id !== pointId)
      .map((p) => ({ x: p.x, y: p.y }));
    setPaths((ps) =>
      ps.map((p) =>
        p.id !== id
          ? p
          : { ...p, points: p.points.filter((pt) => pt.id !== pointId) },
      ),
    );
    await patchPath(id, { points: newPoints });
  }

  // --- добавление линии флажков (граница территории) ---
  async function addFlagLine() {
    if (!canEditActivePlan) return;
    const res = await fetch("/api/flags", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ planId }),
    });
    const flagLine: FlagLineDTO = await res.json();
    setFlagLines((fs) => [...fs, flagLine]);
    setSelection({ kind: "flag", id: flagLine.id });
    scheduleExport();
  }

  async function deleteSelectedFlag() {
    if (selection?.kind !== "flag") return;
    const id = selection.id;
    const flag = flagLines.find((f) => f.id === id);
    if (flag && isLocked(flag.planId)) return;
    await fetch(`/api/flags/${id}`, { method: "DELETE" });
    setFlagLines((fs) => fs.filter((f) => f.id !== id));
    setSelection(null);
    scheduleExport();
  }

  async function addFlagPoint() {
    if (selection?.kind !== "flag") return;
    const id = selection.id;
    const fl = flagLines.find((f) => f.id === id);
    if (!fl || fl.points.length === 0 || isLocked(fl.planId)) return;
    const last = fl.points[fl.points.length - 1];
    const prev = fl.points.length > 1 ? fl.points[fl.points.length - 2] : last;
    const dx = last.x - prev.x || 10;
    const dy = last.y - prev.y || 0;
    const newPoint = { x: last.x + dx, y: last.y + dy };
    const newPoints = [...fl.points.map((p) => ({ x: p.x, y: p.y })), newPoint];
    setFlagLines((fs) =>
      fs.map((f) =>
        f.id !== id
          ? f
          : {
              ...f,
              points: [
                ...f.points,
                {
                  id: `tmp-${crypto.randomUUID()}`,
                  x: newPoint.x,
                  y: newPoint.y,
                  orderIndex: f.points.length,
                },
              ],
            },
      ),
    );
    await patchFlag(id, { points: newPoints });
  }

  async function removeFlagPoint(pointId: string) {
    if (selection?.kind !== "flag") return;
    const id = selection.id;
    const fl = flagLines.find((f) => f.id === id);
    if (!fl || fl.points.length <= 2 || isLocked(fl.planId)) return;
    const newPoints = fl.points
      .filter((p) => p.id !== pointId)
      .map((p) => ({ x: p.x, y: p.y }));
    setFlagLines((fs) =>
      fs.map((f) =>
        f.id !== id
          ? f
          : { ...f, points: f.points.filter((pt) => pt.id !== pointId) },
      ),
    );
    await patchFlag(id, { points: newPoints });
  }

  async function updateHouseField(
    field: keyof HouseDTO,
    value: string | number,
  ) {
    if (selection?.kind !== "house") return;
    const id = selection.id;
    const house = houses.find((h) => h.id === id);
    if (house && isLocked(house.planId)) return;
    if (
      house &&
      isPermanentHouse(house) &&
      !isAdmin &&
      (field === "tlX" || field === "tlY" || field === "rotationDeg")
    )
      return;
    setHouses((hs) =>
      hs.map((h) => (h.id === id ? { ...h, [field]: value } : h)),
    );
    await patchHouse(id, { [field]: value } as Partial<HouseDTO>);
  }

  async function updateWaterwayField(
    field: "label" | "widthM",
    value: string | number,
  ) {
    if (selection?.kind !== "waterway") return;
    const id = selection.id;
    const waterway = waterways.find((w) => w.id === id);
    if (waterway && isLocked(waterway.planId)) return;
    setWaterways((ws) =>
      ws.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    );
    await patchWaterway(id, { [field]: value } as Partial<
      Pick<WaterwayDTO, "label" | "widthM">
    >);
  }

  async function updatePondLabel(value: string) {
    if (selection?.kind !== "pond") return;
    const id = selection.id;
    const pond = ponds.find((p) => p.id === id);
    if (pond && isLocked(pond.planId)) return;
    setPonds((ps) => ps.map((p) => (p.id === id ? { ...p, label: value } : p)));
    await patchPond(id, { label: value });
  }

  async function updatePathField(
    field: "label" | "widthM",
    value: string | number,
  ) {
    if (selection?.kind !== "path") return;
    const id = selection.id;
    setPaths((ps) =>
      ps.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
    await patchPath(id, { [field]: value } as Partial<
      Pick<PathDTO, "label" | "widthM">
    >);
  }

  async function updateFlagLabel(value: string) {
    if (selection?.kind !== "flag") return;
    const id = selection.id;
    const flag = flagLines.find((f) => f.id === id);
    if (flag && isLocked(flag.planId)) return;
    setFlagLines((fs) =>
      fs.map((f) => (f.id === id ? { ...f, label: value } : f)),
    );
    await patchFlag(id, { label: value });
  }

  function houseDescription(h: HouseDTO): string {
    switch (h.asset) {
      case "assets/house_glass_mirror.png":
        return "Гостевой домик-барнхаус для отдыха с палубой/террасой. Рядом костровая/мангальная зона с открытым очагом, джакузи, столик со стульями. Тёплая вечерняя подсветка в чёрно-оранжевой гамме.";
      case "assets/admin_building.png":
        return "Административное здание — рабочее помещение для персонала и сотрудников хутора.";
      case "assets/large_building.png":
        return "Техническое здание общего назначения — ресторан/зал для гостей.";
      case "assets/well_booth.png":
        return "Будка артезианской скважины — техническое сооружение системы водоснабжения.";
      case "assets/salt_lick.png":
        return "Соляной столб для животных — деревянный столб с минеральным (соляным) блоком на верхушке.";
      default:
        return "Постройка на участке.";
    }
  }

  function buildExportPayload() {
    const houseObj: Record<string, unknown> = {};
    for (const h of houses) {
      houseObj[h.key] = {
        tl: [h.tlX, h.tlY],
        size: [h.sizeW, h.sizeH],
        render_scale: h.renderScale,
        render_offset: [h.renderOffsetX, h.renderOffsetY],
        rotation_deg: h.rotationDeg,
        asset: h.asset,
        label: h.label,
        description: houseDescription(h),
      };
    }
    return {
      meta: {
        title: meta.title,
        plot_w: meta.plotW,
        plot_h: meta.plotH,
        px_per_m: meta.pxPerM,
      },
      scene: {
        style:
          "Тёплая атмосфера хутора в стиле барнхаус: гостевые домики с открытыми костровыми/мангальными зонами и джакузи, тёплая чёрно-оранжевая подсветка в вечернее время.",
        background:
          "Всё пространство участка, не занятое объектами (домиками, дорогами, прудами, рекой и т.д.), покрыто лесом.",
        coordinates: `Координаты x,y всех объектов — в метрах, ось Y направлена вверх. Размер участка ${meta.plotW}×${meta.plotH} м (см. meta.plot_w/plot_h) — используйте это как масштаб и привязку объектов друг к другу при генерации изображения.`,
      },
      water: {
        rivers: waterways
          .filter((w) => w.kind === "river")
          .map((w) => ({
            id: w.key,
            width_m: w.widthM,
            path: w.points.map((p) => [p.x, p.y]),
            label: w.label,
            description: "Река, протекающая через территорию участка.",
          })),
        streams: waterways
          .filter((w) => w.kind === "stream")
          .map((w) => ({
            id: w.key,
            width_m: w.widthM,
            path: w.points.map((p) => [p.x, p.y]),
            label: w.label,
            description: "Ручей, впадающий в реку или пруд.",
          })),
        ponds: ponds.map((p) => ({
          id: p.key,
          path: p.points.map((pt) => [pt.x, pt.y]),
          label: p.label,
          description: "Пруд с водой — декоративный элемент ландшафта.",
        })),
      },
      paths: paths
        .filter((p) => p.kind !== "road")
        .map((p) => ({
          id: p.key,
          width_m: p.widthM,
          path: p.points.map((pt) => [pt.x, pt.y]),
          label: p.label,
          description:
            "Пешеходная дощатая дорожка (настил), соединяющая домики и зоны отдыха.",
        })),
      roads: paths
        .filter((p) => p.kind === "road")
        .map((p) => ({
          id: p.key,
          width_m: p.widthM,
          path: p.points.map((pt) => [pt.x, pt.y]),
          label: p.label,
          description:
            "Гравийная дорога/парковка для автомобилей, покрытие — щебень.",
        })),
      flags: flagLines.map((f) => ({
        id: f.key,
        path: f.points.map((pt) => [pt.x, pt.y]),
        label: f.label,
        description: "Линия флажков — обозначает границу территории участка.",
      })),
      houses: houseObj,
    };
  }

  async function copyJson() {
    const text = JSON.stringify(buildExportPayload(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  const selectedHouse =
    selection?.kind === "house"
      ? (houses.find((h) => h.id === selection.id) ?? null)
      : null;
  const selectedWaterway =
    selection?.kind === "waterway"
      ? (waterways.find((w) => w.id === selection.id) ?? null)
      : null;
  const selectedPond =
    selection?.kind === "pond"
      ? (ponds.find((p) => p.id === selection.id) ?? null)
      : null;
  const selectedPath =
    selection?.kind === "path"
      ? (paths.find((p) => p.id === selection.id) ?? null)
      : null;
  const selectedFlag =
    selection?.kind === "flag"
      ? (flagLines.find((f) => f.id === selection.id) ?? null)
      : null;

  function renderWaterway(w: WaterwayDTO) {
    const isWSel = selection?.kind === "waterway" && selection.id === w.id;
    return (
      <g key={w.id}>
        {isWSel && (
          <polyline
            points={w.points.map((p) => `${p.x},${worldToSvgY(p.y)}`).join(" ")}
            fill="none"
            stroke="#ffd23c"
            strokeOpacity={0.6}
            strokeWidth={w.widthM + 1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        {/* широкая невидимая полоса — цепляем реку/ручей целиком, даже если widthM маленький */}
        <polyline
          points={w.points.map((p) => `${p.x},${worldToSvgY(p.y)}`).join(" ")}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(w.widthM, 3)}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => startWaterwayDrag(e, w)}
        />
        <polyline
          points={w.points.map((p) => `${p.x},${worldToSvgY(p.y)}`).join(" ")}
          fill="none"
          stroke="#237aab"
          strokeOpacity={0.55}
          strokeWidth={w.widthM}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
        <polyline
          points={w.points.map((p) => `${p.x},${worldToSvgY(p.y)}`).join(" ")}
          fill="none"
          stroke="#7fc3dd"
          strokeOpacity={0.5}
          strokeWidth={Math.max(0.3, w.widthM * 0.25)}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
        {isWSel &&
          w.points.map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={worldToSvgY(p.y)}
              r={1.4}
              fill="#dff3ff"
              stroke="#1a5c80"
              strokeWidth={0.3}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => startPointDrag(e, w, p.id)}
            />
          ))}
      </g>
    );
  }

  function renderPond(p: PondDTO) {
    const isPSel = selection?.kind === "pond" && selection.id === p.id;
    const polyPoints = p.points
      .map((pt) => `${pt.x},${worldToSvgY(pt.y)}`)
      .join(" ");
    return (
      <g key={p.id}>
        <polygon
          points={polyPoints}
          fill="#1e5a8a"
          fillOpacity={0.7}
          stroke={isPSel ? "#ffd23c" : "#7fc3dd"}
          strokeWidth={isPSel ? 0.6 : 0.3}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => startPondDrag(e, p)}
        />
        {isPSel &&
          p.points.map((pt) => (
            <circle
              key={pt.id}
              cx={pt.x}
              cy={worldToSvgY(pt.y)}
              r={1.2}
              fill="#dff3ff"
              stroke="#1a5c80"
              strokeWidth={0.3}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => startPondPointDrag(e, p, pt.id)}
            />
          ))}
      </g>
    );
  }

  function renderPath(pl: PathDTO) {
    const isSel = selection?.kind === "path" && selection.id === pl.id;
    const isRoad = pl.kind === "road";
    const linePoints = pl.points
      .map((p) => `${p.x},${worldToSvgY(p.y)}`)
      .join(" ");
    return (
      <g key={pl.id}>
        {/* широкая невидимая полоса — цепляем всю дорожку целиком */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(pl.widthM, 3)}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => startPathDrag(e, pl)}
        />
        {isRoad ? (
          <>
            {/* тёмная кромка щебёночной насыпи */}
            <polyline
              points={linePoints}
              fill="none"
              stroke="#3f3a33"
              strokeOpacity={0.6}
              strokeWidth={pl.widthM + 0.35}
              strokeLinecap="butt"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {/* полотно дороги — щебёночная текстура */}
            <polyline
              points={linePoints}
              fill="none"
              stroke="url(#gravel-tex)"
              strokeWidth={pl.widthM}
              strokeLinecap="butt"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {isSel && (
              <polyline
                points={linePoints}
                fill="none"
                stroke="#ffd23c"
                strokeOpacity={0.55}
                strokeWidth={pl.widthM}
                strokeLinecap="butt"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
          </>
        ) : (
          <>
            {/* полотно дорожки по ширине */}
            <polyline
              points={linePoints}
              fill="none"
              stroke={isSel ? "#ffd23c" : "#c9a227"}
              strokeOpacity={isSel ? 0.35 : 0.22}
              strokeWidth={pl.widthM}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {/* штрих-пунктирная ось */}
            <polyline
              points={linePoints}
              fill="none"
              stroke={isSel ? "#ffd23c" : "#e6c32d"}
              strokeOpacity={isSel ? 1 : 0.75}
              strokeWidth={isSel ? 0.5 : 0.3}
              strokeDasharray="1.4 1.2"
              strokeLinecap="round"
              pointerEvents="none"
            />
          </>
        )}
        {isSel &&
          pl.points.map((pt) => (
            <circle
              key={pt.id}
              cx={pt.x}
              cy={worldToSvgY(pt.y)}
              r={1.2}
              fill="#fff3d0"
              stroke="#7a5a00"
              strokeWidth={0.3}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => startPathPointDrag(e, pl, pt.id)}
            />
          ))}
      </g>
    );
  }

  function renderFlagLine(f: FlagLineDTO) {
    const isFSel = selection?.kind === "flag" && selection.id === f.id;
    const linePoints = f.points
      .map((p) => `${p.x},${worldToSvgY(p.y)}`)
      .join(" ");
    return (
      <g key={f.id}>
        {/* широкая невидимая полоса — цепляем линию флажков целиком */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="transparent"
          strokeWidth={3}
          strokeLinecap="round"
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => startFlagDrag(e, f)}
        />
        <polyline
          points={linePoints}
          fill="none"
          stroke={isFSel ? "#ffd23c" : "#e2432c"}
          strokeOpacity={isFSel ? 0.9 : 0.55}
          strokeWidth={isFSel ? 0.5 : 0.3}
          strokeDasharray="2 1.5"
          pointerEvents="none"
        />
        {f.points.map((p) => {
          const sx = p.x;
          const sy = worldToSvgY(p.y);
          return (
            <g key={p.id} pointerEvents={isFSel ? "auto" : "none"}>
              <line
                x1={sx}
                y1={sy}
                x2={sx}
                y2={sy - 4}
                stroke="#8a2f22"
                strokeWidth={0.3}
              />
              <polygon
                points={`${sx},${sy - 4} ${sx + 3},${sy - 3.3} ${sx},${sy - 2.6}`}
                fill={isFSel ? "#ffd23c" : "#e2432c"}
                stroke="#7a2015"
                strokeWidth={0.2}
                className={
                  isFSel ? "cursor-grab active:cursor-grabbing" : undefined
                }
                onPointerDown={
                  isFSel ? (e) => startFlagPointDrag(e, f, p.id) : undefined
                }
              />
            </g>
          );
        })}
      </g>
    );
  }

  function renderHouse(h: HouseDTO) {
    const svgLeft = h.tlX;
    const svgTop = worldToSvgY(h.tlY);
    const cx = svgLeft + h.sizeW / 2;
    const cy = svgTop + h.sizeH / 2;
    const isSel = selection?.kind === "house" && selection.id === h.id;
    return (
      <g key={h.id}>
        <g transform={`rotate(${h.rotationDeg} ${cx} ${cy})`}>
          <image
            href={`/${h.asset}`}
            x={svgLeft}
            y={svgTop}
            width={h.sizeW}
            height={h.sizeH}
            preserveAspectRatio="xMidYMid slice"
            className="cursor-grab active:cursor-grabbing"
            data-role="house-image"
            data-key={h.key}
            onPointerDown={(e) => startHouseDrag(e, h)}
          />
          {isSel && (
            <rect
              x={svgLeft}
              y={svgTop}
              width={h.sizeW}
              height={h.sizeH}
              fill="none"
              stroke="#ffd23c"
              strokeOpacity={0.9}
              strokeWidth={0.35}
              pointerEvents="none"
            />
          )}
        </g>
        {isSel && !isLocked(h.planId) && !(isPermanentHouse(h) && !isAdmin) && (
          <>
            <line
              x1={cx}
              y1={cy - h.sizeH / 2}
              x2={
                cx +
                (h.sizeH / 2 + 2) * Math.sin((h.rotationDeg * Math.PI) / 180)
              }
              y2={
                cy -
                (h.sizeH / 2 + 2) * Math.cos((h.rotationDeg * Math.PI) / 180)
              }
              stroke="#ffd23c"
              strokeWidth={0.25}
            />
            <circle
              cx={
                cx +
                (h.sizeH / 2 + 2) * Math.sin((h.rotationDeg * Math.PI) / 180)
              }
              cy={
                cy -
                (h.sizeH / 2 + 2) * Math.cos((h.rotationDeg * Math.PI) / 180)
              }
              r={1.3}
              fill="#ffd23c"
              stroke="#7a5a00"
              strokeWidth={0.25}
              className="cursor-alias"
              onPointerDown={(e) => startRotateDrag(e, h)}
            />
          </>
        )}
        <text
          x={cx}
          y={svgTop - 1}
          fill="#e8e8e8"
          fontSize={2.6}
          textAnchor="middle"
          pointerEvents="none"
        >
          {h.key}
        </text>
      </g>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0b0d0b] text-neutral-200">
      <div className="flex shrink-0 items-center gap-1 border-b border-neutral-800 bg-[#111311] px-3 py-2">
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => switchPlan(p.key)}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              p.id === activePlan.id
                ? "bg-neutral-700 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
          >
            {p.key}
          </button>
        ))}
        <button
          onClick={addPlan}
          disabled={creatingPlan}
          title="Новый план (копирует реку, пруд, ручьи, границу, A1 и B1)"
          className="rounded px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
        >
          {creatingPlan ? "…" : "+"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${meta.plotW} ${meta.plotH}`}
            className="h-full w-full select-none touch-none"
            onPointerDown={() => setSelection(null)}
          >
            <defs>
              <pattern
                id="gravel-tex"
                width={1.4}
                height={1.4}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(21)"
              >
                <rect width={1.4} height={1.4} fill="#8e857a" />
                <circle cx={0.28} cy={0.32} r={0.22} fill="#b0a695" />
                <circle cx={1.02} cy={0.5} r={0.16} fill="#5f5850" />
                <circle cx={0.62} cy={1.08} r={0.2} fill="#c4baa8" />
                <circle cx={1.22} cy={1.18} r={0.14} fill="#4f493f" />
                <circle cx={0.12} cy={1.02} r={0.12} fill="#797063" />
                <circle cx={0.85} cy={0.95} r={0.1} fill="#96897a" />
                <circle cx={1.3} cy={0.15} r={0.1} fill="#6b6255" />
              </pattern>
            </defs>
            <image
              href="/field_base.png"
              x={0}
              y={0}
              width={meta.plotW}
              height={meta.plotH}
              preserveAspectRatio="none"
            />

            {/* оси XY со шкалами */}
            {(() => {
              const stepX = niceStep(meta.plotW);
              const stepY = niceStep(meta.plotH);
              const ticksX: number[] = [];
              for (let x = 0; x <= meta.plotW + 1e-6; x += stepX)
                ticksX.push(Math.round(x * 100) / 100);
              const ticksY: number[] = [];
              for (let y = 0; y <= meta.plotH + 1e-6; y += stepY)
                ticksY.push(Math.round(y * 100) / 100);
              const fontSize = Math.max(
                2,
                Math.min(meta.plotW, meta.plotH) * 0.015,
              );
              const tickLen = fontSize * 0.8;
              const axisColor = "#ffd23c";
              return (
                <g pointerEvents="none">
                  {ticksX.map((x) => (
                    <line
                      key={`gx-${x}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={meta.plotH}
                      stroke="#ffffff"
                      strokeOpacity={0.06}
                      strokeWidth={0.15}
                    />
                  ))}
                  {ticksY.map((y) => (
                    <line
                      key={`gy-${y}`}
                      x1={0}
                      y1={worldToSvgY(y)}
                      x2={meta.plotW}
                      y2={worldToSvgY(y)}
                      stroke="#ffffff"
                      strokeOpacity={0.06}
                      strokeWidth={0.15}
                    />
                  ))}
                  <line
                    x1={0}
                    y1={meta.plotH}
                    x2={meta.plotW}
                    y2={meta.plotH}
                    stroke={axisColor}
                    strokeOpacity={0.8}
                    strokeWidth={0.3}
                  />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={meta.plotH}
                    stroke={axisColor}
                    strokeOpacity={0.8}
                    strokeWidth={0.3}
                  />
                  {ticksX.map((x) => (
                    <g key={`tx-${x}`}>
                      <line
                        x1={x}
                        y1={meta.plotH}
                        x2={x}
                        y2={meta.plotH - tickLen}
                        stroke={axisColor}
                        strokeOpacity={0.8}
                        strokeWidth={0.25}
                      />
                      <text
                        x={x}
                        y={meta.plotH - tickLen - 0.8}
                        fontSize={fontSize}
                        fill="#e8e8e8"
                        textAnchor="middle"
                      >
                        {x}
                      </text>
                    </g>
                  ))}
                  {ticksY.map((y) => (
                    <g key={`ty-${y}`}>
                      <line
                        x1={0}
                        y1={worldToSvgY(y)}
                        x2={tickLen}
                        y2={worldToSvgY(y)}
                        stroke={axisColor}
                        strokeOpacity={0.8}
                        strokeWidth={0.25}
                      />
                      <text
                        x={tickLen + 0.8}
                        y={worldToSvgY(y) + fontSize * 0.35}
                        fontSize={fontSize}
                        fill="#e8e8e8"
                        textAnchor="start"
                      >
                        {y}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })()}

            {/* реки/ручьи, пруды, домики, флажки — невыделенные (порядок как есть) */}
            {waterways
              .filter(
                (w) =>
                  !(selection?.kind === "waterway" && selection.id === w.id),
              )
              .map(renderWaterway)}
            {ponds
              .filter(
                (p) => !(selection?.kind === "pond" && selection.id === p.id),
              )
              .map(renderPond)}
            {paths
              .filter(
                (p) => !(selection?.kind === "path" && selection.id === p.id),
              )
              .map(renderPath)}
            {houses
              .filter(
                (h) => !(selection?.kind === "house" && selection.id === h.id),
              )
              .map(renderHouse)}
            {flagLines
              .filter(
                (f) => !(selection?.kind === "flag" && selection.id === f.id),
              )
              .map(renderFlagLine)}

            {/* выделенный объект — всегда поверх всех остальных, чтобы его точки/ручки были доступны */}
            {selectedWaterway && renderWaterway(selectedWaterway)}
            {selectedPond && renderPond(selectedPond)}
            {selectedPath && renderPath(selectedPath)}
            {selectedHouse && renderHouse(selectedHouse)}
            {selectedFlag && renderFlagLine(selectedFlag)}
          </svg>

          <div className="absolute top-3 left-3 rounded bg-black/60 px-3 py-1.5 text-xs text-neutral-300 backdrop-blur">
            {meta.title} · {meta.plotW}×{meta.plotH} м
            {pendingSaves > 0 && (
              <span className="ml-2 text-amber-400">сохранение…</span>
            )}
            {pendingSaves === 0 && (
              <span className="ml-2 text-emerald-400">сохранено</span>
            )}
          </div>
        </div>

        <aside className="w-80 shrink-0 border-l border-neutral-800 bg-[#111311] p-4 overflow-y-auto">
          {selectedHouse &&
            (() => {
              const locked = isLocked(selectedHouse.planId);
              const permanent = isPermanentHouse(selectedHouse);
              return (
                <section className="mb-4 rounded border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-2">
                    {houseMeta(selectedHouse).label}: {selectedHouse.key}
                  </div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Название
                  </label>
                  <input
                    value={selectedHouse.label}
                    onChange={(e) => updateHouseField("label", e.target.value)}
                    disabled={locked}
                    className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                  />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        Ширина, м
                      </label>
                      <input
                        type="number"
                        value={selectedHouse.sizeW}
                        onChange={(e) =>
                          updateHouseField("sizeW", Number(e.target.value))
                        }
                        disabled={locked}
                        className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        Глубина, м
                      </label>
                      <input
                        type="number"
                        value={selectedHouse.sizeH}
                        onChange={(e) =>
                          updateHouseField("sizeH", Number(e.target.value))
                        }
                        disabled={locked}
                        className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-neutral-400 mb-1">
                      Поворот, °
                    </label>
                    <input
                      type="number"
                      value={Math.round(selectedHouse.rotationDeg)}
                      onChange={(e) =>
                        updateHouseField("rotationDeg", Number(e.target.value))
                      }
                      disabled={locked}
                      className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        X, м
                      </label>
                      <input
                        type="number"
                        value={selectedHouse.tlX}
                        onChange={(e) =>
                          updateHouseField("tlX", Number(e.target.value))
                        }
                        disabled={locked}
                        className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        Y, м
                      </label>
                      <input
                        type="number"
                        value={selectedHouse.tlY}
                        onChange={(e) =>
                          updateHouseField("tlY", Number(e.target.value))
                        }
                        disabled={locked}
                        className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      />
                    </div>
                  </div>
                  {locked ? (
                    <p className="text-center text-xs text-neutral-600">
                      Общий объект — редактируется только на вкладке V1
                    </p>
                  ) : permanent ? (
                    <p className="text-center text-xs text-neutral-600">
                      Этот объект нельзя удалить
                    </p>
                  ) : (
                    <button
                      onClick={deleteSelectedHouse}
                      className="w-full rounded bg-red-900/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900"
                    >
                      Удалить {houseMeta(selectedHouse).label.toLowerCase()}
                    </button>
                  )}
                </section>
              );
            })()}

          {selectedWaterway &&
            (() => {
              const locked = isLocked(selectedWaterway.planId);
              const permanent = selectedWaterway.kind === "river";
              return (
                <section className="mb-4 rounded border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-2">
                    {selectedWaterway.kind === "river" ? "Река" : "Ручей"}:{" "}
                    {selectedWaterway.key}
                  </div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Название
                  </label>
                  <input
                    value={selectedWaterway.label}
                    onChange={(e) =>
                      updateWaterwayField("label", e.target.value)
                    }
                    disabled={locked}
                    className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                  />
                  <label className="block text-xs text-neutral-400 mb-1">
                    Ширина, м
                  </label>
                  <input
                    type="number"
                    value={selectedWaterway.widthM}
                    onChange={(e) =>
                      updateWaterwayField("widthM", Number(e.target.value))
                    }
                    disabled={locked}
                    className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                  />
                  <label className="block text-xs text-neutral-400 mb-1">
                    Точки ({selectedWaterway.points.length}) — тащите их прямо
                    на карте
                  </label>
                  <div className="mb-2 space-y-1">
                    {selectedWaterway.points.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 text-xs text-neutral-400"
                      >
                        <span className="w-4 shrink-0 text-neutral-500">
                          {i + 1}
                        </span>
                        <span className="flex-1 tabular-nums">
                          ({p.x.toFixed(1)}, {p.y.toFixed(1)})
                        </span>
                        <button
                          onClick={() => removeWaterwayPoint(p.id)}
                          disabled={
                            locked || selectedWaterway.points.length <= 2
                          }
                          className="rounded px-1.5 py-0.5 text-red-300 hover:bg-red-900/60 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Удалить точку"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addWaterwayPoint}
                    disabled={locked}
                    className="mb-2 w-full rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                  >
                    + Добавить точку
                  </button>
                  {locked ? (
                    <p className="text-center text-xs text-neutral-600">
                      Общий объект — редактируется только на вкладке V1
                    </p>
                  ) : permanent ? (
                    <p className="text-center text-xs text-neutral-600">
                      Этот объект нельзя удалить
                    </p>
                  ) : (
                    <button
                      onClick={deleteSelectedWaterway}
                      className="w-full rounded bg-red-900/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900"
                    >
                      Удалить ручей
                    </button>
                  )}
                </section>
              );
            })()}

          {selectedPond &&
            (() => {
              const locked = isLocked(selectedPond.planId);
              return (
                <section className="mb-4 rounded border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-2">
                    Пруд: {selectedPond.key}
                  </div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Название
                  </label>
                  <input
                    value={selectedPond.label}
                    onChange={(e) => updatePondLabel(e.target.value)}
                    disabled={locked}
                    className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                  />
                  <label className="block text-xs text-neutral-400 mb-1">
                    Точки ({selectedPond.points.length}) — тащите их прямо на
                    карте
                  </label>
                  <div className="mb-2 space-y-1">
                    {selectedPond.points.map((pt, i) => (
                      <div
                        key={pt.id}
                        className="flex items-center gap-2 text-xs text-neutral-400"
                      >
                        <span className="w-4 shrink-0 text-neutral-500">
                          {i + 1}
                        </span>
                        <span className="flex-1 tabular-nums">
                          ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
                        </span>
                        <button
                          onClick={() => removePondPoint(pt.id)}
                          disabled={locked || selectedPond.points.length <= 3}
                          className="rounded px-1.5 py-0.5 text-red-300 hover:bg-red-900/60 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Удалить точку"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addPondPoint}
                    disabled={locked}
                    className="mb-2 w-full rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                  >
                    + Добавить точку
                  </button>
                  {locked ? (
                    <p className="text-center text-xs text-neutral-600">
                      Общий объект — редактируется только на вкладке V1
                    </p>
                  ) : (
                    <button
                      onClick={deleteSelectedPond}
                      className="w-full rounded bg-red-900/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900"
                    >
                      Удалить пруд
                    </button>
                  )}
                </section>
              );
            })()}

          {selectedPath && (
            <section className="mb-4 rounded border border-neutral-800 p-3">
              <div className="text-xs text-neutral-400 mb-2">
                {selectedPath.kind === "road" ? "Дорога/парковка" : "Дорожка"}:{" "}
                {selectedPath.key}
              </div>
              <label className="block text-xs text-neutral-400 mb-1">
                Название
              </label>
              <input
                value={selectedPath.label}
                onChange={(e) => updatePathField("label", e.target.value)}
                className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              />
              <label className="block text-xs text-neutral-400 mb-1">
                Ширина, м
              </label>
              <input
                type="number"
                value={selectedPath.widthM}
                onChange={(e) =>
                  updatePathField("widthM", Number(e.target.value))
                }
                className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              />
              <label className="block text-xs text-neutral-400 mb-1">
                Точки ({selectedPath.points.length}) — тащите их прямо на карте
              </label>
              <div className="mb-2 space-y-1">
                {selectedPath.points.map((pt, i) => (
                  <div
                    key={pt.id}
                    className="flex items-center gap-2 text-xs text-neutral-400"
                  >
                    <span className="w-4 shrink-0 text-neutral-500">
                      {i + 1}
                    </span>
                    <span className="flex-1 tabular-nums">
                      ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
                    </span>
                    <button
                      onClick={() => removePathPoint(pt.id)}
                      disabled={selectedPath.points.length <= 2}
                      className="rounded px-1.5 py-0.5 text-red-300 hover:bg-red-900/60 disabled:opacity-30 disabled:hover:bg-transparent"
                      title="Удалить точку"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addPathPoint}
                className="mb-2 w-full rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
              >
                + Добавить точку
              </button>
              <button
                onClick={deleteSelectedPath}
                className="w-full rounded bg-red-900/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900"
              >
                {selectedPath.kind === "road"
                  ? "Удалить дорогу/парковку"
                  : "Удалить дорожку"}
              </button>
            </section>
          )}

          {selectedFlag &&
            (() => {
              const locked = isLocked(selectedFlag.planId);
              return (
                <section className="mb-4 rounded border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-2">
                    Флажки: {selectedFlag.key}
                  </div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Название
                  </label>
                  <input
                    value={selectedFlag.label}
                    onChange={(e) => updateFlagLabel(e.target.value)}
                    disabled={locked}
                    className="w-full mb-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
                  />
                  <label className="block text-xs text-neutral-400 mb-1">
                    Точки ({selectedFlag.points.length}) — тащите их прямо на
                    карте
                  </label>
                  <div className="mb-2 space-y-1">
                    {selectedFlag.points.map((pt, i) => (
                      <div
                        key={pt.id}
                        className="flex items-center gap-2 text-xs text-neutral-400"
                      >
                        <span className="w-4 shrink-0 text-neutral-500">
                          {i + 1}
                        </span>
                        <span className="flex-1 tabular-nums">
                          ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
                        </span>
                        <button
                          onClick={() => removeFlagPoint(pt.id)}
                          disabled={locked || selectedFlag.points.length <= 2}
                          className="rounded px-1.5 py-0.5 text-red-300 hover:bg-red-900/60 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Удалить точку"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addFlagPoint}
                    disabled={locked}
                    className="mb-2 w-full rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                  >
                    + Добавить точку
                  </button>
                  {locked ? (
                    <p className="text-center text-xs text-neutral-600">
                      Общий объект — редактируется только на вкладке V1
                    </p>
                  ) : (
                    <button
                      onClick={deleteSelectedFlag}
                      className="w-full rounded bg-red-900/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900"
                    >
                      Удалить линию флажков
                    </button>
                  )}
                </section>
              );
            })()}

          <section className="mb-4 border-b border-neutral-800 pb-3">
            <h2 className="mb-2 flex items-center justify-between text-xs font-semibold text-neutral-300">
              <span>Объекты на плане</span>
              <span className="font-normal text-neutral-600">
                {houses.length +
                  waterways.length +
                  ponds.length +
                  paths.length +
                  flagLines.length}
              </span>
            </h2>
            <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
              {houses.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">
                    Дома и постройки
                  </div>
                  {sortHousesByKey(houses).map((h) => {
                    const meta = houseMeta(h);
                    return (
                      <ObjectListRow
                        key={h.id}
                        active={
                          selection?.kind === "house" && selection.id === h.id
                        }
                        dot={meta.dot}
                        code={h.key}
                        title={h.label || meta.label}
                        meta={`${h.sizeW}×${h.sizeH} м`}
                        onClick={() =>
                          setSelection({ kind: "house", id: h.id })
                        }
                      />
                    );
                  })}
                </div>
              )}
              {waterways.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">
                    Реки и ручьи
                  </div>
                  {waterways.map((w) => (
                    <ObjectListRow
                      key={w.id}
                      active={
                        selection?.kind === "waterway" && selection.id === w.id
                      }
                      dot={w.kind === "river" ? "bg-teal-400" : "bg-teal-300"}
                      code={w.key}
                      title={w.label || (w.kind === "river" ? "Река" : "Ручей")}
                      meta={`${w.widthM} м`}
                      onClick={() =>
                        setSelection({ kind: "waterway", id: w.id })
                      }
                    />
                  ))}
                </div>
              )}
              {ponds.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">
                    Пруды
                  </div>
                  {ponds.map((p) => (
                    <ObjectListRow
                      key={p.id}
                      active={
                        selection?.kind === "pond" && selection.id === p.id
                      }
                      dot="bg-blue-400"
                      code={p.key}
                      title={p.label || "Пруд"}
                      onClick={() => setSelection({ kind: "pond", id: p.id })}
                    />
                  ))}
                </div>
              )}
              {paths.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">
                    Дорожки и дороги
                  </div>
                  {paths.map((p) => (
                    <ObjectListRow
                      key={p.id}
                      active={
                        selection?.kind === "path" && selection.id === p.id
                      }
                      dot={p.kind === "road" ? "bg-stone-400" : "bg-amber-500"}
                      code={p.key}
                      title={
                        p.label ||
                        (p.kind === "road" ? "Дорога/парковка" : "Дорожка")
                      }
                      meta={`${p.widthM} м`}
                      onClick={() => setSelection({ kind: "path", id: p.id })}
                    />
                  ))}
                </div>
              )}
              {flagLines.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">
                    Флажки
                  </div>
                  {flagLines.map((f) => (
                    <ObjectListRow
                      key={f.id}
                      active={
                        selection?.kind === "flag" && selection.id === f.id
                      }
                      dot="bg-rose-400"
                      code={f.key}
                      title={f.label || "Флажки"}
                      onClick={() => setSelection({ kind: "flag", id: f.id })}
                    />
                  ))}
                </div>
              )}
              {houses.length +
                waterways.length +
                ponds.length +
                paths.length +
                flagLines.length ===
                0 && (
                <p className="text-xs text-neutral-600">
                  Пока нет объектов — добавьте что-нибудь ниже.
                </p>
              )}
            </div>
          </section>

          <h1 className="text-sm font-semibold text-neutral-100 mb-3">
            Редактор плана
          </h1>

          {canEditActivePlan && (
            <section className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={addRoad}
                className="rounded bg-neutral-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-neutral-500"
              >
                + Дорога
              </button>
              <button
                onClick={addPath}
                className="rounded bg-amber-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                + Дорожка
              </button>
              {isAdmin && activePlan.key === "V1" && (
                <>
                  <button
                    onClick={() => addWaterway("stream")}
                    className="rounded bg-sky-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
                  >
                    + Ручей
                  </button>
                  <button
                    onClick={addPond}
                    className="rounded bg-sky-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
                  >
                    + Пруд
                  </button>
                </>
              )}
            </section>
          )}

          {canEditActivePlan && (
            <section className="mb-2">
              <button
                onClick={addPillar}
                className="w-full rounded bg-stone-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-600"
              >
                + Столб
              </button>
            </section>
          )}

          {isAdmin && activePlan.key === "V1" && (
            <section className="mb-2">
              <button
                onClick={addFlagLine}
                className="w-full rounded bg-rose-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-800"
              >
                + Граница
              </button>
            </section>
          )}

          {canEditActivePlan && (
            <section className="relative mb-2">
              <button
                onClick={() => setHousePickerOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded bg-emerald-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <span>+ Выберите домик…</span>
                <span className="text-emerald-300">
                  {housePickerOpen ? "▲" : "▼"}
                </span>
              </button>
              {housePickerOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setHousePickerOpen(false)}
                  />
                  <div className="relative z-50 mt-1 grid w-full grid-cols-2 gap-2 rounded border border-neutral-700 bg-[#181a18] p-2 shadow-xl">
                    {HOUSE_VARIANTS.map((v) => (
                      <button
                        key={v.value}
                        onClick={() => {
                          addHouseVariant(v.value);
                          setHousePickerOpen(false);
                        }}
                        className="group flex flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-900 text-left hover:border-emerald-500"
                      >
                        <img
                          src={`/${v.value}`}
                          alt={v.label}
                          className="h-20 w-full object-cover"
                        />
                        <span className="px-1.5 py-1 text-[10px] leading-tight text-neutral-200 group-hover:text-emerald-300">
                          {v.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {canEditActivePlan && (
            <section className="relative mb-2">
              <button
                onClick={() => setSaunaPickerOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded bg-orange-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
              >
                <span>+ Выберите баню…</span>
                <span className="text-orange-300">
                  {saunaPickerOpen ? "▲" : "▼"}
                </span>
              </button>
              {saunaPickerOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSaunaPickerOpen(false)}
                  />
                  <div className="relative z-50 mt-1 grid w-full grid-cols-2 gap-2 rounded border border-neutral-700 bg-[#181a18] p-2 shadow-xl">
                    {SAUNA_VARIANTS.map((v) => (
                      <button
                        key={v.value}
                        onClick={() => {
                          addSaunaVariant(v.value);
                          setSaunaPickerOpen(false);
                        }}
                        className="group flex flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-900 text-left hover:border-orange-500"
                      >
                        <img
                          src={`/${v.value}`}
                          alt={v.label}
                          className="h-20 w-full object-cover"
                        />
                        <span className="px-1.5 py-1 text-[10px] leading-tight text-neutral-200 group-hover:text-orange-300">
                          {v.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          <section className="mb-4 border-t border-neutral-800 pt-4">
            <button
              onClick={copyJson}
              className="w-full rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              {copyState === "copied"
                ? "Скопировано!"
                : copyState === "error"
                  ? "Не удалось скопировать"
                  : "Скопировать JSON"}
            </button>
          </section>

          {activePlan.key !== "V1" && (
            <section className="mt-4 border-t border-neutral-800 pt-4">
              <button
                onClick={() => setShowDeletePlanConfirm(true)}
                className="w-full rounded bg-red-950 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900"
              >
                Удалить план {activePlan.key}
              </button>
            </section>
          )}
        </aside>
      </div>

      {showDeletePlanConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-80 rounded border border-neutral-700 bg-[#181a18] p-4 shadow-xl">
            <h2 className="mb-2 text-sm font-semibold text-neutral-100">
              Удалить план {activePlan.key}?
            </h2>
            <p className="mb-4 text-xs text-neutral-400">
              Все локальные объекты этого плана (домики, столбы, дорожки и т.д.)
              будут удалены безвозвратно. Общие объекты (река, пруд, ручьи,
              граница, A1, B1) не пострадают — они принадлежат V1.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeletePlanConfirm(false)}
                disabled={deletingPlan}
                className="flex-1 rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
              >
                Отмена
              </button>
              <button
                onClick={confirmDeletePlan}
                disabled={deletingPlan}
                className="flex-1 rounded bg-red-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-40"
              >
                {deletingPlan ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
