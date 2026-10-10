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
 * 修为境界（教师结算后存于 ck_realms，本页按学号读取）：显示姓名时姓名前加境界称号；弹幕字色随境界（白→绿→蓝→紫→化神紫金）；
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
  .dm-name { margin-right: 2px; color: #ffd98a; }
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
  .dm-g-gold { background: linear-gradient(100deg, #c9a2ff, #ffe08a 40%, #ffb347 60%, #c9a2ff); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: dm-flowtext 3.6s linear infinite; }
  /* 筑基丹：金丹浮起，丹香化作光环 */
  @keyframes dm-g-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
  @keyframes dm-g-rise { 0% { transform: translateY(420px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
  @keyframes dm-g-ring { 0% { transform: scale(.35); opacity: .95; } 100% { transform: scale(3.2); opacity: 0; } }
  @keyframes dm-g-wisp { 0% { transform: translateY(30px); opacity: 0; } 30% { opacity: .85; } 100% { transform: translateY(-160px); opacity: 0; } }
  @keyframes dm-g-twinkle { 0%, 100% { opacity: .2; transform: scale(.6); } 50% { opacity: 1; transform: scale(1); } }
  .dm-g-rise { animation: dm-g-rise 1.4s cubic-bezier(.2, .8, .3, 1) both; }
  .dm-g-float { animation: dm-g-float 3s ease-in-out 1.4s infinite; }
  .dm-g-ring { animation: dm-g-ring 2.6s ease-out infinite; }
  .dm-g-wisp { animation: dm-g-wisp 3.2s ease-out infinite; }
  .dm-g-spark { animation: dm-g-twinkle 1.8s ease-in-out infinite; }
  /* 青竹蜂云剑：九口竹青飞剑结阵，自左向右破空 */
  @keyframes dm-g-charge { 0% { transform: translateX(-1250px); } 100% { transform: translateX(1350px); } }
  @keyframes dm-g-hum { 0%, 100% { filter: drop-shadow(0 0 8px rgba(90,240,150,.9)); } 50% { filter: drop-shadow(0 0 18px rgba(140,255,190,1)); } }
  @keyframes dm-g-flick { 0%, 100% { opacity: 0; } 40%, 60% { opacity: 1; } }
  .dm-g-charge { animation: dm-g-charge 4.6s cubic-bezier(.45, .05, .35, 1) .3s both; }
  .dm-g-blade { animation: dm-g-hum 1.4s ease-in-out infinite; }
  .dm-g-flick { animation: dm-g-flick 1.1s steps(2) infinite; }
  /* 风雷翅：身后展开双翅，电光窜动，雷遁而去 */
  @keyframes dm-g-flapR { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(9deg); } }
  @keyframes dm-g-flapL { 0%, 100% { transform: rotate(4deg); } 50% { transform: rotate(-9deg); } }
  @keyframes dm-g-flash { 0%, 100% { opacity: .3; } 6% { opacity: 1; } 12% { opacity: .35; } 18% { opacity: .85; } 30% { opacity: .3; } }
  @keyframes dm-g-crackle { 0%, 100% { opacity: .25; } 20% { opacity: 1; } 40% { opacity: .5; } 60% { opacity: 1; } 80% { opacity: .35; } }
  @keyframes dm-g-jump { 0%, 100% { opacity: 0; } 8%, 22% { opacity: 1; } 15% { opacity: .2; } }
  @keyframes dm-g-dash { 0% { transform: translateX(-120px); } 70% { transform: translateX(40px); } 100% { transform: translateX(900px); } }
  @keyframes dm-g-wind { 0% { stroke-dashoffset: 220; opacity: 0; } 30% { opacity: .8; } 100% { stroke-dashoffset: 0; opacity: 0; } }
  .dm-g-wingR { transform-origin: 0 62%; animation: dm-g-flapR 1.1s ease-in-out infinite; }
  .dm-g-wingL { transform-origin: 100% 62%; animation: dm-g-flapL 1.1s ease-in-out infinite; }
  .dm-g-flash { animation: dm-g-flash 2.6s ease-out infinite; }
  .dm-g-crackle { animation: dm-g-crackle .5s steps(2) infinite; }
  .dm-g-jump { animation: dm-g-jump 1.3s linear infinite; }
  .dm-g-dash { animation: dm-g-dash 6s cubic-bezier(.5, 0, .7, .2) forwards; }
  .dm-g-windline { stroke-dasharray: 60 160; animation: dm-g-wind 1.8s ease-out infinite; }
  /* 掌天瓶：吸纳月华，光点盘旋入瓶，瓶口凝出一滴绿液 */
  @keyframes dm-g-swirl { 0% { transform: rotate(0deg) scale(1.15); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: rotate(300deg) scale(.35); opacity: 0; } }
  @keyframes dm-g-stream { to { stroke-dashoffset: -120; } }
  @keyframes dm-g-bead { 0%, 35% { transform: translateY(10px) scale(.2); opacity: 0; } 60% { opacity: 1; } 85%, 100% { transform: translateY(-14px) scale(1); opacity: 1; } }
  @keyframes dm-g-glow { 0%, 100% { opacity: .55; } 50% { opacity: .95; } }
  @keyframes dm-g-appear { 0% { transform: scale(.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  .dm-g-swirl { animation: dm-g-swirl 3.4s ease-in infinite; }
  .dm-g-stream { stroke-dasharray: 2 14; animation: dm-g-stream 1.6s linear infinite; }
  .dm-g-appear { animation: dm-g-appear 1.1s cubic-bezier(.2, .9, .3, 1.2) both; }
  .dm-g-bead { animation: dm-g-bead 4.2s ease-out both; }
  .dm-g-glow { animation: dm-g-glow 3.2s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .dm-g-charge, .dm-g-dash { animation-duration: .01s; } }
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
  .dm-bubble b { margin-right: 4px; color: #a4492d; }
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
    const name = document.createElement('span');
    name.className = 'dm-name';
    name.hidden = anonymous();   // 匿名时姓名不显示；随时关闭匿名，正在飞的弹幕也能立刻补上姓名
    // 修为境界：姓名前的称号随姓名一起显示或隐藏；弹幕字色随境界（匿名时也有）
    const realm = realmFor(doc);
    const level = realm ? realm.realm : 0;
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
  // 法宝画面（2026-10-10 按 Claude Design 画布定稿）：全屏暗幕＋1280×720 场景（按屏幕等比缩放）＋底部法宝名牌
  const SWORD = (w, h, fill, edge, ridge) => `<svg class="dm-g-blade" aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 240 28"><rect x="0" y="10" width="40" height="8" rx="2" fill="#1d4a2c"></rect><path d="M40 2h8v24h-8z" fill="#c9a24a"></path><path d="M48 8h166l24 6-24 6H48z" fill="${fill}"></path><path d="M48 8h166l24 6H48z" fill="${edge}"></path>${ridge ? '<path d="M50 14h176" stroke="#2fae6a" stroke-width="1.5"></path>' : ''}</svg>`;
  const BOLT = (x, y, w, h, d, delay) => `<svg class="dm-g-flick" aria-hidden="true" style="position:absolute;left:${x}px;top:${y}px;animation-delay:${delay}s" width="${w}" height="${h}" viewBox="0 0 34 40"><path d="M18 2 8 20h9l-4 18 16-22h-9l6-14z" fill="#ffd36b"${d ? ' stroke="#fff2c8" stroke-width="1.5" stroke-linejoin="round"' : ''}></path></svg>`;
  const WING = (cls, u, flip) => `<svg class="${cls}" aria-hidden="true" style="position:absolute;left:${flip ? -404 : 8}px;top:-168px;filter:drop-shadow(0 0 14px rgba(120,220,255,.95))" width="396" height="264" viewBox="0 0 360 240">
      <defs><linearGradient id="w${u}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#e8fbff" stop-opacity=".95"></stop><stop offset=".5" stop-color="#8fdcff" stop-opacity=".55"></stop><stop offset="1" stop-color="#5ab8ff" stop-opacity=".25"></stop></linearGradient></defs>
      <g${flip ? ' transform="translate(360 0) scale(-1 1)"' : ''}><path d="M0 150 C40 110 90 60 150 40 L350 10 300 52 330 58 270 90 300 100 240 120 262 134 200 150 215 166 150 170 155 188 90 180 60 170 0 165Z" fill="url(#w${u})" stroke="#e8fbff" stroke-width="2.5" stroke-linejoin="round"></path>
      <g class="dm-g-crackle" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"${flip ? ' style="animation-delay:.25s"' : ''}><polyline points="6,152 60,120 92,112 140,84 190,64 236,44 300,24 344,14"></polyline><polyline points="10,156 70,138 110,124 160,114 210,100 262,88 296,64"></polyline><polyline points="12,158 66,150 118,144 168,134 214,128 256,130"></polyline><polyline points="12,160 60,160 100,162 142,158 188,158 206,162"></polyline><polyline points="10,162 46,170 84,172 120,176 150,182"></polyline></g>
      <g fill="none" stroke="#bdf2ff" stroke-width="1.4" opacity=".75"><path d="M150 40 300 52M150 40 270 90M120 70 240 120M90 110 200 150M60 140 150 170"></path></g></g></svg>`;
  const SCENES = {
    zhujidan: () => ({
      veil: 'radial-gradient(ellipse at 50% 44%, rgba(40,24,6,.82) 0%, rgba(22,16,10,.78) 38%, rgba(14,12,10,.55) 70%, rgba(14,12,10,.25) 100%)',
      nameStyle: 'color:#ffd36b;text-shadow:0 0 18px rgba(255,190,40,.7)', tailStyle: 'color:#e6c27a',
      html: `<div style="position:absolute;left:640px;top:300px;width:0;height:0">
        <div class="dm-g-ring" style="position:absolute;left:-90px;top:-90px;width:180px;height:180px;border:3px solid rgba(255,206,92,.85);border-radius:50%"></div>
        <div class="dm-g-ring" style="position:absolute;left:-90px;top:-90px;width:180px;height:180px;border:2px solid rgba(255,226,150,.7);border-radius:50%;animation-delay:.85s"></div>
        <div class="dm-g-ring" style="position:absolute;left:-90px;top:-90px;width:180px;height:180px;border:2px solid rgba(255,190,60,.6);border-radius:50%;animation-delay:1.7s"></div>
        <div style="position:absolute;left:-210px;top:-210px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(255,196,60,.55),rgba(255,170,40,.12) 55%,transparent 70%)"></div>
        <div class="dm-g-wisp" style="position:absolute;left:-60px;top:-40px;width:4px;height:90px;border-radius:4px;background:linear-gradient(rgba(255,236,180,0),rgba(255,226,150,.9),rgba(255,236,180,0))"></div>
        <div class="dm-g-wisp" style="position:absolute;left:48px;top:-30px;width:3px;height:80px;border-radius:4px;background:linear-gradient(rgba(255,236,180,0),rgba(255,226,150,.85),rgba(255,236,180,0));animation-delay:1.1s"></div>
        <div class="dm-g-wisp" style="position:absolute;left:-8px;top:-60px;width:3px;height:70px;border-radius:4px;background:linear-gradient(rgba(255,236,180,0),rgba(255,226,150,.8),rgba(255,236,180,0));animation-delay:2s"></div>
        <div class="dm-g-rise" style="position:absolute;left:-78px;top:-78px"><div class="dm-g-float" style="width:156px;height:156px;border-radius:50%;display:grid;place-items:center;border:3px solid rgba(150,80,0,.8);background:radial-gradient(circle at 34% 28%,#fff4c4,#ffc23a 36%,#d27a00 66%,#5e3100);box-shadow:0 0 0 8px rgba(255,200,70,.28),0 0 70px rgba(255,190,40,1),inset -10px -12px 22px rgba(110,50,0,.55)"><span style="font:700 72px/1 'Kaiti SC','STKaiti','KaiTi',serif;color:#8a1f0c;text-shadow:0 1px 0 rgba(255,240,200,.85)">丹</span></div></div>
        <span class="dm-g-spark" style="position:absolute;left:-170px;top:-120px;width:10px;height:10px;border-radius:50%;background:#ffe7a3;box-shadow:0 0 12px #ffd36b"></span>
        <span class="dm-g-spark" style="position:absolute;left:150px;top:-80px;width:8px;height:8px;border-radius:50%;background:#ffe7a3;box-shadow:0 0 12px #ffd36b;animation-delay:.6s"></span>
        <span class="dm-g-spark" style="position:absolute;left:120px;top:90px;width:7px;height:7px;border-radius:50%;background:#fff2c8;box-shadow:0 0 10px #ffd36b;animation-delay:1.2s"></span>
        <span class="dm-g-spark" style="position:absolute;left:-140px;top:70px;width:9px;height:9px;border-radius:50%;background:#ffe7a3;box-shadow:0 0 12px #ffd36b;animation-delay:.3s"></span>
      </div>`,
    }),
    qingzhu: () => {
      const sword = (x, y, trail, th, w, h, fill, edge, ridge) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center"><div style="width:${trail}px;height:${th}px;margin-right:-${th}px;border-radius:3px;background:linear-gradient(90deg,rgba(120,255,170,0),rgba(150,255,190,.9))"></div>${SWORD(w, h, fill, edge, ridge)}</div>`;
      return {
        veil: 'radial-gradient(ellipse at 50% 44%, rgba(6,30,18,.84) 0%, rgba(10,22,16,.78) 40%, rgba(12,14,12,.55) 72%, rgba(12,14,12,.25) 100%)',
        nameStyle: 'color:#b6f7cf;text-shadow:0 0 18px rgba(90,240,150,.75)', tailStyle: 'color:#9fd9b4',
        html: `<div class="dm-g-charge" style="position:absolute;inset:0">
          ${sword(610, 286, 420, 6, 320, 38, '#bff5d4', '#e9fff2', true)}
          ${sword(470, 214, 320, 4, 230, 28, '#a8efc6', '#dcffea', true)}${sword(470, 370, 320, 4, 230, 28, '#a8efc6', '#dcffea', true)}
          ${sword(330, 150, 260, 4, 200, 24, '#96e6b6', '#d2ffe4', false)}${sword(330, 440, 260, 4, 200, 24, '#96e6b6', '#d2ffe4', false)}
          ${sword(190, 92, 200, 3, 170, 20, '#86dca8', '#c6fadb', false)}${sword(190, 504, 200, 3, 170, 20, '#86dca8', '#c6fadb', false)}
          ${sword(60, 40, 140, 3, 140, 17, '#78d29c', '#78d29c', false)}${sword(60, 572, 140, 3, 140, 17, '#78d29c', '#78d29c', false)}
          ${BOLT(945, 262, 34, 40, true, 0)}${BOLT(720, 180, 26, 30, false, .4)}${BOLT(720, 392, 26, 30, false, .7)}
        </div>`,
      };
    },
    fenglei: (u) => ({
      veil: 'radial-gradient(ellipse at 52% 40%, rgba(8,26,40,.9) 0%, rgba(8,18,30,.84) 42%, rgba(8,12,18,.62) 72%, rgba(8,12,18,.3) 100%)',
      nameStyle: 'color:#dff8ff;text-shadow:0 0 18px rgba(110,210,255,.9)', tailStyle: 'color:#a9dff0',
      html: `<div class="dm-g-flash" style="position:absolute;inset:-200px;background:radial-gradient(circle at 54% 42%, rgba(200,245,255,.5), rgba(110,200,255,.16) 30%, transparent 55%)"></div>
        <div class="dm-g-dash" style="position:absolute;inset:0">
          <svg aria-hidden="true" style="position:absolute;left:0;top:214px" width="640" height="150" viewBox="0 0 640 150"><defs><linearGradient id="t${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fe8ff" stop-opacity="0"></stop><stop offset="1" stop-color="#e6fbff" stop-opacity=".95"></stop></linearGradient></defs>
            <polyline points="0,74 70,62 120,84 190,58 250,80 320,60 380,82 450,64 520,78 600,70 640,72" fill="none" stroke="url(#t${u})" stroke-width="5" stroke-linejoin="round" style="filter:drop-shadow(0 0 10px #7fdcff)"></polyline>
            <polyline points="80,44 150,36 200,52 270,30 340,46 420,34 500,48 580,40 640,46" fill="none" stroke="url(#t${u})" stroke-width="2.5" stroke-linejoin="round" opacity=".8"></polyline>
            <polyline points="60,112 140,104 200,122 280,100 350,116 430,104 520,118 600,108 640,110" fill="none" stroke="url(#t${u})" stroke-width="2.5" stroke-linejoin="round" opacity=".8"></polyline></svg>
          <div style="position:absolute;left:700px;top:300px;width:0;height:0">
            ${WING('dm-g-wingR', `r${u}`, false)}${WING('dm-g-wingL', `l${u}`, true)}
            <svg aria-hidden="true" style="position:absolute;left:-38px;top:-70px;filter:drop-shadow(0 0 6px rgba(140,225,255,.9))" width="76" height="150" viewBox="0 0 76 150"><circle cx="38" cy="14" r="7" fill="#0c1218"></circle><circle cx="38" cy="30" r="13" fill="#0c1218"></circle><path d="M22 44 Q38 38 54 44 L60 74 Q66 110 74 148 L2 148 Q10 110 16 74Z" fill="#0c1218"></path><path d="M38 46 L38 148" stroke="#1d2b36" stroke-width="2"></path><path d="M22 44 Q38 38 54 44" fill="none" stroke="#9fe8ff" stroke-width="1.5"></path></svg>
            <svg class="dm-g-jump" aria-hidden="true" style="position:absolute;left:300px;top:-200px" width="70" height="70" viewBox="0 0 70 70"><polyline points="6,62 22,40 16,34 36,14 30,10 62,4" fill="none" stroke="#f2fdff" stroke-width="3" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px #7fdcff)"></polyline></svg>
            <svg class="dm-g-jump" aria-hidden="true" style="position:absolute;left:-370px;top:-200px;animation-delay:.6s" width="70" height="70" viewBox="0 0 70 70"><polyline points="64,62 48,40 54,34 34,14 40,10 8,4" fill="none" stroke="#f2fdff" stroke-width="3" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px #7fdcff)"></polyline></svg>
            <svg class="dm-g-jump" aria-hidden="true" style="position:absolute;left:230px;top:10px;animation-delay:.3s" width="60" height="50" viewBox="0 0 60 50"><polyline points="4,6 20,24 14,28 34,40 28,44 56,46" fill="none" stroke="#e6fbff" stroke-width="2.5" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px #7fdcff)"></polyline></svg>
            <svg aria-hidden="true" style="position:absolute;left:-470px;top:-230px" width="940" height="360" viewBox="0 0 940 360">
              <path class="dm-g-windline" d="M60 300 C 200 250, 300 330, 470 290" fill="none" stroke="#b8f0ff" stroke-width="2.5" stroke-linecap="round"></path>
              <path class="dm-g-windline" d="M880 300 C 740 250, 640 330, 470 290" fill="none" stroke="#b8f0ff" stroke-width="2.5" stroke-linecap="round" style="animation-delay:.6s"></path>
              <path class="dm-g-windline" d="M120 70 C 260 20, 360 90, 470 60" fill="none" stroke="#d6f7ff" stroke-width="2" stroke-linecap="round" style="animation-delay:1.1s"></path>
              <path class="dm-g-windline" d="M820 70 C 680 20, 580 90, 470 60" fill="none" stroke="#d6f7ff" stroke-width="2" stroke-linecap="round" style="animation-delay:.3s"></path></svg>
          </div>
        </div>`,
    }),
    zhangtian: (u) => {
      const dots = (cls, size, color, pts, delay) => `<svg class="dm-g-swirl" aria-hidden="true" style="position:absolute;left:-${size / 2}px;top:-${size / 2}px;animation-delay:${delay}s" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g fill="${color}">${pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"></circle>`).join('')}</g></svg>`;
      const star = (x, y, r, d) => `<span class="dm-g-spark" style="position:absolute;left:${x}px;top:${y}px;width:${r}px;height:${r}px;border-radius:50%;background:#eef6ff;animation-delay:${d}s"></span>`;
      return {
        veil: 'radial-gradient(ellipse at 50% 40%, rgba(8,22,30,.9) 0%, rgba(8,16,26,.85) 45%, rgba(8,12,18,.66) 75%, rgba(8,12,18,.36) 100%)',
        nameClass: 'dm-g-gold', tailStyle: 'color:#a8e8c2',
        html: `${star(180, 90, 3, 0)}${star(320, 170, 2, .8)}${star(860, 120, 3, 1.4)}${star(1120, 260, 2, .4)}${star(140, 330, 2, 1.9)}
          <svg aria-hidden="true" style="position:absolute;left:1000px;top:52px;filter:drop-shadow(0 0 18px rgba(235,245,255,.95))" width="84" height="84" viewBox="0 0 70 70"><path d="M46 6a30 30 0 1 0 18 46A26 26 0 1 1 46 6z" fill="#f2f8ff"></path></svg>
          <svg aria-hidden="true" style="position:absolute;left:640px;top:80px" width="420" height="230" viewBox="0 0 420 230">
            <path class="dm-g-stream" d="M392 20 C 330 40, 250 30, 190 90 C 140 140, 70 150, 4 214" fill="none" stroke="#f4f9ff" stroke-width="4" stroke-linecap="round" style="filter:drop-shadow(0 0 6px #dceeff)"></path>
            <path class="dm-g-stream" d="M380 44 C 320 70, 260 70, 210 120 C 160 170, 90 180, 20 222" fill="none" stroke="#e6f2ff" stroke-width="3" stroke-linecap="round" style="animation-delay:.5s;opacity:.8"></path></svg>
          <div style="position:absolute;left:640px;top:318px;width:0;height:0">
            <div class="dm-g-glow" style="position:absolute;left:-200px;top:-200px;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(80,220,140,.42),rgba(60,180,120,.12) 50%,transparent 70%)"></div>
            ${dots('', 340, '#f4f9ff', [[170, 18, 3], [262, 52, 2.5], [318, 150, 3], [300, 248, 2], [214, 314, 3], [110, 318, 2.5], [36, 250, 3], [18, 150, 2], [58, 62, 3], [120, 28, 2]], 0)}
            ${dots('', 300, '#e8f4ff', [[150, 14, 2.5], [250, 70, 3], [286, 170, 2], [220, 262, 3], [120, 284, 2], [34, 214, 3], [20, 110, 2.5], [78, 34, 2]], 1.1)}
            ${dots('', 370, '#ffffff', [[185, 12, 2], [300, 60, 3], [356, 180, 2.5], [310, 300, 2], [190, 356, 3], [70, 310, 2], [14, 190, 3], [60, 70, 2.5]], 2.2)}
            <div class="dm-g-appear" style="position:absolute;left:-64px;top:-96px"><svg class="dm-g-float" aria-hidden="true" style="filter:drop-shadow(0 0 20px rgba(80,230,140,.85))" width="128" height="176" viewBox="0 0 128 176">
              <defs><radialGradient id="jb${u}" cx=".38" cy=".38" r=".75"><stop offset="0" stop-color="#5fd394"></stop><stop offset=".55" stop-color="#1f8a54"></stop><stop offset="1" stop-color="#0b3f27"></stop></radialGradient>
              <linearGradient id="jn${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a9a60"></stop><stop offset=".5" stop-color="#57c98a"></stop><stop offset="1" stop-color="#145c37"></stop></linearGradient></defs>
              <ellipse cx="64" cy="12" rx="13" ry="5" fill="#1a6b42" stroke="#8fe6b3" stroke-width="1.5"></ellipse>
              <path d="M55 12h18v22c0 6 4 9 10 13 18 11 31 31 31 58 0 36-24 63-50 63S14 141 14 105c0-27 13-47 31-58 6-4 10-7 10-13z" fill="url(#jb${u})" stroke="#9ff0c2" stroke-width="2"></path>
              <path d="M55 12h18v22H55z" fill="url(#jn${u})"></path>
              <path d="M64 58c-22 8-34 30-30 56 12-6 22-22 30-56z" fill="#3fbf7a" opacity=".75"></path><path d="M64 58c22 8 34 30 30 56-12-6-22-22-30-56z" fill="#2fa868" opacity=".75"></path>
              <path d="M64 92c-16 10-22 28-16 50 10-8 16-24 16-50z" fill="#5ad596" opacity=".65"></path><path d="M64 92c16 10 22 28 16 50-10-8-16-24-16-50z" fill="#39b574" opacity=".65"></path>
              <path d="M64 58v86M64 70 46 98M64 70l18 28M64 104l-10 24M64 104l10 24" fill="none" stroke="#d6ffe6" stroke-width="1.4" opacity=".75"></path>
              <path d="M28 110c-2-20 6-38 20-48" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".35"></path></svg></div>
            <span class="dm-g-bead" style="position:absolute;left:-11px;top:-150px;width:22px;height:30px;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;background:radial-gradient(circle at 35% 30%,#f0fff6,#46e891 50%,#0f7a42);box-shadow:0 0 18px rgba(90,255,150,1),0 0 40px rgba(90,255,150,.6)"></span>
          </div>`,
      };
    },
  };
  function launchGift(doc) {
    const gift = GIFT.get(doc.gift);
    const make = gift && SCENES[gift.id];
    if (!make || paused) return;
    const realm = realmFor(doc);
    const level = realm ? realm.realm : gift.level;
    const scene = make(Math.random().toString(36).slice(2, 8));
    const el = document.createElement('div');
    el.className = `dm-gift dm-gift-${gift.id}`;
    el.style.setProperty('--dm-scale', String(Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
    const name = realmName(level);
    el.innerHTML = `<div class="dm-g-veil" style="background:${scene.veil}"></div>
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
