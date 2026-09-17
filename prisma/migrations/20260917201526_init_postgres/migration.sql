-- CreateTable
CREATE TABLE "Meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT 'План v0 — зеркальные боксы',
    "plotW" DOUBLE PRECISION NOT NULL DEFAULT 220,
    "plotH" DOUBLE PRECISION NOT NULL DEFAULT 160,
    "pxPerM" DOUBLE PRECISION NOT NULL DEFAULT 6.981818181818182,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "House" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'house',
    "asset" TEXT NOT NULL,
    "tlX" DOUBLE PRECISION NOT NULL,
    "tlY" DOUBLE PRECISION NOT NULL,
    "sizeW" DOUBLE PRECISION NOT NULL,
    "sizeH" DOUBLE PRECISION NOT NULL,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renderScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "renderOffsetX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renderOffsetY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waterway" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Waterway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterwayPoint" (
    "id" TEXT NOT NULL,
    "waterwayId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WaterwayPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pond" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Pond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PondPoint" (
    "id" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PondPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Path" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'footpath',
    "label" TEXT NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL DEFAULT 1.5,

    CONSTRAINT "Path_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathPoint" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PathPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlagLine" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "FlagLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlagPoint" (
    "id" TEXT NOT NULL,
    "flagLineId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FlagPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE INDEX "House_planId_idx" ON "House"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "House_planId_key_key" ON "House"("planId", "key");

-- CreateIndex
CREATE INDEX "Waterway_planId_idx" ON "Waterway"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Waterway_planId_key_key" ON "Waterway"("planId", "key");

-- CreateIndex
CREATE INDEX "WaterwayPoint_waterwayId_idx" ON "WaterwayPoint"("waterwayId");

-- CreateIndex
CREATE INDEX "Pond_planId_idx" ON "Pond"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Pond_planId_key_key" ON "Pond"("planId", "key");

-- CreateIndex
CREATE INDEX "PondPoint_pondId_idx" ON "PondPoint"("pondId");

-- CreateIndex
CREATE INDEX "Path_planId_idx" ON "Path"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Path_planId_key_key" ON "Path"("planId", "key");

-- CreateIndex
CREATE INDEX "PathPoint_pathId_idx" ON "PathPoint"("pathId");

-- CreateIndex
CREATE INDEX "FlagLine_planId_idx" ON "FlagLine"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "FlagLine_planId_key_key" ON "FlagLine"("planId", "key");

-- CreateIndex
CREATE INDEX "FlagPoint_flagLineId_idx" ON "FlagPoint"("flagLineId");

-- AddForeignKey
ALTER TABLE "WaterwayPoint" ADD CONSTRAINT "WaterwayPoint_waterwayId_fkey" FOREIGN KEY ("waterwayId") REFERENCES "Waterway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PondPoint" ADD CONSTRAINT "PondPoint_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathPoint" ADD CONSTRAINT "PathPoint_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "Path"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlagPoint" ADD CONSTRAINT "FlagPoint_flagLineId_fkey" FOREIGN KEY ("flagLineId") REFERENCES "FlagLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
