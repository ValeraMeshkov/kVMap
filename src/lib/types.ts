export type HouseDTO = {
  id: string;
  planId: string;
  key: string;
  label: string;
  kind: string;
  asset: string;
  tlX: number;
  tlY: number;
  sizeW: number;
  sizeH: number;
  rotationDeg: number;
  renderScale: number;
  renderOffsetX: number;
  renderOffsetY: number;
};

export type WaterwayPointDTO = {
  id: string;
  x: number;
  y: number;
  orderIndex: number;
};

export type WaterwayDTO = {
  id: string;
  planId: string;
  key: string;
  kind: string;
  label: string;
  widthM: number;
  points: WaterwayPointDTO[];
};

export type PondPointDTO = {
  id: string;
  x: number;
  y: number;
  orderIndex: number;
};

export type PondDTO = {
  id: string;
  planId: string;
  key: string;
  label: string;
  points: PondPointDTO[];
};

export type PathPointDTO = {
  id: string;
  x: number;
  y: number;
  orderIndex: number;
};

export type PathDTO = {
  id: string;
  key: string;
  kind: string;
  label: string;
  widthM: number;
  points: PathPointDTO[];
};

export type FlagPointDTO = {
  id: string;
  x: number;
  y: number;
  orderIndex: number;
};

export type FlagLineDTO = {
  id: string;
  planId: string;
  key: string;
  label: string;
  points: FlagPointDTO[];
};

export type MetaDTO = {
  title: string;
  plotW: number;
  plotH: number;
  pxPerM: number;
};

export type LayoutDTO = {
  meta: MetaDTO;
  houses: HouseDTO[];
  waterways: WaterwayDTO[];
  ponds: PondDTO[];
  paths: PathDTO[];
  flagLines: FlagLineDTO[];
};

export type PlanSummary = {
  id: string;
  key: string;
  title: string;
};

// Варианты домиков для селекта "+ Домик" — выбор сразу ставит домик на площадку
// с названием вида "H3 - Barn". Черновой набор — лишнее потом почистим.
export type HouseVariant = {
  value: string;
  label: string;
  tag: string;
  size: [number, number];
};

export const HOUSE_VARIANTS: HouseVariant[] = [
  {
    value: "assets/house_barn2.png",
    label: "Барнхаус (двускатная крыша)",
    tag: "Barn",
    size: [15, 15],
  },
  {
    value: "assets/house_column.png",
    label: "Домик на высокой колонне",
    tag: "Column",
    size: [10, 10],
  },
  {
    value: "assets/house_aframe.png",
    label: "А-фрейм",
    tag: "AFrame",
    size: [12, 12],
  },
  {
    value: "assets/house_glasscube.png",
    label: "Стеклянный куб",
    tag: "GlassCube",
    size: [14, 14],
  },
  {
    value: "assets/house_dome.png",
    label: "Купольный дом",
    tag: "Dome",
    size: [14, 14],
  },
  {
    value: "assets/house_container.png",
    label: "Дом-контейнер",
    tag: "Container",
    size: [20, 8],
  },
  {
    value: "assets/house_yurt.png",
    label: "Юрта",
    tag: "Yurt",
    size: [12, 12],
  },
  {
    value: "assets/house_log.png",
    label: "Бревенчатый дом",
    tag: "Log",
    size: [14, 14],
  },
  {
    value: "assets/house_stilts.png",
    label: "Дом на сваях (у воды)",
    tag: "Stilts",
    size: [16, 14],
  },
  {
    value: "assets/house_modern.png",
    label: "Хай-тек куб",
    tag: "Modern",
    size: [18, 12],
  },
];
