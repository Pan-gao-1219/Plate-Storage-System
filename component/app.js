"use strict";

const isProfile = document.body.dataset.product === "profiles";
const craneDuration = 3.2;
const plateStepEnds = GEOMETRY.heights.map((height, index) => {
  const vertical = index === 0 ? 0 : .8 + .4 * (height - GEOMETRY.heights[0]);
  let end = 0;
  return [vertical, 2.3, vertical, craneDuration, vertical, 2.05, vertical].map(duration => end += duration);
});
const alignStep = ["升降对层", "中央升降架对齐目标层。"];
const resetStep = ["平台复位", "活动架归位后，升降架回到第一层。"];
const plateModes = {
  take: {
    title: "取板",
    steps: [
      alignStep,
      ["带板横移", "钢板随活动架滑上中央滚轮。"],
      ["降至一层", "升降架托住活动架和钢板，一起降到第一层。"],
      ["一层吊出", "平台停稳，行车吊走钢板。"],
      ["升回原层", "升降架托着空活动架回到原层高度。"],
      ["空架归层", "空活动架返回原层。"],
      resetStep,
    ],
  },
  place: {
    title: "放板",
    steps: [
      alignStep,
      ["空架横移", "空活动架滑上中央滚轮。"],
      ["降至一层", "升降架托着空活动架降到第一层。"],
      ["一层放板", "平台停稳，行车将钢板放上活动架，吊具抬起。"],
      ["升回目标层", "升降架托着活动架和钢板升回目标层。"],
      ["带板归层", "活动架带板返回目标层。"],
      resetStep,
    ],
  },
};
const modes = isProfile ? profileModes : plateModes;
const layerHeights = isProfile ? profileGeometry.heights : GEOMETRY.heights;
const cargo = isProfile ? "型材" : "板材";
const occupiedLabel = isProfile ? "有料" : "有板";
const initialRack = () => layerHeights.map((_, index) => index < layerHeights.length - 1);
const initialStock = () => isProfile ? { rack: initialRack() } : { left: initialRack(), right: initialRack() };
const sideLabel = side => side === "left" ? "左库" : "右库";
const locationLabel = ({ side, index }) => `${isProfile ? "" : sideLabel(side)}第 ${index + 1} 层`;
const stepEndsFor = index => isProfile ? profileStepEnds : plateStepEnds[index ?? plateStepEnds.length - 1];
const stepIndex = (ends, time) => ends.findIndex(end => time < end);
const smooth = (time, start, end) => {
  if (start === end) return Number(time >= end);
  const portion = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return portion * portion * (3 - 2 * portion);
};

const canvas = document.getElementById("scene");
const scene = isProfile ? new ProfileScene(canvas) : new Scene(canvas);
const sideButtons = [...document.querySelectorAll("[data-side]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const levels = document.getElementById("levels");
const fieldHint = document.getElementById("field-hint");
const pauseButton = document.getElementById("pause");
const resetButton = document.getElementById("reset");
const processHeading = document.getElementById("process-heading");
const stepList = document.getElementById("steps");
const stepLabels = modes.take.steps.map(() => {
  const item = document.createElement("li");
  item.append(document.createElement("span"), document.createElement("small"));
  stepList.append(item);
  return item;
});
const remaining = document.getElementById("remaining");
const progress = document.getElementById("progress");
const statusDot = document.getElementById("status-dot");
const status = document.getElementById("status");
const detail = document.getElementById("detail");

let stock = initialStock();
let profileBarIndex = 0;
let side = isProfile ? "rack" : "left";
let mode = "take";
let job = null;
let lastJob = null;
let highlight = null;
let animationFrame = null;
let previousTime = null;

function readScene() {
  if (isProfile) return readProfileScene(stock, job, highlight, profileBarIndex);
  const base = { stock, highlight, liftZ: GEOMETRY.heights[0] };
  if (!job) return base;

  const { side: source, index, time } = job;
  const placing = job.mode === "place";
  const sourceX = GEOMETRY.rackX[source];
  const levelZ = GEOMETRY.heights[index];
  const [alignEnd, transferEnd, lowerEnd, craneEnd, raiseEnd, returnEnd, parkEnd] = plateStepEnds[index];
  const transfer = smooth(time, alignEnd, transferEnd);
  const returnTray = smooth(time, raiseEnd, returnEnd);
  const trayX = sourceX * (1 - transfer + returnTray);
  const stroke = levelZ - base.liftZ;
  const liftZ = base.liftZ + stroke * (
    smooth(time, 0, alignEnd) - smooth(time, transferEnd, lowerEnd)
    + smooth(time, craneEnd, raiseEnd) - smooth(time, returnEnd, parkEnd)
  );
  // Outside the central bay the rack supports the tray at the selected level.
  const trayZ = time >= transferEnd && time < raiseEnd ? liftZ : levelZ;
  const craneTime = time - lowerEnd;
  const craneTravel = placing ? 1 - smooth(craneTime, 0, 1.1) : smooth(craneTime, 2.08, craneDuration);
  const onTray = placing ? craneTime >= 2.13 : craneTime <= 1.05;
  const boardLift = onTray ? 0 : 6.6 * craneTravel + 2.4 * (placing
    ? 1 - smooth(craneTime, 1.1, 2.13) : smooth(craneTime, 1.05, 2.08));
  const hoistClearance = placing
    ? 10.4 * smooth(craneTime, 2.28, craneDuration)
    : 7.2 * (1 - smooth(craneTime, .18, .98));
  return {
    ...base,
    target: job,
    levelZ,
    liftZ,
    trayX,
    trayZ,
    boardX: onTray ? trayX : 0,
    boardY: onTray ? 0 : 9 * craneTravel,
    boardLift,
    boardVisible: placing ? time >= lowerEnd : time < craneEnd,
    crane: time >= lowerEnd && time < craneEnd,
    craneZ: base.liftZ + GEOMETRY.plateBase + GEOMETRY.plateThickness + boardLift + hoistClearance,
    alignGuide: time >= alignEnd && time < alignEnd + .32,
  };
}

function renderScene() {
  scene.render(readScene());
}

const levelButtons = layerHeights.map((_, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "level";
  const title = document.createElement("span");
  title.textContent = `第 ${index + 1} 层`;
  const label = document.createElement("small");
  button.append(title, label);
  const showHighlight = () => {
    if (button.disabled || job) return;
    highlight = { side, index };
    renderScene();
  };
  const hideHighlight = () => {
    if (highlight?.side !== side || highlight.index !== index) return;
    highlight = null;
    renderScene();
  };
  button.addEventListener("pointerenter", showHighlight);
  button.addEventListener("pointerleave", hideHighlight);
  button.addEventListener("focus", showHighlight);
  button.addEventListener("blur", hideHighlight);
  button.addEventListener("click", () => startJob(index));
  levels.append(button);
  return { button, label };
});

function updateUI() {
  const slots = stock[side];
  const loaded = slots.filter(Boolean).length;
  const placing = mode === "place";
  const eligible = placing ? slots.length - loaded : loaded;
  const { title, steps } = modes[mode];
  const ends = stepEndsFor(job?.index ?? lastJob?.index);
  const currentStep = job ? stepIndex(ends, job.time) : -1;
  remaining.textContent = `${occupiedLabel} ${loaded} · 空层 ${slots.length - loaded}`;
  fieldHint.textContent = `点选${placing ? "空层" : occupiedLabel + "层位"}${title}。层位从下往上编号。`;
  if (isProfile && !job) fieldHint.textContent += `横杆在第 ${profileBarIndex + 1} 层。`;
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    button.disabled = Boolean(job);
  }
  for (const button of sideButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.side === side));
    button.disabled = Boolean(job);
  }
  for (const [index, { button, label }] of levelButtons.entries()) {
    const occupied = stock[side][index];
    const isCurrent = job?.side === side && job.index === index;
    button.disabled = Boolean(job) || occupied === placing;
    button.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-empty", !occupied);
    label.textContent = isCurrent ? `${title}中` : occupied ? occupiedLabel : "空层";
    button.setAttribute("aria-label", `${locationLabel({ side, index })}，${label.textContent}`);
  }

  if (job) {
    statusDot.dataset.state = "active";
    const [name, description] = steps[currentStep];
    status.textContent = job.paused ? `已暂停 · ${name}` : name;
    detail.textContent = `${locationLabel(job)}：${description}`;
  } else if (lastJob) {
    statusDot.dataset.state = "complete";
    status.textContent = `${title}完成`;
    const result = `${locationLabel(lastJob)}${cargo}已${placing ? "放入" : "取出"}`;
    detail.textContent = isProfile ? `${result}，横杆留在该层。` : `${result}，设备已复位。`;
  } else {
    statusDot.dataset.state = "idle";
    status.textContent = eligible ? "等待选层" : placing ? "当前货架已满" : `当前货架无${cargo}`;
    detail.textContent = eligible
      ? `选择层位，开始${title}演示。`
      : `${isProfile ? "请" : "可以切换货架，或"}先${placing ? "取出" : "放入"}${cargo}。`;
  }

  pauseButton.disabled = !job;
  pauseButton.textContent = job?.paused ? "继续演示" : "暂停演示";
  processHeading.textContent = `${title}流程`;
  for (const [index, item] of stepLabels.entries()) {
    item.hidden = ends[index] === (ends[index - 1] ?? 0);
    const current = currentStep === index;
    const done = index < currentStep || (!job && lastJob);
    item.dataset.state = current ? "current" : done ? "done" : "waiting";
    item.firstElementChild.textContent = steps[index][0];
    item.lastElementChild.textContent = steps[index][1];
    if (current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }

  progress.max = ends.at(-1);
  progress.value = job?.time ?? (lastJob ? progress.max : 0);
}

function stopAnimation() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  previousTime = null;
}

function tick(now) {
  animationFrame = null;
  if (!job || job.paused) return;
  const ends = stepEndsFor(job.index);
  const before = stepIndex(ends, job.time);
  if (previousTime !== null) job.time += Math.min((now - previousTime) / 1000, .1);
  previousTime = now;
  if (job.time >= ends.at(-1)) {
    stock[job.side][job.index] = job.mode === "place";
    if (isProfile) profileBarIndex = job.index;
    lastJob = job;
    job = null;
    stopAnimation();
    updateUI();
  } else {
    if (stepIndex(ends, job.time) !== before) updateUI();
    progress.value = job.time;
    animationFrame = requestAnimationFrame(tick);
  }
  renderScene();
}

function startJob(index) {
  if (job || stock[side][index] === (mode === "place")) return;
  highlight = null;
  job = { side, index, mode, time: 0, paused: false };
  updateUI();
  renderScene();
  animationFrame = requestAnimationFrame(tick);
}

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    if (mode === button.dataset.mode) return;
    mode = button.dataset.mode;
    lastJob = null;
    highlight = null;
    updateUI();
    renderScene();
  });
}
for (const button of sideButtons) {
  button.addEventListener("click", () => {
    side = button.dataset.side;
    highlight = null;
    updateUI();
    renderScene();
  });
}
pauseButton.addEventListener("click", () => {
  if (!job) return;
  job.paused = !job.paused;
  if (job.paused) stopAnimation();
  else animationFrame = requestAnimationFrame(tick);
  updateUI();
});
resetButton.addEventListener("click", () => {
  stopAnimation();
  stock = initialStock();
  profileBarIndex = 0;
  job = null;
  lastJob = null;
  highlight = null;
  updateUI();
  renderScene();
});

const viewButtons = ["perspective", "front"].map(id => document.getElementById(id));
for (const button of viewButtons) {
  button.addEventListener("click", () => {
    scene.setView(button.id);
    for (const option of viewButtons) option.setAttribute("aria-pressed", String(option === button));
    renderScene();
  });
}
let drag = null;
canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0 || drag) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId) return;
  scene.rotate(event.clientX - drag.x, event.clientY - drag.y);
  drag.x = event.clientX;
  drag.y = event.clientY;
  for (const button of viewButtons) button.setAttribute("aria-pressed", "false");
  renderScene();
});
canvas.addEventListener("lostpointercapture", () => { drag = null; });
new ResizeObserver(renderScene).observe(canvas);

// Scroll inside the Streamlit embed without navigating the iframe away from the product page.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
for (const link of document.querySelectorAll('a[href^="#"]')) {
  link.addEventListener("click", event => {
    const siteHeader = link.hash === "#top"
      ? window.frameElement?.ownerDocument.querySelector(".site-masthead")
      : null;
    const section = siteHeader || document.getElementById(link.hash.slice(1));
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
  });
}

if (isProfile) showProfilePreviews(stock);

const galleryCaption = document.querySelector(".gallery-caption");
const galleryButtons = document.querySelectorAll("[data-gallery]");
const galleryImages = document.querySelectorAll(".hero-media [data-pose]");
const galleryCopy = isProfile
  ? { overview: "型材分层存放在活动架上", transfer: "行车提起前端，沿滚轮外拖", lift: "活动架落在横杆上，行车单独吊走型材" }
  : { overview: "两侧固定货架与中央升降架", lift: "行车在第一层吊走钢板，活动架留在升降架上" };

function selectGalleryPose(pose) {
  for (const image of galleryImages) image.hidden = image.dataset.pose !== pose;
  for (const button of galleryButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.gallery === pose));
  }
  galleryCaption.textContent = galleryCopy[pose];
}

for (const button of galleryButtons) {
  button.addEventListener("click", () => selectGalleryPose(button.dataset.gallery));
}
selectGalleryPose("overview");

// Fit the Streamlit iframe to its content when the host permits same-origin access.
const hostFrame = window.frameElement;
if (hostFrame) {
  const page = document.querySelector(".page");
  const fitFrame = () => {
    const height = `${Math.ceil(page.getBoundingClientRect().height)}px`;
    if (hostFrame.style.height !== height) hostFrame.style.height = height;
  };
  fitFrame();
  hostFrame.scrolling = "no";
  new ResizeObserver(fitFrame).observe(page);
}
updateUI();
renderScene();
