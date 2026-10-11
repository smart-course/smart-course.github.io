/* 投屏弹幕：在课堂完整版页面上滚动显示当前课堂的学生弹幕（“姓名：内容”，匿名时只显示内容），并循环播放。
 * 需要教师已在同一浏览器登录教师工作台（读取弹幕需教师账号）。
 * 弹幕模式：关闭 / 直接上屏（未隐藏的都显示）/ 审核后上屏（只显示已通过的）。左下角控件里可以直接切换（与工作台“弹幕”下拉框相同，ck_set_danmaku）。
 * 播放规则：新来的弹幕立即上屏；空档时按顺序循环播放本课堂可显示的弹幕（最近 60 条），被隐藏的立即撤下。
 * 清屏：撤下屏幕上现有弹幕，并让它们不再循环（本机按课堂记住，刷新页面也不会回来）；之后的新弹幕照常上屏和循环。
 *       清屏只影响投屏显示，工作台里的弹幕记录不受影响。
 * 左下角小控件：循环开关、暂停、清屏、收起。页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 * 鼠标移到一条弹幕上：这条弹幕停住，旁边出现垃圾桶；点一次变成“确认删除？”，3 秒内再点一次即从记录里彻底删除（与工作台的删除相同）。
 * 习经辩论质询的弹幕带“【正方】/【反方】”（学生端按本人的辩前投票自动加上），投屏上显示为彩色标签。
 * 匿名（课堂的 danmaku_anon，工作台或左下角控件切换）：投屏只显示内容、不显示姓名；弹幕记录里照常有发送人。
 * 修为境界（教师结算后存于 ck_realms，本页按学号读取）：显示姓名时姓名前加境界称号，姓名颜色与称号一致（素石灰→青玉绿→金丹金→紫霄紫→化神七彩流光，
 *   还没有境界的按炼气）；弹幕字色随境界（白→绿→蓝→紫→化神紫金）；
 * 法宝弹幕（ck_send_gift 写入，gift 列；筑基丹、青竹蜂云剑、风雷翅、掌天瓶）只在新到时播放一次全屏动画，不进入循环和弹幕墙。
 * 教师点赞：鼠标停在弹幕上出现“点赞”和垃圾桶；每堂课最多 ClassLive.LIKE.limit 个赞（ck_like_danmaku 核对），被赞弹幕带 👍，发送人结算时额外加修为。
 * 试用特效（左下角“试用特效”，或工作台“修为境界”里的链接带 ?demo=1 打开）：任选境界和字色发试用弹幕、一键演示五个境界、
 *   播放四件法宝画面；只在本机播放，不写入弹幕记录、不计修为，也不经过后台。
 * 机制图“弹幕接龙”：学生弹幕以“【案例号箭头】”开头（如【01①→②】），除照常滚动外，还会放进投屏机制图对应节点下的
 *   [data-mech-wall]（每个箭头显示最新 3 条，新来的弹入并让节点闪一下）；显示规则与滚动弹幕相同（模式、审核、清屏）。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  if (!config || config.provider === 'off' || !window.ClassLive) return;
  let backend;
  try { backend = window.ClassLive.create(config); } catch (error) { return; }
  // 有弹幕的投屏页才显示机制图的“弹幕接龙”说明和节点弹幕区（本地或离线打开时不显示）
  document.documentElement.classList.add('has-danmaku');

  const POLL_MS = 3000;
  const ROOM_MS = 10000;
  const LOOP_MS = 2200;
  const POOL = 60;
  const LANES = 7;
  const store = {
    get: (key) => { try { return localStorage.getItem('danmaku:' + key); } catch (error) { return null; } },
    set: (key, value) => { try { localStorage.setItem('danmaku:' + key, value); } catch (error) { /* 忽略 */ } },
  };

  const style = document.createElement('style');
  style.textContent = `
  .dm-stage { position: fixed; inset: 64px 0 auto 0; height: 58vh; z-index: 300; overflow: hidden; pointer-events: none; }
  .dm-item { position: absolute; left: 100%; white-space: nowrap; padding: 4px 16px; border-radius: 22px; color: #fff; background: rgba(32, 28, 24, .55);
    font: 800 clamp(22px, 2.4vw, 34px)/1.3 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,.6);
    will-change: transform; animation: dm-fly var(--dm-duration, 11s) linear forwards; }
  .dm-item.is-new { background: rgba(164, 73, 45, .78); }
  .dm-name { margin-right: 2px; }
  /* 姓名颜色与境界称号一致 */
  .dm-name.is-r0 { color: #d9d4ca; }
  .dm-name.is-r1 { color: #8fe6c6; }
  .dm-name.is-r2 { color: #ffd36b; text-shadow: 0 0 8px rgba(240,194,75,.55), 0 1px 2px rgba(0,0,0,.6); }
  .dm-name.is-r3 { color: #dcc2ff; text-shadow: 0 0 8px rgba(170,120,255,.85), 0 1px 2px rgba(0,0,0,.6); }
  .dm-name.is-r4 { background: linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b) 0 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
    text-shadow: none; filter: drop-shadow(0 0 5px rgba(255,214,110,.55)); animation: dm-flowtext 4s linear infinite; }
  .dm-title { display: inline-block; margin-right: 6px; padding: 0 10px; border: 1px solid transparent; border-radius: 5px; font: 700 .7em/1.55 'Kaiti SC', 'STKaiti', 'KaiTi', serif; vertical-align: .12em; text-shadow: none; }
  .dm-title.is-r0 { color: #4a443c; background: #d9d4ca; border-color: #b9b1a3; }
  .dm-title.is-r1 { color: #f2fffa; background: linear-gradient(180deg, #9fe3cc, #3fa88d 52%, #2a7d69); border-color: #1f6455; text-shadow: 0 1px 1px rgba(10,60,48,.6); box-shadow: inset 0 1px 0 rgba(255,255,255,.6); }
  .dm-title.is-r2 { color: #3e2400; background: linear-gradient(180deg, #fff3c4, #f2c64f 32%, #b8801a 68%, #e8b844); border-color: #7a5208; box-shadow: inset 0 1px 0 rgba(255,255,255,.85), 0 0 8px rgba(240,194,75,.5); }
  .dm-title.is-r3 { color: #f6eaff; background: linear-gradient(160deg, #4b1d8f, #7a3fe0 55%, #3a1673); border-color: #d8b8ff; text-shadow: 0 0 6px rgba(220,190,255,.8); box-shadow: 0 0 10px rgba(170,120,255,.8); }
  .dm-title.is-r4 { color: #ffe08a; background: linear-gradient(#140d24, #140d24) padding-box, linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b) border-box;
    background-size: 100% 100%, 300% 100%; box-shadow: 0 0 14px rgba(255,214,110,.75); animation: dm-flowbg 3s linear infinite; }
  .dm-title.is-r3::before, .dm-title.is-r4::before { content: '✦'; margin-right: 3px; font-size: .8em; }
  @keyframes dm-flowbg { from { background-position: 0 0, 0% 50%; } to { background-position: 0 0, 300% 50%; } }
  @keyframes dm-flowtext { from { background-position: 0% 50%; } to { background-position: 300% 50%; } }
  @keyframes dm-ying { 0%, 100% { box-shadow: 0 0 0 1.5px rgba(216,184,255,.75), 0 0 14px rgba(150,100,255,.45); } 50% { box-shadow: 0 0 0 1.5px rgba(232,212,255,.95), 0 0 24px rgba(170,120,255,.75); } }
  /* 元婴：弹幕带紫色辉边；化神：弹幕带流动的七彩边框（与飞行动画并列） */
  .dm-item.is-r3 { background: rgba(22, 12, 40, .74); animation: dm-fly var(--dm-duration, 11s) linear forwards, dm-ying 2.4s ease-in-out infinite; }
  .dm-item.is-r4 { border: 2px solid transparent; background: linear-gradient(rgba(14,10,24,.84), rgba(14,10,24,.84)) padding-box, linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b, #ff8fc4) border-box;
    background-size: 100% 100%, 300% 100%; box-shadow: 0 0 26px rgba(255,200,120,.45); animation: dm-fly var(--dm-duration, 11s) linear forwards, dm-flowbg 4s linear infinite; }
  .dm-flowtext { background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: drop-shadow(0 0 5px rgba(255,214,110,.55)); animation: dm-flowtext 4s linear infinite; }
  /* ---------- 法宝画面：全屏暗幕＋1280×720 场景（按屏幕等比缩放）＋法宝名牌，约 6.4 秒 ---------- */
  .dm-gifts { position: fixed; inset: 0; z-index: 302; overflow: hidden; pointer-events: none; }
  .dm-gift { position: absolute; inset: 0; animation: dm-g-life 6.4s ease forwards; }
  @keyframes dm-g-life { 0% { opacity: 0; } 7% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; } }
  .dm-g-veil { position: absolute; inset: 0; }
  .dm-g-box { position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px; transform: translate(-50%, -50%) scale(var(--dm-scale, 1)); }
  .dm-g-box * { box-sizing: content-box; }
  .dm-g-plate { position: absolute; left: 50%; bottom: 58px; display: flex; align-items: center; gap: 22px; padding: 16px 34px 16px 18px; border: 1px solid #c9a24a; border-radius: 10px;
    background: rgba(16,13,10,.9); box-shadow: inset 0 0 0 4px rgba(16,13,10,.9), inset 0 0 0 5px rgba(201,162,74,.55), 0 10px 40px rgba(0,0,0,.45);
    transform: translateX(-50%); animation: dm-g-plate 6.4s ease forwards; white-space: nowrap; }
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
  .dm-g-float { animation: dm-g-float 3s ease-in-out 1.1s infinite; }
  .dm-g-appear { animation: dm-g-appear 1.1s cubic-bezier(.2, .9, .3, 1.2) both; }
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
  .dm-g-push { animation: dm-g-push 6.4s ease-out forwards; }
  .dm-g-bright { animation: dm-g-bright 2.4s ease-in-out infinite; }
  .dm-g-zap { animation: dm-g-zap 6.4s linear forwards; }
  .dm-g-flick { animation: dm-g-flick 1.7s linear infinite; }
  .dm-g-streak { stroke-dasharray: 140 300; animation: dm-g-flow 1.6s linear infinite; }
  .dm-g-bokeh { animation: dm-g-drift 4.6s ease-in-out infinite; }
  @keyframes dm-g-edge { 0%, 100% { opacity: .55; } 12% { opacity: 1; } 20% { opacity: .7; } 28% { opacity: 1; } 50% { opacity: .6; } }
  @keyframes dm-g-goldpulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
  @keyframes dm-g-sweep { 0% { transform: translateX(-70%); } 60%, 100% { transform: translateX(70%); } }
  .dm-g-edge { animation: dm-g-edge 1.6s linear infinite; }
  .dm-g-goldpulse { animation: dm-g-goldpulse 1.8s ease-in-out infinite; }
  .dm-g-sweep { animation: dm-g-sweep 2.6s ease-in-out .8s infinite; }
  /* 筑基丹：青绿灵光——白亮丹核呼吸，灵力环旋转 */
  @keyframes dm-g-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
  .dm-g-pulse { animation: dm-g-pulse 1.8s ease-in-out 1.1s infinite; }
  /* 青竹蜂云剑：九口竹青飞剑结阵，自左向右破空；雷光同风雷翅（.dm-g-flick） */
  @keyframes dm-g-charge { 0% { transform: translateX(-1250px); } 100% { transform: translateX(1350px); } }
  @keyframes dm-g-hum { 0%, 100% { filter: drop-shadow(0 0 8px rgba(90,240,150,.9)); } 50% { filter: drop-shadow(0 0 18px rgba(140,255,190,1)); } }
  .dm-g-charge { animation: dm-g-charge 4.6s cubic-bezier(.45, .05, .35, 1) .3s both; }
  .dm-g-blade { animation: dm-g-hum 1.4s ease-in-out infinite; }
  /* 风雷翅：双翼展开、扇动，雷光闪烁，人物悬空后向上飞离 */
  @keyframes dm-g-unfold { 0% { transform: rotate(64deg) scale(.15); opacity: 0; } 18% { opacity: 1; } 70% { transform: rotate(-5deg) scale(1.03); } 100% { transform: none; opacity: 1; } }
  @keyframes dm-g-beat { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-6deg); } }
  @keyframes dm-g-soar { 0% { transform: translateY(36px); opacity: 0; } 9% { transform: none; opacity: 1; } 80% { transform: translateY(-14px); opacity: 1; } 100% { transform: translateY(-460px) scale(.72); opacity: 0; } }
  @keyframes dm-g-flash { 0%, 100% { opacity: .3; } 6% { opacity: 1; } 12% { opacity: .35; } 18% { opacity: .85; } 30% { opacity: .3; } }
  @keyframes dm-g-crackle { 0%, 100% { opacity: .25; } 20% { opacity: 1; } 40% { opacity: .5; } 60% { opacity: 1; } 80% { opacity: .35; } }
  .dm-g-unfold { animation: dm-g-unfold 1.5s cubic-bezier(.2, .8, .3, 1) both; }
  .dm-g-beat { animation: dm-g-beat 1.6s ease-in-out 1.5s infinite; }
  .dm-g-soar { transform-origin: 640px 270px; animation: dm-g-soar 6.4s ease-in forwards; }
  .dm-g-flash { animation: dm-g-flash 2.6s ease-out infinite; }
  .dm-g-crackle { animation: dm-g-crackle .5s steps(2) infinite; }
  /* 掌天瓶：光点盘旋入瓶，瓶口凝出一滴绿液 */
  @keyframes dm-g-swirl { 0% { transform: rotate(0deg) scale(1.15); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: rotate(300deg) scale(.35); opacity: 0; } }
  @keyframes dm-g-bead { 0%, 35% { transform: translateY(10px) scale(.2); opacity: 0; } 60% { opacity: 1; } 85%, 100% { transform: translateY(-14px) scale(1); opacity: 1; } }
  .dm-g-swirl { animation: dm-g-swirl 3.4s ease-in infinite; }
  .dm-g-bead { animation: dm-g-bead 4.2s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .dm-g-charge { animation-duration: .01s; } .dm-g-soar, .dm-g-push, .dm-g-zap { animation: none; } }
  /* ---------- 教师点赞：红色「赞」按钮；被赞的弹幕盖一枚「师赞」朱印 ---------- */
  .dm-like { align-items: center; gap: 6px; padding: 2px 12px 2px 6px; border: 0; border-radius: 16px; color: #fff4e0; background: #b3261e;
    font: 700 16px/1.6 'Kaiti SC', 'STKaiti', 'KaiTi', serif; text-shadow: none; cursor: pointer; }
  .dm-like i { display: inline-grid; place-items: center; width: 20px; height: 20px; border: 1.5px solid #fff4e0; border-radius: 4px; font: 700 13px/1 'Kaiti SC', 'STKaiti', 'KaiTi', serif; font-style: normal; }
  .dm-like.is-on { color: #b3261e; background: #fff4e0; }
  .dm-like.is-on i { border-color: #b3261e; }
  .dm-like[disabled] { opacity: .7; cursor: default; }
  .dm-liked { --seal-base: translateY(-50%) rotate(-14deg); display: none; position: absolute; right: -1.15em; top: 50%; z-index: 1; place-items: center; width: 2em; height: 2em; border: 3px solid #c8281e; border-radius: 8px;
    color: #c8281e; background: rgba(255,244,224,.94); font: 700 .78em/1.02 'Kaiti SC', 'STKaiti', 'KaiTi', serif; text-align: center; text-shadow: none; transform: var(--seal-base);
    box-shadow: inset 0 0 0 3px rgba(255,244,224,.94), inset 0 0 0 4.5px #c8281e; }
  .is-liked > .dm-liked { display: grid; }
  .dm-liked.is-stamping { animation: dm-stamp .55s cubic-bezier(.2, .9, .3, 1.25) both; }
  @keyframes dm-stamp { 0% { transform: var(--seal-base) scale(2.2); opacity: 0; } 100% { transform: var(--seal-base) scale(1); opacity: 1; } }
  .dm-bubble .dm-liked { --seal-base: rotate(-14deg); right: -10px; top: -12px; width: 30px; height: 30px; border-width: 2px; font-size: 11px; box-shadow: inset 0 0 0 2px rgba(255,244,224,.94), inset 0 0 0 3px #c8281e; }
  .dm-bubble { position: relative; }
  .dm-bubble.is-liked { border-color: #c8281e; }
  .dm-bar [data-dm-likes] { padding: 1px 9px; border-radius: 5px; color: #fff4e0; background: #b3261e; font-family: 'Kaiti SC', 'STKaiti', 'KaiTi', serif; }
  .dm-bar [data-dm-likes]:empty { display: none; }
  .dm-stage.is-paused .dm-item { animation-play-state: paused; }
  @keyframes dm-fly { from { transform: translateX(0); } to { transform: translateX(calc(-100vw - 100%)); } }
  .dm-bar { position: fixed; z-index: 301; left: 108px; bottom: 22px; display: flex; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 8px;
    background: rgba(32, 28, 24, .72); color: #fff; font: 700 12.5px/1.3 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; opacity: .45; transition: opacity .2s ease; }
  .dm-bar:hover, .dm-bar:focus-within { opacity: 1; }
  .dm-bar { flex-wrap: wrap; max-width: calc(100vw - 130px); }
  .dm-bar > * { white-space: nowrap; }
  .dm-bar button { padding: 3px 8px; border: 1px solid rgba(255,255,255,.4); border-radius: 5px; color: #fff; background: transparent; font: inherit; cursor: pointer; }
  .dm-bar button[aria-pressed="true"] { background: rgba(255,255,255,.2); }
  .dm-bar a { color: #ffd98a; }
  .dm-bar label { display: inline-flex; align-items: center; gap: 5px; }
  .dm-bar select { padding: 2px 6px; border: 1px solid rgba(255,255,255,.4); border-radius: 5px; color: #fff; background: rgba(255,255,255,.12); font: inherit; cursor: pointer; }
  .dm-bar select option { color: #201c18; background: #fff; }
  .dm-bar select[disabled] { opacity: .5; cursor: default; }
  .dm-bar select.is-off { border-color: #f0b49e; }
  .dm-bar.is-min > :not([data-dm-toggle]) { display: none; }
  .dm-link { margin: 0 4px; padding: 0 6px; border-radius: 9px; color: #201c18; background: #ffd98a; font-size: .8em; }
  .dm-bubble { padding: 6px 10px; border: 1px solid rgba(35, 101, 95, .28); border-radius: 12px 12px 12px 3px; color: #201c18; background: #fff;
    box-shadow: 0 4px 12px rgba(35, 101, 95, .16); font: 600 15px/1.45 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; overflow-wrap: anywhere; }
  .dm-bubble b { margin-right: 4px; color: #6d6259; }
  /* 弹幕墙是白底：同一色系取深色 */
  .dm-bubble b.is-r1 { color: #23806a; }
  .dm-bubble b.is-r2 { color: #a8700f; }
  .dm-bubble b.is-r3 { color: #6a2fd0; }
  .dm-bubble b.is-r4 { background: linear-gradient(90deg, #b8801a, #c2408a, #7a3fe0, #1f86b8, #b8801a) 0 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
    animation: dm-flowtext 4s linear infinite; }
  .dm-bubble.is-pop { animation: dm-pop .6s cubic-bezier(.2, 1.4, .4, 1) both; }
  .dm-wall-count { justify-self: end; color: #23655f; font: 800 12px/1 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .mechanism-node.dm-hit::before { content: ""; position: absolute; inset: -2px; border-radius: 10px; pointer-events: none; animation: dm-hit 1.1s ease-out 2; }
  @keyframes dm-pop { 0% { opacity: 0; transform: translateY(12px) scale(.6); } 100% { opacity: 1; transform: none; } }
  @keyframes dm-hit { 0% { box-shadow: 0 0 0 0 rgba(164, 73, 45, .55); } 100% { box-shadow: 0 0 0 22px rgba(164, 73, 45, 0); } }
  @media (prefers-reduced-motion: reduce) { .dm-bubble.is-pop, .mechanism-node.dm-hit::before { animation: none; } }
  .dmq-card { margin: 24px 0; padding: 18px 22px; border: 2px dashed rgba(164, 73, 45, .45); border-radius: 14px; background: #fffaf3;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .dmq-card.dm-hit { animation: dm-hit 1.1s ease-out 2; }
  .dmq-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .dmq-tag { padding: 3px 11px; border-radius: 999px; color: #fff; background: #a4492d; font-weight: 800; font-size: 14px; }
  .dmq-label { color: #6d6259; font-weight: 700; font-size: 14px; }
  .dmq-count { margin-left: auto; color: #23655f; font-weight: 800; font-size: 14px; }
  .dmq-card h4 { margin: 8px 0 4px; font-size: 24px; line-height: 1.55; color: #201c18; }
  .dmq-hint { margin: 0 0 10px; color: #6d6259; font-size: 15px; }
  .dmq-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .dmq-wall > em { color: #6d6259; font-style: normal; font-size: 15px; }
  .dmq-wall .dm-bubble { font-size: 17px; }
  .dm-item { pointer-events: auto; }
  .dm-item:hover, .dm-item.is-holding { animation-play-state: paused; z-index: 1; box-shadow: 0 0 0 2px rgba(255, 217, 138, .9); }
  .dm-del { display: none; align-items: center; gap: 4px; margin-left: 10px; padding: 2px 10px; border: 0; border-radius: 14px; color: #fff; background: #a4492d;
    font: 800 15px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; text-shadow: none; vertical-align: middle; cursor: pointer; }
  .dm-del svg { width: 18px; height: 18px; }
  .dm-del.is-confirm { background: #c0392b; }
  .dm-del[disabled] { opacity: .7; cursor: default; }
  .dm-tools { display: none; position: absolute; z-index: 2; gap: 6px; align-items: center; white-space: nowrap; }
  .dm-item:hover .dm-tools, .dm-item.is-holding .dm-tools, .dm-bubble:hover .dm-tools, .dm-bubble.is-holding .dm-tools { display: inline-flex; }
  .dm-tools .dm-del, .dm-tools .dm-like { display: inline-flex; margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
  .dm-item .dm-tools { top: 50%; left: 12px; transform: translateY(-50%); }
  .dm-bubble { position: relative; }
  .dm-bubble .dm-tools { top: -14px; right: -6px; }
  .dm-bubble .dm-tools .dm-del, .dm-bubble .dm-tools .dm-like { padding: 2px 8px; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
  .dm-bubble .dm-del svg { width: 15px; height: 15px; }
  .dm-side { margin-right: 6px; padding: 0 8px; border-radius: 9px; color: #fff; font-size: .78em; font-weight: 800; vertical-align: 1px; }
  .dm-side.is-pro { background: #23655f; }
  .dm-side.is-con { background: #a4492d; }
  .dm-item .dm-side.is-pro { background: #2f8a80; }
  .dm-item .dm-side.is-con { background: #c4572f; }
  .dm-bubble.is-pro { border-color: rgba(35, 101, 95, .55); background: #eef6f4; }
  .dm-bubble.is-con { border-color: rgba(164, 73, 45, .5); background: #fbefea; }
  /* 试用特效面板 */
  .dm-demo { position: fixed; z-index: 302; left: 108px; bottom: 64px; width: min(420px, calc(100vw - 130px)); padding: 12px 14px; border-radius: 12px;
    background: rgba(24, 20, 30, .94); color: #fff4e0; box-shadow: 0 16px 40px rgba(0,0,0,.45); font: 700 13px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .dm-demo[hidden] { display: none; }
  .dm-demo h4 { display: flex; justify-content: space-between; align-items: center; margin: 0 0 2px; font-size: 15px; color: #f3d58c; }
  .dm-demo h4 button { border: 0; background: none; color: #d9cbb4; font-size: 18px; cursor: pointer; }
  .dm-demo p { margin: 0 0 8px; color: #b9afa0; font-weight: 600; font-size: 12px; }
  .dm-demo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; }
  .dm-demo-row > b { flex: 0 0 auto; width: 34px; color: #d9cbb4; font-size: 12.5px; }
  .dm-demo-row .dm-title { margin: 0; font-size: 15px; cursor: pointer; opacity: .55; }
  .dm-demo-row .dm-title[aria-pressed="true"] { opacity: 1; outline: 2px solid #fff4e0; outline-offset: 2px; }
  .dm-demo-colors button { width: 22px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; cursor: pointer; }
  .dm-demo-colors button[aria-pressed="true"] { outline: 2px solid #fff4e0; outline-offset: 2px; }
  .dm-demo-colors em { color: #b9afa0; font-style: normal; font-weight: 600; font-size: 12px; }
  .dm-demo input[type=text] { flex: 1 1 auto; min-width: 0; padding: 6px 9px; border: 1px solid rgba(255,255,255,.35); border-radius: 7px; background: rgba(255,255,255,.1); color: #fff; font: inherit; }
  .dm-demo .dm-demo-btn { padding: 5px 10px; border: 1px solid rgba(255,255,255,.4); border-radius: 7px; color: #fff; background: rgba(255,255,255,.08); font: inherit; cursor: pointer; }
  .dm-demo .dm-demo-btn.is-main { border-color: #e0b64a; background: #a4492d; }
  .dm-demo .dm-demo-btn:hover { background: rgba(255,255,255,.18); }
  .dm-demo .dm-demo-btn.is-main:hover { background: #b9573a; }
  .dm-demo label.dm-demo-check { display: inline-flex; align-items: center; gap: 5px; color: #d9cbb4; font-weight: 600; }
  @media print { .dm-stage, .dm-bar, .dm-demo { display: none !important; } }
  `;
  document.head.appendChild(style);

  const stage = document.createElement('div');
  stage.className = 'dm-stage';
  stage.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('div');
  bar.className = 'dm-bar';
  bar.setAttribute('data-ix', '');
  bar.innerHTML = '<label>弹幕<select data-dm-mode disabled aria-label="弹幕模式"><option value="off">关闭</option><option value="direct">直接上屏</option><option value="review">审核后上屏</option></select></label>'
    + '<button type="button" data-dm-anon aria-pressed="false" disabled title="开启后投屏不显示学生姓名；工作台和导出里仍记录是谁发的">匿名：关</button>'
    + '<span data-dm-state>连接中</span><span data-dm-likes title="鼠标停在弹幕上可点赞；被赞的同学额外加修为"></span><button type="button" data-dm-loop aria-pressed="true">循环：开</button>'
    + '<button type="button" data-dm-pause>暂停</button><button type="button" data-dm-clear title="撤下现有弹幕，且不再循环播放；之后的新弹幕照常显示">清屏</button>'
    + '<button type="button" data-dm-demo aria-expanded="false" title="在投屏上试放各境界的弹幕特效和法宝画面（只在本机播放，不写入记录）">试用特效</button><button type="button" data-dm-toggle>收起</button>';
  ['click', 'keydown'].forEach((type) => bar.addEventListener(type, (event) => event.stopPropagation()));
  const giftLayer = document.createElement('div');
  giftLayer.className = 'dm-gifts';
  document.body.append(stage, giftLayer, bar);
  const stateEl = bar.querySelector('[data-dm-state]');
  const setState = (html) => { stateEl.innerHTML = html; };
  const loopButton = bar.querySelector('[data-dm-loop]');
  const anonButton = bar.querySelector('[data-dm-anon]');
  const anonymous = () => Boolean(room && room.danmaku_anon);
  const modeSelect = bar.querySelector('[data-dm-mode]');

  let room = null;
  let paused = false;
  let looping = store.get('loop') !== 'off';
  let primed = false;
  let cursor = 0;
  const pool = [];              // 可循环播放的弹幕（按发送顺序）
  const inPool = new Set();
  const seen = new Set();       // 已见过的 id（用于判断“新来的”）
  const flying = new Map();     // id → 正在飞的元素
  let cleared = new Set();      // 已清屏的弹幕 id（不再上屏、不再循环），按课堂保存在本机
  let clearedRoom = null;
  const loadCleared = (roomId) => {
    try { return new Set(JSON.parse(store.get(`cleared:${roomId}`) || '[]')); } catch (error) { return new Set(); }
  };
  const saveCleared = () => store.set(`cleared:${clearedRoom}`, JSON.stringify(Array.from(cleared).slice(-800)));
  const laneFree = new Array(LANES).fill(0);

  const modeText = () => (room.danmaku === 'review' ? '审核后上屏' : '直接上屏');
  const refreshState = () => {
    if (!room) return;
    if (!modeSelect.matches(':focus')) modeSelect.value = room.danmaku || 'off';
    modeSelect.disabled = false;
    modeSelect.classList.toggle('is-off', room.danmaku === 'off');
    modeSelect.title = `课堂：${room.name}（${room.code}）`;
    anonButton.disabled = false;
    anonButton.textContent = anonymous() ? '匿名：开' : '匿名：关';
    anonButton.setAttribute('aria-pressed', String(anonymous()));
    if (room.danmaku === 'off') setState('学生暂时不能发送');
    else setState(`${pool.length} 条${room.danmaku === 'review' ? '（在工作台审核）' : ''}`);
  };
  const setLoop = (value) => {
    looping = value;
    store.set('loop', value ? 'on' : 'off');
    loopButton.textContent = value ? '循环：开' : '循环：关';
    loopButton.setAttribute('aria-pressed', String(value));
  };
  setLoop(looping);

  const launch = (doc, isNew) => {
    const id = String(doc.id);
    if (paused || flying.has(id)) return false;
    const now = Date.now();
    let lane = 0;
    for (let i = 1; i < LANES; i += 1) if (laneFree[i] < laneFree[lane]) lane = i;
    // 所有轨道都还没空出来时，循环播放先等一等（新弹幕仍然排队上屏）
    if (!isNew && laneFree[lane] > now + 400) return false;
    const delay = Math.max(0, laneFree[lane] - now);
    laneFree[lane] = Math.max(now, laneFree[lane]) + 2200;
    const item = document.createElement('div');
    item.className = isNew ? 'dm-item is-new' : 'dm-item';
    // 修为境界：姓名前的称号随姓名一起显示或隐藏，姓名颜色与称号一致；弹幕字色随境界（匿名时也有）
    const realm = realmFor(doc);
    const level = realm ? realm.realm : 0;
    const name = document.createElement('span');
    name.className = `dm-name is-r${level}`;
    name.hidden = anonymous();   // 匿名时姓名不显示；随时关闭匿名，正在飞的弹幕也能立刻补上姓名
    const title = document.createElement('span');
    title.className = `dm-title is-r${level}`;
    title.textContent = realm ? realmName(level) : '';
    if (realm) title.dataset.realm = '1';
    title.hidden = anonymous() || !realm;
    // 弹幕字色：元婴起才有（发送人自选，境界不够的选择不算），炼气至结丹一律白字
    const color = level >= 3 && window.ClassLive.colorFor ? window.ClassLive.colorFor(level, doc.color) : null;
    if (level >= 3) item.classList.add(`is-r${level}`);
    const body = (text) => {
      const span = document.createElement('span');
      span.className = 'dm-text';
      if (color && color.flow) { span.classList.add('dm-flowtext'); span.style.backgroundImage = color.flow; } else if (color) span.style.color = color.value;
      span.textContent = text;
      return span;
    };
    const tag = tagOf(doc);
    if (tag) {
      name.textContent = doc.name;
      const link = document.createElement('span');
      link.className = 'dm-link';
      link.textContent = tag.link;
      if (tag.side) item.append(sideBadge(tag.side));
      item.append(title, name, link, body(`：${tag.text}`));
    } else {
      name.textContent = `${doc.name}：`;
      item.append(title, name, body(doc.text));
    }
    const badge = document.createElement('span');
    badge.className = 'dm-liked';
    badge.innerHTML = '师<br>赞';
    item.dataset.dmId = id;
    item.classList.toggle('is-liked', liked.has(id) || Boolean(doc.demoLiked));
    if (doc.demo) item.append(badge); else item.append(badge, hoverTools(doc, item));
    item.style.top = `${lane * (100 / LANES)}%`;
    item.style.setProperty('--dm-duration', `${10 + Math.min(doc.text.length + String(doc.name).length, 50) / 8}s`);
    item.style.animationDelay = `${delay}ms`;
    item.addEventListener('animationend', (event) => {   // 只认飞行动画结束（朱印、辉边等子动画的结束事件会冒泡上来）
      if (event.target !== item || event.animationName !== 'dm-fly') return;
      item.remove();
      flying.delete(id);
    });
    flying.set(id, item);
    stage.appendChild(item);
    if (doc.demoLiked) setTimeout(() => burst(item), delay + 900);
    return true;
  };

  // ---------- 修为境界与法宝 ----------
  const REALMS = window.ClassLive.REALMS || [];
  const GIFT = new Map((window.ClassLive.GIFTS || []).map((gift) => [gift.id, gift]));
  const sidKey = (sid) => String(sid == null ? '' : sid).replace(/\s+/g, '').toUpperCase();
  const isoDayOf = (value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(Date.parse(String(value).replace(/(\.\d{3})\d+/, '$1')) || 0));
  let realmMap = new Map();
  const realmFor = (doc) => (doc.demo ? { realm: doc.demoRealm, stage: 1 } : realmMap.get(sidKey(doc.sid)) || null);
  const realmName = (level) => (REALMS[level] ? REALMS[level].name : '');
  async function loadRealms() {
    if (!room) return;
    try {
      const rows = await backend.fetchAll('realms', { course: config.course });
      realmMap = new Map(rows.filter((row) => (Number(row.class_id) || 0) === (Number(room.class_id) || 0))
        .map((row) => [sidKey(row.sid), { realm: Number(row.realm) || 0, stage: Number(row.stage) || 0 }]));
    } catch (error) {
      realmMap = new Map();   // 还没有修为境界数据表时不显示称号
    }
  }
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
        veil: 'radial-gradient(circle at 50% 41%, #48802a 0%, #16360e 24%, #040904 50%, #000 100%)',
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
        veil: 'radial-gradient(ellipse at 50% 44%, #0e3220 0%, #0a2016 40%, #07120c 72%, #040906 100%)',
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
        veil: 'radial-gradient(ellipse at 50% 38%, #ffe296 0%, #d69e40 26%, #784e1c 56%, #2e1e0c 84%, #18100a 100%)',
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
        veil: 'radial-gradient(ellipse at 50% 42%, #96be46 0%, #366e2c 32%, #12341a 66%, #08180c 100%)',
        nameClass: 'dm-g-jade', tailStyle: 'color:#cfeea6',
        html: `<div style="position:absolute;left:640px;top:292px;width:0;height:0">
            <svg class="dm-g-spin-slow" aria-hidden="true" style="position:absolute;left:-700px;top:-700px;filter:blur(5px)" width="1400" height="1400" viewBox="-700 -700 1400 1400"><g fill="none" stroke-linecap="round">${wisps(10, [16, 28], 'rgba(214,255,190,.2)')}${wisps(7, [3, 3], 'rgba(236,255,214,.32)')}</g></svg>
            <div class="dm-g-spin-slow" style="position:absolute;left:-640px;top:-640px;width:1280px;height:1280px;background:repeating-conic-gradient(from 4deg,rgba(250,255,200,.16) 0deg 2deg,transparent 2deg 10deg);-webkit-mask-image:radial-gradient(circle,#000 0%,transparent 50%);mask-image:radial-gradient(circle,#000 0%,transparent 50%);animation-direction:reverse"></div>
            <div class="dm-g-glow" style="position:absolute;left:-380px;top:-380px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,226,.98) 0%,rgba(246,255,168,.82) 12%,rgba(184,236,90,.5) 28%,rgba(100,180,60,.18) 48%,transparent 64%)"></div>
            ${swirl(380, '#f4ffd0', 12, 0)}${swirl(320, '#d8ffa0', 10, 1.1)}${swirl(420, '#ffffff', 9, 2.2)}
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
  // 风雷翅：人物虚化、双翼重新上色＋翅膀轮廓光边一层；掌天瓶：抠出的瓶子（重新上色）＋金纹一层，背景用矢量灵雾光芒。
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
  setTimeout(() => Object.keys(ART).forEach(artUrl), 4000);
  // 底图按高度放进 1280×720 场景、四周渐隐；全屏背景是同一张图的模糊放大。画面缓慢推近、明暗呼吸，光效用滤色叠加
  const photo = (src, x, y, w, h, mask, origin, over = '') => `<div class="dm-g-push" style="position:absolute;inset:0;transform-origin:${origin}">
      <img class="dm-g-photo dm-g-bright" src="${src}" alt="" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;-webkit-mask-image:${mask};mask-image:${mask}">${over}</div>`;
  const blurVeil = (src) => `center / cover no-repeat url('${src}')`;
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
        veil: blurVeil(src), veilStyle: 'filter:blur(26px) brightness(.8);transform:scale(1.12)',
        nameStyle: 'color:#fff1c2;text-shadow:0 0 18px rgba(255,206,90,.95)', tailStyle: 'color:#f0d48e',
        html: `${photo(src, 93, 0, 1094, 720, 'linear-gradient(90deg, transparent 0, #000 8%, #000 92%, transparent 100%)', `${cx}px ${cy}px`,
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
        veil: 'radial-gradient(ellipse at 50% 42%, #96be46 0%, #366e2c 32%, #12341a 66%, #08180c 100%)',
        nameClass: 'dm-g-jade', tailStyle: 'color:#cfeea6',
        html: `<div style="position:absolute;left:640px;top:292px;width:0;height:0">
            <svg class="dm-g-spin-slow" aria-hidden="true" style="position:absolute;left:-700px;top:-700px;filter:blur(5px)" width="1400" height="1400" viewBox="-700 -700 1400 1400"><g fill="none" stroke-linecap="round">${wisps(12, [16, 30], 'rgba(214,255,190,.22)')}${wisps(8, [3, 3], 'rgba(236,255,214,.34)')}</g></svg>
            <div class="dm-g-spin-slow" style="position:absolute;left:-640px;top:-640px;width:1280px;height:1280px;background:repeating-conic-gradient(from 4deg,rgba(250,255,200,.18) 0deg 2deg,transparent 2deg 10deg);-webkit-mask-image:radial-gradient(circle,#000 0%,transparent 50%);mask-image:radial-gradient(circle,#000 0%,transparent 50%);animation-direction:reverse"></div>
            <div class="dm-g-glow" style="position:absolute;left:-400px;top:-400px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,226,.98) 0%,rgba(246,255,168,.82) 12%,rgba(184,236,90,.5) 28%,rgba(100,180,60,.18) 48%,transparent 64%)"></div>
            ${swirl(400, '#f4ffd0', 12, 0)}${swirl(340, '#d8ffa0', 10, 1.1)}${swirl(460, '#ffffff', 9, 2.2)}
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
  async function launchGift(doc) {
    const gift = GIFT.get(doc.gift);
    if (!gift || !SCENES[gift.id] || paused) return;
    const art = ART_SCENES[gift.id] ? await artFor(gift.id) : null;
    const realm = realmFor(doc);
    const level = realm ? realm.realm : gift.level;
    const scene = (art ? ART_SCENES[gift.id] : SCENES[gift.id])(Math.random().toString(36).slice(2, 8), art);
    const el = document.createElement('div');
    el.className = `dm-gift dm-gift-${gift.id}`;
    el.style.setProperty('--dm-scale', String(Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
    const name = realmName(level);
    el.innerHTML = `<div class="dm-g-veil" style="background:${scene.veil}${scene.veilStyle ? `;${scene.veilStyle}` : ''}"></div>
      <div class="dm-g-box">${scene.html}
        <div class="dm-g-plate"><span class="dm-g-seal">${esc(name.slice(0, 1))}<br>${esc(name.slice(1))}</span>
          <div class="dm-g-lines"><span class="dm-g-who"></span>
            <span class="dm-g-name ${scene.nameClass || ''}" style="${scene.nameStyle || ''}">${esc(gift.name)}</span>
            <span class="dm-g-tail" style="${scene.tailStyle || ''}">${esc(gift.tail || '')}</span></div></div></div>`;
    el.querySelector('.dm-g-who').textContent = `${anonymous() ? `一位${name}修士` : doc.name}　${gift.verb || '祭出'}`;
    giftLayer.appendChild(el);
    setTimeout(() => el.remove(), 6600);
  }



  // ---------- 试用特效：只在本机播放，不写入弹幕记录、不计修为 ----------
  const DEMO_COLORS = window.ClassLive.COLORS || [];
  const demo = document.createElement('div');
  demo.className = 'dm-demo';
  demo.hidden = true;
  demo.setAttribute('data-ix', '');
  demo.setAttribute('role', 'dialog');
  demo.setAttribute('aria-label', '试用境界特效与法宝');
  ['click', 'keydown', 'keyup', 'pointerdown', 'mousedown', 'wheel'].forEach((type) => demo.addEventListener(type, (event) => event.stopPropagation()));
  const demoState = { level: 3, color: {} };
  let demoSeq = 0;
  demo.innerHTML = `<h4><span>试用境界特效与法宝</span><button type="button" data-demo-close aria-label="关闭">×</button></h4>
    <p>只在这台电脑的投屏上播放：不写入弹幕记录、不计修为，学生看不到。</p>
    <div class="dm-demo-row" data-demo-realms><b>境界</b>${REALMS.map((realm) => `<button type="button" class="dm-title is-r${realm.level}" data-demo-level="${realm.level}">${esc(realm.name)}</button>`).join('')}</div>
    <div class="dm-demo-row dm-demo-colors" data-demo-colors><b>字色</b></div>
    <div class="dm-demo-row"><b>内容</b><input type="text" maxlength="40" value="发展为了人民，发展依靠人民" data-demo-text aria-label="试用弹幕内容"></div>
    <div class="dm-demo-row"><b></b><button type="button" class="dm-demo-btn is-main" data-demo-send>发一条试用弹幕</button>
      <label class="dm-demo-check"><input type="checkbox" data-demo-liked>带「师赞」朱印</label></div>
    <div class="dm-demo-row"><b></b><button type="button" class="dm-demo-btn" data-demo-all>一键演示五个境界</button></div>
    <div class="dm-demo-row" data-demo-gifts><b>法宝</b>${Array.from(GIFT.values()).map((gift) => `<button type="button" class="dm-demo-btn" data-demo-gift="${esc(gift.id)}">${esc(gift.name)}<small style="color:#b9afa0;font-weight:600">（${esc(realmName(gift.level))}）</small></button>`).join('')}</div>`;
  document.body.appendChild(demo);
  const demoText = demo.querySelector('[data-demo-text]');
  function paintDemo() {
    demo.querySelectorAll('[data-demo-level]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.demoLevel) === demoState.level)));
    const box = demo.querySelector('[data-demo-colors]');
    box.querySelectorAll('button, em').forEach((el) => el.remove());
    const open = DEMO_COLORS.filter((color) => demoState.level >= color.level);
    if (!open.length) {
      const note = document.createElement('em');
      note.textContent = '炼气至结丹的弹幕一律白字（元婴起可选字色）';
      box.appendChild(note);
      return;
    }
    const current = window.ClassLive.colorFor(demoState.level, demoState.color[demoState.level]);
    open.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.demoColor = color.id;
      button.style.background = color.flow || color.value;
      button.title = color.name;
      button.setAttribute('aria-label', `字色：${color.name}`);
      button.setAttribute('aria-pressed', String(Boolean(current && current.id === color.id)));
      box.appendChild(button);
    });
  }
  const sendDemo = (level, text, colorId, likedSeal) => {
    demoSeq += 1;
    launch({ id: `demo-${demoSeq}`, demo: true, demoRealm: level, demoLiked: likedSeal, name: '示例同学', sid: 'DEMO', text, color: colorId || null }, true);
  };
  demo.addEventListener('click', (event) => {
    const levelButton = event.target.closest('[data-demo-level]');
    const colorButton = event.target.closest('[data-demo-color]');
    const giftButton = event.target.closest('[data-demo-gift]');
    if (event.target.closest('[data-demo-close]')) { toggleDemo(false); return; }
    if (levelButton) { demoState.level = Number(levelButton.dataset.demoLevel); paintDemo(); return; }
    if (colorButton) { demoState.color[demoState.level] = colorButton.dataset.demoColor; paintDemo(); return; }
    if (event.target.closest('[data-demo-send]')) {
      sendDemo(demoState.level, demoText.value.trim() || '试用弹幕', demoState.color[demoState.level], demo.querySelector('[data-demo-liked]').checked);
      return;
    }
    if (event.target.closest('[data-demo-all]')) {
      const lines = ['炼气：素石称号，弹幕白字', '筑基：青玉称号', '结丹：金丹称号', '元婴：紫色辉边，可自选字色', '化神：七彩流光边框和流光字'];
      REALMS.forEach((realm, i) => setTimeout(() => sendDemo(realm.level, lines[i] || realm.name, demoState.color[realm.level], false), i * 700));
      return;
    }
    if (giftButton) {
      const gift = GIFT.get(giftButton.dataset.demoGift);
      if (!gift) return;
      launchGift({ gift: gift.id, demo: true, demoRealm: gift.level, name: '示例同学', sid: 'DEMO' });
      // 法宝画面播放时先让开，免得挡住名牌；播完再出现
      demo.style.visibility = 'hidden';
      clearTimeout(demo.showTimer);
      demo.showTimer = setTimeout(() => { demo.style.visibility = ''; }, 6600);
    }
  });
  demoText.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); demo.querySelector('[data-demo-send]').click(); } });
  const demoToggle = bar.querySelector('[data-dm-demo]');
  function toggleDemo(open) {
    demo.hidden = !open;
    demoToggle.setAttribute('aria-expanded', String(open));
    if (open) { paintDemo(); if (paused) bar.querySelector('[data-dm-pause]').click(); }
  }
  demoToggle.addEventListener('click', () => toggleDemo(demo.hidden));
  // 工作台“修为境界”里的“试用境界特效与法宝”链接带 ?demo=1：打开投屏页时直接展开试用面板
  if (new URLSearchParams(location.search).get('demo') === '1') toggleDemo(true);

  // 学生撤回的（withdrawn_at）不再上屏；记录仍在工作台
  const visible = (doc) => !doc.withdrawn_at && (room.danmaku === 'review' ? doc.status === 'shown' : doc.status !== 'hidden');

  // ---------- 机制图“弹幕接龙” ----------
  const TAG = /^【(\d{2})([①②③④])→([①②③④])】\s*/;
  const QTAG = /^【问(\d{1,2})】\s*/;
  const SIDE = /^【(正方|反方)】\s*/;
  // 弹幕小问题（政治经济学讲解版）：在对应页面放一张问题卡片，下面是这道题的弹幕墙
  if (Array.isArray(config.danmaku)) {
    config.danmaku.forEach((item, index) => {
      // 习经章节页：放在生成器留好的位置（data-dm-slot）；政治经济学：按页面和位置插入
      const slot = item.slot ? document.querySelector(`[data-dm-slot="${item.slot}"]`) : null;
      const page = slot ? null : document.getElementById(item.after);
      if (!slot && !page) return;
      const box = slot || page.querySelector('.inner') || page;
      const card = document.createElement('section');
      card.className = 'dmq-card';
      card.innerHTML = `<div class="dmq-head"><span class="dmq-tag">弹幕小问题 · 问${index + 1}</span><span class="dmq-label"></span><span class="dmq-count"></span></div>
        <h4></h4><p class="dmq-hint"></p><div class="dmq-wall" data-mech-wall data-case="q" data-link="${index + 1}" data-max="12"></div>`;  // 投屏学生也看得到：不放给老师看的提示语，墙在收到弹幕前留空
      card.querySelector('.dmq-label').textContent = item.label || '';
      card.querySelector('h4').textContent = item.prompt;
      const hint = card.querySelector('.dmq-hint');
      if (item.hint) hint.textContent = item.hint; else hint.remove();
      if (slot) { slot.replaceChildren(card); return; }
      const head = box.querySelector('.page-head');
      // 概念页：辨一辨追问紧跟在辨一辨之后；读情境紧跟在并入的“事实与情境”之后
      const spot = item.where === 'check' ? page.querySelector('[data-step="check"]') : item.where === 'scene' ? page.querySelector('.cl-scene') : null;
      if (spot) spot.insertAdjacentElement('afterend', card);
      else if (item.where === 'start' && head) head.insertAdjacentElement('afterend', card);
      else box.appendChild(card);
    });
  }
  function tagOf(doc) {
    const match = TAG.exec(doc.text || '');
    if (match) return { key: `${match[1]}|${match[2]}→${match[3]}`, link: `${match[2]}→${match[3]}`, text: doc.text.slice(match[0].length) };
    const question = QTAG.exec(doc.text || '');
    if (!question) return null;
    const rest = doc.text.slice(question[0].length);
    const side = SIDE.exec(rest);
    return { key: `q|${question[1]}`, link: `问${question[1]}`, text: side ? rest.slice(side[0].length) : rest, side: side ? side[1] : '' };
  }
  function sideBadge(side) {
    const badge = document.createElement('span');
    badge.className = `dm-side ${side === '正方' ? 'is-pro' : 'is-con'}`;
    badge.textContent = side;
    return badge;
  }

  // ---------- 鼠标悬停删除 ----------
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const deleted = new Set();    // 本页已删除的弹幕 id（读取结果里若还带着，也不再显示）
  let wallRows = [];            // 当前弹幕墙使用的弹幕（删除后据此重排）
  // ---------- 教师点赞（每堂课有上限，额外加修为） ----------
  const LIKE = window.ClassLive.LIKE || { limit: 5 };
  const liked = new Set();   // 已点赞的弹幕 id（以后台为准，每次读取时更新）
  let likesUsed = null;
  const likesEl = bar.querySelector('[data-dm-likes]');
  const showLikes = () => { likesEl.textContent = likesUsed == null ? '' : `赞 ${likesUsed}/${LIKE.limit}`; };
  function markLiked() {
    document.querySelectorAll('[data-dm-id]').forEach((el) => {
      const on = liked.has(el.dataset.dmId);
      el.classList.toggle('is-liked', on);
      const button = el.querySelector(':scope > .dm-tools .dm-like');
      if (button && !button.disabled) paintLike(button, on);
    });
  }
  function paintLike(button, on) {
    button.classList.toggle('is-on', on);
    button.innerHTML = on ? '<i>赞</i>已赞' : '<i>赞</i>点赞';
    button.title = on ? '取消点赞' : `给这条弹幕点赞：发送的同学额外加修为（每堂课最多 ${LIKE.limit} 个赞）`;
  }
  // 点赞那一下：这条弹幕上的「师赞」朱印盖下去
  function burst(host) {
    const seal = host.querySelector(':scope > .dm-liked');
    if (!seal) return;
    seal.classList.remove('is-stamping');
    void seal.offsetWidth;
    seal.classList.add('is-stamping');
  }

  function likeButton(doc, host) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dm-like';
    paintLike(button, liked.has(String(doc.id)));
    ['pointerdown', 'mousedown', 'keydown'].forEach((type) => button.addEventListener(type, (event) => event.stopPropagation()));
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(doc.id);
      const on = liked.has(id);
      button.disabled = true;
      try {
        const result = await backend.rpc('ck_like_danmaku', { p_id: Number(doc.id) || doc.id, p_like: !on });
        const row = Array.isArray(result) ? result[0] : result;
        if (row && row.liked) liked.add(id); else liked.delete(id);
        if (row && row.used != null) likesUsed = Number(row.used);
        showLikes();
        if (!on && liked.has(id)) burst(host);
      } catch (error) {
        console.warn('[点赞]', error);
        const text = String((error && error.message) || error || '');
        setState(/上限/.test(text) ? `本堂课的 ${LIKE.limit} 个赞已经用完` : /PGRST202|42883|Could not find the function|未知的后台函数/.test(text)
          ? '点赞功能还没开通：请先执行 tools/cloudbase-pg-20261010-修为境界.sql' : `点赞失败：${text}`);
      } finally {
        button.disabled = false;
        markLiked();
      }
    });
    return button;
  }
  // 鼠标停在弹幕上：出现“点赞”和垃圾桶。飞行弹幕可能很长、一部分在屏幕外：按钮出现在鼠标进入处的右侧，保证看得见、点得到
  function hoverTools(doc, host) {
    const box = document.createElement('span');
    box.className = 'dm-tools';
    if (!doc.gift) box.append(likeButton(doc, host));
    box.append(trashButton(doc, host));
    if (host.classList.contains('dm-item')) {
      host.addEventListener('mouseenter', (event) => {
        if (host.classList.contains('is-holding')) return;
        const rect = host.getBoundingClientRect();
        const left = Math.min(event.clientX - rect.left + 14, rect.width - 150, window.innerWidth - rect.left - 230);
        box.style.left = `${Math.max(left, 8)}px`;
      });
    }
    return box;
  }

  function trashButton(doc, host) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dm-del';
    button.title = '删除这条弹幕（从记录里彻底删除，无法恢复）';
    button.setAttribute('aria-label', '删除这条弹幕');
    button.innerHTML = TRASH;
    let timer = 0;
    const reset = () => {
      button.classList.remove('is-confirm');
      button.innerHTML = TRASH;
      host.classList.remove('is-holding');
    };
    ['pointerdown', 'mousedown', 'keydown'].forEach((type) => button.addEventListener(type, (event) => event.stopPropagation()));
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      // 第一次点：变成“确认删除？”，弹幕保持停住；3 秒内再点一次才删除
      if (!button.classList.contains('is-confirm')) {
        button.classList.add('is-confirm');
        button.innerHTML = `${TRASH}<span>确认删除？</span>`;
        host.classList.add('is-holding');
        clearTimeout(timer);
        timer = setTimeout(reset, 3000);
        return;
      }
      clearTimeout(timer);
      button.disabled = true;
      button.innerHTML = '<span>正在删除……</span>';
      try {
        await removeDoc(doc);
      } catch (error) {
        console.warn('[弹幕]', error);
        button.disabled = false;
        reset();
        setState(`删除失败：${(error && error.message) || error}`);
      }
    });
    return button;
  }
  async function removeDoc(doc) {
    const id = String(doc.id);
    await backend.removeAll('danmaku', { id: Number(doc.id) || doc.id });
    deleted.add(id);
    seen.add(id);
    dropFromPool(id);
    if (flying.has(id)) { flying.get(id).remove(); flying.delete(id); }
    wallRows = wallRows.filter((row) => String(row.id) !== id);
    renderWalls(wallRows);
    refreshState();
    setState('已删除 1 条弹幕');
  }
  const WALL_MAX = 3;
  const walls = new Map();
  document.querySelectorAll('[data-mech-wall]').forEach((el) => walls.set(`${el.dataset.case}|${el.dataset.link}`, el));
  const wallShown = new Map();   // 箭头 → 正在显示的弹幕 id
  let wallsPrimed = false;
  function renderWalls(docs) {
    if (!walls.size) return;
    const groups = new Map();
    docs.forEach((doc) => {
      const tag = tagOf(doc);
      if (!tag || !walls.has(tag.key)) return;
      if (!groups.has(tag.key)) groups.set(tag.key, []);
      groups.get(tag.key).push({ doc, tag });
    });
    walls.forEach((wall, key) => {
      const list = groups.get(key) || [];
      const latest = list.slice(-(Number(wall.dataset.max) || WALL_MAX));
      const counter = wall.closest('.dmq-card') && wall.closest('.dmq-card').querySelector('.dmq-count');
      if (counter) counter.textContent = list.length ? `${list.length} 条` : '';
      const before = wallShown.get(key) || [];
      const ids = latest.map(({ doc }) => String(doc.id));
      const placeholder = wall.querySelector('em');
      if (placeholder) placeholder.hidden = list.length > 0;
      let count = wall.querySelector('.dm-wall-count');
      if (ids.join() !== before.join()) {
        wall.querySelectorAll('.dm-bubble').forEach((el) => el.remove());
        let fresh = false;
        latest.forEach(({ doc, tag }) => {
          const bubble = document.createElement('div');
          const isNew = wallsPrimed && !before.includes(String(doc.id));
          fresh = fresh || isNew;
          bubble.className = (isNew ? 'dm-bubble is-pop' : 'dm-bubble') + (tag.side ? (tag.side === '正方' ? ' is-pro' : ' is-con') : '');
          const who = document.createElement('b');
          const realm = realmFor(doc);
          who.className = `is-r${realm ? realm.realm : 0}`;
          who.textContent = `${doc.name}：`;
          if (tag.side) bubble.append(sideBadge(tag.side));
          if (!anonymous()) bubble.append(who);
          const badge = document.createElement('span');
          badge.className = 'dm-liked';
          badge.innerHTML = '师<br>赞';
          bubble.dataset.dmId = String(doc.id);
          bubble.classList.toggle('is-liked', liked.has(String(doc.id)));
          bubble.append(document.createTextNode(tag.text), badge, hoverTools(doc, bubble));
          wall.insertBefore(bubble, count);
        });
        wallShown.set(key, ids);
        const node = wall.closest('.mechanism-node') || wall.closest('.dmq-card');
        if (fresh && node) {
          node.classList.remove('dm-hit');
          void node.offsetWidth;
          node.classList.add('dm-hit');
          setTimeout(() => node.classList.remove('dm-hit'), 2400);
        }
      }
      if (!counter && list.length > WALL_MAX) {
        if (!count) { count = document.createElement('span'); count.className = 'dm-wall-count'; wall.appendChild(count); }
        count.textContent = `共 ${list.length} 条`;
      } else if (count) count.remove();
    });
    wallsPrimed = true;
  }
  const dropFromPool = (id) => {
    if (!inPool.has(id)) return;
    inPool.delete(id);
    const index = pool.findIndex((doc) => String(doc.id) === id);
    if (index >= 0) { pool.splice(index, 1); if (cursor > index) cursor -= 1; }
    if (flying.has(id)) { flying.get(id).remove(); flying.delete(id); }
  };

  // 匿名开关切换：屏幕上正在飞的弹幕立即隐藏或补上姓名；弹幕墙按新设置重画
  function applyAnonymous() {
    stage.querySelectorAll('.dm-name').forEach((el) => { el.hidden = anonymous(); });
    stage.querySelectorAll('.dm-title').forEach((el) => { el.hidden = anonymous() || !el.dataset.realm; });
    wallShown.clear();
    renderWalls(wallRows);
    refreshState();
  }
  anonButton.addEventListener('click', async () => {
    if (!room) return;
    const next = !anonymous();
    anonButton.disabled = true;
    setState('正在设置……');
    try {
      const result = await backend.rpc('ck_set_danmaku_anon', { p_classroom: Number(room.id), p_anon: next });
      const updated = Array.isArray(result) ? result[0] : result;
      room = { ...room, ...(updated && updated.id ? updated : { danmaku_anon: next }) };
      applyAnonymous();
      setState(next ? '已开启匿名：投屏不显示姓名' : '已关闭匿名：投屏显示姓名');
    } catch (error) {
      console.warn('[弹幕]', error);
      setState(`设置失败：${(error && error.message) || error}`);
    } finally {
      anonButton.disabled = !room;
    }
  });

  async function pollRoom() {
    try {
      const rooms = await backend.fetchAll('classrooms', { course: config.course });
      const unit = config.unit || (location.pathname.match(/([a-z]{2,6}\d{2})\.html$/) || [])[1];
      const next = window.ClassLive.pickRoom(rooms, config.course, unit);
      const changed = !room || !next || `${room.id}|${room.danmaku}` !== `${next.id}|${next.danmaku}`;
      const anonChanged = Boolean(room && next && Boolean(room.danmaku_anon) !== Boolean(next.danmaku_anon));
      room = next;
      if (anonChanged) applyAnonymous();
      if (!room) { modeSelect.disabled = true; setState('没有当前课堂'); return false; }
      refreshState();
      return changed;
    } catch (error) {
      room = null;
      modeSelect.disabled = true;
      setState('请先<a href="/teacher/" target="_blank" rel="noopener">登录教师工作台</a>');
      return false;
    }
  }

  async function pollDanmaku() {
    if (!room || room.danmaku === 'off') return;
    if (clearedRoom !== String(room.id)) { clearedRoom = String(room.id); cleared = loadCleared(clearedRoom); }
    try {
      const rows = (await backend.fetchAll('danmaku', { classroom: Number(room.id) }, { limit: 80 })).reverse()
        .filter((doc) => !deleted.has(String(doc.id)));
      // 老师点赞：以后台为准（换了设备或在工作台改过也一致）；本堂课已用的赞＝今天点的
      liked.clear();
      rows.forEach((doc) => { if (doc.liked_at) liked.add(String(doc.id)); });
      likesUsed = rows.filter((doc) => doc.liked_at && isoDayOf(doc.liked_at) === window.ClassLive.today()).length;
      showLikes();
      markLiked();
      // 工作台删除的弹幕：不再出现在读取结果里，从循环和屏幕上撤下
      const present = new Set(rows.map((doc) => String(doc.id)));
      Array.from(inPool).filter((id) => !present.has(id)).forEach(dropFromPool);
      rows.forEach((doc) => {
        const id = String(doc.id);
        if (cleared.has(id)) { seen.add(id); dropFromPool(id); return; }
        if (!visible(doc)) { dropFromPool(id); return; }
        if (doc.gift) {   // 法宝：新到时播放一次，不进循环和弹幕墙
          if (!seen.has(id)) { seen.add(id); if (primed) launchGift(doc); }
          return;
        }
        if (!inPool.has(id)) {
          inPool.add(id);
          pool.push(doc);
          if (pool.length > POOL) inPool.delete(String(pool.shift().id));
        }
        // 打开页面时已有的弹幕进入循环；之后新来的（或新通过审核的）立即上屏
        if (!seen.has(id)) {
          seen.add(id);
          if (primed) launch(doc, true);
        }
      });
      primed = true;
      wallRows = rows.filter((doc) => !cleared.has(String(doc.id)) && visible(doc) && !doc.gift);
      renderWalls(wallRows);
      refreshState();
    } catch (error) {
      console.warn('[弹幕]', error);
    }
  }

  // 循环播放：空档时依次播放可显示的弹幕
  setInterval(() => {
    if (!looping || paused || !room || room.danmaku === 'off' || !pool.length) return;
    for (let tries = 0; tries < pool.length; tries += 1) {
      cursor = cursor % pool.length;
      const doc = pool[cursor];
      cursor += 1;
      if (!flying.has(String(doc.id))) { launch(doc, false); return; }
    }
  }, LOOP_MS);

  loopButton.addEventListener('click', () => setLoop(!looping));
  bar.querySelector('[data-dm-pause]').addEventListener('click', (event) => {
    paused = !paused;
    stage.classList.toggle('is-paused', paused);
    event.currentTarget.textContent = paused ? '继续' : '暂停';
  });
  // 清屏：撤下现有弹幕，并把已出现过的弹幕移出循环；之后的新弹幕照常显示
  bar.querySelector('[data-dm-clear]').addEventListener('click', () => {
    if (clearedRoom) {
      [...seen, ...inPool].forEach((id) => cleared.add(id));
      saveCleared();
    }
    pool.length = 0;
    inPool.clear();
    cursor = 0;
    stage.innerHTML = '';
    flying.clear();
    laneFree.fill(0);
    renderWalls([]);
    if (room) setState('已清屏，之前的弹幕不再循环');
  });
  // 直接在投屏页切换弹幕模式（教师账号）；关闭时学生不能发送，开启后新弹幕照常上屏
  modeSelect.addEventListener('change', async () => {
    if (!room) return;
    const mode = modeSelect.value;
    modeSelect.disabled = true;
    setState('正在设置……');
    try {
      const result = await backend.rpc('ck_set_danmaku', { p_classroom: Number(room.id), p_mode: mode });
      const updated = Array.isArray(result) ? result[0] : result;
      room = { ...room, ...(updated && updated.id ? updated : { danmaku: mode }) };
      pool.length = 0;
      inPool.clear();
      cursor = 0;
      primed = false;
      if (mode === 'off') { stage.innerHTML = ''; flying.clear(); laneFree.fill(0); renderWalls([]); }
      refreshState();
      await pollDanmaku();
    } catch (error) {
      console.warn('[弹幕]', error);
      modeSelect.value = room.danmaku || 'off';
      setState(`设置失败：${(error && error.message) || error}`);
    } finally {
      modeSelect.disabled = !room;
    }
  });
  bar.querySelector('[data-dm-toggle]').addEventListener('click', (event) => {
    const min = bar.classList.toggle('is-min');
    event.currentTarget.textContent = min ? '弹幕' : '收起';
  });

  (async () => {
    const session = await backend.session().catch(() => null);
    if (!session || session.anonymous) {
      setState('请先<a href="/teacher/" target="_blank" rel="noopener">登录教师工作台</a>');
      return;
    }
    await pollRoom();
    await loadRealms();
    await pollDanmaku();
    setInterval(pollDanmaku, POLL_MS);
    setInterval(loadRealms, 120000);
    setInterval(async () => {
      if (await pollRoom()) {
        await loadRealms();
        // 换了课堂或弹幕模式：重新整理循环列表，已有弹幕不当作新弹幕
        pool.length = 0;
        inPool.clear();
        cursor = 0;
        primed = false;
        await pollDanmaku();
      }
    }, ROOM_MS);
  })();
})();
