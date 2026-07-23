export type V4CargoItem = {
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

export type V4ContainerId = "20GP" | "40GP" | "40HC";

export type V4ContainerSpec = {
  id: V4ContainerId;
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

export type V4Profile = "reference" | "operational";

export type V4Settings = {
  itemGap: number;
  minSupport: number;
  cogWarning: number;
  floorPressureWarning: number;
  searchQuality: "balanced" | "thorough";
};

export type V4PackedBox = {
  id: number;
  itemId: number;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  unitWeight: number;
  carriedLoad: number;
  supportIds: number[];
  layer: number;
};

export type V4PackedGroup = {
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
  placements: V4PackedBox[];
  orientationSummary: string;
};

export type V4Issue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
};

export type V4PackedContainer = {
  key: string;
  spec: V4ContainerSpec;
  groups: V4PackedGroup[];
  itemCounts: Record<number, number>;
  usedWeight: number;
  usedVolume: number;
  issues: V4Issue[];
  confidence: "high" | "medium" | "low";
  maxFloorPressure: number;
};

export type V4Plan = {
  containers: V4PackedContainer[];
  remaining: Record<number, number>;
  totalQuantity: number;
  totalWeight: number;
  totalVolume: number;
  evaluatedPlans: number;
  solverVersion: "V4";
  confidence: "high" | "medium" | "low";
  validation: {
    errors: number;
    warnings: number;
    checks: number;
  };
};

type Point = { x: number; y: number; z: number };
type Orientation = { length: number; width: number; height: number };
type Candidate = {
  point: Point;
  orientation: Orientation;
  supportIds: number[];
  supportRatio: number;
  layer: number;
  loadDeltas: Map<number, number>;
  score: number;
};

const EPSILON = 1e-6;
const PROFILE_RESERVE: Record<
  V4Profile,
  { length: number; width: number; height: number }
> = {
  reference: { length: 0, width: 0, height: 0 },
  operational: { length: 5, width: 2, height: 2 },
};

const volumeM3 = (item: Pick<V4CargoItem, "length" | "width" | "height">) =>
  (item.length * item.width * item.height) / 1_000_000;

function uniqueOrientations(item: V4CargoItem): Orientation[] {
  const { length, width, height } = item;
  const values: Orientation[] = !item.rotatable
    ? [{ length, width, height }]
    : item.uprightOnly
      ? [
          { length, width, height },
          { length: width, width: length, height },
        ]
      : [
          { length, width, height },
          { length, width: height, height: width },
          { length: width, width: length, height },
          { length: width, width: height, height: length },
          { length: height, width: length, height: width },
          { length: height, width, height: length },
        ];
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.length}|${value.width}|${value.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function boxesIntersect(a: V4PackedBox, b: V4PackedBox) {
  return (
    a.x < b.x + b.length - EPSILON &&
    a.x + a.length > b.x + EPSILON &&
    a.y < b.y + b.width - EPSILON &&
    a.y + a.width > b.y + EPSILON &&
    a.z < b.z + b.height - EPSILON &&
    a.z + a.height > b.z + EPSILON
  );
}

function horizontalGapViolated(a: V4PackedBox, b: V4PackedBox, gap: number) {
  if (gap <= 0) return false;
  const verticalOverlap = overlap1d(
    a.z,
    a.z + a.height,
    b.z,
    b.z + b.height,
  );
  if (verticalOverlap <= EPSILON) return false;
  const xOverlapWithGap =
    a.x < b.x + b.length + gap - EPSILON &&
    a.x + a.length + gap > b.x + EPSILON;
  const yOverlapWithGap =
    a.y < b.y + b.width + gap - EPSILON &&
    a.y + a.width + gap > b.y + EPSILON;
  return xOverlapWithGap && yOverlapWithGap;
}

function itemById(items: V4CargoItem[], id: number) {
  return items.find((item) => item.id === id);
}

function maxTopLoad(item: V4CargoItem | undefined) {
  if (!item || !item.stackable) return 0;
  const configured = item.maxTopLoad;
  return configured == null || configured <= 0
    ? Number.POSITIVE_INFINITY
    : configured;
}

function supportFor(
  point: Point,
  orientation: Orientation,
  placements: V4PackedBox[],
) {
  if (point.z <= EPSILON) {
    return { supportIds: [] as number[], supportRatio: 1 };
  }
  const supports = placements
    .filter(
      (box) =>
        Math.abs(box.z + box.height - point.z) <= 0.01 &&
        overlap1d(
          point.x,
          point.x + orientation.length,
          box.x,
          box.x + box.length,
        ) > EPSILON &&
        overlap1d(
          point.y,
          point.y + orientation.width,
          box.y,
          box.y + box.width,
        ) > EPSILON,
    )
    .map((box) => {
      const area =
        overlap1d(
          point.x,
          point.x + orientation.length,
          box.x,
          box.x + box.length,
        ) *
        overlap1d(
          point.y,
          point.y + orientation.width,
          box.y,
          box.y + box.width,
        );
      return { box, area };
    });
  const footprint = orientation.length * orientation.width;
  return {
    supportIds: supports.map((entry) => entry.box.id),
    supportRatio:
      supports.reduce((sum, entry) => sum + entry.area, 0) /
      Math.max(footprint, EPSILON),
  };
}

function supportLayer(
  itemId: number,
  supportIds: number[],
  placements: V4PackedBox[],
) {
  const supports = supportIds
    .map((id) => placements.find((box) => box.id === id))
    .filter((box): box is V4PackedBox => Boolean(box));
  const sameItemLayers = supports
    .filter((box) => box.itemId === itemId)
    .map((box) => box.layer);
  return sameItemLayers.length ? Math.max(...sameItemLayers) + 1 : 1;
}

function loadDeltasFor(
  directSupportIds: number[],
  addedWeight: number,
  placements: V4PackedBox[],
) {
  const deltas = new Map<number, number>();
  const visit = (supportIds: number[], weight: number, depth: number) => {
    if (!supportIds.length || weight <= EPSILON || depth > 64) return;
    const supports = supportIds
      .map((id) => placements.find((box) => box.id === id))
      .filter((box): box is V4PackedBox => Boolean(box));
    if (!supports.length) return;
    const share = weight / supports.length;
    supports.forEach((support) => {
      deltas.set(support.id, (deltas.get(support.id) ?? 0) + share);
      visit(support.supportIds, share, depth + 1);
    });
  };
  visit(directSupportIds, addedWeight, 0);
  return deltas;
}

function centerIsSupported(
  point: Point,
  orientation: Orientation,
  supportIds: number[],
  placements: V4PackedBox[],
) {
  if (point.z <= EPSILON) return true;
  const centerX = point.x + orientation.length / 2;
  const centerY = point.y + orientation.width / 2;
  return supportIds.some((id) => {
    const box = placements.find((entry) => entry.id === id);
    return (
      box &&
      centerX >= box.x - EPSILON &&
      centerX <= box.x + box.length + EPSILON &&
      centerY >= box.y - EPSILON &&
      centerY <= box.y + box.width + EPSILON
    );
  });
}

function loadIsAllowed(
  deltas: Map<number, number>,
  placements: V4PackedBox[],
  items: V4CargoItem[],
) {
  for (const [id, delta] of deltas.entries()) {
    const support = placements.find((box) => box.id === id);
    if (!support) continue;
    const item = itemById(items, support.itemId);
    if (support.carriedLoad + delta > maxTopLoad(item) + EPSILON) return false;
  }
  return true;
}

function candidateScore(
  item: V4CargoItem,
  point: Point,
  orientation: Orientation,
  supportRatio: number,
  placements: V4PackedBox[],
  usable: { length: number; width: number; height: number },
  priorityRange: { min: number; max: number },
) {
  const priority = item.unloadPriority ?? 1;
  const ratio =
    priorityRange.max === priorityRange.min
      ? 0.5
      : (priority - priorityRange.min) /
        (priorityRange.max - priorityRange.min);
  // x=0 is the closed/head end; x=length is the door. Priority 1 is unloaded first.
  const targetX = usable.length * (0.86 - ratio * 0.72);
  const centerX = point.x + orientation.length / 2;
  const predictedWeight =
    placements.reduce((sum, box) => sum + box.unitWeight, 0) + item.weight;
  const predictedMoment =
    placements.reduce(
      (sum, box) => sum + (box.x + box.length / 2) * box.unitWeight,
      0,
    ) +
    centerX * item.weight;
  const predictedCog = predictedMoment / Math.max(predictedWeight, 1);
  const cogPenalty =
    Math.abs(predictedCog / usable.length - 0.5) * usable.length;
  const edgeWaste =
    Math.min(
      point.x,
      Math.max(0, usable.length - point.x - orientation.length),
    ) +
    Math.min(
      point.y,
      Math.max(0, usable.width - point.y - orientation.width),
    );
  return (
    point.z * (60 + item.weight / 5) +
    Math.abs(centerX - targetX) * 0.85 +
    cogPenalty * 1.8 +
    (1 - supportRatio) * 2_000 +
    edgeWaste * 0.08 +
    point.y * 0.04 +
    point.x * 0.015
  );
}

function getCandidate(
  item: V4CargoItem,
  point: Point,
  orientation: Orientation,
  placements: V4PackedBox[],
  items: V4CargoItem[],
  spec: V4ContainerSpec,
  usable: { length: number; width: number; height: number },
  settings: V4Settings,
  profile: V4Profile,
  priorityRange: { min: number; max: number },
): Candidate | null {
  if (
    point.x < -EPSILON ||
    point.y < -EPSILON ||
    point.z < -EPSILON ||
    point.x + orientation.length > usable.length + EPSILON ||
    point.y + orientation.width > usable.width + EPSILON ||
    point.z + orientation.height > usable.height + EPSILON
  ) {
    return null;
  }
  const strictDoorFit =
    orientation.width <= spec.doorWidth + EPSILON &&
    orientation.height <= spec.doorHeight + EPSILON;
  const anyDoorFit = uniqueOrientations(item).some(
    (entry) =>
      entry.width <= spec.doorWidth + EPSILON &&
      entry.height <= spec.doorHeight + EPSILON,
  );
  if (profile === "operational" ? !strictDoorFit : !anyDoorFit) return null;
  if (!item.stackable && point.z > EPSILON) return null;

  const provisional: V4PackedBox = {
    id: -1,
    itemId: item.id,
    x: point.x,
    y: point.y,
    z: point.z,
    ...orientation,
    unitWeight: item.weight,
    carriedLoad: 0,
    supportIds: [],
    layer: 1,
  };
  if (
    placements.some(
      (box) =>
        boxesIntersect(provisional, box) ||
        horizontalGapViolated(provisional, box, settings.itemGap),
    )
  ) {
    return null;
  }

  const { supportIds, supportRatio } = supportFor(
    point,
    orientation,
    placements,
  );
  const requiredSupport = Math.max(
    0.5,
    Math.min(1, (item.minSupport ?? settings.minSupport) / 100),
  );
  if (
    point.z > EPSILON &&
    (supportRatio + EPSILON < requiredSupport ||
      !centerIsSupported(point, orientation, supportIds, placements))
  ) {
    return null;
  }
  const supportingItems = supportIds
    .map((id) => placements.find((box) => box.id === id))
    .map((box) => itemById(items, box?.itemId ?? -1));
  if (supportingItems.some((support) => !support?.stackable)) return null;

  const layer = supportLayer(item.id, supportIds, placements);
  if (layer > Math.max(1, Math.floor(item.maxLayers || 1))) return null;
  const loadDeltas = loadDeltasFor(supportIds, item.weight, placements);
  if (!loadIsAllowed(loadDeltas, placements, items)) return null;

  return {
    point,
    orientation,
    supportIds,
    supportRatio,
    layer,
    loadDeltas,
    score: candidateScore(
      item,
      point,
      orientation,
      supportRatio,
      placements,
      usable,
      priorityRange,
    ),
  };
}

function pointKey(point: Point) {
  return `${point.x.toFixed(3)}|${point.y.toFixed(3)}|${point.z.toFixed(3)}`;
}

function prunePoints(
  points: Point[],
  placements: V4PackedBox[],
  usable: { length: number; width: number; height: number },
  limit: number,
) {
  const unique = new Map<string, Point>();
  points.forEach((point) => {
    if (
      point.x < -EPSILON ||
      point.y < -EPSILON ||
      point.z < -EPSILON ||
      point.x >= usable.length - EPSILON ||
      point.y >= usable.width - EPSILON ||
      point.z >= usable.height - EPSILON
    ) {
      return;
    }
    const inside = placements.some(
      (box) =>
        point.x > box.x + EPSILON &&
        point.x < box.x + box.length - EPSILON &&
        point.y > box.y + EPSILON &&
        point.y < box.y + box.width - EPSILON &&
        point.z > box.z + EPSILON &&
        point.z < box.z + box.height - EPSILON,
    );
    if (!inside) unique.set(pointKey(point), point);
  });
  return [...unique.values()]
    .sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y)
    .slice(0, limit);
}

function buildItemOrders(items: V4CargoItem[], thorough: boolean) {
  const active = [...items];
  const orders = [
    [...active].sort((a, b) => volumeM3(b) - volumeM3(a)),
    [...active].sort((a, b) => b.weight - a.weight),
    [...active].sort((a, b) => b.weight / volumeM3(b) - a.weight / volumeM3(a)),
    [...active].sort(
      (a, b) =>
        (b.unloadPriority ?? 1) - (a.unloadPriority ?? 1) ||
        b.weight - a.weight,
    ),
    [...active].sort(
      (a, b) =>
        Number(a.stackable) - Number(b.stackable) ||
        volumeM3(b) - volumeM3(a),
    ),
    [...active].sort(
      (a, b) =>
        b.length * b.width - a.length * a.width || b.height - a.height,
    ),
  ];
  if (thorough) {
    const base = orders[0];
    for (let index = 0; index < Math.min(8, base.length); index += 1) {
      orders.push([...base.slice(index), ...base.slice(0, index)]);
    }
    orders.push([...orders[0]].reverse(), [...orders[1]].reverse());
  }
  const signatures = new Set<string>();
  return orders.filter((order) => {
    const signature = order.map((item) => item.id).join(",");
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

function groupPlacements(
  spec: V4ContainerSpec,
  items: V4CargoItem[],
  placements: V4PackedBox[],
) {
  return items
    .map((item) => {
      const itemPlacements = placements.filter((box) => box.itemId === item.id);
      if (!itemPlacements.length) return null;
      const orientations = new Map<string, number>();
      itemPlacements.forEach((box) => {
        const key = `${box.length} × ${box.width} × ${box.height} cm`;
        orientations.set(key, (orientations.get(key) ?? 0) + 1);
      });
      const first = itemPlacements[0];
      return {
        itemId: item.id,
        name: item.name,
        color: item.color,
        unitWeight: item.weight,
        count: itemPlacements.length,
        length: first.length,
        width: first.width,
        height: first.height,
        x: Math.min(...itemPlacements.map((box) => box.x)),
        usedLength: Math.max(
          ...itemPlacements.map((box) => box.x + box.length),
        ),
        placements: itemPlacements,
        orientationSummary: [...orientations.entries()]
          .map(([orientation, count]) => `${count} kiện: ${orientation}`)
          .join(" + "),
      } satisfies V4PackedGroup;
    })
    .filter((group): group is V4PackedGroup => Boolean(group));
}

function centerPlacements(
  placements: V4PackedBox[],
  usable: { length: number; width: number; height: number },
  items: V4CargoItem[],
) {
  if (!placements.length) return;
  const priorities = new Set(
    placements.map(
      (box) => itemById(items, box.itemId)?.unloadPriority ?? 1,
    ),
  );
  const minX = Math.min(...placements.map((box) => box.x));
  const maxX = Math.max(...placements.map((box) => box.x + box.length));
  const minY = Math.min(...placements.map((box) => box.y));
  const maxY = Math.max(...placements.map((box) => box.y + box.width));
  const shiftX =
    priorities.size === 1
      ? Math.max(0, (usable.length - (maxX - minX)) / 2 - minX)
      : 0;
  const shiftY = Math.max(0, (usable.width - (maxY - minY)) / 2 - minY);
  placements.forEach((box) => {
    box.x += shiftX;
    box.y += shiftY;
  });
}

function analytics(
  placements: V4PackedBox[],
  spec: V4ContainerSpec,
) {
  const totalWeight = placements.reduce(
    (sum, box) => sum + box.unitWeight,
    0,
  );
  const center = placements.reduce(
    (current, box) => ({
      x: current.x + (box.x + box.length / 2) * box.unitWeight,
      y: current.y + (box.y + box.width / 2) * box.unitWeight,
      z: current.z + (box.z + box.height / 2) * box.unitWeight,
    }),
    { x: 0, y: 0, z: 0 },
  );
  if (totalWeight > 0) {
    center.x /= totalWeight;
    center.y /= totalWeight;
    center.z /= totalWeight;
  }
  return {
    longitudinal: totalWeight
      ? (center.x / spec.length - 0.5) * 100
      : 0,
    lateral: totalWeight ? (center.y / spec.width - 0.5) * 100 : 0,
    vertical: totalWeight ? (center.z / spec.height) * 100 : 0,
  };
}

function validateContainer(
  placements: V4PackedBox[],
  items: V4CargoItem[],
  spec: V4ContainerSpec,
  settings: V4Settings,
  profile: V4Profile,
) {
  const issues: V4Issue[] = [];
  const reserve = PROFILE_RESERVE[profile];
  const usable = {
    length: spec.length - reserve.length,
    width: spec.width - reserve.width,
    height: spec.height - reserve.height,
  };
  let checks = 0;
  placements.forEach((box, index) => {
    checks += 1;
    if (
      box.x < -EPSILON ||
      box.y < -EPSILON ||
      box.z < -EPSILON ||
      box.x + box.length > usable.length + EPSILON ||
      box.y + box.width > usable.width + EPSILON ||
      box.z + box.height > usable.height + EPSILON
    ) {
      issues.push({
        severity: "error",
        code: "OUT_OF_BOUNDS",
        message: `Kiện #${index + 1} vượt kích thước lọt lòng.`,
      });
    }
    if (
      profile === "operational" &&
      (box.width > spec.doorWidth + EPSILON ||
        box.height > spec.doorHeight + EPSILON)
    ) {
      issues.push({
        severity: "error",
        code: "DOOR_BLOCKED",
        message: `Kiện #${index + 1} không lọt cửa theo hướng xếp.`,
      });
    }
    placements.slice(index + 1).forEach((other) => {
      checks += 1;
      if (boxesIntersect(box, other)) {
        issues.push({
          severity: "error",
          code: "COLLISION",
          message: `Phát hiện hai kiện giao nhau tại vị trí ${index + 1}.`,
        });
      }
    });
  });
  const usedWeight = placements.reduce(
    (sum, box) => sum + box.unitWeight,
    0,
  );
  checks += 1;
  if (usedWeight > spec.maxWeight + EPSILON) {
    issues.push({
      severity: "error",
      code: "OVERWEIGHT",
      message: `Vượt tải hàng tối đa ${Math.round(
        usedWeight - spec.maxWeight,
      )} kg.`,
    });
  }
  const cog = analytics(placements, spec);
  checks += 3;
  if (
    Math.abs(cog.longitudinal) > settings.cogWarning ||
    Math.abs(cog.lateral) > settings.cogWarning
  ) {
    issues.push({
      severity:
        Math.max(Math.abs(cog.longitudinal), Math.abs(cog.lateral)) > 10
          ? "error"
          : "warning",
      code: "COG_OFFSET",
      message: `Trọng tâm lệch ${Math.max(
        Math.abs(cog.longitudinal),
        Math.abs(cog.lateral),
      ).toFixed(1)}%; mục tiêu vận hành là trong ±${settings.cogWarning}%.`,
    });
  }
  if (cog.vertical > 50) {
    issues.push({
      severity: "warning",
      code: "COG_HIGH",
      message: `Trọng tâm cao ${cog.vertical.toFixed(
        1,
      )}% chiều cao container; cần kiểm tra chèn buộc.`,
    });
  }

  let maxFloorPressure = 0;
  placements
    .filter((box) => box.z <= EPSILON)
    .forEach((box) => {
      const pressure =
        (box.unitWeight + box.carriedLoad) /
        Math.max((box.length * box.width) / 10_000, EPSILON);
      maxFloorPressure = Math.max(maxFloorPressure, pressure);
    });
  checks += placements.filter((box) => box.z <= EPSILON).length;
  if (maxFloorPressure > settings.floorPressureWarning) {
    issues.push({
      severity: "warning",
      code: "FLOOR_PRESSURE",
      message: `Tải tập trung ước tính ${Math.round(
        maxFloorPressure,
      )} kg/m² vượt ngưỡng cảnh báo ${Math.round(
        settings.floorPressureWarning,
      )} kg/m²; cần dầm phân tải và xác nhận với đơn vị khai thác.`,
    });
  }
  const compressed = new Map<string, V4Issue>();
  issues.forEach((issue) => compressed.set(`${issue.code}|${issue.message}`, issue));
  return {
    issues: [...compressed.values()],
    checks,
    maxFloorPressure,
  };
}

function packExtremePoints(
  spec: V4ContainerSpec,
  items: V4CargoItem[],
  remaining: Record<number, number>,
  order: V4CargoItem[],
  profile: V4Profile,
  settings: V4Settings,
) {
  const reserve = PROFILE_RESERVE[profile];
  const usable = {
    length: Math.max(0, spec.length - reserve.length),
    width: Math.max(0, spec.width - reserve.width),
    height: Math.max(0, spec.height - reserve.height),
  };
  const priorities = items.map((item) => item.unloadPriority ?? 1);
  const priorityRange = {
    min: Math.min(...priorities, 1),
    max: Math.max(...priorities, 1),
  };
  let points: Point[] = [{ x: 0, y: 0, z: 0 }];
  const placements: V4PackedBox[] = [];
  const counts: Record<number, number> = {};
  let usedWeight = 0;
  let nextId = 1;
  const pointLimit = settings.searchQuality === "thorough" ? 900 : 450;

  for (const item of order) {
    let available = Math.max(0, remaining[item.id] ?? 0);
    while (available > 0 && usedWeight + item.weight <= spec.maxWeight + EPSILON) {
      let best: Candidate | null = null;
      const orientations = uniqueOrientations(item);
      for (const point of points) {
        for (const orientation of orientations) {
          const candidate = getCandidate(
            item,
            point,
            orientation,
            placements,
            items,
            spec,
            usable,
            settings,
            profile,
            priorityRange,
          );
          if (!candidate) continue;
          if (!best || candidate.score < best.score) best = candidate;
        }
      }
      if (!best) break;
      const box: V4PackedBox = {
        id: nextId,
        itemId: item.id,
        x: best.point.x,
        y: best.point.y,
        z: best.point.z,
        ...best.orientation,
        unitWeight: item.weight,
        carriedLoad: 0,
        supportIds: best.supportIds,
        layer: best.layer,
      };
      best.loadDeltas.forEach((delta, id) => {
        const support = placements.find((entry) => entry.id === id);
        if (support) support.carriedLoad += delta;
      });
      placements.push(box);
      nextId += 1;
      usedWeight += item.weight;
      counts[item.id] = (counts[item.id] ?? 0) + 1;
      available -= 1;
      points.push(
        {
          x: box.x + box.length + settings.itemGap,
          y: box.y,
          z: box.z,
        },
        {
          x: box.x,
          y: box.y + box.width + settings.itemGap,
          z: box.z,
        },
        { x: box.x, y: box.y, z: box.z + box.height },
        {
          x: box.x + box.length + settings.itemGap,
          y: box.y + box.width + settings.itemGap,
          z: box.z,
        },
      );
      points = prunePoints(points, placements, usable, pointLimit);
    }
  }
  centerPlacements(placements, usable, items);
  return { placements, counts, usedWeight };
}

type RowOption = Orientation;
const SCALE = 10;
const scaledUp = (value: number) => Math.ceil(value * SCALE - EPSILON);
const scaledDown = (value: number) => Math.floor(value * SCALE + EPSILON);

function bestRows(
  options: RowOption[],
  width: number,
  length: number,
  gap: number,
) {
  const maxWidth = scaledDown(width);
  const best = Array<number>(maxWidth + 1).fill(Number.NEGATIVE_INFINITY);
  const previous: Array<{ width: number; option: RowOption } | null> =
    Array(maxWidth + 1).fill(null);
  best[0] = 0;
  for (let used = 0; used <= maxWidth; used += 1) {
    if (!Number.isFinite(best[used])) continue;
    options.forEach((option) => {
      const count = Math.floor(
        (length + gap + EPSILON) / (option.length + gap),
      );
      const next = used + scaledUp(option.width + gap);
      if (count <= 0 || next > maxWidth) return;
      if (best[used] + count > best[next]) {
        best[next] = best[used] + count;
        previous[next] = { width: used, option };
      }
    });
  }
  let cursor = 0;
  for (let widthIndex = 1; widthIndex <= maxWidth; widthIndex += 1) {
    if (best[widthIndex] > best[cursor]) cursor = widthIndex;
  }
  const rows: RowOption[] = [];
  const usedWidth = cursor / SCALE;
  while (cursor > 0 && previous[cursor]) {
    const step = previous[cursor]!;
    rows.push(step.option);
    cursor = step.width;
  }
  return { rows: rows.reverse(), count: Math.max(0, best[scaledDown(usedWidth)]) };
}

function packHomogeneous(
  spec: V4ContainerSpec,
  item: V4CargoItem,
  available: number,
  profile: V4Profile,
  settings: V4Settings,
) {
  const reserve = PROFILE_RESERVE[profile];
  const usable = {
    length: spec.length - reserve.length,
    width: spec.width - reserve.width,
    height: spec.height - reserve.height,
  };
  const byHeight = new Map<number, Orientation[]>();
  uniqueOrientations(item)
    .filter((orientation) =>
      profile === "operational"
        ? orientation.width <= spec.doorWidth + EPSILON &&
          orientation.height <= spec.doorHeight + EPSILON
        : uniqueOrientations(item).some(
            (entry) =>
              entry.width <= spec.doorWidth + EPSILON &&
              entry.height <= spec.doorHeight + EPSILON,
          ),
    )
    .forEach((orientation) => {
      const values = byHeight.get(orientation.height) ?? [];
      values.push(orientation);
      byHeight.set(orientation.height, values);
    });
  const layerByCompression = Number.isFinite(maxTopLoad(item))
    ? Math.floor(maxTopLoad(item) / item.weight) + 1
    : Number.POSITIVE_INFINITY;
  const candidates = [...byHeight.entries()]
    .map(([height, options]) => {
      const layout = bestRows(
        options,
        usable.width,
        usable.length,
        settings.itemGap,
      );
      const layers = Math.min(
        item.stackable ? Math.max(1, Math.floor(item.maxLayers)) : 1,
        Math.floor((usable.height + EPSILON) / height),
        layerByCompression,
      );
      return {
        height,
        layout,
        layers,
        capacity: layout.count * layers,
      };
    })
    .filter((candidate) => candidate.capacity > 0)
    .sort((a, b) => b.capacity - a.capacity);
  const chosen = candidates[0];
  if (!chosen) return { placements: [] as V4PackedBox[], counts: {}, usedWeight: 0 };
  const maxByWeight = Math.floor(spec.maxWeight / item.weight);
  let remaining = Math.min(available, chosen.capacity, maxByWeight);
  const placements: V4PackedBox[] = [];
  let id = 1;
  for (let layer = 0; layer < chosen.layers && remaining > 0; layer += 1) {
    let y = 0;
    chosen.layout.rows.forEach((row) => {
      const inRow = Math.min(
        remaining,
        Math.floor(
          (usable.length + settings.itemGap + EPSILON) /
            (row.length + settings.itemGap),
        ),
      );
      for (let column = 0; column < inRow; column += 1) {
        placements.push({
          id,
          itemId: item.id,
          x: column * (row.length + settings.itemGap),
          y,
          z: layer * chosen.height,
          length: row.length,
          width: row.width,
          height: chosen.height,
          unitWeight: item.weight,
          carriedLoad: layer < chosen.layers - 1 ? item.weight * (chosen.layers - layer - 1) : 0,
          supportIds: layer === 0 ? [] : [],
          layer: layer + 1,
        });
        id += 1;
      }
      remaining -= inRow;
      y += row.width + settings.itemGap;
    });
  }
  centerPlacements(placements, usable, [item]);
  return {
    placements,
    counts: { [item.id]: placements.length },
    usedWeight: placements.length * item.weight,
  };
}

function packContainer(
  spec: V4ContainerSpec,
  items: V4CargoItem[],
  remaining: Record<number, number>,
  key: string,
  profile: V4Profile,
  settings: V4Settings,
): V4PackedContainer & { checks: number; attempts: number } {
  const active = items.filter((item) => (remaining[item.id] ?? 0) > 0);
  const attempts =
    active.length === 1
      ? [
          packHomogeneous(
            spec,
            active[0],
            remaining[active[0].id] ?? 0,
            profile,
            settings,
          ),
        ]
      : buildItemOrders(active, settings.searchQuality === "thorough").map(
          (order) =>
            packExtremePoints(
              spec,
              active,
              remaining,
              order,
              profile,
              settings,
            ),
        );
  const ranked = attempts
    .map((attempt) => {
      const validation = validateContainer(
        attempt.placements,
        active,
        spec,
        settings,
        profile,
      );
      const usedVolume = attempt.placements.reduce(
        (sum, box) =>
          sum +
          (box.length * box.width * box.height) / 1_000_000,
        0,
      );
      const cog = analytics(attempt.placements, spec);
      const penalty =
        validation.issues.filter((issue) => issue.severity === "error").length *
          1_000_000 +
        validation.issues.filter((issue) => issue.severity === "warning").length *
          10_000 +
        (Math.abs(cog.longitudinal) + Math.abs(cog.lateral)) * 10;
      return { ...attempt, validation, usedVolume, penalty };
    })
    .sort(
      (a, b) =>
        b.usedVolume - a.usedVolume ||
        b.usedWeight - a.usedWeight ||
        a.penalty - b.penalty,
    );
  const best = ranked[0] ?? {
    placements: [],
    counts: {},
    usedWeight: 0,
    usedVolume: 0,
    validation: { issues: [], checks: 0, maxFloorPressure: 0 },
  };
  const errors = best.validation.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warnings = best.validation.issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  return {
    key,
    spec,
    groups: groupPlacements(spec, active, best.placements),
    itemCounts: best.counts,
    usedWeight: best.usedWeight,
    usedVolume: best.usedVolume,
    issues: best.validation.issues,
    confidence: errors ? "low" : warnings ? "medium" : "high",
    maxFloorPressure: best.validation.maxFloorPressure,
    checks: best.validation.checks,
    attempts: attempts.length,
  };
}

function subtract(
  remaining: Record<number, number>,
  packed: V4PackedContainer,
) {
  const next = { ...remaining };
  Object.entries(packed.itemCounts).forEach(([id, count]) => {
    next[Number(id)] = Math.max(0, (next[Number(id)] ?? 0) - count);
  });
  return next;
}

export function createV4Plan(
  items: V4CargoItem[],
  containers: V4ContainerSpec[],
  mode: "auto" | "manual",
  manualCounts: Record<V4ContainerId, number>,
  profile: V4Profile,
  settings: V4Settings,
): V4Plan {
  const cleanItems = items
    .filter(
      (item) =>
        item.quantity > 0 &&
        item.length > 0 &&
        item.width > 0 &&
        item.height > 0 &&
        item.weight > 0,
    )
    .map((item) => ({
      ...item,
      quantity: Math.floor(item.quantity),
      maxLayers: Math.max(1, Math.floor(item.maxLayers || 1)),
    }));
  const initialRemaining = Object.fromEntries(
    cleanItems.map((item) => [item.id, item.quantity]),
  );
  let remaining = { ...initialRemaining };
  let packedContainers: V4PackedContainer[] = [];
  let evaluatedPlans = 0;
  let checks = 0;

  if (mode === "manual") {
    const requested = containers.flatMap((spec) =>
      Array.from(
        { length: Math.max(0, Math.floor(manualCounts[spec.id] || 0)) },
        () => spec,
      ),
    );
    requested.forEach((spec, index) => {
      const packed = packContainer(
        spec,
        cleanItems,
        remaining,
        `${spec.id}-${index + 1}`,
        profile,
        settings,
      );
      evaluatedPlans += packed.attempts;
      checks += packed.checks;
      packedContainers.push(packed);
      remaining = subtract(remaining, packed);
    });
  } else {
    type State = {
      containers: V4PackedContainer[];
      remaining: Record<number, number>;
      nominalCapacity: number;
    };
    const totalVolume = cleanItems.reduce(
      (sum, item) => sum + item.quantity * volumeM3(item),
      0,
    );
    const totalWeight = cleanItems.reduce(
      (sum, item) => sum + item.quantity * item.weight,
      0,
    );
    const totalQuantity = cleanItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const complete = (state: State) =>
      Object.values(state.remaining).every((count) => count <= 0);
    const stateScore = (state: State) => {
      const quantityLeft = Object.values(state.remaining).reduce(
        (sum, value) => sum + value,
        0,
      );
      const volumeLeft = cleanItems.reduce(
        (sum, item) =>
          sum + (state.remaining[item.id] ?? 0) * volumeM3(item),
        0,
      );
      const weightLeft = cleanItems.reduce(
        (sum, item) =>
          sum + (state.remaining[item.id] ?? 0) * item.weight,
        0,
      );
      return (
        quantityLeft / Math.max(totalQuantity, 1) +
        volumeLeft / Math.max(totalVolume, 0.001) +
        weightLeft / Math.max(totalWeight, 1) +
        state.nominalCapacity /
          Math.max(100 * Math.max(...containers.map((entry) => entry.volume)), 1)
      );
    };
    const cache = new Map<string, ReturnType<typeof packContainer>>();
    const getPacked = (
      spec: V4ContainerSpec,
      stateRemaining: Record<number, number>,
      key: string,
    ) => {
      const signature = cleanItems
        .map((item) => `${item.id}:${stateRemaining[item.id] ?? 0}`)
        .join("|");
      const cacheKey = `${spec.id}|${profile}|${settings.searchQuality}|${signature}`;
      const cached = cache.get(cacheKey);
      if (cached) return { ...cached, key };
      const packed = packContainer(
        spec,
        cleanItems,
        stateRemaining,
        key,
        profile,
        settings,
      );
      cache.set(cacheKey, packed);
      evaluatedPlans += packed.attempts;
      checks += packed.checks;
      return packed;
    };
    const theoreticalMinimum = Math.max(
      1,
      Math.ceil(
        totalVolume / Math.max(...containers.map((entry) => entry.volume)),
      ),
      Math.ceil(
        totalWeight / Math.max(...containers.map((entry) => entry.maxWeight)),
      ),
    );
    const maxDepth = Math.min(80, theoreticalMinimum + 12);
    const beamWidth = settings.searchQuality === "thorough" ? 32 : 18;
    let states: State[] = [
      { containers: [], remaining, nominalCapacity: 0 },
    ];
    let bestPartial = states[0];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const expanded: State[] = [];
      states.forEach((state) => {
        containers.forEach((spec) => {
          const packed = getPacked(
            spec,
            state.remaining,
            `${spec.id}-${state.containers.length + 1}`,
          );
          if (!Object.values(packed.itemCounts).some((count) => count > 0)) {
            return;
          }
          expanded.push({
            containers: [...state.containers, packed],
            remaining: subtract(state.remaining, packed),
            nominalCapacity: state.nominalCapacity + spec.volume,
          });
        });
      });
      if (!expanded.length) break;
      const winners = expanded.filter(complete);
      if (winners.length) {
        const winner = winners.sort(
          (a, b) =>
            a.nominalCapacity - b.nominalCapacity ||
            a.containers.filter((entry) => entry.spec.id === "40HC").length -
              b.containers.filter((entry) => entry.spec.id === "40HC").length,
        )[0];
        packedContainers = winner.containers;
        remaining = winner.remaining;
        break;
      }
      const deduped = new Map<string, State>();
      expanded.forEach((state) => {
        const signature = cleanItems
          .map((item) => `${item.id}:${state.remaining[item.id] ?? 0}`)
          .join("|");
        const current = deduped.get(signature);
        if (!current || state.nominalCapacity < current.nominalCapacity) {
          deduped.set(signature, state);
        }
      });
      states = [...deduped.values()]
        .sort((a, b) => stateScore(a) - stateScore(b))
        .slice(0, beamWidth);
      if (states[0] && stateScore(states[0]) < stateScore(bestPartial)) {
        bestPartial = states[0];
      }
    }
    if (!packedContainers.length && bestPartial.containers.length) {
      packedContainers = bestPartial.containers;
      remaining = bestPartial.remaining;
    }
  }

  const allIssues = packedContainers.flatMap((container) => container.issues);
  const errors = allIssues.filter((issue) => issue.severity === "error").length;
  const warnings = allIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const hasMixedCargo = cleanItems.length > 1;
  return {
    containers: packedContainers,
    remaining,
    totalQuantity: cleanItems.reduce((sum, item) => sum + item.quantity, 0),
    totalWeight: cleanItems.reduce(
      (sum, item) => sum + item.quantity * item.weight,
      0,
    ),
    totalVolume: cleanItems.reduce(
      (sum, item) => sum + item.quantity * volumeM3(item),
      0,
    ),
    evaluatedPlans,
    solverVersion: "V4",
    confidence: errors
      ? "low"
      : warnings || hasMixedCargo
        ? "medium"
        : "high",
    validation: { errors, warnings, checks },
  };
}
