/* 弹幕法宝画面（投屏页 live-danmaku.js 与学生页 live-student.js 共用）：
 *   window.ClassLiveGifts.play({ gift, sealName, who, layer, fit })：播放一件法宝（gift 取自 ClassLive.GIFTS），约 3.2 秒后自动移除；
 *     sealName＝名牌印章上的境界名，who＝名牌第一行（“某某　祭出”），layer＝放画面的容器（不给就用自带的全屏层），
 *     fit＝'wide'（投屏：整幅 1280×720 等比放进屏幕）或 'narrow'（学生页：两侧可略裁，手机上更大）。
 *   window.ClassLiveGifts.preload()：预先取回并解密法宝底图（投屏页用；学生页需要时才取）。
 * 风雷翅、掌天瓶的底图（tools/gift_art 加工、AES-GCM 加密）钥匙在 CLASS_LIVE_CONFIG.giftArt，只写进加密页面；取不到时用矢量画面。
 * 改了这里的画面，用 tools/gift_art/sync_canvas.mjs 同步 Claude Design 画布。
 */
(function () {
  'use strict';
  if (window.ClassLiveGifts) return;
  const config = window.CLASS_LIVE_CONFIG || {};
  const style = document.createElement('style');
  style.textContent = `
  @keyframes dm-flowtext { from { background-position: 0% 50%; } to { background-position: 300% 50%; } }
  /* ---------- 法宝画面：全屏暗幕＋1280×720 场景（按屏幕等比缩放）＋法宝名牌，约 3.2 秒（课上常有，不宜久挡） ---------- */
  .dm-gifts { position: fixed; inset: 0; z-index: 302; overflow: hidden; pointer-events: none; }
  .dm-gift { position: absolute; inset: 0; animation: dm-g-life 3.2s ease forwards; }
  @keyframes dm-g-life { 0% { opacity: 0; } 7% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; } }
  .dm-g-veil { position: absolute; inset: 0; }
  .dm-g-box { position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px; transform: translate(-50%, -50%) scale(var(--dm-scale, 1)); }
  .dm-g-box * { box-sizing: content-box; }
  .dm-g-plate { position: absolute; left: 50%; bottom: 58px; display: flex; align-items: center; gap: 22px; padding: 16px 34px 16px 18px; border: 1px solid #c9a24a; border-radius: 10px;
    background: rgba(16,13,10,.9); box-shadow: inset 0 0 0 4px rgba(16,13,10,.9), inset 0 0 0 5px rgba(201,162,74,.55), 0 10px 40px rgba(0,0,0,.45);
    transform: translateX(-50%); animation: dm-g-plate 3.2s ease forwards; white-space: nowrap; }
  @keyframes dm-g-plate { 0%, 6% { opacity: 0; transform: translate(-50%, 24px); } 16% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 1; transform: translate(-50%, 0); } }
  .dm-g-seal { display: grid; place-items: center; width: 64px; height: 64px; border: 3px solid #c8281e; border-radius: 8px; background: #fff4e0; color: #c8281e;
    font: 700 25px/1.05 'Kaiti SC', 'STKaiti', 'KaiTi', serif; text-align: center; box-shadow: inset 0 0 0 3px #fff4e0, inset 0 0 0 4.5px #c8281e; }
  .dm-g-lines { display: flex; flex-direction: column; gap: 2px; text-align: left; }
  .dm-g-who { font: 700 20px/1.4 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #e8dcc6; }
  .dm-g-name { font: 700 54px/1.15 'Kaiti SC', 'STKaiti', 'KaiTi', serif; letter-spacing: .08em; }
  .dm-g-tail { font: 400 22px/1.4 'Kaiti SC', 'STKaiti', 'KaiTi', serif; letter-spacing: .3em; }
  .dm-g-jade { background: linear-gradient(100deg, #b8f070, #fff8c0 40%, #e6d25a 60%, #b8f070); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: dm-flowtext 3.6s linear infinite; }
  /* 法宝画面通用：闪烁光点、呼吸光晕、浮动、出现、旋转、上飘 */
  @keyframes dm-g-twinkle { 0%, 100% { opacity: .2; transform: scale(.6); } 50% { opacity: 1; transform: scale(1); } }
  @keyframes dm-g-blink { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
  @keyframes dm-g-glow { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
  @keyframes dm-g-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
  @keyframes dm-g-appear { 0% { transform: scale(.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes dm-g-spin { to { transform: rotate(360deg); } }
  @keyframes dm-g-up { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: .95; } 100% { transform: translateY(-240px); opacity: 0; } }
  .dm-g-spark { animation: dm-g-twinkle 1.8s ease-in-out infinite; }
  .dm-g-blink { animation: dm-g-blink 1.6s ease-in-out infinite; }
  .dm-g-glow { animation: dm-g-glow 2.6s ease-in-out infinite; }
  .dm-g-float { animation: dm-g-float 3s ease-in-out .6s infinite; }
  .dm-g-appear { animation: dm-g-appear .6s cubic-bezier(.2, .9, .3, 1.2) both; }
  .dm-g-spin { animation: dm-g-spin 3.6s linear infinite; }
  .dm-g-spin-rev { animation: dm-g-spin 5.5s linear infinite reverse; }
  .dm-g-spin-slow { animation: dm-g-spin 40s linear infinite; }
  .dm-g-up { animation: dm-g-up 3.2s ease-out infinite; }
  /* 法宝底图：缓慢推近、明暗呼吸、滤色叠加光效、风雷翅结尾一道雷光闪过、掌天瓶光斑飘动 */
  .dm-g-photo { position: absolute; display: block; max-width: none; }
  .dm-g-screen { mix-blend-mode: screen; }
  @keyframes dm-g-push { from { transform: scale(1); } to { transform: scale(1.08); } }
  @keyframes dm-g-bright { 0%, 100% { filter: brightness(1) saturate(1); } 50% { filter: brightness(1.14) saturate(1.08); } }
  @keyframes dm-g-zap { 0%, 84% { opacity: 0; } 88% { opacity: .95; } 92% { opacity: .3; } 95% { opacity: .8; } 100% { opacity: 0; } }
  @keyframes dm-g-flick { 0%, 100% { opacity: .1; } 8% { opacity: 1; } 14% { opacity: .3; } 20% { opacity: .95; } 34% { opacity: .12; } }
  @keyframes dm-g-flow { to { stroke-dashoffset: -440; } }
  @keyframes dm-g-drift { 0%, 100% { opacity: .35; transform: translateY(0); } 50% { opacity: .9; transform: translateY(-12px); } }
  .dm-g-push { animation: dm-g-push 3.2s ease-out forwards; }
  .dm-g-bright { animation: dm-g-bright 2.4s ease-in-out infinite; }
  .dm-g-zap { animation: dm-g-zap 3.2s linear forwards; }
  .dm-g-flick { animation: dm-g-flick 1.7s linear infinite; }
  .dm-g-streak { stroke-dasharray: 140 300; animation: dm-g-flow 1.6s linear infinite; }
  .dm-g-bokeh { animation: dm-g-drift 4.6s ease-in-out infinite; }
  @keyframes dm-g-edge { 0%, 100% { opacity: .55; } 12% { opacity: 1; } 20% { opacity: .7; } 28% { opacity: 1; } 50% { opacity: .6; } }
  @keyframes dm-g-goldpulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
  @keyframes dm-g-sweep { 0% { transform: translateX(-70%); } 60%, 100% { transform: translateX(70%); } }
  .dm-g-edge { animation: dm-g-edge 1.6s linear infinite; }
  .dm-g-goldpulse { animation: dm-g-goldpulse 1.8s ease-in-out infinite; }
  .dm-g-sweep { animation: dm-g-sweep 1.6s ease-in-out .4s infinite; }
  /* 筑基丹：青绿灵光——白亮丹核呼吸，灵力环旋转 */
  @keyframes dm-g-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
  .dm-g-pulse { animation: dm-g-pulse 1.8s ease-in-out .6s infinite; }
  /* 青竹蜂云剑：九口竹青飞剑结阵，自左向右破空；雷光同风雷翅（.dm-g-flick） */
  @keyframes dm-g-charge { 0% { transform: translateX(-1250px); } 100% { transform: translateX(1350px); } }
  @keyframes dm-g-hum { 0%, 100% { filter: drop-shadow(0 0 8px rgba(90,240,150,.9)); } 50% { filter: drop-shadow(0 0 18px rgba(140,255,190,1)); } }
  .dm-g-charge { animation: dm-g-charge 2.7s cubic-bezier(.45, .05, .35, 1) .15s both; }
  .dm-g-blade { animation: dm-g-hum 1.4s ease-in-out infinite; }
  /* 风雷翅：双翼展开、扇动，雷光闪烁，人物悬空后向上飞离 */
  @keyframes dm-g-unfold { 0% { transform: rotate(64deg) scale(.15); opacity: 0; } 18% { opacity: 1; } 70% { transform: rotate(-5deg) scale(1.03); } 100% { transform: none; opacity: 1; } }
  @keyframes dm-g-beat { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-6deg); } }
  @keyframes dm-g-soar { 0% { transform: translateY(36px); opacity: 0; } 9% { transform: none; opacity: 1; } 80% { transform: translateY(-14px); opacity: 1; } 100% { transform: translateY(-460px) scale(.72); opacity: 0; } }
  @keyframes dm-g-flash { 0%, 100% { opacity: .3; } 6% { opacity: 1; } 12% { opacity: .35; } 18% { opacity: .85; } 30% { opacity: .3; } }
  @keyframes dm-g-crackle { 0%, 100% { opacity: .25; } 20% { opacity: 1; } 40% { opacity: .5; } 60% { opacity: 1; } 80% { opacity: .35; } }
  .dm-g-unfold { animation: dm-g-unfold .9s cubic-bezier(.2, .8, .3, 1) both; }
  .dm-g-beat { animation: dm-g-beat 1.6s ease-in-out .9s infinite; }
  .dm-g-soar { transform-origin: 640px 270px; animation: dm-g-soar 3.2s ease-in forwards; }
  .dm-g-flash { animation: dm-g-flash 2.6s ease-out infinite; }
  .dm-g-crackle { animation: dm-g-crackle .5s steps(2) infinite; }
  /* 掌天瓶：光点盘旋入瓶，瓶口凝出一滴绿液 */
  @keyframes dm-g-swirl { 0% { transform: rotate(0deg) scale(1.15); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: rotate(300deg) scale(.35); opacity: 0; } }
  @keyframes dm-g-bead { 0%, 35% { transform: translateY(10px) scale(.2); opacity: 0; } 60% { opacity: 1; } 85%, 100% { transform: translateY(-14px) scale(1); opacity: 1; } }
  .dm-g-swirl { animation: dm-g-swirl 2.2s ease-in infinite; }
  .dm-g-bead { animation: dm-g-bead 2.4s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .dm-g-charge { animation-duration: .01s; } .dm-g-soar, .dm-g-push, .dm-g-zap { animation: none; } }
  `;
  document.head.appendChild(style);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 法宝画面（2026-10-10 按 Claude Design 画布定稿；2026-10-12 筑基丹、风雷翅、掌天瓶按参考图重绘）：全屏暗幕＋1280×720 场景（按屏幕等比缩放）＋底部法宝名牌
  const SWORD = (w, h, fill, edge, ridge) => `<svg class="dm-g-blade" aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 240 28"><rect x="0" y="10" width="40" height="8" rx="2" fill="#1d4a2c"></rect><path d="M40 2h8v24h-8z" fill="#c9a24a"></path><path d="M48 8h166l24 6-24 6H48z" fill="${fill}"></path><path d="M48 8h166l24 6H48z" fill="${edge}"></path>${ridge ? '<path d="M50 14h176" stroke="#2fae6a" stroke-width="1.5"></path>' : ''}</svg>`;
  // 可重复的伪随机：同一件法宝每次画面相同
  const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // 一道折线闪电：从 (x, y) 沿角度 a（弧度）伸出 len，每段左右抖动 jitter
  const zigzag = (rand, x, y, a, len, jitter, steps) => {
    const out = [[x, y]];
    for (let i = 1; i <= steps; i += 1) {
      const off = (rand() - 0.5) * jitter;
      out.push([x + Math.cos(a) * len * (i / steps) - Math.sin(a) * off, y + Math.sin(a) * len * (i / steps) + Math.cos(a) * off]);
    }
    return out;
  };
  // 散落的光点（rise＝向上飘，否则原地闪烁）
  const motes = (rand, n, box, color, glow, rise) => Array.from({ length: n }, () => {
    const s = (2 + rand() * 5).toFixed(1);
    return `<span class="${rise ? 'dm-g-up' : 'dm-g-spark'}" style="position:absolute;left:${(box[0] + rand() * box[2]).toFixed(0)}px;top:${(box[1] + rand() * box[3]).toFixed(0)}px;width:${s}px;height:${s}px;border-radius:50%;background:${color};box-shadow:0 0 10px ${glow};animation-delay:${(rand() * 3).toFixed(2)}s"></span>`;
  }).join('');
  const SCENES = {
    // 筑基丹（参照图：黑夜里一团青绿灵光）：白亮丹核带一抹赤色，蓝白内环逆转，黄绿灵力环带着光点旋转，外围绿光呼吸，光点向上飘散
    zhujidan: (u) => {
      const rand = seeded(7);
      const ring = (r, width, color, dash, opacity) => `<circle r="${r}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${dash}" opacity="${opacity}"></circle>`;
      const beads = Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2 + rand() * 0.25;
        const r = 134 + rand() * 40;
        return `<circle class="dm-g-blink" cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="${(2 + rand() * 4.5).toFixed(1)}" fill="#fffbd2" style="animation-delay:${(rand() * 1.6).toFixed(2)}s"></circle>`;
      }).join('');
      // 灵力环上一团团模糊的光焰
      const flames = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
        const r = 146 + rand() * 18;
        return `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="${(9 + rand() * 16).toFixed(1)}" fill="${rand() < 0.3 ? 'rgba(255,214,120,.55)' : 'rgba(222,255,110,.6)'}"></circle>`;
      }).join('');
      return {
        veil: 'radial-gradient(ellipse at 50% 42%, rgba(40,92,24,.88) 0%, rgba(14,36,10,.8) 30%, rgba(4,10,4,.6) 62%, rgba(0,0,0,.3) 100%)',
        nameStyle: 'color:#eaffa8;text-shadow:0 0 18px rgba(170,255,80,.85)', tailStyle: 'color:#c4e69a',
        html: `<div style="position:absolute;left:640px;top:290px;width:0;height:0;transform:scale(1.15)">
          <div class="dm-g-glow" style="position:absolute;left:-340px;top:-340px;width:680px;height:680px;border-radius:50%;background:radial-gradient(circle,rgba(206,255,128,.7) 0%,rgba(132,226,72,.46) 26%,rgba(70,150,40,.18) 52%,transparent 70%)"></div>
          <div class="dm-g-appear" style="position:absolute;left:0;top:0;width:0;height:0">
            <svg class="dm-g-spin" aria-hidden="true" style="position:absolute;left:-200px;top:-200px;overflow:visible;filter:drop-shadow(0 0 10px rgba(214,255,92,.95))" width="400" height="400" viewBox="-200 -200 400 400">
              <defs><filter id="zf${u}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"></feGaussianBlur></filter></defs>
              <g filter="url(#zf${u})">${flames}</g>
              ${ring(150, 12, '#d6ff5c', '170 34 96 52 250 46 130 194', 0.92)}${ring(161, 4, '#fbffc4', '70 130 34 210 110 160 40 186', 0.9)}${ring(140, 6, '#9fe84c', '230 84 150 66 210 202', 0.75)}${beads}
            </svg>
            <svg class="dm-g-spin-rev" aria-hidden="true" style="position:absolute;left:-140px;top:-140px;overflow:visible;filter:drop-shadow(0 0 6px rgba(170,230,255,.95))" width="280" height="280" viewBox="-140 -140 280 280">
              ${ring(108, 3.5, '#cdeeff', '190 50 120 320', 0.95)}${ring(117, 2, '#7fe3c4', '90 140 200 300', 0.8)}
            </svg>
            <div class="dm-g-pulse" style="position:absolute;left:-96px;top:-96px;width:192px;height:192px;border-radius:50%;background:radial-gradient(circle at 66% 72%,rgba(255,138,64,.32),transparent 24%),radial-gradient(circle at 47% 45%,#ffffff 0%,#ffffff 30%,#f2ffd6 46%,#c8f582 60%,rgba(130,220,80,.55) 70%,transparent 77%);box-shadow:0 0 80px 34px rgba(236,255,190,.55)">
              <svg class="dm-g-spin" aria-hidden="true" style="position:absolute;left:0;top:0;opacity:.6" width="192" height="192" viewBox="-96 -96 192 192"><path d="M0 -6C18 -10 24 12 6 22C-20 34 -40 4 -26 -22C-10 -50 40 -48 52 -14C62 14 44 46 14 54" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"></path></svg>
            </div>
          </div>
          ${motes(rand, 12, [-190, 30, 380, 120], '#eaffb0', '#c8ff6a', true)}${motes(rand, 8, [-300, -240, 600, 460], '#f4ffd0', '#c8ff6a', false)}
        </div>`,
      };
    },
    // 青竹蜂云剑：九口竹青飞剑结阵破空；剑尖之间电光相连、领头剑尖劈出分叉雷光、剑身电光窜动（雷光画法同风雷翅）
    qingzhu: (u) => {
      const rand = seeded(41);
      const tips = [[1344, 305], [1016, 228], [1016, 384], [786, 162], [786, 452], [557, 102], [557, 514], [337, 48], [337, 580]];
      const blades = [[1088, 1344, 305], [832, 1016, 228], [832, 1016, 384], [626, 786, 162], [626, 786, 452], [421, 557, 102], [421, 557, 514], [225, 337, 48], [225, 337, 580]];
      const groups = [[], [], []];
      const bolt = (g, line, w) => groups[g].push(`<polyline points="${pts(line)}" stroke-width="${w}"></polyline>`);
      [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8]].forEach(([p, q], i) => {
        const [x0, y0] = tips[p];
        const [x1, y1] = tips[q];
        bolt(i % 3, zigzag(rand, x0, y0, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0), 26, 9), 2.2);
      });
      [-0.55, -0.18, 0.18, 0.55].forEach((a, i) => {
        const main = zigzag(rand, 1344, 305, a, 170 + rand() * 120, 34, 9);
        bolt(i % 3, main, 2.6);
        const [bx, by] = main[3 + Math.floor(rand() * 3)];
        bolt((i + 1) % 3, zigzag(rand, bx, by, a + (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.4), 70 + rand() * 80, 20, 5), 1.4);
      });
      blades.forEach(([x0, x1, y], i) => bolt(i % 3, zigzag(rand, x0, y, 0, x1 - x0, 12, 7), 1.3));
      // 两层：模糊的金色柔光在下，白色雷芯在上（同风雷翅）
      const layer = (stroke, scale, extra) => `<g fill="none" stroke="${stroke}" stroke-linejoin="round" stroke-linecap="round"${extra}>${groups.map((g, i) => `<g class="dm-g-flick" style="animation-delay:${(i * 0.5).toFixed(2)}s">${g.join('').replace(/stroke-width="([\d.]+)"/g, (m, w) => `stroke-width="${(w * scale).toFixed(1)}"`)}</g>`).join('')}</g>`;
      const lightning = `<svg aria-hidden="true" style="position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(0 0 6px rgba(255,236,160,1))" width="1400" height="720" viewBox="0 0 1400 720">
          <defs><filter id="qzg${u}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"></feGaussianBlur></filter></defs>
          ${layer('#ffe7a2', 3.4, ` opacity=".6" filter="url(#qzg${u})"`)}${layer('#fffdf0', 1.25, '')}</svg>`;
      const sword = (x, y, trail, th, w, h, fill, edge, ridge) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center"><div style="width:${trail}px;height:${th}px;margin-right:-${th}px;border-radius:3px;background:linear-gradient(90deg,rgba(120,255,170,0),rgba(150,255,190,.9))"></div>${SWORD(w, h, fill, edge, ridge)}</div>`;
      return {
        veil: 'radial-gradient(ellipse at 50% 44%, rgba(6,30,18,.86) 0%, rgba(10,22,16,.78) 40%, rgba(12,14,12,.55) 72%, rgba(12,14,12,.25) 100%)',
        nameStyle: 'color:#b6f7cf;text-shadow:0 0 18px rgba(90,240,150,.75)', tailStyle: 'color:#9fd9b4',
        html: `<div class="dm-g-charge" style="position:absolute;inset:0">
          ${sword(610, 286, 420, 6, 320, 38, '#bff5d4', '#e9fff2', true)}
          ${sword(470, 214, 320, 4, 230, 28, '#a8efc6', '#dcffea', true)}${sword(470, 370, 320, 4, 230, 28, '#a8efc6', '#dcffea', true)}
          ${sword(330, 150, 260, 4, 200, 24, '#96e6b6', '#d2ffe4', false)}${sword(330, 440, 260, 4, 200, 24, '#96e6b6', '#d2ffe4', false)}
          ${sword(190, 92, 200, 3, 170, 20, '#86dca8', '#c6fadb', false)}${sword(190, 504, 200, 3, 170, 20, '#86dca8', '#c6fadb', false)}
          ${sword(60, 40, 140, 3, 140, 17, '#78d29c', '#78d29c', false)}${sword(60, 572, 140, 3, 140, 17, '#78d29c', '#78d29c', false)}
          ${lightning}
        </div>`,
      };
    },
    // 风雷翅（参照图：金色天光中展开钢蓝铜纹的巨翼）：身后金光与放射光芒，雷光四射；双翼由收拢到展开、缓缓扇动，
    //   翼上电光窜动；人物悬空，最后雷遁而去（向上飞离）
    fenglei: (u) => {
      const rand = seeded(11);
      const bolts = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + (rand() - 0.5) * 0.25;
        const main = zigzag(rand, 640 + Math.cos(a) * 60, 270 + Math.sin(a) * 40, a, 520 + rand() * 300, 46, 11);
        const [bx, by] = main[3 + Math.floor(rand() * 4)];
        const branch = zigzag(rand, bx, by, a + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.4), 120 + rand() * 140, 30, 5);
        return `<g class="dm-g-crackle" style="animation-delay:${(rand() * 0.5).toFixed(2)}s;animation-duration:${(0.45 + rand() * 0.5).toFixed(2)}s"><polyline points="${pts(main)}" stroke-width="${(2.4 + rand() * 1.8).toFixed(1)}"></polyline><polyline points="${pts(branch)}" stroke-width="1.6"></polyline></g>`;
      }).join('');
      // 一只翅膀（右翼，肩在原点；左翼由外层镜像）：沿翼骨排三层羽毛——长飞羽（钢蓝带铜色横斑）、覆羽、古铜小鳞羽
      const n1 = (v) => v.toFixed(1);
      const feather = (x, y, ang, len, w, fill) => `<path d="M0 0C${n1(len * 0.3)} ${n1(-w)} ${n1(len * 0.78)} ${n1(-w * 0.5)} ${n1(len)} 0C${n1(len * 0.78)} ${n1(w * 0.5)} ${n1(len * 0.3)} ${n1(w)} 0 0Z" transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(ang)})" fill="${fill}"></path>`;
      const arm = (t) => { const m = 1 - t; return [2 * m * t * 160 + t * t * 350, 2 * m * t * -110 + t * t * -135]; };
      const row = (n, t0, t1, angle, length, width, fill) => Array.from({ length: n }, (_, i) => {
        const t = t1 - (i / (n - 1)) * (t1 - t0);   // 从翼尖往肩排，靠肩的压在上面
        const [x, y] = arm(t);
        return feather(x, y, angle(t), length(t), width(t), fill);
      }).join('');
      const stops = (list) => list.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"></stop>`).join('');
      const wing = (side) => `<svg aria-hidden="true" style="position:absolute;left:-60px;top:-470px;overflow:visible;filter:drop-shadow(0 0 16px rgba(255,236,170,.75))" width="720" height="680" viewBox="-60 -470 720 680">
          <defs><linearGradient id="fa${side}${u}" x1="0" y1="0" x2="1" y2="0">${stops([[0, '#14243a'], [0.34, '#2d5884'], [0.5, '#4f86b8'], [0.58, '#9a5432'], [0.66, '#6a98c4'], [0.88, '#2a4b70'], [1, '#16283e']])}</linearGradient>
            <linearGradient id="fb${side}${u}" x1="0" y1="0" x2="1" y2="0">${stops([[0, '#1f3a58'], [0.5, '#5c8dbb'], [0.72, '#8a5236'], [1, '#3c6390']])}</linearGradient>
            <linearGradient id="fc${side}${u}" x1="0" y1="0" x2="1" y2="0">${stops([[0, '#4a3220'], [0.6, '#a57c48'], [1, '#e2c07a']])}</linearGradient></defs>
          <path d="M0 0Q160 -110 350 -135L640 -250C560 -120 420 0 250 90C170 130 80 150 20 150Z" fill="#1b3150" opacity=".92"></path>
          <g stroke="rgba(8,16,28,.55)" stroke-width="1.1">
            ${row(24, 0.08, 1, (t) => 80 - 100 * t, (t) => 150 + 170 * t ** 1.3, (t) => 24 + 8 * t, `url(#fa${side}${u})`)}
            ${row(18, 0.05, 0.94, (t) => 70 - 92 * t, (t) => 95 + 100 * t, () => 22, `url(#fb${side}${u})`)}
            ${row(24, 0, 0.97, (t) => 56 - 80 * t, () => 62, () => 17, `url(#fc${side}${u})`)}
          </g>
          <path d="M0 0Q160 -110 350 -135" fill="none" stroke="#f1d58e" stroke-width="5" stroke-linecap="round" opacity=".85"></path>
          <g class="dm-g-crackle" fill="none" stroke="#fffbe8" stroke-width="1.8" stroke-linejoin="round" style="animation-delay:${side === 'l' ? 0.2 : 0}s">
            <polyline points="${pts(zigzag(rand, 20, -10, -0.45, 560, 30, 10))}"></polyline><polyline points="${pts(zigzag(rand, 40, 0, 0.1, 420, 26, 8))}"></polyline><polyline points="${pts(zigzag(rand, 30, 10, 0.75, 260, 22, 6))}"></polyline>
          </g></svg>`;
      // 翅膀：外层定位与镜像，中层展开（一次），内层扇动（循环）；三层都以肩为原点
      const wingAt = (x, side) => `<div style="position:absolute;left:${x}px;top:240px;width:0;height:0;transform:scale(${side === 'l' ? -0.84 : 0.84}, .84)">
          <div class="dm-g-unfold" style="position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0"><div class="dm-g-beat" style="position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0">${wing(side)}</div></div></div>`;
      const figure = `<svg aria-hidden="true" style="position:absolute;left:565px;top:175px;filter:drop-shadow(0 0 14px rgba(255,244,200,.95))" width="150" height="325" viewBox="0 0 120 260">
          <defs><linearGradient id="fr${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3140"></stop><stop offset="1" stop-color="#151a24"></stop></linearGradient>
            <linearGradient id="fi${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fc"></stop><stop offset="1" stop-color="#a9bfd4"></stop></linearGradient></defs>
          <path d="M46 16C40 40 38 70 42 100H78C82 70 80 40 74 16Z" fill="#14151b"></path>
          <path d="M32 52C20 90 14 170 8 252H112C106 170 100 90 88 52C76 46 44 46 32 52Z" fill="url(#fr${u})" stroke="#c9a24a" stroke-width="1.5"></path>
          <path d="M48 52H72L82 252H38Z" fill="url(#fi${u})"></path><path d="M60 52V252" stroke="#8aa6c0" stroke-width="1"></path>
          <rect x="44" y="108" width="32" height="9" rx="2" fill="#c9a24a"></rect><path d="M58 117h4v22h-4z" fill="#b8323a"></path>
          <path d="M32 54C18 80 12 118 16 150L30 152C30 120 34 92 42 66Z" fill="#232a36" stroke="#c9a24a" stroke-width="1"></path>
          <path d="M88 54C102 80 108 118 104 150L90 152C90 120 86 92 78 66Z" fill="#232a36" stroke="#c9a24a" stroke-width="1"></path>
          <ellipse cx="22" cy="157" rx="5" ry="6" fill="#efd5bb"></ellipse><ellipse cx="98" cy="157" rx="5" ry="6" fill="#efd5bb"></ellipse>
          <rect x="55" y="36" width="10" height="12" fill="#e8ccb0"></rect><ellipse cx="60" cy="27" rx="10" ry="13" fill="#f0d8be"></ellipse>
          <path d="M49 25C49 8 71 8 71 25C68 16 52 16 49 25Z" fill="#14151b"></path><path d="M56 4h8v8h-8z" fill="#14151b"></path><path d="M52 8h16" stroke="#c9a24a" stroke-width="1.5"></path>
          <path d="M49 25C46 34 45 44 47 54M71 25C74 34 75 44 73 54" stroke="#14151b" stroke-width="3" fill="none"></path></svg>`;
      const streaks = Array.from({ length: 7 }, () => `<span class="dm-g-glow" style="position:absolute;left:${(rand() * 700).toFixed(0)}px;top:${(120 + rand() * 360).toFixed(0)}px;width:${(260 + rand() * 360).toFixed(0)}px;height:2px;background:linear-gradient(90deg,transparent,rgba(${rand() < 0.5 ? '170,240,255' : '255,236,170'},.75),transparent);animation-delay:${(rand() * 2).toFixed(2)}s"></span>`).join('');
      return {
        veil: 'radial-gradient(ellipse at 50% 38%, rgba(214,158,64,.86) 0%, rgba(120,78,28,.8) 34%, rgba(46,30,12,.58) 68%, rgba(24,16,8,.28) 100%)',
        nameStyle: 'color:#fff1c2;text-shadow:0 0 18px rgba(255,206,90,.95)', tailStyle: 'color:#f0d48e',
        html: `<div class="dm-g-spin-slow" style="position:absolute;left:-160px;top:-530px;width:1600px;height:1600px;background:repeating-conic-gradient(from 0deg,rgba(255,248,214,.26) 0deg 1.6deg,transparent 1.6deg 7deg);-webkit-mask-image:radial-gradient(circle,#000 0%,rgba(0,0,0,.6) 22%,transparent 55%);mask-image:radial-gradient(circle,#000 0%,rgba(0,0,0,.6) 22%,transparent 55%)"></div>
          <div class="dm-g-glow" style="position:absolute;left:120px;top:-250px;width:1040px;height:1040px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,244,.98) 0%,rgba(255,244,196,.85) 7%,rgba(255,214,120,.45) 20%,rgba(230,170,70,.15) 38%,transparent 58%)"></div>
          ${streaks}
          <svg aria-hidden="true" style="position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(0 0 6px rgba(255,236,160,.95))" width="1280" height="720" viewBox="0 0 1280 720"><g fill="none" stroke="#fffbe8" stroke-linejoin="round" stroke-linecap="round">${bolts}</g></svg>
          <div class="dm-g-flash" style="position:absolute;inset:-200px;background:radial-gradient(circle at 50% 40%, rgba(255,255,236,.5), rgba(255,236,170,.14) 30%, transparent 55%)"></div>
          <div class="dm-g-soar" style="position:absolute;inset:0">${wingAt(624, 'l')}${wingAt(656, 'r')}${figure}</div>
          ${motes(rand, 18, [80, 40, 1120, 480], '#fffbe8', '#ffe7a0', false)}`,
      };
    },
    // 掌天瓶（参照图：青绿灵雾中一只金纹玉瓶斜悬发光）：身后黄绿光晕与放射光，叶状灵雾缓缓旋转，绿色光点闪烁上飘，
    //   光点盘旋入瓶，瓶口凝出一滴绿液
    zhangtian: (u) => {
      const rand = seeded(23);
      const swirl = (size, color, n, delay) => `<svg class="dm-g-swirl" aria-hidden="true" style="position:absolute;left:-${size / 2}px;top:-${size / 2}px;animation-delay:${delay}s" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g fill="${color}">${Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + rand() * 0.4;
        const r = size / 2 - 6 - rand() * 16;
        return `<circle cx="${(size / 2 + Math.cos(a) * r).toFixed(1)}" cy="${(size / 2 + Math.sin(a) * r).toFixed(1)}" r="${(1.6 + rand() * 2.2).toFixed(1)}"></circle>`;
      }).join('')}</g></svg>`;
      const wisps = (count, width, color) => Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + rand() * 0.3;
        const r0 = 170 + rand() * 40;
        const r1 = 430 + rand() * 180;
        const bend = (rand() - 0.5) * 1.1;
        const at = (angle, r) => `${(Math.cos(angle) * r).toFixed(0)} ${(Math.sin(angle) * r).toFixed(0)}`;
        return `<path d="M${at(a, r0)}Q${at(a + bend, (r0 + r1) / 2)} ${at(a + bend * 1.6, r1)}" stroke="${color}" stroke-width="${(width[0] + rand() * width[1]).toFixed(0)}"></path>`;
      }).join('');
      return {
        veil: 'radial-gradient(ellipse at 50% 42%, rgba(80,140,50,.86) 0%, rgba(30,80,32,.8) 32%, rgba(14,40,20,.58) 66%, rgba(8,24,12,.28) 100%)',
        nameClass: 'dm-g-jade', tailStyle: 'color:#cfeea6',
        html: `<div style="position:absolute;left:640px;top:292px;width:0;height:0">
            <svg class="dm-g-spin-slow" aria-hidden="true" style="position:absolute;left:-700px;top:-700px;filter:blur(5px)" width="1400" height="1400" viewBox="-700 -700 1400 1400"><g fill="none" stroke-linecap="round">${wisps(10, [16, 28], 'rgba(214,255,190,.2)')}${wisps(7, [3, 3], 'rgba(236,255,214,.32)')}</g></svg>
            <div class="dm-g-spin-slow" style="position:absolute;left:-640px;top:-640px;width:1280px;height:1280px;background:repeating-conic-gradient(from 4deg,rgba(250,255,200,.16) 0deg 2deg,transparent 2deg 10deg);-webkit-mask-image:radial-gradient(circle,#000 0%,transparent 50%);mask-image:radial-gradient(circle,#000 0%,transparent 50%);animation-direction:reverse"></div>
            <div class="dm-g-glow" style="position:absolute;left:-380px;top:-380px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,226,.98) 0%,rgba(246,255,168,.82) 12%,rgba(184,236,90,.5) 28%,rgba(100,180,60,.18) 48%,transparent 64%)"></div>
            ${swirl(380, '#f4ffd0', 12, 0)}${swirl(320, '#d8ffa0', 10, 0.7)}${swirl(420, '#ffffff', 9, 1.4)}
            <div style="position:absolute;left:0;top:0;width:0;height:0;transform:rotate(-24deg) scale(1.45)"><div class="dm-g-appear" style="position:absolute;left:0;top:0;width:0;height:0">
              <svg class="dm-g-float" aria-hidden="true" style="position:absolute;left:-100px;top:-170px;overflow:visible;filter:drop-shadow(0 0 16px rgba(226,255,130,.95)) drop-shadow(0 0 40px rgba(170,240,80,.6))" width="200" height="320" viewBox="0 0 200 320">
                <defs><radialGradient id="vb${u}" cx=".38" cy=".42" r=".72"><stop offset="0" stop-color="#d8fa98"></stop><stop offset=".3" stop-color="#86d65a"></stop><stop offset=".68" stop-color="#3a9a36"></stop><stop offset="1" stop-color="#17561e"></stop></radialGradient>
                  <linearGradient id="vn${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a9a36"></stop><stop offset=".45" stop-color="#a8e878"></stop><stop offset="1" stop-color="#226b26"></stop></linearGradient></defs>
                <path d="M84 34V58C84 70 70 80 54 96C30 120 22 150 26 178C32 220 58 256 74 284H126C142 256 168 220 174 178C178 150 170 120 146 96C130 80 116 70 116 58V34Z" fill="url(#vb${u})" stroke="#eef58a" stroke-width="2.2"></path>
                <path d="M70 284H130L136 302C120 310 80 310 64 302Z" fill="url(#vn${u})" stroke="#eef58a" stroke-width="2"></path>
                <path d="M80 34H120V26H80Z" fill="url(#vn${u})" stroke="#eef58a" stroke-width="2"></path>
                <path d="M80 26C80 10 120 10 120 26Z" fill="url(#vb${u})" stroke="#eef58a" stroke-width="2"></path>
                <circle cx="100" cy="11" r="5" fill="#c8f080" stroke="#eef58a" stroke-width="1.5"></circle>
                <g fill="none" stroke="#f3ea8a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px rgba(255,250,170,.9))">
                  <path d="M100 118C122 140 124 176 100 206C76 176 78 140 100 118Z" fill="rgba(240,236,130,.22)"></path>
                  <path d="M100 140C110 152 110 172 100 186C90 172 90 152 100 140Z"></path><circle cx="100" cy="163" r="4" fill="#f3ea8a"></circle>
                  <path d="M56 140C70 150 72 176 58 196C46 178 46 156 56 140Z"></path><path d="M144 140C130 150 128 176 142 196C154 178 154 156 144 140Z"></path>
                  <path d="M60 108c10-14 32-12 32 2c0 9-12 12-16 4"></path><path d="M140 108c-10-14-32-12-32 2c0 9 12 12 16 4"></path>
                  <path d="M44 200c10 20 22 40 36 60M156 200c-10 20-22 40-36 60"></path><path d="M70 232c6-6 14-6 16 2M130 232c-6-6-14-6-16 2"></path>
                  <path d="M86 46q7 6 14 0t14 0"></path><path d="M62 92Q100 108 138 92"></path><path d="M72 292q7-5 14 0t14 0t14 0t14 0"></path>
                  <path d="M100 222C110 236 110 256 100 270C90 256 90 236 100 222Z"></path>
                </g>
                <path d="M40 160C38 130 50 108 66 98" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".38"></path>
              </svg></div></div>
            <span class="dm-g-bead" style="position:absolute;left:-121px;top:-262px;width:22px;height:30px;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;background:radial-gradient(circle at 35% 30%,#f6fff0,#9cf05a 50%,#2f8a22);box-shadow:0 0 18px rgba(200,255,110,1),0 0 40px rgba(170,255,90,.6)"></span>
            ${motes(rand, 26, [-560, -280, 1120, 520], '#d8ff9a', '#9cf05a', false)}${motes(rand, 14, [-300, 40, 600, 160], '#eaffc0', '#9cf05a', true)}
          </div>`,
      };
    },
  };

  // ---------- 法宝底图（用户提供的参考图加工后＋动效；筑基丹、青竹蜂云剑用上面的矢量画面） ----------
  // 风雷翅：人物虚化、双翼重新上色、天空透明（只留双翼、人物光影与逆光）＋翅膀轮廓光边一层；掌天瓶：抠出的瓶子（重新上色）＋金纹一层，背景用矢量灵雾光芒。
  // 图由 tools/gift_art/process_refs.py 加工，AES-GCM 加密存在 /files/gift-<名>.bin，钥匙只在课堂版投屏页（教师密码加密）的
  // CLASS_LIVE_CONFIG.giftArt 里；第一次需要时取回解密成 blob 地址（页面打开 4 秒后先取好，课上祭出不用等）；取不到时用矢量画面。
  const ART = config.giftArt || {};
  const artCache = new Map();
  const fromB64 = (text) => { const bin = atob(text); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i); return out; };
  function artUrl(id) {
    const meta = ART[id];
    if (!meta || !window.crypto || !window.crypto.subtle) return Promise.resolve(null);
    if (!artCache.has(id)) {
      artCache.set(id, (async () => {
        const response = await fetch(meta.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const key = await crypto.subtle.importKey('raw', fromB64(meta.key), 'AES-GCM', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(meta.iv) }, key, await response.arrayBuffer());
        return URL.createObjectURL(new Blob([plain], { type: meta.type || 'image/webp' }));
      })().catch((error) => { console.warn('[法宝底图]', id, error); artCache.delete(id); return null; }));
    }
    return artCache.get(id);
  }
  // 底图按高度放进 1280×720 场景、四周渐隐；背景是半透明暗幕（网页内容大致可见）。画面缓慢推近、明暗呼吸，光效用滤色叠加
  const photo = (src, x, y, w, h, mask, origin, over = '') => `<div class="dm-g-push" style="position:absolute;inset:0;transform-origin:${origin}">
      <img class="dm-g-photo dm-g-bright" src="${src}" alt="" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;-webkit-mask-image:${mask};mask-image:${mask}">${over}</div>`;
  const ART_NEEDS = { fenglei: ['fenglei', 'fenglei-edge'], zhangtian: ['zhangtian-vase', 'zhangtian-gold'] };
  async function artFor(id) {
    const names = ART_NEEDS[id];
    if (!names || !names.every((name) => ART[name])) return null;
    const urls = await Promise.all(names.map(artUrl));
    return urls.every(Boolean) ? Object.fromEntries(names.map((name, i) => [name, urls[i]])) : null;
  }
  const ART_SCENES = {
    // 风雷翅：雷光自身后四射、交替闪烁，天光阵阵闪亮，流光与光尘，最后一道雷光闪过（雷遁）
    fenglei: (u, art) => {
      const src = art.fenglei;
      const rand = seeded(29);
      const cx = 647;
      const cy = 226;
      const bolts = Array.from({ length: 4 }, () => []);
      for (let i = 0; i < 20; i += 1) {
        const a = (i / 20) * Math.PI * 2 + (rand() - 0.5) * 0.25;
        const main = zigzag(rand, cx + Math.cos(a) * 50, cy + Math.sin(a) * 34, a, 440 + rand() * 360, 50, 12);
        const [bx, by] = main[2 + Math.floor(rand() * 6)];
        const branch = zigzag(rand, bx, by, a + (rand() < 0.5 ? -1 : 1) * (0.3 + rand() * 0.5), 100 + rand() * 160, 30, 6);
        bolts[i % 4].push(`<polyline points="${pts(main)}" stroke-width="${(1.6 + rand() * 1.2).toFixed(1)}"></polyline><polyline points="${pts(branch)}" stroke-width="1.2"></polyline>`);
      }
      const streaks = Array.from({ length: 16 }, () => {
        const side = rand() < 0.5 ? -1 : 1;
        const y0 = cy + 30 + (rand() - 0.5) * 220;
        const a = (rand() - 0.5) * 0.3 + (y0 - cy) / 900;
        const x0 = cx + side * (90 + rand() * 120);
        const len = 380 + rand() * 360;
        return `<path class="dm-g-streak" d="M${x0.toFixed(0)} ${y0.toFixed(0)}L${(x0 + side * Math.cos(a) * len).toFixed(0)} ${(y0 + Math.sin(a) * len).toFixed(0)}" stroke="${rand() < 0.45 ? 'rgba(160,236,255,.55)' : 'rgba(255,246,214,.6)'}" stroke-width="${(0.8 + rand() * 1.2).toFixed(1)}" style="animation-delay:-${(rand() * 1.6).toFixed(2)}s"></path>`;
      }).join('');
      return {
        veil: 'radial-gradient(ellipse at 50% 40%, rgba(120,84,30,.84) 0%, rgba(70,46,16,.76) 36%, rgba(30,20,8,.55) 70%, rgba(20,14,6,.25) 100%)',
        nameStyle: 'color:#fff1c2;text-shadow:0 0 18px rgba(255,206,90,.95)', tailStyle: 'color:#f0d48e',
        html: `${photo(src, 93, 0, 1094, 720, 'none', `${cx}px ${cy}px`,
          `<img class="dm-g-photo dm-g-edge dm-g-screen" src="${art['fenglei-edge']}" alt="" style="left:93px;top:0;width:1094px;height:720px">`)}
          <svg class="dm-g-screen" aria-hidden="true" style="position:absolute;left:0;top:0;overflow:visible" width="1280" height="720" viewBox="0 0 1280 720"><g fill="none" stroke-linecap="round">${streaks}</g></svg>
          <div class="dm-g-flash dm-g-screen" style="position:absolute;inset:0;background:radial-gradient(circle at ${cx}px ${cy}px, rgba(255,250,224,.75), rgba(255,226,150,.2) 26%, transparent 52%)"></div>
          <svg class="dm-g-screen" aria-hidden="true" style="position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(0 0 5px rgba(255,236,160,1))" width="1280" height="720" viewBox="0 0 1280 720">
            <g fill="none" stroke="#fffdf0" stroke-linejoin="round" stroke-linecap="round">${bolts.map((lines, i) => `<g class="dm-g-flick" style="animation-delay:${(i * 0.42).toFixed(2)}s">${lines.join('')}</g>`).join('')}</g></svg>
          ${motes(rand, 24, [80, 20, 1120, 520], '#fffbe8', '#ffe7a0', false)}
          <div class="dm-g-zap dm-g-screen" style="position:absolute;inset:-200px;background:radial-gradient(circle at 50% 40%, #fffdf0, rgba(255,240,190,.6) 30%, transparent 70%)"></div>`,
      };
    },
    // 掌天瓶：青绿灵雾与光芒（矢量背景）中，抠出重新上色的玉瓶斜悬浮动；金纹一明一灭发光，一道光泽扫过瓶身，
    //   光点盘旋入瓶，瓶口凝出一滴绿液，绿色光斑飘动
    zhangtian: (u, art) => {
      const rand = seeded(23);
      const swirl = (size, color, n, delay) => `<svg class="dm-g-swirl" aria-hidden="true" style="position:absolute;left:-${size / 2}px;top:-${size / 2}px;animation-delay:${delay}s" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g fill="${color}">${Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + rand() * 0.4;
        const r = size / 2 - 6 - rand() * 16;
        return `<circle cx="${(size / 2 + Math.cos(a) * r).toFixed(1)}" cy="${(size / 2 + Math.sin(a) * r).toFixed(1)}" r="${(1.6 + rand() * 2.4).toFixed(1)}"></circle>`;
      }).join('')}</g></svg>`;
      const wisps = (count, width, color) => Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + rand() * 0.3;
        const r0 = 170 + rand() * 40;
        const r1 = 430 + rand() * 180;
        const bend = (rand() - 0.5) * 1.1;
        const at = (angle, r) => `${(Math.cos(angle) * r).toFixed(0)} ${(Math.sin(angle) * r).toFixed(0)}`;
        return `<path d="M${at(a, r0)}Q${at(a + bend, (r0 + r1) / 2)} ${at(a + bend * 1.6, r1)}" stroke="${color}" stroke-width="${(width[0] + rand() * width[1]).toFixed(0)}"></path>`;
      }).join('');
      // 玉瓶图 870×1086，按高 470 放在中心（瓶身已斜放）
      const vase = art['zhangtian-vase'];
      const box = 'position:absolute;left:-188px;top:-235px;width:376px;height:470px';
      const vaseMask = `url('${vase}') center / 100% 100% no-repeat`;
      return {
        veil: 'radial-gradient(ellipse at 50% 42%, rgba(80,140,50,.86) 0%, rgba(30,80,32,.8) 32%, rgba(14,40,20,.58) 66%, rgba(8,24,12,.28) 100%)',
        nameClass: 'dm-g-jade', tailStyle: 'color:#cfeea6',
        html: `<div style="position:absolute;left:640px;top:292px;width:0;height:0">
            <svg class="dm-g-spin-slow" aria-hidden="true" style="position:absolute;left:-700px;top:-700px;filter:blur(5px)" width="1400" height="1400" viewBox="-700 -700 1400 1400"><g fill="none" stroke-linecap="round">${wisps(12, [16, 30], 'rgba(214,255,190,.22)')}${wisps(8, [3, 3], 'rgba(236,255,214,.34)')}</g></svg>
            <div class="dm-g-spin-slow" style="position:absolute;left:-640px;top:-640px;width:1280px;height:1280px;background:repeating-conic-gradient(from 4deg,rgba(250,255,200,.18) 0deg 2deg,transparent 2deg 10deg);-webkit-mask-image:radial-gradient(circle,#000 0%,transparent 50%);mask-image:radial-gradient(circle,#000 0%,transparent 50%);animation-direction:reverse"></div>
            <div class="dm-g-glow" style="position:absolute;left:-400px;top:-400px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,226,.98) 0%,rgba(246,255,168,.82) 12%,rgba(184,236,90,.5) 28%,rgba(100,180,60,.18) 48%,transparent 64%)"></div>
            ${swirl(400, '#f4ffd0', 12, 0)}${swirl(340, '#d8ffa0', 10, 0.7)}${swirl(460, '#ffffff', 9, 1.4)}
            <div class="dm-g-appear" style="position:absolute;left:0;top:0;width:0;height:0"><div class="dm-g-float" style="position:absolute;left:0;top:0;width:0;height:0">
              <img class="dm-g-photo" src="${vase}" alt="" style="${box};filter:drop-shadow(0 0 10px rgba(246,255,160,.95)) drop-shadow(0 0 36px rgba(196,246,96,.75))">
              <img class="dm-g-photo dm-g-goldpulse dm-g-screen" src="${art['zhangtian-gold']}" alt="" style="${box};filter:drop-shadow(0 0 6px rgba(255,236,120,.9))">
              <div class="dm-g-screen" style="${box};overflow:hidden;-webkit-mask:${vaseMask};mask:${vaseMask}"><div class="dm-g-sweep" style="position:absolute;inset:-20% -40%;background:linear-gradient(110deg,transparent 38%,rgba(255,255,236,.75) 48%,rgba(255,255,236,.15) 54%,transparent 62%)"></div></div>
            </div></div>
          </div>
          <span class="dm-g-bead" style="position:absolute;left:506px;top:18px;width:22px;height:30px;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;background:radial-gradient(circle at 35% 30%,#f6fff0,#9cf05a 50%,#2f8a22);box-shadow:0 0 18px rgba(200,255,110,1),0 0 40px rgba(170,255,90,.6)"></span>
          ${motes(rand, 22, [40, 10, 1200, 540], 'rgba(170,255,120,.35)', 'rgba(170,255,120,.5)', false).replace(/dm-g-spark/g, 'dm-g-bokeh')}
          ${motes(rand, 36, [40, 10, 1200, 540], '#eaffb8', 'rgba(190,255,110,.95)', false)}`,
      };
    },
  };
  // ---------- 播放 ----------
  const GIFT_MS = 3200;   // 法宝画面时长（与 .dm-gift 的 dm-g-life 一致）
  let ownLayer = null;
  function layerFor(layer) {
    if (layer) return layer;
    if (!ownLayer) {
      ownLayer = document.createElement('div');
      ownLayer.className = 'dm-gifts';
      ownLayer.style.zIndex = '2147483000';   // 学生页：盖住页面和面板，但在提示条之下
      document.body.appendChild(ownLayer);
    }
    return ownLayer;
  }
  async function play({ gift, sealName = '', who = '', layer = null, fit = 'wide' } = {}) {
    if (!gift || !SCENES[gift.id]) return null;
    const art = ART_SCENES[gift.id] ? await artFor(gift.id) : null;
    const scene = (art ? ART_SCENES[gift.id] : SCENES[gift.id])(Math.random().toString(36).slice(2, 8), art);
    const el = document.createElement('div');
    el.className = `dm-gift dm-gift-${gift.id}`;
    const scale = fit === 'narrow' ? Math.min(window.innerWidth / 960, window.innerHeight / 720) : Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    el.style.setProperty('--dm-scale', String(scale));
    el.innerHTML = `<div class="dm-g-veil" style="background:${scene.veil}${scene.veilStyle ? `;${scene.veilStyle}` : ''}"></div>
      <div class="dm-g-box">${scene.html}
        <div class="dm-g-plate"><span class="dm-g-seal">${esc(sealName.slice(0, 1))}<br>${esc(sealName.slice(1))}</span>
          <div class="dm-g-lines"><span class="dm-g-who"></span>
            <span class="dm-g-name ${scene.nameClass || ''}" style="${scene.nameStyle || ''}">${esc(gift.name)}</span>
            <span class="dm-g-tail" style="${scene.tailStyle || ''}">${esc(gift.tail || '')}</span></div></div></div>`;
    el.querySelector('.dm-g-who').textContent = who;
    layerFor(layer).appendChild(el);
    setTimeout(() => el.remove(), GIFT_MS + 200);
    return el;
  }
  window.ClassLiveGifts = { play, GIFT_MS, preload: () => Object.keys(ART).forEach(artUrl) };
})();
