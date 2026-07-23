import { useEffect, useMemo, useRef, useState } from "react";
import {
  createV5Plan,
  type V5Issue,
  type V5Settings,
} from "../lib/packing-engine-v5";

type CargoItem = {
  id: number;
  name: string;
  quantity: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  rotatable: boolean;
  uprightOnly?: boolean;
  stackable: boolean;
  maxLayers: number;
  maxTopLoad?: number;
  unloadPriority?: number;
  minSupport?: number;
  color: string;
};

type ContainerId = "20GP" | "40GP" | "40HC";
type ContainerSelection = Record<ContainerId, boolean>;

type ContainerSpec = {
  id: ContainerId;
  length: number;
  width: number;
  height: number;
  doorWidth: number;
  doorHeight: number;
  tareWeight: number;
  maxWeight: number;
  volume: number;
  accent: string;
};

type CalculationProfile = "reference" | "operational";

type PackingSpace = {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
};

type PackedBox = {
  id?: number;
  itemId?: number;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  unitWeight?: number;
  carriedLoad?: number;
  supportIds?: number[];
  layer?: number;
};

type PackedGroup = {
  itemId: number;
  name: string;
  color: string;
  unitWeight: number;
  count: number;
  length: number;
  width: number;
  height: number;
  x: number;
  usedLength: number;
  placements: PackedBox[];
  orientationSummary: string;
};

type PackedContainer = {
  key: string;
  spec: ContainerSpec;
  groups: PackedGroup[];
  itemCounts: Record<number, number>;
  usedWeight: number;
  usedVolume: number;
  issues?: V5Issue[];
  confidence?: "high" | "medium" | "low";
  maxFloorPressure?: number;
};

type Plan = {
  containers: PackedContainer[];
  remaining: Record<number, number>;
  totalQuantity: number;
  totalWeight: number;
  totalVolume: number;
  evaluatedPlans: number;
  solverVersion?: "V5";
  confidence?: "high" | "medium" | "low";
  validation?: {
    errors: number;
    warnings: number;
    checks: number;
  };
};

const CONTAINERS: ContainerSpec[] = [
  {
    id: "20GP",
    length: 589.5,
    width: 235,
    height: 239.2,
    doorWidth: 234,
    doorHeight: 229.2,
    tareWeight: 2230,
    maxWeight: 28230,
    volume: 33,
    accent: "#2563eb",
  },
  {
    id: "40GP",
    length: 1202.9,
    width: 235,
    height: 239.2,
    doorWidth: 234,
    doorHeight: 229.2,
    tareWeight: 3780,
    maxWeight: 26700,
    volume: 67,
    accent: "#0891b2",
  },
  {
    id: "40HC",
    length: 1202.4,
    width: 235,
    height: 269.7,
    doorWidth: 234,
    doorHeight: 259.7,
    tareWeight: 4020,
    maxWeight: 26460,
    volume: 76,
    accent: "#0f766e",
  },
];

const PROFILE_RESERVE: Record<
  CalculationProfile,
  { length: number; width: number; height: number }
> = {
  reference: { length: 0, width: 0, height: 0 },
  operational: { length: 5, width: 2, height: 2 },
};

const COLORS = ["#F97316", "#7C3AED", "#0EA5E9", "#22C55E", "#E11D48", "#EAB308"];
const DEFAULT_CONTAINER_SELECTION: ContainerSelection = {
  "20GP": true,
  "40GP": true,
  "40HC": true,
};

const normalizeContainerSelection = (
  value?: Partial<Record<ContainerId, boolean | number>>,
): ContainerSelection => ({
  "20GP": Boolean(value?.["20GP"]),
  "40GP": Boolean(value?.["40GP"]),
  "40HC": Boolean(value?.["40HC"]),
});

const SAMPLE_ITEMS: CargoItem[] = [
  {
    id: 1,
    name: "Thùng carton A",
    quantity: 240,
    length: 60,
    width: 40,
    height: 35,
    weight: 18,
    rotatable: true,
    uprightOnly: true,
    stackable: true,
    maxLayers: 99,
    maxTopLoad: 900,
    unloadPriority: 1,
    color: COLORS[0],
  },
  {
    id: 2,
    name: "Pallet hàng B",
    quantity: 12,
    length: 120,
    width: 100,
    height: 110,
    weight: 420,
    rotatable: false,
    uprightOnly: true,
    stackable: true,
    maxLayers: 2,
    maxTopLoad: 500,
    unloadPriority: 1,
    color: COLORS[1],
  },
];

const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const itemVolumeM3 = (item: CargoItem) =>
  (item.length * item.width * item.height) / 1_000_000;

const getOrientations = (item: CargoItem) => {
  const base = [item.length, item.width, item.height] as const;
  if (!item.rotatable) return [base];
  const values = [
    [base[0], base[1], base[2]],
    [base[0], base[2], base[1]],
    [base[1], base[0], base[2]],
    [base[1], base[2], base[0]],
    [base[2], base[0], base[1]],
    [base[2], base[1], base[0]],
  ] as const;
  const seen = new Set<string>();
  return values.filter((entry) => {
    const key = entry.join("-");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function getUnpackedReason(item: CargoItem) {
  if (item.weight > Math.max(...CONTAINERS.map((spec) => spec.maxWeight))) {
    return "một kiện vượt tải hàng tối đa của mọi container";
  }
  const fitsAnyContainer = CONTAINERS.some((spec) =>
    getOrientations(item).some(
      ([length, width, height]) =>
        length <= spec.length + 1e-7 &&
        width <= spec.width + 1e-7 &&
        height <= spec.height + 1e-7 &&
        width <= spec.doorWidth + 1e-7 &&
        height <= spec.doorHeight + 1e-7,
    ),
  );
  if (!fitsAnyContainer) return "không có hướng đặt nào vừa cửa và lòng container";
  if (!item.stackable || item.maxLayers <= 1) return "bị giới hạn không xếp chồng; cần thêm diện tích sàn";
  if (item.maxLayers < 99) return `bị giới hạn tối đa ${item.maxLayers} tầng`;
  return "cần thêm container hoặc một phương án chèn buộc đặc biệt";
}

function buildOrders(items: CargoItem[]) {
  const valid = items.filter((item) => item.quantity > 0);
  const baseOrders = [
    [...valid].sort((a, b) => itemVolumeM3(b) - itemVolumeM3(a)),
    [...valid].sort(
      (a, b) => b.quantity * itemVolumeM3(b) - a.quantity * itemVolumeM3(a),
    ),
    [...valid].sort((a, b) => b.weight - a.weight),
    [...valid].sort((a, b) => b.weight / itemVolumeM3(b) - a.weight / itemVolumeM3(a)),
    [...valid].sort((a, b) => b.length * b.width - a.length * a.width),
    [...valid].sort((a, b) => Number(a.stackable) - Number(b.stackable)),
    [...valid].sort((a, b) => Math.max(b.length, b.width, b.height) - Math.max(a.length, a.width, a.height)),
  ];
  const volumeOrder = baseOrders[0];
  const alternating: CargoItem[] = [];
  let left = 0;
  let right = volumeOrder.length - 1;
  while (left <= right) {
    alternating.push(volumeOrder[left]);
    if (left !== right) alternating.push(volumeOrder[right]);
    left += 1;
    right -= 1;
  }
  const orders = [
    ...baseOrders,
    alternating,
    ...volumeOrder.slice(0, Math.min(volumeOrder.length, 6)).map((_, index) => [
      ...volumeOrder.slice(index),
      ...volumeOrder.slice(0, index),
    ]),
  ];
  const signatures = new Set<string>();
  return orders.filter((order) => {
    const signature = order.map((item) => item.id).join(",");
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  }).slice(0, 16);
}

type RowOption = {
  length: number;
  width: number;
  height: number;
};

type RowLayout = {
  rows: RowOption[];
  boxesPerLayer: number;
  usedWidth: number;
};

const DIMENSION_SCALE = 10;
const scaledUp = (value: number) => Math.ceil(value * DIMENSION_SCALE - 1e-7);
const scaledDown = (value: number) => Math.floor(value * DIMENSION_SCALE + 1e-7);

function buildBestRows(
  options: RowOption[],
  containerWidth: number,
  usableLength: number,
): RowLayout {
  const maxWidth = scaledDown(containerWidth);
  const best = Array<number>(maxWidth + 1).fill(Number.NEGATIVE_INFINITY);
  const previous: Array<{ width: number; option: RowOption } | null> =
    Array(maxWidth + 1).fill(null);
  best[0] = 0;

  for (let usedWidth = 0; usedWidth <= maxWidth; usedWidth += 1) {
    if (!Number.isFinite(best[usedWidth])) continue;
    for (const option of options) {
      const boxesInRow = Math.floor((usableLength + 1e-7) / option.length);
      const rowWidth = scaledUp(option.width);
      const nextWidth = usedWidth + rowWidth;
      if (boxesInRow <= 0 || nextWidth > maxWidth) continue;
      const nextCount = best[usedWidth] + boxesInRow;
      if (nextCount > best[nextWidth]) {
        best[nextWidth] = nextCount;
        previous[nextWidth] = { width: usedWidth, option };
      }
    }
  }

  let bestWidth = 0;
  for (let width = 1; width <= maxWidth; width += 1) {
    if (best[width] > best[bestWidth]) bestWidth = width;
  }

  const rows: RowOption[] = [];
  let cursor = bestWidth;
  while (cursor > 0 && previous[cursor]) {
    const step = previous[cursor]!;
    rows.push(step.option);
    cursor = step.width;
  }
  rows.reverse();

  return {
    rows,
    boxesPerLayer: Math.max(0, best[bestWidth]),
    usedWidth: bestWidth / DIMENSION_SCALE,
  };
}

function getHeightOptions(item: CargoItem) {
  const grouped = new Map<string, RowOption[]>();
  for (const [length, width, height] of getOrientations(item)) {
    const key = String(height);
    const current = grouped.get(key) ?? [];
    if (!current.some((entry) => entry.length === length && entry.width === width)) {
      current.push({ length, width, height });
    }
    grouped.set(key, current);
  }
  return [...grouped.entries()].map(([height, options]) => ({
    height: Number(height),
    options,
  }));
}

function rowCapacity(
  height: number,
  options: RowOption[],
  space: Pick<PackingSpace, "width" | "height">,
  usableLength: number,
  maxLayers: number,
) {
  const layers = Math.min(
    Math.max(1, Math.floor(maxLayers)),
    Math.floor((space.height + 1e-7) / height),
  );
  const layout = buildBestRows(options, space.width, usableLength);
  return {
    ...layout,
    layers,
    capacity: layout.boxesPerLayer * layers,
  };
}

function minimumLengthForCount(
  height: number,
  options: RowOption[],
  space: Pick<PackingSpace, "width" | "height">,
  maxLength: number,
  target: number,
  maxLayers: number,
) {
  let low = 0;
  let high = scaledDown(maxLength);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const capacity = rowCapacity(
      height,
      options,
      space,
      middle / DIMENSION_SCALE,
      maxLayers,
    ).capacity;
    if (capacity >= target) high = middle;
    else low = middle + 1;
  }
  return low / DIMENSION_SCALE;
}

function buildOptimizedSlab(
  item: CargoItem,
  space: PackingSpace,
  available: number,
  maxByWeight: number,
  doorWidth: number,
  doorHeight: number,
) {
  const targetLimit = Math.min(available, maxByWeight);
  const layerLimit = item.stackable ? Math.max(1, Math.floor(item.maxLayers)) : 1;
  const candidates = getHeightOptions(item)
    .map(({ height, options }) => ({
      height,
      options: options.filter(
        (option) => option.width <= doorWidth + 1e-7 && height <= doorHeight + 1e-7,
      ),
    }))
    .filter(({ options }) => options.length > 0)
    .map(({ height, options }) => {
      const full = rowCapacity(height, options, space, space.length, layerLimit);
      const take = Math.min(targetLimit, full.capacity);
      if (take <= 0) return null;
      const usedLength = minimumLengthForCount(
        height,
        options,
        space,
        space.length,
        take,
        layerLimit,
      );
      const layout = rowCapacity(height, options, space, usedLength, layerLimit);
      return { height, options, take, usedLength, layout };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => {
      const aCompletes = a.take === available ? 1 : 0;
      const bCompletes = b.take === available ? 1 : 0;
      if (aCompletes !== bCompletes) return bCompletes - aCompletes;
      if (a.take !== b.take) return b.take - a.take;
      return a.usedLength - b.usedLength;
    });

  const best = candidates[0];
  if (!best) return null;

  const placements: PackedBox[] = [];
  const rowRuns: Array<{
    layer: number;
    rowIndex: number;
    y: number;
    row: RowOption;
    inRow: number;
    maximum: number;
  }> = [];
  let remainingToPlace = best.take;
  for (let layer = 0; layer < best.layout.layers && remainingToPlace > 0; layer += 1) {
    let y = 0;
    for (let rowIndex = 0; rowIndex < best.layout.rows.length; rowIndex += 1) {
      const row = best.layout.rows[rowIndex];
      const maximum = Math.floor((best.usedLength + 1e-7) / row.length);
      const inRow = Math.min(
        remainingToPlace,
        maximum,
      );
      rowRuns.push({ layer, rowIndex, y, row, inRow, maximum });
      for (let column = 0; column < inRow; column += 1) {
        placements.push({
          x: space.x + column * row.length,
          y: space.y + y,
          z: space.z + layer * best.height,
          length: row.length,
          width: row.width,
          height: best.height,
        });
      }
      remainingToPlace -= inRow;
      y += row.width;
      if (remainingToPlace <= 0) break;
    }
  }

  const topSpaces: PackingSpace[] = [];
  if (item.stackable && item.maxLayers >= 99) {
    best.layout.rows.forEach((row, rowIndex) => {
      const matchingRuns = rowRuns.filter((run) => run.rowIndex === rowIndex);
      const maximum = matchingRuns[0]?.maximum ?? 0;
      const rowY = matchingRuns[0]?.y ?? 0;
      const heights = Array.from({ length: maximum }, (_, column) => {
        const supportingLayers = matchingRuns
          .filter((run) => run.inRow > column)
          .map((run) => run.layer);
        return supportingLayers.length ? Math.max(...supportingLayers) : -1;
      });
      let column = 0;
      while (column < heights.length) {
        const topLayer = heights[column];
        if (topLayer < 0) {
          column += 1;
          continue;
        }
        let end = column + 1;
        while (end < heights.length && heights[end] === topLayer) end += 1;
        const topZ = space.z + (topLayer + 1) * best.height;
        topSpaces.push({
          x: space.x + column * row.length,
          y: space.y + rowY,
          z: topZ,
          length: (end - column) * row.length,
          width: row.width,
          height: Math.max(0, space.z + space.height - topZ),
        });
        column = end;
      }
    });
  }

  const orientationCounts = new Map<string, number>();
  placements.forEach((box) => {
    const key = `${box.length} × ${box.width} × ${box.height} cm`;
    orientationCounts.set(key, (orientationCounts.get(key) ?? 0) + 1);
  });
  const orientationSummary = [...orientationCounts.entries()]
    .map(([orientation, count]) => `${count} kiện: ${orientation}`)
    .join(" + ");
  const first = placements[0];
  const usedLayers =
    placements.length > 0
      ? Math.max(...placements.map((box) => Math.round((box.z - space.z) / best.height))) + 1
      : 0;

  return {
    take: placements.length,
    usedLength: best.usedLength,
    length: first.length,
    width: first.width,
    height: first.height,
    usedWidth: best.layout.usedWidth,
    usedHeight: usedLayers * best.height,
    topSpaces,
    placements,
    orientationSummary,
  };
}

function packInOrder(
  spec: ContainerSpec,
  order: CargoItem[],
  remaining: Record<number, number>,
  key: string,
  profile: CalculationProfile,
): PackedContainer {
  let usedWeight = 0;
  let usedVolume = 0;
  const itemCounts: Record<number, number> = {};
  const groups: PackedGroup[] = [];
  const reserve = PROFILE_RESERVE[profile];
  const usable: PackingSpace = {
    x: 0,
    y: 0,
    z: 0,
    length: Math.max(0, spec.length - reserve.length),
    width: Math.max(0, spec.width - reserve.width),
    height: Math.max(0, spec.height - reserve.height),
  };
  let freeSpaces: PackingSpace[] = [usable];

  const addSpace = (spaces: PackingSpace[], candidate: PackingSpace) => {
    if (candidate.length < 0.1 || candidate.width < 0.1 || candidate.height < 0.1) return;
    spaces.push(candidate);
  };

  const pruneSpaces = (spaces: PackingSpace[]) => {
    const unique = new Map<string, PackingSpace>();
    spaces.forEach((space) => {
      if (space.length < 0.1 || space.width < 0.1 || space.height < 0.1) return;
      const key = [space.x, space.y, space.z, space.length, space.width, space.height]
        .map((value) => value.toFixed(2))
        .join("|");
      unique.set(key, space);
    });
    const entries = [...unique.values()];
    return entries
      .filter(
        (space, index) =>
          !entries.some(
            (other, otherIndex) =>
              index !== otherIndex &&
              other.x <= space.x + 1e-7 &&
              other.y <= space.y + 1e-7 &&
              other.z <= space.z + 1e-7 &&
              other.x + other.length >= space.x + space.length - 1e-7 &&
              other.y + other.width >= space.y + space.width - 1e-7 &&
              other.z + other.height >= space.z + space.height - 1e-7,
          ),
      )
      .sort(
        (a, b) =>
          a.z - b.z ||
          b.length * b.width * b.height - a.length * a.width * a.height ||
          a.x - b.x,
      )
      .slice(0, 500);
  };

  for (const item of order) {
    let available = Math.max(0, remaining[item.id] ?? 0);
    while (available > 0 && freeSpaces.length > 0) {
      const maxByWeight = Math.floor((spec.maxWeight - usedWeight) / item.weight);
      if (maxByWeight <= 0) break;

      const candidates = freeSpaces
        .map((space, index) => {
          const result = buildOptimizedSlab(
            item,
            space,
            available,
            maxByWeight,
            spec.doorWidth,
            spec.doorHeight,
          );
          if (!result) return null;
          const packedVolume = result.take * itemVolumeM3(item);
          const spaceVolume = (space.length * space.width * space.height) / 1_000_000;
          return {
            index,
            space,
            result,
            density: packedVolume / Math.max(spaceVolume, 0.000001),
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        .sort(
          (a, b) =>
            b.result.take - a.result.take ||
            b.density - a.density ||
            a.space.z - b.space.z ||
            a.space.x - b.space.x,
        );

      const chosen = candidates[0];
      if (!chosen) break;
      const { space, result } = chosen;
      freeSpaces.splice(chosen.index, 1);

      const nextSpaces = [...freeSpaces];
      addSpace(nextSpaces, {
        x: space.x + result.usedLength,
        y: space.y,
        z: space.z,
        length: space.length - result.usedLength,
        width: space.width,
        height: space.height,
      });
      addSpace(nextSpaces, {
        x: space.x,
        y: space.y + result.usedWidth,
        z: space.z,
        length: result.usedLength,
        width: space.width - result.usedWidth,
        height: space.height,
      });
      result.topSpaces.forEach((topSpace) => addSpace(nextSpaces, topSpace));
      freeSpaces = pruneSpaces(nextSpaces);

      const existing = groups.find((group) => group.itemId === item.id);
      if (existing) {
        existing.count += result.take;
        existing.placements.push(...result.placements);
        const orientationCounts = new Map<string, number>();
        existing.placements.forEach((box) => {
          const orientation = `${box.length} × ${box.width} × ${box.height} cm`;
          orientationCounts.set(orientation, (orientationCounts.get(orientation) ?? 0) + 1);
        });
        existing.orientationSummary = [...orientationCounts.entries()]
          .map(([orientation, count]) => `${count} kiện: ${orientation}`)
          .join(" + ");
        existing.usedLength = Math.max(
          existing.usedLength,
          ...existing.placements.map((box) => box.x + box.length),
        );
      } else {
        groups.push({
          itemId: item.id,
          name: item.name,
          color: item.color,
          unitWeight: item.weight,
          count: result.take,
          length: result.length,
          width: result.width,
          height: result.height,
          x: space.x,
          usedLength: result.usedLength,
          placements: result.placements,
          orientationSummary: result.orientationSummary,
        });
      }
      itemCounts[item.id] = (itemCounts[item.id] ?? 0) + result.take;
      usedWeight += result.take * item.weight;
      usedVolume += result.take * itemVolumeM3(item);
      available -= result.take;
    }
  }

  const allPlacements = groups.flatMap((group) => group.placements);
  if (allPlacements.length > 0) {
    const minX = Math.min(...allPlacements.map((box) => box.x));
    const maxX = Math.max(...allPlacements.map((box) => box.x + box.length));
    const minY = Math.min(...allPlacements.map((box) => box.y));
    const maxY = Math.max(...allPlacements.map((box) => box.y + box.width));
    const xOffset = Math.max(0, (usable.length - (maxX - minX)) / 2 - minX);
    const yOffset = Math.max(0, (usable.width - (maxY - minY)) / 2 - minY);
    groups.forEach((group) => {
      group.placements.forEach((box) => {
        box.x += xOffset;
        box.y += yOffset;
      });
      group.x += xOffset;
      group.usedLength += xOffset;
    });
  }

  return { key, spec, groups, itemCounts, usedWeight, usedVolume };
}

function packOne(
  spec: ContainerSpec,
  items: CargoItem[],
  remaining: Record<number, number>,
  key: string,
  profile: CalculationProfile,
) {
  const candidates = buildOrders(items).map((order) =>
    packInOrder(spec, order, remaining, key, profile),
  );
  return candidates.sort((a, b) => {
    const countA = Object.values(a.itemCounts).reduce((sum, count) => sum + count, 0);
    const countB = Object.values(b.itemCounts).reduce((sum, count) => sum + count, 0);
    return b.usedVolume - a.usedVolume || countB - countA || b.usedWeight - a.usedWeight;
  })[0];
}

function subtractPacked(remaining: Record<number, number>, packed: PackedContainer) {
  const next = { ...remaining };
  Object.entries(packed.itemCounts).forEach(([id, count]) => {
    next[Number(id)] = Math.max(0, (next[Number(id)] ?? 0) - count);
  });
  return next;
}

function createPlan(
  items: CargoItem[],
  mode: "auto" | "manual",
  selectedTypes: Record<ContainerId, number>,
  profile: CalculationProfile,
): Plan {
  const cleanItems = items.filter(
    (item) =>
      item.quantity > 0 &&
      item.length > 0 &&
      item.width > 0 &&
      item.height > 0 &&
      item.weight > 0,
  );
  let remaining = Object.fromEntries(cleanItems.map((item) => [item.id, Math.floor(item.quantity)]));
  let containers: PackedContainer[] = [];
  let evaluatedPlans = 0;

  if (mode === "manual") {
    const requested = CONTAINERS.flatMap((spec) =>
      Array.from({ length: Math.max(0, selectedTypes[spec.id] || 0) }, () => spec),
    ).sort((a, b) => b.volume - a.volume);

    requested.forEach((spec, index) => {
      const packed = packOne(spec, cleanItems, remaining, `${spec.id}-${index + 1}`, profile);
      evaluatedPlans += 1;
      containers.push(packed);
      remaining = subtractPacked(remaining, packed);
    });
  } else {
    type SearchState = {
      containers: PackedContainer[];
      remaining: Record<number, number>;
      capacity: number;
    };
    const initialRemaining = { ...remaining };
    const totalQuantity = Object.values(initialRemaining).reduce((sum, count) => sum + count, 0);
    const totalVolume = cleanItems.reduce(
      (sum, item) => sum + initialRemaining[item.id] * itemVolumeM3(item),
      0,
    );
    const totalWeight = cleanItems.reduce(
      (sum, item) => sum + initialRemaining[item.id] * item.weight,
      0,
    );
    const isComplete = (state: SearchState) =>
      Object.values(state.remaining).every((count) => count <= 0);
    const scoreState = (state: SearchState) => {
      const quantityLeft = Object.values(state.remaining).reduce((sum, count) => sum + count, 0);
      const volumeLeft = cleanItems.reduce(
        (sum, item) => sum + (state.remaining[item.id] || 0) * itemVolumeM3(item),
        0,
      );
      const weightLeft = cleanItems.reduce(
        (sum, item) => sum + (state.remaining[item.id] || 0) * item.weight,
        0,
      );
      return (
        quantityLeft / Math.max(totalQuantity, 1) +
        volumeLeft / Math.max(totalVolume, 0.001) +
        weightLeft / Math.max(totalWeight, 1) +
        state.capacity / Math.max(CONTAINERS[2].volume * 100, 1)
      );
    };

    let states: SearchState[] = [
      { containers: [], remaining: initialRemaining, capacity: 0 },
    ];
    let bestPartial = states[0];
    const theoreticalMinimum = Math.max(
      1,
      Math.ceil(totalVolume / CONTAINERS[2].volume),
      Math.ceil(totalWeight / Math.max(...CONTAINERS.map((spec) => spec.maxWeight))),
    );
    const maxDepth = Math.min(100, theoreticalMinimum + 12);

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const expanded: SearchState[] = [];
      states.forEach((state) => {
        CONTAINERS.forEach((spec) => {
          const packed = packOne(
            spec,
            cleanItems,
            state.remaining,
            `${spec.id}-${state.containers.length + 1}`,
            profile,
          );
          evaluatedPlans += 1;
          if (!Object.values(packed.itemCounts).some((count) => count > 0)) return;
          expanded.push({
            containers: [...state.containers, packed],
            remaining: subtractPacked(state.remaining, packed),
            capacity: state.capacity + spec.volume,
          });
        });
      });
      if (!expanded.length) break;

      const completed = expanded.filter(isComplete);
      if (completed.length) {
        const winner = completed.sort(
          (a, b) =>
            a.capacity - b.capacity ||
            a.containers.filter((entry) => entry.spec.id === "40HC").length -
              b.containers.filter((entry) => entry.spec.id === "40HC").length,
        )[0];
        containers = winner.containers;
        remaining = winner.remaining;
        break;
      }

      const byRemaining = new Map<string, SearchState>();
      expanded.forEach((state) => {
        const signature = cleanItems
          .map((item) => `${item.id}:${state.remaining[item.id] || 0}`)
          .join("|");
        const current = byRemaining.get(signature);
        if (!current || state.capacity < current.capacity) byRemaining.set(signature, state);
      });
      states = [...byRemaining.values()].sort((a, b) => scoreState(a) - scoreState(b)).slice(0, 18);
      if (scoreState(states[0]) < scoreState(bestPartial)) bestPartial = states[0];

      if (depth === maxDepth - 1) {
        containers = bestPartial.containers;
        remaining = bestPartial.remaining;
      }
    }
    if (containers.length === 0 && bestPartial.containers.length > 0) {
      containers = bestPartial.containers;
      remaining = bestPartial.remaining;
    }
  }

  return {
    containers,
    remaining,
    totalQuantity: cleanItems.reduce((sum, item) => sum + Math.floor(item.quantity), 0),
    totalWeight: cleanItems.reduce((sum, item) => sum + item.quantity * item.weight, 0),
    totalVolume: cleanItems.reduce((sum, item) => sum + item.quantity * itemVolumeM3(item), 0),
    evaluatedPlans,
  };
}

const packingEngineSelfTest = (() => {
  const base: Omit<CargoItem, "id" | "name" | "quantity" | "length" | "width" | "height" | "weight"> = {
    rotatable: true,
    stackable: true,
    maxLayers: 99,
    color: COLORS[0],
  };
  const benchmark: CargoItem = {
    ...base,
    id: 999,
    name: "Benchmark 70 kiện",
    quantity: 70,
    length: 120,
    width: 80,
    height: 80,
    weight: 200,
  };
  const result = createPlan(
    [benchmark],
    "auto",
    { "20GP": 0, "40GP": 0, "40HC": 0 },
    "reference",
  );
  const packed =
    result.totalQuantity -
    Object.values(result.remaining).reduce((sum, count) => sum + count, 0);
  if (
    result.containers.length !== 1 ||
    result.containers[0]?.spec.id !== "40HC" ||
    packed !== 70
  ) {
    throw new Error("Packing engine benchmark failed: 70 kiện phải nằm trong 1 × 40HC.");
  }

  const overweight = createPlan(
    [
      {
        ...base,
        id: 998,
        name: "Kiện tải nặng",
        quantity: 2,
        length: 100,
        width: 100,
        height: 100,
        weight: 15_000,
      },
    ],
    "auto",
    { "20GP": 0, "40GP": 0, "40HC": 0 },
    "reference",
  );
  if (overweight.containers.length !== 2) {
    throw new Error("Packing engine payload test failed: 30.000 kg phải tách ít nhất 2 container.");
  }

  const nonStackable = createPlan(
    [
      {
        ...benchmark,
        id: 997,
        name: "Kiện không xếp chồng",
        quantity: 40,
        stackable: false,
        maxLayers: 1,
      },
    ],
    "auto",
    { "20GP": 0, "40GP": 0, "40HC": 0 },
    "reference",
  );
  if (nonStackable.containers.length < 2) {
    throw new Error("Packing engine stacking test failed: hàng không chồng không được tạo tầng.");
  }

  const blockedByDoor = createPlan(
    [
      {
        ...base,
        id: 996,
        name: "Kiện không lọt cửa",
        quantity: 1,
        length: 235,
        width: 235,
        height: 250,
        weight: 100,
      },
    ],
    "auto",
    { "20GP": 0, "40GP": 0, "40HC": 0 },
    "reference",
  );
  if ((blockedByDoor.remaining[996] || 0) !== 1) {
    throw new Error("Packing engine door test failed: kiện vượt cửa không được đưa vào container.");
  }
  return true;
})();
void packingEngineSelfTest;

type ViewMode = "3d" | "top" | "side";

function getContainerAnalytics(container: PackedContainer) {
  const weighted = container.groups.flatMap((group) =>
    group.placements.map((box) => ({
      weight: group.unitWeight,
      x: box.x + box.length / 2,
      y: box.y + box.width / 2,
      z: box.z + box.height / 2,
    })),
  );
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const center = totalWeight
    ? weighted.reduce(
        (current, entry) => ({
          x: current.x + entry.x * entry.weight,
          y: current.y + entry.y * entry.weight,
          z: current.z + entry.z * entry.weight,
        }),
        { x: 0, y: 0, z: 0 },
      )
    : { x: container.spec.length / 2, y: container.spec.width / 2, z: 0 };
  if (totalWeight) {
    center.x /= totalWeight;
    center.y /= totalWeight;
    center.z /= totalWeight;
  }
  const longitudinalOffset = (center.x / container.spec.length - 0.5) * 100;
  const lateralOffset = (center.y / container.spec.width - 0.5) * 100;
  const centerHeight = (center.z / container.spec.height) * 100;
  const zones = Array(5).fill(0) as number[];
  weighted.forEach((entry) => {
    const zone = Math.min(
      zones.length - 1,
      Math.max(0, Math.floor((entry.x / container.spec.length) * zones.length)),
    );
    zones[zone] += entry.weight;
  });
  const balanced =
    Math.abs(longitudinalOffset) <= 5 &&
    Math.abs(lateralOffset) <= 5 &&
    centerHeight <= 50;
  return {
    center,
    longitudinalOffset,
    lateralOffset,
    centerHeight,
    zones,
    balanced,
  };
}

function ContainerDiagram({
  container,
  view,
  mirrored,
}: {
  container: PackedContainer;
  view: ViewMode;
  mirrored: boolean;
}) {
  const viewWidth = 900;
  const viewHeight = view === "3d" ? 390 : 245;
  const boxes = container.groups.flatMap((group) =>
    group.placements.map((box) => ({ ...box, color: group.color, name: group.name })),
  );
  const analytics = getContainerAnalytics(container);

  if (view !== "3d") {
    const inset = 22;
    const innerWidth = viewWidth - inset * 2;
    const innerHeight = viewHeight - inset * 2;
    const visible = new Map<string, (typeof boxes)[number]>();
    boxes.forEach((box) => {
      const key =
        view === "top"
          ? [box.x, box.y, box.length, box.width].join("-")
          : [box.x, box.z, box.length, box.height].join("-");
      const current = visible.get(key);
      const depth = view === "top" ? box.z : box.y;
      const currentDepth = current ? (view === "top" ? current.z : current.y) : -1;
      if (!current || depth >= currentDepth) visible.set(key, box);
    });
    return (
      <svg
        className="container-diagram"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label={`${view === "top" ? "Mặt bằng" : "Mặt cạnh"} container ${container.spec.id}`}
      >
        <defs>
          <pattern id={`grid-${container.key}-${view}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#CBD5E1" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect x="4" y="4" width={viewWidth - 8} height={viewHeight - 8} rx="18" fill="#081426" />
        <rect x={inset} y={inset} width={innerWidth} height={innerHeight} rx="7" fill="#F8FAFC" />
        <rect x={inset} y={inset} width={innerWidth} height={innerHeight} rx="7" fill={`url(#grid-${container.key}-${view})`} />
        {[...visible.values()].map((box, index) => {
          const horizontal = box.x / container.spec.length;
          const vertical = view === "top" ? box.y / container.spec.width : 1 - (box.z + box.height) / container.spec.height;
          const boxWidth = (box.length / container.spec.length) * innerWidth;
          const boxHeight =
            ((view === "top" ? box.width : box.height) /
              (view === "top" ? container.spec.width : container.spec.height)) *
            innerHeight;
          return (
            <rect
              key={`${box.x}-${box.y}-${box.z}-${index}`}
              x={inset + horizontal * innerWidth + 1}
              y={inset + vertical * innerHeight + 1}
              width={Math.max(2, boxWidth - 2)}
              height={Math.max(2, boxHeight - 2)}
              rx="2"
              fill={box.color}
              fillOpacity="0.9"
              stroke="rgba(255,255,255,.92)"
              strokeWidth="1"
            >
              <title>{box.name} · {box.length}×{box.width}×{box.height} cm</title>
            </rect>
          );
        })}
        {container.usedWeight > 0 && (() => {
          const markerX = inset + (analytics.center.x / container.spec.length) * innerWidth;
          const markerY =
            view === "top"
              ? inset + (analytics.center.y / container.spec.width) * innerHeight
              : inset + (1 - analytics.center.z / container.spec.height) * innerHeight;
          return (
            <g>
              <circle cx={markerX} cy={markerY} r="8" fill="#FFF" stroke="#F97316" strokeWidth="3" />
              <path d={`M ${markerX - 12} ${markerY} H ${markerX + 12} M ${markerX} ${markerY - 12} V ${markerY + 12}`} stroke="#F97316" strokeWidth="1.5" />
              <title>Trọng tâm hàng hóa</title>
            </g>
          );
        })()}
        <path d={`M ${viewWidth - 28} 38 L ${viewWidth - 9} 27 L ${viewWidth - 9} ${viewHeight - 27} L ${viewWidth - 28} ${viewHeight - 38}`} fill="#334155" />
      </svg>
    );
  }

  const project = (x: number, y: number, z: number) => {
    const xRatio = x / container.spec.length;
    const yRatio = y / container.spec.width;
    const zRatio = z / container.spec.height;
    return mirrored
      ? [48 + xRatio * 690 + yRatio * 105, 282 + yRatio * 58 - zRatio * 245]
      : [145 + xRatio * 690 - yRatio * 105, 340 - yRatio * 58 - zRatio * 245];
  };
  const points = (entries: number[][]) => entries.map((point) => point.join(",")).join(" ");
  const sorted = [...boxes].sort((a, b) =>
    mirrored
      ? a.y - b.y || a.z - b.z || a.x - b.x
      : b.y - a.y || a.z - b.z || a.x - b.x,
  );
  const corners = {
    floor: [
      project(0, 0, 0),
      project(container.spec.length, 0, 0),
      project(container.spec.length, container.spec.width, 0),
      project(0, container.spec.width, 0),
    ],
    top: [
      project(0, 0, container.spec.height),
      project(container.spec.length, 0, container.spec.height),
      project(container.spec.length, container.spec.width, container.spec.height),
      project(0, container.spec.width, container.spec.height),
    ],
  };

  return (
    <svg
      className="container-diagram container-diagram-3d"
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      role="img"
      aria-label={`Mô phỏng xếp hàng ba chiều container ${container.spec.id}`}
    >
      <defs>
        <linearGradient id={`floor-${container.key}`} x1="0" x2="1">
          <stop stopColor="#E2E8F0" />
          <stop offset="1" stopColor="#F8FAFC" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width={viewWidth - 8} height={viewHeight - 8} rx="20" fill="#081426" />
      <polygon points={points(corners.floor)} fill={`url(#floor-${container.key})`} stroke="#B9C8DA" />
      {sorted.map((box, index) => {
        const p000 = project(box.x, box.y, box.z);
        const p100 = project(box.x + box.length, box.y, box.z);
        const p110 = project(box.x + box.length, box.y + box.width, box.z);
        const p001 = project(box.x, box.y, box.z + box.height);
        const p101 = project(box.x + box.length, box.y, box.z + box.height);
        const p111 = project(box.x + box.length, box.y + box.width, box.z + box.height);
        const p011 = project(box.x, box.y + box.width, box.z + box.height);
        return (
          <g key={`${box.x}-${box.y}-${box.z}-${index}`}>
            <title>{box.name} · {box.length}×{box.width}×{box.height} cm</title>
            <polygon points={points([p000, p100, p101, p001])} fill={box.color} fillOpacity=".78" stroke="rgba(255,255,255,.78)" strokeWidth=".8" />
            <polygon points={points([p100, p110, p111, p101])} fill={box.color} fillOpacity=".62" stroke="rgba(255,255,255,.72)" strokeWidth=".8" />
            <polygon points={points([p001, p101, p111, p011])} fill={box.color} fillOpacity=".94" stroke="rgba(255,255,255,.88)" strokeWidth=".9" />
          </g>
        );
      })}
      {container.usedWeight > 0 && (() => {
        const marker = project(analytics.center.x, analytics.center.y, analytics.center.z);
        return (
          <g>
            <circle cx={marker[0]} cy={marker[1]} r="8" fill="#FFF" stroke="#F97316" strokeWidth="3" />
            <path d={`M ${marker[0] - 12} ${marker[1]} H ${marker[0] + 12} M ${marker[0]} ${marker[1] - 12} V ${marker[1] + 12}`} stroke="#F97316" strokeWidth="1.5" />
            <title>Trọng tâm hàng hóa</title>
          </g>
        );
      })()}
      <g fill="none" stroke="#9FB4CB" strokeWidth="1.2" strokeDasharray="5 5">
        <polygon points={points(corners.floor)} />
        <polygon points={points(corners.top)} />
        {[0, 1, 2, 3].map((index) => (
          <line
            key={index}
            x1={corners.floor[index][0]}
            y1={corners.floor[index][1]}
            x2={corners.top[index][0]}
            y2={corners.top[index][1]}
          />
        ))}
      </g>
      <text x="55" y="372" fill="#7890AE" fontSize="11">Cửa container</text>
      <text x="705" y="372" fill="#7890AE" fontSize="11">Đầu container</text>
    </svg>
  );
}

export default function Home() {
  const [items, setItems] = useState<CargoItem[]>(SAMPLE_ITEMS);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selectedTypes, setSelectedTypes] = useState<ContainerSelection>(
    DEFAULT_CONTAINER_SELECTION,
  );
  const [profile, setProfile] = useState<CalculationProfile>("operational");
  const [settings, setSettings] = useState<V5Settings>({
    itemGap: 0.5,
    minSupport: 85,
    cogWarning: 5,
    floorPressureWarning: 4_500,
    searchQuality: "thorough",
  });
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [mirroredView, setMirroredView] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [activeContainer, setActiveContainer] = useState(0);
  const [notice, setNotice] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const projectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let project:
      | {
          items?: CargoItem[];
          mode?: "auto" | "manual";
          selectedTypes?: Partial<Record<ContainerId, boolean | number>>;
          manualCounts?: Partial<Record<ContainerId, number>>;
          profile?: CalculationProfile;
          settings?: V5Settings;
        }
      | undefined;
    try {
      const saved = window.localStorage.getItem("linh-luna-tm-v5-project");
      if (!saved) return;
      project = JSON.parse(saved);
    } catch {
      window.localStorage.removeItem("linh-luna-tm-v5-project");
      return;
    }
    const timer = window.setTimeout(() => {
      if (Array.isArray(project?.items) && project.items.length) setItems(project.items);
      if (project?.mode) setMode(project.mode);
      if (project?.selectedTypes || project?.manualCounts) {
        setSelectedTypes(
          normalizeContainerSelection(
            project.selectedTypes ?? project.manualCounts,
          ),
        );
      }
      if (project?.profile) setProfile(project.profile);
      if (project?.settings) setSettings(project.settings);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "linh-luna-tm-v5-project",
      JSON.stringify({ items, mode, selectedTypes, profile, settings }),
    );
  }, [items, mode, selectedTypes, profile, settings]);

  const totals = useMemo(
    () => ({
      quantity: items.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0),
      weight: items.reduce(
        (sum, item) => sum + Math.max(0, item.quantity || 0) * Math.max(0, item.weight || 0),
        0,
      ),
      volume: items.reduce(
        (sum, item) => sum + Math.max(0, item.quantity || 0) * itemVolumeM3(item),
        0,
      ),
    }),
    [items],
  );

  const updateItem = <K extends keyof CargoItem>(id: number, field: K, value: CargoItem[K]) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
    setPlan(null);
  };

  const addItem = () => {
    const nextId = Math.max(0, ...items.map((item) => item.id)) + 1;
    setItems((current) => [
      ...current,
      {
        id: nextId,
        name: `Mặt hàng ${nextId}`,
        quantity: 1,
        length: 50,
        width: 40,
        height: 30,
        weight: 10,
        rotatable: true,
        uprightOnly: true,
        stackable: true,
        maxLayers: 99,
        maxTopLoad: 500,
        unloadPriority: 1,
        color: COLORS[(nextId - 1) % COLORS.length],
      },
    ]);
    setPlan(null);
  };

  const loadSeaRatesCase = () => {
    setItems([
      {
        id: 1,
        name: "Mặt hàng 180 × 98 × 98",
        quantity: 50,
        length: 180,
        width: 98,
        height: 98,
        weight: 200,
        rotatable: true,
        uprightOnly: false,
        stackable: true,
        maxLayers: 99,
        maxTopLoad: 20_000,
        unloadPriority: 1,
        color: COLORS[0],
      },
    ]);
    setMode("auto");
    setProfile("reference");
    setPlan(null);
    setNotice("");
  };

  const calculate = () => {
    const invalid = items.some(
      (item) =>
        item.quantity <= 0 ||
        item.length <= 0 ||
        item.width <= 0 ||
        item.height <= 0 ||
        item.weight <= 0 ||
        item.maxLayers < 1,
    );
    if (!items.length || invalid) {
      setNotice("Vui lòng nhập đầy đủ số lượng, kích thước và cân nặng lớn hơn 0.");
      return;
    }
    if (mode === "manual" && Object.values(selectedTypes).every((selected) => !selected)) {
      setNotice("Hãy chọn ít nhất 1 loại container được phép sử dụng.");
      return;
    }
    setIsCalculating(true);
    setNotice("");
    window.setTimeout(() => {
      try {
        const effectiveSettings: V5Settings =
          profile === "reference"
            ? { ...settings, itemGap: 0 }
            : settings;
        const next = createV5Plan(
          items,
          CONTAINERS,
          mode,
          selectedTypes,
          profile,
          effectiveSettings,
        ) as unknown as Plan;
        setPlan(next);
        setActiveContainer(0);
        window.setTimeout(
          () =>
            document
              .getElementById("results")
              ?.scrollIntoView({ behavior: "smooth" }),
          50,
        );
      } catch (error) {
        setNotice(
          error instanceof Error
            ? `Không thể hoàn tất phép tính: ${error.message}`
            : "Không thể hoàn tất phép tính. Vui lòng kiểm tra lại dữ liệu.",
        );
      } finally {
        setIsCalculating(false);
      }
    }, 30);
  };

  const exportProject = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "Linh Luna T&M Container Optimizer",
            version: 5,
            savedAt: new Date().toISOString(),
            items,
            mode,
            selectedTypes,
            profile,
            settings,
          },
          null,
          2,
        ),
      ],
      { type: "application/json;charset=utf-8" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Linh-Luna-TM-du-an-xep-container-v5.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as {
        version?: number;
        items?: CargoItem[];
        mode?: "auto" | "manual";
        selectedTypes?: Partial<Record<ContainerId, boolean | number>>;
        manualCounts?: Partial<Record<ContainerId, number>>;
        profile?: CalculationProfile;
        settings?: V5Settings;
      };
      if (!Array.isArray(project.items) || !project.items.length) {
        throw new Error("File không có danh sách hàng hợp lệ.");
      }
      setItems(project.items);
      if (project.mode) setMode(project.mode);
      if (project.selectedTypes || project.manualCounts) {
        setSelectedTypes(
          normalizeContainerSelection(
            project.selectedTypes ?? project.manualCounts,
          ),
        );
      }
      if (project.profile) setProfile(project.profile);
      if (project.settings) setSettings(project.settings);
      setPlan(null);
      setNotice("Đã mở dự án thành công. Hãy nhấn tính toán để tạo phương án mới.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Không thể đọc file dự án.",
      );
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = "";
    }
  };

  const downloadCsv = () => {
    if (!plan) return;
    const header = "Container,Loại hàng,Số lượng,Hướng đặt,Xếp chồng,Khối lượng (kg)\n";
    const rows = plan.containers.flatMap((container, index) =>
      container.groups.map((group) => {
        const item = items.find((entry) => entry.id === group.itemId);
        return [
          `${container.spec.id} #${index + 1}`,
          `"${group.name.replaceAll('"', '""')}"`,
          group.count,
          `"${group.orientationSummary}"`,
          item?.stackable
            ? item.maxLayers >= 99
              ? "Theo chiều cao khả dụng"
              : `Tối đa ${item.maxLayers} tầng`
            : "Không xếp chồng",
          formatNumber(group.count * (item?.weight || 0), 1).replaceAll(".", ""),
        ].join(",");
      }),
    );
    const blob = new Blob(["\uFEFF", header, rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ke-hoach-xep-container.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const remainingCount = plan
    ? Object.values(plan.remaining).reduce((sum, count) => sum + count, 0)
    : 0;
  const packedQuantity = plan ? plan.totalQuantity - remainingCount : 0;
  const shownContainer = plan?.containers[activeContainer];
  const shownAnalytics = shownContainer ? getContainerAnalytics(shownContainer) : null;

  return (
    <main>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="brand" href="#top" aria-label="Linh Luna T&M - Trang đầu">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <b>Linh Luna T&amp;M</b>
              <small>Container Optimizer V5</small>
            </span>
          </a>
          <nav aria-label="Điều hướng chính">
            <a href="#calculator">Tính tải</a>
            <a href="#container-specs">Thông số container</a>
            <a href="#notes">Lưu ý</a>
          </nav>
          <span className="status-pill"><i /> V5 · Dữ liệu tính tại thiết bị</span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="shell hero-inner">
          <div>
            <p className="eyebrow">Bộ giải xếp hàng thực tế V5</p>
            <h1>Xếp nhiều hàng hơn.<br /><em>Dùng ít container hơn.</em></h1>
            <p className="hero-copy">
              Nhập kích thước và đặc tính hàng hóa. Hệ thống sẽ thử các hướng xoay phù hợp,
              kiểm tra tải trọng, mặt đỡ, sức chịu chồng và cân bằng để đề xuất
              phương án container có thể kiểm chứng.
            </p>
          </div>
          <div className="hero-stats" aria-label="Ba bước sử dụng">
            <div><span>01</span><b>Nhập hàng</b><small>Kích thước & tải trọng</small></div>
            <div><span>02</span><b>Chọn cách tính</b><small>Tự động hoặc thủ công</small></div>
            <div><span>03</span><b>Nhận sơ đồ</b><small>Phương án & tỷ lệ đầy</small></div>
          </div>
        </div>
      </section>

      <section className="shell calculator-shell" id="calculator">
        <div className="section-heading">
          <div>
            <p className="step-label"><span>1</span> Thông tin hàng hóa</p>
            <h2>Danh sách kiện hàng</h2>
          </div>
          <div className="heading-actions">
            <input
              ref={projectInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importProject(event.target.files?.[0])}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => projectInputRef.current?.click()}
            >
              Mở dự án
            </button>
            <button className="text-button" type="button" onClick={exportProject}>
              Lưu dự án
            </button>
            <button className="text-button benchmark-button" type="button" onClick={loadSeaRatesCase}>
              Nạp ca đối chiếu 50 kiện
            </button>
            <button className="text-button" type="button" onClick={() => { setItems(SAMPLE_ITEMS); setPlan(null); }}>
              ↺ Khôi phục dữ liệu mẫu
            </button>
          </div>
        </div>

        <div className="cargo-card">
          <div className="table-scroll">
            <table className="cargo-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th className="name-col">Tên hàng</th>
                  <th>Số lượng</th>
                  <th>Chiều dài <small>cm</small></th>
                  <th>Chiều rộng <small>cm</small></th>
                  <th>Chiều cao <small>cm</small></th>
                  <th>Cân nặng <small>kg/kiện</small></th>
                  <th>Tính chất <small>xoay &amp; xếp chồng</small></th>
                  <th aria-label="Xóa" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td><span className="row-index">{index + 1}</span></td>
                    <td>
                      <div className="name-input-wrap">
                        <i style={{ background: item.color }} />
                        <input
                          aria-label={`Tên mặt hàng ${index + 1}`}
                          value={item.name}
                          onChange={(event) => updateItem(item.id, "name", event.target.value)}
                        />
                      </div>
                    </td>
                    {(["quantity", "length", "width", "height", "weight"] as const).map((field) => (
                      <td key={field}>
                        <input
                          className="number-input"
                          type="number"
                          min="0"
                          step={field === "quantity" ? "1" : "0.1"}
                          aria-label={`${field} của ${item.name}`}
                          value={item[field]}
                          onChange={(event) => updateItem(item.id, field, Number(event.target.value))}
                        />
                      </td>
                    ))}
                    <td>
                      <div className="cargo-constraints">
                        <button
                          type="button"
                          className={`rotate-toggle ${item.rotatable ? "active" : ""}`}
                          onClick={() => updateItem(item.id, "rotatable", !item.rotatable)}
                          aria-pressed={item.rotatable}
                        >
                          <span className="switch"><i /></span>
                          {item.rotatable ? "Được xoay" : "Giữ nguyên"}
                        </button>
                        {item.rotatable && (
                          <button
                            type="button"
                            className={`rotate-toggle ${item.uprightOnly ? "active" : ""}`}
                            onClick={() =>
                              updateItem(item.id, "uprightOnly", !item.uprightOnly)
                            }
                            aria-pressed={Boolean(item.uprightOnly)}
                          >
                            <span className="switch"><i /></span>
                            {item.uprightOnly ? "Giữ mặt đứng" : "Xoay đủ 6 hướng"}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`rotate-toggle ${item.stackable ? "active" : ""}`}
                          onClick={() => {
                            updateItem(item.id, "stackable", !item.stackable);
                            if (item.stackable) updateItem(item.id, "maxLayers", 1);
                            else if (item.maxLayers <= 1) updateItem(item.id, "maxLayers", 99);
                          }}
                          aria-pressed={item.stackable}
                        >
                          <span className="switch"><i /></span>
                          {item.stackable ? "Được chồng" : "Không chồng"}
                        </button>
                        {item.stackable && (
                          <label className="layer-limit">
                            Tối đa
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="Tự động"
                              value={item.maxLayers >= 99 ? "" : item.maxLayers}
                              aria-label={`Số tầng xếp tối đa của ${item.name}`}
                              onChange={(event) =>
                                updateItem(
                                  item.id,
                                  "maxLayers",
                                  event.target.value === ""
                                    ? 99
                                    : Math.max(1, Math.floor(Number(event.target.value) || 1)),
                                )
                              }
                            />
                            tầng
                          </label>
                        )}
                        {item.stackable && (
                          <label className="layer-limit">
                            Chịu tải trên
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="Không giới hạn"
                              value={item.maxTopLoad || ""}
                              aria-label={`Tải tối đa đặt lên ${item.name}`}
                              onChange={(event) =>
                                updateItem(
                                  item.id,
                                  "maxTopLoad",
                                  Math.max(0, Number(event.target.value) || 0),
                                )
                              }
                            />
                            kg
                          </label>
                        )}
                        <label className="layer-limit">
                          Thứ tự dỡ
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.unloadPriority || 1}
                            aria-label={`Thứ tự dỡ của ${item.name}`}
                            onChange={(event) =>
                              updateItem(
                                item.id,
                                "unloadPriority",
                                Math.max(1, Math.floor(Number(event.target.value) || 1)),
                              )
                            }
                          />
                          <span className="field-help">1 = dỡ trước</span>
                        </label>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete-button"
                        aria-label={`Xóa ${item.name}`}
                        onClick={() => { setItems((current) => current.filter((entry) => entry.id !== item.id)); setPlan(null); }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="add-row" type="button" onClick={addItem}>＋ Thêm mặt hàng</button>
          <div className="cargo-totals">
            <span><small>Tổng số kiện</small><b>{formatNumber(totals.quantity)}</b></span>
            <span><small>Tổng CBM</small><b>{formatNumber(totals.volume, 2)} m³</b></span>
            <span><small>Tổng cân nặng</small><b>{formatNumber(totals.weight)} kg</b></span>
          </div>
        </div>

        <div className="mode-section">
          <div className="section-heading">
            <div>
              <p className="step-label"><span>2</span> Thông tin container</p>
              <h2>Chọn phương án tính</h2>
            </div>
          </div>
          <div className="mode-tabs" role="tablist" aria-label="Phương án tính container">
            <button
              role="tab"
              aria-selected={mode === "auto"}
              className={mode === "auto" ? "active" : ""}
              onClick={() => { setMode("auto"); setPlan(null); }}
            >
              <span className="mode-icon">✦</span>
              <span><b>Tối ưu tự động</b><small>Ưu tiên ít container nhất có thể</small></span>
              <i className="radio" />
            </button>
            <button
              role="tab"
              aria-selected={mode === "manual"}
              className={mode === "manual" ? "active" : ""}
              onClick={() => { setMode("manual"); setPlan(null); }}
            >
              <span className="mode-icon">☷</span>
              <span><b>Tự chọn loại container</b><small>V5 tự tìm số lượng ít nhất trong các loại đã chọn</small></span>
              <i className="radio" />
            </button>
          </div>

          <div className="container-options" id="container-specs">
            {CONTAINERS.map((spec) => (
              <article className="container-option" key={spec.id}>
                <div className="container-title">
                  <div className="mini-container" style={{ "--accent": spec.accent } as React.CSSProperties}><i /><i /><i /></div>
                  <div><b>{spec.id}</b><small>{spec.id === "40HC" ? "High Cube" : "General Purpose"}</small></div>
                </div>
                <dl>
                  <div><dt>Lọt lòng</dt><dd>{spec.length} × {spec.width} × {spec.height} cm</dd></div>
                  <div><dt>Kích thước cửa</dt><dd>{spec.doorWidth} × {spec.doorHeight} cm</dd></div>
                  <div><dt>Dung tích</dt><dd>{spec.volume} m³</dd></div>
                  <div><dt>Vỏ container</dt><dd>{formatNumber(spec.tareWeight)} kg</dd></div>
                  <div><dt>Tải tối đa</dt><dd>{formatNumber(spec.maxWeight)} kg</dd></div>
                </dl>
                {mode === "manual" && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selectedTypes[spec.id]}
                    className={`container-type-toggle ${selectedTypes[spec.id] ? "active" : ""}`}
                    onClick={() => {
                      setSelectedTypes((current) => ({
                        ...current,
                        [spec.id]: !current[spec.id],
                      }));
                      setPlan(null);
                    }}
                  >
                    <i>{selectedTypes[spec.id] ? "✓" : ""}</i>
                    <span>
                      <b>
                        {selectedTypes[spec.id]
                          ? "Được phép sử dụng"
                          : "Không sử dụng"}
                      </b>
                      <small>V5 tự tính số lượng tối thiểu</small>
                    </span>
                  </button>
                )}
              </article>
            ))}
          </div>

          <div className="profile-card">
            <div>
              <p className="profile-title">Mức độ sát thực tế</p>
              <p className="profile-copy">
                Chọn cách hệ thống chừa khoảng thao tác trong lòng container.
              </p>
            </div>
            <div className="profile-options" role="radiogroup" aria-label="Mức dự phòng đóng hàng">
              <button
                type="button"
                role="radio"
                aria-checked={profile === "operational"}
                className={profile === "operational" ? "active" : ""}
                onClick={() => { setProfile("operational"); setPlan(null); }}
              >
                <b>Thực tế vận hành</b>
                <small>Chừa 5 cm chiều dài, 2 cm chiều rộng và 2 cm chiều cao</small>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={profile === "reference"}
                className={profile === "reference" ? "active" : ""}
                onClick={() => { setProfile("reference"); setPlan(null); }}
              >
                <b>So sánh SeaRates</b>
                <small>Dùng toàn bộ kích thước lọt lòng, không cộng khoảng hở</small>
              </button>
            </div>
          </div>

          <div className="safety-settings">
            <div className="safety-settings-heading">
              <div>
                <p className="profile-title">Ràng buộc vận hành V5</p>
                <p className="profile-copy">
                  Các ngưỡng này được kiểm tra trong lúc tìm vị trí, không chỉ báo
                  sau khi đã xếp.
                </p>
              </div>
              <span className="verified-badge">Kiểm tra từng kiện</span>
            </div>
            <div className="settings-grid">
              <label>
                <span>Khoảng hở ngang</span>
                <div><input
                  type="number"
                  min="0"
                  step="0.1"
                  disabled={profile === "reference"}
                  value={profile === "reference" ? 0 : settings.itemGap}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      itemGap: Math.max(0, Number(event.target.value) || 0),
                    }));
                    setPlan(null);
                  }}
                /><em>cm</em></div>
                <small>Giữa các kiện cùng cao độ</small>
              </label>
              <label>
                <span>Mặt đỡ tối thiểu</span>
                <div><input
                  type="number"
                  min="50"
                  max="100"
                  step="1"
                  value={settings.minSupport}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      minSupport: Math.min(
                        100,
                        Math.max(50, Number(event.target.value) || 85),
                      ),
                    }));
                    setPlan(null);
                  }}
                /><em>%</em></div>
                <small>Tâm kiện cũng phải có điểm đỡ</small>
              </label>
              <label>
                <span>Cảnh báo lệch trọng tâm</span>
                <div><input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={settings.cogWarning}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      cogWarning: Math.min(
                        10,
                        Math.max(1, Number(event.target.value) || 5),
                      ),
                    }));
                    setPlan(null);
                  }}
                /><em>%</em></div>
                <small>Khuyến nghị chung CTU Code: ±5%</small>
              </label>
              <label>
                <span>Ngưỡng tải tập trung</span>
                <div><input
                  type="number"
                  min="500"
                  step="100"
                  value={settings.floorPressureWarning}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      floorPressureWarning: Math.max(
                        500,
                        Number(event.target.value) || 4_500,
                      ),
                    }));
                    setPlan(null);
                  }}
                /><em>kg/m²</em></div>
                <small>Ngưỡng cảnh báo lập kế hoạch, không thay CSC plate</small>
              </label>
              <label>
                <span>Độ sâu tìm kiếm</span>
                <select
                  value={settings.searchQuality}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      searchQuality: event.target.value as V5Settings["searchQuality"],
                    }));
                    setPlan(null);
                  }}
                >
                  <option value="balanced">Nhanh</option>
                  <option value="thorough">Kỹ nhất (khuyên dùng)</option>
                </select>
                <small>Thử thêm thứ tự hàng và trạng thái tìm kiếm</small>
              </label>
            </div>
          </div>
        </div>

        {notice && <div className="notice" role="alert">⚠ {notice}</div>}
        <button
          className="calculate-button"
          type="button"
          onClick={calculate}
          disabled={isCalculating}
        >
          <span>{isCalculating ? "◌" : "✦"}</span>{" "}
          {isCalculating ? "Đang kiểm tra và tối ưu..." : "Tính toán phương án V5"}{" "}
          <b>→</b>
        </button>
      </section>

      {plan && (
        <section className="results-section" id="results">
          <div className="shell">
            <div className="results-heading">
              <div>
                <p className="step-label light"><span>3</span> Kết quả tối ưu</p>
                <h2>{remainingCount ? "Phương án hiện tại chưa xếp hết hàng" : "Đã tìm thấy phương án phù hợp"}</h2>
                <p>
                  {mode === "auto"
                    ? `Bộ giải V5 đã so sánh 20GP, 40GP và 40HC · ${
                        profile === "operational" ? "có khoảng dự phòng vận hành" : "theo kích thước danh nghĩa"
                      } · đã đánh giá ${formatNumber(plan.evaluatedPlans)} phương án và ${
                        formatNumber(plan.validation?.checks || 0)
                      } phép kiểm tra hình học/an toàn.`
                    : "Bộ giải V5 chỉ dùng các loại container bạn cho phép và đã tối thiểu hóa tổng số container."}
                </p>
              </div>
              <div className="results-actions">
                <button type="button" onClick={downloadCsv}>⇩ Xuất CSV</button>
                <button type="button" onClick={() => window.print()}>▣ In kế hoạch</button>
              </div>
            </div>

            <div className="summary-grid">
              <article className="primary-summary">
                <small>TỔNG CONTAINER CẦN DÙNG</small>
                <strong>{plan.containers.length}</strong>
                <div>
                  {CONTAINERS.map((spec) => {
                    const count = plan.containers.filter((entry) => entry.spec.id === spec.id).length;
                    return count > 0 ? <span key={spec.id}>{count} × {spec.id}</span> : null;
                  })}
                </div>
              </article>
              <article><small>ĐÃ XẾP</small><strong>{formatNumber(packedQuantity)}<em>/{formatNumber(plan.totalQuantity)} kiện</em></strong><span>{remainingCount ? `Còn ${formatNumber(remainingCount)} kiện` : "Hoàn tất 100%"}</span></article>
              <article><small>TỔNG CBM HÀNG</small><strong>{formatNumber(plan.totalVolume, 2)}<em>m³</em></strong><span>Thể tích danh nghĩa</span></article>
              <article><small>TỔNG KHỐI LƯỢNG</small><strong>{formatNumber(plan.totalWeight)}<em>kg</em></strong><span>Đã kiểm tra tải từng cont</span></article>
              <article className={`validation-summary ${plan.confidence || "medium"}`}>
                <small>MỨC TIN CẬY TÍNH TOÁN</small>
                <strong>
                  {plan.confidence === "high"
                    ? "Cao"
                    : plan.confidence === "low"
                      ? "Thấp"
                      : "Khá"}
                </strong>
                <span>
                  {plan.validation?.errors || 0} lỗi · {plan.validation?.warnings || 0} cảnh báo
                </span>
              </article>
            </div>

            {remainingCount > 0 && (
              <div className="remaining-alert">
                <b>Chưa thể xếp hết {formatNumber(remainingCount)} kiện.</b>
                <span>
                  {mode === "manual"
                    ? "Hãy cho phép thêm loại container khác hoặc chuyển sang “Tối ưu tự động”."
                    : "Hệ thống đã giữ lại các kiện không thể bố trí an toàn trong phương án hiện tại."}
                </span>
                <ul>
                  {items
                    .filter((item) => (plan.remaining[item.id] || 0) > 0)
                    .map((item) => (
                      <li key={item.id}>
                        {item.name}: còn {formatNumber(plan.remaining[item.id])} kiện — {getUnpackedReason(item)}.
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {plan.containers.length > 0 && shownContainer && (
              <div className="plan-viewer">
                <div className="container-list">
                  <div className="list-title">
                    <span>Danh sách container</span>
                    <small>{plan.containers.length} container</small>
                  </div>
                  {plan.containers.map((container, index) => {
                    const volumePct = Math.min(100, (container.usedVolume / container.spec.volume) * 100);
                    const weightPct = Math.min(100, (container.usedWeight / container.spec.maxWeight) * 100);
                    return (
                      <button
                        type="button"
                        key={container.key}
                        className={activeContainer === index ? "active" : ""}
                        onClick={() => setActiveContainer(index)}
                      >
                        <i style={{ background: container.spec.accent }} />
                        <span><b>{container.spec.id} · #{index + 1}</b><small>{formatNumber(volumePct, 1)}% thể tích · {formatNumber(weightPct, 1)}% tải</small></span>
                        <em>›</em>
                      </button>
                    );
                  })}
                </div>
                <div className="diagram-panel">
                  <div className="diagram-toolbar">
                    <div>
                      <span className="live-dot" />
                      <b>{shownContainer.spec.id} · Container #{activeContainer + 1}</b>
                    </div>
                    <div className="view-switch" role="group" aria-label="Chọn góc nhìn">
                      <button type="button" className={viewMode === "3d" ? "active" : ""} onClick={() => setViewMode("3d")}>3D</button>
                      <button type="button" className={viewMode === "top" ? "active" : ""} onClick={() => setViewMode("top")}>Từ trên</button>
                      <button type="button" className={viewMode === "side" ? "active" : ""} onClick={() => setViewMode("side")}>Mặt cạnh</button>
                    </div>
                    {viewMode === "3d" && (
                      <button
                        type="button"
                        className="rotate-view-button"
                        onClick={() => setMirroredView((current) => !current)}
                      >
                        ↻ Xoay góc nhìn
                      </button>
                    )}
                  </div>
                  <ContainerDiagram container={shownContainer} view={viewMode} mirrored={mirroredView} />
                  <div className="diagram-legend">
                    {shownContainer.groups.map((group) => (
                      <span key={group.itemId}><i style={{ background: group.color }} /> {group.name}: <b>{group.count}</b></span>
                    ))}
                    <span><i className="cog-dot" /> Trọng tâm hàng</span>
                  </div>
                  <div className="load-bars">
                    <div>
                      <span><b>Thể tích sử dụng</b><em>{formatNumber(shownContainer.usedVolume, 2)} / {shownContainer.spec.volume} m³</em></span>
                      <i><b style={{ width: `${Math.min(100, (shownContainer.usedVolume / shownContainer.spec.volume) * 100)}%` }} /></i>
                    </div>
                    <div>
                      <span><b>Tải trọng sử dụng</b><em>{formatNumber(shownContainer.usedWeight)} / {formatNumber(shownContainer.spec.maxWeight)} kg</em></span>
                      <i><b style={{ width: `${Math.min(100, (shownContainer.usedWeight / shownContainer.spec.maxWeight) * 100)}%` }} /></i>
                    </div>
                  </div>
                  {shownContainer.issues && shownContainer.issues.length > 0 && (
                    <div className="container-issues">
                      <div>
                        <b>Kiểm tra thực tế container này</b>
                        <span>
                          {shownContainer.issues.filter((issue) => issue.severity === "error").length} lỗi ·{" "}
                          {shownContainer.issues.filter((issue) => issue.severity === "warning").length} cảnh báo
                        </span>
                      </div>
                      <ul>
                        {shownContainer.issues.map((issue, index) => (
                          <li className={issue.severity} key={`${issue.code}-${index}`}>
                            <b>{issue.severity === "error" ? "Lỗi" : issue.severity === "warning" ? "Cảnh báo" : "Ghi chú"}</b>
                            <span>{issue.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {shownAnalytics && (
                    <div className="balance-panel">
                      <div className="balance-heading">
                        <span>
                          <b>Phân bố tải &amp; trọng tâm</b>
                          <small>Ước tính theo tâm khối lượng từng kiện</small>
                        </span>
                        <strong className={shownAnalytics.balanced ? "safe" : "warning"}>
                          {shownAnalytics.balanced ? "Cân bằng tốt" : "Cần kiểm tra chèn buộc"}
                        </strong>
                      </div>
                      <div className="balance-metrics">
                        <span>
                          <small>Dọc container</small>
                          <b>{formatNumber(Math.abs(shownAnalytics.longitudinalOffset), 1)}%</b>
                          <em>
                            {Math.abs(shownAnalytics.longitudinalOffset) < 1
                              ? "gần tâm dọc"
                              : shownAnalytics.longitudinalOffset < 0
                                ? "lệch về đầu"
                                : "lệch về cửa"}
                          </em>
                        </span>
                        <span>
                          <small>Ngang container</small>
                          <b>{formatNumber(Math.abs(shownAnalytics.lateralOffset), 1)}%</b>
                          <em>
                            {Math.abs(shownAnalytics.lateralOffset) < 1
                              ? "gần tâm ngang"
                              : shownAnalytics.lateralOffset < 0
                                ? "lệch trái"
                                : "lệch phải"}
                          </em>
                        </span>
                        <span>
                          <small>Độ cao trọng tâm</small>
                          <b>{formatNumber(shownAnalytics.centerHeight, 1)}%</b>
                          <em>so với chiều cao lọt lòng</em>
                        </span>
                      </div>
                      <div className="weight-zones" aria-label="Phân bố tải theo năm vùng dọc container">
                        {shownAnalytics.zones.map((zone, index) => {
                          const maxZone = Math.max(...shownAnalytics.zones, 1);
                          return (
                            <span key={index}>
                              <i style={{ height: `${Math.max(5, (zone / maxZone) * 100)}%` }} />
                              <small>{index === 0 ? "Đầu" : index === 4 ? "Cửa" : `V${index + 1}`}</small>
                              <em>{formatNumber(zone)} kg</em>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="packing-table">
                    <div className="packing-row packing-head"><span>Mặt hàng</span><span>Số lượng</span><span>Hướng đặt đã chọn</span></div>
                    {shownContainer.groups.map((group) => (
                      <div className="packing-row" key={`${group.itemId}-detail`}>
                        <span><i style={{ background: group.color }} /> {group.name}</span>
                        <span>{group.count} kiện</span>
                        <span>{group.orientationSummary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="shell notes" id="notes">
        <article>
          <span>i</span>
          <div>
            <h3>Cách hệ thống V5 tính</h3>
            <p>
              Bộ giải kết hợp xếp tầng chính xác cho hàng đồng nhất với tìm kiếm điểm cực trị
              3D cho hàng hỗn hợp. Mỗi vị trí được kiểm tra va chạm, cửa, mặt đỡ, tâm đỡ,
              số tầng, tải nén truyền xuống, tải container, thứ tự dỡ và trọng tâm trước khi
              được chấp nhận.
            </p>
          </div>
        </article>
        <article>
          <span>!</span>
          <div>
            <h3>Lưu ý trước khi đóng hàng</h3>
            <p>
              Kết quả là phương án lập kế hoạch có kiểm chứng hình học, không phải chứng nhận
              chèn buộc. Trước khi đóng hàng vẫn phải xác nhận CSC plate, kích thước container
              thực nhận, khả năng chịu nén của bao bì, dầm phân tải, vật liệu chèn lót và quy
              định của hãng tàu/đường bộ.
            </p>
          </div>
        </article>
      </section>

      <footer>
        <div className="shell">
          <a className="brand footer-brand" href="#top">
            <span className="brand-mark"><span /><span /><span /></span>
            <span><b>Linh Luna T&amp;M</b><small>Container Optimizer V5</small></span>
          </a>
          <p>Công cụ hỗ trợ lập kế hoạch xếp hàng container 20GP · 40GP · 40HC</p>
        </div>
      </footer>
    </main>
  );
}
