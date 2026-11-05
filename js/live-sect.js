/* 宗门 · 山门大开（2026-11-05 用户：“达到「筑基」境界的同学，如果还没有选择宗门的，下次登陆的时候会弹出选择宗门的选项，
 * 分别介绍一下四大宗门，介绍一下宗训和宗风，尽量做得美观一些，可以加一些特效。”）
 * 全屏夜空：四张宗门卡片（山门简介、宗训与释义、宗风与说明、宗门分与弟子人数），每宗一种特效——
 *   枫霞谷落枫、玄月宗新月与星点、灵犀山萤火、星澜宫流星；点“拜入”后卡片放大、其余变暗，再确认；拜入成功放一段“入门”庆贺画面。
 * 只负责画面：学生页（live-student.js）读宗门榜、调用后台拜入，经 ClassLiveSect.open({ ... }) 传入数据和回调。
 * 减少动态效果（prefers-reduced-motion）时不播放动画。
 */
(function () {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rgba = (hex, alpha) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; };
  const vars = (sect) => `--sc:${sect.color};--sg:${rgba(sect.glow, 0.85)};--sa:${rgba(sect.color, 0.5)};--sl:${sect.glow}`;
  const num = (value) => (Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  const KAI = '"Kaiti SC", STKaiti, KaiTi, "Songti SC", serif';
  const SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

  const CSS = `
  .sg-root { position: fixed; inset: 0; z-index: 2147482995; overflow-y: auto; overscroll-behavior: contain; color: #f4ecff;
    background: radial-gradient(120% 80% at 50% -10%, #3a2a6e 0%, #1b1338 45%, #0b0a1d 100%); font-family: ${SANS}; -webkit-font-smoothing: antialiased; animation: sg-fade .45s ease both; }
  .sg-root[hidden] { display: none; }
  .sg-sky { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
  .sg-stars { position: absolute; inset: -50%; background-image:
      radial-gradient(1.4px 1.4px at 20px 30px, #fff, transparent), radial-gradient(1.2px 1.2px at 90px 120px, #ffe9b0, transparent),
      radial-gradient(1px 1px at 160px 60px, #fff, transparent), radial-gradient(1.6px 1.6px at 230px 170px, #cfe3ff, transparent),
      radial-gradient(1px 1px at 300px 90px, #fff, transparent), radial-gradient(1.3px 1.3px at 60px 210px, #ffd6f0, transparent);
    background-size: 320px 240px; opacity: .55; animation: sg-twinkle 5s ease-in-out infinite alternate; }
  .sg-stars.is-b { background-position: 140px 110px; opacity: .35; animation-delay: 2.2s; animation-duration: 7s; }
  .sg-mist { position: absolute; width: 70vmax; height: 40vmax; border-radius: 50%; filter: blur(60px); opacity: .32; }
  .sg-mist.is-a { left: -20vmax; top: 10%; background: radial-gradient(closest-side, #8a5cff, transparent); animation: sg-drift 26s ease-in-out infinite alternate; }
  .sg-mist.is-b { right: -25vmax; bottom: -5%; background: radial-gradient(closest-side, #ff8a5c, transparent); opacity: .22; animation: sg-drift 32s ease-in-out infinite alternate-reverse; }
  .sg-mist.is-c { left: 30%; bottom: -20vmax; background: radial-gradient(closest-side, #46c7a0, transparent); opacity: .18; animation: sg-drift 38s ease-in-out infinite alternate; }
  .sg-wrap { position: relative; box-sizing: border-box; width: min(1040px, 100%); margin: 0 auto; padding: clamp(18px, 4vw, 40px) clamp(12px, 3vw, 28px) 36px; }
  .sg-head { position: relative; text-align: center; animation: sg-down .7s ease both; }
  .sg-kicker { margin: 0; color: #ffd36b; font-size: 13px; font-weight: 800; letter-spacing: .4em; }
  .sg-title { margin: 6px 0 8px; font-family: ${KAI}; font-weight: 900; font-size: clamp(34px, 7vw, 56px); line-height: 1.2; letter-spacing: .28em; text-indent: .28em;
    color: #ffd36b; background: linear-gradient(100deg, #fff6d6 0%, #ffd36b 30%, #ff9ec8 50%, #ffd36b 70%, #fff6d6 100%) 0 0 / 220% 100%;
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 14px rgba(255,200,90,.45)); animation: sg-shine 5s linear infinite; }
  .sg-lead { max-width: 720px; margin: 0 auto; color: rgba(244,236,255,.86); font-size: 15px; line-height: 1.8; text-wrap: pretty; }
  .sg-lead b { color: #ffe8a8; }
  .sg-x { position: absolute; top: -6px; right: 0; width: 40px; height: 40px; border: 1px solid rgba(255,255,255,.25); border-radius: 50%; background: rgba(255,255,255,.06);
    color: #f4ecff; font-family: ${SANS}; font-size: 22px; line-height: 1; cursor: pointer; }
  .sg-x:hover, .sg-x:focus-visible { background: rgba(255,255,255,.16); outline: none; }
  .sg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(14px, 2.4vw, 22px); margin-top: clamp(18px, 3vw, 30px); }
  @media (max-width: 760px) { .sg-grid { grid-template-columns: 1fr; } }
  .sg-card { position: relative; isolation: isolate; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 18px 18px 16px; border: 1px solid rgba(255,255,255,.14); border-radius: 18px;
    background: linear-gradient(160deg, var(--sa), rgba(14,10,32,.78) 58%), rgba(14,10,32,.6); box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 10px 30px rgba(0,0,0,.35), 0 0 24px var(--sa);
    animation: sg-rise .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(.15s + var(--i, 0) * .12s); transition: transform .25s ease, box-shadow .25s ease, opacity .3s ease, filter .3s ease; }
  .sg-card::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; padding: 1px; pointer-events: none;
    background: linear-gradient(140deg, var(--sl), transparent 40%, transparent 60%, var(--sl)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; opacity: .55; }
  .sg-card:hover { transform: translateY(-4px); box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 16px 40px rgba(0,0,0,.45), 0 0 38px var(--sa); }
  .sg-root.is-picking .sg-card:not(.is-picked) { opacity: .38; filter: saturate(.6); transform: scale(.98); }
  .sg-card.is-picked { transform: translateY(-4px) scale(1.01); box-shadow: 0 0 0 2px var(--sl), 0 18px 46px rgba(0,0,0,.5), 0 0 48px var(--sg); }
  .sg-card.is-home { box-shadow: 0 0 0 2px #ffd36b, 0 10px 30px rgba(0,0,0,.35), 0 0 30px rgba(255,211,107,.35); }
  .sg-fx { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; border-radius: inherit; }
  .sg-top { display: flex; align-items: center; gap: 14px; }
  .sg-emb { position: relative; flex: 0 0 auto; display: grid; place-items: center; width: 66px; height: 66px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, var(--sl), var(--sc) 62%); box-shadow: 0 0 22px var(--sg), inset 0 0 0 2px rgba(255,255,255,.55); }
  .sg-emb::before { content: ''; position: absolute; inset: -6px; z-index: -1; border-radius: 50%; background: conic-gradient(from 0deg, var(--sl), transparent 30%, var(--sl) 50%, transparent 80%, var(--sl));
    filter: blur(1.5px); opacity: .85; animation: sg-spin 7s linear infinite; }
  .sg-emb b { color: #fff; font-family: ${KAI}; font-weight: 900; font-size: 34px; line-height: 1; text-shadow: 0 2px 4px rgba(0,0,0,.35); }
  .sg-name { min-width: 0; }
  .sg-name h3 { margin: 0; color: #fff; font-family: ${KAI}; font-weight: 900; font-size: 30px; line-height: 1.25; letter-spacing: .12em; text-shadow: 0 0 14px var(--sg); }
  .sg-name h3 small { margin-left: 8px; padding: 1px 9px; border-radius: 999px; background: #ffd36b; color: #3e2400; font-family: ${SANS}; font-size: 12px; font-weight: 800; letter-spacing: 0; vertical-align: 6px; }
  .sg-stat { margin: 3px 0 0; color: rgba(255,232,168,.92); font-size: 12.5px; font-weight: 700; }
  .sg-intro { margin: 0; color: rgba(244,236,255,.88); font-size: 14.5px; line-height: 1.75; text-wrap: pretty; }
  .sg-block { position: relative; margin: 0; padding: 10px 12px 10px 14px; border-radius: 12px; background: rgba(0,0,0,.24); border-left: 3px solid var(--sl); }
  .sg-label { display: inline-block; margin-bottom: 2px; padding: 0 8px; border-radius: 999px; background: var(--sc); color: #fff; font-size: 12px; font-weight: 800; letter-spacing: .2em; box-shadow: 0 0 10px var(--sg); }
  .sg-motto blockquote { margin: 4px 0 0; color: #fff4d2; font-family: ${KAI}; font-weight: 800; font-size: 21px; line-height: 1.55; letter-spacing: .04em; }
  .sg-motto blockquote::before { content: '“'; color: var(--sl); } .sg-motto blockquote::after { content: '”'; color: var(--sl); }
  .sg-motto cite { display: block; margin-top: 2px; color: rgba(244,236,255,.6); font-size: 12.5px; font-style: normal; text-align: right; }
  .sg-block p { margin: 6px 0 0; color: rgba(244,236,255,.8); font-size: 13.5px; line-height: 1.7; }
  .sg-way strong { display: block; margin-top: 4px; color: #fff; font-family: ${KAI}; font-weight: 800; font-size: 20px; letter-spacing: .14em; }
  .sg-act { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-top: auto; padding-top: 4px; }
  .sg-act p { flex: 1 1 100%; margin: 0; color: #ffe8a8; font-size: 13.5px; font-weight: 700; line-height: 1.6; text-align: left; }
  .sg-act p.is-error { color: #ffb4a0; }
  .sg-btn { padding: 10px 20px; border: 1px solid rgba(255,255,255,.3); border-radius: 999px; background: rgba(255,255,255,.08); color: #f4ecff;
    font-family: ${SANS}; font-weight: 800; font-size: 14.5px; line-height: 1.2; cursor: pointer; transition: transform .15s ease, box-shadow .2s ease, background .2s ease; }
  .sg-btn:hover:not(:disabled), .sg-btn:focus-visible { transform: translateY(-1px); background: rgba(255,255,255,.16); outline: none; }
  .sg-btn.is-go { position: relative; overflow: hidden; border-color: var(--sl); background: linear-gradient(180deg, var(--sl), var(--sc) 70%); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.35); box-shadow: 0 0 16px var(--sg); }
  .sg-btn.is-go::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.6) 50%, transparent 65%) -160% 0 / 220% 100% no-repeat;
    animation: sg-sweep 3.2s ease-in-out 1s infinite; }
  .sg-btn:disabled { opacity: .55; cursor: default; }
  .sg-here { padding: 6px 14px; border-radius: 999px; background: rgba(255,211,107,.18); color: #ffe8a8; font-size: 13.5px; font-weight: 800; }
  .sg-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin-top: clamp(18px, 3vw, 28px); animation: sg-rise .7s ease both; animation-delay: .7s; }
  .sg-foot p { flex: 1 1 100%; max-width: 760px; margin: 4px auto 0; color: rgba(244,236,255,.55); font-size: 12.5px; line-height: 1.7; text-align: center; }
  /* 特效：枫霞谷落枫 */
  .sg-leaf { position: absolute; top: -30px; left: var(--x); width: var(--s); height: var(--s); color: var(--c, #ff8a5c); opacity: .85; animation: sg-fall var(--d) linear var(--w) infinite; }
  .sg-leaf svg { width: 100%; height: 100%; fill: currentColor; filter: drop-shadow(0 0 4px rgba(255,140,90,.6)); animation: sg-sway calc(var(--d) / 3) ease-in-out infinite alternate; }
  /* 玄月宗：新月与星点 */
  .sg-moon { position: absolute; top: 12px; right: 16px; width: 74px; height: 74px; border-radius: 50%; box-shadow: inset -16px 8px 0 0 #f6eeff; filter: drop-shadow(0 0 14px rgba(210,195,255,.9)); opacity: .7; animation: sg-glow 4.5s ease-in-out infinite alternate; }
  .sg-dot { position: absolute; left: var(--x); top: var(--y); width: var(--s); height: var(--s); border-radius: 50%; background: #fff; box-shadow: 0 0 6px #fff; opacity: .2; animation: sg-blink var(--d) ease-in-out var(--w) infinite alternate; }
  /* 灵犀山：萤火 */
  .sg-fly { position: absolute; left: var(--x); top: var(--y); width: 6px; height: 6px; border-radius: 50%; background: #d8ffe9; box-shadow: 0 0 10px 3px rgba(130,255,190,.75); opacity: 0;
    animation: sg-float var(--d) ease-in-out var(--w) infinite; }
  /* 星澜宫：流星 */
  .sg-shoot { position: absolute; left: var(--x); top: var(--y); width: 120px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, rgba(255,255,255,0), #fff); opacity: 0;
    transform: rotate(-28deg); filter: drop-shadow(0 0 6px #bfe0ff); animation: sg-shoot var(--d) ease-in var(--w) infinite; }
  /* 拜入成功 */
  .sg-cele { position: fixed; inset: 0; z-index: 2; display: grid; place-items: center; padding: 20px; background: radial-gradient(circle at 50% 42%, var(--sa), transparent 62%), rgba(8,6,20,.95); animation: sg-fade .4s ease both; }
  .sg-cele-in { position: relative; display: grid; justify-items: center; gap: 8px; max-width: 560px; text-align: center; }
  .sg-rays { position: absolute; top: 72px; left: 50%; width: 520px; height: 520px; margin: -260px 0 0 -260px; border-radius: 50%; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, var(--sg) 0deg 4deg, transparent 4deg 18deg); -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%); mask: radial-gradient(circle, #000 18%, transparent 68%);
    opacity: .55; animation: sg-spin 18s linear infinite; }
  .sg-burst { position: absolute; top: 72px; left: 50%; width: 0; height: 0; pointer-events: none; }
  .sg-burst i { position: absolute; width: 8px; height: 8px; margin: -4px; border-radius: 50%; background: var(--k); box-shadow: 0 0 8px var(--k); opacity: 0;
    animation: sg-pop 1.4s cubic-bezier(.15,.7,.3,1) var(--w) both; }
  .sg-cele .sg-emb { width: 144px; height: 144px; animation: sg-zoom .8s cubic-bezier(.2,1.4,.4,1) both; }
  .sg-cele .sg-emb b { font-size: 76px; }
  .sg-cele h3 { margin: 18px 0 0; color: #fff; font-family: ${KAI}; font-weight: 900; font-size: clamp(28px, 6vw, 40px); letter-spacing: .14em; text-shadow: 0 0 18px var(--sg); animation: sg-rise .7s ease .35s both; }
  .sg-cele blockquote { margin: 0; color: #fff4d2; font-family: ${KAI}; font-weight: 800; font-size: clamp(19px, 4vw, 24px); line-height: 1.6; animation: sg-rise .7s ease .55s both; }
  .sg-cele p { margin: 0; color: rgba(244,236,255,.85); font-size: 14.5px; line-height: 1.7; animation: sg-rise .7s ease .7s both; }
  .sg-cele .sg-btn { margin-top: 10px; animation: sg-rise .7s ease .9s both; }
  @keyframes sg-fade { from { opacity: 0; } }
  @keyframes sg-down { from { opacity: 0; transform: translateY(-16px); } }
  @keyframes sg-rise { from { opacity: 0; transform: translateY(24px); } }
  @keyframes sg-shine { to { background-position: -220% 0; } }
  @keyframes sg-twinkle { from { opacity: .25; } to { opacity: .6; } }
  @keyframes sg-drift { to { transform: translate(12vmax, -6vmax) scale(1.15); } }
  @keyframes sg-spin { to { transform: rotate(1turn); } }
  @keyframes sg-sweep { to { background-position: 260% 0; } }
  @keyframes sg-fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 10% { opacity: .9; } 90% { opacity: .8; } 100% { transform: translate(var(--dx), 520px) rotate(var(--r)); opacity: 0; } }
  @keyframes sg-sway { from { transform: translateX(-8px) rotate(-12deg); } to { transform: translateX(8px) rotate(12deg); } }
  @keyframes sg-glow { from { opacity: .45; } to { opacity: .85; } }
  @keyframes sg-blink { to { opacity: .95; } }
  @keyframes sg-float { 0% { opacity: 0; transform: translate(0, 0); } 30% { opacity: .95; } 70% { opacity: .7; } 100% { opacity: 0; transform: translate(var(--dx), -70px); } }
  @keyframes sg-shoot { 0% { opacity: 0; transform: rotate(-28deg) translateX(0); } 8% { opacity: 1; } 30% { opacity: 0; transform: rotate(-28deg) translateX(-260px); } 100% { opacity: 0; transform: rotate(-28deg) translateX(-260px); } }
  @keyframes sg-pop { 0% { opacity: 1; transform: translate(0, 0) scale(.6); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1); } }
  @keyframes sg-zoom { from { opacity: 0; transform: scale(.2) rotate(-40deg); } }
  @media (prefers-reduced-motion: reduce) { .sg-root, .sg-root *, .sg-root *::before, .sg-root *::after { animation: none !important; transition: none !important; } .sg-fx { display: none; } }
  `;
  let styled = false;
  function addStyle() {
    if (styled) return;
    styled = true;
    const style = document.createElement('style');
    style.dataset.readable = 'panel';   // 字号按学生选的档位温和放大（live-readable.js）
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // 每宗一种特效（数量少、纯 CSS 动画）
  const LEAF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l1.7 4.4 3.5-1.7-1 4.1 4.2-.7-2.7 3.4 3.8 1.5-4.6 1.3.7 2.7-3.8-1.5-.7 5h-2.2l-.7-5-3.8 1.5.7-2.7-4.6-1.3 3.8-1.5-2.7-3.4 4.2.7-1-4.1 3.5 1.7z"/></svg>';
  const rand = (a, b) => a + Math.random() * (b - a);
  function effects(key) {
    const out = [];
    if (key === 'fengxia') {
      for (let i = 0; i < 7; i += 1) {
        out.push(`<i class="sg-leaf" style="--x:${rand(4, 92).toFixed(0)}%;--s:${rand(14, 24).toFixed(0)}px;--d:${rand(7, 12).toFixed(1)}s;--w:${rand(-10, 0).toFixed(1)}s;--dx:${rand(-60, 60).toFixed(0)}px;--r:${rand(200, 540).toFixed(0)}deg;--c:${['#ff8a5c', '#ffb347', '#e8553a', '#ffcf70'][i % 4]}">${LEAF}</i>`);
      }
    } else if (key === 'xuanyue') {
      out.push('<i class="sg-moon"></i>');
      for (let i = 0; i < 10; i += 1) out.push(`<i class="sg-dot" style="--x:${rand(4, 96).toFixed(0)}%;--y:${rand(4, 96).toFixed(0)}%;--s:${rand(1.5, 3).toFixed(1)}px;--d:${rand(1.6, 3.6).toFixed(1)}s;--w:${rand(-3, 0).toFixed(1)}s"></i>`);
    } else if (key === 'lingxi') {
      for (let i = 0; i < 9; i += 1) out.push(`<i class="sg-fly" style="--x:${rand(6, 94).toFixed(0)}%;--y:${rand(30, 96).toFixed(0)}%;--d:${rand(4.5, 8).toFixed(1)}s;--w:${rand(-8, 0).toFixed(1)}s;--dx:${rand(-40, 40).toFixed(0)}px"></i>`);
    } else if (key === 'xinglan') {
      for (let i = 0; i < 3; i += 1) out.push(`<i class="sg-shoot" style="--x:${rand(55, 100).toFixed(0)}%;--y:${rand(0, 45).toFixed(0)}%;--d:${rand(4, 7).toFixed(1)}s;--w:${(i * 1.7).toFixed(1)}s"></i>`);
      for (let i = 0; i < 8; i += 1) out.push(`<i class="sg-dot" style="--x:${rand(4, 96).toFixed(0)}%;--y:${rand(4, 96).toFixed(0)}%;--s:${rand(1.5, 2.6).toFixed(1)}px;--d:${rand(1.4, 3).toFixed(1)}s;--w:${rand(-3, 0).toFixed(1)}s"></i>`);
    }
    return out.join('');
  }

  // opts: { sects: [{...SECTS 项, points, members, class_members, rank}], mode: 'join' | 'switch', current: 当前宗门键（switch）, welcome, preview,
  //         onPick(key) → Promise<{ ok, message }>（key 为宗门键或 sanxiu）, onClose() }
  function open(opts) {
    addStyle();
    const mode = opts.mode === 'switch' ? 'switch' : 'join';
    const sects = opts.sects || [];
    const home = sects.find((sect) => sect.key === opts.current);
    const root = document.createElement('div');
    root.className = 'sg-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', mode === 'switch' ? '改投他宗' : '拜入宗门');
    const lead = mode === 'switch'
      ? `你是「${esc(home ? home.name : '')}」弟子。<b>改投机会只有一次</b>：改投以后修为随你转到新宗门，不能再换，也不能退为散修。`
      : `${opts.welcome ? '恭喜你修成「筑基」！' : ''}四大宗门山门大开、广纳贤才。选一个最合你心意的宗门拜入，从此你的修为计入宗门，与历届同门一起为宗门争光；也可以暂做散修，想清楚再来。<b>拜入以后就不能再变回散修，只有一次改投他宗的机会。</b>`;
    const cards = sects.map((sect, i) => {
      const isHome = mode === 'switch' && sect.key === opts.current;
      return `<article class="sg-card${isHome ? ' is-home' : ''}" style="${vars(sect)};--i:${i}" data-sg-card="${esc(sect.key)}">
        <div class="sg-fx" aria-hidden="true">${effects(sect.key)}</div>
        <div class="sg-top"><span class="sg-emb" aria-hidden="true"><b>${esc(sect.mark)}</b></span>
          <div class="sg-name"><h3>${esc(sect.name)}${isHome ? '<small>本门</small>' : ''}</h3>
            <p class="sg-stat">宗门分 ${num(sect.points)}${sect.rank ? ` · 第 ${Number(sect.rank)} 名` : ''} · 历届弟子 ${Number(sect.members) || 0} 人（本班 ${Number(sect.class_members) || 0} 人）</p></div></div>
        <p class="sg-intro">${esc(sect.intro || '')}</p>
        <section class="sg-block sg-motto"><span class="sg-label">宗训</span><blockquote>${esc(sect.motto)}</blockquote><cite>——${esc(sect.source)}</cite>${sect.mottoNote ? `<p>${esc(sect.mottoNote)}</p>` : ''}</section>
        <section class="sg-block sg-way"><span class="sg-label">宗风</span><strong>${esc(sect.way)}</strong>${sect.wayNote ? `<p>${esc(sect.wayNote)}</p>` : ''}</section>
        <div class="sg-act" data-sg-act>${isHome ? '<span class="sg-here">你现在是本门弟子</span>'
          : `<button type="button" class="sg-btn is-go" data-sg-pick="${esc(sect.key)}">${mode === 'switch' ? '改投' : '拜入'}${esc(sect.name)}</button>`}</div>
      </article>`;
    }).join('');
    root.innerHTML = `<div class="sg-sky" aria-hidden="true"><i class="sg-mist is-a"></i><i class="sg-mist is-b"></i><i class="sg-mist is-c"></i><i class="sg-stars"></i><i class="sg-stars is-b"></i></div>
      <div class="sg-wrap">
        <header class="sg-head"><p class="sg-kicker">${mode === 'switch' ? '改投他宗 · 仅此一次' : opts.welcome ? '恭喜筑基' : '四大宗门'}</p>
          <h2 class="sg-title">${mode === 'switch' ? '改投他宗' : '山门大开'}</h2><p class="sg-lead">${lead}</p>
          <button type="button" class="sg-x" data-sg-close aria-label="关闭">×</button></header>
        <div class="sg-grid">${cards}</div>
        <footer class="sg-foot">${mode === 'join' ? '<button type="button" class="sg-btn" data-sg-sanxiu>暂做散修</button>' : ''}
          <button type="button" class="sg-btn" data-sg-close>${mode === 'join' ? '稍后再说' : '不改了'}</button>
          <p>宗门分＝本课程历届弟子的修为之和（按老师最近一次结算）。弟子结课以后修为仍留在宗门里，一届一届传承下去；散修不计入任何宗门。宗门本身不加修为，是归属，也是集体荣誉。${opts.preview ? '（测试页：不会真的拜入。）' : ''}</p></footer>
      </div>`;
    const lastFocus = document.activeElement;
    const oldOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(root);
    let busy = false;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      root.remove();
      document.documentElement.style.overflow = oldOverflow;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose();
    }
    const actOf = (key) => root.querySelector(`[data-sg-card="${key}"] [data-sg-act]`);
    function resetActs() {
      root.classList.remove('is-picking');
      root.querySelectorAll('.sg-card').forEach((card) => {
        card.classList.remove('is-picked');
        const sect = sects.find((item) => item.key === card.dataset.sgCard);
        const act = card.querySelector('[data-sg-act]');
        if (sect && act && !(mode === 'switch' && sect.key === opts.current)) {
          act.innerHTML = `<button type="button" class="sg-btn is-go" data-sg-pick="${esc(sect.key)}">${mode === 'switch' ? '改投' : '拜入'}${esc(sect.name)}</button>`;
        }
      });
    }
    function pick(key) {
      resetActs();
      const sect = sects.find((item) => item.key === key);
      const card = root.querySelector(`[data-sg-card="${key}"]`);
      if (!sect || !card) return;
      root.classList.add('is-picking');
      card.classList.add('is-picked');
      const ask = mode === 'switch'
        ? `确定从「${esc(home ? home.name : '')}」改投「${esc(sect.name)}」吗？改投机会只有一次，改投以后不能再换，也不能退为散修。`
        : `确定拜入「${esc(sect.name)}」吗？拜入以后就不能再变回散修，只有一次改投他宗的机会。`;
      actOf(key).innerHTML = `<p>${ask}</p><button type="button" class="sg-btn" data-sg-cancel>再想想</button>
        <button type="button" class="sg-btn is-go" data-sg-confirm="${esc(key)}">${mode === 'switch' ? '确定改投' : '确定拜入'}</button>`;
      const go = actOf(key).querySelector('[data-sg-confirm]');
      go.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function celebrate(sect) {
      const colors = [sect.glow, sect.color, '#ffd36b', '#ffffff'];
      const burst = Array.from({ length: 36 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 36 + rand(-0.08, 0.08);
        const dist = rand(120, 240);
        return `<i style="--k:${colors[i % colors.length]};--dx:${(Math.cos(angle) * dist).toFixed(0)}px;--dy:${(Math.sin(angle) * dist).toFixed(0)}px;--w:${rand(0.15, 0.45).toFixed(2)}s"></i>`;
      }).join('');
      const box = document.createElement('div');
      box.className = 'sg-cele';
      box.setAttribute('style', vars(sect));
      box.innerHTML = `<div class="sg-cele-in"><i class="sg-rays" aria-hidden="true"></i><span class="sg-burst" aria-hidden="true">${burst}</span>
        <span class="sg-emb" aria-hidden="true"><b>${esc(sect.mark)}</b></span>
        <h3>${mode === 'switch' ? '改投' : '拜入'}${esc(sect.name)}</h3>
        <blockquote>“${esc(sect.motto)}”</blockquote>
        <p>${mode === 'switch' ? `你的修为已随你转入${esc(sect.name)}，改投机会已经用完。` : `从此你的修为计入${esc(sect.name)}，与历届同门一起为宗门争光。`}宗风：${esc(sect.way)}。</p>
        <button type="button" class="sg-btn is-go" data-sg-close>进入山门</button></div>`;
      root.appendChild(box);
      box.querySelector('[data-sg-close]').focus({ preventScroll: true });
    }
    async function confirm(key) {
      if (busy) return;
      busy = true;
      const act = key === 'sanxiu' ? null : actOf(key);
      const buttons = Array.from(root.querySelectorAll('button'));
      buttons.forEach((button) => { button.disabled = true; });
      let result = { ok: false, message: '没有成功，请检查网络后再试。' };
      try { result = (await opts.onPick(key)) || result; } catch (problem) { console.error(problem); }
      buttons.forEach((button) => { button.disabled = false; });
      busy = false;
      if (!result.ok) {
        if (act) {
          const note = act.querySelector('p') || act.insertBefore(document.createElement('p'), act.firstChild);
          note.className = 'is-error';
          note.textContent = result.message || '没有成功，请稍后再试。';
        }
        return;
      }
      if (key === 'sanxiu') { close(); return; }
      celebrate(sects.find((item) => item.key === key));
    }
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-sg-close]')) { close(); return; }
      const want = event.target.closest('[data-sg-pick]');
      if (want) { pick(want.dataset.sgPick); return; }
      if (event.target.closest('[data-sg-cancel]')) { resetActs(); return; }
      const go = event.target.closest('[data-sg-confirm]');
      if (go) { confirm(go.dataset.sgConfirm); return; }
      if (event.target.closest('[data-sg-sanxiu]')) confirm('sanxiu');
    });
    root.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { if (root.classList.contains('is-picking') && !root.querySelector('.sg-cele')) resetActs(); else close(); }
    });
    ['keyup', 'input'].forEach((type) => root.addEventListener(type, (event) => event.stopPropagation()));
    root.querySelector('.sg-x').focus({ preventScroll: true });
    return { close };
  }

  window.ClassLiveSect = { open };
})();
