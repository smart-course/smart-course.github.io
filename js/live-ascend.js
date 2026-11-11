/* 境界突破画面（2026-11-11 用户：“学生突破元婴的话在课堂页面和学生自己的页面会有类似于祭出法宝的动画（可参照凡人修仙传的突破元婴的动画）和祝福语。
 *   只要在该台设备没出现过，无论是课堂页面还是学生页面，下次登陆的时候都会在各自的页面出现一次。”）
 *   第二版（同日，用户：“突破元婴和化神的动画可以参照网上的一些图片再重新设计一下，可以设计得霸气一些”）：参照网上常见的渡劫、法相天地插画的构图——
 *   劫云漩涡压顶、九霄雷柱劈落、脚下法阵、金丹碎裂冲霄光柱、身后巨大法相升起睁眼、两个行草大字砸落、名牌和祝福语。画面全部原创（SVG／CSS 绘制），
 *   不取用任何作品或图片。约 9.8 秒，点画面或按 Esc 可提前关闭。
 *   时间轴：0—1.5 秒劫云聚顶、法阵亮起 → 1.55／2.05／2.5 秒三道天雷（劈在两侧地面、再劈中头顶）→ 3.0 秒九霄雷柱（全屏白闪、重震）
 *   → 3.75 秒金丹碎裂、冲霄光柱、云开 → 4.2 秒法相升起、背光与符文轮 → 5.0／5.35 秒两个大字砸落 → 5.9 秒法相睁眼 → 6.2 秒名牌。
 *   元婴（level 3）紫电金身；化神（level 4）金雷七彩神光，另有金色花雨。
 *
 *   window.ClassLiveAscend.play({ level, names, self, fit, layer, blessing }) → Promise（画面结束时完成）
 *     names＝突破的同学姓名（投屏页可以几位一起；匿名时传空数组，显示“本班同学”），self＝学生本人页面（名牌写“恭喜你”），
 *     fit＝'wide'（投屏：1280×720 等比放进屏幕）或 'narrow'（学生页：两侧可略裁，手机上更大）。几次调用会排队依次播放。
 *   window.ClassLiveAscend.blessing(level)：随机取一句祝福语。
 */
(function () {
  'use strict';
  if (window.ClassLiveAscend) return;
  const LEVELS = {
    3: {
      realm: '元婴', title: '突破元婴', verb: '碎丹成婴', chars: ['元', '婴'],
      veil: 'radial-gradient(ellipse at 50% 28%, #2a1052 0%, #0e061e 55%, #04020a 100%)',
      vortex: ['#0c051a', '#4a1f8e', '#a274ff'], vortexGlow: 'rgba(214,186,255,1)',
      cloud: ['rgba(18,9,36,.97)', 'rgba(46,22,86,.93)', 'rgba(10,5,22,.98)'],
      bolt: '#f8f3ff', boltGlow: '#a46cff', boltGlow2: '#7fd6ff',
      core: ['#fffbe6', '#ffe08a', '#ffb43c', '#d9781a'],
      pillar: ['rgba(255,214,120,.55)', '#fff8e6'],
      ring: ['rgba(255,214,120,.95)', 'rgba(190,150,255,.95)', 'rgba(255,240,200,.9)'],
      sky: 'radial-gradient(ellipse 54% 36% at 50% 48%, rgba(255,214,140,.42), rgba(150,100,240,.2) 40%, transparent 72%)',
      fa: ['rgba(255,242,200,.8)', 'rgba(222,184,255,.52)', 'rgba(110,60,210,.2)'], faLine: '#ffe9a8', faGlow: 'rgba(196,150,255,.95)', eye: '#fff7d6',
      halo: 'conic-gradient(from 0deg, #ffd36b, #c79bff, #ffe9a8, #8e5cf0, #ffd36b)', corona: 'rgba(255,226,160,.9)',
      rune: '#ffe08a', array: '#c9a0ff',
      ray: 'rgba(255,224,150,.2)', ray2: 'rgba(196,156,255,.17)',
      mote: ['#ffe9a8', '#d8b4ff', '#fff6d8'],
      glyph: 'linear-gradient(180deg, #fffbe8 0%, #ffe08a 30%, #c8901e 50%, #ffd36b 66%, #fff3c4 100%)', glyphGlow: 'rgba(170,120,255,.95)',
      ink: ['#4e0610', '#b3141e'],
      titleCss: 'background-image:linear-gradient(100deg,#ffe9a8,#fff8e6 30%,#d8b4ff 55%,#ffe08a 80%,#ffe9a8);',
      petals: null,
      blessings: [
        '雷劫已过，元婴已成。愿你守住这份恒心，向化神再进一步！',
        '金丹化婴，神识初开。一路修来不容易，为你喝彩！',
        '丹破婴生，紫气东来。此后道途更宽，继续勤修不辍！',
        '碎丹成婴，脱胎换骨。愿你以此为新起点，学而不倦，思而有得！',
      ],
    },
    4: {
      realm: '化神', title: '突破化神', verb: '元婴化神', chars: ['化', '神'],
      veil: 'radial-gradient(ellipse at 50% 28%, #382660 0%, #120c26 55%, #06040e 100%)',
      vortex: ['#100b24', '#5a4596', '#ffc95a'], vortexGlow: 'rgba(255,232,170,1)',
      cloud: ['rgba(24,18,48,.96)', 'rgba(62,46,104,.92)', 'rgba(14,10,30,.97)'],
      bolt: '#fffbe8', boltGlow: '#ffbf3a', boltGlow2: '#ff8fc4',
      core: ['#ffffff', '#fff1b8', '#ffc86b', '#ff8fc4'],
      pillar: ['rgba(255,226,150,.6)', '#ffffff'],
      ring: ['rgba(255,211,107,.95)', 'rgba(255,143,196,.95)', 'rgba(127,216,255,.95)'],
      sky: 'radial-gradient(ellipse 56% 38% at 50% 48%, rgba(255,236,170,.55), rgba(255,160,210,.22) 40%, transparent 72%)',
      fa: ['rgba(255,255,255,.86)', 'rgba(255,228,160,.56)', 'rgba(255,150,200,.2)'], faLine: '#fff3c4', faGlow: 'rgba(255,214,120,1)', eye: '#ffffff',
      halo: 'conic-gradient(from 0deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #8be3b0, #ffd36b)', corona: 'rgba(255,240,190,.95)',
      rune: '#fff1b8', array: '#ffd36b',
      ray: 'rgba(255,236,170,.26)', ray2: 'rgba(160,220,255,.2)',
      mote: ['#ffe9a8', '#ff9fd0', '#9fe3ff'],
      glyph: 'linear-gradient(180deg, #ffffff 0%, #fff0b8 24%, #e6a51e 48%, #ffd36b 66%, #fffbe8 100%)', glyphGlow: 'rgba(255,200,90,1)',
      ink: ['#5a0a0a', '#c8281e'],
      titleCss: 'background-image:linear-gradient(100deg,#ffd36b,#ff8fc4 25%,#b98cff 50%,#7fd8ff 75%,#ffd36b);',
      petals: ['#ffe08a', '#ffb3d1', '#fff6d8', '#ffd36b'],
      blessings: [
        '元婴化神，神光照彻。你已站上本课修行之巅，愿你学以致用、行稳致远！',
        '炼神还虚，化神功成。为你的坚持与悟性喝彩！',
        '神游太虚，一念万里。愿你把这份修为带到更远的地方！',
      ],
    },
  };
  const DURATION = 9800;   // 与 .cl-ascend 的 cl-as-life 一致
  // 震屏时刻：天雷三道、九霄雷柱、金丹碎裂、两个大字砸落
  const SHAKES = [['s', 1.55, 0.3], ['s', 2.05, 0.3], ['m', 2.5, 0.36], ['l', 3.0, 0.7], ['l', 3.75, 0.6], ['m', 5.0, 0.32], ['m', 5.35, 0.32]];
  const style = document.createElement('style');
  style.dataset.readable = 'skip';   // 场景按 1280×720 缩放，不参与学生页字号调整（live-readable.js）
  style.textContent = `
  .cl-ascend { position: fixed; inset: 0; z-index: 2147483100; overflow: hidden; cursor: pointer; animation: cl-as-life ${DURATION}ms ease forwards; }
  @keyframes cl-as-life { 0% { opacity: 0; } 4% { opacity: 1; } 93% { opacity: 1; } 100% { opacity: 0; } }
  .cl-ascend.is-closing { animation: cl-as-out .45s ease forwards; }
  @keyframes cl-as-out { to { opacity: 0; } }
  .cl-as-veil { position: absolute; inset: 0; }
  .cl-as-box { position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px; transform: translate(-50%, -50%) scale(var(--as-scale, 1)); }
  .cl-as-box * { box-sizing: content-box; }
  .cl-as-stage { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; animation: ${SHAKES.map(([k, t, d]) => `cl-as-shk-${k} ${d}s linear ${t}s`).join(', ')}; }
  @keyframes cl-as-shk-s { 0%, 100% { transform: none; } 25% { transform: translate(-4px, 3px); } 50% { transform: translate(4px, -3px); } 75% { transform: translate(-2px, -2px); } }
  @keyframes cl-as-shk-m { 0%, 100% { transform: none; } 15% { transform: translate(-9px, 6px); } 35% { transform: translate(8px, -7px); } 55% { transform: translate(-6px, -4px); } 75% { transform: translate(4px, 5px); } }
  @keyframes cl-as-shk-l { 0%, 100% { transform: none; } 8% { transform: translate(-18px, 12px) rotate(-.5deg); } 18% { transform: translate(16px, -14px) rotate(.5deg); } 30% { transform: translate(-13px, -9px); }
    42% { transform: translate(11px, 12px) rotate(.3deg); } 56% { transform: translate(-8px, 6px); } 70% { transform: translate(6px, -5px); } 85% { transform: translate(-3px, 3px); } }
  .cl-as-abs { position: absolute; left: 0; top: 0; overflow: visible; }
  @keyframes cl-as-show { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cl-as-hide { to { opacity: 0; } }
  @keyframes cl-as-spin { to { transform: rotate(360deg); } }
  @keyframes cl-as-spin-r { to { transform: rotate(-360deg); } }
  /* 云开以后天光 */
  .cl-as-sky { position: absolute; left: -200px; top: -400px; width: 1680px; height: 1120px; opacity: 0; animation: cl-as-show 1.4s ease-out 3.85s forwards; }
  /* 背后的光芒 */
  .cl-as-rays { position: absolute; left: -60px; top: -568px; width: 1400px; height: 1400px; border-radius: 50%; opacity: 0;
    -webkit-mask-image: radial-gradient(circle, #000 12%, transparent 58%); mask-image: radial-gradient(circle, #000 12%, transparent 58%);
    animation: cl-as-show 1s ease-out 4.25s forwards, cl-as-spin 40s linear 4.25s infinite; }
  /* 劫云漩涡：压在头顶的大旋涡（外层压扁成椭圆，中层出现/散去，内层旋转），中心随天雷闪亮 */
  .cl-as-vortex { position: absolute; left: 140px; top: -440px; width: 1000px; height: 1000px; transform: scaleY(.32); }
  .cl-as-vx { position: absolute; inset: 0; opacity: 0; animation: cl-as-vx-in 1.5s ease-out .05s forwards, cl-as-vx-out 1.1s ease-in 3.85s forwards; }
  @keyframes cl-as-vx-in { from { opacity: 0; transform: scale(.45); } to { opacity: 1; transform: none; } }
  @keyframes cl-as-vx-out { to { opacity: 0; transform: scale(1.7); } }
  .cl-as-vx-disc { position: absolute; inset: 0; border-radius: 50%; animation: cl-as-spin 6s linear infinite;
    -webkit-mask-image: radial-gradient(circle, #000 42%, transparent 72%); mask-image: radial-gradient(circle, #000 42%, transparent 72%); }
  .cl-as-vx-rim { position: absolute; inset: 8%; border-radius: 50%; animation: cl-as-spin-r 9s linear infinite; }
  .cl-as-vx-flash { position: absolute; inset: 0; border-radius: 50%; opacity: 0; animation: ${[1.45, 1.95, 2.4, 2.9, 3.05].map((t) => `cl-as-blink .45s ease-out ${t}s`).join(', ')}; }
  @keyframes cl-as-blink { 0% { opacity: 0; } 15% { opacity: 1; } 35% { opacity: .3; } 50% { opacity: .9; } 100% { opacity: 0; } }
  /* 劫云：两侧翻滚压来，云开时向两边退散 */
  .cl-as-cloud { position: absolute; border-radius: 50%; filter: blur(24px); opacity: 0; animation: cl-as-cloud-in 1.5s ease-out forwards, cl-as-cloud-part 1.6s ease-in-out 3.85s forwards; }
  @keyframes cl-as-cloud-in { from { opacity: 0; transform: translate(var(--fx, 0), -110px) scale(1.35); } to { opacity: 1; transform: none; } }
  @keyframes cl-as-cloud-part { to { opacity: .3; transform: translateX(var(--px, 0)) scale(1.15); } }
  /* 天雷 */
  .cl-as-bolt { opacity: 0; animation: cl-as-bolt .5s ease-out forwards; }
  @keyframes cl-as-bolt { 0% { opacity: 0; } 6% { opacity: 1; } 20% { opacity: .2; } 32% { opacity: 1; } 50% { opacity: .5; } 62% { opacity: .95; } 100% { opacity: 0; } }
  .cl-as-bolt.is-big { animation: cl-as-bolt-big 1s ease-out forwards; }
  @keyframes cl-as-bolt-big { 0% { opacity: 0; } 4% { opacity: 1; } 14% { opacity: .35; } 22% { opacity: 1; } 34% { opacity: .5; } 46% { opacity: 1; } 70% { opacity: .8; } 100% { opacity: 0; } }
  .cl-as-beam { position: absolute; left: 550px; top: 40px; width: 180px; height: 400px; mix-blend-mode: screen; opacity: 0; transform-origin: 50% 0; filter: blur(1.5px); animation: cl-as-beam 1s ease-out 3s forwards; }
  @keyframes cl-as-beam { 0% { opacity: 0; transform: scale(.6, .1); } 7% { opacity: 1; transform: none; } 20% { opacity: .55; transform: scaleX(.65); } 32% { opacity: 1; transform: scaleX(1.2); }
    55% { opacity: .85; transform: scaleX(.85); } 100% { opacity: 0; transform: scaleX(.25); } }
  .cl-as-flash { position: absolute; inset: -240px; opacity: 0; animation: cl-as-flash .5s ease-out forwards; }
  @keyframes cl-as-flash { 0% { opacity: 0; } 10% { opacity: var(--fo, .8); } 100% { opacity: 0; } }
  /* 雷电绕身 */
  .cl-as-arcs { opacity: 0; animation: cl-as-show .1s linear 1.5s forwards, cl-as-hide .25s linear 3.75s forwards; }
  .cl-as-arc { animation: cl-as-flick .16s steps(1) infinite; }
  @keyframes cl-as-flick { 0% { opacity: 1; } 50% { opacity: .08; } }
  /* 火花 */
  .cl-as-spark { position: absolute; width: 3px; height: 14px; margin: -7px 0 0 -1.5px; border-radius: 2px; opacity: 0; animation: cl-as-spark .7s cubic-bezier(.1,.8,.3,1) forwards; }
  @keyframes cl-as-spark { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(1.4); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scaleY(.4); } }
  /* 脚下法阵（透视压扁的圆盘，慢慢转），雷柱落下时一亮 */
  .cl-as-array { position: absolute; left: 330px; top: 218px; width: 620px; height: 620px; transform: perspective(900px) rotateX(74deg); opacity: 0;
    animation: cl-as-show 1s ease-out .35s forwards, cl-as-array-hit .9s ease-out 3s; }
  @keyframes cl-as-array-hit { 0% { filter: brightness(1); } 15% { filter: brightness(2.6); } 100% { filter: brightness(1); } }
  .cl-as-array svg { display: block; width: 100%; height: 100%; overflow: visible; animation: cl-as-spin 22s linear infinite; }
  /* 地面冲击波 */
  .cl-as-shock { position: absolute; left: 540px; top: 498px; width: 200px; height: 56px; border-radius: 50%; border: 4px solid; opacity: 0; animation: cl-as-shock 1.1s ease-out forwards; }
  @keyframes cl-as-shock { 0% { opacity: 1; transform: scale(.3); } 100% { opacity: 0; transform: scale(6.5); } }
  /* 打坐的修士（剪影，碎丹后通体发光） */
  .cl-as-me { position: absolute; overflow: visible; }
  .cl-as-me-lit { opacity: 0; animation: cl-as-show .8s ease-out 3.8s forwards; }
  /* 金丹：吸收天雷、裂开、碎去 */
  .cl-as-core { position: absolute; left: 625px; top: 467px; width: 30px; height: 30px; border-radius: 50%; opacity: 0;
    animation: cl-as-core-in .6s ease-out .5s forwards, ${[1.6, 2.1, 2.55].map((t) => `cl-as-core-hit .35s ease-out ${t}s`).join(', ')}, cl-as-core-hit .55s ease-out 3.05s, cl-as-core-burst .45s ease-in 3.7s forwards; }
  @keyframes cl-as-core-in { from { opacity: 0; transform: scale(.2); } to { opacity: 1; transform: none; } }
  @keyframes cl-as-core-hit { 0% { transform: scale(1); filter: brightness(1); } 30% { transform: scale(1.5); filter: brightness(2.2); } 100% { transform: scale(1.1); filter: brightness(1.2); } }
  @keyframes cl-as-core-burst { 0% { opacity: 1; transform: scale(1.2); } 55% { opacity: 1; transform: scale(2.2); filter: brightness(2.6); } 100% { opacity: 0; transform: scale(3.6); } }
  .cl-as-crack path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cl-as-crack .4s ease-out forwards; }
  @keyframes cl-as-crack { to { stroke-dashoffset: 0; } }
  .cl-as-crack { animation: cl-as-hide .2s ease-in 3.78s forwards; }
  .cl-as-shard { position: absolute; left: 640px; top: 482px; width: 12px; height: 26px; margin: -13px 0 0 -6px; clip-path: polygon(50% 0, 100% 40%, 50% 100%, 0 40%); opacity: 0;
    animation: cl-as-shard 1.3s cubic-bezier(.12,.75,.3,1) 3.75s forwards; }
  @keyframes cl-as-shard { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1.2); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(.35); } }
  .cl-as-ring { position: absolute; left: 580px; top: 422px; width: 120px; height: 120px; border-radius: 50%; border: 5px solid; opacity: 0; animation: cl-as-ring 1.5s ease-out forwards; }
  @keyframes cl-as-ring { 0% { opacity: .95; transform: scale(.3); } 100% { opacity: 0; transform: scale(8); } }
  /* 冲霄光柱：金丹碎时从身上直冲云霄，之后变细留着 */
  .cl-as-pillar { position: absolute; left: 585px; top: -80px; width: 110px; height: 570px; transform-origin: 50% 100%; opacity: 0; filter: blur(2px);
    animation: cl-as-pillar .45s cubic-bezier(.2,.9,.3,1) 3.78s forwards, cl-as-pillar-dim 2.2s ease-in-out 4.3s forwards; }
  @keyframes cl-as-pillar { from { opacity: 1; transform: scaleY(0); } to { opacity: 1; transform: none; } }
  @keyframes cl-as-pillar-dim { to { opacity: .32; transform: scaleX(.45); } }
  /* 法相：身后升起的巨大金身，背光、符文轮，最后睁眼 */
  .cl-as-fa { position: absolute; overflow: visible; opacity: 0; transform-origin: 50% 100%; filter: drop-shadow(0 0 16px var(--g)) drop-shadow(0 0 46px var(--g));
    animation: cl-as-fa-rise 1.5s cubic-bezier(.2,.8,.2,1) 4.2s forwards, cl-as-fa-breathe 2.6s ease-in-out 5.9s infinite alternate; }
  @keyframes cl-as-fa-rise { from { opacity: 0; transform: translateY(150px) scale(.68); } to { opacity: 1; transform: none; } }
  @keyframes cl-as-fa-breathe { to { transform: scale(1.018); } }
  .cl-as-sash > g { transform-box: fill-box; animation: cl-as-sash 2.8s ease-in-out 5s infinite alternate; }
  .cl-as-sash > g:nth-child(odd) { transform-origin: 100% 0; } .cl-as-sash > g:nth-child(even) { transform-origin: 0 0; animation-direction: alternate-reverse; }
  @keyframes cl-as-sash { from { transform: rotate(-3deg); } to { transform: rotate(3deg); } }
  .cl-as-fa-eyes { transform-box: fill-box; transform-origin: center; transform: scaleY(0); animation: cl-as-eye .4s ease-out 5.9s forwards; }
  @keyframes cl-as-eye { 0% { transform: scaleY(0); } 55% { transform: scaleY(1.6); } 100% { transform: scaleY(1); } }
  .cl-as-eyeflash { position: absolute; left: 290px; top: 137px; width: 700px; height: 10px; border-radius: 50%; opacity: 0; animation: cl-as-eyeflash .9s ease-out 5.9s forwards; }
  @keyframes cl-as-eyeflash { 0% { opacity: 0; transform: scaleX(.1); } 20% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0; transform: scaleX(1.3); } }
  .cl-as-halo { position: absolute; border-radius: 50%; opacity: 0; animation: cl-as-halo-in 1s cubic-bezier(.2,.9,.3,1.2) 4.45s forwards; }
  @keyframes cl-as-halo-in { from { opacity: 0; transform: scale(.3); } to { opacity: 1; transform: none; } }
  .cl-as-halo > i { position: absolute; inset: 0; border-radius: 50%; animation: cl-as-spin 12s linear infinite; }
  .cl-as-halo.is-corona > i { animation: cl-as-spin-r 18s linear infinite; }
  .cl-as-runes { position: absolute; overflow: visible; opacity: 0; animation: cl-as-halo-in 1s ease-out 4.7s forwards; }
  .cl-as-runes g { transform-box: view-box; transform-origin: 50% 50%; animation: cl-as-spin-r 30s linear infinite; }
  /* 行草大字砸落（墨迹溅开） */
  .cl-as-glyph { position: absolute; top: 150px; width: 320px; height: 320px; margin-left: -160px; display: grid; place-items: center; }
  .cl-as-ink { position: absolute; inset: 0; overflow: visible; transform: scale(0); opacity: 0; animation: cl-as-ink .45s cubic-bezier(.2,1.3,.4,1) forwards; }
  @keyframes cl-as-ink { 0% { opacity: 0; transform: scale(1.35) rotate(-30deg); } 25% { opacity: 1; } 100% { opacity: 1; transform: none; } }
  .cl-as-enso { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cl-as-crack .42s cubic-bezier(.3,.8,.4,1) forwards; }
  .cl-as-glyph b { position: relative; display: block; font: 400 232px/1 'Xingkai SC', 'STXingkai', '华文行楷', 'Kaiti SC', 'STKaiti', 'KaiTi', serif; color: transparent;
    background-image: var(--gl); background-size: 100% 220%; -webkit-background-clip: text; background-clip: text; -webkit-text-stroke: 2px rgba(70,36,0,.55);
    filter: drop-shadow(0 0 14px var(--gg)) drop-shadow(0 7px 0 rgba(0,0,0,.55)); opacity: 0;
    animation: cl-as-slam .5s cubic-bezier(.3,1.5,.5,1) forwards, cl-as-glyph-flow 3s linear infinite; }
  @keyframes cl-as-slam { 0% { opacity: 0; transform: scale(3.4) rotate(-8deg); } 50% { opacity: 1; transform: scale(.88) rotate(1deg); } 100% { opacity: 1; transform: none; } }
  @keyframes cl-as-glyph-flow { to { background-position: 0 220%; } }
  /* 上飘的光点、化神的花雨 */
  .cl-as-mote { position: absolute; border-radius: 50%; opacity: 0; animation: cl-as-mote var(--t, 3s) ease-in var(--w, 4s) infinite; }
  @keyframes cl-as-mote { 0% { opacity: 0; transform: translateY(0) scale(.6); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-320px) scale(1.1); } }
  .cl-as-fall { position: absolute; top: -40px; width: 15px; height: 9px; border-radius: 60% 0; opacity: 0; animation: cl-as-fall var(--t, 5s) linear var(--w, 4.6s) infinite; }
  @keyframes cl-as-fall { 0% { opacity: 0; transform: translate(0, 0) rotate(0); } 10% { opacity: 1; } 100% { opacity: .15; transform: translate(var(--sx, 40px), 800px) rotate(600deg); } }
  /* 名牌与祝福语 */
  .cl-as-plate { position: absolute; left: 50%; bottom: 22px; display: flex; align-items: center; gap: 22px; max-width: 1060px; padding: 14px 42px 14px 18px; border: 1px solid #d8b25a; border-radius: 6px;
    background: linear-gradient(180deg, rgba(32,18,8,.95), rgba(10,6,4,.97)); box-shadow: inset 0 0 0 4px rgba(10,6,4,.96), inset 0 0 0 5px rgba(216,178,90,.6), 0 0 44px rgba(255,200,100,.25), 0 14px 50px rgba(0,0,0,.6);
    transform: translateX(-50%); opacity: 0; animation: cl-as-plate .7s cubic-bezier(.2,.9,.3,1.2) 6.2s forwards; }
  .cl-as-plate::before, .cl-as-plate::after { content: ''; position: absolute; top: 50%; width: 12px; height: 12px; margin-top: -6px; background: #d8b25a; transform: rotate(45deg); box-shadow: 0 0 10px rgba(255,210,120,.8); }
  .cl-as-plate::before { left: -7px; } .cl-as-plate::after { right: -7px; }
  @keyframes cl-as-plate { from { opacity: 0; transform: translate(-50%, 36px) scale(.96); } to { opacity: 1; transform: translate(-50%, 0); } }
  .cl-as-seal { flex: 0 0 auto; display: grid; place-items: center; width: 70px; height: 70px; border: 3px solid #c8281e; border-radius: 8px; background: #fff4e0; color: #c8281e;
    font: 700 27px/1.05 'Kaiti SC', 'STKaiti', 'KaiTi', serif; text-align: center; box-shadow: inset 0 0 0 3px #fff4e0, inset 0 0 0 4.5px #c8281e, 0 0 16px rgba(200,40,30,.5); transform: rotate(-4deg); }
  .cl-as-lines { display: flex; flex-direction: column; gap: 3px; min-width: 0; text-align: left; }
  .cl-as-who { color: #f1e2c4; font: 700 22px/1.4 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; letter-spacing: .04em; overflow-wrap: anywhere; }
  .cl-as-title { font: 700 50px/1.12 'Kaiti SC', 'STKaiti', 'KaiTi', serif; letter-spacing: .16em; color: transparent; -webkit-background-clip: text; background-clip: text;
    background-size: 220% 100%; animation: cl-as-flow 4s linear infinite; }
  @keyframes cl-as-flow { to { background-position: 220% 0; } }
  .cl-as-bless { color: #f3e3c0; font: 400 25px/1.5 'Kaiti SC', 'STKaiti', 'KaiTi', serif; letter-spacing: .06em; }
  .cl-as-tip { position: absolute; right: 18px; top: 14px; padding: 4px 12px; border: 1px solid rgba(255,255,255,.35); border-radius: 999px; color: rgba(255,255,255,.75);
    background: rgba(0,0,0,.25); font: 600 13px/1.4 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  @media (prefers-reduced-motion: reduce) {
    .cl-ascend *, .cl-ascend *::before, .cl-ascend *::after { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  }`;
  document.head.appendChild(style);

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  // 固定种子的随机数：同一种画面每次都一样（不同境界不同）
  function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  // 闪电：中点位移法，越分越细
  function boltPts(rand, x1, y1, x2, y2, disp, depth) {
    let pts = [[x1, y1], [x2, y2]];
    let d = disp;
    for (let k = 0; k < depth; k += 1) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i += 1) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        next.push([(ax + bx) / 2 + (rand() - 0.5) * d, (ay + by) / 2 + (rand() - 0.5) * d * 0.25], [bx, by]);
      }
      pts = next;
      d /= 1.85;
    }
    return pts;
  }
  const ptsText = (pts) => pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  // 一道闪电（主干＋分叉）：外层模糊光晕、中层副色、内层白芯
  function boltSvg(rand, L, [x1, y1], [x2, y2], width, delay, big, blur) {
    const main = boltPts(rand, x1, y1, x2, y2, big ? 150 : 120, 6);
    const branches = Array.from({ length: big ? 5 : 3 }, () => {
      const at = main[Math.floor(main.length * (0.15 + rand() * 0.55))];
      const dir = rand() < 0.5 ? -1 : 1;
      const len = 70 + rand() * (big ? 170 : 110);
      return boltPts(rand, at[0], at[1], at[0] + dir * len * (0.6 + rand() * 0.5), at[1] + len * (0.5 + rand() * 0.6), 50, 4);
    });
    const line = (pts, w, color, extra = '') => `<polyline points="${ptsText(pts)}" stroke="${color}" stroke-width="${f1(w)}"${extra}></polyline>`;
    const all = [[main, width]].concat(branches.map((b) => [b, width * 0.45]));
    return `<g class="cl-as-bolt${big ? ' is-big' : ''}" style="animation-delay:${delay}s">
      <g filter="url(#${blur})" opacity=".85">${all.map(([p, w]) => line(p, w * 5, L.boltGlow)).join('')}</g>
      <g opacity=".75">${all.map(([p, w]) => line(p, w * 2.2, L.boltGlow2)).join('')}</g>
      ${all.map(([p, w]) => line(p, w, L.bolt)).join('')}</g>`;
  }
  function sparks(rand, x, y, n, delay, colors, spread = 180) {
    return Array.from({ length: n }, () => {
      const a = -spread / 2 + rand() * spread;
      const c = colors[Math.floor(rand() * colors.length)];
      return `<span class="cl-as-spark" style="left:${f1(x)}px;top:${f1(y)}px;--a:${f1(a)}deg;--d:${f1(40 + rand() * 110)}px;background:${c};box-shadow:0 0 8px ${c};animation-delay:${f1(delay + rand() * 0.08)}s"></span>`;
    }).join('');
  }
  // 书法圆环（一笔圆）：粗笔一圈、留一个缺口，外加两道飞白细笔，砸字时一笔画出
  function inkSvg(rand, L, id, delay) {
    const arc = (r, a0, a1, cx = 160, cy = 160) => {
      const p = (a) => `${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)}`;
      return `M${p(a0)}A${r} ${r} 0 1 1 ${p(a1)}`;
    };
    const a0 = -Math.PI / 2 - 0.35 + rand() * 0.2;
    const dl = `style="animation-delay:${f1(delay)}s"`;
    return `<svg class="cl-as-ink" ${dl} viewBox="0 0 320 320" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".45"></stop><stop offset=".7" stop-color="#000" stop-opacity=".15"></stop><stop offset="1" stop-color="#000" stop-opacity="0"></stop></radialGradient></defs>
      <circle cx="160" cy="160" r="128" fill="url(#${id})"></circle>
      <g fill="none" stroke-linecap="round">
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(132, a0, a0 - 0.55)}" stroke="${L.ink[1]}" stroke-width="30" opacity=".92"></path>
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(134, a0 + 0.15, a0 - 1.5, 168, 152)}" stroke="${L.ink[1]}" stroke-width="16" opacity=".85"></path>
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(114, a0 + 0.3, a0 - 0.9)}" stroke="${L.ink[0]}" stroke-width="6" opacity=".75"></path>
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(147, a0 + 0.6, a0 - 1.6)}" stroke="${L.ink[1]}" stroke-width="3" opacity=".6"></path></g></svg>`;
  }
  // 打坐的人形（头、发髻、身、双臂、盘腿），法相与修士共用同一套比例（宽 120、高 114）
  const FIGURE = {
    bun: 'M60 3a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Z',
    head: 'M60 14a12.5 13.5 0 1 1 0 27a12.5 13.5 0 1 1 0-27Z',
    body: 'M46 42C40 44 33 48 31 60L27 86L93 86L89 60C87 48 80 44 74 42C68 40 52 40 46 42Z',
    lap: 'M6 97C6 85 30 79 60 79C90 79 114 85 114 97C114 107 92 113 60 113C28 113 6 107 6 97Z',
  };
  function scene(level) {
    const L = LEVELS[level];
    const rand = seeded(level * 131 + 17);
    const cx = 640;
    const head = [640, 418];   // 修士头顶（天雷落点）
    const blur = `cl-as-blur-${level}`;
    // 劫云
    const clouds = Array.from({ length: 12 }, (_, i) => {
      const left = i < 6;
      const w = 360 + rand() * 380;
      const h = 130 + rand() * 110;
      const x = left ? -380 + i * 95 + rand() * 50 : 820 + (i - 6) * 95 + rand() * 50;
      const y = -140 + rand() * 170 + (i % 3) * 50;
      return `<span class="cl-as-cloud" style="left:${f1(x)}px;top:${f1(y)}px;width:${f1(w)}px;height:${f1(h)}px;background:${L.cloud[i % 3]};--fx:${left ? -120 : 120}px;--px:${left ? -(260 + rand() * 160) : 260 + rand() * 160}px;animation-delay:${f1((i % 6) * 0.07)}s, 3.85s"></span>`;
    }).join('');
    // 劫云漩涡的旋臂（阿基米德螺线，粗的模糊打底、细的亮边）
    const arms = Array.from({ length: 7 }, (_, k) => {
      const th0 = (k / 7) * Math.PI * 2;
      const pts = [];
      for (let r = 26; r <= 520; r += 18) { const th = th0 + r / 140; pts.push([500 + Math.cos(th) * r, 500 + Math.sin(th) * r]); }
      return pts;
    });
    const spiral = `<svg width="1000" height="1000" viewBox="0 0 1000 1000" style="position:absolute;inset:0;overflow:visible" aria-hidden="true">
        <defs><filter id="cl-as-vxblur-${level}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"></feGaussianBlur></filter></defs>
        <g fill="none" stroke-linecap="round" filter="url(#cl-as-vxblur-${level})">${arms.map((pts, k) => `<polyline points="${ptsText(pts)}" stroke="${k % 2 ? L.vortex[2] : L.vortex[1]}" stroke-width="${k % 2 ? 34 : 60}" opacity="${k % 2 ? 0.7 : 0.95}"></polyline>`).join('')}</g>
        <g fill="none" stroke-linecap="round" stroke="${L.vortexGlow}" opacity=".5">${arms.map((pts) => `<polyline points="${ptsText(pts.slice(2))}" stroke-width="3"></polyline>`).join('')}</g></svg>`;
    // 天雷：两道劈在两侧地面，一道劈中头顶，最后九霄雷柱
    const strikes = [
      { t: 1.55, from: [600, 110], to: [520, 540], w: 3.2 },
      { t: 2.05, from: [690, 110], to: [770, 532], w: 3.4 },
      { t: 2.5, from: [628, 105], to: head, w: 4 },
      { t: 3.0, from: [645, 95], to: head, w: 9, big: true },
    ];
    const bolts = strikes.map((s) => boltSvg(rand, L, s.from, s.to, s.w, s.t, s.big, blur)).join('')
      + boltSvg(rand, L, [540, 96], head, 5, 3.08, true, blur) + boltSvg(rand, L, [740, 96], head, 5, 3.16, true, blur);
    const strikeSparks = strikes.map((s) => sparks(rand, s.to[0], s.to[1], s.big ? 26 : 10, s.t, [L.bolt, L.boltGlow2, L.boltGlow], s.big ? 300 : 170)).join('');
    const flashes = [[1.55, 0.55, strikes[0].to], [2.05, 0.6, strikes[1].to], [2.5, 0.75, head], [3.0, 1, head], [3.2, 0.8, head], [3.75, 1, [640, 482]], [5.0, 0.35, [312, 310]], [5.35, 0.35, [968, 310]]]
      .map(([t, o, [x, y]], i) => `<div class="cl-as-flash" style="--fo:${o};animation-delay:${t}s;background:radial-gradient(circle at ${x + 240}px ${y + 240}px, #fff 0, ${i === 5 ? L.ring[0] : L.boltGlow} 14%, ${L.boltGlow}${i >= 3 ? '70' : '2a'} 42%, transparent 78%)"></div>`).join('');
    // 雷电绕身：围着修士的一圈短电弧
    const arcs = Array.from({ length: 16 }, () => {
      const a0 = rand() * Math.PI * 2;
      const span = 0.35 + rand() * 0.6;
      const pts = Array.from({ length: 7 }, (_, k) => {
        const a = a0 + (span * k) / 6;
        const r = 92 + (rand() - 0.5) * 22;
        return [640 + Math.cos(a) * r, 470 + Math.sin(a) * r * 0.85];
      });
      const c = rand() < 0.5 ? L.bolt : L.boltGlow2;
      return `<polyline class="cl-as-arc" points="${ptsText(pts)}" stroke="${c}" stroke-width="${f1(1.6 + rand() * 1.8)}" style="animation-delay:${f1(rand() * 0.16)}s"></polyline>`;
    }).join('');
    // 法阵：几道圆环、八角星、八卦符号、刻度
    const TRI = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
    const ticks = Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2;
      const r1 = i % 9 === 0 ? 262 : 270;
      return `<line x1="${f1(Math.cos(a) * r1)}" y1="${f1(Math.sin(a) * r1)}" x2="${f1(Math.cos(a) * 282)}" y2="${f1(Math.sin(a) * 282)}"></line>`;
    }).join('');
    const tri = TRI.map((sym, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      return `<text x="${f1(Math.cos(a) * 228)}" y="${f1(Math.sin(a) * 228 + 13)}" transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(Math.cos(a) * 228)} ${f1(Math.sin(a) * 228)})">${sym}</text>`;
    }).join('');
    const star = (r, rot) => `<polygon points="${Array.from({ length: 4 }, (_, i) => { const a = (i / 4) * Math.PI * 2 + rot; return `${f1(Math.cos(a) * r)},${f1(Math.sin(a) * r)}`; }).join(' ')}"></polygon>`;
    const array = `<div class="cl-as-array" style="filter:drop-shadow(0 0 8px ${L.array})"><svg viewBox="-310 -310 620 620" aria-hidden="true">
        <g fill="none" stroke="${L.array}" stroke-width="3" opacity=".95"><circle r="290"></circle><circle r="255" stroke-width="1.6"></circle><circle r="200"></circle><circle r="120" stroke-width="2"></circle>
          ${star(200, 0)}${star(200, Math.PI / 4)}<circle r="60" stroke-width="1.6"></circle></g>
        <g stroke="${L.rune}" stroke-width="2" opacity=".8">${ticks}</g>
        <g fill="${L.rune}" font-size="38" text-anchor="middle" font-family="'Apple Symbols','Segoe UI Symbol','Noto Sans Symbols 2',serif">${tri}</g></svg></div>`;
    // 修士（剪影）：暗身金边，碎丹后通体发光
    const figPaths = (attrs) => `<g ${attrs}><path d="${FIGURE.bun}"></path><path d="${FIGURE.head}"></path><path d="${FIGURE.body}"></path><path d="${FIGURE.lap}"></path></g>`;
    const me = `<svg class="cl-as-me" style="left:580px;top:414px" width="120" height="114" viewBox="0 0 120 114" aria-hidden="true">
        <defs><linearGradient id="cl-as-me-${level}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe8"></stop><stop offset=".6" stop-color="${L.core[1]}"></stop><stop offset="1" stop-color="${L.core[2]}"></stop></linearGradient></defs>
        ${figPaths(`fill="#0b0616" stroke="${L.faLine}" stroke-opacity=".6" stroke-width="1.6"`)}
        <g class="cl-as-me-lit" style="filter:drop-shadow(0 0 10px ${L.core[1]}) drop-shadow(0 0 24px ${L.faGlow})">${figPaths(`fill="url(#cl-as-me-${level})"`)}</g></svg>`;
    // 金丹与裂纹
    const cracks = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
      const p = (ang, r) => `${f1(30 + Math.cos(ang) * r)} ${f1(30 + Math.sin(ang) * r)}`;
      const mid = a + (rand() - 0.5) * 0.6;
      return `<path pathLength="1" d="M${p(a, 4)}L${p(mid, 12)}L${p(a + 0.12, 24)}" style="animation-delay:${f1(3.3 + i * 0.05)}s"></path>`;
    }).join('');
    const shards = Array.from({ length: 34 }, () => {
      const c = L.core[1 + Math.floor(rand() * 3)];
      return `<span class="cl-as-shard" style="--a:${f1(rand() * 360)}deg;--d:${f1(200 + rand() * 360)}px;background:${c};box-shadow:0 0 12px ${c}"></span>`;
    }).join('');
    const rings = L.ring.map((color, i) => `<span class="cl-as-ring" style="border-color:${color};box-shadow:0 0 30px ${color}, inset 0 0 20px ${color};animation-delay:${f1(3.75 + i * 0.16)}s"></span>`).join('');
    const shocks = [[3.0, L.boltGlow2], [3.75, L.ring[0]], [3.95, L.ring[1]]]
      .map(([t, c]) => `<span class="cl-as-shock" style="border-color:${c};box-shadow:0 0 24px ${c};animation-delay:${t}s"></span>`).join('');
    // 法相（宽 560，头在 (280,132)，盘坐在地），背光、符文轮
    const faId = `cl-as-fa-${level}`;
    const fa = `<svg class="cl-as-fa" style="left:360px;top:2px;--g:${L.faGlow}" width="560" height="560" viewBox="0 0 560 560" aria-hidden="true">
        <defs><linearGradient id="${faId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.fa[0]}"></stop><stop offset=".55" stop-color="${L.fa[1]}"></stop><stop offset="1" stop-color="${L.fa[2]}"></stop></linearGradient></defs>
        <g class="cl-as-sash" fill="none" stroke-linecap="round">${['M158 244C110 228 92 168 46 150C26 142 12 150 6 166', 'M402 244C450 228 468 168 514 150C534 142 548 150 554 166',
          'M118 336C84 356 74 400 40 420C24 430 10 428 2 418', 'M442 336C476 356 486 400 520 420C536 430 550 428 558 418']
          .map((d) => `<g><path d="${d}" stroke="${L.faGlow}" stroke-width="20" opacity=".35"></path><path d="${d}" stroke="${L.fa[0]}" stroke-width="9"></path><path d="${d}" stroke="${L.faLine}" stroke-width="2" opacity=".9"></path></g>`).join('')}</g>
        <g fill="url(#${faId})" stroke="${L.faLine}" stroke-width="2.4" stroke-opacity=".8">
          <path d="M262 58L268 40L292 40L298 58Z"></path>
          <path d="M280 52C296 52 306 62 306 76C306 88 296 96 280 96C264 96 254 88 254 76C254 62 264 52 280 52Z"></path>
          <path d="M280 80C308 80 328 104 328 136C328 168 306 190 280 190C254 190 232 168 232 136C232 104 252 80 280 80Z"></path>
          <path d="M250 186C214 192 170 202 146 238C120 276 110 326 106 378C102 418 116 446 150 456L410 456C444 446 458 418 454 378C450 326 440 276 414 238C390 202 346 192 310 186C298 194 262 194 250 186Z"></path>
          <path d="M62 482C62 440 150 420 280 420C410 420 498 440 498 482C498 524 404 544 280 544C156 544 62 524 62 482Z"></path>
          <path d="M226 416C226 398 250 388 280 388C310 388 334 398 334 416C334 432 310 440 280 440C250 440 226 432 226 416Z"></path></g>
        <g fill="none" stroke="${L.faLine}" stroke-width="2" stroke-opacity=".6" stroke-linecap="round">
          <path d="M250 190L280 262L310 190"></path><path d="M156 262C176 322 180 382 172 440"></path><path d="M404 262C384 322 380 382 388 440"></path>
          <path d="M112 500C200 474 360 474 448 500"></path><path d="M226 52L334 46"></path><circle cx="334" cy="46" r="4"></circle><path d="M256 70L304 70"></path><path d="M200 300C230 320 330 320 360 300"></path></g>
        <path d="M280 100L287 110L280 120L273 110Z" fill="${L.eye}"></path>
        <g class="cl-as-fa-eyes" fill="${L.eye}" style="filter:drop-shadow(0 0 6px ${L.eye}) drop-shadow(0 0 14px ${L.faGlow})">
          <path d="M248 140Q261 130 274 140Q261 146 248 140Z"></path><path d="M286 140Q299 130 312 140Q299 146 286 140Z"></path></g></svg>`;
    const runeChars = Array.from({ length: 24 }, (_, i) => TRI[i % 8]);
    const runes = `<svg class="cl-as-runes" style="left:420px;top:-88px" width="440" height="440" viewBox="0 0 440 440" aria-hidden="true">
        <g fill="none" stroke="${L.rune}" stroke-opacity=".7"><circle cx="220" cy="220" r="214" stroke-width="2"></circle><circle cx="220" cy="220" r="180" stroke-width="1.2"></circle>
          ${runeChars.map((sym, i) => { const a = (i / 24) * Math.PI * 2; const x = 220 + Math.cos(a) * 197; const y = 220 + Math.sin(a) * 197; return `<text x="${f1(x)}" y="${f1(y + 8)}" fill="${L.rune}" stroke="none" font-size="22" text-anchor="middle" font-family="'Apple Symbols','Segoe UI Symbol','Noto Sans Symbols 2',serif" transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(x)} ${f1(y)})">${sym}</text>`; }).join('')}</g></svg>`;
    const halo = `<span class="cl-as-halo is-corona" style="left:430px;top:-78px;width:420px;height:420px">
          <i style="background:repeating-conic-gradient(from 0deg, ${L.corona} 0deg 1.6deg, transparent 1.6deg 7deg);-webkit-mask-image:radial-gradient(circle, transparent 52%, #000 56%, transparent 72%);mask-image:radial-gradient(circle, transparent 52%, #000 56%, transparent 72%)"></i></span>
        <span class="cl-as-halo" style="left:480px;top:-28px;width:320px;height:320px;box-shadow:0 0 40px ${L.faGlow}">
          <i style="background:${L.halo};-webkit-mask-image:radial-gradient(circle, transparent 60%, #000 63%, #000 69%, transparent 72%);mask-image:radial-gradient(circle, transparent 60%, #000 63%, #000 69%, transparent 72%)"></i></span>`;
    // 两个大字
    const glyphs = L.chars.map((ch, i) => {
      const t = i ? 5.35 : 5.0;
      return `<div class="cl-as-glyph" style="left:${i ? 968 : 312}px;--gl:${L.glyph};--gg:${L.glyphGlow}">
          ${inkSvg(rand, L, `cl-as-ink-${level}-${i}`, t + 0.04)}
          <b style="animation-delay:${t}s, ${f1(t + 0.6)}s">${esc(ch)}</b></div>`;
    }).join('');
    const motes = Array.from({ length: 40 }, () => {
      const size = 3 + rand() * 6;
      const c = L.mote[Math.floor(rand() * L.mote.length)];
      return `<span class="cl-as-mote" style="left:${f1(140 + rand() * 1000)}px;top:${f1(420 + rand() * 280)}px;width:${f1(size)}px;height:${f1(size)}px;background:${c};box-shadow:0 0 ${f1(size * 2.5)}px ${c};--t:${f1(2.4 + rand() * 2.2)}s;--w:${f1(4 + rand() * 2)}s"></span>`;
    }).join('');
    const petals = L.petals ? Array.from({ length: 30 }, () => {
      const c = L.petals[Math.floor(rand() * L.petals.length)];
      return `<span class="cl-as-fall" style="left:${f1(80 + rand() * 1120)}px;background:${c};box-shadow:0 0 8px ${c};--t:${f1(3.6 + rand() * 2.4)}s;--w:${f1(4.4 + rand() * 2.6)}s;--sx:${f1((rand() - 0.5) * 220)}px"></span>`;
    }).join('') : '';
    return {
      veil: L.veil,
      html: `<div class="cl-as-stage">
        <div class="cl-as-sky" style="background:${L.sky}"></div>
        <div class="cl-as-rays" style="background:repeating-conic-gradient(from 0deg, ${L.ray} 0deg 3deg, transparent 3deg 11deg, ${L.ray2} 11deg 13deg, transparent 13deg 20deg)"></div>
        <div class="cl-as-vortex"><div class="cl-as-vx">
          <div class="cl-as-vx-disc" style="background:radial-gradient(circle, ${L.vortexGlow} 0, ${L.vortex[1]} 7%, ${L.vortex[0]} 30%)">${spiral}</div>
          <div class="cl-as-vx-rim" style="background:repeating-conic-gradient(from 0deg, transparent 0deg 20deg, ${L.vortexGlow} 26deg, transparent 32deg 45deg);-webkit-mask-image:radial-gradient(circle, transparent 30%, #000 44%, transparent 62%);mask-image:radial-gradient(circle, transparent 30%, #000 44%, transparent 62%);opacity:.55"></div>
          <div class="cl-as-vx-flash" style="background:radial-gradient(circle, #fff 0, ${L.vortexGlow} 12%, transparent 46%)"></div></div></div>
        ${clouds}
        ${halo}${runes}
        <div class="cl-as-pillar" style="background:linear-gradient(90deg, transparent, ${L.pillar[0]} 30%, ${L.pillar[1]} 50%, ${L.pillar[0]} 70%, transparent);box-shadow:0 0 60px ${L.ring[0]}"></div>
        ${fa}
        ${array}
        ${shocks}
        <div class="cl-as-beam" style="background:linear-gradient(90deg, transparent, ${L.boltGlow} 24%, ${L.bolt} 42%, #fff 46%, #fff 54%, ${L.bolt} 58%, ${L.boltGlow} 76%, transparent);box-shadow:0 0 90px ${L.boltGlow}"></div>
        <svg class="cl-as-abs" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
          <defs><filter id="${blur}" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="6"></feGaussianBlur></filter></defs>
          <g fill="none" stroke-linejoin="round" stroke-linecap="round">${bolts}</g>
          <g class="cl-as-arcs" fill="none" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${L.boltGlow})">${arcs}</g></svg>
        ${me}
        <div class="cl-as-core" style="background:radial-gradient(circle at 38% 34%, ${L.core[0]}, ${L.core[1]} 30%, ${L.core[2]} 62%, ${L.core[3]});box-shadow:0 0 24px ${L.core[1]}, 0 0 60px ${L.core[2]}"></div>
        <svg class="cl-as-crack cl-as-abs" style="left:610px;top:452px" width="60" height="60" viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="#fffdf4" stroke-width="2.4" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #fff)">${cracks}</g></svg>
        ${shards}${rings}${strikeSparks}
        ${flashes}
        <div class="cl-as-eyeflash" style="background:radial-gradient(ellipse, #fff 0, ${L.eye} 20%, ${L.faGlow} 45%, transparent 70%)"></div>
        ${motes}${petals}
        ${glyphs}
      </div>`,
    };
  }

  let layerEl = null;
  function layerFor(layer) {
    if (layer) return layer;
    if (!layerEl) {
      layerEl = document.createElement('div');
      layerEl.className = 'cl-ascend-layer';
      document.body.appendChild(layerEl);
    }
    return layerEl;
  }
  function namesText(names, self) {
    if (self) return '恭喜你';
    const list = (names || []).filter(Boolean);
    if (!list.length) return '恭喜本班同学';
    return list.length > 6 ? `恭喜 ${list.slice(0, 6).join('、')} 等 ${list.length} 位同学` : `恭喜 ${list.join('、')}`;
  }
  const blessing = (level) => { const list = (LEVELS[level] || LEVELS[3]).blessings; return list[Math.floor(Math.random() * list.length)]; };
  function show({ level = 3, names = [], self = false, fit = 'wide', layer = null, blessing: words = '' } = {}) {
    const L = LEVELS[level] || LEVELS[3];
    const sc = scene(LEVELS[level] ? level : 3);
    const el = document.createElement('div');
    el.className = `cl-ascend cl-ascend-${level}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', `${namesText(names, self)}${L.title}`);
    const scale = fit === 'narrow' ? Math.min(window.innerWidth / 960, window.innerHeight / 720) : Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    el.style.setProperty('--as-scale', String(scale));
    el.innerHTML = `<div class="cl-as-veil" style="background:${sc.veil}"></div>
      <div class="cl-as-box">${sc.html}
        <div class="cl-as-plate"><span class="cl-as-seal">${esc(L.realm.slice(0, 1))}<br>${esc(L.realm.slice(1))}</span>
          <div class="cl-as-lines"><span class="cl-as-who"></span><span class="cl-as-title" style="${L.titleCss}">${esc(L.title)}</span><span class="cl-as-bless"></span></div></div></div>
      <span class="cl-as-tip">点一下画面可提前关闭</span>`;
    el.querySelector('.cl-as-who').textContent = `${namesText(names, self)}　${L.verb}`;
    el.querySelector('.cl-as-bless').textContent = words || blessing(level);
    layerFor(layer).appendChild(el);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener('keydown', onKey, true);
        el.remove();
        resolve();
      };
      const close = () => {
        if (done || el.classList.contains('is-closing')) return;
        el.classList.add('is-closing');
        setTimeout(finish, 460);
      };
      const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
      const opened = Date.now();
      el.addEventListener('click', (event) => { event.stopPropagation(); if (Date.now() - opened > 600) close(); });
      document.addEventListener('keydown', onKey, true);
      const timer = setTimeout(finish, DURATION + 100);
    });
  }
  // 几次调用排队依次播放
  let queue = Promise.resolve();
  function play(options) {
    const run = queue.then(() => show(options));
    queue = run.catch(() => {});
    return run;
  }
  window.ClassLiveAscend = { play, blessing, DURATION, LEVELS: Object.keys(LEVELS).map(Number), nameOf: (level) => (LEVELS[level] || LEVELS[3]).realm };
})();
