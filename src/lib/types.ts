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

// Варианты домиков для дропдауна "+ Домик" — клик по картинке сразу ставит
// домик на площадку с названием вида "H8 - Treehouse".
export type HouseVariant = {
  value: string;
  label: string;
  tag: string;
  size: [number, number];
};

export const HOUSE_VARIANTS: HouseVariant[] = [
  {
    value: "assets/house_glass_mirror.png",
    label: "Барнхаус + палуба + джакузи",
    tag: "Barn",
    size: [15, 15],
  },
  {
    value: "assets/house_treehouse_round.png",
    label: "Дом на дереве (круглый, с мостиками)",
    tag: "Treehouse",
    size: [14, 14],
  },
  {
    value: "assets/house_treehouse_multilevel.png",
    label: "Дом на дереве (многоуровневый, с бассейном)",
    tag: "TreehouseXL",
    size: [18, 16],
  },
  {
    value: "assets/house_dome_glass.png",
    label: "Стеклянный купол с джакузи",
    tag: "Dome",
    size: [12, 12],
  },
  {
    value: "assets/house_barnhouse_black.png",
    label: "Барнхаус чёрный (терраса, мангал, зона отдыха)",
    tag: "BarnBlack",
    size: [16, 12],
  },
];

// Варианты бань для дропдауна "+ Баня" — отдельная категория со своими
// ключами (S1, S2, ...), не путать с домиками.
export const SAUNA_VARIANTS: HouseVariant[] = [
  {
    value: "assets/sauna_pod.png",
    label: "Баня-капсула (круглая)",
    tag: "SaunaPod",
    size: [5, 5],
  },
  {
    value: "assets/sauna_aframe.png",
    label: "Баня-шалаш (A-frame)",
    tag: "SaunaAFrame",
    size: [5, 5],
  },
  {
    value: "assets/sauna_cube.png",
    label: "Баня-куб (модерн)",
    tag: "SaunaCube",
    size: [5, 4],
  },
  {
    value: "assets/sauna_barrel.png",
    label: "Баня-бочка",
    tag: "SaunaBarrel",
    size: [5, 4],
  },
];
