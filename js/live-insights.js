/* 教师工作台“学情分析”的图表（2026-11-05 用户：“或者你能直接在教师控制台中增加一个板块，直接输出一些图表分析学生的行为吗？”）
 * 只负责画图：数据由 live-teacher.js 整理好传进来。纯 SVG，不依赖第三方库：
 *   tiles 统计卡片、columns 按天柱状图、bars 横向条形图、heatmap 星期×小时热力图；
 *   每张图都能悬停或用键盘聚焦看数值（提示框只增补，不是唯一途径），图下面“查看数据表”给出同样的数。
 * 配色：单一系列用蓝色（#2a78d6），热力图用同一色相由浅到深，零值为中性灰；文字一律用文字颜色，不用数据色。
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const C = {
    series: '#2a78d6', seriesHover: '#1c5cab', surface: '#fffdf8', grid: '#e9e5dc', axis: '#c9c2b4',
    ink: '#201c18', ink2: '#52514e', muted: '#7d746a', zero: '#f0ede6',
    ramp: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
  };
  const CSS = `
  .ins-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
  .ins-grid > .is-wide { grid-column: 1 / -1; }
  @media (max-width: 900px) { .ins-grid { grid-template-columns: 1fr; } }
  .ins-card { position: relative; min-width: 0; padding: 16px 18px 14px; border: 1px solid rgba(70,51,34,.12); border-radius: 12px; background: ${C.surface}; transition: opacity .2s; }
  .ins-card h3 { margin: 0; color: ${C.ink}; font-size: 16px; font-weight: 800; }
  .ins-card .ins-sub { margin: 2px 0 10px; color: ${C.ink2}; font-size: 13px; line-height: 1.55; }
  .ins-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .ins-tile { padding: 14px 16px; border: 1px solid rgba(70,51,34,.12); border-radius: 12px; background: ${C.surface}; }
  .ins-tile span { display: block; color: ${C.ink2}; font-size: 13px; font-weight: 700; }
  .ins-tile b { display: block; margin-top: 4px; color: ${C.ink}; font-size: 28px; font-weight: 700; line-height: 1.2; }
  .ins-tile small { display: block; margin-top: 2px; color: ${C.muted}; font-size: 12px; line-height: 1.5; }
  .ins-svg { display: block; width: 100%; height: auto; overflow: visible; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .ins-svg text { fill: ${C.muted}; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .ins-svg text.is-label { fill: ${C.ink2}; font-size: 12.5px; font-variant-numeric: normal; }
  .ins-svg text.is-value { fill: ${C.ink}; font-size: 12px; font-weight: 700; }
  .ins-svg .ins-hit { fill: transparent; cursor: default; outline: none; }
  .ins-svg .ins-hit:focus-visible { stroke: ${C.ink}; stroke-width: 1.5; }
  .ins-tip { position: absolute; z-index: 5; pointer-events: none; min-width: 120px; max-width: 260px; padding: 8px 10px; border: 1px solid rgba(70,51,34,.18); border-radius: 8px;
    background: #fff; box-shadow: 0 8px 22px rgba(32,28,24,.16); color: ${C.ink2}; font-size: 12.5px; line-height: 1.55; }
  .ins-tip[hidden] { display: none; }
  .ins-tip strong { display: block; color: ${C.ink}; font-size: 15px; font-weight: 800; }
  .ins-tip i { display: inline-block; width: 12px; height: 2px; margin-right: 6px; vertical-align: middle; background: ${C.series}; }
  .ins-legend { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: ${C.muted}; font-size: 12px; }
  .ins-legend i { display: inline-block; width: 120px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, ${C.ramp[0]}, ${C.ramp[6]}, ${C.ramp[12]}); }
  .ins-legend em { display: inline-block; width: 12px; height: 8px; border-radius: 2px; background: ${C.zero}; font-style: normal; }
  .ins-table { margin-top: 8px; color: ${C.ink2}; font-size: 13px; }
  .ins-table summary { cursor: pointer; color: ${C.muted}; font-weight: 700; }
  .ins-table table { width: 100%; margin-top: 6px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .ins-table th, .ins-table td { padding: 4px 8px; border-bottom: 1px solid ${C.grid}; text-align: left; white-space: nowrap; }
  .ins-table .ins-scroll { max-height: 260px; overflow: auto; }
  .ins-empty { margin: 18px 0; color: ${C.muted}; font-size: 14px; text-align: center; }
  `;
  let styled = false;
  function addStyle() {
    if (styled) return;
    styled = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (parent) parent.appendChild(node);
    return node;
  };
  const text = (parent, x, y, value, attrs = {}) => { const node = el('text', { x, y, ...attrs }, parent); node.textContent = value; return node; };
  const fmt = (n) => (Number(n) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  // 刻度取整：0 / 5 / 10…，0 / 10 / 20…，0 / 50 / 100…
  function niceTicks(max, count = 4) {
    if (!(max > 0)) return [0, 1];
    const raw = max / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
  }
  const widthOf = (host) => Math.max(300, Math.floor(host.getBoundingClientRect().width || host.clientWidth || 600));

  // 提示框：每张卡片一个；数值在前（粗），说明在后
  function tipFor(card) {
    let tip = card.querySelector(':scope > .ins-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'ins-tip';
      tip.hidden = true;
      card.appendChild(tip);
    }
    return {
      show(event, value, lines) {
        tip.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = value;
        tip.appendChild(strong);
        lines.forEach((line) => { const div = document.createElement('div'); div.textContent = line; tip.appendChild(div); });
        tip.hidden = false;
        const box = card.getBoundingClientRect();
        const anchor = event && event.clientX != null ? { x: event.clientX, y: event.clientY } : (() => { const r = event.target.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; })();
        let left = anchor.x - box.left + 12;
        let top = anchor.y - box.top + 12;
        const w = tip.offsetWidth;
        if (left + w > box.width - 8) left = anchor.x - box.left - w - 12;
        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = `${Math.max(4, top)}px`;
      },
      hide() { tip.hidden = true; },
    };
  }
  function bindHover(node, card, getContent, onEnter, onLeave) {
    const tip = tipFor(card);
    const enter = (event) => { const [value, lines] = getContent(); tip.show(event, value, lines); if (onEnter) onEnter(); };
    const leave = () => { tip.hide(); if (onLeave) onLeave(); };
    node.setAttribute('tabindex', '0');
    node.addEventListener('pointermove', enter);
    node.addEventListener('pointerleave', leave);
    node.addEventListener('focus', enter);
    node.addEventListener('blur', leave);
  }
  // 圆角只在数据端：竖柱顶部、横条右端各 4px，基线一端方角
  const colPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };
  const barPath = (x, y, w, h) => {
    const r = Math.min(4, h / 2, w);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  };
  function tableView(card, head, rows) {
    const box = document.createElement('details');
    box.className = 'ins-table';
    const summary = document.createElement('summary');
    summary.textContent = '查看数据表';
    box.appendChild(summary);
    const scroll = document.createElement('div');
    scroll.className = 'ins-scroll';
    const table = document.createElement('table');
    const tr = document.createElement('tr');
    head.forEach((h) => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
    const thead = document.createElement('thead'); thead.appendChild(tr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => { const r = document.createElement('tr'); row.forEach((cell) => { const td = document.createElement('td'); td.textContent = cell; r.appendChild(td); }); tbody.appendChild(r); });
    table.appendChild(tbody);
    scroll.appendChild(table);
    box.appendChild(scroll);
    card.appendChild(box);
  }
  function card(parent, title, sub, wide) {
    const box = document.createElement('section');
    box.className = `ins-card${wide ? ' is-wide' : ''}`;
    const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
    if (sub) { const p = document.createElement('p'); p.className = 'ins-sub'; p.textContent = sub; box.appendChild(p); }
    parent.appendChild(box);
    return box;
  }
  const empty = (host, message) => { const p = document.createElement('p'); p.className = 'ins-empty'; p.textContent = message; host.appendChild(p); };

  // 统计卡片：[{ label, value, note }]
  function tiles(parent, list) {
    const box = document.createElement('div');
    box.className = 'ins-tiles';
    list.forEach((item) => {
      const tile = document.createElement('div');
      tile.className = 'ins-tile';
      const span = document.createElement('span'); span.textContent = item.label;
      const b = document.createElement('b'); b.textContent = item.value;
      tile.append(span, b);
      if (item.note) { const small = document.createElement('small'); small.textContent = item.note; tile.appendChild(small); }
      box.appendChild(tile);
    });
    parent.appendChild(box);
    return box;
  }

  // 竖柱（按天）：data＝[{ key, label, value, lines: [] }]；只给最高的一根标数值
  function columns(host, cardEl, data, opts = {}) {
    if (!data.length || !data.some((d) => d.value > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const W = widthOf(host);
    const H = opts.height || 220;
    const m = { l: 34, r: 10, t: 18, b: 26 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const ticks = niceTicks(Math.max(...data.map((d) => d.value)));
    const top = ticks[ticks.length - 1] || 1;
    const y = (v) => m.t + ph - (v / top) * ph;
    ticks.forEach((t) => {
      el('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? C.axis : C.grid, 'stroke-width': 1 }, svg);
      text(svg, m.l - 6, y(t) + 4, fmt(t), { 'text-anchor': 'end' });
    });
    const band = pw / data.length;
    const bw = Math.max(2, Math.min(24, band * 0.62));
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(pw / 46))));
    const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
    data.forEach((d, i) => {
      const cx = m.l + band * i + band / 2;
      const h = Math.max(0, (d.value / top) * ph);
      const bar = h > 0 ? el('path', { d: colPath(cx - bw / 2, m.t + ph - h, bw, h), fill: C.series }, svg) : null;
      if ((data.length - 1 - i) % every === 0) text(svg, cx, H - 8, d.label, { 'text-anchor': 'middle' });   // 从最后一天往前等距标注，最后一天总有标签、不会挤在一起
      if (i === maxIdx && d.value > 0) text(svg, cx, m.t + ph - h - 5, fmt(d.value), { 'text-anchor': 'middle', class: 'is-value' });
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, class: 'ins-hit', 'aria-label': `${d.label}：${fmt(d.value)}${opts.unit || ''}` }, svg);
      bindHover(hit, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}`, d.lines || [d.label]],
        () => { if (bar) bar.setAttribute('fill', C.seriesHover); }, () => { if (bar) bar.setAttribute('fill', C.series); });
    });
  }

  // 横条：data＝[{ label, value, lines }]，数值写在条末端
  function bars(host, cardEl, data, opts = {}) {
    if (!data.length || !data.some((d) => d.value > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const W = widthOf(host);
    const row = 30;
    const bh = 16;
    const labelW = Math.min(150, Math.max(64, Math.max(...data.map((d) => String(d.label).length)) * 13 + 10));
    const valueW = 56;
    const H = data.length * row + 6;
    const pw = W - labelW - valueW;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const max = Math.max(...data.map((d) => d.value)) || 1;
    el('line', { x1: labelW, x2: labelW, y1: 0, y2: H - 4, stroke: C.axis, 'stroke-width': 1 }, svg);
    data.forEach((d, i) => {
      const y = i * row + (row - bh) / 2;
      const w = (d.value / max) * pw;
      text(svg, labelW - 8, y + bh / 2 + 4, d.label, { 'text-anchor': 'end', class: 'is-label' });
      const bar = w > 0 ? el('path', { d: barPath(labelW, y, Math.max(1, w), bh), fill: C.series }, svg) : null;
      text(svg, labelW + w + 6, y + bh / 2 + 4, `${fmt(d.value)}${opts.unit || ''}`, { class: 'is-value' });
      const hit = el('rect', { x: 0, y: i * row, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：${fmt(d.value)}${opts.unit || ''}` }, svg);
      bindHover(hit, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}`, d.lines || [d.label]],
        () => { if (bar) bar.setAttribute('fill', C.seriesHover); }, () => { if (bar) bar.setAttribute('fill', C.series); });
    });
  }

  // 热力图：rows（如周一…周日）× cols（0—23 时），values[r][c]；颜色只表示多少（一个色相由浅到深），0 为中性灰
  function heatmap(host, cardEl, rows, cols, values, opts = {}) {
    const max = Math.max(0, ...values.flat());
    if (!(max > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const W = widthOf(host);
    const m = { l: 40, r: 6, t: 18, b: 4 };
    const gap = 2;
    const cell = Math.max(8, Math.min(26, Math.floor((W - m.l - m.r) / cols.length) - gap));
    const H = m.t + rows.length * (cell + gap) + m.b;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const colorOf = (v) => (v <= 0 ? C.zero : C.ramp[Math.min(C.ramp.length - 1, Math.floor((v / max) * (C.ramp.length - 1) + 0.0001))]);
    cols.forEach((c, j) => { if (j % 3 === 0) text(svg, m.l + j * (cell + gap) + cell / 2, m.t - 6, String(c), { 'text-anchor': 'middle' }); });
    rows.forEach((r, i) => {
      text(svg, m.l - 8, m.t + i * (cell + gap) + cell / 2 + 4, r, { 'text-anchor': 'end', class: 'is-label' });
      cols.forEach((c, j) => {
        const v = values[i][j] || 0;
        const x = m.l + j * (cell + gap);
        const y = m.t + i * (cell + gap);
        const rect = el('rect', { x, y, width: cell, height: cell, rx: 3, fill: colorOf(v) }, svg);
        const hit = el('rect', { x: x - gap / 2, y: y - gap / 2, width: cell + gap, height: cell + gap, class: 'ins-hit', 'aria-label': `${r} ${c}:00—${c + 1}:00：${v}${opts.unit || ''}` }, svg);
        bindHover(hit, cardEl, () => [`${fmt(v)}${opts.unit || ''}`, [`${r} ${c}:00—${c + 1}:00`]],
          () => { rect.setAttribute('stroke', C.ink); rect.setAttribute('stroke-width', '1.5'); }, () => { rect.removeAttribute('stroke'); });
      });
    });
    const legend = document.createElement('div');
    legend.className = 'ins-legend';
    const zero = document.createElement('em'); zero.title = '0';
    const s0 = document.createElement('span'); s0.textContent = '0';
    const ramp = document.createElement('i');
    const s1 = document.createElement('span'); s1.textContent = `少 → 多（最多 ${fmt(max)}${opts.unit || ''}）`;
    legend.append(zero, s0, ramp, s1);
    host.appendChild(legend);
  }

  window.ClassLiveInsights = { addStyle, card, tiles, columns, bars, heatmap, tableView, empty, colors: C };
})();
