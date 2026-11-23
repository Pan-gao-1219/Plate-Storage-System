"use strict";

// The proportions follow the demonstration model. Coordinates are in scene units.
const GEOMETRY = {
  rackX: { left: -9.3, right: 9.3 },
  heights: Array.from({ length: 6 }, (_, index) => .53 + .548 * index),
  posts: [-4.39, -2.195, 0, 2.195, 4.39],
  cylinders: [-3.72, -1.24, 1.24, 3.72],
  plateBase: .16,
  plateThickness: .1,
};
const roofBeamHeight = .105;
const rackTop = GEOMETRY.heights.at(-1) + GEOMETRY.plateBase + GEOMETRY.plateThickness + .20 + roofBeamHeight / 2;

const colors = {
  rack: [85, 102, 114],
  rail: [69, 83, 96],
  tray: [82, 131, 158],
  selected: [102, 160, 187],
  lift: [137, 156, 163],
  steel: [188, 203, 213],
  piston: [169, 193, 207],
  roller: [152, 170, 180],
  hoist: [133, 147, 152],
  cable: [185, 204, 214],
  marker: [233, 177, 90],
  profileStand: [164, 86, 72],
  profileCarrier: [180, 127, 62],
  profileSelected: [227, 170, 94],
  profileSteel: [166, 188, 200],
};

const boxSides = [
  { normal: [0, 0, 1], corners: [4, 5, 6, 7] },
  { normal: [0, 0, -1], corners: [0, 3, 2, 1] },
  { normal: [0, -1, 0], corners: [0, 1, 5, 4] },
  { normal: [0, 1, 0], corners: [2, 3, 7, 6] },
  { normal: [-1, 0, 0], corners: [3, 0, 4, 7] },
  { normal: [1, 0, 0], corners: [1, 2, 6, 5] },
];

function addBox(mesh, x, y, z, length, width, height, material) {
  const xl = x - length / 2, xr = x + length / 2;
  const yn = y - width / 2, yf = y + width / 2;
  const zb = z - height / 2, zt = z + height / 2;
  const points = [
    [xl, yn, zb], [xr, yn, zb], [xr, yf, zb], [xl, yf, zb],
    [xl, yn, zt], [xr, yn, zt], [xr, yf, zt], [xl, yf, zt],
  ];
  for (const { normal, corners } of boxSides) {
    mesh.push({ points: corners.map(index => points[index]), normal, material });
  }
}

function addCylinder(mesh, x, y, bottom, top, radius, material) {
  if (top <= bottom) return;
  const ring = Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI / 6;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const lower = ring.map(([dx, dy]) => [x + radius * dx, y + radius * dy, bottom]);
  const upper = lower.map(([px, py]) => [px, py, top]);
  mesh.push({ points: lower, normal: [0, 0, -1], material });
  mesh.push({ points: upper, normal: [0, 0, 1], material });
  for (let index = 0; index < ring.length; index++) {
    const next = (index + 1) % ring.length;
    const angle = (index + .5) * Math.PI / 6;
    mesh.push({
      points: [lower[index], lower[next], upper[next], upper[index]],
      normal: [Math.cos(angle), Math.sin(angle), 0],
      material,
    });
  }
}

function addRack(mesh, x) {
  const { heights, posts } = GEOMETRY;
  const roof = rackTop - roofBeamHeight / 2;
  for (const post of posts) {
    for (const y of [-1.03, 1.03]) {
      addBox(mesh, x + post, y, .038, .31, .31, .076, "rail");
      addBox(mesh, x + post, y, rackTop / 2, .15, .15, rackTop, "rack");
    }
    addBox(mesh, x + post, 0, roof, .12, 2.08, roofBeamHeight, "rack");
  }
  for (const y of [-.98, .98]) {
    addBox(mesh, x, y, roof, 8.92, .105, roofBeamHeight, "rack");
  }
  for (const z of heights) {
    for (const y of [-.98, .98]) {
      addBox(mesh, x, y, z - .11, 8.92, .105, .15, "rack");
    }
    for (const y of [-.68, .68]) {
      addBox(mesh, x, y, z - .065, 8.72, .12, .13, "rail");
    }
  }
}

function addTray(mesh, x, z, selected) {
  const material = selected ? "selected" : "tray";
  const height = GEOMETRY.plateBase;
  for (const y of [-.673, .673]) {
    addBox(mesh, x, y, z + height / 2, 8.43, .09, height, material);
  }
  for (let index = -4; index <= 4; index++) {
    addBox(mesh, x + index * 1.035, 0, z + height - .083 / 2, .10, 1.3, .083, material);
  }
  if (selected) {
    for (const offset of [-4.08, 4.08]) {
      addBox(mesh, x + offset, -.723, z + .066, .26, .017, .068, "marker");
    }
  }
}

function addPlate(mesh, x, y, base) {
  const { plateBase, plateThickness } = GEOMETRY;
  addBox(mesh, x, y, base + plateBase + plateThickness / 2, 8.04, 1.29, plateThickness, "steel");
}

const plateRollerOffsets = [-4.22, -3.62, -3.24, -2.56, -1.85, -1.08, -.42, .42, 1.08, 1.85, 2.56, 3.24, 3.62, 4.22];

function addReceiverRollers(mesh, y, z, centerX = 0, offsets = plateRollerOffsets) {
  const radius = .063;
  const wheel = [];
  addCylinder(wheel, 0, 0, -.054, .054, radius, "roller");
  for (const offset of offsets) {
    const x = centerX + offset;
    for (const { points, normal, material } of wheel) {
      mesh.push({
        points: points.map(([px, py, pz]) => [x + px, y + pz, z - radius - py]),
        normal: [normal[0], normal[2], -normal[1]],
        material,
      });
    }
    for (const offset of [-.068, .068]) {
      addBox(mesh, x, y + offset, z - .099, .080, .024, .080, "lift");
    }
  }
}

function addLift(mesh, z) {
  for (const x of GEOMETRY.cylinders) {
    addBox(mesh, x, 0, .039, .51, .51, .078, "rail");
    addCylinder(mesh, x, 0, .078, .295, .16, "rack");
    addCylinder(mesh, x, 0, .292, z - .215, .082, "piston");
    addBox(mesh, x, 0, z - .192, .26, .31, .103, "rack");
  }
  for (const y of [-.84, .84]) {
    addBox(mesh, 0, y, z - .158, 9.08, .13, .18, "lift");
    for (const x of [-4.28, 4.28]) {
      addBox(mesh, x, y + Math.sign(y) * .069, z - .109, .30, .015, .069, "marker");
    }
  }
  for (let index = 0; index < 7; index++) {
    addBox(mesh, (index - 3) * 1.47, 0, z - .142, .13, 1.61, .12, "lift");
  }
  for (const y of [-.675, .675]) {
    // The wheel crowns meet the tray underside. The backing rails sit below it.
    addBox(mesh, 0, y, z - .174, 8.99, .16, .078, "rail");
    addReceiverRollers(mesh, y, z);
  }
}

// Ribbon in the X/Z plane, visible from the front of the machine.
function addCable(mesh, x1, z1, x2, z2, y) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const dx = .035 * (z2 - z1) / length;
  const dz = .035 * (x1 - x2) / length;
  mesh.push({
    points: [[x1 + dx, y, z1 + dz], [x1 - dx, y, z1 - dz],
      [x2 - dx, y, z2 - dz], [x2 + dx, y, z2 + dz]],
    normal: [0, -1, 0],
    material: "cable",
  });
}

function addSpreader(mesh, y, z) {
  addBox(mesh, 0, y, z + .51, 6.03, .116, .167, "hoist");
  for (const x of [-2.68, 2.68]) {
    addBox(mesh, x, y, z + .43, .16, 1.15, .122, "hoist");
    for (const dy of [-.46, .46]) {
      addBox(mesh, x, y + dy, z + .232, .051, .051, .34, "piston");
      addBox(mesh, x, y + dy, z + .035, .38, .24, .07, "hoist");
    }
    addCable(mesh, x, z + .591, 0, z + 1.54, y);
  }
  addCable(mesh, 0, z + 1.54, 0, z + 16, y);
}

const fixedMesh = [];
for (const x of Object.values(GEOMETRY.rackX)) addRack(fixedMesh, x);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const plateView = {
  halfLength: GEOMETRY.rackX.right + 4.55,
  halfDepth: 1.20,
  height: rackTop,
  widthSpan: 30.8,
  heightSpan: 9.3,
  gridLength: 16,
  shadows: [[-9.3, 4.7], [0, 4.7], [9.3, 4.7]],
};

class Scene {
  constructor(canvas, view = plateView) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.meshRenderer = new DepthRenderer();
    this.view = view;
    this.setView("perspective");
  }

  setView(view) {
    this.yaw = view === "front" ? 0 : -.29;
    this.elevation = view === "front" ? 0 : .42;
  }

  rotate(dx, dy) {
    this.yaw = Math.max(-.72, Math.min(.72, this.yaw - dx * .008));
    this.elevation = Math.max(0, Math.min(.79, this.elevation + dy * .009));
  }

  buildMesh(state) {
    const mesh = [...fixedMesh];
    const { rackX, heights } = GEOMETRY;
    for (const [side, x] of Object.entries(rackX)) {
      for (const [index, z] of heights.entries()) {
        if (state.target?.side === side && state.target.index === index) continue;
        const highlighted = state.highlight?.side === side && state.highlight.index === index;
        addTray(mesh, x, z, highlighted);
        if (state.stock[side][index]) addPlate(mesh, x, 0, z);
      }
    }
    addLift(mesh, state.liftZ);
    if (state.target) {
      addTray(mesh, state.trayX, state.levelZ, true);
      if (state.boardVisible) addPlate(mesh, state.boardX, state.boardY, state.levelZ + state.boardLift);
    }
    if (state.crane) addSpreader(mesh, state.boardY, state.craneZ);
    return mesh;
  }

  labels(state) {
    const activeRack = GEOMETRY.rackX[state.target?.side];
    return [
      [-9.3, "左侧货架", activeRack === -9.3],
      [0, "中央升降架", false],
      [9.3, "右侧货架", activeRack === 9.3],
    ];
  }

  render(state) {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = rect;
    if (width < 1 || height < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * ratio);
    const pixelsHigh = Math.round(height * ratio);
    if (this.canvas.width !== pixelsWide || this.canvas.height !== pixelsHigh) {
      this.canvas.width = pixelsWide;
      this.canvas.height = pixelsHigh;
    }
    const ctx = this.context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const se = Math.sin(this.elevation), ce = Math.cos(this.elevation);
    const depth = [sy * ce, -cy * ce, se];
    const right = [cy, sy, 0];
    const up = [-sy * se, cy * se, ce];
    // Keep the whole rack in view when its length projects diagonally across the screen.
    const { halfLength, halfDepth, widthSpan, heightSpan, gridLength, shadows } = this.view;
    const groundExtent = halfLength * Math.abs(up[0]) + halfDepth * Math.abs(up[1]);
    const topExtent = groundExtent + this.view.height * ce;
    const scale = Math.min(width / widthSpan, height / heightSpan, (height - 64) / (groundExtent + topExtent));
    const originY = Math.max(20 + topExtent * scale, Math.min(
      height - 44 - groundExtent * scale, height * .52 + scale * 1.55,
    ));
    const origin = [width / 2, originY];
    const project = point => [
      origin[0] + dot(point, right) * scale,
      origin[1] - dot(point, up) * scale,
    ];
    const polyline = (points, stroke, lineWidth = 1) => {
      ctx.beginPath();
      for (const [index, point] of points.entries()) {
        const [x, y] = project(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    for (let y = -5; y <= 5; y++) polyline([[-gridLength, y, 0], [gridLength, y, 0]], "#9ebacc17");
    for (let x = -gridLength; x <= gridLength; x += 2) polyline([[x, -5, 0], [x, 5, 0]], "#9ebacc17");
    if (this.elevation > .02) {
      for (const [x, length] of shadows) {
        const [sx, screenY] = project([x, 0, 0]);
        ctx.beginPath();
        ctx.ellipse(sx, screenY, length * scale, Math.max(2, 1.22 * scale * se), -Math.atan2(up[0], right[0]), 0, 2 * Math.PI);
        ctx.fillStyle = "#0a111745";
        ctx.fill();
      }
    }

    const meshRatio = Math.max(ratio, 1.5);
    this.meshRenderer.begin(Math.round(width * meshRatio), Math.round(height * meshRatio));
    for (const { points, normal, material } of this.buildMesh(state)) {
      if (dot(depth, normal) <= .001) continue;
      const projected = points.map(point => {
        const [x, y] = project(point);
        return [x * meshRatio, y * meshRatio, dot(point, depth)];
      });
      const light = .70 + .37 * Math.max(0, dot(normal, [-.35, -.46, .82]));
      const color = colors[material].map(value => value * light);
      for (let index = 1; index < projected.length - 1; index++) {
        this.meshRenderer.triangle(projected[0], projected[index], projected[index + 1], color);
      }
    }
    this.meshRenderer.draw(ctx, width, height);

    if (state.alignGuide) {
      const x = Math.sign(GEOMETRY.rackX[state.target.side]);
      ctx.setLineDash([5, 5]);
      polyline([[x * 5.05, -1.19, state.levelZ], [x * 2.0, -1.19, state.levelZ]], "#eab360", 1.3);
      ctx.setLineDash([]);
    }

    ctx.font = `${width < 470 ? 12 : 14}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelY = originY + groundExtent * scale + 17;
    for (const [x, label, emphasized] of this.labels(state)) {
      const [sx] = project([x, 0, 0]);
      ctx.fillStyle = emphasized ? "#f2c47f" : "#b8cbd7";
      ctx.fillText(label, sx, labelY);
    }
  }
}
