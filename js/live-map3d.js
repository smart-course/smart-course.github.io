/* 课程地图 3D 版（three.js，ES 模块）：由 live-map.js 按需加载；浏览器不支持 WebGL 或加载失败时，live-map.js 改用平面 SVG 版。
 * 画风参照插画地图：蓝色大海、带悬崖的绿色小岛、金色山丘、紫灰色雪山、蜿蜒的河、港口小镇和码头、成片的小树；
 * 地形由程序生成（同一份数据每次画出来一样），正交斜视角；水面有浪花动画，本周课堂插着飘动的小红旗。
 * 导出 journey / world / continent(host, opts)，参数和返回值与 live-map.js 相同；文字（章节牌、标题、说明框）是叠在画布上的网页元素。
 */
import * as THREE from './vendor/three-0.160.0.module.min.js';

// ---------------- 工具 ----------------
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const between = (rand, a, b) => a + (b - a) * rand();
function makeNoise(seed) {
  const rand = rng(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512).map((_, i) => p[i & 255]);
  const val = new Float32Array(256).map(() => rand());
  const h = (i, j) => val[perm[(perm[i & 255] + j) & 255]];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  };
  const fbm = (x, y, oct = 4) => {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o += 1) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  };
  return { n, fbm };
}
// Catmull-Rom 曲线，按弧长每 step 取一点
function spline(pts, step) {
  if (pts.length < 2) return pts.slice();
  const dense = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < 24; s += 1) {
      const t = s / 24, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  dense.push(pts[pts.length - 1]);
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i += 1) {
    acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    if (acc >= step) { out.push(dense[i]); acc = 0; }
  }
  return out;
}
function segDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
const col = (hex) => new THREE.Color(hex);
const C = {
  seaDeep: col('#1d7fd1'), seaMid: col('#3aa2e6'), seaShallow: col('#7fd6f2'), foam: col('#ffffff'),
  grass1: col('#79c043'), grass2: col('#a3d65b'), grass3: col('#5aa43a'),
  gold1: col('#e7a73c'), gold2: col('#f6cd68'), goldDark: col('#c27f26'),
  rock1: col('#8f89c2'), rock2: col('#b2acd9'), snow: col('#fbfcff'),
  cliff1: col('#7d5233'), cliff2: col('#c28b54'), sand: col('#ead69a'), seabed: col('#2c86c4'),
  border: col('#5d4430'),
};
const TREE_GREENS = ['#3f9a3a', '#4fa83f', '#2f8636', '#5cb648', '#378f3c'].map(col);
const PINE_GREENS = ['#2f7a45', '#3c8a50', '#25693c'].map(col);
const PALETTE = ['#f2c96b', '#9fd27a', '#f2a77e', '#86c4e0', '#c9a9e6', '#f0aeb0', '#c5e08e', '#e6c08e'].map(col);
function grayOf(c) {
  const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  const g = 0.3 + l * 0.62;
  return new THREE.Color(g * 1.02, g, g * 0.97);
}

// ---------------- 布局：章节地图 ----------------
// 返回场景描述：地图尺寸、海岸线、小岛、山丘、雪山、河流、小镇、小路，以及每个章节（region）的位置
function journeyLayout(opts, tall) {
  const units = opts.units || [];
  const n = units.length;
  const rand = rng(`${opts.seed || 'map'}|3d|${tall ? 't' : 'w'}`);
  const k1 = Math.ceil(n / 3), k2 = Math.ceil((n - k1) / 2), k3 = n - k1 - k2;
  const zoneOf = (i) => (i < k1 ? 'island' : i < k1 + k2 ? 'hill' : 'mountain');
  const d = { tall, res: 0.5, blobs: [], hills: [], peaks: [], rivers: [], villages: [], piers: [], boats: [], huts: [], places: [], units: [], label: 'plaque' };
  const nodes = [];
  if (!tall) {
    d.W = n > 18 ? 140 : 120;
    d.D = n > 18 ? 82 : 78;
    const { W, D } = d;
    const most = Math.max(k1, k2, k3, 1), sp = (0.8 * W) / most;
    const size = { island: Math.min(6.2, sp * 0.33), hill: Math.min(8.2, sp * 0.44), mountain: Math.min(10.5, sp * 0.56) };
    const rows = [[0, k1, 1, D * 0.29, 1.3], [k1, k2, -1, -D * 0.035, 1.2], [k1 + k2, k3, 1, -D * 0.27, 0.9]];
    rows.forEach(([from, count, dir, z0, wob], r) => {
      for (let j = 0; j < count; j += 1) {
        const t = (j + 0.5) / count;
        nodes.push({ x: W * (-0.4 + 0.8 * (dir > 0 ? t : 1 - t)), z: z0 + wob * Math.sin(j * 2.2 + r * 1.3), zone: zoneOf(from + j), r: size[zoneOf(from + j)] });
      }
    });
    const a = rand() * 6, b = rand() * 6;
    d.coast = (x) => D * 0.13 + 2.0 * Math.sin((x / W) * 7.5 + a) + 0.9 * Math.sin((x / W) * 19 + b);
    const vx = W * 0.43;
    d.villages.push({ x: vx, z: d.coast(vx) - 4.2, n: 6, spread: 3.4 });
    d.piers.push({ x: vx - 1.2, z0: d.coast(vx - 1.2) - 1.2, z1: d.coast(vx - 1.2) + 5.5 });
    d.boats.push({ x: vx + 1.4, z: d.coast(vx) + 4.2, kind: 'boat' });
    d.start = [-W * 0.46, D * 0.43];
    d.boats.push({ x: d.start[0], z: d.start[1], kind: 'sail' });
    d.places.push({ text: '启航', x: d.start[0] + 3.2, z: d.start[1] + 0.4 });
    d.trail = [d.start, [-W * 0.43, D * 0.36]];
    nodes.forEach((node, i) => {
      d.trail.push(node.zone === 'island' ? [node.x, node.z] : [node.x, node.z + node.r * 0.82]);
      if (i === k1 - 1 && k2) d.trail.push([W * 0.47, D * 0.27], [vx + 0.5, d.coast(vx) - 1.5]);
      if (i === k1 + k2 - 1 && k3) d.trail.push([-W * 0.47, -D * 0.14]);
    });
    // 远处连绵的山（装饰）
    for (let x = -W / 2 - 4; x < W / 2 + 6; x += between(rand, 7, 10)) {
      d.peaks.push({ x, z: -D * 0.455 + between(rand, -1.5, 1.5), r: between(rand, 7, 9.5), h: between(rand, 8, 11.5), region: -1 });
    }
    // 河：从雪山脚下穿过山丘之间入海
    const hills = nodes.filter((node) => node.zone === 'hill'), mtns = nodes.filter((node) => node.zone === 'mountain');
    if (hills.length >= 2 && mtns.length >= 2) {
      const hx = hills.map((h) => h.x).sort((u, v) => u - v);
      const gaps = hx.slice(1).map((x, i) => (x + hx[i]) / 2);
      (mtns.length >= 3 ? [0, mtns.length - 2] : [0]).forEach((j) => {
        const sx = (mtns[j].x + mtns[j + 1].x) / 2, sz = mtns[j].z + mtns[j].r * 0.55;
        const gx = gaps.reduce((best, g) => (Math.abs(g - sx) < Math.abs(best - sx) ? g : best), gaps[0]);
        const hz = hills[0].z;
        const mx = gx + between(rand, -3, 3);
        d.rivers.push([[sx, sz], [(sx + gx) / 2 + between(rand, -3, 3), (sz + hz) / 2], [gx, hz], [mx, (hz + d.coast(mx)) / 2 + 1], [mx + between(rand, -1.5, 1.5), d.coast(mx) + 4]]);
      });
    }
  } else {
    d.W = 44;
    const step = 13.5, size = { island: 4.7, hill: 6.3, mountain: 7.6 };
    let y = 0;
    const raw = [];
    for (let i = 0; i < n; i += 1) {
      if (i > 0 && zoneOf(i) !== zoneOf(i - 1)) y += zoneOf(i) === 'hill' ? 7 : 3;
      raw.push({ x: (i % 2 ? 8.6 : -8.6) + between(rand, -0.8, 0.8), y, zone: zoneOf(i), r: size[zoneOf(i)] });
      y += step;
    }
    d.D = Math.max(70, y - step + 16 + 22);
    const { W, D } = d;
    raw.forEach((node) => nodes.push({ ...node, z: D / 2 - 16 - node.y }));
    const lastIsland = nodes[k1 - 1], firstHill = nodes[k1];
    const cz = firstHill ? ((lastIsland.z - lastIsland.r - 2.2) + (firstHill.z + firstHill.r + 1)) / 2 : -D / 2 + 6;
    const a = rand() * 6;
    d.coast = (x) => cz + 1.3 * Math.sin(x * 0.28 + a) + 0.6 * Math.sin(x * 0.7 + a * 2);
    const side = firstHill && firstHill.x < 0 ? 1 : -1;
    const vx = side * 13.5;
    d.villages.push({ x: vx, z: d.coast(vx) - 3.6, n: 5, spread: 2.8 });
    d.piers.push({ x: vx + side * 2.2, z0: d.coast(vx + side * 2.2) - 1, z1: d.coast(vx + side * 2.2) + 4.5 });
    d.start = [-1, D / 2 - 5];
    d.boats.push({ x: d.start[0], z: d.start[1], kind: 'sail' });
    d.places.push({ text: '启航', x: d.start[0] + 3.2, z: d.start[1] + 0.3 });
    d.trail = [d.start, ...nodes.map((node) => (node.zone === 'island' ? [node.x, node.z] : [node.x, node.z + node.r * 0.82]))];
    for (let x = -W / 2 - 3; x < W / 2 + 4; x += between(rand, 7, 9)) {
      d.peaks.push({ x, z: -D / 2 + 3 + between(rand, -1, 1), r: between(rand, 6, 7.5), h: between(rand, 6.5, 9), region: -1 });
    }
    const mtns = nodes.filter((node) => node.zone === 'mountain');
    if (mtns.length && firstHill) {
      const pts = [];
      for (let z = mtns[mtns.length - 1].z + 4; z < d.coast(19); z += 9) pts.push([18.6 + between(rand, -1.2, 1.2), z]);
      pts.push([18.2, d.coast(18.2) + 4]);
      d.rivers.push(pts);
    }
  }
  // 海上的小礁岛（装饰，不属于任何章节）
  const islandNodes = nodes.filter((node) => node.zone === 'island');
  for (let i = 0, tries = 0; i < (tall ? 4 : 9) && tries < 300; tries += 1) {
    const x = between(rand, -d.W / 2 + 2, d.W / 2 - 2), z = between(rand, -d.D / 2, d.D / 2 - 1.5);
    if (z < d.coast(x) + 4) continue;
    if (islandNodes.some((node) => Math.hypot(node.x - x, node.z - z) < node.r * 1.9 + 3)) continue;
    if (d.trail.some((p) => Math.hypot(p[0] - x, p[1] - z) < 4)) continue;
    if (d.boats.some((b) => Math.hypot(b.x - x, b.z - z) < 5) || d.piers.some((p) => Math.abs(p.x - x) < 4 && z < p.z1 + 3)) continue;
    if (d.blobs.some((b) => Math.hypot(b.x - x, b.z - z) < 5)) continue;
    const r = between(rand, 1.1, 2.4);
    d.blobs.push({ x, z, rx: r * 1.2, rz: r, rot: rand() * 3, wobble: 0.25, region: -1, decor: true });
    i += 1;
  }
  nodes.forEach((node, i) => {
    const unit = units[i];
    const r2 = rng(`${opts.seed}|${unit.id}`);
    if (node.zone === 'island') {
      d.blobs.push({ x: node.x, z: node.z, rx: node.r * 1.22, rz: node.r * 0.92, rot: between(r2, -0.3, 0.3), wobble: 0.2, region: i });
      if (i % 3 === 1) d.huts.push({ x: node.x + node.r * 0.25, z: node.z - node.r * 0.1 });
      d.units.push({ item: unit, kind: 'island', x: node.x, z: node.z, r: node.r, labelAt: [node.x, node.z + node.r * (tall ? 0.72 : 0.45)], flagAt: [node.x - node.r * 0.45, node.z - node.r * 0.35] });
    } else if (node.zone === 'hill') {
      const k = node.r / 8.2;
      d.hills.push({ x: node.x, z: node.z, r: node.r, h: between(r2, 8, 9.5) * k, region: i });
      d.hills.push({ x: node.x + (r2() < 0.5 ? -1 : 1) * node.r * 0.66, z: node.z - node.r * 0.4, r: node.r * 0.55, h: between(r2, 3.5, 4.5) * k, region: i });
      d.units.push({ item: unit, kind: 'hill', x: node.x, z: node.z, r: node.r, labelAt: tall ? [node.x, node.z + node.r * 0.86] : [node.x, node.z + node.r * 0.42], labelLift: tall ? 0 : 0.42, flagAt: [node.x, node.z] });
    } else {
      const k = node.r / 10.5;
      d.peaks.push({ x: node.x, z: node.z, r: node.r, h: between(r2, 20, 24) * k, region: i });
      d.peaks.push({ x: node.x + (r2() < 0.5 ? -1 : 1) * node.r * 0.6, z: node.z - node.r * 0.25, r: node.r * 0.62, h: between(r2, 11, 13.5) * k, region: i });
      d.units.push({ item: unit, kind: 'mountain', x: node.x, z: node.z, r: node.r, labelAt: tall ? [node.x, node.z + node.r * 0.8] : [node.x, node.z + node.r * 0.38], labelLift: tall ? 0 : 0.3, flagAt: [node.x, node.z] });
    }
  });
  return d;
}

// ---------------- 布局：课程大陆 ----------------
function worldLayout(opts, tall) {
  const items = opts.items || [];
  const n = Math.max(1, items.length);
  const rand = rng(`${opts.seed || 'world'}|3d|${tall ? 't' : 'w'}`);
  const d = { tall, res: 0.5, blobs: [], hills: [], peaks: [], rivers: [], villages: [], piers: [], boats: [], huts: [], places: [], units: [], label: 'title', trail: null, coast: null };
  if (!tall) { d.W = 120; d.D = 66; } else { d.W = 44; d.D = n * 46 + 8; }
  items.forEach((item, i) => {
    const cx = tall ? 0 : d.W * ((i + 0.5) / n - 0.5), cz = tall ? -d.D / 2 + 27 + i * 46 : (i % 2 ? -1.5 : 1.5);
    const rx = tall ? 18.5 : Math.min((d.W * 0.4) / n, 25), rz = tall ? 17 : 22;
    d.blobs.push({ x: cx, z: cz, rx, rz, rot: between(rand, -0.15, 0.15), wobble: 0.22, region: i });
    [[-0.42, -0.42, 0.34, 13], [-0.02, -0.55, 0.4, 16], [0.36, -0.4, 0.32, 12]].forEach(([dx, dz, s, h]) => {
      d.peaks.push({ x: cx + dx * rx, z: cz + dz * rz, r: rx * s, h: h * (tall ? 0.8 : 1), region: i });
    });
    [[-0.55, 0.45, 0.24], [0.55, 0.42, 0.22]].forEach(([dx, dz, s]) => d.hills.push({ x: cx + dx * rx, z: cz + dz * rz, r: rx * s, h: 4.2, region: i }));
    d.rivers.push([[cx + rx * 0.12, cz - rz * 0.32], [cx + rx * 0.25, cz - rz * 0.02], [cx + rx * 0.14, cz + rz * 0.45], [cx + rx * 0.28, cz + rz * 1.15]]);
    d.villages.push({ x: cx - rx * 0.18, z: cz + rz * 0.62, n: 4, spread: 2.4 });
    d.units.push({ item, kind: 'land', x: cx, z: cz, r: Math.min(rx, rz), labelAt: [cx, cz + rz * 0.12], flagAt: null });
  });
  if (!tall) d.boats.push({ x: 0, z: d.D * 0.38, kind: 'sail' });
  return d;
}

// ---------------- 布局：班级国家 ----------------
function continentLayout(opts, tall) {
  const items = opts.items || [];
  const k = items.length;
  const rand = rng(`${opts.seed || 'land'}|3d|${tall ? 't' : 'w'}`);
  const d = { tall, res: 0.5, blobs: [], hills: [], peaks: [], rivers: [], villages: [], piers: [], boats: [], huts: [], places: [], units: [], label: 'title', trail: null, coast: null };
  if (!tall) { d.W = 120; d.D = 72; } else { d.W = 44; d.D = Math.max(84, 34 + k * 26); }
  const cx = tall ? 0 : -6, cz = tall ? -4 : 0, rx = tall ? 19.5 : 44, rz = tall ? d.D * 0.4 : 29;
  d.blobs.push({ x: cx, z: cz, rx, rz, rot: 0, wobble: 0.12, region: -2 });
  let sites;
  if (k <= 1) sites = [[cx, cz]];
  else if (tall) sites = items.map((_, i) => [cx + (i % 2 ? 0.3 : -0.3) * rx, cz - rz * 0.66 + (i * rz * 1.32) / (k - 1)]);
  else if (k === 2) sites = [[cx - rx * 0.46, cz + 1], [cx + rx * 0.46, cz - 1]];
  else if (k <= 4) sites = items.map((_, i) => { const a = (k === 3 ? -Math.PI / 2 : -Math.PI * 0.75) + (i * Math.PI * 2) / k; return [cx + Math.cos(a) * rx * 0.5, cz + Math.sin(a) * rz * 0.5]; });
  else sites = [[cx, cz], ...items.slice(1).map((_, i) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / (k - 1); return [cx + Math.cos(a) * rx * 0.62, cz + Math.sin(a) * rz * 0.6]; })];
  sites = sites.slice(0, Math.max(1, k)).map(([x, z]) => [x + between(rand, -1.2, 1.2), z + between(rand, -1, 1)]);
  d.countries = { sites: k ? sites : [], tints: sites.map((_, i) => PALETTE[i % PALETTE.length]) };
  // 每个国家里放一两座山或丘
  sites.forEach(([sx, sz], i) => {
    if (!k) return;
    const r3 = rng(`${opts.seed}|${items[i].id}`);
    // 先在“首都”北边放一座雪山，再放一两座金色山丘
    for (let t = 0, placed = 0; t < 120 && placed < 3; t += 1) {
      const wantPeak = placed === 0;
      const a = wantPeak ? between(r3, -Math.PI * 0.85, -Math.PI * 0.15) : r3() * Math.PI * 2;
      const dist = between(r3, 6.5, 12);
      const x = sx + Math.cos(a) * dist, z = sz + Math.sin(a) * dist * 0.8;
      const near = sites.reduce((best, s, j) => (Math.hypot(s[0] - x, s[1] - z) < Math.hypot(sites[best][0] - x, sites[best][1] - z) ? j : best), 0);
      if (near !== i || ((x - cx) / (rx * 0.8)) ** 2 + ((z - cz) / (rz * 0.8)) ** 2 > 1) continue;
      if (Math.abs(z - sz) < 3.5 && Math.abs(x - sx) < 9) continue;   // 不压住国名
      if (wantPeak) d.peaks.push({ x, z, r: between(r3, 5, 6.5), h: between(r3, 10, 13), region: -2 });
      else d.hills.push({ x, z, r: between(r3, 3.6, 4.8), h: between(r3, 3.5, 4.5), region: -2 });
      placed += 1;
    }
    d.villages.push({ x: sx, z: sz - 2.2, n: 3, spread: 1.6 });
  });
  if (!k) d.peaks.push({ x: cx, z: cz - 4, r: 9, h: 14, region: -2 });
  items.forEach((item, i) => d.units.push({ item, kind: 'country', x: sites[i][0], z: sites[i][1], r: 8, labelAt: [sites[i][0], sites[i][1] + 0.6], flagAt: null }));
  if (opts.extra) {
    const ex = tall ? [11, d.D / 2 - 7] : [d.W * 0.4, d.D * 0.3];
    d.blobs.push({ x: ex[0], z: ex[1], rx: 5, rz: 3.8, rot: 0.2, wobble: 0.2, region: d.units.length });
    d.huts.push({ x: ex[0] + 1, z: ex[1] - 0.6 });
    d.units.push({ item: opts.extra, kind: 'islet', x: ex[0], z: ex[1], r: 4, labelAt: [ex[0], ex[1] + 4.2], flagAt: null, plaque: true });
  }
  return d;
}

// ---------------- 地形 ----------------
function buildTerrain(d, seed) {
  const noise = makeNoise(`${seed}|terrain`);
  const { W, D, res } = d;
  const nx = Math.round(W / res), nz = Math.round(D / res);
  const count = (nx + 1) * (nz + 1);
  const H = new Float32Array(count), SD = new Float32Array(count), HW = new Float32Array(count), MW = new Float32Array(count);
  const HA = new Float32Array(count);
  const SNOW = new Float32Array(count), RIV = new Float32Array(count).fill(99), REG = new Float32Array(count).fill(-1), D2 = new Float32Array(count).fill(99);
  const rivers = d.rivers.map((pts) => {
    const s = spline(pts, 0.6);
    const xs = s.map((p) => p[0]), zs = s.map((p) => p[1]);
    return { pts: s, box: [Math.min(...xs) - 3, Math.min(...zs) - 3, Math.max(...xs) + 3, Math.max(...zs) + 3] };
  });
  const blobs = d.blobs.map((b, i) => ({ ...b, cos: Math.cos(b.rot || 0), sin: Math.sin(b.rot || 0), off: i * 7.13 }));
  const owners = d.units;
  const sites = d.countries ? d.countries.sites : null;
  for (let j = 0; j <= nz; j += 1) {
    const z = -D / 2 + j * res;
    for (let i = 0; i <= nx; i += 1) {
      const x = -W / 2 + i * res;
      const v = j * (nx + 1) + i;
      // 陆地：海岸线以北的大陆＋各个岛（正值＝在陆地上，约等于离海岸的距离）
      let sd = -99, blobRegion = -1, blobBest = -99;
      if (d.coast) sd = d.coast(x) - z + (noise.fbm(x * 0.13, z * 0.13) - 0.5) * 3.2;
      for (const b of blobs) {
        const dx = x - b.x, dz = z - b.z;
        if (Math.abs(dx) > b.rx * 1.6 + 2 || Math.abs(dz) > b.rz * 1.6 + 2) continue;
        const lx = dx * b.cos + dz * b.sin, lz = -dx * b.sin + dz * b.cos;
        const ang = Math.atan2(lz / b.rz, lx / b.rx);
        const wob = 1 + (noise.fbm(Math.cos(ang) * 1.4 + b.off, Math.sin(ang) * 1.4 + b.off) - 0.5) * 2 * b.wobble;
        const s = (wob - Math.hypot(lx / b.rx, lz / b.rz)) * Math.min(b.rx, b.rz);
        if (s > sd) sd = s;
        if (s > blobBest) { blobBest = s; blobRegion = b.region; }
      }
      let h = sd > 0 ? 1.5 * smooth(0, 0.9, sd) + smooth(0.8, 4, sd) * (noise.fbm(x * 0.2, z * 0.2) - 0.45) * 0.9 : -3.4 * smooth(0, 4, -sd) - 0.05;
      const land = smooth(0, 1.2, sd);
      let region = blobBest > -0.6 && blobRegion >= 0 ? blobRegion : -1;
      let regionScore = blobBest > -0.6 && blobRegion >= 0 ? 0.6 : 0;
      // 山丘
      let hw = 0;
      for (const hl of d.hills) {
        const dx = x - hl.x, dz = z - hl.z;
        if (Math.abs(dx) > hl.r * 1.3 || Math.abs(dz) > hl.r * 1.3) continue;
        const dd = (Math.hypot(dx, dz * 1.12) / hl.r) * (1 + (noise.fbm(x * 0.3 + 3, z * 0.3) - 0.5) * 0.25);
        if (dd < 1) {
          const b = (1 - dd) ** 1.25 * (1 - dd * dd) ** 0.6;
          h += hl.h * b * land;
          if (b > hw) { hw = b; HA[v] = Math.atan2(dz, dx); }
        }
        if (hl.region >= 0 && dd < 1.25 && 1.25 - dd > regionScore) { region = hl.region; regionScore = 1.25 - dd; }
      }
      // 雪山
      let mw = 0, snow = 0;
      for (const pk of d.peaks) {
        const dx = x - pk.x, dz = z - pk.z;
        if (Math.abs(dx) > pk.r * 1.2 || Math.abs(dz) > pk.r * 1.2) continue;
        const dd = (Math.hypot(dx, dz) / pk.r) * (1 + (noise.fbm(x * 0.25 + 9, z * 0.25 + 4) - 0.5) * 0.4);
        if (dd < 1) {
          const base = (1 - dd) ** 1.55;
          const ridge = 1 - Math.abs(2 * noise.fbm(x * 0.24 + pk.x, z * 0.24 + pk.z, 3) - 1);
          const add = pk.h * base * (0.66 + 0.5 * ridge) * land;
          h += add;
          mw = Math.max(mw, base);
          const line = 0.5 + (noise.fbm(x * 0.5, z * 0.5) - 0.5) * 0.35;
          snow = Math.max(snow, smooth(line, line + 0.08, add / pk.h));
        }
        if (pk.region >= 0 && dd < 1.15 && 1.15 - dd > regionScore) { region = pk.region; regionScore = 1.15 - dd; }
      }
      // 河
      let rd = 99;
      for (const rv of rivers) {
        if (x < rv.box[0] || x > rv.box[2] || z < rv.box[1] || z > rv.box[3]) continue;
        rd = Math.min(rd, segDist(x, z, rv.pts));
      }
      if (rd < 1.9 && sd > -1) {
        const t = smooth(1.9, 0.8, rd);
        h = lerp(h, -0.9, t);
      }
      // 国家：最近的“首都”
      if (sites && sites.length && sd > -0.3 && blobRegion === -2) {
        let d1 = Infinity, d2 = Infinity, best = -1;
        sites.forEach(([sx, sz], s) => {
          const dist = Math.hypot(x - sx, z - sz);
          if (dist < d1) { d2 = d1; d1 = dist; best = s; } else if (dist < d2) d2 = dist;
        });
        region = best;
        D2[v] = d2 - d1;
      }
      H[v] = h; SD[v] = sd; HW[v] = hw; MW[v] = mw; SNOW[v] = snow; RIV[v] = rd; REG[v] = region;
    }
  }
  return { nx, nz, H, SD, HW, MW, HA, SNOW, RIV, REG, D2, noise, rivers };
}

function terrainColors(d, t) {
  const { nx, nz, H, SD, HW, MW, SNOW, REG, D2, noise } = t;
  const out = new Float32Array((nx + 1) * (nz + 1) * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let j = 0; j <= nz; j += 1) {
    const z = -d.D / 2 + j * d.res;
    for (let i = 0; i <= nx; i += 1) {
      const x = -d.W / 2 + i * d.res;
      const v = j * (nx + 1) + i;
      const sd = SD[v], h = H[v];
      if (sd <= 0 && h < 0.05) {
        c.copy(C.seabed).lerp(C.sand, smooth(-1.6, 0, sd));
      } else {
        const g = noise.fbm(x * 0.14, z * 0.14);
        c.copy(C.grass1).lerp(C.grass2, smooth(0.42, 0.7, g));
        if (noise.fbm(x * 0.45 + 11, z * 0.45) > 0.62) c.lerp(C.grass3, 0.55);
        if (HW[v] > 0.12) {
          // 金色山丘：从山顶往下的深浅条纹（像插画里的笔触）
          const stripe = Math.sin(t.HA[v] * 11 + noise.n(x * 0.8, z * 0.8) * 3) * 0.5 + 0.5;
          tmp.copy(C.gold1).lerp(C.gold2, noise.fbm(x * 0.6, z * 0.6 + 3));
          if (stripe > 0.72 && HW[v] < 0.9) tmp.lerp(C.goldDark, 0.55 * smooth(0.72, 0.9, stripe));
          c.lerp(tmp, smooth(0.12, 0.3, HW[v]));
        }
        if (MW[v] > 0.1) c.lerp(tmp.copy(C.rock1).lerp(C.rock2, noise.fbm(x * 0.35 + 5, z * 0.35)), smooth(0.1, 0.3, MW[v]));
        if (SNOW[v] > 0) c.lerp(C.snow, SNOW[v]);
        const tint = d.countries && REG[v] >= 0 ? d.countries.tints[REG[v]] : null;
        if (tint && HW[v] < 0.2 && MW[v] < 0.15) c.lerp(tint, 0.5);
        if (d.countries && D2[v] < 0.55 && sd > 0.6) {
          const dash = ((x + z) * 0.7) % 1;
          if (Math.abs(dash) < 0.62) c.lerp(C.border, 0.85);
        }
        // 悬崖：海边一圈陡壁（下深上浅，竖条纹）
        const cliff = sd > 0 ? smooth(0.95, 0.3, sd) * (1 - smooth(0.2, 0.5, HW[v] + MW[v])) : 0;
        if (cliff > 0) {
          tmp.copy(C.cliff1).lerp(C.cliff2, clamp(h / 1.5, 0, 1));
          if (noise.n(x * 2.6, z * 2.6) > 0.6) tmp.multiplyScalar(0.82);
          c.lerp(tmp, cliff);
        }
        if (t.RIV[v] < 2.2 && sd > 0 && HW[v] < 0.2 && MW[v] < 0.2) c.lerp(C.grass3, smooth(2.2, 1.4, t.RIV[v]) * 0.5);
      }
      const r = REG[v];
      const unit = r >= 0 ? d.units[r] : null;
      // 未发布：小岛整座变灰；山丘、雪山只灰山体本身，周围草地照常
      if (unit && unit.item.state === 'off' && sd > -0.8 && (unit.kind !== 'hill' && unit.kind !== 'mountain' ? true : HW[v] > 0.06 || MW[v] > 0.06)) {
        const k = unit.kind === 'hill' ? smooth(0.06, 0.2, HW[v]) : unit.kind === 'mountain' ? smooth(0.06, 0.2, MW[v]) : 1;
        c.lerp(grayOf(c), k);
      }
      out[v * 3] = c.r; out[v * 3 + 1] = c.g; out[v * 3 + 2] = c.b;
    }
  }
  return out;
}

// 海水离岸距离（米制网格 → 纹理），用来画浅水、浪花
function distanceTexture(d, t) {
  const { nx, nz, H } = t;
  const w = nx + 1, hgt = nz + 1;
  const dist = new Float32Array(w * hgt);
  for (let v = 0; v < dist.length; v += 1) dist[v] = H[v] > 0.02 ? 0 : 1e6;
  const pass = (i, j, di, dj, cost) => {
    const a = j * w + i, b = (j + dj) * w + i + di;
    if (i + di < 0 || i + di >= w || j + dj < 0 || j + dj >= hgt) return;
    if (dist[b] + cost < dist[a]) dist[a] = dist[b] + cost;
  };
  for (let j = 0; j < hgt; j += 1) for (let i = 0; i < w; i += 1) { pass(i, j, -1, 0, 1); pass(i, j, 0, -1, 1); pass(i, j, -1, -1, 1.414); pass(i, j, 1, -1, 1.414); }
  for (let j = hgt - 1; j >= 0; j -= 1) for (let i = w - 1; i >= 0; i -= 1) { pass(i, j, 1, 0, 1); pass(i, j, 0, 1, 1); pass(i, j, 1, 1, 1.414); pass(i, j, -1, 1, 1.414); }
  const data = new Uint8Array(w * hgt * 4);
  for (let v = 0; v < dist.length; v += 1) {
    const value = Math.round(clamp((dist[v] * d.res) / 14, 0, 1) * 255);
    data[v * 4] = value; data[v * 4 + 1] = value; data[v * 4 + 2] = value; data[v * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, hgt, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function waterMaterial(d, distTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uDist: { value: distTex }, uSize: { value: new THREE.Vector2(d.W, d.D) },
      uDeep: { value: C.seaDeep }, uMid: { value: C.seaMid }, uShallow: { value: C.seaShallow },
    },
    vertexShader: `varying vec2 vXZ; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uDist; uniform vec2 uSize; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow;
      varying vec2 vXZ;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
      void main(){
        vec2 uv = (vXZ + uSize * 0.5) / uSize;
        float d = texture2D(uDist, uv).r * 14.0;
        vec3 c = mix(uShallow, uMid, smoothstep(0.3, 4.0, d));
        c = mix(c, uDeep, smoothstep(4.0, 13.0, d));
        float n = vnoise(vXZ * 0.35 + vec2(uTime * 0.05, uTime * 0.03));
        c *= 0.94 + 0.12 * n;
        float band = sin(d * 2.3 - uTime * 1.7 + n * 1.5);
        float foam = smoothstep(0.72, 0.96, band) * (1.0 - smoothstep(0.4, 3.6, d));
        float edge = 1.0 - smoothstep(0.05, 0.6, d);
        // 浪花小弧线（远海）
        vec2 g = vXZ * vec2(0.55, 1.1) + vec2(uTime * 0.12, 0.0);
        vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
        float on = step(0.86, hash(cell)) * smoothstep(5.0, 7.0, d);
        float arc = on * (1.0 - smoothstep(0.02, 0.07, abs(length(f * vec2(1.0, 2.2) + vec2(0.0, 0.35)) - 0.32))) * step(f.y, 0.0);
        c = mix(c, vec3(1.0), clamp(max(edge, foam * 0.8) + arc * 0.55, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------- 场景 ----------------
function toonGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 178, 178, 178, 255, 226, 226, 226, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x23301c, side: THREE.BackSide });

function buildScene(d, opts) {
  const seed = opts.seed || 'map';
  const t = buildTerrain(d, seed);
  const { nx, nz, H } = t;
  const heightAt = (x, z) => {
    const fx = clamp((x + d.W / 2) / d.res, 0, nx), fz = clamp((z + d.D / 2) / d.res, 0, nz);
    const i = Math.min(nx - 1, Math.floor(fx)), j = Math.min(nz - 1, Math.floor(fz)), u = fx - i, w = fz - j;
    const a = H[j * (nx + 1) + i], b = H[j * (nx + 1) + i + 1], c2 = H[(j + 1) * (nx + 1) + i], e = H[(j + 1) * (nx + 1) + i + 1];
    return lerp(lerp(a, b, u), lerp(c2, e, u), w);
  };
  const cellOf = (x, z) => {
    const i = Math.round(clamp((x + d.W / 2) / d.res, 0, nx)), j = Math.round(clamp((z + d.D / 2) / d.res, 0, nz));
    return j * (nx + 1) + i;
  };
  const regionAt = (x, z) => t.REG[cellOf(x, z)];
  const scene = new THREE.Scene();
  const gradient = toonGradient();
  const disposables = [gradient];

  // 地形网格
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  let maxH = 0;
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const v = j * (nx + 1) + i;
      positions[v * 3] = -d.W / 2 + i * d.res;
      positions[v * 3 + 1] = H[v];
      positions[v * 3 + 2] = -d.D / 2 + j * d.res;
      if (H[v] > maxH) maxH = H[v];
    }
  }
  const index = new Uint32Array(nx * nz * 6);
  let k = 0;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, e = c2 + 1;
      index[k++] = a; index[k++] = c2; index[k++] = b;
      index[k++] = b; index[k++] = c2; index[k++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(terrainColors(d, t), 3));
  geo.setAttribute('aRegion', new THREE.BufferAttribute(t.REG, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  const hover = { value: -9 };
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHover = hover;
    shader.vertexShader = 'attribute float aRegion;\nvarying float vRegion;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;');
    shader.fragmentShader = 'uniform float uHover;\nvarying float vRegion;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float facing = abs(normalize(normal).z);
      gl_FragColor.rgb *= mix(0.5, 1.0, smoothstep(0.06, 0.3, facing));
      if (uHover > -0.5 && abs(vRegion - uHover) < 0.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.96, 0.82), 0.2);`);
  };
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);
  disposables.push(geo, mat);

  // 水面
  const distTex = distanceTexture(d, t);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(d.W, d.D).rotateX(-Math.PI / 2), waterMaterial(d, distTex));
  water.position.y = 0;
  scene.add(water);
  disposables.push(distTex, water.geometry, water.material);

  // 北边天空（雪山背后）
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(d.W * 1.4, 80), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: col('#8fd0f6') }, uBottom: { value: col('#e8f6ff') } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uBottom; varying float vY; void main(){ gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 0.45, vY)), 1.0);\n#include <colorspace_fragment>\n}',
  }));
  sky.position.set(0, 40 - 0.5, -d.D / 2 - 0.6);
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  // 光
  scene.add(new THREE.HemisphereLight(0xfffcf2, 0x7f9a66, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  const span = Math.max(d.W, d.D);
  sun.position.set(-span * 0.35, span * 0.75, span * 0.45);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -span * 0.75; sc.right = span * 0.75; sc.top = span * 0.75; sc.bottom = -span * 0.75; sc.near = 1; sc.far = span * 3;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const rand = rng(`${seed}|props`);
  const blocked = [];   // [x, z, r]：小镇、码头、章节牌附近不种树
  d.villages.forEach((vl) => blocked.push([vl.x, vl.z, vl.spread + 1.6]));
  d.piers.forEach((p) => blocked.push([p.x, (p.z0 + p.z1) / 2, Math.abs(p.z1 - p.z0) / 2 + 1]));
  d.huts.forEach((hut) => blocked.push([hut.x, hut.z, 1.6]));
  d.units.forEach((u) => { if (u.kind === 'hill' || u.kind === 'mountain') blocked.push([u.x, u.z, u.r * 1.05]); blocked.push([u.labelAt[0], u.labelAt[1], 1.8]); if (u.flagAt) blocked.push([u.flagAt[0], u.flagAt[1], 1.2]); if (d.label === 'title') blocked.push([u.labelAt[0], u.labelAt[1] - 1, 6.5]); });
  const trailPts = d.trail ? spline(d.trail, 0.85) : [];

  // 小路：一串浅色小圆点
  if (trailPts.length) {
    const dot = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dots = new THREE.InstancedMesh(dot, dotMat, trailPts.length);
    const m = new THREE.Matrix4(), cc = new THREE.Color();
    trailPts.forEach(([x, z], i) => {
      const y = Math.max(heightAt(x, z), 0) + 0.07;
      m.makeTranslation(x, y, z);
      dots.setMatrixAt(i, m);
      dots.setColorAt(i, cc.set(heightAt(x, z) > 0.1 ? '#fff4d2' : '#ffffff'));
    });
    scene.add(dots);
    disposables.push(dot, dotMat);
  }

  // 树：成片种在草地上（避开悬崖、山丘、雪山、河、小路、小镇）
  const crowns = [], pines = [];
  const trailNear = (x, z, r) => trailPts.some((p) => Math.abs(p[0] - x) < r && Math.abs(p[1] - z) < r && Math.hypot(p[0] - x, p[1] - z) < r);
  const step = d.tall ? 1.05 : 1.1;
  for (let z = -d.D / 2 + 1; z < d.D / 2 - 0.5; z += step) {
    for (let x = -d.W / 2 + 1; x < d.W / 2 - 1; x += step) {
      const px = x + between(rand, -0.45, 0.45), pz = z + between(rand, -0.45, 0.45);
      const cluster = t.noise.fbm(px * 0.1 + 31, pz * 0.1 + 17);
      if (cluster < (d.label === 'title' ? 0.64 : d.tall ? 0.6 : 0.55) && rand() > 0.035) continue;
      const v = cellOf(px, pz);
      if (t.SD[v] < 1.1 || t.H[v] < 0.8 || t.RIV[v] < 2.1 || t.HW[v] > 0.1 || t.MW[v] > 0.3) continue;
      if (d.countries && t.D2[v] < 1.1) continue;
      if (blocked.some(([bx, bz, br]) => Math.hypot(bx - px, bz - pz) < br)) continue;
      if (trailNear(px, pz, 1.1)) continue;
      const s = between(rand, 0.75, 1.15);
      const region = t.REG[v];
      const off = region >= 0 && d.units[region] && d.units[region].item.state === 'off' && d.units[region].kind === 'island';
      const entry = { x: px, z: pz, y: heightAt(px, pz), s, off, region };
      if (t.MW[v] > 0.02 && rand() < 0.45) continue;
      if (t.MW[v] > 0.02 || (pz < -d.D * 0.2 && !d.tall && rand() < 0.4)) pines.push(entry); else crowns.push(entry);
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color();
  const instanced = (geom, list, place, colorOf, outline) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geom, new THREE.MeshToonMaterial({ gradientMap: gradient }), list.length);
    list.forEach((e, i) => { place(e, m4); mesh.setMatrixAt(i, m4); if (colorOf) mesh.setColorAt(i, colorOf(e, i)); });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    disposables.push(geom, mesh.material);
    if (outline) {
      const og = geom.clone().scale(outline, outline, outline);
      const line = new THREE.InstancedMesh(og, OUTLINE, list.length);
      list.forEach((e, i) => { place(e, m4); line.setMatrixAt(i, m4); });
      scene.add(line);
      disposables.push(og);
    }
  };
  const crownGeo = new THREE.IcosahedronGeometry(0.78, 1);
  crownGeo.scale(1, 0.92, 1);
  instanced(crownGeo, crowns, (e, m) => m.compose(pv.set(e.x, e.y + 0.95 * e.s, e.z), q.identity(), sv.set(e.s, e.s, e.s)),
    (e) => (e.off ? grayOf(cc.copy(TREE_GREENS[0])) : cc.copy(TREE_GREENS[Math.floor(hash(`${e.x}|${e.z}`) % TREE_GREENS.length)])), 1.14);
  instanced(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 5), crowns, (e, m) => m.compose(pv.set(e.x, e.y + 0.28 * e.s, e.z), q.identity(), sv.set(e.s, e.s, e.s)),
    (e) => (e.off ? cc.set('#9a958d') : cc.set('#7a5232')));
  const pineGeo = new THREE.ConeGeometry(0.62, 1.9, 7);
  instanced(pineGeo, pines, (e, m) => m.compose(pv.set(e.x, e.y + 1.05 * e.s, e.z), q.identity(), sv.set(e.s, e.s, e.s)),
    (e) => (e.off ? grayOf(cc.copy(PINE_GREENS[0])) : cc.copy(PINE_GREENS[Math.floor(hash(`${e.z}|${e.x}`) % PINE_GREENS.length)])), 1.12);

  // 房子、码头、船
  const toon = (color) => { const mm = new THREE.MeshToonMaterial({ color, gradientMap: gradient }); disposables.push(mm); return mm; };
  const wallGeo = new THREE.BoxGeometry(1.4, 1.0, 1.15), roofGeo = new THREE.ConeGeometry(1.08, 0.85, 4).rotateY(Math.PI / 4), doorGeo = new THREE.BoxGeometry(0.32, 0.5, 0.05);
  const wallOut = wallGeo.clone().scale(1.08, 1.08, 1.08), roofOut = roofGeo.clone().scale(1.08, 1.1, 1.08);
  disposables.push(wallGeo, roofGeo, doorGeo, wallOut, roofOut);
  const ROOFS = ['#d9473b', '#2f6fd1', '#e0742f', '#c23b3b'];
  const house = (x, z, s, roofColor, rot = 0) => {
    const g = new THREE.Group();
    const y = Math.max(heightAt(x, z), 0.3);
    const wall = new THREE.Mesh(wallGeo, toon('#fbf1dc'));
    wall.position.y = 0.5;
    const roof = new THREE.Mesh(roofGeo, toon(roofColor));
    roof.position.y = 1.42;
    const door = new THREE.Mesh(doorGeo, toon('#7a4b2c'));
    door.position.set(0, 0.25, 0.6);
    const w2 = new THREE.Mesh(wallOut, OUTLINE); w2.position.y = 0.5;
    const r2 = new THREE.Mesh(roofOut, OUTLINE); r2.position.y = 1.42;
    [wall, roof].forEach((mm) => { mm.castShadow = true; mm.receiveShadow = true; });
    g.add(w2, r2, wall, roof, door);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    g.scale.setScalar(s);
    scene.add(g);
  };
  d.villages.forEach((vl) => {
    const spots = [];
    for (let tries = 0; spots.length < vl.n && tries < 200; tries += 1) {
      const x = vl.x + between(rand, -vl.spread, vl.spread), z = vl.z + between(rand, -vl.spread * 0.7, vl.spread * 0.7);
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.9)) continue;
      if (heightAt(x, z) < 0.8 || t.RIV[cellOf(x, z)] < 1.5) continue;
      spots.push([x, z]);
    }
    spots.forEach(([x, z], i) => house(x, z, d.label === 'title' ? 0.8 : 1, ROOFS[i % ROOFS.length], between(rand, -0.25, 0.25)));
  });
  d.huts.forEach((hut) => house(hut.x, hut.z, 0.75, ROOFS[hash(`${hut.x}`) % ROOFS.length], 0.2));
  const plankMat = toon('#a8764a');
  d.piers.forEach((p) => {
    const len = Math.abs(p.z1 - p.z0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, len), plankMat);
    deck.position.set(p.x, 0.55, (p.z0 + p.z1) / 2);
    deck.castShadow = true;
    scene.add(deck);
    disposables.push(deck.geometry);
    const side = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 1.1), plankMat);
    side.position.set(p.x + 1.05, 0.55, p.z1 - 0.6);
    scene.add(side);
    disposables.push(side.geometry);
    for (let z = Math.min(p.z0, p.z1) + 0.8; z < Math.max(p.z0, p.z1); z += 1.6) {
      [-0.48, 0.48].forEach((dx) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5), plankMat);
        post.position.set(p.x + dx, 0, z);
        scene.add(post);
        disposables.push(post.geometry);
      });
    }
  });
  const boats = d.boats.map((b) => {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.95), toon(b.kind === 'sail' ? '#b8693a' : '#d6533c'));
    hull.position.y = 0.25;
    g.add(hull);
    disposables.push(hull.geometry);
    if (b.kind === 'sail') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), toon('#6b4a2c'));
      mast.position.y = 1.5;
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.3, 0), new THREE.Vector2(0, 2.1)]);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({ color: '#fffaf0', side: THREE.DoubleSide, gradientMap: gradient }));
      sail.position.set(0.08, 0.45, 0);
      g.add(mast, sail);
      disposables.push(mast.geometry, sail.geometry, sail.material);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), toon('#ffffff'));
      cabin.position.set(-0.2, 0.75, 0);
      g.add(cabin);
      disposables.push(cabin.geometry);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.kind === 'sail' ? -0.5 : 0.3;
    scene.add(g);
    return { g, phase: rand() * 6 };
  });

  // 本周课堂：飘动的小红旗＋金色光圈
  const flags = [], rings = [], flagTops = [];
  d.units.forEach((u) => {
    if (!u.flagAt || !u.item.flag) return;
    let [fx, fz] = u.flagAt;
    if (u.kind === 'mountain' || u.kind === 'hill') {
      let best = -1;
      for (let dz = -u.r * 0.5; dz <= u.r * 0.5; dz += 0.5) for (let dx = -u.r * 0.5; dx <= u.r * 0.5; dx += 0.5) {
        const hh = heightAt(u.x + dx, u.z + dz);
        if (hh > best) { best = hh; fx = u.x + dx; fz = u.z + dz; }
      }
    }
    const y = heightAt(fx, fz);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), toon('#5b4636'));
    pole.position.y = 1.7;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 80;
    const cx = canvas.getContext('2d');
    cx.fillStyle = '#d63b2a'; cx.fillRect(0, 0, 128, 80);
    cx.fillStyle = '#fff'; cx.font = 'bold 38px "PingFang SC","Microsoft YaHei",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(String(u.item.flag).slice(0, 3), 64, 42);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const clothGeo = new THREE.PlaneGeometry(2.1, 1.3, 12, 4);
    clothGeo.translate(1.05, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    cloth.position.y = 2.75;
    g.add(pole, cloth);
    g.position.set(fx, y, fz);
    scene.add(g);
    flagTops.push([fx, y + 3.6, fz]);
    disposables.push(pole.geometry, clothGeo, cloth.material, tex);
    flags.push({ geo: clothGeo, base: clothGeo.attributes.position.array.slice() });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, depthWrite: false }));
    const ry = u.kind === 'island' ? 1.6 : Math.max(heightAt(u.x, u.z + u.r * 0.9), 0.3) + 0.3;
    ring.position.set(u.x, ry, u.z);
    scene.add(ring);
    disposables.push(ring.geometry, ring.material);
    rings.push({ mesh: ring, r: u.r * (u.kind === 'island' ? 1.35 : 1.05) });
  });

  const animate = (s) => {
    water.material.uniforms.uTime.value = s;
    flags.forEach((fl) => {
      const arr = fl.geo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = fl.base[i];
        arr[i + 2] = Math.sin(x * 2.6 - s * 5) * 0.16 * x;
        arr[i + 1] = fl.base[i + 1] + Math.sin(x * 2 - s * 4) * 0.05 * x;
      }
      fl.geo.attributes.position.needsUpdate = true;
    });
    rings.forEach((rg) => {
      const ph = (s * 0.45) % 1;
      rg.mesh.scale.setScalar(rg.r * (0.85 + ph * 0.5));
      rg.mesh.material.opacity = 0.9 * (1 - ph);
    });
    boats.forEach((b) => {
      b.g.position.y = Math.sin(s * 1.6 + b.phase) * 0.08;
      b.g.rotation.z = Math.sin(s * 1.3 + b.phase) * 0.05;
    });
  };
  const tops = flagTops;
  return { scene, terrain, hover, heightAt, regionAt, maxH, animate, disposables, sun, positions, tops };
}

// ---------------- 挂载 ----------------
const CSS = `
.c3-wrap{position:relative;border-radius:14px;overflow:hidden;background:#3aa2e6;box-shadow:0 12px 30px rgba(53,38,24,.14),inset 0 0 0 1px rgba(70,51,34,.2)}
.c3-wrap canvas{display:block;width:100%;touch-action:pan-y;-webkit-tap-highlight-color:transparent}
.c3-labels{position:absolute;inset:0;pointer-events:none}
.c3-plaque{position:absolute;display:flex;align-items:center;gap:6px;padding:3px 11px 3px 3px;border:1.6px solid #bf9550;border-radius:999px;background:rgba(255,250,240,.94);color:#33281f;font:800 14px/1.2 "Songti SC",STSong,SimSun,"Noto Serif SC",serif;white-space:nowrap;box-shadow:0 2px 6px rgba(40,30,15,.28);transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;transition:transform .18s,border-color .18s}
.c3-wrap.is-compact .c3-plaque{gap:4px;padding:2px 8px 2px 2px;font-size:12px}
.c3-wrap.is-compact .c3-plaque b{min-width:19px;height:19px;font-size:10px}
.c3-plaque b{display:grid;place-items:center;min-width:22px;height:22px;padding:0 4px;border-radius:999px;background:#23655f;color:#fff;font:800 11px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.c3-plaque.is-current{border-color:#a4492d;border-width:2.2px}
.c3-plaque.is-current b{background:#a4492d}
.c3-plaque.is-off{background:rgba(239,235,228,.95);border-color:#c9c1b4;color:#8f877c}
.c3-plaque.is-off b{background:#b1a99d}
.c3-plaque:not(.is-live){cursor:not-allowed}
.c3-plaque.is-hot{transform:translate(-50%,-50%) translateY(-3px);border-color:#a4492d}
.c3-plaque:focus-visible{outline:3px solid #23655f;outline-offset:2px}
.c3-title-box{position:absolute;display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;text-align:center}
.c3-title{font:900 30px/1.15 "Songti SC",STSong,SimSun,"Noto Serif SC",serif;color:#2c2118;text-shadow:0 0 3px #fffaf0,0 0 6px #fffaf0,0 0 10px rgba(255,250,240,.9);white-space:nowrap}
.c3-wrap.is-tall .c3-title{font-size:22px}
.c3-sub{font:700 13px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#3d3126;text-shadow:0 0 3px #fffaf0,0 0 6px #fffaf0;white-space:nowrap}
.c3-pill{padding:2px 10px;border-radius:999px;background:#a4492d;color:#fff;font:800 12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap}
.c3-title-box.is-hot .c3-title{color:#a4492d}
.c3-place{position:absolute;transform:translate(-50%,-50%);font:800 14px/1 "Songti SC",STSong,SimSun,serif;color:#fff;text-shadow:0 1px 3px rgba(0,40,80,.6)}
.c3-wrap.is-tall .c3-plaque{font-size:13px}
@media (prefers-reduced-motion:reduce){.c3-plaque{transition:none}}
`;
function injectStyle() {
  if (document.getElementById('class-map3d-style')) return;
  const style = document.createElement('style');
  style.id = 'class-map3d-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function mount(host, opts, layout) {
  injectStyle();
  host.innerHTML = '<div class="c3-wrap"><canvas></canvas><div class="c3-labels"></div><div class="cm-tip" role="status" hidden></div></div>';
  const wrap = host.firstElementChild, canvas = wrap.querySelector('canvas'), labels = wrap.querySelector('.c3-labels'), tip = wrap.querySelector('.cm-tip');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x3aa2e6);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  let built = null, desc = null, tall = null, items = [], byRegion = new Map(), hoverRegion = -1, tipFor = null, lastPointer = 'mouse';
  let visible = true, raf = 0, last = 0, width = 0;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTall = () => (opts.layout === 'wide' ? false : opts.layout === 'tall' ? true : host.clientWidth > 0 && host.clientWidth < 640);

  function dispose() {
    if (!built) return;
    built.disposables.forEach((x) => x.dispose && x.dispose());
    built.scene.traverse((o) => { if (o.isMesh && o.material !== OUTLINE && o.material.dispose) o.material.dispose(); });
    built = null;
  }
  function frame() {
    // 正交斜视：从南方高处往北看，镜头框住整张地图（含山高）
    const elev = THREE.MathUtils.degToRad(tall ? 56 : 48);
    camera.position.set(0, Math.sin(elev) * 300, Math.cos(elev) * 300);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    [-desc.W / 2, desc.W / 2].forEach((x) => [-desc.D / 2, desc.D / 2].forEach((z) => [0, built.maxH].forEach((y) => {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    })));
    // 上边界：地形（含山顶、旗子）最高处再留一点天空；左右正好是地图宽度
    const pv = new THREE.Vector3();
    let top = new THREE.Vector3(0, 0, -desc.D / 2).applyMatrix4(inv).y;
    const pos = built.positions;
    for (let i = 0; i < pos.length; i += 9) top = Math.max(top, pv.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(inv).y);
    built.tops.forEach(([x, y, z]) => { top = Math.max(top, pv.set(x, y, z).applyMatrix4(inv).y); });
    top += 1.5;
    const bottom = new THREE.Vector3(0, 0, desc.D / 2).applyMatrix4(inv).y;
    camera.left = -desc.W / 2; camera.right = desc.W / 2; camera.top = top; camera.bottom = bottom;
    camera.updateProjectionMatrix();
    width = host.clientWidth || 800;
    wrap.classList.toggle('is-compact', !tall && (width < 1000 || desc.units.length > 18));
    const height = Math.round((width * (top - bottom)) / desc.W);
    const dpr = Math.min(window.devicePixelRatio || 1, tall ? 1.6 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    canvas.style.height = `${height}px`;
    renderer.shadowMap.needsUpdate = true;
  }
  const project = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * (canvas.clientHeight || 1)];
  };
  function placeLabels() {
    labels.innerHTML = '';
    const placed = [];
    desc.units.forEach((u, r) => {
      const item = u.item;
      const [lx, lz] = u.labelAt;
      const ly = Math.max(built.heightAt(lx, lz), 0.2) * (u.labelLift ? 1 - u.labelLift * 0.6 : 1) + (u.kind === 'island' ? 0.4 : 0);
      const [sx, sy] = project(lx, ly, lz);
      let el;
      if (d_label(u) === 'plaque') {
        el = document.createElement('button');
        el.type = 'button';
        el.className = `c3-plaque is-${item.state || 'open'}${item.clickable ? ' is-live' : ''}`;
        el.innerHTML = `<b>${esc(u.plaque ? '＋' : item.no)}</b><span>${esc(item.label)}</span>`;
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
      } else {
        el = document.createElement('div');
        el.className = `c3-title-box${item.clickable ? ' is-live' : ''}`;
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.innerHTML = `${item.flag ? `<span class="c3-pill">${esc(item.flag)}</span>` : ''}<strong class="c3-title">${esc(item.label)}</strong><small class="c3-sub" data-sub="${esc(item.id)}">${esc(item.sub || '')}</small>`;
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
      }
      el.dataset.region = String(r);
      el.setAttribute('aria-label', item.aria || item.label);
      if (!item.clickable) el.setAttribute('aria-disabled', 'true');
      labels.appendChild(el);
      placed.push(el);
    });
    desc.places.forEach((pl) => {
      const [sx, sy] = project(pl.x, 0.3, pl.z);
      const el = document.createElement('span');
      el.className = 'c3-place';
      el.textContent = pl.text;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      labels.appendChild(el);
    });
    // 章节牌互相重叠时往下错开
    const boxes = placed.filter((el) => el.classList.contains('c3-plaque')).map((el) => ({ el, r: el.getBoundingClientRect() }));
    boxes.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const a = boxes[j].r, b = boxes[i].r;
        if (b.left < a.right + 4 && b.right > a.left - 4 && b.top < a.bottom + 2 && b.bottom > a.top - 2) {
          const shift = a.bottom + 4 - b.top;
          boxes[i].el.style.top = `${parseFloat(boxes[i].el.style.top) + shift}px`;
          boxes[i].r = boxes[i].el.getBoundingClientRect();
        }
      }
    }
  }
  const d_label = (u) => (u.plaque || desc.label === 'plaque' ? 'plaque' : 'title');
  function build(force) {
    const want = isTall();
    if (want === tall && !force && built) { frame(); placeLabels(); render(); return; }
    tall = want;
    dispose();
    desc = layout(opts, tall);
    built = buildScene(desc, opts);
    items = desc.units.map((u) => u.item);
    byRegion = new Map(desc.units.map((u, r) => [String(u.item.id), r]));
    wrap.classList.toggle('is-tall', tall);
    frame();
    placeLabels();
    hideTip();
    render();
  }
  function render() {
    if (!built) return;
    renderer.render(built.scene, camera);
  }
  function loop(ms) {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden || !built || ms - last < 33) return;
    last = ms;
    built.animate(ms / 1000);
    render();
  }

  // ---- 悬停、点击 ----
  const labelOf = (r) => labels.querySelector(`[data-region="${r}"]`);
  function setHover(r) {
    if (r === hoverRegion) return;
    if (hoverRegion >= 0 && labelOf(hoverRegion)) labelOf(hoverRegion).classList.remove('is-hot');
    hoverRegion = r;
    built.hover.value = r >= 0 && items[r] && items[r].clickable ? r : -9;
    if (r >= 0 && labelOf(r)) labelOf(r).classList.add('is-hot');
    canvas.style.cursor = r >= 0 ? (items[r].clickable ? 'pointer' : 'not-allowed') : '';
    if (reduce) render();
  }
  function hideTip() { tip.hidden = true; tipFor = null; }
  function showTip(r, touch) {
    const item = items[r];
    const el = labelOf(r);
    if (!item || !item.tip || !el) { hideTip(); return; }
    tip.innerHTML = item.tip + (touch && item.clickable ? `<button type="button" class="cm-go" data-cm-go>${esc(item.go || '进入 →')}</button>` : '');
    tip.hidden = false;
    tip.classList.toggle('is-touch', Boolean(touch));
    const box = el.getBoundingClientRect(), frameBox = wrap.getBoundingClientRect();
    const half = Math.min(tip.offsetWidth, frameBox.width - 16) / 2;
    const left = Math.max(half + 8, Math.min(frameBox.width - half - 8, box.left + box.width / 2 - frameBox.left));
    const above = box.top - frameBox.top > tip.offsetHeight + 60;
    tip.classList.toggle('is-below', !above);
    tip.style.left = `${left}px`;
    tip.style.top = `${above ? box.top - frameBox.top - 40 : box.bottom - frameBox.top}px`;
    tipFor = r;
  }
  function pick(r) {
    const item = items[r];
    if (!item) return;
    if (!item.clickable) { showTip(r, false); return; }
    hideTip();
    if (opts.onPick) opts.onPick(item);
  }
  // 画布上的点 → 地面坐标 → 属于哪个章节：沿视线从高处往下走，碰到地面为止
  const ray = new THREE.Raycaster();
  function regionAtPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const { origin, direction } = ray.ray;
    const t0 = (built.maxH + 1 - origin.y) / direction.y;
    const p = origin.clone().addScaledVector(direction, t0);
    for (let s = 0; s < 400; s += 1) {
      const h = Math.max(built.heightAt(p.x, p.z), 0);
      if (p.y <= h) return built.regionAt(p.x, p.z);
      p.addScaledVector(direction, 0.25);
      if (p.y < -1) break;
    }
    return -1;
  }
  wrap.addEventListener('pointerdown', (event) => { lastPointer = event.pointerType || 'mouse'; }, true);
  let moveQueued = null;
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    moveQueued = event;
    requestAnimationFrame(() => {
      if (!moveQueued || !built) return;
      const r = regionAtPointer(moveQueued);
      moveQueued = null;
      setHover(r);
      if (r >= 0) { if (tipFor !== r) showTip(r, false); } else if (tipFor !== null && lastPointer !== 'touch') hideTip();
    });
  });
  canvas.addEventListener('pointerleave', () => { setHover(-1); if (lastPointer !== 'touch') hideTip(); });
  canvas.addEventListener('click', (event) => {
    if (!built) return;
    const r = regionAtPointer(event);
    if (r < 0 || !items[r]) { hideTip(); return; }
    if (lastPointer === 'touch' && items[r].tip && tipFor !== r) { setHover(r); showTip(r, true); return; }
    pick(r);
  });
  labels.addEventListener('pointerover', (event) => {
    const el = event.target.closest('[data-region]');
    if (!el || (event.pointerType && event.pointerType !== 'mouse')) return;
    const r = Number(el.dataset.region);
    setHover(r);
    if (tipFor !== r) showTip(r, false);
  });
  labels.addEventListener('pointerout', (event) => {
    const el = event.target.closest('[data-region]');
    if (!el || el.contains(event.relatedTarget) || (event.pointerType && event.pointerType !== 'mouse')) return;
    setHover(-1);
    hideTip();
  });
  labels.addEventListener('click', (event) => {
    const el = event.target.closest('[data-region]');
    if (!el) return;
    const r = Number(el.dataset.region);
    if (lastPointer === 'touch' && items[r] && items[r].tip && tipFor !== r) { setHover(r); showTip(r, true); return; }
    pick(r);
  });
  labels.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = event.target.closest('[data-region]');
    if (!el || el.tagName === 'BUTTON') return;
    event.preventDefault();
    pick(Number(el.dataset.region));
  });
  labels.addEventListener('focusin', (event) => {
    const el = event.target.closest('[data-region]');
    if (el && lastPointer !== 'touch') showTip(Number(el.dataset.region), false);
  });
  tip.addEventListener('click', (event) => { if (event.target.closest('[data-cm-go]') && tipFor !== null) pick(tipFor); });
  const outside = (event) => { if (!wrap.contains(event.target)) hideTip(); };
  document.addEventListener('pointerdown', outside);

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); }) : null;
  if (io) io.observe(wrap);
  let resizeTimer = 0;
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (host.clientWidth && host.clientWidth !== width) build(false); }, 120);
  }) : null;
  if (ro) ro.observe(host);
  build(true);
  if (reduce) { built.animate(0); render(); } else raf = requestAnimationFrame(loop);

  return {
    is3d: true,
    update(next) { Object.assign(opts, next || {}); build(true); },
    setSub(id, text) {
      (opts.items || []).forEach((item) => { if (String(item.id) === String(id)) item.sub = text; });
      labels.querySelectorAll('[data-sub]').forEach((el) => { if (el.dataset.sub === String(id)) el.textContent = text; });
    },
    reveal(id) {
      const r = byRegion.get(String(id));
      const el = r === undefined ? null : labelOf(r);
      if (el && tall) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    },
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', outside);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      dispose();
      renderer.dispose();
      host.innerHTML = '';
    },
  };
}

export const journey = (host, opts) => mount(host, opts, journeyLayout);
export const world = (host, opts) => mount(host, opts, worldLayout);
export const continent = (host, opts) => mount(host, opts, continentLayout);
