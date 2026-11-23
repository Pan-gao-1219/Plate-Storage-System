"use strict";

const profileGeometry = {
  heights: Array.from({ length: 5 }, (_, index) => .68 + .785 * index),
  rackX: 5.25,
  stationX: -6.9,
  carrierLength: 9.4,
  profileLength: 11.8,
};

const profileStepEnds = [1, 4.1, 7.1, 9.6, 13.1];
const profileModes = {
  take: {
    title: "取料",
    steps: [
      ["选层接料", "架外支承对准目标层。"],
      ["载料架侧移", "型材随活动架沿滚道移出货架。"],
      ["架外吊出", "活动架完全离开货架后，行车整体起吊。"],
      ["空架送回", "架外卸料后，行车把空架送回支承。"],
      ["空架归层", "空活动架回到选定层位。"],
    ],
  },
  place: {
    title: "放料",
    steps: [
      ["选层接料", "架外支承对准空层。"],
      ["空架侧移", "空活动架沿滚道移到吊装工位。"],
      ["吊出空架", "活动架完全离开货架后，行车吊往架外装料。"],
      ["带料送回", "行车将装料后的活动架送回支承。"],
      ["带料归层", "活动架带型材回到选定层位。"],
    ],
  },
};

function readProfileScene(stock, job, highlight) {
  const { heights, rackX, stationX } = profileGeometry;
  const homeZ = heights[0];
  const base = { stock, highlight, supportZ: homeZ };
  if (!job) return base;

  const [ready, extended, exchanged, released, complete] = profileStepEnds;
  const { index, time, mode } = job;
  const targetZ = heights[index];
  const outgoing = smooth(time, ready, extended);
  const returning = smooth(time, released, 12.35);
  const clear = smooth(time, 5.55, exchanged) * (1 - smooth(time, exchanged, 8.48));
  const lift = 2.6 * smooth(time, 4.78, 5.55) * (1 - smooth(time, 8.48, 9.15)) + 20 * clear;
  const craneClearance = 5.4 * (1 - smooth(time, extended, 4.68) + smooth(time, 9.16, released));

  return {
    ...base,
    target: job,
    targetZ,
    supportZ: homeZ + (targetZ - homeZ) * smooth(time, 0, .85) * (1 - smooth(time, 12.35, complete)),
    carrierX: rackX + (stationX - rackX) * (outgoing - returning),
    carrierY: 7.5 * smooth(clear, .10, 1),
    carrierZ: targetZ + lift,
    loaded: mode === "take" ? time < exchanged : time >= exchanged,
    showCrane: time >= extended && time < released,
    craneClearance,
  };
}

function addProfileRack(mesh) {
  const { heights, rackX } = profileGeometry;
  const top = heights.at(-1) + .62;
  for (const offset of [-3.8, 0, 3.8]) {
    const x = rackX + offset;
    for (const y of [-1.23, 1.23]) {
      addBox(mesh, x, y, .052, .40, .34, .104, "rail");
      addBox(mesh, x, y, top / 2, .17, .16, top, "rack");
    }
    addBox(mesh, x, 0, top - .065, .13, 2.52, .13, "rack");
  }
  for (const z of heights) {
    for (const y of [-1.19, 1.19]) {
      addBox(mesh, rackX, y, z - .12, 7.8, .145, .20, "rack");
    }
    for (const y of [-.88, .88]) {
      addBox(mesh, rackX, y, z - .174, 7.9, .16, .078, "rail");
      addReceiverRollers(mesh, y, z, rackX, [-3.5, -2.1, -.7, .7, 2.1, 3.5]);
    }
  }
}

function addProfileStand(mesh, z) {
  for (const y of [-1.29, 1.29]) {
    addBox(mesh, -5.65, y, .115, 6.30, .19, .23, "profileStand");
    for (const x of [-8.25, -3.25]) {
      addBox(mesh, x, y, 2.04, .22, .19, 4.08, "profileStand");
      addBox(mesh, x, y * .84, z - .135, .31, .49, .175, "profileStand");
    }
  }
  for (const y of [-.88, .88]) {
    addBox(mesh, -5.65, y, z - .174, 8.6, .16, .078, "lift");
    addReceiverRollers(mesh, y, z, -5.65, [-3.9, -2.8, -1.7, -.6, .6, 1.7, 2.8, 3.9]);
  }
}

function addProfileCarrier(mesh, x, y, z, loaded, active) {
  const { carrierLength, profileLength } = profileGeometry;
  const material = active ? "profileSelected" : "profileCarrier";
  for (const side of [-1, 1]) {
    addBox(mesh, x, y + side * .88, z + .075, carrierLength, .13, .15, material);
    for (const offset of [-4.57, -1.57, 1.57, 4.57]) {
      addBox(mesh, x + offset, y + side * .92, z + .265, .10, .13, .25, material);
    }
    for (const offset of [-2.82, 2.82]) {
      addBox(mesh, x + offset, y + side * .96, z + .166, .14, .073, .085, material);
    }
  }
  for (const offset of [-4.57, -2.3, 0, 2.3, 4.57]) {
    addBox(mesh, x + offset, y, z + .09, .15, 1.79, .12, material);
  }
  if (!loaded) return;

  // Draw two groups of long sections on the carrier rather than using a flat plate.
  for (const offset of [-.625, -.388, .388, .625]) {
    const beamY = y + offset;
    addBox(mesh, x, beamY, z + .302, profileLength, .065, .216, "profileSteel");
    for (const level of [.174, .43]) {
      addBox(mesh, x, beamY, z + level, profileLength, .18, .048, "profileSteel");
    }
  }
}

function addProfileCrane(mesh, x, y, z) {
  const hookZ = z + 1.76;
  addBox(mesh, x, y, hookZ, .16, 2.02, .15, "hoist");
  addBox(mesh, x, y, hookZ + .29, .23, .22, .28, "profileStand");
  addCable(mesh, x, hookZ + .4, x, hookZ + 18, y);
  for (const rail of [-.96, .96]) {
    for (const offset of [-2.82, 2.82]) {
      addCable(mesh, x + offset, z + .15, x, hookZ, y + rail);
    }
  }
}

const fixedProfileMesh = [];
addProfileRack(fixedProfileMesh);
const profileView = {
  halfLength: 12.92,
  halfDepth: 1.40,
  height: 7.1,
  widthSpan: 27.1,
  heightSpan: 9.3,
  gridLength: 14,
  shadows: [[-5.65, 4.25], [5.25, 4.15]],
};

class ProfileScene extends Scene {
  constructor(canvas, preview = "") {
    super(canvas, preview ? {
      ...profileView,
      widthSpan: preview === "overview" ? 23.9 : 26.1,
      height: preview === "overview" ? 4.9 : 6.9,
      heightSpan: 8.4,
    } : profileView);
    this.preview = preview;
    if (preview) {
      this.yaw = -.36;
      this.elevation = .38;
    }
  }

  buildMesh(state) {
    const mesh = [...fixedProfileMesh];
    addProfileStand(mesh, state.supportZ);
    for (const [index, height] of profileGeometry.heights.entries()) {
      if (state.target?.index === index) continue;
      addProfileCarrier(mesh, profileGeometry.rackX, 0, height, state.stock.rack[index],
        state.highlight?.index === index);
    }
    if (state.target) {
      addProfileCarrier(mesh, state.carrierX, state.carrierY, state.carrierZ, state.loaded, true);
      if (state.showCrane) {
        addProfileCrane(mesh, profileGeometry.stationX, state.carrierY, state.carrierZ + state.craneClearance);
      }
    }
    return mesh;
  }

  labels(state) {
    if (this.preview) return [];
    return [
      [profileGeometry.stationX, "架外吊装工位",
        !!state.target && state.target.time >= profileStepEnds[1] && state.target.time <= profileStepEnds[3]],
      [5.25, "型材存放架", !!state.target && (state.target.time < 4.1 || state.target.time > 9.6)],
    ];
  }
}

function showProfilePreviews(stock) {
  const copy = {
    ".product-name": "Profile Storage System",
    "#product-title": "型材库",
    ".hero-description": "长型材分层存放在独立活动架上。取料时，整架沿型材长度方向移出，在货架外起吊。",
    "#system-title + p": "滚轮支承活动架横移，架外支承接住整架型材，为吊装留出空间。",
    ".system-image figcaption": "第三层活动架移出，型材由架外工位承托",
    "#demo-title": "型材取放演示",
    "#demo-title + p": "选择取料或放料，再点选层位，观察活动架如何移出和归层。",
    "#controls-heading": "型材取放控制",
    '[data-mode="take"]': "取出型材",
    '[data-mode="place"]': "放入型材",
    ".demo-note": "演示中，吊索连接活动架，架外装卸以行车往返示意。",
    ".footer-name": "型材库",
    ".footer-english": "Profile Storage System",
  };
  for (const [selector, text] of Object.entries(copy)) {
    document.querySelector(selector).textContent = text;
  }
  const specs = [
    ["存放层位", "5 层"],
    ["转运方向", "纵向移出"],
    ["吊装位置", "货架外侧"],
  ];
  const components = [
    ["固定架", "立柱和大梁支承五层滚道，供活动架进出。"],
    ["活动架", "每层独立承托一组长型材，可带料移出，也可空架归层。"],
    ["架外支承", "活动架移出后在这里停稳，行车随后将整架吊起。"],
  ];
  for (const [selector, rows] of [[".specs", specs], [".components", components]]) {
    for (const [index, row] of [...document.querySelectorAll(selector + " > div")].entries()) {
      const [name, value] = rows[index];
      row.querySelector("dt").textContent = name;
      row.querySelector("dd").textContent = value;
    }
  }
  document.getElementById("scene").setAttribute("aria-label", "五层型材架和左侧架外吊装工位。可拖动旋转视角。");
  const legend = document.querySelectorAll(".legend span");
  legend[1].innerHTML = '<i class="profile-carrier"></i>活动架';
  legend[2].innerHTML = '<i class="profile-stand"></i>架外支承';
  legend[3].innerHTML = '<i class="plate"></i>型材';

  for (const [selector, preview, time, label] of [
    ['.hero-media [data-pose="overview"]', "overview", 0, "右侧五层型材架与左侧架外支承"],
    ['.hero-media [data-pose="lift"]', "lift", 5.42, "行车在货架外将第三层活动架和型材一并吊起"],
    [".system-image img", "transfer", 4.08, "第三层装有型材的活动架完全移至架外支承"],
  ]) {
    const image = document.querySelector(selector);
    const canvas = document.createElement("canvas");
    canvas.className = "profile-preview";
    canvas.hidden = image.hidden;
    if (image.dataset.pose) canvas.dataset.pose = image.dataset.pose;
    if (image.id) canvas.id = image.id;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    image.replaceWith(canvas);
    const view = new ProfileScene(canvas, preview);
    const job = preview === "overview" ? null : { side: "rack", index: 2, time, mode: "take" };
    const state = readProfileScene(stock, job, null);
    new ResizeObserver(() => view.render(state)).observe(canvas);
  }
}
