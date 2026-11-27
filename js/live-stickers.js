/* 修仙表情包（2026-11-21 用户：“帮我开发一套修仙风格的表情包，可以在弹幕中发送。”）
 * 一套原创的“小修士”表情，20 个，全部在这里用 SVG 画出来（不引用任何外部图片、不借用现成作品里的形象）：
 *   同一个小修士（发髻、发簪、青色道袍、金色腰带），换眼睛、嘴、手势、道具和底下的一句话。
 * 发送：学生面板“发弹幕”旁边的“表情”——点一个就发出去（和发一条弹幕一样受“每 5 秒一条”、老师的弹幕开关和审核的约束）。
 * 存储：就是一条普通弹幕，文字是一个记号：〖符号〗（如 〖☯〗＝“悟了”），不用新的后台表和函数。
 *   记号里只有标点和符号——结算修为时“有效字”不算标点和符号（live-teacher.js 的 meaningful、后台 ck_dm_meaningful 都是），
 *   所以表情弹幕自然不计修为，网页和后台两边的规则不用改、也不会对不上。
 * 显示：投屏上飞过的弹幕、正文里的弹幕墙、工作台的弹幕记录、学生“我发过的弹幕”，都用这里的 fill／html 把记号换成图。
 *   没有加载这个脚本的旧页面上，看到的是 〖☯〗 这样的符号，不影响别的内容。
 * 对外：window.ClassLive.stickers = { list, token, only, parts, uri, img, fill, html, plain, attach }
 * 2026-11-23 晚：匿名建议、老师回复、学生回复老师也能插表情（attach：输入框旁的“表情”按钮和预览）
 */
(function () {
  'use strict';
  const Live = (window.ClassLive = window.ClassLive || {});
  const K = { skin: '#ffe3c9', line: '#3a2a22', hair: '#2f2622', robe: '#2f8177', deep: '#1f5d56', trim: '#f7efdc', sash: '#e2ac40', blush: '#f7a195',
    gold: '#f4c64e', rust: '#b9462c', red: '#b5332b', sky: '#8ec5ee', jade: '#7fd3c1', purple: '#7d59c0', smoke: '#e3e6ee', wood: '#b7793a', mouth: '#a8322a' };
  const r1 = (n) => Math.round(n * 10) / 10;
  const S = (w, color) => `stroke="${color || K.line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

  // ---------- 五官 ----------
  function eye(kind, x, y) {
    switch (kind) {
      case 'happy': return `<path d="M${x - 4.8} ${y + 1.8} Q${x} ${y - 5} ${x + 4.8} ${y + 1.8}" fill="none" ${S(2.7)}/>`;
      case 'closed': return `<path d="M${x - 4.8} ${y - 0.8} Q${x} ${y + 4.4} ${x + 4.8} ${y - 0.8}" fill="none" ${S(2.7)}/>`;
      case 'line': return `<path d="M${x - 4.8} ${y + 0.6} H${x + 4.8}" fill="none" ${S(2.7)}/>`;
      case 'star': return `<path d="M${x} ${y - 6.6} L${x + 2} ${y - 2} L${x + 6.6} ${y} L${x + 2} ${y + 2} L${x} ${y + 6.6} L${x - 2} ${y + 2} L${x - 6.6} ${y} L${x - 2} ${y - 2}Z" fill="${K.gold}" ${S(1.5)}/>`;
      case 'swirl': return `<path d="M${x - 1} ${y} a1.2 1.2 0 0 1 2.4 0 a2.4 2.4 0 0 1 -4.8 0 a3.6 3.6 0 0 1 7.2 0 a4.8 4.8 0 0 1 -9.6 0" fill="none" ${S(1.9)}/>`;
      case 'wide': return `<circle cx="${x}" cy="${y}" r="5.6" fill="#fff" ${S(2)}/><circle cx="${x}" cy="${y}" r="2" fill="${K.line}"/>`;
      case 'x': return `<path d="M${x - 3.8} ${y - 3.8} L${x + 3.8} ${y + 3.8} M${x + 3.8} ${y - 3.8} L${x - 3.8} ${y + 3.8}" fill="none" ${S(2.5)}/>`;
      case 'half': return `<path d="M${x - 5} ${y - 1.4} H${x + 5}" fill="none" ${S(2.7)}/><path d="M${x - 3.3} ${y - 1} a3.3 3.8 0 0 0 6.6 0Z" fill="${K.line}"/>`;
      case 'up': return `<ellipse cx="${x}" cy="${y - 1.4}" rx="3.5" ry="4.5" fill="${K.line}"/><circle cx="${x + 0.8}" cy="${y - 3.4}" r="1.4" fill="#fff"/>`;
      default: return `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="4.6" fill="${K.line}"/><circle cx="${x - 1.2}" cy="${y - 1.8}" r="1.4" fill="#fff"/>`;
    }
  }
  function mouth(kind) {
    switch (kind) {
      case 'open': return `<path d="M58.2 59.4 Q64 70 69.8 59.4Z" fill="${K.mouth}" ${S(2.1)}/><ellipse cx="64" cy="64.6" rx="2.6" ry="1.7" fill="#f08a80"/>`;
      case 'grin': return `<path d="M56.6 58.8 Q64 70 71.4 58.8Z" fill="#fff" ${S(2.1)}/><path d="M58.6 62.2 H69.4" fill="none" ${S(1.2)}/>`;
      case 'o': return `<ellipse cx="64" cy="62" rx="2.8" ry="3.3" fill="${K.mouth}" ${S(1.9)}/>`;
      case 'wavy': return `<path d="M57.4 62 q2.2 -3.2 4.4 0 t4.4 0 t4.4 0" fill="none" ${S(2.3)}/>`;
      case 'flat': return `<path d="M60 61.8 H68" fill="none" ${S(2.4)}/>`;
      case 'smirk': return `<path d="M59.6 60.8 Q65 64.2 70 59.2" fill="none" ${S(2.4)}/>`;
      case 'zig': return `<path d="M56.6 62.4 l2.5 -3 l2.5 3 l2.5 -3 l2.5 3 l2.5 -3" fill="none" ${S(2.1)}/>`;
      case 'sad': return `<path d="M59.4 63.6 Q64 59.2 68.6 63.6" fill="none" ${S(2.4)}/>`;
      case 'shout': return `<path d="M58 58.6 H70 Q70 69.6 64 69.6 Q58 69.6 58 58.6Z" fill="${K.mouth}" ${S(2.1)}/><path d="M59.6 60.2 H68.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`;
      default: return `<path d="M59.4 60.2 Q64 65 68.6 60.2" fill="none" ${S(2.4)}/>`;
    }
  }
  function brows(kind) {
    if (kind === 'angry') return `<path d="M48.2 42.6 L58.6 46 M79.8 42.6 L69.4 46" fill="none" ${S(2.6)}/>`;
    if (kind === 'sad') return `<path d="M48.6 45.6 L58 42.8 M79.4 45.6 L70 42.8" fill="none" ${S(2.3)}/>`;
    if (kind === 'up') return `<path d="M49 42.4 Q54 39.8 59 42.4 M69 42.4 Q74 39.8 79 42.4" fill="none" ${S(2.1)}/>`;
    return '';
  }
  // 头：o = { eyes: 一种或 [左, 右], mouth, brows, blush（默认有）, hair: 'frizz'（炸毛）, band（头带）, extra（画在脸上的东西）, tilt }
  function head(o) {
    const e = Array.isArray(o.eyes) ? o.eyes : [o.eyes, o.eyes];
    const fringe = o.hair === 'frizz'
      ? `<path d="M36 50 L30 40 L38.5 41 L33 29 L43 33.5 L41 21 L51 28 L53 15.5 L61 26 L67 14 L72 26 L80 16.5 L80.5 29 L91 22.5 L87 34 L97 31 L90.5 41.5 L98 42 L92 50 C87 41 77 37.5 70.5 38.6 C67 41.4 61 41.4 58 38.6 C51 37.5 41 41 36 50Z" fill="${K.hair}" ${S(1.6)}/>`
      : `<path d="M38 48 C37 25.6 91 25.6 90 48 C85 39.6 76.6 36.2 70.4 37.6 C67 40.6 61 40.6 57.6 37.6 C51.4 36.2 43 39.6 38 48Z" fill="${K.hair}" ${S(1.6)}/>`;
    const bun = o.hair === 'frizz' ? '' : `<circle cx="64" cy="17.6" r="9.2" fill="${K.hair}" ${S(2)}/><path d="M49.6 20.4 L78.4 15.4" fill="none" stroke="${K.line}" stroke-width="5" stroke-linecap="round"/>`
      + `<path d="M49.6 20.4 L78.4 15.4" fill="none" stroke="${K.gold}" stroke-width="2.8" stroke-linecap="round"/><circle cx="80" cy="15.1" r="2.9" fill="${K.jade}" ${S(1.2)}/>`;
    const band = o.band ? `<path d="M37.6 41.4 Q64 33.6 90.4 41.4 L90.6 46 Q64 38.4 37.4 46Z" fill="${K.rust}" ${S(1.6)}/><path d="M89.6 43.6 q9 1.6 13 8.6 M89.8 44.4 q6.4 5 7 12.6" fill="none" stroke="${K.line}" stroke-width="5.4" stroke-linecap="round"/><path d="M89.6 43.6 q9 1.6 13 8.6 M89.8 44.4 q6.4 5 7 12.6" fill="none" stroke="${K.rust}" stroke-width="3.2" stroke-linecap="round"/>` : '';
    return `<g${o.tilt ? ` transform="rotate(${o.tilt} 64 76)"` : ''}>`
      + `<path d="M37.4 50 C35.6 22.6 92.4 22.6 90.6 50 C92.2 60 89.6 66 87.6 68.6 L40.4 68.6 C38.4 66 35.8 60 37.4 50Z" fill="${K.hair}" ${S(2)}/>`
      + `<circle cx="37" cy="52.4" r="4.3" fill="${K.skin}" ${S(2)}/><circle cx="91" cy="52.4" r="4.3" fill="${K.skin}" ${S(2)}/>`
      + `<circle cx="64" cy="50" r="27" fill="${o.face || K.skin}" ${S(2.6)}/>`
      + (o.blush === false ? '' : `<ellipse cx="46" cy="58.4" rx="5" ry="3.1" fill="${K.blush}" opacity=".62"/><ellipse cx="82" cy="58.4" rx="5" ry="3.1" fill="${K.blush}" opacity=".62"/>`)
      + fringe + bun + band + brows(o.brows) + eye(e[0], 54, 52) + eye(e[1], 74, 52) + mouth(o.mouth) + (o.extra || '') + '</g>';
  }
  // 身子：站着（道袍、交领、腰带、鞋）；sit＝盘腿坐
  function body(sit) {
    if (sit) {
      return `<ellipse cx="64" cy="113" rx="40" ry="6.6" fill="#c9a36a" ${S(2.2)}/>`
        + `<path d="M46 75 C37 82 29 97 28.6 104.4 C28.4 108.6 31.6 110.6 36 110.6 L92 110.6 C96.4 110.6 99.6 108.6 99.4 104.4 C99 97 91 82 82 75 C76 79 52 79 46 75Z" fill="${K.robe}" ${S(2.6)}/>`
        + `<path d="M36 105.6 Q50 96.6 64 105.6 Q78 96.6 92 105.6" fill="none" ${S(2, K.deep)}/>`
        + `<path d="M52.4 76 L64 88.6 L75.6 76" fill="none" ${S(4.6, K.trim)}/><path d="M42.4 92.4 H85.6 V97.6 H42.4Z" fill="${K.sash}" ${S(1.6)}/>`;
    }
    return `<ellipse cx="54.4" cy="111.6" rx="7.2" ry="3.7" fill="${K.line}"/><ellipse cx="73.6" cy="111.6" rx="7.2" ry="3.7" fill="${K.line}"/>`
      + `<path d="M49 73.4 C44 76.6 41 84.6 39.6 103.6 C39.2 107.8 42 109.8 46 109.8 L82 109.8 C86 109.8 88.8 107.8 88.4 103.6 C87 84.6 84 76.6 79 73.4 C74 77.6 54 77.6 49 73.4Z" fill="${K.robe}" ${S(2.6)}/>`
      + `<path d="M64 88.6 L61.6 109.4" fill="none" ${S(1.6, K.deep)}/>`
      + `<path d="M52.4 74.6 L64 87.6 L75.6 74.6" fill="none" ${S(4.6, K.trim)}/><path d="M41.6 92.6 H86.4 V98.4 H41.6Z" fill="${K.sash}" ${S(1.6)}/>`;
  }
  // 手臂：从肩 (x1,y1) 到手 (x2,y2)，bend＝弯多少；hand：'fist' 拳、'palm' 掌、'point' 伸一根手指（朝 ax,ay 方向）、'thumb' 竖大拇指、'none' 不画手
  function arm(x1, y1, x2, y2, bend, hand, ax, ay) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const cx = r1(mx - ((y2 - y1) / len) * (bend || 0));
    const cy = r1(my + ((x2 - x1) / len) * (bend || 0));
    const d = `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
    const ux = (x2 - cx) / (Math.hypot(x2 - cx, y2 - cy) || 1);
    const uy = (y2 - cy) / (Math.hypot(x2 - cx, y2 - cy) || 1);
    let s = `<path d="${d}" fill="none" stroke="${K.line}" stroke-width="13.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${K.robe}" stroke-width="8.4" stroke-linecap="round"/>`;
    if (hand === 'none') return s;
    s += `<circle cx="${r1(x2 - ux * 2.6)}" cy="${r1(y2 - uy * 2.6)}" r="6.3" fill="${K.trim}" ${S(1.8)}/>`;
    const hx = r1(x2 + ux * 2.4);
    const hy = r1(y2 + uy * 2.4);
    if (hand === 'point' || hand === 'thumb') {
      const fx = ax == null ? 0 : ax;
      const fy = ay == null ? -1 : ay;
      const L = hand === 'thumb' ? 7.4 : 9.6;
      s += `<path d="M${hx} ${hy} l${r1(fx * L)} ${r1(fy * L)}" fill="none" stroke="${K.line}" stroke-width="6.6" stroke-linecap="round"/><path d="M${hx} ${hy} l${r1(fx * L)} ${r1(fy * L)}" fill="none" stroke="${K.skin}" stroke-width="3.6" stroke-linecap="round"/>`;
    }
    s += `<circle cx="${hx}" cy="${hy}" r="${hand === 'palm' ? 6 : 5.2}" fill="${K.skin}" ${S(2.1)}/>`;
    if (hand === 'palm') s += `<path d="M${r1(hx - 2.6)} ${r1(hy - 1.4)} v-3.4 M${hx} ${r1(hy - 1.8)} v-3.8 M${r1(hx + 2.6)} ${r1(hy - 1.4)} v-3.4" fill="none" ${S(1.3)}/>`;
    return s;
  }
  const armsDown = () => arm(46.4, 80, 37.6, 98, -3, 'fist') + arm(81.6, 80, 90.4, 98, 3, 'fist');

  // ---------- 小物件 ----------
  const spark = (x, y, s, color) => `<path d="M${x} ${r1(y - 7 * s)} L${r1(x + 2 * s)} ${r1(y - 2 * s)} L${r1(x + 7 * s)} ${y} L${r1(x + 2 * s)} ${r1(y + 2 * s)} L${x} ${r1(y + 7 * s)} L${r1(x - 2 * s)} ${r1(y + 2 * s)} L${r1(x - 7 * s)} ${y} L${r1(x - 2 * s)} ${r1(y - 2 * s)}Z" fill="${color || K.gold}" ${S(1.5)}/>`;
  const sweat = (x, y, s) => `<path d="M${x} ${y} q${r1(-4.4 * (s || 1))} ${r1(6.6 * (s || 1))} 0 ${r1(9 * (s || 1))} q${r1(4.4 * (s || 1))} ${r1(-2.4 * (s || 1))} 0 ${r1(-9 * (s || 1))}Z" fill="${K.sky}" ${S(1.5)}/>`;
  const puff = (x, y, s, fill) => `<path d="M${r1(x - 9 * s)} ${r1(y + 4 * s)} a${r1(5 * s)} ${r1(5 * s)} 0 0 1 ${r1(2 * s)} ${r1(-9 * s)} a${r1(7 * s)} ${r1(7 * s)} 0 0 1 ${r1(13 * s)} ${r1(-1 * s)} a${r1(5 * s)} ${r1(5 * s)} 0 0 1 ${r1(3 * s)} ${r1(10 * s)}Z" fill="${fill || '#fff'}" ${S(1.8)}/>`;
  const qmark = (x, y, s, color) => `<text x="${x}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="${r1(22 * s)}" fill="${color || K.rust}" stroke="${K.line}" stroke-width="1.1" paint-order="stroke">?</text>`;
  const bolt = (x, y, s) => `<path d="M${x} ${y} l${r1(-9 * s)} ${r1(20 * s)} l${r1(7 * s)} ${r1(-1 * s)} l${r1(-6 * s)} ${r1(18 * s)} l${r1(17 * s)} ${r1(-25 * s)} l${r1(-8 * s)} ${r1(1 * s)} l${r1(6 * s)} ${r1(-13 * s)}Z" fill="${K.gold}" ${S(1.9)}/>`;
  const taiji = (x, y, R) => `<circle cx="${x}" cy="${y}" r="${R}" fill="#fff" ${S(1.8)}/><path d="M${x} ${r1(y - R)} a${R} ${R} 0 0 1 0 ${r1(2 * R)} a${r1(R / 2)} ${r1(R / 2)} 0 0 1 0 ${-R} a${r1(R / 2)} ${r1(R / 2)} 0 0 0 0 ${-R}Z" fill="${K.line}"/>`
    + `<circle cx="${x}" cy="${r1(y - R / 2)}" r="${r1(R / 6.5)}" fill="${K.line}"/><circle cx="${x}" cy="${r1(y + R / 2)}" r="${r1(R / 6.5)}" fill="#fff"/>`;
  const rays = (x, y, a, b, n, color, w) => Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * 2 * i) / n - Math.PI / 2;
    return `<path d="M${r1(x + Math.cos(t) * a)} ${r1(y + Math.sin(t) * a)} L${r1(x + Math.cos(t) * b)} ${r1(y + Math.sin(t) * b)}" fill="none" stroke="${color || K.gold}" stroke-width="${w || 3}" stroke-linecap="round"/>`;
  }).join('');
  const flame = (x, y, s, outer, inner) => `<path d="M${x} ${y} c${r1(-9 * s)} ${r1(-6 * s)} ${r1(-7 * s)} ${r1(-15 * s)} ${r1(-1 * s)} ${r1(-22 * s)} c${r1(1 * s)} ${r1(6 * s)} ${r1(4 * s)} ${r1(7 * s)} ${r1(5 * s)} ${r1(3 * s)} c${r1(6 * s)} ${r1(7 * s)} ${r1(5 * s)} ${r1(14 * s)} ${r1(-4 * s)} ${r1(19 * s)}Z" fill="${outer || '#f08a3c'}" ${S(1.6)}/>`
    + `<path d="M${x} ${r1(y - 1.5 * s)} c${r1(-4 * s)} ${r1(-3 * s)} ${r1(-3 * s)} ${r1(-8 * s)} ${r1(0.5 * s)} ${r1(-11 * s)} c${r1(3 * s)} ${r1(4 * s)} ${r1(3 * s)} ${r1(8 * s)} ${r1(-0.5 * s)} ${r1(11 * s)}Z" fill="${inner || K.gold}"/>`;
  const cap = (text, color, size) => `<text x="64" y="124.6" text-anchor="middle" font-family="'STKaiti','Kaiti SC','KaiTi','楷体','FZKai-Z03',serif" font-weight="900" font-size="${size || (text.length >= 6 ? 15.6 : text.length === 5 ? 18 : text.length === 4 ? 21 : 24)}" fill="${color || K.red}" stroke="#fff" stroke-width="4.6" paint-order="stroke" stroke-linejoin="round" letter-spacing="${text.length >= 6 ? 0 : 1}">${text}</text>`;
  const man = (inner, t) => `<g transform="${t || 'translate(3.8 -3.4) scale(.94)'}">${inner}</g>`;

  // ---------- 二十个表情 ----------
  // code：记号里的符号（只用标点和符号，见文件头）；name：名字（选表情时显示、导出记录时用）；tip：什么时候用
  const ART = {
    wule: () => rays(64, 44, 34, 46, 14, K.gold, 3) + `<circle cx="64" cy="44" r="33" fill="#fff6d6" opacity=".9"/>`
      + man(body() + arm(46.4, 80, 37.6, 98, -3, 'fist') + arm(81.6, 80, 98, 60, 5, 'point', 0.1, -1) + head({ eyes: 'star', mouth: 'open', brows: 'up' }))
      + taiji(100, 30, 9.5) + spark(22, 30, 0.9) + spark(108, 78, 0.7) + cap('悟了！'),
    shoujiao: () => man(body() + head({ eyes: 'closed', mouth: 'smile', tilt: 7 }) + arm(46.4, 80, 60.4, 91.6, 7, 'fist') + arm(81.6, 80, 67.6, 91.6, -7, 'fist'))
      + spark(20, 44, 0.8) + spark(106, 40, 0.65) + `<path d="M22 74 q5 -5 10 0 M96 70 q5 -5 10 0" fill="none" ${S(2, K.rust)}/>` + cap('受教了', K.deep),
    miaoa: () => man(body() + arm(46.4, 80, 37.6, 98, -3, 'fist') + arm(81.6, 80, 100, 68, 4, 'thumb', 0.05, -1) + head({ eyes: 'happy', mouth: 'grin' }))
      + spark(18, 34, 0.95) + spark(108, 36, 0.8, '#ff9f6b') + spark(24, 84, 0.6, '#ff9f6b') + cap('妙啊！'),
    qiujie: () => man(body() + arm(46.4, 80, 37.6, 98, -3, 'fist') + head({ eyes: 'up', mouth: 'o', brows: 'sad', tilt: -6 }) + arm(81.6, 80, 91, 39, -9, 'fist'))
      + qmark(96, 30, 1.2) + qmark(15, 44, 0.9, K.gold) + qmark(107, 62, 0.75, K.purple) + cap('求解惑', K.purple),
    liubu: () => `<path d="M100 44 l12 -6 M104 62 h14 M100 80 l12 6" fill="none" ${S(3, K.rust)}/>`
      + man(body() + arm(46.4, 80, 38.6, 97, -3, 'fist') + head({ eyes: 'dot', mouth: 'shout', brows: 'angry' }) + arm(81.6, 80, 101, 66, -4, 'palm'), 'translate(-2.6 -3.4) scale(.94)') + cap('道友留步'),
    biguan: () => `<path d="M24 60 q-9 -18 6 -32 M104 60 q9 -18 -6 -32 M36 36 q28 -22 56 0" fill="none" stroke="${K.jade}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 7"/>`
      + man(body(true) + arm(46.4, 81, 44, 100, -4, 'fist') + arm(81.6, 81, 84, 100, 4, 'fist') + head({ eyes: 'line', mouth: 'flat' }))
      + spark(102, 22, 0.6, K.jade) + spark(24, 26, 0.5, K.jade) + cap('闭关中', K.deep),
    dujie: () => `<path d="M22 27 a12 12 0 0 1 14 -13 a15 15 0 0 1 27 -3 a14 14 0 0 1 25 4 a11 11 0 0 1 16 11 a9 9 0 0 1 -7 14 L28 40 a9 9 0 0 1 -6 -13Z" fill="#6b7088" ${S(2.2)}/>`
      + man(body() + armsDown() + head({ eyes: 'wide', mouth: 'wavy', hair: 'frizz', blush: false, face: '#ffe9d6' }), 'translate(7 6) scale(.89)')
      + bolt(60, 30, 1.02) + bolt(100, 38, 0.55) + bolt(26, 40, 0.5) + `<path d="M20 92 l5 -4 M108 96 l-5 -4 M16 76 l6 1" fill="none" ${S(2.2, K.gold)}/>` + cap('渡劫中', '#4b5078'),
    tupo: () => rays(64, 58, 44, 58, 16, K.gold, 3.4) + `<ellipse cx="64" cy="112" rx="20" ry="3.6" fill="${K.line}" opacity=".22"/>`
      + man(body() + arm(46.4, 80, 30, 60, 5, 'fist') + arm(81.6, 80, 98, 60, -5, 'fist') + head({ eyes: 'happy', mouth: 'open', brows: 'up' }), 'translate(3.8 -9) scale(.94)')
      + spark(20, 26, 0.9) + spark(108, 26, 0.9) + cap('突破啦！'),
    rumo: () => flame(28, 92, 1.5, '#8f63d6', '#d9c2ff') + flame(100, 92, 1.5, '#8f63d6', '#d9c2ff') + flame(64, 20, 1.1, '#8f63d6', '#d9c2ff')
      + man(body() + armsDown() + head({ eyes: 'swirl', mouth: 'zig', blush: false, face: '#efe0f6' }), 'translate(3.8 -1) scale(.94)')
      + puff(26, 28, 0.9, K.smoke) + puff(102, 30, 0.8, K.smoke) + cap('走火入魔', K.purple),
    buwen: () => `<path d="M17 50 q-5 5 0 10 q5 5 0 10 M111 50 q5 5 0 10 q-5 5 0 10 M27 30 q-4 3 -1 8 M101 30 q4 3 1 8" fill="none" ${S(2.4, K.sky)}/>`
      + man(body() + arm(46.4, 80, 56, 92, 6, 'fist') + arm(81.6, 80, 72, 92, -6, 'fist') + head({ eyes: 'dot', mouth: 'wavy', brows: 'sad', blush: false, face: '#f3ecea' }))
      + sweat(94, 30, 1) + sweat(32, 22, 0.8) + cap('道心不稳', '#40688f'),
    wenle: () => `<path d="M14 84 q10 -6 20 0 q10 6 20 0 M74 88 q10 -6 20 0 q10 6 20 0" fill="none" stroke="${K.jade}" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`
      + man(arm(46.4, 80, 43, 97, 3, 'none') + arm(81.6, 80, 85, 97, -3, 'none') + body() + head({ eyes: 'half', mouth: 'smirk', brows: 'up', tilt: -4 }))
      + spark(104, 34, 0.75) + spark(22, 40, 0.55) + cap('稳了', K.deep),
    bale: () => `<path d="M82 22 v9 M89 20 v11 M96 23 v8" fill="none" ${S(2.2, '#6f86b0')}/>`
      + man(body() + arm(46.4, 80, 37.6, 98, -3, 'fist') + head({ eyes: 'closed', mouth: 'sad', brows: 'sad', tilt: 6, blush: false }) + arm(81.6, 80, 74, 40, -19, 'palm'))
      + puff(20, 70, 0.75, K.smoke) + cap('罢了罢了', '#5b6a86'),
    gaojian: () => man(body() + head({ eyes: 'star', mouth: 'open', brows: 'up' }) + arm(46.4, 80, 58.6, 78, 8, 'fist') + arm(81.6, 80, 69.4, 78, -8, 'fist'))
      + spark(18, 28, 1) + spark(110, 30, 0.85, '#ff9f6b') + spark(20, 78, 0.6, '#ff9f6b') + spark(108, 74, 0.7) + cap('前辈高见'),
    liandan: () => man(body() + arm(81.6, 80, 91, 97, 3, 'fist') + head({ eyes: 'dot', mouth: 'flat', brows: 'angry' }) + arm(46.4, 80, 36, 76, -3, 'fist')
        + `<path d="M36 76 L20 62" fill="none" ${S(2.6, '#8a5a1a')}/><path d="M22 66 C8 62 6 46 18 40 C30 38 34 52 26 64Z" fill="#e9d7a0" ${S(2)}/><path d="M22 64 L16 46 M22 64 L24 46" fill="none" ${S(1.2, '#a8894a')}/>`, 'translate(40 2) scale(.8)')
      + flame(24, 114, 0.85) + flame(38, 115, 1) + flame(52, 114, 0.85)
      + `<path d="M22 98 l-3 10 M54 98 l3 10 M38 100 v9" fill="none" ${S(4.2)}/><ellipse cx="38" cy="84" rx="22" ry="17" fill="${K.wood}" ${S(2.4)}/><path d="M17 78 q-7 2 -5 9 M59 78 q7 2 5 9" fill="none" ${S(3.2)}/>`
      + `<path d="M20 72 Q38 62 56 72 Q38 77 20 72Z" fill="#8f5a26" ${S(2.2)}/><circle cx="38" cy="64" r="3.6" fill="${K.gold}" ${S(1.8)}/><circle cx="38" cy="87" r="6.4" fill="#ffb347" ${S(1.8)}/><circle cx="38" cy="87" r="2.6" fill="#fff3b0"/>`
      + `<path d="M30 56 q-7 -8 1 -15 q8 -7 1 -16 M46 54 q7 -7 0 -14" fill="none" stroke="${K.line}" stroke-width="5.6" stroke-linecap="round"/><path d="M30 56 q-7 -8 1 -15 q8 -7 1 -16 M46 54 q7 -7 0 -14" fill="none" stroke="${K.smoke}" stroke-width="3.2" stroke-linecap="round"/>`
      + cap('炼丹中', '#8a4b12'),
    yujian: () => `<path d="M6 60 h16 M2 74 h20 M8 88 h14" fill="none" ${S(3, K.sky)}/>` + puff(18, 104, 0.8) + puff(104, 106, 0.7)
      + `<g transform="rotate(-9 64 100)"><path d="M26 96 L104 96 L116 100 L104 104 L26 104Z" fill="#e6f0f7" ${S(2.3)}/><path d="M32 100 H108" fill="none" ${S(1.2, '#9fb4c6')}/><path d="M22 92 v16" fill="none" ${S(4.6)}/><path d="M22 92 v16" fill="none" stroke="${K.gold}" stroke-width="2.4" stroke-linecap="round"/><path d="M12 100 h10" fill="none" ${S(5)}/><path d="M12 100 h10" fill="none" stroke="${K.rust}" stroke-width="2.8" stroke-linecap="round"/></g>`
      + man(body() + arm(46.4, 80, 34, 88, -3, 'fist') + arm(81.6, 80, 96, 74, 3, 'point', 1, -0.2) + head({ eyes: 'dot', mouth: 'smirk', brows: 'angry', tilt: 5 }), 'translate(14 -3) scale(.8)') + cap('御剑赶到', '#2f6f9f'),
    gaoci: () => `<path d="M100 56 h14 M104 68 h14 M100 80 h12" fill="none" ${S(3, K.sky)}/>`
      + man(body() + arm(81.6, 80, 90.4, 98, 3, 'fist') + head({ eyes: 'closed', mouth: 'smile', tilt: -5 }) + arm(46.4, 80, 30, 58, 5, 'palm'), 'translate(6 -12) scale(.8)')
      + `<path d="M22 98 a11 11 0 0 1 13 -12 a14 14 0 0 1 25 -3 a13 13 0 0 1 23 3 a11 11 0 0 1 15 10 a9 9 0 0 1 -5 16 L28 112 a9 9 0 0 1 -6 -14Z" fill="#fff" ${S(2.3)}/><path d="M34 104 q8 5 16 0 M62 105 q8 5 16 0" fill="none" ${S(1.8, '#a9c6de')}/>`
      + cap('告辞', '#2f6f9f'),
    jiayou: () => flame(22, 96, 1.6) + flame(106, 96, 1.6) + flame(40, 108, 1) + flame(88, 108, 1)
      + man(body() + arm(46.4, 80, 39, 95, -5, 'fist') + arm(81.6, 80, 99, 56, -6, 'fist') + head({ eyes: 'dot', mouth: 'shout', brows: 'angry', band: true }))
      + `<path d="M106 40 l7 -5 M110 50 l8 -1 M100 32 l4 -7" fill="none" ${S(2.6, K.rust)}/>` + cap('道友加油'),
    haojin: () => `<ellipse cx="56" cy="103" rx="44" ry="4.6" fill="${K.line}" opacity=".16"/>`
      + man(body() + armsDown() + head({ eyes: 'x', mouth: 'o', blush: false, face: '#f6ece6' }), 'translate(13 123) rotate(-90) scale(.72)')
      + `<path d="M96 60 q-10 -6 -4 -17 q7 -11 -3 -19 q15 2 15 15 q0 9 5 12 q-5 8 -13 9Z" fill="#fff" ${S(2)} opacity=".95"/><circle cx="97" cy="42" r="1.6" fill="${K.line}"/><circle cx="103" cy="43" r="1.6" fill="${K.line}"/><ellipse cx="100" cy="48.4" rx="1.8" ry="2.4" fill="${K.line}"/>`
      + `<rect x="14" y="20" width="44" height="13" rx="4" fill="#fff" ${S(2)}/><rect x="17" y="23" width="6" height="7" rx="1.6" fill="${K.red}"/><rect x="58" y="24" width="3.6" height="5" rx="1" fill="${K.line}"/>`
      + cap('灵力耗尽', '#5b6a86'),
    tianji: () => `<g opacity=".92"><circle cx="64" cy="48" r="43" fill="#f4eeff" ${S(1.8, K.purple)}/>` + rays(64, 48, 36, 42, 8, K.purple, 3.4) + '</g>'
      + man(body() + arm(46.4, 80, 37.6, 98, -3, 'fist') + head({ eyes: ['happy', 'dot'], mouth: 'smile' }) + arm(81.6, 80, 68, 70, -10, 'point', -0.12, -1))
      + spark(20, 26, 0.75, '#c9aef5') + spark(108, 84, 0.7, '#c9aef5') + cap('天机不可泄露', K.purple),
    jingguan: () => man(body(true) + head({ eyes: 'half', mouth: 'smile', tilt: -4 }) + arm(46.4, 81, 58, 92, 7, 'fist') + arm(81.6, 81, 72, 92, -7, 'fist')
        + `<path d="M55.6 84 h18.8 l-2.2 11 q-7.2 3.4 -14.4 0Z" fill="#fff" ${S(2)}/><path d="M57.4 87.4 h15.2" fill="none" ${S(1.6, '#7aa98f')}/>`)
      + `<path d="M98 86 q-5 -6 0 -11 q5 -5 0 -10 M108 90 q5 -6 0 -11" fill="none" stroke="${K.line}" stroke-width="4.6" stroke-linecap="round" opacity=".45"/><path d="M98 86 q-5 -6 0 -11 q5 -5 0 -10 M108 90 q5 -6 0 -11" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`
      + spark(22, 36, 0.6, K.jade)
      + cap('静观其变', K.deep),
  };
  const LIST = [
    { key: 'wule', code: '☯', name: '悟了', tip: '听懂了、想通了' },
    { key: 'shoujiao', code: '✍', name: '受教了', tip: '谢谢老师和同学的讲解' },
    { key: 'miaoa', code: '✿', name: '妙啊', tip: '这个说法、这个例子真好' },
    { key: 'gaojian', code: '★', name: '前辈高见', tip: '佩服，说到点子上了' },
    { key: 'qiujie', code: '❓', name: '求解惑', tip: '这里没听懂，想再听一遍' },
    { key: 'liubu', code: '✋', name: '道友留步', tip: '等一下，我有话说' },
    { key: 'biguan', code: '⛰', name: '闭关中', tip: '正在专心想、专心做题' },
    { key: 'liandan', code: '⚗', name: '炼丹中', tip: '答案还在酝酿，马上就好' },
    { key: 'dujie', code: '⚡', name: '渡劫中', tip: '这道题有点难，正在硬扛' },
    { key: 'tupo', code: '⬆', name: '突破啦', tip: '做对了、过关了' },
    { key: 'wenle', code: '⚓', name: '稳了', tip: '这题有把握' },
    { key: 'jiayou', code: '✊', name: '道友加油', tip: '给台上、给同组的同学鼓劲' },
    { key: 'buwen', code: '〰', name: '道心不稳', tip: '有点紧张、拿不准' },
    { key: 'rumo', code: '♨', name: '走火入魔', tip: '越想越乱，绕晕了' },
    { key: 'bale', code: '✖', name: '罢了罢了', tip: '想岔了，重新来' },
    { key: 'haojin', code: '☾', name: '灵力耗尽', tip: '脑子用完了，缓一缓' },
    { key: 'yujian', code: '⚔', name: '御剑赶到', tip: '我来了、我跟上了' },
    { key: 'jingguan', code: '☕', name: '静观其变', tip: '先听听大家怎么说' },
    { key: 'tianji', code: '☝', name: '天机不可泄露', tip: '答案先不说，自己想' },
    { key: 'gaoci', code: '☁', name: '告辞', tip: '下课了，下次见' },
  ];
  const BY_KEY = new Map(LIST.map((s) => [s.key, s]));
  const BY_CODE = new Map(LIST.map((s) => [s.code, s]));
  const OPEN = '〖';
  const CLOSE = '〗';
  // 记号：〖符号〗；从输入法带进来的变体选择符（U+FE0F）不影响识别
  const TOKEN = new RegExp(`${OPEN}([^${OPEN}${CLOSE}\\s]{1,2})\\uFE0F?${CLOSE}`, 'gu');
  const token = (key) => (BY_KEY.has(key) ? `${OPEN}${BY_KEY.get(key).code}${CLOSE}` : '');
  const strip = (code) => String(code || '').replace(/️/g, '');
  // 把一段文字拆成 [{ text } | { sticker }]；不认识的记号原样留在文字里
  function parts(text) {
    const out = [];
    const source = String(text == null ? '' : text);
    let at = 0;
    source.replace(TOKEN, (all, code, index) => {
      const sticker = BY_CODE.get(strip(code));
      if (!sticker) return all;
      if (index > at) out.push({ text: source.slice(at, index) });
      out.push({ sticker });
      at = index + all.length;
      return all;
    });
    if (at < source.length) out.push({ text: source.slice(at) });
    return out;
  }
  const has = (text) => parts(text).some((p) => p.sticker);
  // 整条弹幕就是一个表情（前后只有空白）时返回这个表情，否则 null——投屏上这样的弹幕画成一张大图
  function only(text) {
    const list = parts(text).filter((p) => p.sticker || p.text.trim());
    return list.length === 1 && list[0].sticker ? list[0].sticker : null;
  }
  // 白边：同一份图形先用白色粗线描一遍垫在底下（像贴纸的白边，放在深色、浅色背景上都看得清）
  const STYLE = '<style>.o *{stroke:#fff!important;stroke-width:8px!important;stroke-linejoin:round;stroke-linecap:round;fill:#fff!important;opacity:1!important}.o [fill="none"]{fill:none!important}.o text{stroke-width:9px!important}</style>';
  const svgCache = new Map();
  function svg(key) {
    if (!ART[key]) return '';
    if (!svgCache.has(key)) {
      const art = ART[key]();
      svgCache.set(key, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${STYLE}<g class="o">${art}</g><g>${art}</g></svg>`);
    }
    return svgCache.get(key);
  }
  const uriCache = new Map();
  function uri(key) {
    if (!uriCache.has(key)) uriCache.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(key))}`);
    return uriCache.get(key);
  }
  const escAttr = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escText = escAttr;
  // 一张表情图（元素）；size 不给就由样式定
  function img(key, size, className) {
    const s = BY_KEY.get(key);
    const el = document.createElement('img');
    el.className = className || 'stk';
    el.src = uri(key);
    el.alt = s ? `[${s.name}]` : '';
    if (s) el.title = s.name;
    el.decoding = 'async';
    el.draggable = false;
    if (size) { el.width = size; el.height = size; }
    return el;
  }
  // 往一个元素里放一段弹幕文字：文字照原样，表情记号换成图（inline 小图）。不用 innerHTML，学生写的内容只当文字
  function fill(node, text, className, size) {
    parts(text).forEach((p) => node.appendChild(p.sticker ? img(p.sticker.key, size, className || 'stk') : document.createTextNode(p.text)));
    return node;
  }
  // 同上，返回 HTML 字符串（文字已转义）：给用 innerHTML 拼表格的地方（工作台）用
  function html(text, size, className) {
    return parts(text).map((p) => (p.sticker
      ? `<img class="${escAttr(className || 'stk')}" src="${escAttr(uri(p.sticker.key))}" alt="[${escAttr(p.sticker.name)}]" title="${escAttr(p.sticker.name)}"${size ? ` width="${size}" height="${size}"` : ''} draggable="false">`
      : escText(p.text))).join('');
  }
  // 纯文字的地方（导出表格、提示里的引用、搜索）：记号换成 [表情·悟了]
  const plain = (text) => parts(text).map((p) => (p.sticker ? `[表情·${p.sticker.name}]` : p.text)).join('');

  // 往输入框里插表情（2026-11-23 用户：“匿名建议和老师回复都可以使用修仙小道士的表情包”）：
  // 输入框旁一个“表情”按钮，点开一排表情，点哪个就把记号插到光标处（可以连插几个，再点“表情”收起）；
  // 写了表情时输入框下面出现“预览”，把记号画成图。存的仍是记号〖符号〗，后台不用改。
  // attach(输入框, { host: 放按钮的元素, after: 表情盘和预览插在它后面（默认输入框） }) → { button, tray, preview, refresh }
  // 程序清空输入框以后调一下 refresh()，预览跟着收起。输入框 disabled／readonly 时按钮也不能点
  // 选择器前面加 body、写明 button：放在别人的表单里（如回复框的 .clp-fbr-form button 深绿按钮样式）也不被盖掉
  const PICK_CSS = `
  body button.stk-pick { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; width: auto; min-width: 0; height: auto; min-height: 0; margin: 0;
    padding: 2px 11px 2px 3px; border: 1.5px solid rgba(184,134,43,.6); border-radius: 999px; background: #fffaf0; color: #8a5a10; box-shadow: none; text-shadow: none;
    font: 700 13px/1.25 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
  body button.stk-pick img { width: 26px; height: 26px; }
  body button.stk-pick:hover:not([disabled]) { border-color: #b8801a; background: #fff3d6; }
  body button.stk-pick[aria-expanded="true"] { background: #f2c64f; border-color: #b8801a; color: #3e2400; }
  body button.stk-pick[disabled] { opacity: .5; cursor: default; }
  body .stk-tray { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 4px; margin: 6px 0 0; padding: 6px; border: 1.5px solid rgba(184,134,43,.45);
    border-radius: 12px; background: #fffaf0; max-height: 340px; overflow: auto; }   /* 2026-11-27 放大（原来 62px 一格、图 44px，学生说看不清是哪个表情） */
  body .stk-tray[hidden] { display: none; }
  body .stk-tray .stk-tray-head { grid-column: 1 / -1; margin: 0 4px 2px; color: #8a7f74; font: 12.5px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  body .stk-tray button.stk-cell { display: grid; justify-items: center; width: auto; min-width: 0; height: auto; min-height: 0; margin: 0; padding: 3px 2px 2px; border: 0; border-radius: 10px;
    background: transparent; color: inherit; box-shadow: none; text-shadow: none; cursor: pointer; font: inherit; }
  body .stk-tray button.stk-cell:hover, body .stk-tray button.stk-cell:focus-visible { background: rgba(242,198,79,.28); outline: none; }
  body .stk-tray button.stk-cell img { width: 72px; height: 72px; }
  body .stk-tray button.stk-cell small { display: block; color: #6d5a3a; font: 11.5px/1.3 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; }
  body .stk-preview { margin: 6px 0 0; padding: 6px 10px; border: 1px dashed rgba(184,134,43,.55); border-radius: 10px; background: #fff; color: #2a2118;
    font: 14px/2.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: pre-wrap; overflow-wrap: anywhere; }
  body .stk-preview[hidden] { display: none; }
  body .stk-preview > b { margin-right: 6px; color: #8a5a10; font-size: 12px; }
  .stk-inline { width: 3em; height: 3em; margin: -.6em 1px; vertical-align: middle; }`;   /* 2026-11-27 2em→3em */
  function ensureCss() {
    if (document.getElementById('stk-pick-css') || !document.head) return;
    const style = document.createElement('style');
    style.id = 'stk-pick-css';
    style.textContent = PICK_CSS;
    document.head.appendChild(style);
  }
  function attach(area, opts = {}) {
    if (!area || area.dataset.stk) return null;
    area.dataset.stk = '1';
    ensureCss();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stk-pick';
    button.title = '插入表情';
    button.setAttribute('aria-expanded', 'false');
    button.appendChild(img('wule', 26, ''));
    button.appendChild(document.createTextNode('表情'));
    const tray = document.createElement('div');
    tray.className = 'stk-tray';
    tray.hidden = true;
    tray.setAttribute('role', 'group');
    tray.setAttribute('aria-label', '选一个表情插入');
    const preview = document.createElement('div');
    preview.className = 'stk-preview';
    preview.hidden = true;
    preview.setAttribute('aria-hidden', 'true');
    (opts.host || area.parentNode).appendChild(button);
    const after = opts.after || area;
    after.insertAdjacentElement('afterend', preview);
    after.insertAdjacentElement('afterend', tray);
    const refresh = () => {
      const value = area.value || '';
      if (!has(value)) { preview.hidden = true; preview.replaceChildren(); return; }
      preview.replaceChildren();
      const label = document.createElement('b');
      label.textContent = '预览';
      preview.appendChild(label);
      fill(preview, value, 'stk-inline');
      preview.hidden = false;
    };
    const insert = (key) => {
      const tok = token(key);
      const max = area.maxLength > 0 ? area.maxLength : Infinity;
      if (!tok || area.value.length + tok.length > max) return;
      const start = typeof area.selectionStart === 'number' ? area.selectionStart : area.value.length;
      const end = typeof area.selectionEnd === 'number' ? area.selectionEnd : start;
      area.focus();
      area.setRangeText(tok, start, end, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const build = () => {
      const head = document.createElement('p');
      head.className = 'stk-tray-head';
      head.textContent = '点一个就插到光标处，可以连插几个；再点“表情”收起';
      tray.appendChild(head);
      LIST.forEach((s) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'stk-cell';
        cell.title = `${s.name}：${s.tip}`;
        cell.setAttribute('aria-label', `插入表情：${s.name}`);
        cell.appendChild(img(s.key, 72, ''));
        const cap = document.createElement('small');
        cap.textContent = s.name;
        cell.appendChild(cap);
        cell.addEventListener('mousedown', (event) => event.preventDefault());   // 不让输入框失去光标位置
        cell.addEventListener('click', () => insert(s.key));
        tray.appendChild(cell);
      });
    };
    const setOpen = (open) => {
      if (open && !tray.childElementCount) build();
      tray.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => setOpen(tray.hidden));
    area.addEventListener('input', refresh);
    const sync = () => {
      button.disabled = area.disabled || area.readOnly;
      if (button.disabled) setOpen(false);
    };
    new MutationObserver(sync).observe(area, { attributes: true, attributeFilter: ['disabled', 'readonly'] });
    sync();
    refresh();
    const handle = { button, tray, preview, refresh, close: () => setOpen(false) };
    area.stkPicker = handle;
    return handle;
  }

  ensureCss();   // 正文里画成图的表情（.stk-inline）也用这份样式
  Live.stickers = { list: LIST, token, parts, has, only, svg, uri, img, fill, html, plain, attach };
})();
