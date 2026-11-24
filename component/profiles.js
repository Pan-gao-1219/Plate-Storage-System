"use strict";

const profileGeometry = {
  heights: Array.from({ length: 5 }, (_, index) => .68 + .785 * index),
  rackX: 5.25,
  standX: -6.95,
  limitX: -2.8,
  carrierLength: 9.4,
  profileLength: 11.8,
};

const profileStepEnds = [1.6, 4.85, 6.2, 14.6, 19.6];
const profilePreviewTimes = { transfer: 4.57, rest: 5.95, lift: 10.34 };
const setProfileBar = ["定位横杆", "将前端横杆插入目标层孔位。同层作业沿用原孔位。"];
const restOnBar = ["落杆摘钩", "到限位后放下前端。横杆和后部滚轮承重，行车摘钩。"];
const profileModes = {
  take: {
    title: "取料",
    steps: [
      setProfileBar,
      ["提头外拖", "行车挂活动架前端，略微提起，带料沿滚轮往外拖。"],
      restOnBar,
      ["换钩吊料", "同一台行车改挂型材，沿滚轮牵出，待尾端让开上层后起吊。"],
      ["收回空架", "行车回挂前端，提离横杆，将空活动架送回原层。"],
    ],
  },
  place: {
    title: "放料",
    steps: [
      setProfileBar,
      ["拖出空架", "行车挂住空活动架前端，提起一头沿滚轮外拖。"],
      restOnBar,
      ["吊入型材", "行车把型材放上活动架的滚轮，沿长度方向送到存放位置，再摘钩。"],
      ["带料归层", "行车改挂活动架前端，提离横杆，将活动架和型材送回原层。"],
    ],
  },
};

function profilePoint(pose, dx, dy, dz) {
  // Pitch about the rear guide wheel. Its axle stays at the selected tier.
  const tail = profileGeometry.carrierLength / 2;
  const c = Math.cos(pose.pitch), s = Math.sin(pose.pitch);
  return [pose.x + tail + (dx - tail) * c + dz * s, dy,
    pose.z - (dx - tail) * s + dz * c];
}

function noseTackle(carrier, engagement) {
  const tip = profilePoint(carrier, -profileGeometry.carrierLength / 2 + .055, 1.01, .16);
  const x = tip[0] - .64;
  // The transverse yoke stays above the stack; its two end lines pass outside the cargo.
  const yokeZ = profileGeometry.heights.at(-1) + 1.1;
  return {
    x, yokeZ, anchorX: x + .64 * engagement,
    anchorZ: yokeZ - .12 + (tip[2] - yokeZ + .12) * engagement,
    span: 0, width: 1.01, mode: "nose",
  };
}

const cargoBed = .20;
const cargoHeight = .256;

function profileExchange(time, carrier, parked) {
  const { limitX, rackX, profileLength } = profileGeometry;
  const clearX = rackX - profileLength - .34;
  const rolled = smooth(time, 7.60, 9.05);
  const raised = smooth(time, 9.05, 10.60);
  const leaving = smooth(time, 10.60, 12.15);
  const cargo = {
    x: limitX + (clearX - limitX) * rolled + (-42 - clearX) * leaving,
    z: carrier.z + 2.3 * raised, pitch: 0,
  };
  const attach = smooth(time, 6.95, 7.60);
  const approach = smooth(time, 6.2, 6.95);
  const returnTrip = smooth(time, 12.15, 14.6);
  const stow = 1 - smooth(time, 12.15, 12.60);
  const rigged = attach * stow;
  const x = parked.x + (cargo.x - parked.x) * approach * (1 - returnTrip);
  const pickupZ = cargo.z + cargoBed + cargoHeight;
  const workZ = pickupZ + 1.25;
  const yokeZ = parked.yokeZ + (workZ - parked.yokeZ) * rigged;
  return {
    cargo: time < 12.15 ? cargo : null,
    crane: { x, yokeZ, anchorX: x,
      anchorZ: yokeZ - .12 + (pickupZ - yokeZ + .12) * rigged,
      span: 1.74 * rigged, width: 1.01 - .35 * rigged, mode: "cargo" },
  };
}

function readProfileScene(stock, job, highlight, barIndex = 0) {
  const { heights, rackX, limitX } = profileGeometry;
  const oldBarZ = heights[barIndex];
  const base = { stock, highlight, barY: 0, barZ: oldBarZ };
  if (!job) {
    return { ...base, crane: noseTackle({ x: rackX, z: oldBarZ, pitch: 0 }, 0) };
  }

  const { index, time, mode } = job;
  const [ready, atLimit, unhooked, rehook, end] = profileStepEnds;
  const z = heights[index];
  // Withdraw through the holes, change height clear of the posts, then reinsert.
  if (index !== barIndex) {
    base.barY = -3.22 * (smooth(time, 0, .50) - smooth(time, 1.06, ready));
    base.barZ = oldBarZ + (z - oldBarZ) * smooth(time, .5, 1.06);
  }

  // Play the nose haul backwards to bring the carrier in. The bar stays in its holes.
  const haul = time <= rehook ? Math.min(time, unhooked)
    : unhooked - (time - rehook) * (unhooked - ready) / (end - rehook);
  const travel = smooth(haul, 2.80, atLimit);
  const tipRise = .105 * (smooth(haul, 2.35, 2.80) - smooth(haul, atLimit, 5.45));
  const carrier = { x: rackX + (limitX - rackX) * travel, z,
    pitch: Math.asin(tipRise / profileGeometry.carrierLength) };
  const engagement = smooth(haul, ready, 2.35) - smooth(haul, 5.45, unhooked);
  const crane = noseTackle(carrier, engagement);
  const state = { ...base, target: job, carrier, crane };
  if (time >= unhooked && time <= rehook) {
    const exchangeTime = mode === "take" ? time : rehook + unhooked - time;
    return { ...state, ...profileExchange(exchangeTime, carrier, crane) };
  }
  const loaded = mode === "take" ? time < unhooked : time > rehook;
  return { ...state, cargo: loaded ? carrier : null };
}

function addProfileRack(mesh) {
  const { heights, rackX } = profileGeometry;
  const top = heights.at(-1) + .80;
  for (const offset of [-3.8, 0, 3.8]) {
    const x = rackX + offset;
    for (const y of [-1.23, 1.23]) {
      addBox(mesh, x, y, .052, .40, .34, .104, "rail");
      addBox(mesh, x, y, top / 2, .17, .16, top, "rack");
    }
    addBox(mesh, x, 0, top - .065, .13, 2.52, .13, "rack");
  }
  for (const z of heights) {
    for (const sign of [-1, 1]) {
      addBox(mesh, rackX, sign * 1.19, z - .12, 7.8, .145, .20, "rack");
      const y = sign * .88;
      addBox(mesh, rackX, y, z - .174, 7.9, .16, .078, "rail");
      addReceiverRollers(mesh, y, z, rackX, [-3.70, -2.1, -.7, .7, 2.1, 3.5]);
      // The tail guide remains captured even with just the last part of the carrier in the bay.
      addBox(mesh, 5.70, sign * .78, z - .207, 9.00, .11, .054, "rail");
      addBox(mesh, profileGeometry.limitX + profileGeometry.carrierLength / 2 - .13,
        sign * .78, z - .145, .08, .11, .075, "marker");
    }
  }
}

function addFrontPosts(mesh) {
  const { heights, standX } = profileGeometry;
  const postTop = heights.at(-1) + .32;
  for (const y of [-1.25, 1.25]) {
    addBox(mesh, standX, y, .055, .66, .44, .11, "profileStand");
    for (const side of [-1, 1]) {
      addBox(mesh, standX + side * .16, y, postTop / 2, .10, .22, postTop, "profileStand");
    }
    // Leave an actual opening at each tier for the removable transverse bar.
    let bottom = 0;
    for (const z of [...heights, postTop + .17]) {
      const upper = z - .17;
      addBox(mesh, standX, y, (bottom + upper) / 2, .22, .22, upper - bottom, "profileStand");
      bottom = z + .03;
    }
  }
}

function addProfileWheel(mesh, x, y, centerZ, radius, width) {
  const wheel = [];
  addCylinder(wheel, 0, 0, -width / 2, width / 2, radius, "roller");
  for (const face of wheel) {
    mesh.push({ material: face.material,
      points: face.points.map(([a, b, c]) => [x + a, y + c, centerZ - b]),
      normal: [face.normal[0], face.normal[2], -face.normal[1]] });
  }
}

function makeCarrier(material) {
  const mesh = [];
  const half = profileGeometry.carrierLength / 2;
  for (const sign of [-1, 1]) {
    addBox(mesh, 0, sign * .88, .075, 2 * half, .13, .15, material);
    for (const dx of [-4.56, -1.54, 1.54, 4.56]) {
      addBox(mesh, dx, sign * .92, .237, .10, .13, .24, material);
    }
    addBox(mesh, -half + .055, sign * .97, .14, .11, .17, .06, material);
    addBox(mesh, half - .04, sign * .78, -.018, .12, .08, .15, material);
    addProfileWheel(mesh, half, sign * .78, -.09, .09, .105);
  }
  for (const x of [-4.40, -2.20, 0, 2.20, 4.40]) {
    addBox(mesh, x, 0, .058, .14, 1.76, .075, material);
    addProfileWheel(mesh, x, 0, cargoBed - .066, .066, 1.67);
  }
  return mesh;
}

function makeProfiles() {
  const mesh = [];
  const { profileLength } = profileGeometry;
  for (const y of [-.625, -.388, .388, .625]) {
    addBox(mesh, 0, y, cargoBed + cargoHeight / 2, profileLength, .065, cargoHeight - .056, "profileSteel");
    for (const z of [cargoBed + .014, cargoBed + cargoHeight - .014]) {
      addBox(mesh, 0, y, z, profileLength, .18, .028, "profileSteel");
    }
  }
  return mesh;
}

function addPosedPart(mesh, part, pose) {
  const c = Math.cos(pose.pitch), s = Math.sin(pose.pitch);
  for (const { points, normal: [nx, ny, nz], material } of part) {
    mesh.push({ material, points: points.map(([x, y, z]) => profilePoint(pose, x, y, z)),
      normal: [nx * c + nz * s, ny, -nx * s + nz * c] });
  }
}

// Draw the round line in three dimensions so end slings remain visible in both views.
function addProfileLine(mesh, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < .001) return;
  const axis = [dx / length, dy / length, dz / length];
  const cross = ([a,b,c], [d,e,f]) => [b*f-c*e, c*d-a*f, a*e-b*d];
  const side = cross(axis, Math.abs(axis[1]) < .85 ? [0,1,0] : [1,0,0]);
  const n = Math.hypot(...side);
  const u = side.map(value => value / n), v = cross(axis, u);
  const ring = [u, v, u.map(x => -x), v.map(x => -x)];
  const offset = (point, radial) => point.map((value, i) => value + .026 * radial[i]);
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    mesh.push({ material: "cable", normal: a.map((value, j) => (value + b[j]) / Math.SQRT2),
      points: [offset(start, a), offset(start, b), offset(end, b), offset(end, a)] });
  }
}

function addProfileCrane(mesh, crane) {
  const { x, yokeZ, anchorX, anchorZ, span, width } = crane;
  addProfileLine(mesh, [x, 0, yokeZ + .65], [x, 0, yokeZ + 15]);
  addBox(mesh, x, 0, yokeZ + .63, .20, .23, .25, "profileStand");
  addBox(mesh, x, 0, yokeZ, .14, 2.1, .10, "hoist");
  for (const sign of [-1, 1]) {
    addProfileLine(mesh, [x, 0, yokeZ + .54], [x, sign, yokeZ + .035]);
    const top = [x, sign, yokeZ - .04];
    const offsets = span > .018 ? [-span, span] : [0];
    for (const dx of offsets) {
      addProfileLine(mesh, top, [anchorX + dx, sign * width, anchorZ]);
    }
  }
  if (crane.mode === "cargo" && span > .08) {
    for (const dx of [-span, span]) {
      addBox(mesh, anchorX + dx, 0, anchorZ + .027, .085, 2 * width, .054, "hoist");
    }
  }
}

const fixedProfileMesh = [];
addProfileRack(fixedProfileMesh);
addFrontPosts(fixedProfileMesh);
const profileCarrierMesh = makeCarrier("profileCarrier");
const selectedCarrierMesh = makeCarrier("profileSelected");
const profileLoadMesh = makeProfiles();
const storedProfileParts = profileGeometry.heights.map(z => {
  const pose = { x: profileGeometry.rackX, z, pitch: 0 };
  const rack = [], selected = [], load = [];
  addPosedPart(rack, profileCarrierMesh, pose);
  addPosedPart(selected, selectedCarrierMesh, pose);
  addPosedPart(load, profileLoadMesh, pose);
  return { rack, selected, load };
});
const profileView = {
  halfLength: 13.55, halfDepth: 1.6, height: 6.85, widthSpan: 28.5,
  heightSpan: 9.3, gridLength: 14, shadows: [[-6.95, .48], [5.25, 4.15]],
};

class ProfileScene extends Scene {
  constructor(canvas, preview = "") {
    super(canvas, preview ? { ...profileView,
      widthSpan: preview === "lift" ? 28.2 : 25.8,
      height: preview === "lift" ? 7.35 : 5.9, heightSpan: 8.6 } : profileView);
    this.preview = preview;
    if (preview) {
      this.yaw = -.36;
      this.elevation = .34;
    }
  }

  buildMesh(state) {
    const mesh = [...fixedProfileMesh];
    const x = profileGeometry.standX;
    addBox(mesh, x, state.barY, state.barZ - .07, .175, 3.1, .14, "roller");
    addBox(mesh, x, state.barY - 1.55, state.barZ - .07, .25, .08, .21, "marker");
    for (const [index, parts] of storedProfileParts.entries()) {
      if (state.target?.index === index) continue;
      mesh.push(...(state.highlight?.index === index ? parts.selected : parts.rack));
      if (state.stock.rack[index]) mesh.push(...parts.load);
    }
    if (state.carrier) addPosedPart(mesh, selectedCarrierMesh, state.carrier);
    if (state.cargo) addPosedPart(mesh, profileLoadMesh, state.cargo);
    addProfileCrane(mesh, state.crane);
    return mesh;
  }

  labels(state) {
    if (this.preview) return [];
    return [[profileGeometry.standX, "前端钢架 · 插杆", !!state.target],
      [profileGeometry.rackX, "型材存放架", !!state.target]];
  }
}

function showProfilePreviews(stock) {
  const copy = {
    ".product-name": "Profile Storage System",
    "#product-title": "型材库",
    ".hero-description": "行车提起活动架前端，沿滚轮往外拖。到限位后，将前端搁在手工插好的横杆上，摘钩换挂型材。",
    "#system-title + p": "前端钢架的位置固定。存取哪一层，就把可抽出的横杆插在哪一层。",
    ".system-image figcaption": "第三层到达限位，活动架前端搁在横杆上，后端仍由货架滚轮承托。",
    "#demo-title": "型材取放演示",
    "#demo-title + p": "点选层位开始取放，可暂停查看活动架落杆和行车换钩。",
    "#controls-heading": "型材取放控制",
    '[data-mode="take"]': "取出型材",
    '[data-mode="place"]': "放入型材",
    ".demo-note": "横杆可人工抽出换层。同层连续作业时，横杆留在原孔位。",
    ".footer-name": "型材库",
    ".footer-english": "Profile Storage System",
  };
  for (const [selector, text] of Object.entries(copy)) {
    document.querySelector(selector).textContent = text;
  }
  const specs = [
    ["存放层位", "5 层"],
    ["前端支承", "可抽横杆"],
    ["牵引与吊料", "同一台行车"],
  ];
  const components = [
    ["固定架与滚轮", "每层大梁上的滚轮支承活动架。外拖到限位时，活动架后端仍搭在滚轮上。"],
    ["活动架", "承托长型材。行车先挂前端外拖，待前端放稳、摘钩后，再挂型材。"],
    ["前端钢架与横杆", "钢架上设有分层插孔。人工将横杆插入目标层，承托活动架前端，供行车换钩。"],
  ];
  for (const [selector, rows] of [[".specs", specs], [".components", components]]) {
    for (const [index, row] of [...document.querySelectorAll(selector + " > div")].entries()) {
      const [name, value] = rows[index];
      row.querySelector("dt").textContent = name;
      row.querySelector("dd").textContent = value;
    }
  }
  document.getElementById("scene").setAttribute("aria-label", "五层型材架与前端钢架。行车先拖出活动架，落杆换钩后单独吊取型材。可拖动旋转视角。");
  const legend = document.querySelectorAll(".legend span");
  legend[1].innerHTML = '<i class="profile-carrier"></i>活动架';
  legend[2].innerHTML = '<i class="profile-stand"></i>前端钢架';
  legend[3].innerHTML = '<i class="plate"></i>型材';

  const gallery = document.querySelector(".hero-media");
  gallery.replaceChildren();
  document.querySelector('[data-gallery="overview"]').textContent = "存储";
  const liftButton = document.querySelector('[data-gallery="lift"]');
  const transferButton = liftButton.cloneNode(true);
  transferButton.dataset.gallery = "transfer";
  transferButton.textContent = "转运";
  liftButton.before(transferButton);

  for (const [preview, label] of [
    ["overview", "型材分层平放，前端钢架的横杆插在第一层"],
    ["transfer", "行车挂在第三层活动架前端，带着型材沿滚轮向外拖动"],
    ["lift", "型材单独悬在吊索下，空活动架留在第三层前端横杆上"],
    ["rest", "活动架到达限位，前端已搁在第三层横杆上，行车摘钩"],
  ]) {
    const canvas = document.createElement("canvas");
    canvas.className = "profile-preview";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    if (preview === "rest") {
      document.querySelector(".system-image img").replaceWith(canvas);
    } else {
      canvas.dataset.pose = preview;
      canvas.hidden = preview !== "overview";
      gallery.append(canvas);
    }
    const view = new ProfileScene(canvas, preview);
    const job = preview === "overview" ? null : { side: "rack", index: 2, time: profilePreviewTimes[preview], mode: "take" };
    const state = readProfileScene(stock, job, null);
    new ResizeObserver(() => view.render(state)).observe(canvas);
  }
}
