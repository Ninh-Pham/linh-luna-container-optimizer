import assert from "node:assert/strict";
import test from "node:test";
import {
  createV4Plan,
  type V4CargoItem,
  type V4ContainerSpec,
  type V4PackedBox,
  type V4Settings,
} from "../lib/packing-engine-v4.ts";

const containers: V4ContainerSpec[] = [
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

const settings: V4Settings = {
  itemGap: 0,
  minSupport: 85,
  cogWarning: 5,
  floorPressureWarning: 4500,
  searchQuality: "thorough",
};

const base: Omit<
  V4CargoItem,
  "id" | "name" | "quantity" | "length" | "width" | "height" | "weight"
> = {
  rotatable: true,
  uprightOnly: false,
  stackable: true,
  maxLayers: 99,
  maxTopLoad: 100_000,
  unloadPriority: 1,
  color: "#f97316",
};

const manualZero = { "20GP": 0, "40GP": 0, "40HC": 0 } as const;

function allBoxes(plan: ReturnType<typeof createV4Plan>) {
  return plan.containers.flatMap((container) =>
    container.groups.flatMap((group) => group.placements),
  );
}

function intersects(a: V4PackedBox, b: V4PackedBox) {
  const epsilon = 1e-6;
  return (
    a.x < b.x + b.length - epsilon &&
    a.x + a.length > b.x + epsilon &&
    a.y < b.y + b.width - epsilon &&
    a.y + a.width > b.y + epsilon &&
    a.z < b.z + b.height - epsilon &&
    a.z + a.height > b.z + epsilon
  );
}

function assertGeometry(plan: ReturnType<typeof createV4Plan>) {
  plan.containers.forEach((container) => {
    const boxes = container.groups.flatMap((group) => group.placements);
    const packedWeight = boxes.reduce((sum, box) => sum + box.unitWeight, 0);
    assert.ok(packedWeight <= container.spec.maxWeight + 1e-6);
    boxes.forEach((box, index) => {
      assert.ok(box.x >= -1e-6 && box.y >= -1e-6 && box.z >= -1e-6);
      assert.ok(box.x + box.length <= container.spec.length + 1e-6);
      assert.ok(box.y + box.width <= container.spec.width + 1e-6);
      assert.ok(box.z + box.height <= container.spec.height + 1e-6);
      boxes.slice(index + 1).forEach((other) => {
        assert.equal(intersects(box, other), false);
      });
    });
  });
}

test("SeaRates benchmark: 70 kiện 120×80×80 nằm trong 1×40HC", () => {
  const plan = createV4Plan(
    [
      {
        ...base,
        id: 1,
        name: "Benchmark",
        quantity: 70,
        length: 120,
        width: 80,
        height: 80,
        weight: 200,
      },
    ],
    containers,
    "auto",
    manualZero,
    "reference",
    settings,
  );
  assert.equal(plan.containers.length, 1);
  assert.equal(plan.containers[0]?.spec.id, "40HC");
  assert.equal(allBoxes(plan).length, 70);
  assert.equal(plan.remaining[1], 0);
  assertGeometry(plan);
});

test("tải 30 tấn được tách thành ít nhất 2 container", () => {
  const plan = createV4Plan(
    [
      {
        ...base,
        id: 2,
        name: "Tải nặng",
        quantity: 2,
        length: 100,
        width: 100,
        height: 100,
        weight: 15_000,
      },
    ],
    containers,
    "auto",
    manualZero,
    "reference",
    settings,
  );
  assert.equal(plan.containers.length, 2);
  assertGeometry(plan);
});

test("hàng không chồng chỉ nằm trên sàn", () => {
  const plan = createV4Plan(
    [
      {
        ...base,
        id: 3,
        name: "Không chồng",
        quantity: 40,
        length: 120,
        width: 80,
        height: 80,
        weight: 200,
        stackable: false,
        maxLayers: 1,
        maxTopLoad: 0,
      },
    ],
    containers,
    "auto",
    manualZero,
    "reference",
    settings,
  );
  assert.ok(plan.containers.length >= 2);
  assert.ok(allBoxes(plan).every((box) => Math.abs(box.z) < 1e-6));
  assertGeometry(plan);
});

test("giới hạn tải nén làm giảm số tầng", () => {
  const plan = createV4Plan(
    [
      {
        ...base,
        id: 4,
        name: "Thùng yếu",
        quantity: 60,
        length: 120,
        width: 80,
        height: 60,
        weight: 100,
        maxTopLoad: 100,
      },
    ],
    containers,
    "manual",
    { "20GP": 0, "40GP": 0, "40HC": 1 },
    "reference",
    settings,
  );
  const layers = Math.max(0, ...allBoxes(plan).map((box) => box.layer));
  assert.ok(layers <= 2);
  assertGeometry(plan);
});

test("hàng giữ mặt đứng không bị lật sang cạnh", () => {
  const plan = createV4Plan(
    [
      {
        ...base,
        id: 5,
        name: "This side up",
        quantity: 18,
        length: 100,
        width: 60,
        height: 180,
        weight: 80,
        uprightOnly: true,
      },
    ],
    containers,
    "manual",
    { "20GP": 0, "40GP": 1, "40HC": 0 },
    "operational",
    { ...settings, itemGap: 0.5 },
  );
  assert.ok(allBoxes(plan).every((box) => box.height === 180));
  assertGeometry(plan);
});

test("hàng hỗn hợp không giao nhau và không vượt biên", () => {
  const plan = createV4Plan(
    [
      {
        ...base,
        id: 6,
        name: "Carton A",
        quantity: 85,
        length: 60,
        width: 40,
        height: 35,
        weight: 18,
        uprightOnly: true,
        maxTopLoad: 500,
      },
      {
        ...base,
        id: 7,
        name: "Crate B",
        quantity: 12,
        length: 120,
        width: 100,
        height: 90,
        weight: 420,
        uprightOnly: true,
        maxLayers: 2,
        maxTopLoad: 500,
        unloadPriority: 2,
        color: "#7c3aed",
      },
      {
        ...base,
        id: 8,
        name: "Fragile C",
        quantity: 15,
        length: 50,
        width: 50,
        height: 45,
        weight: 20,
        uprightOnly: true,
        stackable: false,
        maxLayers: 1,
        maxTopLoad: 0,
        unloadPriority: 1,
        color: "#0ea5e9",
      },
    ],
    containers,
    "auto",
    manualZero,
    "operational",
    { ...settings, itemGap: 0.5 },
  );
  assertGeometry(plan);
  assert.equal(plan.validation.errors, 0);
});

test("50 bộ dữ liệu sinh cố định luôn giữ bất biến hình học", () => {
  let seed = 24_071_996;
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let caseIndex = 0; caseIndex < 50; caseIndex += 1) {
    const itemCount = 1 + Math.floor(random() * 3);
    const items: V4CargoItem[] = Array.from(
      { length: itemCount },
      (_, index) => ({
        ...base,
        id: caseIndex * 10 + index + 20,
        name: `Random ${caseIndex}-${index}`,
        quantity: 1 + Math.floor(random() * 16),
        length: 25 + Math.floor(random() * 95),
        width: 25 + Math.floor(random() * 75),
        height: 20 + Math.floor(random() * 80),
        weight: 5 + Math.floor(random() * 450),
        uprightOnly: random() > 0.35,
        maxLayers: 1 + Math.floor(random() * 4),
        maxTopLoad: 300 + Math.floor(random() * 1_500),
        color: `hsl(${Math.floor(random() * 360)} 70% 50%)`,
      }),
    );
    const plan = createV4Plan(
      items,
      containers,
      "manual",
      { "20GP": 0, "40GP": 0, "40HC": 1 },
      "operational",
      { ...settings, itemGap: 0.2, searchQuality: "balanced" },
    );
    assertGeometry(plan);
  }
});

