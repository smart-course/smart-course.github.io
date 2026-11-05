/* 教师工作台“学情分析”的图表（2026-11-05 用户：“或者你能直接在教师控制台中增加一个板块，直接输出一些图表分析学生的行为吗？”）
 * 只负责画图：数据由 live-teacher.js 整理好传进来。纯 SVG，不依赖第三方库：
 *   tiles 统计卡片、columns 柱状图、bars 横向条形图（dot：棒棒糖图）、heatmap 星期×小时热力图、donut 环形图、diverging 正反对比条、
 *   dumbbell 哑铃图、scatter 散点图、compare 个人与全班对比、grouped 分组条；
 *   2026-11-07 起又有 lines 折线／面积图、treemap 矩形树图、waffle 方格图、segmented 分段条、calendar 日历热力图、radar 雷达图、meter 进度条；
 *   所有文字先量实际宽度再排版，不超出卡片；
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
  .ins-sec { grid-column: 1 / -1; margin: 14px 0 -4px; padding-top: 10px; border-top: 1px solid rgba(70,51,34,.14); color: ${C.ink}; font-size: 18px; font-weight: 800; }
  .ins-sec small { margin-left: 8px; color: ${C.muted}; font-size: 13px; font-weight: 600; }
  .ins-keys { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 8px; color: ${C.ink2}; font-size: 12.5px; }
  .ins-keys span { display: inline-flex; align-items: center; gap: 6px; }
  .ins-keys i { display: inline-block; width: 12px; height: 10px; border-radius: 2px; }
  .ins-keys i.is-dot { width: 10px; height: 10px; border-radius: 50%; }
  .ins-keys i.is-line { width: 14px; height: 2px; border-radius: 1px; }
  .ins-seg { margin: 4px 0 12px; }
  .ins-seg-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 22px; margin: 0; padding: 0; list-style: none; color: ${C.ink2}; font-size: 13px; }
  .ins-seg-list li { display: grid; grid-template-columns: 12px 1fr auto auto; align-items: center; gap: 8px; }
  .ins-seg-list li i { width: 12px; height: 12px; border-radius: 3px; }
  .ins-seg-list li b { color: ${C.ink}; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
  .ins-seg-list li small { min-width: 36px; color: ${C.muted}; font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
  .ins-person-grid { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 8px 28px; align-items: start; }
  @media (max-width: 900px) { .ins-person-grid { grid-template-columns: minmax(0, 1fr); } }
  .ins-person { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin: 0 0 8px; color: ${C.ink2}; font-size: 13px; }
  .ins-person strong { color: ${C.ink}; font-size: 18px; }
  .ins-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 22px; }
  .ins-pie svg { flex: 0 0 auto; width: 200px; height: 200px; }
  .ins-pie svg g { cursor: default; outline: none; transition: opacity .15s; }
  .ins-pie svg g:focus-visible rect { stroke: ${C.ink}; stroke-width: 1; }
  .ins-pie svg path { cursor: default; outline: none; transition: opacity .15s; }
  .ins-pie svg path:focus-visible { stroke: ${C.ink}; }
  .ins-pie svg text.is-center { fill: ${C.ink}; font-size: 22px; font-weight: 700; font-variant-numeric: normal; }
  .ins-pie svg text.is-center-sub { fill: ${C.ink2}; font-size: 12px; }
  .ins-pie ul { flex: 1 1 180px; display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; color: ${C.ink2}; font-size: 13px; }
  .ins-pie li { display: grid; grid-template-columns: 12px 1fr auto auto; align-items: center; gap: 8px; }
  .ins-pie li i { width: 12px; height: 12px; border-radius: 3px; }
  .ins-pie li b { color: ${C.ink}; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
  .ins-pie li small { min-width: 36px; color: ${C.muted}; font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
  .ins-card.is-zoomable { cursor: zoom-in; }
  .ins-card.is-zoomable > h3 { padding-right: 64px; }
  .ins-zoom-btn { position: absolute; top: 12px; right: 12px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border: 1px solid rgba(70,51,34,.18); border-radius: 999px;
    background: #fff; color: ${C.ink2}; font: 700 12.5px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; opacity: .7; transition: opacity .15s, box-shadow .15s; }
  .ins-zoom-btn svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .ins-card:hover .ins-zoom-btn, .ins-zoom-btn:focus-visible { opacity: 1; box-shadow: 0 2px 8px rgba(70,51,34,.14); }
  .ins-zoom { position: fixed; inset: 0; z-index: 2147482000; display: flex; overflow: auto; padding: 64px 24px 28px; box-sizing: border-box; background: rgba(24,20,16,.74);
    -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); animation: ins-zoom-in .18s ease-out; }
  @keyframes ins-zoom-in { from { opacity: 0; } }
  .ins-zoom-stage { position: relative; flex: 0 0 auto; margin: auto; }
  .ins-zoom-stage > .ins-card { position: absolute; left: 0; top: 0; transform-origin: 0 0; cursor: default; box-shadow: 0 30px 80px rgba(0,0,0,.35); }
  .ins-zoom-x { position: fixed; top: 12px; right: 16px; z-index: 1; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255,255,255,.94); color: ${C.ink};
    font: 400 28px/1 -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.3); }
  .ins-zoom-x:hover { background: #fff; }
  .ins-zoom-hint { position: fixed; top: 22px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,.82); font: 600 14px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; pointer-events: none; }
  @media (max-width: 640px) { .ins-zoom-hint { display: none; } .ins-zoom { padding: 60px 10px 16px; } }
  @media (prefers-reduced-motion: reduce) { .ins-zoom { animation: none; } }
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
  // 2026-11-07 用户：“柱状图内容是否可以放左边一些，右侧不要超出卡片”：标签栏和数值位原来按字数估、按固定宽度留，长一点就超出卡片。
  // 现在一律先量实际宽度再排版：标签栏只留最长标签那么宽（内容靠左），条末端的数值有多宽留多宽
  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  let ruler = null;
  function textW(value, size, weight) {
    if (!ruler) ruler = document.createElement('canvas').getContext('2d');
    ruler.font = `${weight} ${size}px ${FONT}`;
    return Math.ceil(ruler.measureText(String(value)).width);
  }
  const labelW = (value) => textW(value, 12.5, 400);   // .is-label
  const valueW = (value) => Math.ceil(textW(value, 12, 700) * 1.06) + 1;     // .is-value（数字等宽，比量出来的略宽）
  const tickW = (value) => Math.ceil(textW(value, 11.5, 400) * 1.06) + 1;    // 刻度（同上）
  // 放不下时截短（完整名称在悬停提示和数据表里）
  function fit(value, width, measure = labelW) {
    const raw = String(value);
    if (measure(raw) <= width) return raw;
    let n = raw.length - 1;
    while (n > 1 && measure(`${raw.slice(0, n)}…`) > width) n -= 1;
    return `${raw.slice(0, n)}…`;
  }
  const labelColumn = (rows, W, cap = 200) => Math.max(40, Math.min(cap, Math.floor(W * 0.45), Math.max(...rows.map((d) => labelW(d.label))))) + 10;
  // 横轴文字：靠近两边时改为靠边对齐，不伸到图外
  function edgeText(parent, x, y, value, W, attrs = {}, measure = tickW) {
    const half = measure(value) / 2;
    if (x + half > W) return text(parent, W, y, value, { ...attrs, 'text-anchor': 'end' });
    if (x - half < 0) return text(parent, 0, y, value, { ...attrs, 'text-anchor': 'start' });
    return text(parent, x, y, value, { ...attrs, 'text-anchor': 'middle' });
  }
  // 色块上的字：白字或近黑字，取对比度高的
  function inkOn(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#ffffff' : '#201c18';
  }
  // 有先后、高低顺序的几档：同一色相由浅到深（最浅一档也要和底色分得开）
  const ORDINAL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'];
  const ordinal = (n) => (n <= 1 ? [ORDINAL[2]] : Array.from({ length: n }, (_, i) => ORDINAL[Math.round((i * (ORDINAL.length - 1)) / (n - 1))]));

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
        lines.forEach((line) => {
          const div = document.createElement('div');
          if (line && line.key) { const key = document.createElement('i'); key.style.background = line.key; div.append(key, line.text); } else div.textContent = line;
          tip.appendChild(div);
        });
        tip.hidden = false;
        const box = card.getBoundingClientRect();
        const k = card.offsetWidth ? box.width / card.offsetWidth : 1;   // 放大看时卡片整体放大，提示框位置按比例换算
        const anchor = event && event.clientX != null ? { x: event.clientX, y: event.clientY } : (() => { const r = event.target.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; })();
        let left = (anchor.x - box.left) / k + 12;
        const top = (anchor.y - box.top) / k + 12;
        const w = tip.offsetWidth;
        if (left + w > (card.offsetWidth || box.width) - 8) left = (anchor.x - box.left) / k - w - 12;
        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = `${Math.max(4, top)}px`;
      },
      hide() { tip.hidden = true; },
    };
  }
  // 2026-11-05 用户：“鼠标移到别处后，浮现的具体数据内容就自动消失”：同一时间只显示一个提示框；
  // 指针移到别处（不在这一块上）、页面或表格滚动、切到别的窗口或标签页、点别处时都收起。
  // 键盘（Tab）聚焦时显示；鼠标点了以后留下的焦点不再弹出提示（原来切回窗口时会重新弹出、移开也不消失）
  let active = null;   // { node, tip, leave }
  function hideActive() {
    if (!active) return;
    const { tip, leave } = active;
    active = null;
    tip.hide();
    if (leave) leave();
  }
  let globalBound = false;
  function bindGlobal() {
    if (globalBound) return;
    globalBound = true;
    document.addEventListener('pointermove', (event) => { if (active && !active.node.contains(event.target)) hideActive(); }, { passive: true });
    document.addEventListener('pointerdown', (event) => { if (active && !active.node.contains(event.target)) hideActive(); }, { passive: true });
    window.addEventListener('scroll', hideActive, { capture: true, passive: true });
    window.addEventListener('blur', hideActive);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideActive(); });
  }
  function bindHover(node, card, getContent, onEnter, onLeave) {
    bindGlobal();
    const tip = tipFor(card);
    const show = (event) => {
      if (active && active.node !== node) hideActive();
      const [value, lines] = getContent();
      tip.show(event, value, lines);
      if (!active && onEnter) onEnter();
      active = { node, tip, leave: onLeave };
    };
    const leave = () => { if (active && active.node === node) hideActive(); };
    node.setAttribute('tabindex', '0');
    node.addEventListener('pointermove', show);
    node.addEventListener('pointerleave', leave);
    node.addEventListener('focus', (event) => { let keyboard = true; try { keyboard = node.matches(':focus-visible'); } catch (error) { /* 旧浏览器 */ } if (keyboard) show(event); });
    node.addEventListener('blur', leave);
    node.addEventListener('keydown', (event) => { if (event.key === 'Escape') leave(); });
  }
  // 圆角只在数据端：竖柱顶部、横条右端各 4px，基线一端方角
  const colPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };
  const barLeft = (xr, y, w, h) => {   // 向左长的条：左端圆角，零线一端方角
    const r = Math.min(4, h / 2, w);
    const xl = xr - w;
    return `M${xr},${y}H${xl + r}Q${xl},${y} ${xl},${y + r}V${y + h - r}Q${xl},${y + h} ${xl + r},${y + h}H${xr}Z`;
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
    const ticks = niceTicks(Math.max(...data.map((d) => d.value)));
    const m = { l: Math.max(...ticks.map((t) => tickW(fmt(t)))) + 10, r: 4, t: 18, b: 26 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
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
      if ((data.length - 1 - i) % every === 0) edgeText(svg, cx, H - 8, d.label, W);   // 从最后一天往前等距标注，最后一天总有标签、不会挤在一起
      if (i === maxIdx && d.value > 0) edgeText(svg, cx, m.t + ph - h - 5, fmt(d.value), W, { class: 'is-value' }, valueW);
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, class: 'ins-hit', 'aria-label': `${d.label}：${fmt(d.value)}${opts.unit || ''}` }, svg);
      bindHover(hit, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}`, d.lines || [d.label]],
        () => { if (bar) bar.setAttribute('fill', C.seriesHover); }, () => { if (bar) bar.setAttribute('fill', C.series); });
    });
  }

  // 横条：data＝[{ label, value, lines }]，数值写在条末端
  function bars(host, cardEl, data, opts = {}) {
    if (!data.length || !data.some((d) => d.value > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    if (opts.stacked) { stackedBars(host, cardEl, data, opts); return; }
    const W = widthOf(host);
    const row = 30;
    const bh = 16;
    const shownOf = (d) => (d.text != null ? d.text : `${fmt(d.value)}${opts.unit || ''}`);
    const label = labelColumn(data, W, opts.labelMax || 200);
    const valueCol = Math.max(...data.map((d) => valueW(shownOf(d)))) + 8;
    const H = data.length * row + 6;
    const pw = Math.max(20, W - label - valueCol);
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const max = Math.max(...data.map((d) => d.value)) || 1;
    el('line', { x1: label, x2: label, y1: 0, y2: H - 4, stroke: C.axis, 'stroke-width': 1 }, svg);
    data.forEach((d, i) => {
      const y = i * row + (row - bh) / 2;
      const w = (d.value / max) * pw;
      text(svg, label - 8, y + bh / 2 + 4, fit(d.label, label - 10), { 'text-anchor': 'end', class: 'is-label' });
      const color = d.color || C.series;
      const bar = w > 0 ? el('path', { d: barPath(label, y, Math.max(1, w), bh), fill: color }, svg) : null;
      const shown = shownOf(d);
      text(svg, label + w + 6, y + bh / 2 + 4, shown, { class: 'is-value' });
      const hit = el('rect', { x: 0, y: i * row, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：${shown}` }, svg);
      bindHover(hit, cardEl, () => [shown, d.lines || [d.label]],
        () => { if (bar) bar.style.opacity = '.8'; }, () => { if (bar) bar.style.opacity = ''; });
    });
  }

  // 名称在上、条在下（名称很长、需要读全的时候）；opts.dot：细线＋圆点的棒棒糖图（看排名和高低，比一排粗条轻）
  function stackedBars(host, cardEl, data, opts) {
    const W = widthOf(host);
    const row = 44; const bh = 12;
    const shownOf = (d) => (d.text != null ? d.text : `${fmt(d.value)}${opts.unit || ''}`);
    const valueCol = Math.max(...data.map((d) => valueW(shownOf(d)))) + 10;
    const pw = W - valueCol;
    const H = data.length * row + 2;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const max = opts.max || Math.max(...data.map((d) => d.value)) || 1;
    data.forEach((d, i) => {
      const y = i * row;
      const color = d.color || C.series;
      const shown = shownOf(d);
      text(svg, 0, y + 15, fit(d.label, W), { class: 'is-label' });
      const w = (d.value / max) * pw;
      let bar = null;
      if (opts.dot) {
        const cy = y + 28;
        const at = Math.max(5, Math.min(pw - 5, w));
        el('line', { x1: 0, x2: pw, y1: cy, y2: cy, stroke: C.grid, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
        if (w > 0) el('line', { x1: 0, x2: at, y1: cy, y2: cy, stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
        bar = el('circle', { cx: at, cy, r: 5, fill: color, stroke: C.surface, 'stroke-width': 2 }, svg);
        text(svg, pw + 8, cy + 4, shown, { class: 'is-value' });
      } else {
        el('rect', { x: 0, y: y + 22, width: pw, height: bh, rx: 4, fill: C.zero }, svg);
        bar = w > 0 ? el('path', { d: barPath(0, y + 22, Math.max(1, w), bh), fill: color }, svg) : null;
        text(svg, pw + 8, y + 22 + bh - 1, shown, { class: 'is-value' });
      }
      const hit = el('rect', { x: 0, y, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：${shown}` }, svg);
      bindHover(hit, cardEl, () => [shown, d.lines || [d.label]], () => { if (bar) bar.style.opacity = '.8'; }, () => { if (bar) bar.style.opacity = ''; });
    });
  }

  // 热力图：rows（如周一…周日）× cols（0—23 时），values[r][c]；颜色只表示多少（一个色相由浅到深），0 为中性灰
  function heatmap(host, cardEl, rows, cols, values, opts = {}) {
    const max = Math.max(0, ...values.flat());
    if (!(max > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const W = widthOf(host);
    const m = { l: 40, r: 6, t: 18, b: 4 };
    const gap = 2;
    const cellW = Math.max(6, (W - m.l - m.r + gap) / cols.length - gap);
    const cell = Math.max(8, Math.min(26, cellW));
    const H = m.t + rows.length * (cell + gap) + m.b;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const colorOf = (v) => (v <= 0 ? C.zero : C.ramp[Math.min(C.ramp.length - 1, Math.floor((v / max) * (C.ramp.length - 1) + 0.0001))]);
    cols.forEach((c, j) => { if (j % 3 === 0) text(svg, m.l + j * (cellW + gap) + cellW / 2, m.t - 6, String(c), { 'text-anchor': 'middle' }); });
    rows.forEach((r, i) => {
      text(svg, m.l - 8, m.t + i * (cell + gap) + cell / 2 + 4, r, { 'text-anchor': 'end', class: 'is-label' });
      cols.forEach((c, j) => {
        const v = values[i][j] || 0;
        const x = m.l + j * (cellW + gap);
        const y = m.t + i * (cell + gap);
        const rect = el('rect', { x, y, width: cellW, height: cell, rx: 3, fill: colorOf(v) }, svg);
        const hit = el('rect', { x: x - gap / 2, y: y - gap / 2, width: cellW + gap, height: cell + gap, class: 'ins-hit', 'aria-label': `${r} ${c}:00—${c + 1}:00：${v}${opts.unit || ''}` }, svg);
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

  // 环形饼图（部分占整体）：data＝[{ label, value, color }]，颜色按组成项固定（不随大小变化）；扇区之间 2px 底色间隙；
  // 旁边的图例写名称、数值和占比（颜色较浅的几项也能读到数），悬停或用 Tab 键看每一块
  function donut(host, cardEl, data, opts = {}) {
    const list = data.filter((d) => d.value > 0);
    const total = list.reduce((t, d) => t + d.value, 0);
    if (!(total > 0)) { empty(host, opts.empty || '还没有数据。'); return; }
    const wrap = document.createElement('div');
    wrap.className = 'ins-pie';
    host.appendChild(wrap);
    const svg = el('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': opts.aria || '' }, wrap);
    const cx = 100; const cy = 100; const R = 90; const r = 58;
    const pt = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const arc = (a0, a1) => {
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = pt(R, a0); const [x1, y1] = pt(R, a1); const [x2, y2] = pt(r, a1); const [x3, y3] = pt(r, a0);
      return `M${x0},${y0}A${R},${R} 0 ${big} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${big} 0 ${x3},${y3}Z`;
    };
    let a = -Math.PI / 2;
    const pct = (v) => `${Math.round((v / total) * 1000) / 10}%`;
    list.forEach((d) => {
      const span = (d.value / total) * Math.PI * 2;
      const end = list.length === 1 ? a + Math.PI * 2 - 0.0001 : a + span;
      const seg = el('path', { d: arc(a, end), fill: d.color, stroke: C.surface, 'stroke-width': list.length === 1 ? 0 : 2, 'stroke-linejoin': 'round', 'aria-label': `${d.label}：${fmt(d.value)}${opts.unit || ''}，${pct(d.value)}` }, svg);
      bindHover(seg, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}（${pct(d.value)}）`, [d.label]],
        () => { svg.querySelectorAll('path').forEach((p) => { if (p !== seg) p.style.opacity = '.45'; }); },
        () => { svg.querySelectorAll('path').forEach((p) => { p.style.opacity = ''; }); });
      a += span;
    });
    if (opts.center) text(svg, cx, cy + 4, opts.center, { 'text-anchor': 'middle', class: 'is-center' });
    if (opts.centerSub) text(svg, cx, cy + 24, opts.centerSub, { 'text-anchor': 'middle', class: 'is-center-sub' });
    wrap.appendChild(partList(list, total, opts.unit));
  }
  // 名称、数值、占比的小表（环形图、方格图、分段条共用）
  function partList(list, total, unit, cls) {
    const ul = document.createElement('ul');
    if (cls) ul.className = cls;
    list.forEach((d) => {
      const li = document.createElement('li');
      const sw = document.createElement('i'); sw.style.background = d.color;
      const name = document.createElement('span'); name.textContent = d.label;
      const val = document.createElement('b'); val.textContent = `${fmt(d.value)}${unit || ''}`;
      const share = document.createElement('small'); share.textContent = `${Math.round((d.value / total) * 1000) / 10}%`;
      li.append(sw, name, val, share);
      ul.appendChild(li);
    });
    return ul;
  }

  // 分组标题（占满一行）
  function section(parent, title, note) {
    const h = document.createElement('h3');
    h.className = 'ins-sec';
    h.textContent = title;
    if (note) { const small = document.createElement('small'); small.textContent = note; h.appendChild(small); }
    parent.appendChild(h);
    return h;
  }
  // 图例：[{ name, color, dot }]（两个及以上系列时一定有）
  function keys(host, items) {
    const box = document.createElement('div');
    box.className = 'ins-keys';
    items.forEach((item) => {
      const span = document.createElement('span');
      const sw = document.createElement('i'); sw.style.background = item.color; if (item.dot) sw.className = 'is-dot'; if (item.line) sw.className = 'is-line';
      const name = document.createElement('b'); name.style.fontWeight = '600'; name.textContent = item.name;
      span.append(sw, name);
      box.appendChild(span);
    });
    host.appendChild(box);
  }

  // 正反对比条（两极：左边一类、右边一类，中间是零线）：rows＝[{ label, left, right, lines }]
  function diverging(host, cardEl, rows, opts = {}) {
    if (!rows.length || !rows.some((d) => d.left > 0 || d.right > 0)) { empty(host, opts.empty || '还没有数据。'); return; }
    keys(host, [{ name: opts.rightName, color: opts.rightColor }, { name: opts.leftName, color: opts.leftColor }]);
    const W = widthOf(host);
    const row = 30; const bh = 16;
    const label = labelColumn(rows, W);
    const pad = Math.max(...rows.flatMap((d) => [valueW(fmt(d.left)), valueW(fmt(d.right))])) + 8;
    const mid = label + (W - label) / 2;
    const half = (W - label) / 2 - pad;
    const max = Math.max(1, ...rows.map((d) => Math.max(d.left, d.right)));
    const H = rows.length * row + 6;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    el('line', { x1: mid, x2: mid, y1: 0, y2: H - 4, stroke: C.axis, 'stroke-width': 1 }, svg);
    rows.forEach((d, i) => {
      const y = i * row + (row - bh) / 2;
      text(svg, label - 8, y + bh / 2 + 4, fit(d.label, label - 10), { 'text-anchor': 'end', class: 'is-label' });
      const wr = (d.right / max) * half; const wl = (d.left / max) * half;
      if (wr > 0) el('path', { d: barPath(mid + 1, y, wr, bh), fill: opts.rightColor }, svg);
      if (wl > 0) el('path', { d: barLeft(mid - 1, y, wl, bh), fill: opts.leftColor }, svg);
      text(svg, mid + wr + 6, y + bh / 2 + 4, fmt(d.right), { class: 'is-value' });
      text(svg, mid - wl - 6, y + bh / 2 + 4, fmt(d.left), { class: 'is-value', 'text-anchor': 'end' });
      const hit = el('rect', { x: 0, y: i * row, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：${opts.rightName} ${d.right}，${opts.leftName} ${d.left}` }, svg);
      bindHover(hit, cardEl, () => [`${opts.rightName} ${fmt(d.right)} · ${opts.leftName} ${fmt(d.left)}`, d.lines || [d.label]]);
    });
  }

  // 前后对比（哑铃图）：rows＝[{ label, a, b, lines }]，a＝之前（灰点）、b＝之后（蓝点），0—max（默认 100）
  function dumbbell(host, cardEl, rows, opts = {}) {
    if (!rows.length) { empty(host, opts.empty || '还没有数据。'); return; }
    keys(host, [{ name: opts.aName, color: opts.aColor, dot: true }, { name: opts.bName, color: opts.bColor, dot: true }]);
    const W = widthOf(host);
    const row = 28;
    const label = labelColumn(rows, W);
    const right = Math.max(tickW(`100${opts.unit || ''}`) / 2, ...rows.map((d) => (d.b == null ? 0 : valueW(`${fmt(d.b)}${opts.unit || ''}`) + 10))) + 2;
    const H = rows.length * row + 26;
    const max = opts.max || 100;
    const x = (v) => label + 6 + (v / max) * (W - label - 6 - right);
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    [0, 25, 50, 75, 100].filter((t) => t <= max).forEach((t) => {
      el('line', { x1: x(t), x2: x(t), y1: 0, y2: H - 22, stroke: t === 0 ? C.axis : C.grid, 'stroke-width': 1 }, svg);
      text(svg, x(t), H - 6, `${t}${opts.unit || ''}`, { 'text-anchor': 'middle' });
    });
    rows.forEach((d, i) => {
      const cy = i * row + row / 2;
      text(svg, label - 8, cy + 4, fit(d.label, label - 10), { 'text-anchor': 'end', class: 'is-label' });
      if (d.a != null && d.b != null) el('line', { x1: x(d.a), x2: x(d.b), y1: cy, y2: cy, stroke: C.axis, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
      if (d.a != null) el('circle', { cx: x(d.a), cy, r: 5, fill: opts.aColor, stroke: C.surface, 'stroke-width': 2 }, svg);
      if (d.b != null) {
        el('circle', { cx: x(d.b), cy, r: 5, fill: opts.bColor, stroke: C.surface, 'stroke-width': 2 }, svg);
        text(svg, Math.max(x(d.b), d.a != null ? x(d.a) : 0) + 10, cy + 4, `${fmt(d.b)}${opts.unit || ''}`, { class: 'is-value' });
      }
      const hit = el('rect', { x: 0, y: i * row, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：${opts.aName} ${d.a == null ? '—' : d.a}，${opts.bName} ${d.b == null ? '—' : d.b}` }, svg);
      bindHover(hit, cardEl, () => [`${opts.aName} ${d.a == null ? '—' : `${fmt(d.a)}${opts.unit || ''}`} → ${opts.bName} ${d.b == null ? '—' : `${fmt(d.b)}${opts.unit || ''}`}`, d.lines || [d.label]]);
    });
  }

  // 散点：points＝[{ x, y, label, lines }]；虚线一律不用，中位数用细实线
  function scatter(host, cardEl, points, opts = {}) {
    if (!points.length) { empty(host, opts.empty || '还没有数据。'); return; }
    const W = widthOf(host);
    const H = opts.height || 300;
    const xt = niceTicks(Math.max(...points.map((p) => p.x))); const yt = niceTicks(Math.max(...points.map((p) => p.y)));
    const xMax = xt[xt.length - 1] || 1; const yMax = yt[yt.length - 1] || 1;
    const m = { l: Math.max(46, Math.max(...yt.map((t) => tickW(fmt(t)))) + 10), r: Math.max(14, tickW(fmt(xMax)) / 2 + 2), t: 30, b: 40 };
    const X = (v) => m.l + (v / xMax) * (W - m.l - m.r);
    const Y = (v) => m.t + (H - m.t - m.b) - (v / yMax) * (H - m.t - m.b);
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    yt.forEach((t) => { el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? C.axis : C.grid, 'stroke-width': 1 }, svg); text(svg, m.l - 6, Y(t) + 4, fmt(t), { 'text-anchor': 'end' }); });
    xt.forEach((t) => { text(svg, X(t), H - m.b + 16, fmt(t), { 'text-anchor': 'middle' }); });
    el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: C.axis, 'stroke-width': 1 }, svg);
    text(svg, (m.l + W - m.r) / 2, H - 4, opts.xName || '', { 'text-anchor': 'middle', class: 'is-label' });
    text(svg, 0, 14, opts.yName || '', { class: 'is-label' });
    const med = (list) => { const s = list.slice().sort((a, b) => a - b); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    if (points.length >= 4) {
      const mx = med(points.map((p) => p.x)); const my = med(points.map((p) => p.y));
      el('line', { x1: X(mx), x2: X(mx), y1: m.t, y2: H - m.b, stroke: C.axis, 'stroke-width': 1 }, svg);
      el('line', { x1: m.l, x2: W - m.r, y1: Y(my), y2: Y(my), stroke: C.axis, 'stroke-width': 1 }, svg);
      if (X(mx) + 4 + tickW('中位数') <= W) text(svg, X(mx) + 4, H - m.b - 4, '中位数', {}); else text(svg, X(mx) - 4, H - m.b - 4, '中位数', { 'text-anchor': 'end' });
      (opts.quadrants || []).forEach(([qx, qy, label]) => text(svg, qx ? W - m.r - 4 : m.l + 6, qy ? m.t + 26 : H - m.b - 18, label, { 'text-anchor': qx ? 'end' : 'start' }));
    }
    points.forEach((p) => {
      const dot = el('circle', { cx: X(p.x), cy: Y(p.y), r: 5, fill: p.color || C.series, stroke: C.surface, 'stroke-width': 2 }, svg);
      const hit = el('circle', { cx: X(p.x), cy: Y(p.y), r: 12, class: 'ins-hit', 'aria-label': `${p.label}：${opts.xName} ${p.x}，${opts.yName} ${p.y}` }, svg);
      bindHover(hit, cardEl, () => [p.label, p.lines || []], () => dot.setAttribute('r', '7'), () => dot.setAttribute('r', '5'));
    });
  }

  // 个人与全班对比：rows＝[{ label, me, avg, max, unit }]，每行各自的刻度（不同单位不混一个轴），数值写在条末端
  function compare(host, cardEl, rows, opts = {}) {
    if (!opts.noKeys) keys(host, [{ name: opts.meName || '本人', color: C.series }, { name: opts.avgName || '全班平均', color: '#b3aca0' }]);
    const W = widthOf(host);
    const row = 40; const bh = 10;
    const label = labelColumn(rows, W, 120);
    const valueCol = Math.max(...rows.flatMap((d) => [valueW(`${fmt(d.me)}${d.unit || ''}`), valueW(`${fmt(d.avg)}${d.unit || ''}`)])) + 8;
    const pw = Math.max(20, W - label - valueCol);
    const H = rows.length * row + 4;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    el('line', { x1: label, x2: label, y1: 0, y2: H - 2, stroke: C.axis, 'stroke-width': 1 }, svg);
    rows.forEach((d, i) => {
      const y0 = i * row + 8;
      const max = Math.max(d.max || 0, d.me, d.avg) || 1;
      text(svg, label - 8, y0 + bh + 4, fit(d.label, label - 10), { 'text-anchor': 'end', class: 'is-label' });
      [[d.me, C.series, y0], [d.avg, '#b3aca0', y0 + bh + 2]].forEach(([v, color, y]) => {
        const w = (v / max) * pw;
        if (w > 0) el('path', { d: barPath(label, y, Math.max(1, w), bh), fill: color }, svg);
        text(svg, label + w + 6, y + bh - 1, `${fmt(v)}${d.unit || ''}`, { class: 'is-value' });
      });
      const hit = el('rect', { x: 0, y: i * row, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：本人 ${d.me}，全班平均 ${d.avg}` }, svg);
      bindHover(hit, cardEl, () => [`本人 ${fmt(d.me)}${d.unit || ''} · 全班平均 ${fmt(d.avg)}${d.unit || ''}`, [d.label, d.note || ''].filter(Boolean)]);
    });
  }

  // 分组横条（同一单位的几个系列，最多 3 个）：rows＝[{ label, values: [], lines }]，series＝[{ name, color }]
  function grouped(host, cardEl, rows, series, opts = {}) {
    if (!rows.length || !rows.some((d) => d.values.some((v) => v > 0))) { empty(host, opts.empty || '还没有数据。'); return; }
    keys(host, series);
    const W = widthOf(host);
    const bh = 7; const gap = 2;
    const row = series.length * (bh + gap) + 14;
    const label = labelColumn(rows, W);
    const pw = Math.max(20, W - label - Math.max(...rows.flatMap((d) => d.values.map((v) => textW(fmt(v), 10.5, 700)))) - 8);
    const H = rows.length * row + 4;
    const max = Math.max(1, ...rows.flatMap((d) => d.values));
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    el('line', { x1: label, x2: label, y1: 0, y2: H - 2, stroke: C.axis, 'stroke-width': 1 }, svg);
    rows.forEach((d, i) => {
      const top = i * row + 7;
      text(svg, label - 8, top + (series.length * (bh + gap)) / 2 + 3, fit(d.label, label - 10), { 'text-anchor': 'end', class: 'is-label' });
      d.values.forEach((v, k) => {
        const w = (v / max) * pw;
        const y = top + k * (bh + gap);
        if (w > 0) el('path', { d: barPath(label, y, Math.max(1, w), bh), fill: series[k].color }, svg);
        if (v > 0) text(svg, label + w + 4, y + bh, fmt(v), { class: 'is-value', style: 'font-size:10.5px' });
      });
      const hit = el('rect', { x: 0, y: i * row, width: W, height: row, class: 'ins-hit', 'aria-label': `${d.label}：${series.map((s, k) => `${s.name} ${d.values[k]}`).join('，')}` }, svg);
      bindHover(hit, cardEl, () => [series.map((s, k) => `${s.name} ${fmt(d.values[k])}${opts.unit || ''}`).join(' · '), d.lines || [d.label]]);
    });
  }


  // ================= 2026-11-07 用户：“学情分析是否可以丰富一下图表类型，不要总是柱状图” =================
  // 折线／面积图（随时间、随课次的走势）：rows＝[{ label, tick（轴上的字，可以是 [日期, 名称] 两行）, values: [], short（标在点上的字）, lines }]，series＝[{ name, color }]。
  // 只标最高、最低和最后一个点，其余看纵轴、悬停和数据表；竖线跟着指针走，提示框列出这一点的所有系列
  function lines(host, cardEl, rows, series, opts = {}) {
    if (!rows.length || !rows.some((d) => d.values.some((v) => v > 0))) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    if (series.length > 1) keys(host, series.map((item) => ({ ...item, line: true })));
    const W = widthOf(host);
    const H = opts.height || 230;
    const unit = opts.unit || '';
    const shownOf = (v) => `${fmt(v)}${unit}`;
    const ticks = opts.ticks || niceTicks(Math.max(...rows.flatMap((d) => d.values.filter((v) => v != null))));
    const top = ticks[ticks.length - 1] || 1;
    const tickText = (t) => `${fmt(t)}${opts.tickUnit || ''}`;
    const twoLines = rows.some((d) => Array.isArray(d.tick));
    const lastValues = rows[rows.length - 1].values;
    const m = { l: Math.max(...ticks.map((t) => tickW(tickText(t)))) + 10, r: series.length > 1 ? Math.max(...lastValues.map((v) => valueW(fmt(v || 0)))) + 12 : 8, t: 22, b: twoLines ? 38 : 24 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const band = pw / rows.length;
    const X = (i) => m.l + band * i + band / 2;
    const Y = (v) => m.t + ph - (v / top) * ph;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    ticks.forEach((t) => {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? C.axis : C.grid, 'stroke-width': 1 }, svg);
      text(svg, m.l - 6, Y(t) + 4, tickText(t), { 'text-anchor': 'end' });
    });
    // 横轴：从最后一个往前等距标注；放不下的第二行截短
    const first = (d) => (Array.isArray(d.tick) ? d.tick[0] : d.tick != null ? d.tick : d.label);
    const every = Math.max(1, Math.ceil((Math.max(...rows.map((d) => tickW(first(d)))) + 8) / band));
    rows.forEach((d, i) => {
      if ((rows.length - 1 - i) % every) return;
      edgeText(svg, X(i), H - m.b + 16, first(d), W);
      if (Array.isArray(d.tick) && d.tick[1]) edgeText(svg, X(i), H - m.b + 30, fit(d.tick[1], band * every - 6, tickW), W);
    });
    const dots = opts.dots !== false;
    series.forEach((item, k) => {
      const pts = rows.map((d, i) => (d.values[k] == null ? null : [X(i), Y(d.values[k])]));
      const runs = [];
      pts.forEach((pt) => { if (!pt) { runs.push([]); return; } if (!runs.length) runs.push([]); runs[runs.length - 1].push(pt); });
      runs.filter((run) => run.length).forEach((run) => {
        if (opts.area && run.length > 1) el('path', { d: `M${run[0][0]},${m.t + ph}L${run.map((pt) => pt.join(',')).join('L')}L${run[run.length - 1][0]},${m.t + ph}Z`, fill: item.color, 'fill-opacity': 0.1 }, svg);
        if (run.length > 1) el('path', { d: `M${run.map((pt) => pt.join(',')).join('L')}`, fill: 'none', stroke: item.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      });
      if (dots) pts.forEach((pt) => { if (pt) el('circle', { cx: pt[0], cy: pt[1], r: 4, fill: item.color, stroke: C.surface, 'stroke-width': 2 }, svg); });
    });
    // 数值只标重点
    if (series.length === 1) {
      const known = rows.map((d, i) => [d.values[0], i]).filter(([v]) => v != null);
      const hi = known.reduce((a, b) => (b[0] > a[0] ? b : a));
      const lo = known.reduce((a, b) => (b[0] < a[0] ? b : a));
      const last = known[known.length - 1];
      const marks = new Map([[hi[1], false], [last[1], false]]);
      if (!opts.noLow && lo[0] < hi[0] && rows.length > 2) marks.set(lo[1], true);
      marks.forEach((below, i) => {
        const d = rows[i];
        const v = d.values[0];
        const say = d.short != null ? d.short : shownOf(v);
        const y = below && Y(v) + 18 < m.t + ph ? Y(v) + 18 : Y(v) - 9;
        if (!dots) el('circle', { cx: X(i), cy: Y(v), r: 4, fill: series[0].color, stroke: C.surface, 'stroke-width': 2 }, svg);
        edgeText(svg, X(i), Math.max(11, y), say, W, { class: 'is-value' }, valueW);
      });
    } else {
      // 线尾数值：靠得太近的不标（图例、悬停和数据表里都有）
      let prev = -99;
      lastValues.map((v, k) => [v, k]).filter(([v]) => v != null).sort((a, b) => Y(a[0]) - Y(b[0])).forEach(([v]) => {
        const y = Y(v);
        if (y - prev < 13) return;
        prev = y;
        text(svg, X(rows.length - 1) + 8, y + 4, fmt(v), { class: 'is-value' });
      });
    }
    // 悬停层
    const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: C.axis, 'stroke-width': 1, visibility: 'hidden' }, svg);
    const hoverDots = series.map((item) => el('circle', { r: 5, fill: item.color, stroke: C.surface, 'stroke-width': 2, visibility: 'hidden' }, svg));
    rows.forEach((d, i) => {
      const say = series.length === 1 ? `${d.short != null ? d.short : shownOf(d.values[0])}` : series.map((item, k) => `${item.name} ${d.values[k] == null ? '—' : shownOf(d.values[k])}`).join('，');
      const hit = el('rect', { x: m.l + band * i, y: m.t - 6, width: band, height: ph + 12, class: 'ins-hit', 'aria-label': `${d.label}：${say}` }, svg);
      bindHover(hit, cardEl,
        () => (series.length === 1
          ? [say, d.lines || [d.label]]
          : [d.label, series.map((item, k) => ({ key: item.color, text: `${item.name} ${d.values[k] == null ? '—' : shownOf(d.values[k])}` })).concat(d.lines || [])]),
        () => {
          cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
          hoverDots.forEach((dot, k) => { if (d.values[k] == null) return; dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(d.values[k])); dot.setAttribute('visibility', 'visible'); });
        },
        () => { cross.setAttribute('visibility', 'hidden'); hoverDots.forEach((dot) => dot.setAttribute('visibility', 'hidden')); });
    });
  }

  // 矩形树图（各部分占整体）：data＝[{ label, value, lines }]；面积表示多少，颜色同一色相、越多越深；放得下才写名称，放不下的看悬停和数据表
  function treemap(host, cardEl, data, opts = {}) {
    const list = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const total = list.reduce((t, d) => t + d.value, 0);
    if (!(total > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const W = widthOf(host);
    const H = opts.height || 250;
    const worst = (row, side) => {
      const sum = row.reduce((t, r) => t + r.area, 0);
      const big = Math.max(...row.map((r) => r.area));
      const small = Math.min(...row.map((r) => r.area));
      return Math.max((side * side * big) / (sum * sum), (sum * sum) / (side * side * small));
    };
    const boxes = [];
    let rest = list.map((d) => ({ d, area: (d.value / total) * W * H }));
    let [bx, by, bw, bh] = [0, 0, W, H];
    while (rest.length) {
      const side = Math.min(bw, bh);
      const row = [rest[0]];
      let i = 1;
      while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i += 1; }
      rest = rest.slice(i);
      const sum = row.reduce((t, r) => t + r.area, 0);
      if (bw >= bh) {
        const cw = sum / bh; let yy = by;
        row.forEach((r) => { const rh = r.area / cw; boxes.push({ d: r.d, x: bx, y: yy, w: cw, h: rh }); yy += rh; });
        bx += cw; bw -= cw;
      } else {
        const ch = sum / bw; let xx = bx;
        row.forEach((r) => { const rw = r.area / ch; boxes.push({ d: r.d, x: xx, y: by, w: rw, h: ch }); xx += rw; });
        by += ch; bh -= ch;
      }
    }
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const steps = C.ramp.slice(3);   // 最浅一档也要和底色分得开
    const max = list[0].value;
    boxes.forEach(({ d, x, y, w, h }) => {
      const fill = steps[Math.round(Math.sqrt(d.value / max) * (steps.length - 1))];
      const ink = inkOn(fill);
      const rect = el('rect', { x: x + 1, y: y + 1, width: Math.max(1, w - 2), height: Math.max(1, h - 2), rx: 4, fill }, svg);
      const amount = `${fmt(d.value)}${opts.unit || ''} · ${Math.round((d.value / total) * 100)}%`;
      if (h >= 26 && textW(d.label, 13, 700) + 16 <= w) {
        text(svg, x + 9, y + 20, d.label, { style: `fill:${ink};font-size:13px;font-weight:700;font-variant-numeric:normal` });
        if (h >= 44 && textW(amount, 12, 400) + 16 <= w) text(svg, x + 9, y + 37, amount, { style: `fill:${ink};font-size:12px` });
      }
      const hit = el('rect', { x, y, width: w, height: h, class: 'ins-hit', 'aria-label': `${d.label}：${amount}` }, svg);
      bindHover(hit, cardEl, () => [amount, d.lines || [d.label]], () => { rect.setAttribute('stroke', C.ink); rect.setAttribute('stroke-width', '1.5'); }, () => rect.removeAttribute('stroke'));
    });
  }

  // 方格图（每一格是一位同学）：data＝[{ label, value, color, lines }]，按顺序一档一档排；旁边的小表写名称、人数、占比
  function waffle(host, cardEl, data, opts = {}) {
    const total = data.reduce((t, d) => t + d.value, 0);
    if (!(total > 0)) { empty(host, opts.empty || '还没有数据。'); return; }
    const wrap = document.createElement('div');
    wrap.className = 'ins-pie';
    host.appendChild(wrap);
    const gap = 3;
    const room = Math.min(widthOf(host), 280);
    const perRow = Math.max(5, Math.ceil(Math.sqrt(total * 1.25)));
    const cell = Math.max(5, Math.min(22, Math.floor((room + gap) / perRow) - gap));
    const rowsN = Math.ceil(total / perRow);
    const gw = perRow * (cell + gap) - gap;
    const gh = rowsN * (cell + gap) - gap;
    const svg = el('svg', { viewBox: `0 0 ${gw} ${gh}`, role: 'group', 'aria-label': opts.aria || '' }, wrap);
    svg.style.width = `${gw}px`;
    svg.style.height = `${gh}px`;
    let n = 0;
    const groups = [];
    data.filter((d) => d.value > 0).forEach((d) => {
      const share = `${Math.round((d.value / total) * 1000) / 10}%`;
      const g = el('g', { 'aria-label': `${d.label}：${fmt(d.value)}${opts.unit || ''}，${share}` }, svg);
      groups.push(g);
      for (let i = 0; i < d.value; i += 1) {
        el('rect', { x: (n % perRow) * (cell + gap), y: Math.floor(n / perRow) * (cell + gap), width: cell, height: cell, rx: Math.min(3, cell / 4), fill: d.color }, g);
        n += 1;
      }
      bindHover(g, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}（${share}）`, d.lines || [d.label]],
        () => groups.forEach((other) => { if (other !== g) other.style.opacity = '.35'; }), () => groups.forEach((other) => { other.style.opacity = ''; }));
    });
    wrap.appendChild(partList(data, total, opts.unit));
  }

  // 分段条（一个整体分成几段，有先后顺序）：data＝[{ label, value, color, lines }]；放得下才在段内写占比，下面的小表写名称、数量、占比
  function segmented(host, cardEl, data, opts = {}) {
    const total = data.reduce((t, d) => t + d.value, 0);
    if (!(total > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const box = document.createElement('div');
    box.className = 'ins-seg';
    host.appendChild(box);
    const W = widthOf(host);
    const bh = 28; const gap = 2;
    const parts = data.filter((d) => d.value > 0);
    const usable = W - gap * (parts.length - 1);
    const raw = parts.map((d) => Math.max(3, (d.value / total) * usable));
    const k = usable / raw.reduce((t, w) => t + w, 0);
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${bh}`, role: 'group', 'aria-label': opts.aria || '' }, box);
    let x = 0;
    parts.forEach((d, i) => {
      const w = raw[i] * k;
      const share = `${Math.round((d.value / total) * 100)}%`;
      const rect = el('rect', { x, y: 0, width: w, height: bh, rx: Math.min(4, w / 2), fill: d.color }, svg);
      if (textW(share, 12, 700) + 14 <= w) text(svg, x + 7, bh / 2 + 4, share, { style: `fill:${inkOn(d.color)};font-size:12px;font-weight:700` });
      const hit = el('rect', { x: x - 1, y: 0, width: w + 2, height: bh, class: 'ins-hit', 'aria-label': `${d.label}：${fmt(d.value)}${opts.unit || ''}，${share}` }, svg);
      bindHover(hit, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}（${Math.round((d.value / total) * 1000) / 10}%）`, d.lines || [d.label]], () => { rect.style.opacity = '.8'; }, () => { rect.style.opacity = ''; });
      x += w + gap;
    });
    host.appendChild(partList(data, total, opts.unit, 'ins-seg-list'));
  }

  // 日历热力图（一列一周，看有没有天天坚持）：days＝[{ day: 'YYYY-MM-DD', value, lines }]，连续的日期；颜色越深越多，0 为中性灰
  function calendar(host, cardEl, days, opts = {}) {
    const max = Math.max(0, ...days.map((d) => d.value));
    if (!(max > 0)) { empty(host, opts.empty || '这段时间还没有数据。'); return; }
    const W = widthOf(host);
    const firstDow = (new Date(`${days[0].day}T00:00:00Z`).getUTCDay() + 6) % 7;   // 周一＝0
    const weeks = Math.ceil((firstDow + days.length) / 7);
    const gap = 3;
    const m = { l: tickW('周一') + 8, t: 18 };
    const cellW = Math.max(5, Math.min(72, (W - m.l + gap) / weeks - gap));
    const cell = Math.min(24, cellW);
    const H = m.t + 7 * (cell + gap) - gap + 2;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    ['周一', '', '周三', '', '周五', '', '周日'].forEach((label, r) => { if (label) text(svg, 0, m.t + r * (cell + gap) + cell / 2 + 4, label); });
    const colorOf = (v) => (v <= 0 ? C.zero : C.ramp[Math.min(C.ramp.length - 1, Math.floor((v / max) * (C.ramp.length - 1) + 0.0001))]);
    let monthEnd = -99;
    days.forEach((d, i) => {
      const k = firstDow + i;
      const x = m.l + Math.floor(k / 7) * (cellW + gap);
      const y = m.t + (k % 7) * (cell + gap);
      const month = `${Number(d.day.slice(5, 7))} 月`;
      if ((i === 0 || d.day.slice(8) === '01') && x >= monthEnd && x + tickW(month) <= W) { text(svg, x, m.t - 6, month); monthEnd = x + tickW(month) + 8; }
      const rect = el('rect', { x, y, width: cellW, height: cell, rx: Math.min(3, cell / 4), fill: colorOf(d.value) }, svg);
      const hit = el('rect', { x: x - gap / 2, y: y - gap / 2, width: cellW + gap, height: cell + gap, class: 'ins-hit', 'aria-label': `${d.day}：${fmt(d.value)}${opts.unit || ''}` }, svg);
      bindHover(hit, cardEl, () => [`${fmt(d.value)}${opts.unit || ''}`, d.lines || [d.day]], () => { rect.setAttribute('stroke', C.ink); rect.setAttribute('stroke-width', '1.5'); }, () => rect.removeAttribute('stroke'));
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

  // 雷达图（一个人和全班平均的整体轮廓）：rows＝[{ label, short, me, avg, max, unit, note }]，每个方向各自的刻度（外圈＝这一项的满分或全班最高）
  function radar(host, cardEl, rows, opts = {}) {
    if (!opts.noKeys) keys(host, [{ name: opts.meName || '本人', color: C.series }, { name: opts.avgName || '全班平均', color: '#a39c90' }]);
    const W = widthOf(host);
    const nameOf = (d) => d.short || d.label;
    const side = Math.max(...rows.map((d) => labelW(nameOf(d))));
    const R = Math.max(60, Math.min(128, W / 2 - side - 12));
    const H = R * 2 + 46;
    const cx = W / 2; const cy = R + 23;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    const n = rows.length;
    const angle = (i) => -Math.PI / 2 + (i * Math.PI * 2) / n;
    const at = (i, ratio) => [cx + R * ratio * Math.cos(angle(i)), cy + R * ratio * Math.sin(angle(i))];
    [0.25, 0.5, 0.75, 1].forEach((ring) => el('polygon', { points: rows.map((_, i) => at(i, ring).join(',')).join(' '), fill: 'none', stroke: ring === 1 ? C.axis : C.grid, 'stroke-width': 1 }, svg));
    rows.forEach((d, i) => {
      el('line', { x1: cx, y1: cy, x2: at(i, 1)[0], y2: at(i, 1)[1], stroke: C.grid, 'stroke-width': 1 }, svg);
      const [lx, ly] = at(i, 1 + 10 / R);
      const c = Math.cos(angle(i));
      text(svg, lx, ly + 4 + Math.sin(angle(i)) * 4, nameOf(d), { class: 'is-label', 'text-anchor': c > 0.2 ? 'start' : c < -0.2 ? 'end' : 'middle' });
    });
    const ratioOf = (d, v) => { const top = Math.max(d.max || 0, d.me, d.avg) || 1; return Math.max(0, Math.min(1, v / top)); };
    [['avg', '#a39c90'], ['me', C.series]].forEach(([key, color]) => {
      el('polygon', { points: rows.map((d, i) => at(i, ratioOf(d, d[key])).join(',')).join(' '), fill: color, 'fill-opacity': 0.1, stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
      rows.forEach((d, i) => { const [x, y] = at(i, ratioOf(d, d[key])); el('circle', { cx: x, cy: y, r: 4, fill: color, stroke: C.surface, 'stroke-width': 2 }, svg); });
    });
    rows.forEach((d, i) => {
      const a0 = angle(i) - Math.PI / n; const a1 = angle(i) + Math.PI / n; const r = R + 16;
      const hit = el('path', { d: `M${cx},${cy}L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)}L${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)}Z`, class: 'ins-hit', 'aria-label': `${d.label}：本人 ${fmt(d.me)}${d.unit || ''}，全班平均 ${fmt(d.avg)}${d.unit || ''}` }, svg);
      bindHover(hit, cardEl, () => [`本人 ${fmt(d.me)}${d.unit || ''} · 全班平均 ${fmt(d.avg)}${d.unit || ''}`, [d.label, d.note || ''].filter(Boolean)]);
    });
  }

  // 进度条（只有一个比例时）：item＝{ value, max, big, note, lines }
  function meter(host, cardEl, item, opts = {}) {
    const W = widthOf(host);
    const H = 74;
    const svg = el('svg', { class: 'ins-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, host);
    text(svg, 0, 34, item.big, { style: `fill:${C.ink};font-size:30px;font-weight:700;font-variant-numeric:normal` });
    if (item.note) text(svg, W, 34, item.note, { 'text-anchor': 'end', class: 'is-label' });
    el('rect', { x: 0, y: 50, width: W, height: 12, rx: 6, fill: C.ramp[0] }, svg);
    const w = Math.max(0, Math.min(1, item.value / (item.max || 1))) * W;
    if (w > 0) el('rect', { x: 0, y: 50, width: Math.max(12, w), height: 12, rx: 6, fill: C.series }, svg);
    const hit = el('rect', { x: 0, y: 0, width: W, height: H, class: 'ins-hit', 'aria-label': `${item.big} ${item.note || ''}` }, svg);
    bindHover(hit, cardEl, () => [item.big, item.lines || []]);
  }

  // ---------- 放大看（2026-11-05 用户：“点击每张图表，可以放大显示。‘匿名建议’，点击每一条建议也可以放大显示，让学生能看得清楚”） ----------
  // lightbox(内容, { label, onKey, onClose })：全屏深色遮罩，点空白处、右上角 ×、Esc 关闭；返回 { overlay, stage, close }。匿名建议的放大也用它（live-teacher.js）
  function lightbox(content, opts = {}) {
    addStyle();
    hideActive();
    const overlay = document.createElement('div');
    overlay.className = 'ins-zoom';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', opts.label || '放大看');
    overlay.innerHTML = `<button type="button" class="ins-zoom-x" aria-label="关闭">×</button><span class="ins-zoom-hint">${opts.hint || '点空白处或按 Esc 关闭'}</span>`;
    const stage = document.createElement('div');
    stage.className = 'ins-zoom-stage';
    stage.appendChild(content);
    overlay.appendChild(stage);
    const back = document.activeElement;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (opts.onKey) opts.onKey(event);
    };
    function close() {
      if (!overlay.isConnected) return;
      hideActive();
      overlay.remove();
      root.style.overflow = overflow;
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose();
      if (back && typeof back.focus === 'function' && back.isConnected) { try { back.focus({ preventScroll: true }); } catch (error) { /* 忽略 */ } }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('.ins-zoom-x')) close(); });
    try { overlay.querySelector('.ins-zoom-x').focus({ preventScroll: true }); } catch (error) { /* 忽略 */ }
    return { overlay, stage, close };
  }
  // 图表卡片：画图函数（columns、bars……）每画一次就登记在卡片上（画在哪个容器、哪几个节点、用什么数据）；
  // 放大时复制整张卡片，按登记重新画一遍（悬停提示照常可用），再整体按比例放大到铺满屏幕，文字跟着变大
  let seq = 0;
  let replaying = false;
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  function zoomable(cardEl) {
    if (cardEl.classList.contains('is-zoomable')) return;
    cardEl.classList.add('is-zoomable');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ins-zoom-btn';
    button.title = '放大看（投屏时学生看得清楚）';
    button.innerHTML = `${ZOOM_ICON}放大`;
    cardEl.appendChild(button);
    cardEl.addEventListener('click', (event) => {
      if (event.target.closest('.ins-zoom-btn')) { openZoom(cardEl); return; }
      if (event.target.closest('a, button, summary, details, input, select, textarea, label')) return;
      if (window.getSelection && String(window.getSelection())) return;   // 正在选文字
      openZoom(cardEl);
    });
  }
  const record = (fn) => function recorded(host, cardEl, ...rest) {
    if (replaying || !host || !cardEl || !cardEl.classList || !cardEl.classList.contains('ins-card')) return fn(host, cardEl, ...rest);
    if (!host.dataset.insHost) host.dataset.insHost = String(++seq);
    const part = String(++seq);
    const before = new Set(host.childNodes);
    const out = fn(host, cardEl, ...rest);
    Array.from(host.childNodes).forEach((node) => { if (!before.has(node) && node.nodeType === 1) node.setAttribute('data-ins-part', part); });
    // 个人学情卡换人时会清空重画：只留还在卡片上的登记
    cardEl.insRenders = (cardEl.insRenders || []).filter((r) => cardEl.querySelector(`[data-ins-part="${r.part}"]`)).concat({ fn, host: host.dataset.insHost, part, rest });
    zoomable(cardEl);
    return out;
  };
  function openZoom(cardEl) {
    const clone = cardEl.cloneNode(true);
    clone.classList.remove('is-zoomable');
    clone.querySelectorAll('.ins-zoom-btn').forEach((node) => node.remove());
    clone.querySelectorAll('.ins-tip').forEach((tip) => { tip.hidden = true; });
    clone.removeAttribute('id');
    // 宽卡片先按较窄的宽度重画，放大倍数才够；窄卡片按原宽度
    const width = Math.min(cardEl.offsetWidth || 600, Math.max(560, Math.round(window.innerWidth * 0.56)));
    clone.style.width = `${width}px`;
    let observer = null;
    let onResize = null;
    const box = lightbox(clone, {
      label: `放大看：${(cardEl.querySelector('h3') || {}).textContent || '图表'}`,
      onClose: () => { if (observer) observer.disconnect(); if (onResize) window.removeEventListener('resize', onResize); },
    });
    replaying = true;
    try {
      (cardEl.insRenders || []).forEach(({ fn, host: key, part, rest }) => {
        const host = clone.matches(`[data-ins-host="${key}"]`) ? clone : clone.querySelector(`[data-ins-host="${key}"]`);
        if (!host) return;
        const old = Array.from(host.querySelectorAll(`:scope > [data-ins-part="${part}"]`));
        if (!old.length) return;
        const mark = document.createComment('');
        old[0].before(mark);
        old.forEach((node) => node.remove());
        const before = new Set(host.childNodes);
        fn(host, clone, ...rest);
        Array.from(host.childNodes).filter((node) => !before.has(node)).forEach((node) => mark.before(node));
        mark.remove();
      });
    } catch (error) {
      console.warn('[放大看]', error);
    } finally {
      replaying = false;
    }
    const fit = () => {
      clone.style.transform = '';
      const w = clone.offsetWidth;
      const h = clone.offsetHeight;
      const k = Math.max(1, Math.min((window.innerWidth - 48) / w, (window.innerHeight - 92) / h, 3));
      clone.style.transform = `scale(${k})`;
      box.stage.style.width = `${Math.round(w * k)}px`;
      box.stage.style.height = `${Math.round(h * k)}px`;
    };
    fit();
    // 展开“查看数据表”等高度变化、窗口大小变化时重新铺满（scale 不改变布局尺寸，不会反复触发）
    if (window.ResizeObserver) { observer = new ResizeObserver(() => requestAnimationFrame(fit)); observer.observe(clone); }
    onResize = () => fit();
    window.addEventListener('resize', onResize);
    return box;
  }

  window.ClassLiveInsights = {
    addStyle, card, tiles, section, keys, tableView, empty, colors: C, ordinal, lightbox, openZoom,
    lines: record(lines), treemap: record(treemap), waffle: record(waffle), segmented: record(segmented), calendar: record(calendar), radar: record(radar), meter: record(meter),
    columns: record(columns), bars: record(bars), heatmap: record(heatmap), donut: record(donut), diverging: record(diverging),
    dumbbell: record(dumbbell), scatter: record(scatter), compare: record(compare), grouped: record(grouped),
  };
})();
