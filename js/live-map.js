/* 课程地图：纯 SVG 程序绘制（不用图片），同一份数据每次画出来都一样（按种子生成）。
 *   ClassMap.journey(host, opts)   章节地图：前三分之一的章节是海上小岛，中间是金色山丘，最后是紫色雪山，一条小路按顺序把它们串起来。
 *                                   学生首页（课程地图）和教师工作台（班级 → 章节）共用。
 *   ClassMap.world(host, opts)     教师工作台：每门课程是一块大陆。
 *   ClassMap.continent(host, opts) 教师工作台：一门课程的各个班级是大陆上的国家；opts.extra 是海上的“新建班级”小岛。
 * opts.units / opts.items：[{ id, no, label, sub, state: 'open' | 'current' | 'off', clickable, flag, tip, go, aria }]；opts.onPick(item)。
 *   state 决定颜色（off 为灰色），clickable 决定能不能点；tip 是悬停（触屏为点一下）时显示的说明（HTML）。
 * 地图宽度不足 640px 时改为竖版（手机上下滚动）。返回 { update(opts), setSub(id, text), reveal(id), destroy() }。
 */
(function () {
  'use strict';
  let seq = 0;
  const f = (n) => Math.round(n * 10) / 10;
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
  const between = (rand, a, b) => a + (b - a) * rand();
  const textWidth = (text, size) => Array.from(String(text)).reduce((w, ch) => w + (/[\x00-\xff]/.test(ch) ? size * 0.58 : size), 0);
  const mix = (hex, to, t) => {
    const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
  };

  const C = {
    sea: '#8fcbd6', seaLight: '#acdbe2', seaDeep: '#76b9c9', shallow: '#bde4df', foam: '#effaf6',
    sand: '#f2e1ae', sandShade: '#d9bf85',
    landTop: '#c3d293', landMid: '#afd384', landLow: '#a3cd7b', coastLine: '#7f9c5a',
    grass: '#a6cf77', grassShade: '#83b25a',
    hill: '#efc35c', hillShade: '#d69c3c', hillBack: '#e2ae4b', hillBackShade: '#c48a33', hillLight: '#f9de8e',
    mtn: '#a596d9', mtnShade: '#7564b6', mtnBack: '#9283c9', mtnBackShade: '#6c5aa9', mtnLine: '#5d4d98', snow: '#fdfdff', snowShade: '#dadef3',
    river: '#84cbe0', riverLight: '#c6edf5',
    tree: '#6aac52', treeDark: '#4d8c3d', pine: '#5a9763', pineDark: '#3f7a4c', palm: '#5fa64c', trunk: '#8a5a33',
    roof: '#d8653b', roofDark: '#b8502c', wall: '#fff4df',
    trail: '#7a4f2a', ink: '#33281f', teal: '#23655f', rust: '#a4492d', gold: '#f2c040',
  };
  const PALETTE = ['#f2d27f', '#b8d98c', '#f3b98f', '#a9d3df', '#d3bee6', '#f2c6c0', '#cfe2a4', '#e9cf9f'];

  // ---------- 几何 ----------
  // Catmull-Rom 样条 → 三次贝塞尔（closed：闭合）
  function curve(pts, closed) {
    const n = pts.length;
    if (n < 2) return '';
    const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < (closed ? n : n - 1); i += 1) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
    }
    return closed ? `${d}Z` : d;
  }
  // 与 curve(pts, false) 同一条样条上的采样点（树木避开小路、河流用）
  function sample(pts, steps = 10) {
    const n = pts.length;
    const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
    const out = [];
    for (let i = 0; i < n - 1; i += 1) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (let s = 0; s < steps; s += 1) {
        const t = s / steps, u = 1 - t;
        out.push([0, 1].map((k) => u * u * u * p1[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p2[k]));
      }
    }
    if (n) out.push(pts[n - 1]);
    return out;
  }
  function blob(cx, cy, rx, ry, rand, n = 10, jitter = 0.16) {
    const phase = rand() * Math.PI * 2;
    return Array.from({ length: n }, (_, i) => {
      const a = phase + (i / n) * Math.PI * 2;
      const k = 1 + (rand() * 2 - 1) * jitter;
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    });
  }
  const scaled = (pts, cx, cy, s, dy = 0) => pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s + dy]);
  const near = (x, y, pts, d) => pts.some((p) => (p[0] - x) ** 2 + (p[1] - y) ** 2 < d * d);
  const inBox = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3];
  function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function edgeDist(x, y, poly) {
    let best = Infinity;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
    });
    return best;
  }
  // Voronoi：每个点的区域＝外框依次被各条垂直平分线切掉另一半
  function clipHalf(poly, a, b, c) {
    const out = [];
    poly.forEach((P, i) => {
      const Q = poly[(i + 1) % poly.length];
      const pin = a * P[0] + b * P[1] <= c, qin = a * Q[0] + b * Q[1] <= c;
      if (pin) out.push(P);
      if (pin !== qin) {
        const t = (c - a * P[0] - b * P[1]) / (a * (Q[0] - P[0]) + b * (Q[1] - P[1]));
        out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    });
    return out;
  }
  function voronoi(sites, box) {
    return sites.map((s, i) => sites.reduce((poly, o, j) => {
      if (i === j) return poly;
      const a = o[0] - s[0], b = o[1] - s[1];
      return clipHalf(poly, a, b, (a * (o[0] + s[0]) + b * (o[1] + s[1])) / 2);
    }, [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]));
  }
  // 国界：把每条边细分并按边的两个端点（与方向无关）抖动，相邻两国共用的边抖得一模一样
  function wobblyPath(poly) {
    let d = '';
    poly.forEach((P, i) => {
      const Q = poly[(i + 1) % poly.length];
      const flip = P[0] > Q[0] || (P[0] === Q[0] && P[1] > Q[1]);
      const [A, B] = flip ? [Q, P] : [P, Q];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const m = Math.max(1, Math.round(len / 16));
      const rand = rng(`${Math.round(A[0])},${Math.round(A[1])}|${Math.round(B[0])},${Math.round(B[1])}`);
      const nx = -(B[1] - A[1]) / (len || 1), ny = (B[0] - A[0]) / (len || 1);
      const amp = Math.min(6, len * 0.05);
      let mids = [];
      for (let k = 1; k < m; k += 1) {
        const t = k / m, o = (rand() * 2 - 1) * amp;
        mids.push([A[0] + (B[0] - A[0]) * t + nx * o, A[1] + (B[1] - A[1]) * t + ny * o]);
      }
      if (flip) mids = mids.reverse();
      d += `${i ? 'L' : 'M'}${f(P[0])},${f(P[1])}` + mids.map((p) => `L${f(p[0])},${f(p[1])}`).join('');
    });
    return `${d}Z`;
  }

  // ---------- 小图形 ----------
  const shadow = (x, y, rx, ry, o = 0.16) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="rgba(70,55,25,${o})"/>`;
  function tree(x, y, s, kind) {
    const base = shadow(x + s * 0.08, y, s * 0.4, s * 0.12);
    if (kind === 'pine') {
      return base + `<rect x="${f(x - s * 0.06)}" y="${f(y - s * 0.28)}" width="${f(s * 0.12)}" height="${f(s * 0.28)}" fill="${C.trunk}"/>`
        + `<path d="M${f(x)},${f(y - s * 1.2)}L${f(x + s * 0.36)},${f(y - s * 0.22)}L${f(x - s * 0.36)},${f(y - s * 0.22)}Z" fill="${C.pineDark}"/>`
        + `<path d="M${f(x)},${f(y - s * 1.2)}L${f(x)},${f(y - s * 0.22)}L${f(x - s * 0.36)},${f(y - s * 0.22)}Z" fill="${C.pine}"/>`;
    }
    if (kind === 'palm') {
      const tx = x + s * 0.2, ty = y - s * 1.05;
      return base + `<path d="M${f(x)},${f(y)}Q${f(x + s * 0.02)},${f(y - s * 0.6)} ${f(tx)},${f(ty)}" stroke="${C.trunk}" stroke-width="${f(s * 0.11)}" fill="none" stroke-linecap="round"/>`
        + [[-0.62, 0.2], [0.62, 0.24], [-0.34, -0.28], [0.4, -0.24]].map(([dx, dy]) => `<path d="M${f(tx)},${f(ty)}q${f(dx * s * 0.5)},${f(-s * 0.26 + dy * s * 0.2)} ${f(dx * s)},${f(dy * s * 0.6 + s * 0.12)}" stroke="${C.palm}" stroke-width="${f(s * 0.15)}" fill="none" stroke-linecap="round"/>`).join('');
    }
    return base + `<rect x="${f(x - s * 0.06)}" y="${f(y - s * 0.32)}" width="${f(s * 0.12)}" height="${f(s * 0.32)}" fill="${C.trunk}"/>`
      + `<circle cx="${f(x)}" cy="${f(y - s * 0.62)}" r="${f(s * 0.4)}" fill="${C.treeDark}"/>`
      + `<circle cx="${f(x - s * 0.09)}" cy="${f(y - s * 0.71)}" r="${f(s * 0.29)}" fill="${C.tree}"/>`;
  }
  function house(x, y, s, roof) {
    return shadow(x + s * 0.1, y, s * 0.66, s * 0.14)
      + `<rect x="${f(x - s * 0.45)}" y="${f(y - s * 0.62)}" width="${f(s * 0.9)}" height="${f(s * 0.62)}" fill="${C.wall}" stroke="#c9a57a" stroke-width=".8"/>`
      + `<path d="M${f(x - s * 0.6)},${f(y - s * 0.58)}L${f(x)},${f(y - s * 1.12)}L${f(x + s * 0.6)},${f(y - s * 0.58)}Z" fill="${roof}"/>`
      + `<rect x="${f(x - s * 0.1)}" y="${f(y - s * 0.3)}" width="${f(s * 0.2)}" height="${f(s * 0.3)}" fill="#8a5a33"/>`;
  }
  function village(x, y, s, rand) {
    const spots = [[-1.3, -0.5], [0, -0.9], [1.3, -0.4], [-0.6, 0.45], [0.75, 0.5]];
    return spots.map(([dx, dy], i) => house(x + dx * s + between(rand, -2, 2), y + dy * s, s * between(rand, 0.85, 1.05), i % 2 ? C.roofDark : C.roof)).join('');
  }
  function lighthouse(x, y, s) {
    const band = (t0, t1) => {
      const w0 = s * (0.22 - 0.08 * t0), w1 = s * (0.22 - 0.08 * t1);
      return `<path d="M${f(x - w0)},${f(y - s * 1.2 * t0)}L${f(x - w1)},${f(y - s * 1.2 * t1)}L${f(x + w1)},${f(y - s * 1.2 * t1)}L${f(x + w0)},${f(y - s * 1.2 * t0)}Z" fill="#c8402c"/>`;
    };
    return shadow(x + s * 0.1, y, s * 0.4, s * 0.1)
      + `<path d="M${f(x - s * 0.22)},${f(y)}L${f(x - s * 0.14)},${f(y - s * 1.2)}L${f(x + s * 0.14)},${f(y - s * 1.2)}L${f(x + s * 0.22)},${f(y)}Z" fill="#fffaf0" stroke="#bba78a" stroke-width=".8"/>`
      + band(0.28, 0.44) + band(0.68, 0.84)
      + `<path d="M${f(x)},${f(y - s * 1.3)}L${f(x - s * 1.1)},${f(y - s * 1.5)}L${f(x - s * 1.1)},${f(y - s * 1.12)}Z" fill="#ffe27a" opacity=".38"/>`
      + `<rect x="${f(x - s * 0.12)}" y="${f(y - s * 1.38)}" width="${f(s * 0.24)}" height="${f(s * 0.18)}" fill="#ffd34d" stroke="#8a6a3a" stroke-width=".6"/>`
      + `<path d="M${f(x - s * 0.19)},${f(y - s * 1.38)}L${f(x)},${f(y - s * 1.58)}L${f(x + s * 0.19)},${f(y - s * 1.38)}Z" fill="#c8402c"/>`;
  }
  function boat(x, y, s) {
    return `<path d="M${f(x - s * 0.9)},${f(y + s * 0.18)}q${f(s * 0.3)},${f(-s * 0.12)} ${f(s * 0.6)},0" stroke="${C.foam}" stroke-width="1.4" fill="none" opacity=".8"/>`
      + `<path d="M${f(x - s * 0.5)},${f(y - s * 0.12)}L${f(x + s * 0.52)},${f(y - s * 0.12)}L${f(x + s * 0.34)},${f(y + s * 0.12)}L${f(x - s * 0.36)},${f(y + s * 0.12)}Z" fill="#9a6236"/>`
      + `<path d="M${f(x)},${f(y - s * 0.12)}L${f(x)},${f(y - s * 0.98)}" stroke="#6b4a2c" stroke-width="1.4"/>`
      + `<path d="M${f(x + s * 0.04)},${f(y - s * 0.94)}L${f(x + s * 0.44)},${f(y - s * 0.22)}L${f(x + s * 0.04)},${f(y - s * 0.22)}Z" fill="#fffaf0" stroke="#d9cbb0" stroke-width=".8"/>`
      + `<path d="M${f(x - s * 0.04)},${f(y - s * 0.8)}L${f(x - s * 0.32)},${f(y - s * 0.24)}L${f(x - s * 0.04)},${f(y - s * 0.24)}Z" fill="#f3e6cf"/>`;
  }
  const wave = (x, y, s = 1) => `<path d="M${f(x)},${f(y)}q${f(4 * s)},${f(-4 * s)} ${f(8 * s)},0t${f(8 * s)},0" stroke="${C.foam}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".7"/>`;
  function compass(x, y, r) {
    return `<g transform="translate(${f(x)},${f(y)})" opacity=".85">`
      + `<circle r="${f(r)}" fill="rgba(255,250,238,.5)" stroke="#6b5134" stroke-width="1.2"/>`
      + `<circle r="${f(r * 0.78)}" fill="none" stroke="#6b5134" stroke-width=".7" stroke-dasharray="2 3"/>`
      + `<path d="M${f(-r * 0.7)},0L0,${f(r * 0.12)}L${f(r * 0.7)},0L0,${f(-r * 0.12)}Z" fill="#a08566"/>`
      + `<path d="M0,${f(-r * 0.95)}L${f(r * 0.16)},0L0,${f(r * 0.95)}L${f(-r * 0.16)},0Z" fill="#6b5134"/>`
      + `<path d="M0,${f(-r * 0.95)}L${f(r * 0.16)},0L${f(-r * 0.16)},0Z" fill="#c8402c"/>`
      + `<text y="${f(-r - 5)}" text-anchor="middle" class="cm-compass">北</text></g>`;
  }
  function cloud(x, y, s) {
    return `<g opacity=".82" fill="#fffdf8"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s)}" ry="${f(s * 0.32)}"/>`
      + `<circle cx="${f(x - s * 0.35)}" cy="${f(y - s * 0.18)}" r="${f(s * 0.3)}"/><circle cx="${f(x + s * 0.15)}" cy="${f(y - s * 0.3)}" r="${f(s * 0.4)}"/></g>`;
  }
  // 金色山丘：一个主丘，背后一个小丘；ground 在 y＝0
  function mound(cx, w, h, px, colors) {
    const L = cx - w / 2, R = cx + w / 2, pk = cx + px, top = -h;
    return `<path d="M${f(L)},0C${f(L + w * 0.18)},${f(-h * 0.35)} ${f(pk - w * 0.28)},${f(top)} ${f(pk)},${f(top)}C${f(pk + w * 0.28)},${f(top)} ${f(R - w * 0.18)},${f(-h * 0.35)} ${f(R)},0Z" fill="${colors[0]}"/>`
      + `<path d="M${f(pk)},${f(top)}C${f(pk + w * 0.28)},${f(top)} ${f(R - w * 0.18)},${f(-h * 0.35)} ${f(R)},0L${f(pk + w * 0.1)},0C${f(pk + w * 0.04)},${f(-h * 0.4)} ${f(pk + w * 0.07)},${f(-h * 0.78)} ${f(pk)},${f(top)}Z" fill="${colors[1]}"/>`
      + (colors[2] ? `<path d="M${f(pk - w * 0.24)},${f(-h * 0.7)}C${f(pk - w * 0.16)},${f(-h * 0.9)} ${f(pk - w * 0.07)},${f(-h * 0.97)} ${f(pk + w * 0.02)},${f(-h * 0.98)}" stroke="${colors[2]}" stroke-width="${f(Math.max(2, w * 0.025))}" fill="none" stroke-linecap="round" opacity=".85"/>` : '');
  }
  function hillArt(w, h, rand) {
    const side = rand() < 0.5 ? -1 : 1;
    const tufts = Array.from({ length: 3 }, () => {
      const x = between(rand, -w * 0.3, -w * 0.02), y = between(rand, -h * 0.55, -h * 0.18);
      return `<path d="M${f(x)},${f(y)}l2,-4l2,4" stroke="#c48a33" stroke-width="1.2" fill="none" opacity=".55"/>`;
    }).join('');
    return shadow(0, 0, w * 0.6, h * 0.12)
      + `<g transform="translate(${f(side * w * 0.3)},0)">${mound(0, w * 0.62, h * 0.66, side * w * 0.04, [C.hillBack, C.hillBackShade])}</g>`
      + mound(0, w, h, between(rand, -0.08, 0.06) * w, [C.hill, C.hillShade, C.hillLight]) + tufts;
  }
  // 紫色雪山：主峰＋背后一座小峰；ground 在 y＝0
  function peak(cx, w, h, rand, colors) {
    const j = () => between(rand, -0.04, 0.04);
    const L = cx - w / 2, R = cx + w / 2, T = [cx + j() * w, -h];
    const l1 = [L + w * (0.18 + j()), -h * (0.32 + j())], l2 = [L + w * (0.36 + j()), -h * (0.64 + j())];
    const r1 = [R - w * (0.34 + j()), -h * (0.62 + j())], r2 = [R - w * (0.16 + j()), -h * (0.28 + j())];
    const at = (a, b, y) => { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y]; };
    const sl = at(l2, T, -h * 0.72), sr = at(T, r1, -h * 0.7);
    const spine = [cx + w * 0.03, -h * 0.62];
    const zig = [[cx - w * 0.1, -h * 0.6], [cx - w * 0.03, -h * 0.68], spine, [cx + w * 0.1, -h * 0.66]];
    const P = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`).join('') + 'Z';
    return `<path d="${P([[L, 0], l1, l2, T, r1, r2, [R, 0]])}" fill="${colors[0]}" stroke="${C.mtnLine}" stroke-width="1" stroke-opacity=".45" stroke-linejoin="round"/>`
      + `<path d="${P([T, r1, r2, [R, 0], [cx + w * 0.08, 0], [cx + w * 0.02, -h * 0.36], spine])}" fill="${colors[1]}"/>`
      + `<path d="${P([T, sl, ...zig, sr])}" fill="${C.snow}"/>`
      + `<path d="${P([T, spine, zig[3], sr])}" fill="${C.snowShade}"/>`;
  }
  function mountainArt(w, h, rand) {
    const side = rand() < 0.5 ? -1 : 1;
    return shadow(0, 0, w * 0.62, h * 0.08)
      + peak(side * w * 0.32, w * 0.66, h * 0.7, rand, [C.mtnBack, C.mtnBackShade])
      + peak(0, w, h, rand, [C.mtn, C.mtnShade]);
  }
  function islandArt(pts, r, rand, kind) {
    const D = (s, dy) => curve(scaled(pts, 0, 0, s, dy), true);
    let deco = '';
    if (kind === 0) deco = tree(-r * 0.32, r * 0.08, r * 0.42, 'palm') + tree(r * 0.3, -r * 0.08, r * 0.36, 'palm');
    else if (kind === 1) deco = house(r * 0.22, r * 0.06, r * 0.26, C.roof) + tree(-r * 0.36, r * 0.02, r * 0.34, 'round') + tree(-r * 0.08, -r * 0.18, r * 0.28, 'round');
    else deco = tree(r * 0.05, r * 0.06, r * 0.44, 'palm') + `<ellipse cx="${f(-r * 0.45)}" cy="${f(r * 0.2)}" rx="${f(r * 0.12)}" ry="${f(r * 0.07)}" fill="#b9ae9a"/>`;
    return `<path d="${D(1, 5)}" fill="${C.sandShade}"/><path d="${D(1, 0)}" fill="${C.sand}"/>`
      + `<path d="${D(0.78, 1)}" fill="${C.grassShade}"/><path d="${D(0.74, -3)}" fill="${C.grass}"/>` + deco;
  }
  function plaque(no, label, state, fs = 15) {
    const h = fs + 13, r = h / 2 - 3;
    const w = 6 + r * 2 + 6 + textWidth(label, fs) + 12;
    const x0 = -w / 2;
    return {
      w, h,
      svg: `<g class="cm-plaque"><rect x="${f(x0)}" y="2" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="rgba(70,50,25,.18)"/>`
        + `<rect class="cm-plaque-box" x="${f(x0)}" y="0" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}"/>`
        + `<circle class="cm-badge" cx="${f(x0 + 4 + r)}" cy="${f(h / 2)}" r="${f(r)}"/>`
        + `<text class="cm-no" x="${f(x0 + 4 + r)}" y="${f(h / 2 + 4)}" text-anchor="middle">${esc(no)}</text>`
        + `<text class="cm-name" x="${f(x0 + 4 + r * 2 + 6)}" y="${f(h / 2 + fs * 0.36)}" style="font-size:${fs}px">${esc(label)}</text></g>`,
    };
  }
  function flag(x, y, text) {
    return `<g class="cm-flag" transform="translate(${f(x)},${f(y)})"><path d="M0,0V-42" stroke="#5b4636" stroke-width="2.4" stroke-linecap="round"/>`
      + `<path class="cm-pennant" d="M1,-42L38,-34.5L1,-27Z" fill="#c8402c"/><text x="14" y="-31" class="cm-flag-text" text-anchor="middle">${esc(text)}</text></g>`;
  }
  function defs(p) {
    return `<defs>
      <radialGradient id="${p}Sea" cx=".5" cy=".42" r=".85"><stop offset="0" stop-color="${C.seaLight}"/><stop offset="1" stop-color="${C.seaDeep}"/></radialGradient>
      <linearGradient id="${p}Land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.landTop}"/><stop offset=".55" stop-color="${C.landMid}"/><stop offset="1" stop-color="${C.landLow}"/></linearGradient>
      <radialGradient id="${p}Glow"><stop offset="0" stop-color="#ffe17a" stop-opacity=".75"/><stop offset="1" stop-color="#ffe17a" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}Vig" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#5a4020" stop-opacity="0"/><stop offset="1" stop-color="#5a4020" stop-opacity=".2"/></radialGradient>
      <pattern id="${p}Field" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><rect width="7" height="7" fill="#ead88f"/><rect width="3" height="7" fill="#d8c06d"/></pattern>
      <filter id="${p}Gray" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".17 .45 .07 0 .27  .17 .45 .07 0 .265  .17 .45 .07 0 .25  0 0 0 1 0"/></filter>
    </defs>`;
  }
  const frame = (W, H, p) => `<rect width="${W}" height="${H}" fill="url(#${p}Vig)" pointer-events="none"/>`
    + `<rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="10" fill="none" stroke="rgba(255,250,238,.55)" stroke-width="1.5" stroke-dasharray="1 6" stroke-linecap="round" pointer-events="none"/>`;
  const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(label || '地图')}" style="aspect-ratio:${W}/${H}">`;
  // 海上与陆地上的装饰：先排除地标、小路、河流等占用的地方，再随机撒点
  function scatter(rand, count, ok) {
    const out = [];
    for (let i = 0; i < count * 6 && out.length < count; i += 1) {
      const p = ok(rand());
      if (p && !near(p[0], p[1], out, p[2] || 18)) out.push(p);
    }
    return out;
  }

  // ---------- 章节地图 ----------
  function drawJourney(opts, tall, p) {
    const units = opts.units || [];
    const n = units.length;
    const rand = rng(`${opts.seed || 'map'}|${tall ? 't' : 'w'}`);
    const k1 = Math.ceil(n / 3), k2 = Math.ceil((n - k1) / 2), k3 = n - k1 - k2;
    const zoneOf = (i) => (i < k1 ? 'island' : i < k1 + k2 ? 'hill' : 'mountain');
    let W, H, coast, start, home, light, nodes = [], trail = [], compassAt, startBoat = null;
    if (!tall) {
      W = n > 18 ? 1400 : 1200;
      H = n > 18 ? 820 : 780;
      const most = Math.max(k1, k2, k3, 1), s = (0.8 * W) / most;
      const size = { island: Math.min(60, s * 0.36), hill: Math.min(132, s * 0.74), mountain: Math.min(150, s * 0.84) };
      const rows = [[0, k1, 1, 0.795, 0.025], [k1, k2, -1, 0.5, 0.025], [k1 + k2, k3, 1, 0.27, 0.018]];
      rows.forEach(([from, count, dir, ry, wob], r) => {
        for (let j = 0; j < count; j += 1) {
          const t = (j + 0.5) / count;
          const zone = zoneOf(from + j);
          nodes.push({ x: W * (0.1 + 0.8 * (dir > 0 ? t : 1 - t)), y: H * (ry + wob * Math.sin(j * 2.2 + r * 1.3)), zone, size: size[zone] });
        }
      });
      const a = rand() * 6, b = rand() * 6, c = rand() * 6;
      coast = (x) => H * 0.615 + H * 0.02 * Math.sin((x / W) * 7.5 + a) + H * 0.011 * Math.sin((x / W) * 19 + b) + 2.5 * Math.sin(x * 0.11 + c);
      home = { x: W * 0.062, y: coast(W * 0.062) - 34 };
      light = { x: W * 0.978, y: coast(W * 0.978) - 8 };
      start = [home.x + 14, home.y + 18];
      compassAt = [W - 62, H - 62, 32];
      trail = [start, [W * 0.07, H * 0.71]];
      nodes.forEach((node, i) => {
        trail.push([node.x, node.y]);
        if (i === k1 - 1 && k2) trail.push([W * 0.952, H * 0.7], [W * 0.952, coast(W * 0.952) - 18]);
        if (i === k1 + k2 - 1 && k3) trail.push([W * 0.045, H * 0.385]);
      });
    } else {
      W = 420;
      const step = 120;
      const size = { island: 50, hill: 116, mountain: 128 };
      let y = 0;
      const raw = [];
      for (let i = 0; i < n; i += 1) {
        if (i > 0 && zoneOf(i) !== zoneOf(i - 1)) y += zoneOf(i) === 'hill' ? 54 : 26;
        raw.push({ x: W * (i % 2 ? 0.69 : 0.31) + between(rand, -8, 8), y, zone: zoneOf(i), size: size[zoneOf(i)] });
        y += step;
      }
      H = Math.max(520, y - step + 160 + 150);
      nodes = raw.map((node) => ({ ...node, y: H - 160 - node.y }));
      const lastIsland = nodes[k1 - 1], firstHill = nodes[k1];
      const cy = firstHill ? ((lastIsland.y - 58) + (firstHill.y + 50)) / 2 : 46;
      const a = rand() * 6, b = rand() * 6;
      coast = (x) => cy + 9 * Math.sin((x / W) * 9 + a) + 4 * Math.sin((x / W) * 23 + b);
      const side = firstHill && firstHill.x < W / 2 ? 1 : -1;
      home = { x: W / 2 + side * W * 0.32, y: coast(W / 2 + side * W * 0.32) - 30 };
      light = { x: W / 2 + side * W * 0.45, y: coast(W / 2 + side * W * 0.45) - 6 };
      startBoat = [W * 0.6, H - 48];
      start = [W * 0.56, H - 60];
      compassAt = [W - 46, H - 50, 24];
      trail = [start, ...nodes.map((node) => [node.x, node.y])];
    }
    const trailPts = sample(trail, 12);

    // 河流：从雪山脚下流过山丘之间，入海
    const rivers = [];
    const hills = nodes.filter((node) => node.zone === 'hill');
    const mtns = nodes.filter((node) => node.zone === 'mountain');
    if (!tall && mtns.length >= 2 && hills.length >= 2) {
      const pairs = mtns.length >= 3 ? [0, mtns.length - 2] : [0];
      const hx = hills.map((h) => h.x).sort((u, v) => u - v);
      const gaps = hx.slice(1).map((x, i) => (x + hx[i]) / 2);
      pairs.forEach((j) => {
        const sx = (mtns[j].x + mtns[j + 1].x) / 2, sy = mtns[j].y + 8;
        const gx = gaps.reduce((best, g) => (Math.abs(g - sx) < Math.abs(best - sx) ? g : best), gaps[0]);
        const hy = hills[0].y + 16;
        const mx = gx + between(rand, -26, 26);
        rivers.push([[sx, sy], [(sx + gx) / 2 + between(rand, -30, 30), (sy + hy) / 2], [gx, hy], [mx, (hy + coast(mx)) / 2], [mx + between(rand, -10, 10), coast(mx) + 22]]);
      });
    } else if (tall && mtns.length && hills.length) {
      const pts = [];
      for (let y = mtns[mtns.length - 1].y - 40; y < coast(W * 0.93); y += 110) pts.push([W * 0.93 + between(rand, -9, 9), y]);
      pts.push([W * 0.92, coast(W * 0.92) + 22]);
      rivers.push(pts);
    }
    const riverPts = rivers.flatMap((r) => sample(r, 8));

    // 地标占用的范围（树木避开）
    const boxes = [];
    const items = units.map((unit, i) => {
      const node = nodes[i];
      const fs = 15;
      const pl = plaque(unit.no, unit.label, unit.state, fs);
      let art, top, halfW, plY;
      const r2 = rng(`${opts.seed}|${unit.id}`);
      if (node.zone === 'island') {
        const r = node.size;
        const pts = blob(0, 0, r * 1.18, r * 0.8, r2, 9, 0.14);
        node.pts = pts;
        art = islandArt(pts, r, r2, i % 3);
        top = -r * 0.95;
        halfW = r * 1.3;
        plY = r * 0.92 + 8;
      } else if (node.zone === 'hill') {
        const w = node.size, h = w * 0.52;
        art = hillArt(w, h, r2);
        top = -h;
        halfW = w * 0.62;
        plY = 14;
      } else {
        const w = node.size, h = w * 0.8;
        art = mountainArt(w, h, r2);
        top = -h;
        halfW = w * 0.68;
        plY = 12;
      }
      node.top = top;
      node.plY = plY;
      const current = unit.state === 'current';
      const flagged = unit.flag ? flag(halfW * 0.25, top + 4, unit.flag) : '';
      const glow = current ? `<ellipse cx="0" cy="${f(top / 2)}" rx="${f(halfW * 1.25)}" ry="${f(Math.max(-top, 40) * 0.95)}" fill="url(#${p}Glow)"/>` : '';
      const pulse = current ? `<ellipse class="cm-pulse" cx="0" cy="${node.zone === 'island' ? 0 : 2}" rx="${f(halfW * 0.95)}" ry="${f(halfW * 0.32)}" fill="none" stroke="${C.gold}" stroke-width="3"/>` : '';
      const hitTop = top - (flagged ? 48 : 8);
      const hitW = Math.max(halfW, pl.w / 2 + 4);
      boxes.push([node.x - hitW - 6, node.y + hitTop, node.x + hitW + 6, node.y + plY + pl.h + 6]);
      const cls = `cm-unit is-${unit.state || 'open'}${unit.clickable ? ' is-live' : ''}`;
      return {
        unit,
        svg: `<g class="${cls}" data-id="${esc(unit.id)}" tabindex="0" role="button" aria-label="${esc(unit.aria || `${unit.no} ${unit.label}`)}"${unit.clickable ? '' : ' aria-disabled="true"'} transform="translate(${f(node.x)},${f(node.y)})">`
          + glow + pulse
          + `<g class="cm-art"${unit.state === 'off' ? ` filter="url(#${p}Gray)"` : ''}>${art}${flagged}</g>`
          + `<g transform="translate(0,${f(plY)})">${pl.svg}</g>`
          + `<rect class="cm-hit" x="${f(-hitW)}" y="${f(hitTop)}" width="${f(hitW * 2)}" height="${f(plY + pl.h + 4 - hitTop)}" fill="transparent"/></g>`,
      };
    });
    const homeBox = [home.x - 46, home.y - 40, home.x + 46, home.y + 26];
    const lightBox = [light.x - 20, light.y - 50, light.x + 20, light.y + 8];

    // 海：浅水、浪花、帆船、罗盘
    let sea = `<rect width="${W}" height="${H}" fill="url(#${p}Sea)"/>`;
    const islandShallow = nodes.filter((node) => node.zone === 'island' && node.pts).map((node) => {
      const pts = node.pts.map(([x, y]) => [node.x + x, node.y + y]);
      return `<path d="${curve(scaled(pts, node.x, node.y, 1.36), true)}" fill="${C.shallow}" opacity=".9"/>`
        + `<path d="${curve(scaled(pts, node.x, node.y, 1.62), true)}" fill="none" stroke="${C.foam}" stroke-width="1.3" stroke-dasharray="3 7" opacity=".7"/>`;
    }).join('');
    const seaOk = (x, y) => y > coast(x) + 40 && x > 20 && x < W - 20 && y < H - 16 && !near(x, y, compassAt ? [compassAt] : [], 52)
      && !boxes.some((b) => inBox(x, y, [b[0] - 26, b[1] - 18, b[2] + 26, b[3] + 14])) && !near(x, y, trailPts, 16) && !(startBoat && near(x, y, [startBoat], 46));
    const waves = scatter(rand, tall ? Math.max(8, k1 * 3) : 30, () => {
      const x = between(rand, 20, W - 20), y = between(rand, 0, H);
      return seaOk(x, y) ? [x, y, 40] : null;
    });
    sea += islandShallow + waves.map(([x, y]) => wave(x, y, between(rand, 0.8, 1.2))).join('');
    const sail = scatter(rand, 1, () => {
      const x = between(rand, 60, W - 60), y = between(rand, 0, H);
      return seaOk(x, y) && seaOk(x + 20, y) && seaOk(x - 20, y) ? [x, y] : null;
    })[0];
    if (sail) sea += boat(sail[0], sail[1], 20);
    if (startBoat) sea += boat(startBoat[0], startBoat[1], 28) + `<text x="${f(startBoat[0] + 30)}" y="${f(startBoat[1] + 4)}" class="cm-place">启航</text>`;
    if (compassAt) sea += compass(...compassAt);

    // 陆地：海岸线以北都是大陆
    const coastPts = [];
    for (let x = W + 12; x >= -12; x -= 12) coastPts.push([x, coast(x)]);
    const landPath = (dy) => `M-12,-12L${W + 12},-12` + coastPts.map(([x, y]) => `L${f(x)},${f(y + dy)}`).join('') + 'Z';
    let land = `<path d="${landPath(26)}" fill="${C.shallow}" opacity=".9"/>`
      + `<path d="${coastPts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y + 38)}`).join('')}" fill="none" stroke="${C.foam}" stroke-width="1.4" stroke-dasharray="4 8" opacity=".75"/>`
      + `<path d="${landPath(10)}" fill="${C.sandShade}"/><path d="${landPath(7)}" fill="${C.sand}"/>`
      + `<path d="${landPath(0)}" fill="url(#${p}Land)" stroke="${C.coastLine}" stroke-width="1" stroke-opacity=".35"/>`;
    // 田地、小镇、灯塔
    const fields = [[-58, 4, 34, 18, -8], [-22, 20, 30, 16, 6], [44, 10, 30, 18, 10]].map(([dx, dy, w, h, rot]) => {
      const x = home.x + dx * (tall ? 0.8 : 1), y = home.y + dy;
      if (x - w / 2 < 4 || x + w / 2 > W - 4 || y + h / 2 > coast(x) - 4) return '';
      boxes.push([x - w / 2 - 4, y - h / 2 - 4, x + w / 2 + 4, y + h / 2 + 4]);
      return `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${w}" height="${h}" rx="2" fill="url(#${p}Field)" transform="rotate(${rot} ${f(x)} ${f(y)})" opacity=".9"/>`;
    }).join('');
    land += fields + village(home.x, home.y, 14, rand) + lighthouse(light.x, light.y, 26);
    if (!tall) land += `<text x="${f(home.x)}" y="${f(home.y - 22)}" text-anchor="middle" class="cm-place">启程</text>`;
    boxes.push(homeBox, lightBox);
    // 河
    land += rivers.map((r) => {
      const d = curve(r, false);
      return `<ellipse cx="${f(r[0][0])}" cy="${f(r[0][1])}" rx="15" ry="7" fill="${C.river}"/>`
        + `<path d="${d}" stroke="${C.river}" stroke-width="9" fill="none" stroke-linecap="round"/>`
        + `<path d="${d}" stroke="${C.riverLight}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-dasharray="14 10" opacity=".9"/>`;
    }).join('');
    // 背景小丘、远处小雪山
    const decoOk = (x, y, pad) => y < coast(x) - 18 && y > 14 && x > 14 && x < W - 14
      && !boxes.some((b) => inBox(x, y, [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad])) && !near(x, y, trailPts, 18) && !near(x, y, riverPts, 16);
    const zoneAt = (y) => {
      const nearest = nodes.reduce((best, node) => (Math.abs(node.y - y) < Math.abs(best.y - y) ? node : best), nodes[0] || { zone: 'hill', y: 0 });
      return nearest.zone;
    };
    const extras = scatter(rand, tall ? Math.round(n * 0.7) : 9, () => {
      const x = between(rand, 30, W - 30), y = between(rand, 30, H);
      return decoOk(x, y, 30) && zoneAt(y) !== 'island' ? [x, y, 90] : null;
    });
    extras.forEach(([x, y]) => boxes.push([x - 34, y - 46, x + 34, y + 6]));
    const extraArt = extras.map(([x, y]) => {
      const r3 = rng(`${x}|${y}`);
      const s = zoneAt(y) === 'mountain'
        ? peak(0, 58, 46, r3, [mix(C.mtnBack, '#ffffff', 0.25), mix(C.mtnBackShade, '#ffffff', 0.2)])
        : mound(0, 54, 26, 0, [mix(C.hillBack, '#ffffff', 0.2), mix(C.hillBackShade, '#ffffff', 0.2)]);
      return { y, svg: `<g transform="translate(${f(x)},${f(y)})" opacity=".9">${s}</g>` };
    });
    // 树
    const treeSpots = scatter(rand, tall ? n * 6 : 70, () => {
      const x = between(rand, 14, W - 14), y = between(rand, 20, H);
      return decoOk(x, y, 4) ? [x, y, 22] : null;
    });
    const treeArt = treeSpots.map(([x, y]) => {
      const zone = zoneAt(y);
      const kind = zone === 'mountain' ? (rand() < 0.85 ? 'pine' : 'round') : rand() < 0.2 ? 'pine' : 'round';
      return { y, svg: tree(x, y, between(rand, 12, 18), kind) };
    });
    land += [...extraArt, ...treeArt].sort((u, v) => u.y - v.y).map((item) => item.svg).join('');
    // 云
    const clouds = tall ? [[W * 0.2, 40, 30], [W * 0.78, 74, 24]] : [[W * 0.32, 34, 34], [W * 0.7, 26, 28], [W * 0.92, 52, 22]];
    const cloudArt = clouds.map(([x, y, s]) => cloud(x, y, s)).join('');

    // 小路：先画一道浅色底，再画点线
    const trailD = curve(trail, false);
    const path = `<path d="${trailD}" stroke="rgba(255,248,226,.55)" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="${trailD}" stroke="${C.trail}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-dasharray="0.1 10.5" opacity=".85"/>`;
    // 地标按从上到下的顺序画（下面的压住上面的）
    const order = items.map((item, i) => ({ item, y: nodes[i].y })).sort((u, v) => u.y - v.y).map((x) => x.item.svg).join('');
    return {
      items: units,
      svg: svgOpen(W, H, opts.label) + defs(p) + sea + land + path + order + cloudArt + frame(W, H, p) + '</svg>',
    };
  }

  // ---------- 课程大陆 ----------
  function continentDeco(cx, cy, rx, ry, rand, label) {
    let out = '';
    const used = [label];
    const mtnSpots = [[-0.4, -0.42, 0.42], [-0.04, -0.54, 0.5], [0.34, -0.4, 0.4]];
    const art = [];
    mtnSpots.forEach(([dx, dy, s]) => {
      const x = cx + dx * rx, y = cy + dy * ry, w = rx * s;
      art.push({ y, svg: `<g transform="translate(${f(x)},${f(y)})">${peak(0, w, w * 0.78, rand, [C.mtn, C.mtnShade])}</g>` });
      used.push([x - w * 0.55, y - w * 0.8, x + w * 0.55, y + 4]);
    });
    [[-0.5, 0.44, 0.34], [0.5, 0.4, 0.3]].forEach(([dx, dy, s]) => {
      const x = cx + dx * rx, y = cy + dy * ry, w = rx * s;
      art.push({ y, svg: `<g transform="translate(${f(x)},${f(y)})">${hillArt(w, w * 0.5, rand)}</g>` });
      used.push([x - w * 0.6, y - w * 0.5, x + w * 0.6, y + 4]);
    });
    const river = [[cx + rx * 0.14, cy - ry * 0.34], [cx + rx * 0.24, cy - ry * 0.05], [cx + rx * 0.16, cy + ry * 0.4], [cx + rx * 0.26, cy + ry * 1.06]];
    const riverPts = sample(river, 8);
    out += `<path d="${curve(river, false)}" stroke="${C.river}" stroke-width="7" fill="none" stroke-linecap="round"/>`
      + `<path d="${curve(river, false)}" stroke="${C.riverLight}" stroke-width="2" fill="none" stroke-dasharray="10 8"/>`;
    const trees = scatter(rand, 16, () => {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.84;
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      return used.some((b) => inBox(x, y, b)) || near(x, y, riverPts, 12) ? null : [x, y, 20];
    });
    trees.forEach(([x, y]) => art.push({ y, svg: tree(x, y, between(rand, 13, 18), y < cy - ry * 0.2 ? 'pine' : 'round') }));
    return out + art.sort((u, v) => u.y - v.y).map((item) => item.svg).join('');
  }
  function drawWorld(opts, tall, p) {
    const items = opts.items || [];
    const n = Math.max(1, items.length);
    const rand = rng(`${opts.seed || 'world'}|${tall ? 't' : 'w'}`);
    let W, H, spots;
    if (!tall) {
      W = 1100; H = 540;
      spots = items.map((_, i) => ({ x: (W * (i + 0.5)) / n, y: H * (0.5 + (i % 2 ? -0.03 : 0.03)), rx: Math.min((W * 0.4) / n, 250), ry: H * 0.35 }));
    } else {
      W = 420; H = n * 320 + 70;
      spots = items.map((_, i) => ({ x: W / 2, y: 60 + 150 + i * 320, rx: 175, ry: 128 }));
    }
    const outline = spots.map((s) => blob(s.x, s.y, s.rx, s.ry, rand, 14, 0.15));
    const seaOk = (x, y) => spots.every((s) => ((x - s.x) / (s.rx * 1.3)) ** 2 + ((y - s.y) / (s.ry * 1.3)) ** 2 > 1);
    const waves = scatter(rand, tall ? n * 6 : 26, () => {
      const x = between(rand, 20, W - 20), y = between(rand, 16, H - 16);
      return seaOk(x, y) && !(x > W - 110 && y > H - 110) ? [x, y, 40] : null;
    });
    let svg = svgOpen(W, H, opts.label) + defs(p) + `<rect width="${W}" height="${H}" fill="url(#${p}Sea)"/>`
      + waves.map(([x, y]) => wave(x, y)).join('') + compass(W - 58, H - 58, tall ? 24 : 30);
    const ship = scatter(rand, 1, () => { const x = between(rand, 60, W - 120), y = between(rand, 40, H - 40); return seaOk(x, y) && seaOk(x + 30, y) ? [x, y] : null; })[0];
    if (ship) svg += boat(ship[0], ship[1], 24);
    items.forEach((item, i) => {
      const s = spots[i], pts = outline[i];
      const D = (k, dy = 0) => curve(scaled(pts, s.x, s.y, k, dy), true);
      const fs = tall ? 26 : 30;
      const tw = textWidth(item.label, fs);
      const labelBox = [s.x - tw / 2 - 10, s.y - 40, s.x + tw / 2 + 10, s.y + 46];
      svg += `<g class="cm-unit cm-landmass${item.clickable ? ' is-live' : ''}" data-id="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(item.aria || item.label)}">`
        + `<path d="${D(1.13)}" fill="${C.shallow}" opacity=".9"/><path d="${D(1.22)}" fill="none" stroke="${C.foam}" stroke-width="1.4" stroke-dasharray="4 8" opacity=".75"/>`
        + `<g class="cm-art"><path d="${D(1.03, 4)}" fill="${C.sandShade}"/><path d="${D(1.03)}" fill="${C.sand}"/>`
        + `<path d="${D(1)}" fill="url(#${p}Land)" stroke="${C.coastLine}" stroke-width="1" stroke-opacity=".4"/>`
        + continentDeco(s.x, s.y, s.rx, s.ry, rng(`${opts.seed}|${item.id}`), labelBox)
        + (item.flag ? `<g transform="translate(${f(s.x)},${f(s.y - 50)})">${pill(item.flag, C.rust)}</g>` : '')
        + `<text x="${f(s.x)}" y="${f(s.y + 8)}" text-anchor="middle" class="cm-title" style="font-size:${fs}px">${esc(item.label)}</text>`
        + `<text x="${f(s.x)}" y="${f(s.y + 34)}" text-anchor="middle" class="cm-sub" data-sub="${esc(item.id)}">${esc(item.sub || '')}</text></g>`
        + `<path class="cm-hit" d="${D(1.06)}" fill="transparent"/></g>`;
    });
    return { items, svg: svg + frame(W, H, p) + '</svg>' };
  }
  function pill(text, color) {
    const w = textWidth(text, 13) + 22;
    return `<rect x="${f(-w / 2)}" y="-11" width="${f(w)}" height="22" rx="11" fill="${color}"/><text y="4.5" text-anchor="middle" class="cm-pill">${esc(text)}</text>`;
  }

  // ---------- 班级国家 ----------
  function drawContinent(opts, tall, p) {
    const items = opts.items || [];
    const k = items.length;
    const rand = rng(`${opts.seed || 'land'}|${tall ? 't' : 'w'}`);
    const W = tall ? 420 : 1100;
    const H = tall ? Math.max(560, 260 + k * 140) : 640;
    const cx = tall ? W * 0.5 : W * 0.45, cy = tall ? H * 0.46 : H * 0.5;
    const rx = tall ? W * 0.43 : W * 0.37, ry = tall ? H * 0.4 : H * 0.42;
    const pts = blob(cx, cy, rx, ry, rand, 18, 0.11);
    const land = curve(pts, true);
    const D = (s, dy = 0) => curve(scaled(pts, cx, cy, s, dy), true);
    let sites;
    if (k <= 1) sites = [[cx, cy]];
    else if (tall) sites = items.map((_, i) => [cx + (i % 2 ? 0.26 : -0.26) * rx, cy - ry * 0.66 + (i * ry * 1.32) / (k - 1)]);
    else if (k === 2) sites = [[cx - rx * 0.46, cy + ry * 0.04], [cx + rx * 0.46, cy - ry * 0.04]];
    else if (k <= 4) sites = items.map((_, i) => { const a = (k === 3 ? -Math.PI / 2 : -Math.PI * 0.75) + (i * Math.PI * 2) / k; return [cx + Math.cos(a) * rx * 0.5, cy + Math.sin(a) * ry * 0.5]; });
    else sites = [[cx, cy], ...items.slice(1).map((_, i) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / (k - 1); return [cx + Math.cos(a) * rx * 0.62, cy + Math.sin(a) * ry * 0.6]; })];
    sites = sites.map(([x, y]) => [x + between(rand, -10, 10), y + between(rand, -8, 8)]);
    const box = [cx - rx * 1.4, cy - ry * 1.4, cx + rx * 1.4, cy + ry * 1.4];
    const cells = k ? voronoi(sites, box) : [];
    const insideLand = (x, y) => ((x - cx) / (rx * 0.86)) ** 2 + ((y - cy) / (ry * 0.86)) ** 2 < 1;
    const waves = scatter(rand, tall ? 10 : 24, () => {
      const x = between(rand, 20, W - 20), y = between(rand, 16, H - 16);
      return ((x - cx) / (rx * 1.3)) ** 2 + ((y - cy) / (ry * 1.3)) ** 2 > 1 && !(x > W - 220 && y > H - 170) ? [x, y, 40] : null;
    });
    let svg = svgOpen(W, H, opts.label) + defs(p) + `<rect width="${W}" height="${H}" fill="url(#${p}Sea)"/>`
      + waves.map(([x, y]) => wave(x, y)).join('') + compass(tall ? 48 : 62, H - (tall ? 50 : 62), tall ? 24 : 30)
      + `<clipPath id="${p}Clip"><path d="${land}"/></clipPath>`
      + `<path d="${D(1.1)}" fill="${C.shallow}" opacity=".9"/><path d="${D(1.18)}" fill="none" stroke="${C.foam}" stroke-width="1.4" stroke-dasharray="4 8" opacity=".75"/>`
      + `<path d="${D(1.025, 5)}" fill="${C.sandShade}"/><path d="${D(1.025)}" fill="${C.sand}"/>`
      + `<path d="${land}" fill="url(#${p}Land)"/>`;
    if (!k) {
      svg += `<g transform="translate(${f(cx)},${f(cy)})">${mountainArt(150, 120, rand)}</g><text x="${f(cx)}" y="${f(cy + 44)}" text-anchor="middle" class="cm-title" style="font-size:24px">${esc(opts.empty || '还没有班级')}</text>`;
    }
    items.forEach((item, i) => {
      const cell = cells[i];
      const [sx, sy] = sites[i];
      const color = PALETTE[i % PALETTE.length];
      const fs = tall ? 20 : 22;
      const tw = Math.max(textWidth(item.label, fs), textWidth(item.sub || '', 13));
      const labelBox = [sx - tw / 2 - 14, sy - 76, sx + tw / 2 + 14, sy + 44];
      const r3 = rng(`${opts.seed}|${item.id}`);
      const spots = scatter(r3, 12, () => {
        const x = between(r3, box[0], box[2]), y = between(r3, box[1], box[3]);
        return inPoly(x, y, cell) && insideLand(x, y) && !inBox(x, y, labelBox) && edgeDist(x, y, cell) > 18 ? [x, y, 30] : null;
      });
      const deco = spots.map(([x, y], j) => ({
        y,
        svg: j % 5 === 0 && spots.length > 3 ? `<g transform="translate(${f(x)},${f(y)})">${peak(0, 56, 44, r3, [C.mtn, C.mtnShade])}</g>`
          : j % 5 === 2 && spots.length > 4 ? `<g transform="translate(${f(x)},${f(y)})">${hillArt(52, 26, r3)}</g>`
            : tree(x, y, between(r3, 13, 17), r3() < 0.3 ? 'pine' : 'round'),
      })).sort((u, v) => u.y - v.y).map((d) => d.svg).join('');
      svg += `<g class="cm-unit cm-country${item.clickable ? ' is-live' : ''}" data-id="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(item.aria || item.label)}" style="--c:${color};--hi:${mix(color, '#ffffff', 0.35)}">`
        + `<g clip-path="url(#${p}Clip)"><path class="cm-fill" d="${wobblyPath(cell)}" opacity=".78"/>`
        + `<path d="${wobblyPath(cell)}" fill="none" stroke="#6f5235" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="6 4" stroke-linejoin="round"/></g>`
        + deco
        + `<g class="cm-art">${village(sx, sy - 24, 9, r3)}`
        + (item.flag ? `<g transform="translate(${f(sx)},${f(sy - 62)})">${pill(item.flag, C.rust)}</g>` : '')
        + `<text x="${f(sx)}" y="${f(sy + 12)}" text-anchor="middle" class="cm-title" style="font-size:${fs}px">${esc(item.label)}</text>`
        + `<text x="${f(sx)}" y="${f(sy + 34)}" text-anchor="middle" class="cm-sub" data-sub="${esc(item.id)}">${esc(item.sub || '')}</text></g></g>`;
    });
    svg += `<path d="${land}" fill="none" stroke="${C.coastLine}" stroke-width="1.6" stroke-opacity=".55" pointer-events="none"/>`;
    const all = [...items];
    if (opts.extra) {
      const ex = tall ? [W * 0.76, H - 62] : [W * 0.88, H * 0.78];
      const r = tall ? 34 : 42;
      const ipts = blob(ex[0], ex[1], r * 1.2, r * 0.8, rand, 9, 0.14);
      const I = (s, dy = 0) => curve(scaled(ipts, ex[0], ex[1], s, dy), true);
      const pl = plaque('＋', opts.extra.label, 'open', 14);
      all.push(opts.extra);
      svg += `<g class="cm-unit cm-newland is-live" data-id="${esc(opts.extra.id)}" tabindex="0" role="button" aria-label="${esc(opts.extra.label)}">`
        + `<path d="${I(1.35)}" fill="${C.shallow}" opacity=".9"/>`
        + `<g class="cm-art"><path d="${I(1, 4)}" fill="${C.sandShade}"/><path d="${I(1)}" fill="${C.sand}"/><path d="${I(0.74, -2)}" fill="${C.grass}" stroke="#fffaf0" stroke-width="2" stroke-dasharray="5 5"/>`
        + tree(ex[0] - r * 0.2, ex[1] + r * 0.05, 16, 'palm') + `</g>`
        + `<g transform="translate(${f(ex[0])},${f(ex[1] + r * 0.8 + 6)})">${pl.svg}</g>`
        + `<rect class="cm-hit" x="${f(ex[0] - Math.max(r * 1.3, pl.w / 2))}" y="${f(ex[1] - r)}" width="${f(Math.max(r * 2.6, pl.w))}" height="${f(r * 1.8 + pl.h + 8)}" fill="transparent"/></g>`;
    }
    return { items: all, svg: svg + frame(W, H, p) + '</svg>' };
  }

  // ---------- 挂载：自动横竖版、悬停说明、点击 ----------
  const CSS = `
.cm-wrap{position:relative;border-radius:14px;overflow:hidden;background:${C.sea};box-shadow:0 12px 30px rgba(53,38,24,.13),inset 0 0 0 1px rgba(70,51,34,.2)}
.cm-wrap svg{display:block;width:100%;height:auto;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.cm-unit{cursor:pointer;outline:none}
.cm-unit:not(.is-live){cursor:not-allowed}
.cm-art{transition:transform .25s cubic-bezier(.2,.8,.3,1)}
.cm-unit.is-live:hover .cm-art,.cm-unit.is-live:focus-visible .cm-art{transform:translateY(-5px)}
.cm-plaque-box{fill:#fffaf0;stroke:#bf9550;stroke-width:1.4;transition:stroke .2s}
.cm-badge{fill:${C.teal}}
.cm-no{font:800 11px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;fill:#fff}
.cm-name{font-weight:800;font-family:"Songti SC",STSong,SimSun,"Noto Serif SC",serif;fill:${C.ink}}
.cm-unit.is-current .cm-plaque-box{stroke:${C.rust};stroke-width:2.2}
.cm-unit.is-current .cm-badge{fill:${C.rust}}
.cm-unit.is-off .cm-plaque-box{fill:#efebe4;stroke:#c9c1b4}
.cm-unit.is-off .cm-badge{fill:#b1a99d}
.cm-unit.is-off .cm-name{fill:#8f877c}
.cm-unit.is-live:hover .cm-plaque-box{stroke:${C.rust};stroke-width:2.4}
.cm-unit:focus-visible .cm-plaque-box{stroke:${C.teal};stroke-width:3}
.cm-flag-text,.cm-pill{font:800 10px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;fill:#fff}
.cm-pill{font-size:13px}
.cm-place,.cm-compass,.cm-title,.cm-sub{paint-order:stroke;stroke:rgba(255,250,236,.92);stroke-linejoin:round}
.cm-place{font:800 14px/1 "Songti SC",STSong,SimSun,serif;fill:#6b4a2c;stroke-width:4px}
.cm-compass{font:800 12px/1 "Songti SC",STSong,SimSun,serif;fill:#6b5134;stroke-width:3px}
.cm-title{font-weight:900;font-family:"Songti SC",STSong,SimSun,"Noto Serif SC",serif;fill:${C.ink};stroke-width:5px}
.cm-sub{font:700 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;fill:#5a4a3a;stroke-width:4px}
.cm-country .cm-fill{fill:var(--c);transition:fill .2s}
.cm-country.is-live:hover .cm-fill,.cm-country.is-live:focus-visible .cm-fill{fill:var(--hi)}
.cm-landmass.is-live:hover .cm-title,.cm-country.is-live:hover .cm-title{fill:${C.rust}}
.cm-pulse{transform-box:fill-box;transform-origin:center;animation:cmPulse 2.4s ease-out infinite}
.cm-pennant{transform-box:fill-box;transform-origin:left center;animation:cmWave 1.4s ease-in-out infinite alternate}
.cm-unit.is-shake .cm-art{animation:cmShake .38s}
@keyframes cmPulse{0%{transform:scale(.7);opacity:.95}100%{transform:scale(1.45);opacity:0}}
@keyframes cmWave{from{transform:skewY(0) scaleX(1)}to{transform:skewY(-5deg) scaleX(.9)}}
@keyframes cmShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@media (prefers-reduced-motion:reduce){.cm-pulse,.cm-pennant,.cm-unit.is-shake .cm-art{animation:none}.cm-art{transition:none}}
.cm-loading{display:grid;place-items:center;min-height:320px;background:linear-gradient(180deg,#bfe6fb,#5cb5ea)}
.cm-loading p{margin:0;padding:8px 16px;border-radius:999px;background:rgba(255,253,248,.85);color:#23655f;font:800 15px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.cm-tip{position:absolute;z-index:5;left:0;top:0;width:max-content;max-width:min(330px,calc(100% - 20px));padding:11px 14px 12px;border-radius:10px;background:rgba(255,253,248,.97);color:#201c18;box-shadow:0 12px 32px rgba(40,30,20,.24);border:1px solid rgba(70,51,34,.14);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;transform:translate(-50%,calc(-100% - 10px));pointer-events:none}
.cm-tip.is-below{transform:translate(-50%,10px)}
.cm-tip.is-touch{pointer-events:auto}
.cm-tip strong{display:block;font:800 16px/1.4 "Songti SC",STSong,SimSun,serif}
.cm-tip small{display:block;color:#6d6259;font-size:13px;line-height:1.55}
.cm-tip em{display:block;margin-top:6px;font-style:normal;font-weight:800;font-size:13px;color:${C.teal}}
.cm-tip em.is-off{color:#8f877c}
.cm-tip em.is-current{color:${C.rust}}
.cm-tip .cm-go{display:block;width:100%;margin-top:9px;padding:8px 12px;border:0;border-radius:7px;background:${C.teal};color:#fff;font:800 14px/1.2 inherit;cursor:pointer}
`;
  function injectStyle() {
    if (document.getElementById('class-map-style')) return;
    const style = document.createElement('style');
    style.id = 'class-map-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function mount(host, opts, draw) {
    injectStyle();
    const p = `cm${(seq += 1)}`;
    host.innerHTML = '<div class="cm-wrap"><div class="cm-canvas"></div><div class="cm-tip" role="status" hidden></div></div>';
    const wrap = host.firstElementChild, canvas = wrap.firstElementChild, tip = wrap.lastElementChild;
    let tall = null, byId = {}, tipFor = null, lastPointer = 'mouse';
    const isTall = () => (opts.layout === 'wide' ? false : opts.layout === 'tall' ? true : host.clientWidth > 0 && host.clientWidth < 640);
    function render(force) {
      const want = isTall();
      if (want === tall && !force) return;
      tall = want;
      const out = draw(opts, tall, p);
      canvas.innerHTML = out.svg;
      byId = Object.fromEntries(out.items.map((item) => [String(item.id), item]));
      wrap.classList.toggle('is-tall', tall);
      hideTip();
    }
    const unitEl = (id) => Array.from(canvas.querySelectorAll('.cm-unit')).find((g) => g.dataset.id === String(id));
    function hideTip() { tip.hidden = true; tipFor = null; }
    function showTip(g, item, touch) {
      if (!item || !item.tip) { hideTip(); return; }
      tip.innerHTML = item.tip + (touch && item.clickable ? `<button type="button" class="cm-go" data-cm-go>${esc(item.go || '进入 →')}</button>` : '');
      tip.hidden = false;
      tip.classList.toggle('is-touch', Boolean(touch));
      const target = g.querySelector('.cm-hit') || g;
      const box = target.getBoundingClientRect(), frameBox = wrap.getBoundingClientRect();
      const half = Math.min(tip.offsetWidth, frameBox.width - 16) / 2;
      const left = Math.max(half + 8, Math.min(frameBox.width - half - 8, box.left + box.width / 2 - frameBox.left));
      const above = box.top - frameBox.top > tip.offsetHeight + 18;
      tip.classList.toggle('is-below', !above);
      tip.style.left = `${left}px`;
      tip.style.top = `${above ? box.top - frameBox.top : box.bottom - frameBox.top}px`;
      tipFor = String(item.id);
    }
    function pick(item, g) {
      if (!item) return;
      if (!item.clickable) {
        showTip(g, item, false);
        g.classList.remove('is-shake');
        void g.getBoundingClientRect();
        g.classList.add('is-shake');
        return;
      }
      hideTip();
      if (opts.onPick) opts.onPick(item);
    }
    wrap.addEventListener('pointerdown', (event) => { lastPointer = event.pointerType || 'mouse'; }, true);
    canvas.addEventListener('pointerover', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const g = event.target.closest('.cm-unit');
      if (g && tipFor !== g.dataset.id) showTip(g, byId[g.dataset.id], false);
    });
    canvas.addEventListener('pointerout', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const g = event.target.closest('.cm-unit');
      if (g && !g.contains(event.relatedTarget)) hideTip();
    });
    canvas.addEventListener('focusin', (event) => {
      const g = event.target.closest('.cm-unit');
      if (g && lastPointer !== 'touch') showTip(g, byId[g.dataset.id], false);
    });
    canvas.addEventListener('click', (event) => {
      const g = event.target.closest('.cm-unit');
      if (!g) { hideTip(); return; }
      const item = byId[g.dataset.id];
      // 触屏：第一下先看说明（带“进入”按钮），再点一下同一处或按钮才进入
      if (lastPointer === 'touch' && item && item.tip && tipFor !== String(item.id)) { showTip(g, item, true); return; }
      pick(item, g);
    });
    canvas.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const g = event.target.closest('.cm-unit');
      if (!g) return;
      event.preventDefault();
      pick(byId[g.dataset.id], g);
    });
    tip.addEventListener('click', (event) => {
      if (!event.target.closest('[data-cm-go]') || !tipFor) return;
      pick(byId[tipFor], unitEl(tipFor));
    });
    const outside = (event) => { if (!wrap.contains(event.target)) hideTip(); };
    document.addEventListener('pointerdown', outside);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => render(false)) : null;
    const onResize = () => render(false);
    if (ro) ro.observe(host); else window.addEventListener('resize', onResize);
    render(true);
    return {
      update(next) { Object.assign(opts, next || {}); render(true); },
      setSub(id, text) { canvas.querySelectorAll('[data-sub]').forEach((el) => { if (el.dataset.sub === String(id)) el.textContent = text; }); },
      reveal(id) { const g = unitEl(id); if (g && tall) g.scrollIntoView({ block: 'center', behavior: 'auto' }); },
      destroy() {
        document.removeEventListener('pointerdown', outside);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);
        host.innerHTML = '';
      },
    };
  }

  // ---------- 3D 版（live-map3d.js，three.js）：浏览器支持 WebGL 时优先用，加载失败或不支持时用上面的平面版 ----------
  const SELF = (document.currentScript && document.currentScript.src) || '/js/live-map.js';
  let loader = null;
  const load3d = () => (loader = loader || import(SELF.replace(/live-map\.js(\?.*)?$/, (m, q) => `live-map3d.js${q || ''}`)));
  function webgl() {
    try {
      const c = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (error) { return false; }
  }
  const FLAT = { journey: drawJourney, world: drawWorld, continent: drawContinent };
  function auto(kind) {
    return (host, opts) => {
      injectStyle();
      if (opts.flat || /[?&]map=2d\b/.test(location.search) || !webgl()) return mount(host, opts, FLAT[kind]);
      let inner = null, dead = false, pendingReveal = null;
      host.innerHTML = '<div class="cm-wrap cm-loading"><p>正在绘制地图……</p></div>';
      load3d().then((mod) => {
        if (dead) return;
        inner = mod[kind](host, opts);
        if (pendingReveal) setTimeout(() => { if (inner && !dead) inner.reveal(pendingReveal); }, 80);
      }).catch((problem) => {
        console.warn('[课程地图] 3D 版没有加载，改用平面版：', (problem && problem.message) || problem);
        if (!dead) inner = mount(host, opts, FLAT[kind]);
      });
      return {
        update(next) { if (inner) inner.update(next); else Object.assign(opts, next || {}); },
        setSub(id, text) {
          if (inner) inner.setSub(id, text);
          else (opts.items || []).forEach((item) => { if (String(item.id) === String(id)) item.sub = text; });
        },
        reveal(id) { if (inner) inner.reveal(id); else pendingReveal = id; },
        destroy() { dead = true; if (inner) inner.destroy(); else host.innerHTML = ''; },
      };
    };
  }

  window.ClassMap = {
    journey: auto('journey'),
    world: auto('world'),
    continent: auto('continent'),
    flat: { journey: (host, opts) => mount(host, opts, drawJourney), world: (host, opts) => mount(host, opts, drawWorld), continent: (host, opts) => mount(host, opts, drawContinent) },
  };
})();
