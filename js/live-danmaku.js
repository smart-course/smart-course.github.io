/* 投屏弹幕：在课堂完整版页面上滚动显示当前课堂的学生弹幕（“姓名：内容”，匿名时只显示内容），并循环播放。
 * 需要教师已在同一浏览器登录教师工作台（读取弹幕需教师账号）。
 * 弹幕模式：关闭 / 直接上屏（未隐藏的都显示）/ 审核后上屏（只显示已通过的）。左下角控件里可以直接切换（与工作台“弹幕”下拉框相同，ck_set_danmaku）。
 * 播放规则：新来的弹幕立即上屏；空档时按顺序循环播放本课堂可显示的弹幕（最近 60 条），被隐藏的立即撤下。
 * 清屏：撤下屏幕上流动的弹幕，并让它们不再循环（本机按课堂记住，刷新页面也不会回来）；之后的新弹幕照常上屏和循环。
 *       正文里弹幕墙上的弹幕不受清屏影响，整堂课一直保留。
 *       清屏只影响投屏显示，工作台里的弹幕记录不受影响。
 * 左下角小控件：循环开关、暂停、清屏、收起。页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 * 鼠标移到一条弹幕上：这条弹幕停住，旁边出现垃圾桶；点一次变成“确认删除？”，3 秒内再点一次即从记录里彻底删除（与工作台的删除相同）。
 * 习经辩论质询的弹幕带“【正方】/【反方】”（学生端按本人的辩前投票自动加上），投屏上显示为彩色标签。
 * 匿名（课堂的 danmaku_anon，工作台或左下角控件切换）：投屏只显示内容、不显示姓名；弹幕记录里照常有发送人。
 * 修为境界（教师结算后存于 ck_realms，本页按学号读取）：显示姓名时姓名前加境界称号，姓名颜色与称号一致（素石灰→青玉绿→金丹金→紫霄紫→化神七彩流光，
 *   还没有境界的按炼气）；弹幕字色：每升一个境界多解锁两种（炼气白灰→筑基蓝绿→结丹金红→元婴粉紫→化神流光），发送人自选、投屏按境界核对；
 * 恭喜突破：每 20 秒读一次全班境界，课上有人境界提升（老师结算后），页面最上方正中显示一行“恭喜某某突破至某境界”，3 秒，新的直接替换。
 * 法宝弹幕（ck_send_gift 写入，gift 列；筑基丹、青竹蜂云剑、风雷翅、掌天瓶）只在新到时播放一次全屏动画（画面在 live-gifts.js，约 3.2 秒），不进入循环和弹幕墙。
 * 教师点赞：鼠标停在弹幕上出现“点赞”和垃圾桶；每堂课最多 ClassLive.LIKE.limit 个赞（ck_like_danmaku 核对），被赞弹幕带 👍，发送人结算时额外加修为。
 * 试用特效（左下角“试用特效”，或工作台“修为境界”里的链接带 ?demo=1 打开）：任选境界和字色发试用弹幕、一键演示五个境界（每个境界用本境界的两种字色各发一条）、
 *   播放四件法宝画面；只在本机播放，不写入弹幕记录、不计修为，也不经过后台。
 * 机制图“弹幕接龙”：学生弹幕以“【案例号箭头】”开头（如【01①→②】），除照常滚动外，还会放进投屏机制图对应节点下的
 *   [data-mech-wall]（新来的弹入并让节点闪一下）。
 * 只显示本页的课堂：当前课堂不是本案例／本章时（如打开还没上的案例讲解版），不上屏、弹幕墙留空，控件上说明当前课堂是哪一个——
 *   弹幕墙按“【问N】”编号放弹幕，否则别的案例同号问题的弹幕会串进来（与课堂控件、投屏统计的处理一致）。试用特效不受影响。
 * 正文里的弹幕墙（弹幕小问题卡片、辩论/圆桌分栏、机制图节点）：显示本堂课这一题的全部弹幕，最新的在最上面，多了在墙内用滚轮上下翻看；
 *   墙上的弹幕整堂课一直保留（重新打开页面也在），“清屏”只撤下屏幕上流动的弹幕；弹幕设为“关闭”时墙上照样显示。
 *   审核模式下只显示已通过的；工作台隐藏、删除的和学生撤回的不显示。
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
  .dm-stage { position: fixed; inset: 52px 0 auto 0; height: calc(58vh + 12px); z-index: 300; overflow: hidden; pointer-events: none; }
  .dm-item { position: absolute; left: 100%; white-space: nowrap; padding: 4px 16px; border-radius: 22px; color: #fff; background: rgba(32, 28, 24, .55);
    font: 800 clamp(22px, 2.4vw, 34px)/1.3 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,.6);
    will-change: transform; animation: dm-fly var(--dm-duration, 11s) linear forwards; }
  .dm-item.is-new { background: rgba(164, 73, 45, .78); }
  .dm-item.is-dahong { background: rgba(26, 16, 12, .78); }
  .dm-item.is-dahong .dm-text { text-shadow: 0 0 8px rgba(255, 70, 50, .55), 0 1px 2px rgba(0, 0, 0, .8); }
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
  .dm-gifts { position: fixed; inset: 0; z-index: 302; overflow: hidden; pointer-events: none; }   /* 法宝画面的样式在 live-gifts.js */
  /* 恭喜突破：最上方正中一行，3 秒 */
  .dm-cheer { position: fixed; z-index: 304; left: 50%; top: 14px; max-width: calc(100vw - 40px); padding: 8px 26px; border: 1.5px solid #e8c25a; border-radius: 30px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    background: linear-gradient(90deg, rgba(60,30,8,.92), rgba(110,58,14,.94), rgba(60,30,8,.92)); color: #fff1c2; box-shadow: 0 0 22px rgba(255,200,90,.6), 0 8px 24px rgba(0,0,0,.35);
    font: 800 clamp(20px, 2.1vw, 30px)/1.4 'Kaiti SC', 'STKaiti', 'KaiTi', serif; letter-spacing: .04em; text-shadow: 0 0 10px rgba(255,200,90,.6); pointer-events: none; transform: translateX(-50%); }
  .dm-cheer[hidden] { display: none; }
  .dm-cheer b { color: #ffe08a; }
  .dm-cheer .dm-title { margin: 0 2px; font-size: .8em; vertical-align: .08em; }
  .dm-cheer.is-on { animation: dm-cheer 3s ease forwards; }
  @keyframes dm-cheer { 0% { opacity: 0; transform: translate(-50%, -20px) scale(.9); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1.04); } 16% { transform: translate(-50%, 0) scale(1); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, 0); } }
  /* ---------- 教师点赞：红色「赞」按钮；被赞的弹幕盖一枚「师赞」朱印 ---------- */
  .dm-like { align-items: center; gap: 6px; padding: 2px 12px 2px 6px; border: 0; border-radius: 16px; color: #fff4e0; background: #b3261e;
    font: 700 16px/1.6 'Kaiti SC', 'STKaiti', 'KaiTi', serif; text-shadow: none; cursor: pointer; }
  .dm-like i { display: inline-grid; place-items: center; width: 20px; height: 20px; border: 1.5px solid #fff4e0; border-radius: 4px; font: 700 13px/1 'Kaiti SC', 'STKaiti', 'KaiTi', serif; font-style: normal; }
  .dm-like.is-on { color: #b3261e; background: #fff4e0; }
  .dm-like.is-on i { border-color: #b3261e; }
  .dm-like[disabled] { opacity: .7; cursor: default; }
  .dm-liked { --seal-base: translateY(-50%) rotate(-14deg); display: none; position: absolute; right: -1.35em; top: 50%; z-index: 1; place-items: center; align-content: center; width: 2.6em; height: 2.6em; border: 3px solid #c8281e; border-radius: 8px;
    color: #c8281e; background: rgba(255,244,224,.94); font: 700 .62em/1.08 'Kaiti SC', 'STKaiti', 'KaiTi', serif; text-align: center; text-shadow: none; transform: var(--seal-base);
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
  /* 弹幕墙：全部显示、最新在上，超出高度在墙内滚动（滚到头不带动整页） */
  .dmq-wall, .dmq-side-wall, [data-mech-wall] { overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .dmq-wall { max-height: 340px; align-content: start; padding-right: 4px; }
  .dmq-side-wall { max-height: 380px; padding-right: 4px; }
  .dmq-side-wall .dm-bubble { flex: none; }
  .mechanism-node [data-mech-wall] { max-height: 180px; padding-right: 4px; }
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
  /* 辩论质询：正方、反方两栏，各自按时间倒序（最新的在最上面），栏头显示条数 */
  .dmq-debate { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
  .dmq-side { min-width: 0; border-radius: 12px; padding: 10px 12px 12px; }
  .dmq-side.is-pro { background: rgba(35, 101, 95, .08); border: 1.5px solid rgba(35, 101, 95, .35); }
  .dmq-side.is-con { background: rgba(164, 73, 45, .07); border: 1.5px solid rgba(164, 73, 45, .35); }
  .dmq-side-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 800; font-size: 15px; }
  .dmq-side-head .dm-side { font-size: 16px; padding: 2px 14px; }
  .dmq-side.is-pro .dmq-side-head b { color: #23655f; }
  .dmq-side.is-con .dmq-side-head b { color: #a4492d; }
  .dmq-side-wall { display: flex; flex-direction: column; gap: 8px; min-height: 64px; }
  .dmq-side-wall .dm-bubble { font-size: 17px; }
  @media (max-width: 760px) { .dmq-debate { grid-template-columns: 1fr; } }
  /* 圆桌表态：四方分栏（按学生递交的角色），各栏最新的在最上面 */
  .dmq-roles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 6px; }
  .dmq-side.is-role { background: rgba(176, 132, 52, .08); border: 1.5px solid rgba(176, 132, 52, .38); }
  .dmq-side.is-role .dmq-side-head b { color: #8a6424; }
  .dmq-side.is-role .dmq-side-head { flex-wrap: wrap; gap: 4px 8px; }
  .dmq-side.is-role .dmq-side-head .dm-side { font-size: 15px; padding: 2px 10px; white-space: nowrap; }
  .dmq-side-head b { white-space: nowrap; }
  @media (max-width: 1000px) { .dmq-roles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 600px) { .dmq-roles { grid-template-columns: 1fr; } }
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
  .dm-side.is-role { background: #8a6424; }
  .dm-item .dm-side.is-pro { background: #2f8a80; }
  .dm-item .dm-side.is-con { background: #c4572f; }
  .dm-item .dm-side.is-role { background: #a77a2c; }
  .dm-bubble.is-pro { border-color: rgba(35, 101, 95, .55); background: #eef6f4; }
  .dm-bubble.is-con { border-color: rgba(164, 73, 45, .5); background: #fbefea; }
  /* 试用特效面板：宽度随内容（境界五个一行、法宝四件一行），不超过屏幕；投屏字号档位会把这里的字号放大（live-readable.js），
     所以标签宽、按钮内边距都按字号（em）算，放大后不会挤成竖排 */
  .dm-demo { position: fixed; z-index: 302; left: 108px; bottom: 64px; width: max-content; max-width: calc(100vw - 130px); max-height: calc(100vh - 84px); overflow-y: auto;
    box-sizing: border-box; padding: 14px 18px 16px; border-radius: 14px; background: rgba(24, 20, 30, .95); color: #fff4e0; box-shadow: 0 16px 40px rgba(0,0,0,.45);
    font: 700 14px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .dm-demo[hidden] { display: none; }
  .dm-demo h4 { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 0 0 2px; font-size: 16px; color: #f3d58c; }
  .dm-demo h4 button { border: 0; background: none; color: #d9cbb4; font-size: 20px; cursor: pointer; }
  .dm-demo p { margin: 0 0 4px; color: #b9afa0; font-weight: 600; font-size: 12.5px; }
  .dm-demo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 0; }
  .dm-demo-row > b { flex: 0 0 2.8em; color: #d9cbb4; font-size: 13px; white-space: nowrap; }
  .dm-demo-row[data-demo-realms], .dm-demo-row[data-demo-gifts] { flex-wrap: nowrap; }
  .dm-demo-row .dm-title { margin: 0; font-size: 16px; white-space: nowrap; cursor: pointer; opacity: .55; }
  .dm-demo-row .dm-title[aria-pressed="true"] { opacity: 1; outline: 2px solid #fff4e0; outline-offset: 2px; }
  .dm-demo-colors button { width: 22px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; cursor: pointer; }
  .dm-demo-colors button[aria-pressed="true"] { outline: 2px solid #fff4e0; outline-offset: 2px; }
  .dm-demo-colors em { color: #b9afa0; font-style: normal; font-weight: 600; font-size: 12px; }
  .dm-demo input[type=text] { flex: 1 1 auto; min-width: 0; padding: 6px 9px; border: 1px solid rgba(255,255,255,.35); border-radius: 7px; background: rgba(255,255,255,.1); color: #fff; font: inherit; }
  .dm-demo .dm-demo-btn { padding: .38em .8em; border: 1px solid rgba(255,255,255,.4); border-radius: 8px; color: #fff; background: rgba(255,255,255,.08); font: inherit; white-space: nowrap; cursor: pointer; }
  .dm-demo .dm-demo-btn small { color: #b9afa0; font-size: 12px; font-weight: 600; }
  .dm-demo .dm-demo-btn.is-main { border-color: #e0b64a; background: #a4492d; }
  .dm-demo .dm-demo-btn:hover { background: rgba(255,255,255,.18); }
  .dm-demo .dm-demo-btn.is-main:hover { background: #b9573a; }
  .dm-demo label.dm-demo-check { display: inline-flex; align-items: center; gap: 5px; color: #d9cbb4; font-weight: 600; white-space: nowrap; }
  /* 内容框：与学生面板发弹幕的输入框同一个样子（live-student.js 的 .clp-dm-field），随所点的境界和字色变——
     炼气、筑基白底；结丹一道金光绕框，元婴紫霄紫、冰蓝两道电光对绕并呼吸发光，化神七彩光环旋转、外晕变色；
     选了字色就用深底预览投屏上的字色，流光色用渐变字 */
  .dm-demo-field { display: flex; flex: 1 1 auto; min-width: 0; border-radius: 12px; --dm-fill: #fff; --dm-input-border: #d6cdbd; --dm-ring: rgba(107,98,85,.18); }
  .dm-demo-field.is-r1 { --dm-input-border: #9fd2c1; --dm-ring: rgba(42,125,105,.18); }
  .dm-demo-field.is-r2 { --dm-input-border: #e4c88a; --dm-ring: rgba(216,164,58,.2); }
  .dm-demo-field.is-r3 { --dm-input-border: #8b5fe0; --dm-ring: rgba(170,120,255,.2); }
  .dm-demo-field.is-r4 { --dm-input-border: #c9a24a; --dm-ring: rgba(255,214,110,.2); }
  .dm-demo .dm-demo-field input[type=text] { flex: 1 1 auto; min-width: 0; height: 2.5em; padding: 0 .75em; border: 1.5px solid var(--dm-input-border); border-radius: 12px;
    background: #fff; color: #201c18; font: 500 16px/1.2 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .dm-demo .dm-demo-field input[type=text]:focus { outline: none; box-shadow: 0 0 0 3px var(--dm-ring); }
  .dm-demo-field.has-color { --dm-fill: #1d1630; }
  .dm-demo-field.has-flow { --dm-fill: #140d24; }
  .dm-demo .dm-demo-field.has-color input[type=text] { border-color: #8b5fe0; background: #1d1630; color: var(--dm-color, #e3cfff); font-weight: 700; caret-color: #fff; }
  .dm-demo .dm-demo-field.is-r4.has-color input[type=text] { border-color: #c9a24a; }
  .dm-demo-field.has-flow:not(.is-r2):not(.is-r3):not(.is-r4) { background: #140d24; }
  .dm-demo .dm-demo-field.has-flow input[type=text] { background-color: transparent; background-image: var(--dm-flow); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
    color: transparent; -webkit-text-fill-color: transparent; caret-color: #ffe08a; animation: dm-demo-textflow 4s linear infinite; }
  .dm-demo-field.is-r2, .dm-demo-field.is-r3, .dm-demo-field.is-r4 { position: relative; isolation: isolate; padding: 2px; overflow: hidden; border-radius: 13px; }
  .dm-demo-field.is-r2::before, .dm-demo-field.is-r3::before, .dm-demo-field.is-r4::before { content: ''; position: absolute; z-index: -2; left: 50%; top: 50%;
    width: 320%; aspect-ratio: 1; transform: translate(-50%, -50%); animation: dm-demo-orbit 3.6s linear infinite; pointer-events: none; }
  .dm-demo-field.is-r2::after, .dm-demo-field.is-r3::after, .dm-demo-field.is-r4::after { content: ''; position: absolute; z-index: -1; inset: 2px; border-radius: 11px;
    background: var(--dm-fill); pointer-events: none; }
  .dm-demo .dm-demo-field.is-r2 input[type=text], .dm-demo .dm-demo-field.is-r3 input[type=text], .dm-demo .dm-demo-field.is-r4 input[type=text] {
    height: 2.25em; border: 0; border-radius: 11px; background-color: transparent; }
  .dm-demo .dm-demo-field.is-r2 input[type=text]:focus, .dm-demo .dm-demo-field.is-r3 input[type=text]:focus, .dm-demo .dm-demo-field.is-r4 input[type=text]:focus { box-shadow: none; }
  .dm-demo-field.is-r2 { box-shadow: 0 0 8px rgba(242,198,79,.45); }
  .dm-demo-field.is-r2::before { background: conic-gradient(from 0deg, transparent 0 58%, rgba(255,214,110,.35) 68%, #f2b52f 80%, #ffffff 88%, #ffd36b 92%, transparent 100%), #e6c98a; }
  .dm-demo-field.is-r3 { animation: dm-demo-breathe 2.2s ease-in-out infinite; }
  .dm-demo-field.is-r3::before { animation-duration: 2.4s;
    background: conic-gradient(from 0deg, transparent 0 22%, #8b5fe0 32%, #f2e6ff 40%, transparent 48% 72%, #6fd0ff 82%, #ffffff 90%, transparent 98%), #3a1673; }
  .dm-demo-field.is-r4 { animation: dm-demo-halo 6s linear infinite; }
  .dm-demo-field.is-r4::before { animation-duration: 4s;
    background: conic-gradient(from 0deg, rgba(255,255,255,.95) 0 2%, transparent 7% 100%), conic-gradient(from 0deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #8affc1, #ffd36b); }
  .dm-demo-field.is-r2:focus-within::before, .dm-demo-field.is-r3:focus-within::before, .dm-demo-field.is-r4:focus-within::before { animation-duration: 1.6s; }
  @keyframes dm-demo-orbit { to { transform: translate(-50%, -50%) rotate(1turn); } }
  @keyframes dm-demo-breathe { 0%, 100% { box-shadow: 0 0 6px rgba(150,100,255,.35); } 50% { box-shadow: 0 0 14px rgba(170,120,255,.8), 0 0 4px rgba(111,208,255,.6); } }
  @keyframes dm-demo-halo { 0% { box-shadow: 0 0 12px rgba(255,211,107,.6); } 25% { box-shadow: 0 0 14px rgba(255,143,196,.6); } 50% { box-shadow: 0 0 14px rgba(185,140,255,.65); }
    75% { box-shadow: 0 0 14px rgba(127,216,255,.6); } 100% { box-shadow: 0 0 12px rgba(255,211,107,.6); } }
  @keyframes dm-demo-textflow { from { background-position: 0% 50%; } to { background-position: 300% 50%; } }
  @media (prefers-reduced-motion: reduce) { .dm-demo-field, .dm-demo-field::before, .dm-demo-field input { animation: none !important; } }
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
    + '<button type="button" data-dm-pause>暂停</button><button type="button" data-dm-clear title="撤下屏幕上流动的弹幕，且不再循环播放；正文里弹幕墙上的弹幕保留，之后的新弹幕照常显示">清屏</button>'
    + '<button type="button" data-dm-demo aria-expanded="false" title="在投屏上试放各境界的弹幕特效和法宝画面（只在本机播放，不写入记录）">试用特效</button><button type="button" data-dm-toggle>收起</button>';
  ['click', 'keydown'].forEach((type) => bar.addEventListener(type, (event) => event.stopPropagation()));
  const giftLayer = document.createElement('div');
  giftLayer.className = 'dm-gifts';
  document.body.append(stage, giftLayer, bar);
  // 法宝底图页面打开 4 秒后先取好（live-gifts.js），课上祭出不用等
  setTimeout(() => { if (window.ClassLiveGifts) window.ClassLiveGifts.preload(); }, 4000);
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
    // 弹幕字色：发送人自选（每升一个境界多两种，境界不够的选择不算）；大红字配深色底，免得和新弹幕的砖红底撞色
    const color = window.ClassLive.colorFor ? window.ClassLive.colorFor(level, doc.color) : null;
    if (level >= 3) item.classList.add(`is-r${level}`);
    if (color && color.id === 'dahong') item.classList.add('is-dahong');
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
    if (doc.demoLiked) item.dataset.demoLiked = '1';   // 试用弹幕的朱印只在本机，后台点赞刷新（markLiked）不清掉
    item.classList.toggle('is-liked', liked.has(id) || Boolean(doc.demoLiked));
    if (doc.demo) item.append(badge); else item.append(badge, hoverTools(doc, item));
    item.style.top = `calc(${lane * (100 / LANES)}% + 12px)`;   // 上面留 12px：最上一行的师赞朱印不被切掉
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
  // 学生版测试页的“王不凡”（学号 WBF0001，不在点名册上；10-22 以前叫“韩天尊”HTZ0001）按化神显示
  const realmFor = (doc) => (doc.demo ? { realm: doc.demoRealm, stage: 1 } : ['WBF0001', 'HTZ0001'].includes(sidKey(doc.sid)) ? { realm: 4, stage: 2 } : realmMap.get(sidKey(doc.sid)) || null);
  const realmName = (level) => (REALMS[level] ? REALMS[level].name : '');
  // 境界每 20 秒读一次；课上老师结算后，有人境界提升就在页面最上方正中恭喜（见 congratulate）
  let realmClass = null;   // 上一次读到的境界属于哪个班（换了班级不算提升）
  async function loadRealms() {
    if (!room) return;
    try {
      const rows = await backend.fetchAll('realms', { course: config.course });
      const classId = Number(room.class_id) || 0;
      const next = new Map(rows.filter((row) => (Number(row.class_id) || 0) === classId)
        .map((row) => [sidKey(row.sid), { realm: Number(row.realm) || 0, stage: Number(row.stage) || 0, name: row.name || '' }]));
      if (realmClass === classId) {
        const ups = [];
        next.forEach((value, sid) => { if (value.realm > ((realmMap.get(sid) || {}).realm || 0)) ups.push(value); });
        if (ups.length) congratulate(ups);
      }
      realmMap = next;
      realmClass = classId;
    } catch (error) {
      realmMap = new Map();   // 还没有修为境界数据表时不显示称号
    }
  }
  // 恭喜突破：页面最上方正中一行固定弹幕，显示 3 秒；又有新的境界提升就直接换成新的（匿名时不显示姓名）
  const cheer = document.createElement('div');
  cheer.className = 'dm-cheer';
  cheer.setAttribute('role', 'status');
  cheer.hidden = true;
  document.body.appendChild(cheer);
  let cheerTimer = 0;
  function congratulate(ups) {
    const top = ups.slice().sort((a, b) => b.realm - a.realm)[0];
    const chip = (level) => `<span class="dm-title is-r${level}">${esc(realmName(level))}</span>`;
    let line;
    if (ups.length === 1) {
      line = `恭喜 ${anonymous() ? '一位同学' : `<b>${esc(top.name)}</b>`} 突破至 ${chip(top.realm)} 境界！`;
    } else if (anonymous()) {
      line = `恭喜 ${ups.length} 位同学突破境界！最高至 ${chip(top.realm)}`;
    } else {
      const names = ups.slice(0, 3).map((up) => `<b>${esc(up.name)}</b>${chip(up.realm)}`).join('、');
      line = `恭喜 ${names}${ups.length > 3 ? ` 等 ${ups.length} 位同学` : ''} 突破境界！`;
    }
    cheer.innerHTML = line;
    cheer.hidden = false;
    cheer.classList.remove('is-on');
    void cheer.offsetWidth;
    cheer.classList.add('is-on');
    clearTimeout(cheerTimer);
    cheerTimer = setTimeout(() => { cheer.hidden = true; cheer.classList.remove('is-on'); }, 3000);
  }
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 法宝画面在 live-gifts.js（与学生页共用）；这里只决定名牌上的境界与名字
  async function launchGift(doc) {
    const gift = GIFT.get(doc.gift);
    if (!gift || paused || !window.ClassLiveGifts) return;
    const realm = realmFor(doc);
    const name = realmName(realm ? realm.realm : gift.level);
    window.ClassLiveGifts.play({ gift, sealName: name, who: `${anonymous() ? `一位${name}修士` : doc.name}　${gift.verb || '祭出'}`, layer: giftLayer });
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
    <div class="dm-demo-row"><b>内容</b><span class="dm-demo-field" data-demo-field><input type="text" maxlength="40" value="发展为了人民，发展依靠人民" data-demo-text aria-label="试用弹幕内容"></span></div>
    <div class="dm-demo-row"><b></b><button type="button" class="dm-demo-btn is-main" data-demo-send>发一条试用弹幕</button>
      <label class="dm-demo-check"><input type="checkbox" data-demo-liked>带「师赞」朱印</label><button type="button" class="dm-demo-btn" data-demo-all>一键演示五个境界</button></div>
    <div class="dm-demo-row" data-demo-gifts><b>法宝</b>${Array.from(GIFT.values()).map((gift) => `<button type="button" class="dm-demo-btn" data-demo-gift="${esc(gift.id)}">${esc(gift.name)}<small>（${esc(realmName(gift.level))}）</small></button>`).join('')}</div>`;
  document.body.appendChild(demo);
  const demoText = demo.querySelector('[data-demo-text]');
  function paintDemo() {
    demo.querySelectorAll('[data-demo-level]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.demoLevel) === demoState.level)));
    // 内容框：与学生面板的输入框一样，随境界换边框流光，选了字色就预览字色
    const field = demo.querySelector('[data-demo-field]');
    const chosen = window.ClassLive.colorFor(demoState.level, demoState.color[demoState.level]);
    field.className = `dm-demo-field is-r${demoState.level}${chosen ? ' has-color' : ''}${chosen && chosen.flow ? ' has-flow' : ''}`;
    field.style.setProperty('--dm-color', chosen && chosen.value ? chosen.value : '#e3cfff');
    field.style.setProperty('--dm-flow', chosen && chosen.flow ? chosen.flow : 'none');
    const box = demo.querySelector('[data-demo-colors]');
    box.querySelectorAll('button, em').forEach((el) => el.remove());
    const open = DEMO_COLORS.filter((color) => demoState.level >= color.level);
    if (!open.length) {
      const note = document.createElement('em');
      note.textContent = '这个境界还没有可选的字色';
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
      // 每个境界用本境界解锁的两种字色各发一条（炼气霜白、月银 … 化神流金、七彩），文字说明这一境的特色
      const looks = ['素石称号', '青玉称号', '金丹称号', '紫色辉边', '七彩流光边框'];
      const lines = [];
      REALMS.forEach((realm) => DEMO_COLORS.filter((color) => color.level === realm.level).forEach((color) => {
        lines.push([realm.level, `${color.name}字 · ${realm.name}${realm.level ? '解锁' : '起步可选'}（${looks[realm.level] || realm.name}）`, color.id]);
      }));
      lines.forEach(([level, text, colorId], i) => setTimeout(() => sendDemo(level, text, colorId, false), i * 600));
      return;
    }
    if (giftButton) {
      const gift = GIFT.get(giftButton.dataset.demoGift);
      if (!gift) return;
      launchGift({ gift: gift.id, demo: true, demoRealm: gift.level, name: '示例同学', sid: 'DEMO' });
      // 法宝画面播放时先让开，免得挡住名牌；播完再出现
      demo.style.visibility = 'hidden';
      clearTimeout(demo.showTimer);
      demo.showTimer = setTimeout(() => { demo.style.visibility = ''; }, (window.ClassLiveGifts ? window.ClassLiveGifts.GIFT_MS : 3200) + 200);
    }
  });
  demoText.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); demo.querySelector('[data-demo-send]').click(); } });
  const demoToggle = bar.querySelector('[data-dm-demo]');
  function toggleDemo(open) {
    demo.hidden = !open;
    demoToggle.setAttribute('aria-expanded', String(open));
    if (open) { paintDemo(); placeDemo(); if (paused) bar.querySelector('[data-dm-pause]').click(); }
  }
  // 位置跟着字号走（投屏字号放大后页码、控件条都变大，写死的 108px、64px 会叠在一起）：
  // 弹幕条放在左下角页码（.page-counter／.page-progress）的右边；试用面板放在弹幕条上方，左边与弹幕条对齐，
  // 和右下角的课堂控件条（.rm-bar）左右有重叠时，再抬到控件条上方
  function placeBar() {
    let left = 108;
    document.querySelectorAll('.page-counter, .page-progress').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && getComputedStyle(el).position === 'fixed' && r.left < innerWidth / 2 && r.bottom > innerHeight - 140) left = Math.max(left, Math.ceil(r.right) + 12);
    });
    bar.style.left = `${left}px`;
    bar.style.maxWidth = `calc(100vw - ${left + 22}px)`;
    demo.style.left = `${left}px`;
    demo.style.maxWidth = `calc(100vw - ${left + 22}px)`;
  }
  function placeDemo() {
    if (demo.hidden) return;
    let bottom = Math.max(64, Math.ceil(innerHeight - bar.getBoundingClientRect().top) + 10);
    demo.style.bottom = `${bottom}px`;
    const room = document.querySelector('.rm-bar');
    if (room && room.getBoundingClientRect().width) {
      const a = demo.getBoundingClientRect(), b = room.getBoundingClientRect();
      if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) bottom = Math.max(bottom, Math.ceil(innerHeight - b.top) + 10);
    }
    demo.style.bottom = `${bottom}px`;
    demo.style.maxHeight = `calc(100vh - ${bottom + 12}px)`;
  }
  const place = () => { placeBar(); placeDemo(); };
  place();
  window.addEventListener('resize', place);
  if (window.ClassReadable && window.ClassReadable.onChange) window.ClassReadable.onChange(() => setTimeout(place, 80));
  setTimeout(place, 1200);   // 页码、课堂控件条是别的脚本后建的
  demoToggle.addEventListener('click', () => toggleDemo(demo.hidden));
  // 工作台“修为境界”里的“试用境界特效与法宝”链接带 ?demo=1：打开投屏页时直接展开试用面板
  if (new URLSearchParams(location.search).get('demo') === '1') toggleDemo(true);

  // 学生撤回的（withdrawn_at）不再上屏；记录仍在工作台
  const visible = (doc) => !doc.withdrawn_at && (room.danmaku === 'review' ? doc.status === 'shown' : doc.status !== 'hidden');

  // ---------- 机制图“弹幕接龙” ----------
  const TAG = /^【(\d{2})([①②③④])→([①②③④])】\s*/;
  const QTAG = /^【问(\d{1,2})】\s*/;
  const SIDE = /^【(正方|反方)】\s*/;
  const ROLE = /^【([^】]{1,12})】\s*/;
  // 圆桌表态（slot“NN-roundtable”）：问题编号 → 四方角色名（弹幕带【角色名】，进对应角色那一栏）
  const ROLES_OF = new Map();
  (Array.isArray(config.danmaku) ? config.danmaku : []).forEach((item, index) => {
    if (/-roundtable$/.test(item.slot || '') && Array.isArray(item.roles)) ROLES_OF.set(String(index + 1), item.roles);
  });
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
      // 习经辩论质询：弹幕带【正方】/【反方】，分两栏即时显示（各栏最新的在最上面）
      const debate = /-debate$/.test(item.slot || '');
      const sideCol = (side, cls) => `<div class="dmq-side ${cls}"><div class="dmq-side-head"><span class="dm-side ${cls}">${side}</span><b data-side-count>0 条</b></div>
        <div class="dmq-side-wall" data-mech-wall data-case="q" data-link="${index + 1}" data-side="${side}" data-max="8"><em>还没有${side}的质询</em></div></div>`;
      const roles = ROLES_OF.get(String(index + 1));
      const roleCol = (role) => `<div class="dmq-side is-role"><div class="dmq-side-head"><span class="dm-side is-role">${esc(role)}</span><b data-side-count>0 条</b></div>
        <div class="dmq-side-wall" data-mech-wall data-case="q" data-link="${index + 1}" data-side="${esc(role)}" data-max="6"><em>还没有表态</em></div></div>`;
      if (debate || roles) card.classList.add('is-debate');
      card.innerHTML = `<div class="dmq-head"><span class="dmq-tag">弹幕小问题 · 问${index + 1}</span><span class="dmq-label"></span><span class="dmq-count"></span></div>
        <h4></h4><p class="dmq-hint"></p>${debate ? `<div class="dmq-debate">${sideCol('正方', 'is-pro')}${sideCol('反方', 'is-con')}</div>`
          : roles ? `<div class="dmq-roles">${roles.map(roleCol).join('')}</div>`
          : `<div class="dmq-wall" data-mech-wall data-case="q" data-link="${index + 1}" data-max="12"></div>`}`;  // 投屏学生也看得到：不放给老师看的提示语，墙在收到弹幕前留空
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
    const roles = ROLES_OF.get(question[1]);
    const roleTag = roles ? ROLE.exec(rest) : null;
    const side = SIDE.exec(rest) || (roleTag && roles.includes(roleTag[1]) ? roleTag : null);
    return { key: `q|${question[1]}`, link: `问${question[1]}`, text: side ? rest.slice(side[0].length) : rest, side: side ? side[1] : '' };
  }
  function sideBadge(side) {
    const badge = document.createElement('span');
    badge.className = `dm-side ${side === '正方' ? 'is-pro' : side === '反方' ? 'is-con' : 'is-role'}`;
    badge.textContent = side;
    return badge;
  }

  // ---------- 鼠标悬停删除 ----------
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const deleted = new Set();    // 本页已删除的弹幕 id（读取结果里若还带着，也不再显示）
  let wallRows = [];            // 当前弹幕墙使用的弹幕（删除后据此重排）
  // ---------- 教师点赞（每堂课有上限，额外加修为） ----------
  const LIKE = window.ClassLive.LIKE || { limit: 20 };
  const liked = new Set();   // 已点赞的弹幕 id（以后台为准，每次读取时更新）
  let likesUsed = null;
  const likesEl = bar.querySelector('[data-dm-likes]');
  const showLikes = () => { likesEl.textContent = likesUsed == null ? '' : `赞 ${likesUsed}/${LIKE.limit}`; };
  function markLiked() {
    document.querySelectorAll('[data-dm-id]').forEach((el) => {
      const on = liked.has(el.dataset.dmId) || el.dataset.demoLiked === '1';
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
  document.querySelectorAll('[data-mech-wall]').forEach((el) => walls.set(`${el.dataset.case}|${el.dataset.link}${el.dataset.side ? `|${el.dataset.side}` : ''}`, el));
  const wallShown = new Map();   // 箭头 → 正在显示的弹幕 id
  let wallsPrimed = false;
  function renderWalls(docs) {
    if (!walls.size) return;
    const groups = new Map();
    docs.forEach((doc) => {
      const tag = tagOf(doc);
      if (!tag) return;
      const key = tag.side && walls.has(`${tag.key}|${tag.side}`) ? `${tag.key}|${tag.side}` : tag.key;   // 辩论质询：进正方或反方那一栏
      if (!walls.has(key)) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ doc, tag });
    });
    walls.forEach((wall, key) => {
      const list = groups.get(key) || [];
      const sideWall = Boolean(wall.dataset.side);
      const latest = list.slice().reverse();   // 全部显示，最新的在最上面（多了在墙内滚动翻看）
      const counter = sideWall ? wall.parentElement.querySelector('[data-side-count]') : wall.closest('.dmq-card') && wall.closest('.dmq-card').querySelector('.dmq-count');
      if (counter) counter.textContent = sideWall ? `${list.length} 条` : list.length ? `${list.length} 条` : '';
      const before = wallShown.get(key) || [];
      const ids = latest.map(({ doc }) => String(doc.id));
      const placeholder = wall.querySelector('em');
      if (placeholder) placeholder.hidden = list.length > 0;
      let count = wall.querySelector('.dm-wall-count');
      if (ids.join() !== before.join()) {
        // 老师正在往下翻看时，新弹幕加在最上面不把正在看的内容顶走
        const keep = wall.scrollTop > 4 ? wall.scrollHeight - wall.scrollTop : null;
        wall.querySelectorAll('.dm-bubble').forEach((el) => el.remove());
        let fresh = false;
        latest.forEach(({ doc, tag }) => {
          const bubble = document.createElement('div');
          const isNew = wallsPrimed && !before.includes(String(doc.id));
          fresh = fresh || isNew;
          bubble.className = (isNew ? 'dm-bubble is-pop' : 'dm-bubble') + (tag.side ? (tag.side === '正方' ? ' is-pro' : tag.side === '反方' ? ' is-con' : ' is-role') : '');
          const who = document.createElement('b');
          const realm = realmFor(doc);
          who.className = `is-r${realm ? realm.realm : 0}`;
          who.textContent = `${doc.name}：`;
          if (tag.side && !sideWall) bubble.append(sideBadge(tag.side));   // 分栏里不重复标正反方
          if (!anonymous()) bubble.append(who);
          const badge = document.createElement('span');
          badge.className = 'dm-liked';
          badge.innerHTML = '师<br>赞';
          bubble.dataset.dmId = String(doc.id);
          bubble.classList.toggle('is-liked', liked.has(String(doc.id)));
          bubble.append(document.createTextNode(tag.text), badge, hoverTools(doc, bubble));
          wall.appendChild(bubble);
        });
        if (keep != null) wall.scrollTop = wall.scrollHeight - keep;
        wallShown.set(key, ids);
        const node = wall.closest('.mechanism-node') || wall.closest('.dmq-card');
        if (fresh && node) {
          node.classList.remove('dm-hit');
          void node.offsetWidth;
          node.classList.add('dm-hit');
          setTimeout(() => node.classList.remove('dm-hit'), 2400);
        }
      }
      if (!counter && !sideWall && list.length > WALL_MAX) {
        if (!count) { count = document.createElement('span'); count.className = 'dm-wall-count'; wall.prepend(count); }
        count.textContent = `共 ${list.length} 条`;
      } else if (count) count.remove();
    });
    // 辩论质询、圆桌表态卡片头：各栏合计
    document.querySelectorAll('.dmq-card.is-debate').forEach((card) => {
      const total = Array.from(card.querySelectorAll('[data-side-count]')).reduce((sum, el) => sum + (parseInt(el.textContent, 10) || 0), 0);
      card.querySelector('.dmq-count').textContent = total ? `共 ${total} 条` : '';
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

  const unit = config.unit || (location.pathname.match(/([a-z]{2,6}\d{2})\.html$/) || [])[1];
  const HERE = config.kind === 'concept-html' ? '本案例' : '本章';
  // 不再显示原来课堂的弹幕（当前课堂换到了别的案例／章节）：撤下流动的弹幕，清空循环和弹幕墙
  function dropRoom() {
    pool.length = 0;
    inPool.clear();
    cursor = 0;
    primed = false;
    stage.innerHTML = '';
    flying.clear();
    laneFree.fill(0);
    wallRows = [];
    renderWalls([]);
  }
  async function pollRoom() {
    try {
      const rooms = await backend.fetchAll('classrooms', { course: config.course });
      const picked = window.ClassLive.pickRoom(rooms, config.course, unit);
      const next = picked && picked.chapter === unit ? picked : null;
      const changed = !room || !next || `${room.id}|${room.danmaku}` !== `${next.id}|${next.danmaku}`;
      const anonChanged = Boolean(room && next && Boolean(room.danmaku_anon) !== Boolean(next.danmaku_anon));
      const had = room;
      room = next;
      if (anonChanged) applyAnonymous();
      if (!room) {
        if (had) dropRoom();
        modeSelect.disabled = true;
        setState(picked ? `当前课堂“${esc(picked.name)}”不是${HERE}，这里不显示弹幕` : '没有当前课堂');
        return false;
      }
      refreshState();
      return changed;
    } catch (error) {
      room = null;
      modeSelect.disabled = true;
      setState('请先<a href="/teacher/" target="_blank" rel="noopener">登录教师工作台</a>');
      return false;
    }
  }

  // 本堂课的全部弹幕：打开页面、换课堂时和每 30 秒全量读取一次；其余每次只读最新 120 条合并进来（状态、点赞、撤回随之更新）
  const allDocs = new Map();
  let allRoom = '';
  let fullAt = 0;
  const FULL_MS = 30000;
  const RECENT = 120;
  const order = (a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0);
  async function readDanmaku() {
    const where = { classroom: Number(room.id) };
    if (allRoom !== String(room.id) || Date.now() - fullAt > FULL_MS) {
      const rows = await backend.fetchAll('danmaku', where);
      allDocs.clear();
      rows.forEach((doc) => allDocs.set(String(doc.id), doc));
      allRoom = String(room.id);
      fullAt = Date.now();
    } else {
      const recent = await backend.fetchAll('danmaku', where, { limit: RECENT });
      const ids = new Set(recent.map((doc) => String(doc.id)));
      const oldest = Math.min(...recent.map((doc) => Number(doc.ts) || 0));
      // 最新这一段里没有了的＝工作台删掉的
      if (recent.length) Array.from(allDocs.values()).filter((doc) => (Number(doc.ts) || 0) >= oldest && !ids.has(String(doc.id))).forEach((doc) => allDocs.delete(String(doc.id)));
      recent.forEach((doc) => allDocs.set(String(doc.id), doc));
    }
    return Array.from(allDocs.values()).sort(order);
  }
  async function pollDanmaku() {
    if (!room) return;
    if (clearedRoom !== String(room.id)) { clearedRoom = String(room.id); cleared = loadCleared(clearedRoom); }
    try {
      const rows = (await readDanmaku()).filter((doc) => !deleted.has(String(doc.id)));
      // 老师点赞：以后台为准（换了设备或在工作台改过也一致）；本堂课已用的赞＝今天点的
      liked.clear();
      rows.forEach((doc) => { if (doc.liked_at) liked.add(String(doc.id)); });
      likesUsed = rows.filter((doc) => doc.liked_at && isoDayOf(doc.liked_at) === window.ClassLive.today()).length;
      showLikes();
      markLiked();
      // 工作台删除的弹幕：不再出现在读取结果里，从循环和屏幕上撤下
      const present = new Set(rows.map((doc) => String(doc.id)));
      Array.from(inPool).filter((id) => !present.has(id)).forEach(dropFromPool);
      // 正文里的弹幕墙：整堂课的全部弹幕（清屏不影响，弹幕关闭时也照样显示）
      wallRows = rows.filter((doc) => visible(doc) && !doc.gift);
      renderWalls(wallRows);
      if (room.danmaku === 'off') { refreshState(); return; }
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
    if (room) setState('已清屏：屏幕上流动的弹幕已撤下、不再循环；正文里弹幕墙上的弹幕保留');
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
    setInterval(loadRealms, 20000);
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
