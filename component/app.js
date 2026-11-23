"use strict";

const isProfile = document.body.dataset.product === "profiles";
const alignEnd = 1.8, transferEnd = 4.1, craneEnd = 7.3, returnEnd = 9.25;
const liftOff = 5.15, setDown = 6.23;
const stepEnds = isProfile ? profileStepEnds : [alignEnd, transferEnd, craneEnd, returnEnd, 10.7];
const cycleEnd = stepEnds.at(-1);
const alignStep = ["升降对层", "中央升降架对齐目标层。"];
const resetStep = ["平台复位", "升降架回到起始高度。"];
const plateModes = {
  take: {
    title: "取板",
    steps: [
      alignStep,
      ["带板横移", "钢板随活动架滑上中央滚轮。"],
      ["行车吊出", "行车吊走板材，活动架留在中央。"],
      ["空架归层", "空活动架返回原层。"],
      resetStep,
    ],
  },
  place: {
    title: "放板",
    steps: [
      alignStep,
      ["空架横移", "空活动架滑上中央滚轮。"],
      ["行车放板", "行车将板材放到活动架上，吊具抬起。"],
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
const stepIndex = time => stepEnds.findIndex(end => time < end);
const smooth = (time, start, end) => {
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
const stepLabels = [...document.querySelectorAll("#steps li")];
const remaining = document.getElementById("remaining");
const progress = document.getElementById("progress");
const statusDot = document.getElementById("status-dot");
const status = document.getElementById("status");
const detail = document.getElementById("detail");

let stock = initialStock();
let side = isProfile ? "rack" : "left";
let mode = "take";
let job = null;
let lastJob = null;
let highlight = null;
let animationFrame = null;
let previousTime = null;

function readScene() {
  if (isProfile) return readProfileScene(stock, job, highlight);
  const base = { stock, highlight, liftZ: GEOMETRY.heights[0] };
  if (!job) return base;

  const { side: source, index, time } = job;
  const placing = job.mode === "place";
  const sourceX = GEOMETRY.rackX[source];
  const levelZ = GEOMETRY.heights[index];
  const transfer = smooth(time, alignEnd, transferEnd);
  const returnTray = smooth(time, craneEnd, returnEnd);
  const trayX = sourceX * (1 - transfer + returnTray);
  const craneTravel = placing ? 1 - smooth(time, transferEnd, 5.2) : smooth(time, 6.18, craneEnd);
  const onTray = placing ? time >= setDown : time <= liftOff;
  const boardLift = onTray ? 0 : 6.6 * craneTravel + 2.4 * (
    placing ? 1 - smooth(time, 5.16, setDown) : smooth(time, liftOff, 6.18)
  );
  const hoistClearance = placing
    ? 10.4 * smooth(time, 6.38, craneEnd)
    : 7.2 * (1 - smooth(time, transferEnd + .18, 5.08));
  const liftTravel = (levelZ - base.liftZ) * smooth(time, 0, 1.56);
  return {
    ...base,
    target: job,
    levelZ,
    liftZ: base.liftZ + liftTravel * (1 - smooth(time, returnEnd, cycleEnd)),
    trayX,
    boardX: onTray ? trayX : 0,
    boardY: onTray ? 0 : 9 * craneTravel,
    boardLift,
    boardVisible: placing ? time >= transferEnd : time < craneEnd,
    crane: time >= transferEnd && time < craneEnd,
    craneZ: levelZ + GEOMETRY.plateBase + GEOMETRY.plateThickness + boardLift + hoistClearance,
    alignGuide: time >= 1.04 && time < alignEnd + .32,
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
  const currentStep = job ? stepIndex(job.time) : -1;
  remaining.textContent = `${occupiedLabel} ${loaded} · 空层 ${slots.length - loaded}`;
  fieldHint.textContent = `点选${placing ? "空层" : occupiedLabel + "层位"}${title}。层位从下往上编号。`;
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
    detail.textContent = `${locationLabel(lastJob)}${cargo}已${placing ? "放入" : "取出"}，设备已复位。`;
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
    const current = currentStep === index;
    const done = index < currentStep || (!job && lastJob);
    item.dataset.state = current ? "current" : done ? "done" : "waiting";
    item.firstElementChild.textContent = steps[index][0];
    item.lastElementChild.textContent = steps[index][1];
    if (current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }

  progress.max = cycleEnd;
  progress.value = job?.time ?? (lastJob ? cycleEnd : 0);
}

function stopAnimation() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  previousTime = null;
}

function tick(now) {
  animationFrame = null;
  if (!job || job.paused) return;
  const before = stepIndex(job.time);
  if (previousTime !== null) job.time += Math.min((now - previousTime) / 1000, .1);
  previousTime = now;
  if (job.time >= cycleEnd) {
    stock[job.side][job.index] = job.mode === "place";
    lastJob = job;
    job = null;
    stopAnimation();
    updateUI();
  } else {
    if (stepIndex(job.time) !== before) updateUI();
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

// Fit the Streamlit iframe to its content when the host permits same-origin access.
const hostFrame = window.frameElement;
if (hostFrame) {
  const page = document.querySelector(".page");
  const fitFrame = () => {
    const height = `${Math.ceil(page.getBoundingClientRect().height)}px`;
    if (hostFrame.style.height !== height) hostFrame.style.height = height;
  };
  fitFrame();
  new ResizeObserver(fitFrame).observe(page);
}
updateUI();
renderScene();
