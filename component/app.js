"use strict";

const STEPS = [
  { name: "升降对层", end: 1.8, description: "中央升降架对齐目标层。" },
  { name: "带板横移", end: 4.1, description: "活动架和板材一同移到中央承托面。" },
  { name: "行车吊板", end: 7.3, description: "行车只吊走板材，活动架留在中央。" },
  { name: "空架归层", end: 9.25, description: "空活动架沿原路回到货架。" },
  { name: "平台复位", end: 10.7, description: "升降架下降到起始高度。" },
];
const cycleEnd = STEPS.at(-1).end;
const fullStock = () => ({
  left: GEOMETRY.heights.map(() => true),
  right: GEOMETRY.heights.map(() => true),
});
const sideLabel = side => side === "left" ? "左库" : "右库";
const locationLabel = ({ side, index }) => `${sideLabel(side)}第 ${index + 1} 层`;
const stepIndex = time => STEPS.findIndex(step => time < step.end);
const smooth = (time, start, end) => {
  const portion = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return portion * portion * (3 - 2 * portion);
};

const canvas = document.getElementById("scene");
const scene = new Scene(canvas);
const sideButtons = [...document.querySelectorAll("[data-side]")];
const levels = document.getElementById("levels");
const pauseButton = document.getElementById("pause");
const resetButton = document.getElementById("reset");
const stepLabels = [...document.querySelectorAll("#steps li")];
const remaining = document.getElementById("remaining");
const progress = document.getElementById("progress");
const statusDot = document.getElementById("status-dot");
const status = document.getElementById("status");
const detail = document.getElementById("detail");

let stock = fullStock();
let side = "left";
let job = null;
let lastJob = null;
let highlight = null;
let animationFrame = null;
let previousTime = null;

function readScene() {
  const base = { stock, highlight, liftZ: GEOMETRY.heights[0] };
  if (!job) return base;

  const { side: source, index, time } = job;
  const [alignEnd, moveEnd, hoistEnd, returnEnd] = STEPS.map(step => step.end);
  const sourceX = GEOMETRY.rackX[source];
  const levelZ = GEOMETRY.heights[index];
  const transfer = smooth(time, alignEnd, moveEnd);
  const returnTray = smooth(time, hoistEnd, returnEnd);
  const boardLift = 2.4 * smooth(time, 5.15, 6.18) + 6.6 * smooth(time, 6.18, hoistEnd);
  const boardY = 9 * smooth(time, 6.18, hoistEnd);
  const hoistClearance = 5.5 * (1 - smooth(time, moveEnd, 5.08));
  const liftTravel = (levelZ - base.liftZ) * smooth(time, 0, 1.56);
  return {
    ...base,
    target: job,
    levelZ,
    liftZ: base.liftZ + liftTravel * (1 - smooth(time, returnEnd, cycleEnd)),
    trayX: sourceX * (1 - transfer + returnTray),
    boardX: sourceX * (1 - transfer),
    boardY,
    boardLift,
    boardVisible: time < hoistEnd,
    crane: time >= moveEnd && time < hoistEnd,
    craneZ: levelZ + GEOMETRY.plateBase + GEOMETRY.plateThickness + boardLift + hoistClearance,
    alignGuide: time >= 1.04 && time < alignEnd + .32,
  };
}

function renderScene() {
  scene.render(readScene());
}

const levelButtons = GEOMETRY.heights.map((_, index) => {
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
  const layerCount = stock[side].filter(Boolean).length;
  const currentStep = job ? stepIndex(job.time) : -1;
  remaining.textContent = `有板层位 ${layerCount} / ${GEOMETRY.heights.length}`;
  for (const button of sideButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.side === side));
    button.disabled = Boolean(job);
  }
  for (const [index, { button, label }] of levelButtons.entries()) {
    const occupied = stock[side][index];
    const isCurrent = job?.side === side && job.index === index;
    button.disabled = Boolean(job) || !occupied;
    button.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-empty", !occupied);
    label.textContent = isCurrent ? "取板中" : occupied ? "有板" : "已取";
    button.setAttribute("aria-label", `${occupied ? "取" : ""}${locationLabel({ side, index })}，${label.textContent}`);
  }

  if (job) {
    statusDot.dataset.state = "active";
    const step = STEPS[currentStep];
    status.textContent = job.paused ? `已暂停 · ${step.name}` : step.name;
    detail.textContent = `${locationLabel(job)}：${step.description}`;
  } else if (lastJob) {
    statusDot.dataset.state = "complete";
    status.textContent = "取板完成";
    detail.textContent = `${locationLabel(lastJob)}已取出，设备已复位。`;
  } else {
    statusDot.dataset.state = "idle";
    status.textContent = "等待选层";
    detail.textContent = "选择一层后，设备开始自动演示。";
  }

  pauseButton.disabled = !job;
  pauseButton.textContent = job?.paused ? "继续演示" : "暂停演示";
  for (const [index, item] of stepLabels.entries()) {
    const current = currentStep === index;
    const done = index < currentStep || (!job && lastJob);
    item.dataset.state = current ? "current" : done ? "done" : "waiting";
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
    stock[job.side][job.index] = false;
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
  if (job || !stock[side][index]) return;
  highlight = null;
  job = { side, index, time: 0, paused: false };
  updateUI();
  renderScene();
  animationFrame = requestAnimationFrame(tick);
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
  stock = fullStock();
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
    const section = document.getElementById(link.hash.slice(1));
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
  });
}

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
