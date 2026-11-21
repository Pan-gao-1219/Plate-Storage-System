"use strict";

// The proportions follow the demonstration model. Coordinates are in scene units.
const GEOMETRY = {
  rackX: { left: -9.3, right: 9.3 },
  heights: Array.from({ length: 6 }, (_, index) => .53 + .548 * index),
  posts: [-4.39, -2.195, 0, 2.195, 4.39],
  cylinders: [-3.72, -1.24, 1.24, 3.72],
  plateBase: .138,
  plateThickness: .1,
};

const colors = {
  rack: [85, 102, 114],
  rail: [69, 83, 96],
  tray: [82, 131, 158],
  selected: [102, 160, 187],
  lift: [137, 156, 163],
  steel: [188, 203, 213],
  piston: [169, 193, 207],
  hoist: [133, 147, 152],
  marker: [233, 177, 90],
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
  const sections = [0, ...heights, 3.505];
  for (const post of posts) {
    for (const y of [-1.03, 1.03]) {
      addBox(mesh, x + post, y, .038, .31, .31, .076, "rail");
      for (let index = 1; index < sections.length; index++) {
        const bottom = sections[index - 1], top = sections[index];
        addBox(mesh, x + post, y, (bottom + top) / 2, .15, .15, top - bottom, "rack");
      }
    }
    addBox(mesh, x + post, 0, 3.43, .12, 2.08, .105, "rack");
  }
  for (const z of [...heights, 3.50]) {
    for (const y of [-.98, .98]) {
      addBox(mesh, x, y, z - .11, 8.92, .105, .15, "rack");
    }
    for (const y of [-.68, .68]) {
      addBox(mesh, x, y, z - .071, 8.72, .12, .13, "rail");
    }
  }
}

function addTray(mesh, x, z, selected, loaded) {
  const material = selected ? "selected" : "tray";
  for (const y of [-.673, .673]) {
    addBox(mesh, x, y, z + .063, 8.43, .09, .126, material);
  }
  for (let index = -4; index <= 4; index++) {
    if (loaded && Math.abs(index) < 4) continue;
    addBox(mesh, x + index * 1.035, 0, z + .078, .10, 1.3, .083, material);
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

function addLift(mesh, z) {
  for (const x of GEOMETRY.cylinders) {
    addBox(mesh, x, 0, .039, .51, .51, .078, "rail");
    addCylinder(mesh, x, 0, .078, .295, .16, "rack");
    addCylinder(mesh, x, 0, .292, z - .215, .082, "piston");
    addBox(mesh, x, 0, z - .192, .26, .31, .103, "rack");
  }
  for (const y of [-.84, .84]) {
    addBox(mesh, 0, y, z - .129, 9.08, .13, .19, "lift");
    for (const x of [-4.28, 4.28]) {
      addBox(mesh, x, y + Math.sign(y) * .069, z - .109, .30, .015, .069, "marker");
    }
  }
  for (let index = 0; index < 7; index++) {
    addBox(mesh, (index - 3) * 1.47, 0, z - .142, .13, 1.61, .12, "lift");
  }
  for (const y of [-.675, .675]) {
    addBox(mesh, 0, y, z - .059, 8.99, .103, .116, "rail");
  }
}

function addSpreader(mesh, y, z) {
  addBox(mesh, 0, y, z + .51, 6.03, .116, .167, "hoist");
  for (const x of [-2.68, 2.68]) {
    addBox(mesh, x, y, z + .43, .16, 1.15, .122, "hoist");
    for (const dy of [-.46, .46]) {
      addBox(mesh, x, y + dy, z + .232, .051, .051, .34, "piston");
      addBox(mesh, x, y + dy, z + .035, .38, .24, .07, "hoist");
    }
  }
}

const fixedMesh = [];
for (const x of Object.values(GEOMETRY.rackX)) addRack(fixedMesh, x);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const shade = (rgb, light) => `rgb(${rgb.map(value => Math.round(Math.min(value * light, 255))).join(",")})`;

class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
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
    const scale = Math.min(width / 30.8, height / 9.3);
    const origin = [width / 2, height * .52 + scale * 1.55];
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

    for (let y = -5; y <= 5; y++) polyline([[-16, y, 0], [16, y, 0]], "#9ebacc17");
    for (let x = -16; x <= 16; x += 2) polyline([[x, -5, 0], [x, 5, 0]], "#9ebacc17");
    if (this.elevation > .02) {
      for (const x of [-9.3, 0, 9.3]) {
        const [sx, screenY] = project([x, 0, 0]);
        ctx.beginPath();
        ctx.ellipse(sx, screenY, 4.7 * scale, Math.max(2, 1.22 * scale * se), -Math.atan2(up[0], right[0]), 0, 2 * Math.PI);
        ctx.fillStyle = "#0a111745";
        ctx.fill();
      }
    }

    const mesh = [...fixedMesh];
    const { rackX, heights } = GEOMETRY;
    for (const [side, x] of Object.entries(rackX)) {
      for (const [index, z] of heights.entries()) {
        const isMoving = state.target?.side === side && state.target.index === index;
        if (isMoving) continue;
        const highlighted = state.highlight?.side === side && state.highlight.index === index;
        addTray(mesh, x, z, highlighted, state.stock[side][index]);
        if (state.stock[side][index]) addPlate(mesh, x, 0, z);
      }
    }
    addLift(mesh, state.liftZ);
    if (state.target) {
      addTray(mesh, state.trayX, state.levelZ, true, state.boardVisible && state.boardLift < .04);
      if (state.boardVisible) addPlate(mesh, state.boardX, state.boardY, state.levelZ + state.boardLift);
    }
    if (state.crane) addSpreader(mesh, state.boardY, state.craneZ);

    const faces = mesh.filter(face => dot(depth, face.normal) > .001).map(face => ({
      ...face,
      depth: face.points.reduce((sum, point) => sum + dot(point, depth), 0) / face.points.length,
    }));
    faces.sort((a, b) => a.depth - b.depth);
    for (const { points, normal, material } of faces) {
      ctx.beginPath();
      for (const [index, point] of points.entries()) {
        const [x, y] = project(point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const light = .77 + .29 * Math.max(0, dot(normal, [-.35, -.46, .82]));
      ctx.fillStyle = shade(colors[material], light);
      ctx.fill();
      ctx.strokeStyle = material === "steel" ? "#dce6ec8c" : "#0b162457";
      ctx.lineWidth = material === "steel" ? .7 : .65;
      ctx.stroke();
    }

    if (state.crane) {
      const y = state.boardY, z = state.craneZ;
      polyline([[-2.68, y, z + .6], [0, y, z + 1.54], [2.68, y, z + .6]], "#acbeca", 1.3);
      polyline([[0, y, z + 1.54], [0, y, z + 8]], "#acbeca", 1.3);
    }
    if (state.alignGuide) {
      const x = Math.sign(rackX[state.target.side]);
      ctx.setLineDash([5, 5]);
      polyline([[x * 5.05, -1.19, state.levelZ], [x * 2.0, -1.19, state.levelZ]], "#eab360", 1.3);
      ctx.setLineDash([]);
    }

    const labels = [
      [-9.3, "左侧货架"],
      [0, "中央升降架"],
      [9.3, "右侧货架"],
    ];
    ctx.font = `${width < 470 ? 12 : 14}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelY = Math.min(height - 23, origin[1] + scale * (1.62 + Math.abs(up[0]) * 8) + 12);
    for (const [x, label] of labels) {
      const [sx] = project([x, 0, 0]);
      const emphasized = state.target && rackX[state.target.side] === x;
      ctx.fillStyle = emphasized ? "#f2c47f" : "#b8cbd7";
      ctx.fillText(label, sx, labelY);
    }
  }
}
