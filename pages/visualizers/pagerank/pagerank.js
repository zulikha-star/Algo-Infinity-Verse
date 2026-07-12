/* ============================================================
   PAGERANK VISUALIZER — fluid network flow engine
   Algo Infinity Verse · pages/visualizers/pagerank

   A directed "web graph" is laid out with simple force-directed
   physics. The PageRank power method runs iteratively, growing
   or shrinking each node's radius so that its AREA matches its
   probability mass. Thousands of "random surfer" particles walk
   the graph's edges and periodically teleport to a random page —
   a direct visualization of the damping factor.
   ============================================================ */

/* ------------------------------------------------------------
   1. TINY UTILITIES
------------------------------------------------------------- */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(2024);
const randRange = (a, b) => a + rand() * (b - a);
const randInt = (a, b) => Math.floor(randRange(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function labelFor(i) {
  // page names like P1, P2 ... short and legible on small nodes
  return "P" + (i + 1);
}

/* ------------------------------------------------------------
   2. GLOBAL STATE
------------------------------------------------------------- */

const state = {
  nodeCount: 16,
  edgeDensity: 2.5,
  damping: 0.85,
  particleCount: 400,
  autoIterate: true,
  forcesOn: true,
  showArrows: true,
  paused: false,

  nodes: [],       // {id, x, y, vx, vy, pr, radius, outDeg}
  edges: [],       // {u, v}
  outLinks: [],    // outLinks[i] = [j, j, ...]
  inLinks: [],     // inLinks[i]  = [j, j, ...]
  danglingNodes: [],

  iteration: 0,
  lastDelta: 1,
  deltaHistory: [],
  converged: false,

  particles: [],

  lastFrameTime: performance.now(),
  iterAccumMs: 0,
  iterIntervalMs: 260, // one PageRank iteration every ~0.26s when auto-iterating
};

/* ------------------------------------------------------------
   3. WEB GRAPH GENERATION
------------------------------------------------------------- */

function buildGraph() {
  const n = state.nodeCount;
  const nodes = [];
  const cx = 0, cy = 0; // world-space center; canvas mapping handled at draw time
  const spread = 260;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + randRange(-0.15, 0.15);
    const r = spread * randRange(0.35, 1);
    nodes.push({
      id: i,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
      pr: 1 / n,
      radius: 10,
      outDeg: 0,
    });
  }

  const edgeSet = new Set();
  const edges = [];
  const outLinks = Array.from({ length: n }, () => []);
  const inLinks = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    // most pages link out to a handful of others; a few are left
    // intentionally "dangling" (no outgoing links) to exercise that
    // branch of the PageRank formula
    const isDangling = rand() < 0.08 && n > 8;
    const outCount = isDangling ? 0 : Math.max(1, Math.round(randRange(1, state.edgeDensity * 2 - 1)));
    let attempts = 0;
    let added = 0;
    while (added < outCount && attempts < outCount * 6) {
      attempts++;
      const j = randInt(0, n - 1);
      if (j === i) continue;
      const key = i + "->" + j;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ u: i, v: j });
      outLinks[i].push(j);
      inLinks[j].push(i);
      added++;
    }
  }

  // guarantee every node has at least one inbound link where possible,
  // so the graph doesn't leave isolated islands with zero PageRank flow
  for (let j = 0; j < n; j++) {
    if (inLinks[j].length === 0) {
      let i = randInt(0, n - 1);
      let tries = 0;
      while ((i === j || outLinks[i].length === 0 && rand() < 0.5) && tries < 10) { i = randInt(0, n - 1); tries++; }
      if (i !== j) {
        const key = i + "->" + j;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ u: i, v: j });
          outLinks[i].push(j);
          inLinks[j].push(i);
        }
      }
    }
  }

  nodes.forEach((node, i) => { node.outDeg = outLinks[i].length; });

  state.nodes = nodes;
  state.edges = edges;
  state.outLinks = outLinks;
  state.inLinks = inLinks;
  state.danglingNodes = nodes.filter(nd => nd.outDeg === 0).map(nd => nd.id);

  resetRanks();
  updateGraphChips();
}

function resetRanks() {
  const n = state.nodeCount;
  state.nodes.forEach(nd => { nd.pr = 1 / n; });
  state.iteration = 0;
  state.lastDelta = 1;
  state.deltaHistory = [];
  state.converged = false;
  updateNodeRadii();
}

/* ------------------------------------------------------------
   4. PAGERANK — ITERATIVE POWER METHOD
   ------------------------------------------------------------
   PR'(i) = (1-d)/N + d * [ danglingMass/N + sum_{j->i} PR(j)/outDeg(j) ]
   Iterating this matrix-vector multiply converges PR to the
   dominant eigenvector of the (damped) transition matrix.
------------------------------------------------------------- */

function pageRankStep() {
  const n = state.nodeCount;
  const d = state.damping;
  const nodes = state.nodes;

  let danglingMass = 0;
  for (const idx of state.danglingNodes) danglingMass += nodes[idx].pr;

  const base = (1 - d) / n + d * (danglingMass / n);
  const next = new Float64Array(n).fill(base);

  for (const { u, v } of state.edges) {
    const outDeg = nodes[u].outDeg;
    if (outDeg > 0) next[v] += d * (nodes[u].pr / outDeg);
  }

  let delta = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    delta += Math.abs(next[i] - nodes[i].pr);
    sum += next[i];
  }
  for (let i = 0; i < n; i++) nodes[i].pr = next[i];

  state.iteration++;
  state.lastDelta = delta;
  state.deltaHistory.push(delta);
  if (state.deltaHistory.length > 60) state.deltaHistory.shift();
  state.converged = delta < 1e-5;

  updateNodeRadii();
  updateTelemetryUI(sum);
}

// node area (pi * r^2) is proportional to its PageRank score,
// relative to a perfectly uniform 1/N baseline — so a page exactly
// at the average gets the "neutral" reference radius.
function updateNodeRadii() {
  const n = state.nodeCount;
  const uniform = 1 / n;
  const minR = 9, maxR = 46, refR = 20;
  for (const nd of state.nodes) {
    const ratio = nd.pr / uniform;         // area ratio vs. uniform baseline
    const r = refR * Math.sqrt(Math.max(ratio, 0.02));
    nd.radius = clamp(r, minR, maxR);
  }
}

/* ------------------------------------------------------------
   5. FORCE-DIRECTED LAYOUT
   ------------------------------------------------------------
   Lightweight custom physics (no external library): pairwise
   repulsion sized to current node radii (so drastically inflated
   "authority" pages still push their neighbors away cleanly),
   spring attraction along edges, and a weak centering force.
------------------------------------------------------------- */

function updateForces(dt) {
  const nodes = state.nodes;
  const n = nodes.length;
  if (!state.forcesOn || n === 0) return;

  const REPEL = 3600;
  const SPRING_K = 0.02;
  const CENTER_K = 0.0025;
  const DAMPING = 0.86;

  // repulsion
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let distSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius + 24;
      if (distSq < 1) distSq = 1;
      const dist = Math.sqrt(distSq);
      const force = REPEL / distSq * (dist < minDist ? 2.2 : 1);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx * dt; a.vy += fy * dt;
      b.vx -= fx * dt; b.vy -= fy * dt;
    }
  }

  // spring attraction along edges
  for (const { u, v } of state.edges) {
    const a = nodes[u], b = nodes[v];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const ideal = a.radius + b.radius + 70;
    const stretch = dist - ideal;
    const force = SPRING_K * stretch;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx * dt; a.vy += fy * dt;
    b.vx -= fx * dt; b.vy -= fy * dt;
  }

  // centering
  for (const nd of nodes) {
    nd.vx += -nd.x * CENTER_K;
    nd.vy += -nd.y * CENTER_K;
  }

  // integrate
  for (const nd of nodes) {
    nd.vx *= DAMPING; nd.vy *= DAMPING;
    nd.x += nd.vx * dt * 60;
    nd.y += nd.vy * dt * 60;
  }
}

/* ------------------------------------------------------------
   6. RANDOM SURFER PARTICLES
   ------------------------------------------------------------
   Each particle walks the directed graph: with probability `d`
   it follows a random outgoing edge from its current page; with
   probability `1-d` (or when stuck on a dangling page) it
   teleports instantly to a uniformly random page. That teleport
   is the visual embodiment of the damping factor breaking up
   infinite loops and spider traps.
------------------------------------------------------------- */

function spawnParticle() {
  const n = state.nodeCount;
  if (n === 0) return null;
  const start = randInt(0, n - 1);
  return {
    from: start,
    to: start,
    t: 1,          // 1 means "arrived, needs a new destination"
    speed: randRange(0.55, 1.15),
    teleportFlash: 0, // >0 while showing a teleport spark
  };
}

function syncParticlePool() {
  const target = state.particleCount;
  while (state.particles.length < target) state.particles.push(spawnParticle());
  if (state.particles.length > target) state.particles.length = target;
}

function chooseNextHop(particle) {
  const n = state.nodeCount;
  const outs = state.outLinks[particle.to];
  const doTeleport = outs.length === 0 || rand() > state.damping;
  if (doTeleport) {
    particle.from = particle.to;
    particle.to = randInt(0, n - 1);
    particle.teleportFlash = 1;
  } else {
    particle.from = particle.to;
    particle.to = outs[randInt(0, outs.length - 1)];
  }
  particle.t = 0;
  particle.speed = randRange(0.55, 1.15);
}

function updateParticles(dt) {
  if (state.nodeCount === 0) return;
  for (const p of state.particles) {
    if (!p) continue;
    if (p.teleportFlash > 0) p.teleportFlash = Math.max(0, p.teleportFlash - dt * 2.2);
    if (p.t >= 1) {
      chooseNextHop(p);
      continue;
    }
    p.t = Math.min(1, p.t + dt * p.speed);
  }
}

function particleWorldPos(p) {
  const a = state.nodes[p.from], b = state.nodes[p.to];
  if (!a || !b) return { x: 0, y: 0, teleport: false };
  if (a === b || p.teleportFlash > 0.55) {
    return { x: b.x, y: b.y, teleport: true };
  }
  // slight arc so parallel edges don't perfectly overlap
  const t = p.t;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const nx = -dy, ny = dx;
  const nlen = Math.hypot(nx, ny) || 1;
  const bow = Math.min(18, Math.hypot(dx, dy) * 0.06);
  const cx = mx + (nx / nlen) * bow;
  const cy = my + (ny / nlen) * bow;
  const it = 1 - t;
  const x = it * it * a.x + 2 * it * t * cx + t * t * b.x;
  const y = it * it * a.y + 2 * it * t * cy + t * t * b.y;
  return { x, y, teleport: false };
}

/* ------------------------------------------------------------
   7. RENDERING
------------------------------------------------------------- */

const viewportEl = document.getElementById("viewport");
const canvas = document.getElementById("pagerankCanvas");
const ctx = canvas.getContext("2d");

const camera = { scale: 1 };

function resizeCanvas() {
  const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
  canvas.width = w * devicePixelRatio;
  canvas.height = h * devicePixelRatio;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
}
window.addEventListener("resize", resizeCanvas);

function worldToScreen(x, y) {
  const w = canvas.width, h = canvas.height;
  return {
    x: w / 2 + x * camera.scale * devicePixelRatio,
    y: h / 2 + y * camera.scale * devicePixelRatio,
  };
}

function drawArrowHead(x, y, angle, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, size * 0.55);
  ctx.lineTo(-size, -size * 0.55);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function prColor(nd) {
  const n = state.nodeCount;
  const ratio = clamp(nd.pr / (1 / n) / 3, 0, 1); // 0 = average/low, 1 = high authority
  const c1 = [124, 58, 237];   // purple (low/avg)
  const c2 = [6, 182, 212];    // cyan
  const c3 = [244, 114, 182];  // pink (top authority)
  let r, g, b;
  if (ratio < 0.5) {
    const t = ratio / 0.5;
    r = lerp(c1[0], c2[0], t); g = lerp(c1[1], c2[1], t); b = lerp(c1[2], c2[2], t);
  } else {
    const t = (ratio - 0.5) / 0.5;
    r = lerp(c2[0], c3[0], t); g = lerp(c2[1], c3[1], t); b = lerp(c2[2], c3[2], t);
  }
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

function render() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // edges
  const s = camera.scale * devicePixelRatio;
  ctx.lineWidth = Math.max(1, 1.1 * s);
  for (const { u, v } of state.edges) {
    const a = state.nodes[u], b = state.nodes[v];
    const pa = worldToScreen(a.x, a.y), pb = worldToScreen(b.x, b.y);
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const startX = pa.x + ux * (a.radius * s + 2);
    const startY = pa.y + uy * (a.radius * s + 2);
    const endX = pb.x - ux * (b.radius * s + 8 * s);
    const endY = pb.y - uy * (b.radius * s + 8 * s);

    ctx.strokeStyle = "rgba(124, 58, 237, 0.22)";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    if (state.showArrows) {
      const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      drawArrowHead(
        pb.x - ux * (b.radius * s + 2 * s), pb.y - uy * (b.radius * s + 2 * s),
        angle, Math.max(4, 5 * s), "rgba(167, 139, 250, 0.55)"
      );
    }
  }

  // particles (random surfers)
  for (const p of state.particles) {
    if (!p) continue;
    const pos = particleWorldPos(p);
    const sp = worldToScreen(pos.x, pos.y);
    if (pos.teleport && p.teleportFlash > 0) {
      const flashR = (1 - p.teleportFlash) * 22 * s + 3 * s;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, flashR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(250, 204, 21, ${p.teleportFlash})`;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 1.8 * s, 0, Math.PI * 2);
    ctx.fillStyle = p.teleportFlash > 0.15 ? "#facc15" : "#06b6d4";
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // nodes
  for (const nd of state.nodes) {
    const sp = worldToScreen(nd.x, nd.y);
    const r = nd.radius * s;
    const color = prColor(nd);

    const glow = ctx.createRadialGradient(sp.x, sp.y, r * 0.2, sp.x, sp.y, r * 1.7);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.stroke();

    if (state.danglingNodes.includes(nd.id)) {
      ctx.beginPath();
      ctx.setLineDash([3 * s, 3 * s]);
      ctx.arc(sp.x, sp.y, r + 4 * s, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(248, 113, 113, 0.55)";
      ctx.lineWidth = Math.max(1, 1.1 * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (r > 9 * s) {
      ctx.fillStyle = "rgba(5,5,12,0.85)";
      ctx.font = `${Math.max(9, r * 0.62)}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelFor(nd.id), sp.x, sp.y);
    }
  }
}

/* ------------------------------------------------------------
   8. TELEMETRY RENDERING (sparkline + rank list + readouts)
------------------------------------------------------------- */

const svgNS = "http://www.w3.org/2000/svg";

function renderSparkline() {
  const svg = document.getElementById("sparkline");
  const hist = state.deltaHistory;
  svg.innerHTML = "";
  if (hist.length < 2) return;

  const W = 280, H = 56, PAD = 4;
  // log scale so the long convergence tail is still visible
  const logs = hist.map(d => Math.log10(Math.max(d, 1e-8)));
  const maxL = Math.max(...logs);
  const minL = Math.min(...logs);
  const span = Math.max(maxL - minL, 0.0001);

  const pts = logs.map((l, i) => {
    const x = PAD + (i / (hist.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((l - minL) / span) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const areaPts = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;

  const defs = document.createElementNS(svgNS, "defs");
  defs.innerHTML = `<linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
  </linearGradient>`;
  svg.appendChild(defs);

  const area = document.createElementNS(svgNS, "polygon");
  area.setAttribute("points", areaPts);
  area.setAttribute("fill", "url(#sparkFill)");
  svg.appendChild(area);

  const line = document.createElementNS(svgNS, "polyline");
  line.setAttribute("points", pts.join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", state.converged ? "#4ade80" : "#a78bfa");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.appendChild(line);
}

function renderRankList() {
  const list = document.getElementById("rankList");
  const ranked = state.nodes.slice().sort((a, b) => b.pr - a.pr).slice(0, 6);
  const maxPr = ranked.length ? ranked[0].pr : 1;

  list.innerHTML = "";
  ranked.forEach((nd, i) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    const pct = (nd.pr * 100).toFixed(1);
    const barPct = maxPr > 0 ? (nd.pr / maxPr) * 100 : 0;
    row.innerHTML = `
      <span class="pos">${i + 1}</span>
      <span class="label">${labelFor(nd.id)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${barPct}%"></span></span>
      <span class="pct">${pct}%</span>
    `;
    list.appendChild(row);
  });
}

function updateGraphChips() {
  document.getElementById("chipNodes").textContent = state.nodeCount;
  document.getElementById("chipEdges").textContent = state.edges.length;
  document.getElementById("chipDangling").textContent = state.danglingNodes.length;
}

function updateTelemetryUI(sum) {
  document.getElementById("statIter").textContent = state.iteration;
  document.getElementById("statDelta").textContent =
    state.lastDelta < 0.001 ? state.lastDelta.toExponential(1) : state.lastDelta.toFixed(4);

  document.getElementById("roIter").textContent = state.iteration;
  document.getElementById("roDamping").textContent = state.damping.toFixed(2);
  document.getElementById("roSum").textContent = sum.toFixed(3);
  document.getElementById("roStatus").textContent = state.converged ? "converged ✓" : "converging…";

  document.getElementById("chipDelta").textContent =
    state.lastDelta < 0.001 ? state.lastDelta.toExponential(1) : state.lastDelta.toFixed(4);
  document.getElementById("chipConvergedWrap").classList.toggle("converged", state.converged);

  const badge = document.getElementById("convergenceBadge");
  const label = document.getElementById("convergenceLabel");
  badge.classList.toggle("done", state.converged);
  label.textContent = state.converged ? `Converged in ${state.iteration} iterations` : "Converging…";

  renderSparkline();
  renderRankList();
}

/* ------------------------------------------------------------
   9. UI WIRING
------------------------------------------------------------- */

const el = (id) => document.getElementById(id);

el("nodeCountSlider").addEventListener("input", (e) => {
  el("nodeCountVal").textContent = e.target.value;
});
el("nodeCountSlider").addEventListener("change", (e) => {
  state.nodeCount = parseInt(e.target.value, 10);
  buildGraph();
  syncParticlePool();
});

el("edgeDensitySlider").addEventListener("input", (e) => {
  el("edgeDensityVal").textContent = e.target.value;
});
el("edgeDensitySlider").addEventListener("change", (e) => {
  state.edgeDensity = parseFloat(e.target.value);
  buildGraph();
  syncParticlePool();
});

el("regenBtn").addEventListener("click", () => {
  rand = mulberry32((Math.random() * 1e9) | 0);
  buildGraph();
  syncParticlePool();
});

el("dampingSlider").addEventListener("input", (e) => {
  state.damping = parseFloat(e.target.value);
  el("dampingVal").textContent = state.damping.toFixed(2);
  state.converged = false;
});

el("particleCountSlider").addEventListener("input", (e) => {
  state.particleCount = parseInt(e.target.value, 10);
  el("particleCountVal").textContent = state.particleCount;
  syncParticlePool();
});

el("toggleAutoIterate").addEventListener("change", (e) => { state.autoIterate = e.target.checked; });
el("toggleForces").addEventListener("change", (e) => { state.forcesOn = e.target.checked; });
el("toggleArrows").addEventListener("change", (e) => { state.showArrows = e.target.checked; });

el("stepBtn").addEventListener("click", () => pageRankStep());
el("resetRankBtn").addEventListener("click", () => resetRanks());

el("pauseBtn").addEventListener("click", () => {
  state.paused = !state.paused;
  el("pauseBtn").textContent = state.paused ? "▶" : "⏸";
});

/* ------------------------------------------------------------
   10. ANIMATION LOOP
------------------------------------------------------------- */

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - state.lastFrameTime) / 1000, 0.1);
  state.lastFrameTime = now;

  if (!state.paused) {
    updateForces(dt);
    updateParticles(dt);

    if (state.autoIterate && !state.converged) {
      state.iterAccumMs += dt * 1000;
      let guard = 0;
      while (state.iterAccumMs >= state.iterIntervalMs && !state.converged && guard < 5) {
        pageRankStep();
        state.iterAccumMs -= state.iterIntervalMs;
        guard++;
      }
    }
  }

  render();
}

/* ------------------------------------------------------------
   11. BOOT
------------------------------------------------------------- */

function boot() {
  resizeCanvas();
  buildGraph();
  syncParticlePool();
  el("dampingVal").textContent = state.damping.toFixed(2);
  animate();

  requestAnimationFrame(() => {
    setTimeout(() => el("loadingVeil").classList.add("hidden"), 350);
  });
}

boot();
