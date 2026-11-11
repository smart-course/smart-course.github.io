/* 学生端（学生页）：确认是从首页用课堂码进入的本周课堂后，在左下角显示课堂面板。
 * 两类课程共用同一套做法：
 *   · 每道题下方有“递交”按钮：选好或写好后点“递交”（再点一次确认），交给老师；
 *     每题只收第一次，递交后不能修改（数据库同样只收第一次）。老师在工作台和投屏页统计人数与对错。
 *     老师在投屏页“停止递交”某道题后，这道题不能再递交（数据库拒绝写入，不计修为）：本页每 30 秒和回到页面时核对一次，
 *     把递交按钮换成“老师已停止递交”的提示；老师恢复后按钮回来。
 *   · 每道题下方有“我的备注”：只保存在这台设备上，不交给老师，导出时一起带走。
 *   · 面板里可以“导出 HTML”（单个文件，离线可打开）或“导出 PDF”（浏览器“存储为 PDF”），内含题目、作答、递交状态与备注。
 * 课程类型：
 *   · 案例课程（kind = case-html，如《习近平经济思想概论》章节页）：投票、配对、推演、文字作答 → ck_choices / ck_answers；
 *   · 概念学习课程（kind = concept-html，如《政治经济学》练习页）：各题 → RPC ck_submit_answer（并入每人一份作业）；
 *     页面里的姓名、学号、班级按课堂登录信息自动填写并锁定。
 * 两类都可发弹幕：显示在老师投屏的课堂页面上（老师开放后可用；老师开启匿名时投屏不显示姓名，后台照常记录发送人）。
 * 未从课堂码进入（或本周课堂不在这一页）时只能写备注、导出，不能递交。
 * 学生版测试页（教师工作台“打开学生版测试页”，地址带 ?preview=<课堂编号>&staticrypt_pwd=…）：与学生页相同，区别是名字固定“王不凡”、
 *   化神境界（字色、法宝全开，法宝不限次数）；弹幕和法宝经教师专用函数 ck_test_danmaku 发到投屏（只有教师账号能用，学生改地址也冒充不了）；
 *   作答只在本机锁定、不交后台（“本堂作业递交情况”按本机的测试递交统计），匿名建议不提交，王不凡不在点名册上、不计修为；
 *   修炼场、政经“课后自修”、递交后的“展开解答”照常可用：后台对教师账号按“王不凡”（WBF0001）记修炼记录（ck_practice_me，结算不计），
 *   解答直接给（ck_my_explain）；测试页顶部可清空修炼场测试记录。情境猜谜抢答不开放（免得占了真学生的第一名）。
 * 离线版（provider = offline，脚本内嵌在课程目录的离线 HTML 里，网络不可用时直接发给学生）：
 *   不连接后台；学生在面板里填写姓名、学号、班级；“递交”只在本机锁定答案（每题只算第一次）；
 *   做完后导出文件发给老师，老师在离线完整版里“导入学生文件”统计。导出文件内含作答数据（JSON）。
 * 在线版需要页面先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  const OFFLINE = Boolean(config && config.provider === 'offline');
  if (!config || config.provider === 'off' || (!OFFLINE && !window.ClassLive)) return;
  const previewRoom = OFFLINE ? 0 : Number(new URLSearchParams(location.search).get('preview')) || 0;
  const PREVIEW = previewRoom > 0;   // 学生版测试页
  // 地址栏里的解密值用完即清，避免被复制转发（测试页的解密值在查询参数里，刷新、翻页都要用，保留）
  if (!PREVIEW && /staticrypt_pwd=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  let backend = null;
  if (!OFFLINE) {
    try {
      backend = window.ClassLive.create(config);
    } catch (error) {
      console.warn('[课堂后台] 未启用：', error.message);
      return;
    }
  }
  const Live = window.ClassLive || {
    isClosedError: () => false,
    isDuplicateError: () => false,
    today: () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()),
  };

  const STORE = 'classlive-student';
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (error) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* 忽略 */ } };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const OFFLINE_STORE = 'classlive-offline-student';
  const unit = config.unit || Live.unitOf();
  // 课堂身份：本机最近一次登录的（STORE）；2026-10-28 起一个班可以同时开放几个课堂，首页登录时还按章节（案例）各记一份（STORE:课程:章节），
  // 最近一次登录的不是这一页时，用这一页自己的那份，学生在两个开放的课堂之间切换不必每次重新登录
  const lastIdentity = OFFLINE || PREVIEW ? {} : load(STORE, {});
  const unitIdentity = OFFLINE || PREVIEW ? null : load(`${STORE}:${config.course}:${unit}`, null);
  const identity = OFFLINE ? load(OFFLINE_STORE, {})
    : PREVIEW ? { name: '王不凡', sid: 'WBF0001', class_name: '教师测试', group_name: '', classroom: previewRoom, course: config.course, chapter: config.unit || Live.unitOf(), code: '' }
      : (lastIdentity.course === config.course && lastIdentity.chapter === unit) || !(unitIdentity && unitIdentity.classroom) ? lastIdentity : unitIdentity;
  const worksheet = config.kind === 'concept-html';
  // 用历史课堂码进来“只查看”的（live-join.js 记下）：比本机保存的课堂身份新，就按只查看处理（2026-10-23；习经同一章两个案例分开上时，
  // 本周课堂是案例 03、又用上周案例 02 的码回看，就会遇到）
  const viewFlag = OFFLINE || PREVIEW ? null : load(`classlive-view:${config.course}:${unit}`, null);
  const viewing = Boolean(viewFlag && (!identity.joined_at || Number(viewFlag.at) > Number(identity.joined_at)));
  const joined = OFFLINE || (!viewing && Boolean(identity.classroom && identity.name && identity.sid
    && identity.course === config.course && identity.chapter === unit));
  // 旁听（2026-11-05 用户：“点名册名单外的学生，也可以申请加入课堂进行学习，但是所递交的答案和弹幕等不进入统计、课堂上也不会被抽中参与小游戏等，
  // 也不参与修为榜等，也不能提匿名建议等，只能看一下内容和答题。”）：首页登录时后台返回 audit。只能看内容、答题——“递交”只在本机锁定、不交给老师，
  // 不计入统计和修为；不能发弹幕、提匿名建议、投票、参加聊天室和课堂小游戏（抢答、经营沙盘等），没有修为境界和修为榜。后台也不收旁听同学的任何写入
  const AUDIT = !OFFLINE && !PREVIEW && joined && Boolean(identity.audit);
  const LOCAL_ONLY = PREVIEW || AUDIT;   // 递交只在本机锁定（测试页、旁听）
  const AUDIT_NOTE = '你是旁听：可以看内容、做题，“递交”只在这台设备上锁定答案，不交给老师，不计入统计和修为；不能发弹幕、提匿名建议，课堂小游戏也不会抽到。';
  // 一章两个案例分开上（2026-10-23，习经）：本周课堂只上其中一个时，页面只显示这个案例、只收这个案例的题
  // （案例号来自登录时后台返回的课堂；只查看时取查看的课堂；学生版测试页取地址里的 case 参数）
  const activeCase = worksheet ? 0 : Number(PREVIEW ? new URLSearchParams(location.search).get('case')
    : viewing ? viewFlag.case_no : joined ? identity.case_no : 0) || 0;
  if (activeCase && window.ChapterCases) window.ChapterCases.show(activeCase);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const textOf = (el) => (el ? clean(el.textContent) : '');
  const time = (withSeconds) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}) }).format(new Date());
  const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit' }).format(new Date());
  const joinUrl = () => '/' + (identity.code ? `?join=${encodeURIComponent(identity.code)}` : '');
  const closedText = '本课堂已结束提交或已停止，请留意老师发布的新课堂码';
  // 身份核对：本设备没有经首页核对（课堂码＋点名册＋个人口令），或老师重置了口令，就要回首页重新登录
  const reloginText = '请回首页重新登录：本课堂要核对身份（课堂码＋点名册＋个人口令）';
  let loginNeeded = false;
  let onBlocked = () => {};   // 面板建好后换成“向后台核对是否要重新登录”
  const needsRelogin = (problem) => loginNeeded || /重新登录/.test(String((problem && problem.message) || problem || ''));
  const shield = (el, types = ['click', 'keydown', 'keyup', 'input']) => types.forEach((type) => el.addEventListener(type, (event) => event.stopPropagation()));

  const style = document.createElement('style');
  style.dataset.readable = 'panel';   // 面板宽度固定：字号按温和倍数调整（live-readable.js）
  style.textContent = `
  .clp-panel { position: fixed; z-index: 90; left: 16px; bottom: 80px; width: min(360px, calc(100vw - 32px)); padding: 12px 14px; border: 1px solid rgba(35,101,95,.28); border-radius: 10px; background: rgba(255,253,248,.97); color: #201c18; box-shadow: 0 12px 30px rgba(0,0,0,.14); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-who { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .clp-who strong { font-size: 15px; }
  .clp-no { display: inline-block; margin-right: 6px; padding: 1px 8px; border-radius: 999px; color: #fff; background: #a4492d; font-size: 13px; font-weight: 800; vertical-align: 1px; }
  .clp-no[hidden] { display: none; }
  .clp-realm { display: inline-block; margin-left: 6px; padding: 1px 8px; border: 1px solid rgba(0,0,0,.08); border-radius: 999px; font-family: inherit; font-weight: 800; font-size: 12.5px; line-height: 1.5; vertical-align: 1px; cursor: pointer; }
  .clp-realm[hidden] { display: none; }
  .clp-realm.is-r0 { color: #4a443c; background: #d9d4ca; border-color: #b9b1a3; }
  .clp-realm.is-r1 { color: #f2fffa; background: linear-gradient(180deg, #9fe3cc, #3fa88d 52%, #2a7d69); border-color: #1f6455; text-shadow: 0 1px 1px rgba(10,60,48,.6); box-shadow: inset 0 1px 0 rgba(255,255,255,.6); }
  .clp-realm.is-r2 { color: #3e2400; background: linear-gradient(180deg, #fff3c4, #f2c64f 32%, #b8801a 68%, #e8b844); border-color: #7a5208; box-shadow: inset 0 1px 0 rgba(255,255,255,.85), 0 0 6px rgba(240,194,75,.5); }
  .clp-realm.is-r3 { color: #f6eaff; background: linear-gradient(160deg, #4b1d8f, #7a3fe0 55%, #3a1673); border-color: #d8b8ff; text-shadow: 0 0 6px rgba(220,190,255,.8); animation: clp-ying 2.4s ease-in-out infinite; }
  .clp-realm.is-r4 { color: #ffe08a; border: 1px solid transparent; background: linear-gradient(#140d24, #140d24) padding-box, linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b) border-box;
    background-size: 100% 100%, 300% 100%; box-shadow: 0 0 10px rgba(255,214,110,.7); animation: clp-flow 3s linear infinite; }
  .clp-realm.is-r3::before, .clp-realm.is-r4::before { content: '✦'; margin-right: 3px; font-size: .8em; }
  @keyframes clp-ying { 0%, 100% { box-shadow: 0 0 8px rgba(170,120,255,.7); } 50% { box-shadow: 0 0 16px rgba(190,140,255,1); } }
  @keyframes clp-flow { from { background-position: 0 0, 0% 50%; } to { background-position: 0 0, 300% 50%; } }
  .clp-colors { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 4px 0 2px; font-size: 13px; color: #6d6259; }
  .clp-colors[hidden] { display: none; }
  .clp-colors button { width: 26px; height: 26px; padding: 0; border: 1px solid rgba(70,51,34,.25); border-radius: 6px; cursor: pointer; }
  .clp-colors button[aria-pressed="true"] { outline: 2px solid #201c18; outline-offset: 1px; }
  .clp-colors button[disabled] { opacity: .35; cursor: default; }
  .clp-colors em { font-style: normal; font-size: 12px; }
  .clp-gifts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 2px; font-size: 13px; color: #6d6259; }
  .clp-gifts[hidden] { display: none; }
  .clp-gifts button { padding: 3px 9px; border: 1.5px solid rgba(164,73,45,.35); border-radius: 999px; background: #fffaf3; color: #201c18; font-family: inherit; font-weight: 700; font-size: 13px; line-height: 1.4; cursor: pointer; }
  .clp-gifts button[disabled] { opacity: .45; cursor: default; }
  .clp-relogin { margin: 2px 0 8px; padding: 8px 10px; border: 1.5px solid #e2a08a; border-radius: 8px; background: #fff1ec; color: #7a2a14; font-size: 13px; line-height: 1.55; }
  .clp-relogin[hidden] { display: none; }
  .clp-relogin a { display: inline-block; margin-left: 4px; color: #a4492d; font-weight: 800; }
  .clp-realm-modal { position: fixed; z-index: 2147483000; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(32,28,24,.45); }
  .clp-realm-modal[hidden] { display: none; }
  .clp-realm-card { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 18px 20px; border-radius: 14px; background: #fffdf8; color: #201c18;
    box-shadow: 0 20px 60px rgba(0,0,0,.3); font: 14.5px/1.7 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-realm-card h3 { display: flex; align-items: center; justify-content: space-between; margin: 0 0 6px; font-size: 18px; }
  .clp-realm-card h3 button { border: 0; background: none; font-size: 22px; cursor: pointer; color: #6d6259; }
  .clp-realm-card h4 { margin: 12px 0 4px; font-size: 15px; color: #a4492d; }
  .clp-realm-card ul { margin: 0; padding-left: 20px; }
  .clp-news-card li { margin: 2px 0; }
  .clp-news-card li b { color: #463322; }
  .clp-news-ok { display: flex; justify-content: flex-end; margin-top: 14px; }
  .clp-news-ok button { padding: 7px 22px; border: 0; border-radius: 999px; background: #a4492d; color: #fff; font-family: inherit; font-weight: 700; font-size: 14.5px; line-height: 1.4; cursor: pointer; }
  .clp-realm-bar { position: relative; height: 10px; margin: 8px 0 2px; border-radius: 999px; background: #eee6d8; overflow: hidden; }
  .clp-realm-bar i { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: linear-gradient(90deg, #23655f, #b98cff, #ffd36b); }
  .clp-ladder { display: flex; align-items: flex-end; gap: 6px; margin: 8px 0 6px; padding: 16px 10px 0; border-radius: 12px; background: radial-gradient(ellipse at 40% 30%, #1f1a2c 0%, #13111a 55%, #0c0b10 100%); }
  .clp-step { position: relative; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .clp-step .clp-realm { margin: 0; padding: 2px 8px; border-radius: 5px; font: 700 15px/1.4 "Kaiti SC", STKaiti, KaiTi, serif; cursor: default; white-space: nowrap; }
  .clp-stone { box-sizing: border-box; width: 100%; padding: 8px 4px; border-top: 3px solid; border-radius: 6px 6px 0 0; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 11.5px; line-height: 1.35; text-align: center; }
  .clp-stone b { font-size: 12.5px; white-space: nowrap; }
  .clp-stone em { margin: -3px 0 2px; font: 800 11px/1.3 -apple-system, "PingFang SC", sans-serif; font-style: normal; opacity: .85; white-space: nowrap; }
  .clp-step.is-r0 .clp-stone em { color: #d9d4ca; }
  .clp-step.is-r1 .clp-stone em { color: #9fe3cc; }
  .clp-step.is-r2 .clp-stone em { color: #f2c64f; }
  .clp-step.is-r3 .clp-stone em { color: #d8b8ff; }
  .clp-step.is-r4 .clp-stone em { color: #ffe08a; }
  .clp-step-gift { display: inline-flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 3px; }
  .clp-step .clp-gi { flex: 0 0 auto; display: inline-grid; place-items: center; }
  .clp-step .clp-gi-dan { width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle at 34% 28%, #fff4c4, #ffc23a 40%, #c97300); color: #7a1a0a; font: 700 9px/1 "Kaiti SC", STKaiti, KaiTi, serif; }
  .clp-step.is-r0 .clp-stone { min-height: 64px; border-color: #9b9384; background: linear-gradient(180deg, #3a3630, #24211d); color: #b9afa0; }
  .clp-step.is-r0 .clp-stone b { color: #d9d4ca; }
  .clp-step.is-r1 .clp-stone { min-height: 88px; border-color: #3fa88d; background: linear-gradient(180deg, #1f3d36, #142621); color: #b9cfc6; }
  .clp-step.is-r1 .clp-stone b { color: #9fe3cc; }
  .clp-step.is-r2 .clp-stone { min-height: 112px; border-color: #e8b844; background: linear-gradient(180deg, #3e3218, #241d0e); color: #d8c79a; }
  .clp-step.is-r2 .clp-stone b { color: #f2c64f; }
  .clp-step.is-r3 .clp-stone { min-height: 136px; border-color: #a678ff; background: linear-gradient(180deg, #2c1a4e, #170e2a); box-shadow: 0 -8px 26px rgba(150,100,255,.25); color: #cbb8e8; }
  .clp-step.is-r3 .clp-stone b { color: #d8b8ff; }
  .clp-step.is-r4 .clp-stone { min-height: 160px; border-top: 3px solid transparent; background: linear-gradient(180deg, #241640, #120c20) padding-box, linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b) border-box;
    background-size: 100% 100%, 300% 100%; box-shadow: 0 -10px 34px rgba(255,200,120,.25); color: #e6d8f0; animation: clp-flow 4s linear infinite; }
  .clp-step.is-r4 .clp-stone b { background: linear-gradient(90deg, #ffe08a, #fff6dc, #ffb3d6, #d9c2ff, #a8e6ff, #ffe08a); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: clp-textflow 4s linear infinite; }
  .clp-step.is-me .clp-stone { outline: 1.5px solid rgba(255,255,255,.6); outline-offset: -1.5px; }
  .clp-me { position: absolute; z-index: 1; top: -11px; right: 0; padding: 0 5px; border-radius: 999px; background: #c8452d; color: #fff; font: 800 11px/1.5 -apple-system, "PingFang SC", sans-serif; font-style: normal; box-shadow: 0 0 0 2px #13111a; }
  /* 阶梯里的说明按词断行（“加青冥、／翠竹”“青竹／蜂云剑”），字号放大后不把一个词拆开 */
  .clp-stone span { word-break: keep-all; overflow-wrap: anywhere; }
  @media (max-width: 480px) {
    .clp-ladder { gap: 4px; padding: 14px 6px 0; }
    .clp-step .clp-realm { padding: 1px 4px; font-size: 13px; }
    .clp-step .clp-realm.is-r3::before, .clp-step .clp-realm.is-r4::before { display: none; }
    .clp-stone { padding: 6px 1px; font-size: 10.5px; }
    .clp-stone b { font-size: 11.5px; }
  }
  @media (prefers-reduced-motion: reduce) { .clp-ladder, .clp-ladder * { animation: none !important; } }
  .clp-toast { position: fixed; z-index: 2147483001; left: 50%; top: 18px; transform: translateX(-50%); max-width: calc(100vw - 32px); padding: 12px 18px; border-radius: 12px;
    color: #3b1d00; background: linear-gradient(100deg, #f3e3ff, #fff3c8); box-shadow: 0 10px 30px rgba(0,0,0,.25); font: 800 15px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  /* 隐藏彩蛋的弹出提示（2026-11-05）：建议被采纳、点笑脸、一周登录满 3 天加修为 */
  .clp-egg { position: fixed; inset: 0; z-index: 2147483002; display: grid; place-items: center; padding: 16px; background: rgba(20,14,8,.38); animation: clp-egg-in .25s ease; }
  .clp-egg-card { position: relative; box-sizing: border-box; width: min(420px, 100%); padding: 22px 22px 18px; border-radius: 16px; text-align: center; color: #3b1d00;
    background: linear-gradient(140deg, #fff7d6, #f3e3ff); box-shadow: 0 18px 50px rgba(0,0,0,.3); font: 15px/1.7 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-egg-burst { display: block; font-size: 34px; line-height: 1; color: #d99a1a; animation: clp-egg-pop .9s ease; }
  .clp-egg-card p { margin: 10px 0 6px; font-weight: 800; font-size: 17px; line-height: 1.7; text-wrap: pretty; }
  .clp-egg-card small { display: block; color: #7a6450; font-size: 12.5px; }
  .clp-egg-card button { margin-top: 14px; padding: 9px 26px; border: 0; border-radius: 999px; color: #fff; background: #a4492d; font-family: inherit; font-weight: 800; font-size: 15px; line-height: 1; cursor: pointer; }
  .clp-egg-card button:focus-visible { outline: 3px solid rgba(164,73,45,.35); outline-offset: 2px; }
  .clp-egg-card.is-warn { color: #4a1f14; background: linear-gradient(140deg, #fff4ee, #ffe8df); }
  .clp-egg-card.is-warn .clp-egg-burst { display: grid; place-items: center; width: 42px; height: 42px; margin: 0 auto; border-radius: 50%; color: #fff; background: #b4472f; font-size: 26px; font-weight: 800; animation: none; }
  @keyframes clp-egg-in { from { opacity: 0; } }
  @keyframes clp-egg-pop { from { transform: scale(.3) rotate(-90deg); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .clp-egg, .clp-egg-burst { animation: none; } }
  /* 学生版测试页（2026-11-05 用户：“把这个缩小后放到右下角，做成类似于使用说明的按钮”）：右下角“测试页”按钮（叠在“使用说明”上方），点开小卡片 */
  .clp-pv-btn { position: fixed; z-index: 79; right: 18px; bottom: 170px; display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 6px 13px 6px 9px;
    border: 1px solid rgba(140,32,24,.38); border-radius: 999px; background: rgba(255,253,248,.96); color: #8c2018; box-shadow: 0 6px 18px rgba(34,26,20,.16);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
  .clp-pv-btn:hover, .clp-pv-btn:focus-visible, .clp-pv-btn[aria-expanded="true"] { border-color: #8c2018; outline: none; }
  .clp-pv-btn b { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #8c2018; color: #fff4e0; font-size: 12.5px; }
  .clp-pv-btn.is-warn::after { content: ''; position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: #d4452c; box-shadow: 0 0 0 2px #fffdf8; }
  @media (max-width: 900px) { .clp-pv-btn span { display: none; } .clp-pv-btn { padding: 6px 9px; } }
  .clp-pv-pop { position: fixed; z-index: 2147482990; right: 18px; bottom: 220px; box-sizing: border-box; width: min(340px, calc(100vw - 24px)); padding: 14px 16px 14px;
    border: 1px solid rgba(140,32,24,.25); border-radius: 14px; background: #fffdf8; color: #2a201a; box-shadow: 0 16px 40px rgba(34,26,20,.25);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13.5px; line-height: 1.65; }
  .clp-pv-pop[hidden] { display: none; }
  .clp-pv-pop header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .clp-pv-pop header b { padding: 2px 10px; border-radius: 999px; background: #8c2018; color: #fff4e0; font-size: 13px; }
  .clp-pv-pop header button { width: 28px; height: 28px; border: 0; border-radius: 50%; background: #f3ece2; color: #5b4a3e; font-size: 17px; line-height: 1; cursor: pointer; }
  .clp-pv-pop p { margin: 0; color: #4a3d33; text-wrap: pretty; }
  .clp-pv-pop p.is-warn { color: #a4321f; font-weight: 700; }
  .clp-pv-pop div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .clp-pv-pop div button { flex: 1 1 auto; padding: 7px 12px; border: 1px solid rgba(140,32,24,.4); border-radius: 8px; background: #fff; color: #8c2018;
    font-family: inherit; font-weight: 800; font-size: 13px; line-height: 1.3; cursor: pointer; }
  .clp-pv-pop div button:hover:not(:disabled) { background: #fbefe9; }
  .clp-pv-pop div button:disabled { opacity: .6; cursor: default; }
  @media print { .clp-pv-btn, .clp-pv-pop { display: none !important; } }
  .clp-who small, .clp-room, .clp-hint { color: #6d6259; font-size: 12.5px; }
  .clp-hint { margin: 6px 0 0; line-height: 1.5; }
  .clp-hint[data-state=ok] { color: #23655f; }
  .clp-hint[data-state=error] { color: #a4492d; font-weight: 700; }
  .clp-link { padding: 0; border: 0; background: none; color: #a4492d; font: inherit; font-size: 12.5px; text-decoration: underline; cursor: pointer; white-space: nowrap; }
  .clp-progress { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(70,51,34,.2); }
  .clp-count { font-weight: 800; }
  .clp-state { display: block; color: #6d6259; font-size: 13px; }
  .clp-state[data-state=ok] { color: #23655f; font-weight: 700; }
  .clp-state[data-state=error] { color: #a4492d; font-weight: 700; }
  .clp-ident { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 8px; }
  .clp-ident input { min-width: 0; padding: 7px 8px; border: 1.5px solid rgba(70,51,34,.2); border-radius: 7px; background: #fff; font: inherit; }
  .clp-ident input:focus { outline: none; border-color: #23655f; }
  .clp-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .clp-tools button { padding: 7px 11px; border: 1px solid rgba(35,101,95,.45); border-radius: 7px; color: #23655f; background: #fff; font-family: inherit; font-weight: 700; font-size: 13px; line-height: 1; cursor: pointer; }
  .clp-tools button.is-main { border-color: #23655f; color: #fff; background: #23655f; }
  .clp-danmaku { display: flex; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(70,51,34,.2); }
  .clp-mydm { margin-top: 6px; }
  .clp-mydm summary { cursor: pointer; color: #23655f; font-size: 13px; font-weight: 700; }
  .clp-mydm-list { display: grid; gap: 5px; max-height: 200px; margin: 6px 0 0; padding: 0; overflow: auto; list-style: none; }
  .clp-mydm-list li { display: flex; gap: 6px; align-items: flex-start; padding: 5px 7px; border-radius: 6px; background: rgba(70,51,34,.05); font-size: 13px; line-height: 1.45; }
  .clp-mydm-list li > span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .clp-mydm-list b { margin-right: 4px; padding: 0 5px; border-radius: 4px; color: #23655f; background: #e4efeb; font-size: 11.5px; }
  .clp-mydm-list em { display: block; color: #6d6259; font-size: 11.5px; font-style: normal; }
  .clp-mydm-list button { flex: 0 0 auto; padding: 2px 7px; border: 1px solid rgba(164,73,45,.4); border-radius: 5px; color: #a4492d; background: #fff; font: inherit; font-size: 12px; cursor: pointer; }
  .clp-mydm-list button.is-confirm { color: #fff; background: #a4492d; }
  .clp-mydm-list button[disabled] { opacity: .6; cursor: default; }
  .clp-danmaku input { flex: 1 1 auto; min-width: 0; padding: 7px 9px; border: 1.5px solid rgba(70,51,34,.2); border-radius: 7px; font: inherit; background: #fff; }
  .clp-danmaku input:focus { outline: none; border-color: #23655f; }
  .clp-danmaku button { flex: 0 0 auto; min-width: 52px; padding: 7px 10px; border: 0; border-radius: 7px; color: #fff; background: #a4492d; font-family: inherit; font-weight: 800; font-size: 13px; line-height: 1; cursor: pointer; }
  .clp-danmaku button[disabled] { opacity: .55; cursor: default; }
  .clp-panel.is-folded .clp-body { display: none; }
  .clp-dmq { margin: 20px 0; padding: 16px 18px; border: 1.5px dashed rgba(164,73,45,.45); border-radius: 12px; background: #fffaf3; color: #201c18; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-dmq-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .clp-dmq-tag { padding: 2px 10px; border-radius: 999px; color: #fff; background: #a4492d; font-weight: 800; font-size: 13px; }
  .clp-dmq-label { color: #6d6259; font-size: 13px; font-weight: 700; }
  .clp-dmq h4 { margin: 8px 0 4px; font-size: 18px; line-height: 1.6; }
  .clp-dmq-hint { margin: 0 0 8px; color: #6d6259; font-size: 14px; }
  .clp-dmq-form { display: flex; gap: 8px; }
  .clp-dmq-form input { flex: 1 1 auto; min-width: 0; padding: 9px 11px; border: 1.5px solid rgba(70,51,34,.22); border-radius: 8px; background: #fff; font: inherit; }
  .clp-dmq-form input:focus { outline: none; border-color: #a4492d; }
  .clp-dmq-form button { flex: 0 0 auto; min-width: 64px; padding: 9px 14px; border: 0; border-radius: 8px; color: #fff; background: #a4492d; font-family: inherit; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
  .clp-dmq-form button[disabled], .clp-dmq-form input[disabled] { opacity: .55; cursor: default; }
  .clp-dmq-state { margin: 6px 0 0; color: #6d6259; font-size: 13px; }
  .clp-dmq-state[data-state="ok"] { color: #23655f; }
  .clp-dmq-state[data-state="error"] { color: #a4492d; }
  @media print { .clp-dmq { display: none !important; } }
  /* 境界解锁：学习方法小锦囊（筑基）、题目解答（结丹）；政经课后自修计分提示 */
  html:not(.clp-study-open) .study-box[data-study-lock] .study-body { display: none !important; }
  html:not(.clp-study-open) .study-box[data-study-lock] .study-lock { display: block !important; }
  .clp-ex { margin-top: 6px; }
  .clp-ex-btn { padding: 5px 14px; border: 1.5px solid #c9a24a; border-radius: 999px; background: linear-gradient(180deg, #fff8e0, #f6e2a8); color: #6b4200;
    font: 700 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
  .clp-ex-btn.is-locked, .clp-ex-btn:disabled { border-color: #d6cdbd; background: #f4f0e6; color: #8a7f74; cursor: default; }
  .clp-ex-body { margin-top: 8px; padding: 12px 14px; border-left: 3px solid #c9a24a; border-radius: 0 10px 10px 0; background: #fffaf0; color: #201c18;
    font: 15.5px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-ex-body ul { margin: 6px 0 0; padding-left: 20px; }
  .clp-ex-body li { margin: 4px 0; }
  .clp-ex-ans { margin: 0; }
  .clp-ex-ans b { display: inline-block; margin-right: 8px; padding: 0 8px; border-radius: 6px; background: #a4492d; color: #fff; font-size: 12.5px; }
  .clp-ex-note { margin: 0; color: #6d6259; }
  .clp-xl-state { margin: 6px 0 0; color: #6d6259; font-size: 14px; }
  .clp-xl-state[data-state="ok"] { color: #8a5a1a; font-weight: 700; }
  .clp-xl-send { margin-top: 8px; padding: 7px 16px; border: 0; border-radius: 9px; background: #a4492d; color: #fff; font: 700 14.5px/1.4 -apple-system, "PingFang SC", sans-serif; cursor: pointer; }
  .clp-xl-send:disabled { opacity: .55; cursor: default; }
  @media print { .clp-ex, .clp-xl-send, .clp-xl-state { display: none !important; } }
  .clp-subm { margin: 22px 0 8px; padding: 16px 18px; border: 1.5px solid rgba(164,73,45,.35); border-radius: 12px; background: #fffaf3; color: #201c18; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-sub-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .clp-sub-tag { padding: 2px 10px; border-radius: 999px; color: #fff; background: #a4492d; font-weight: 800; font-size: 13px; }
  .clp-sub-who { color: #6d6259; font-size: 13px; }
  .clp-sub-head button { margin-left: auto; padding: 5px 12px; border: 1.5px solid rgba(164,73,45,.45); border-radius: 8px; background: #fff; color: #a4492d; font-family: inherit; font-weight: 800; font-size: 13px; line-height: 1.2; cursor: pointer; }
  .clp-sub-big { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 6px; }
  .clp-sub-big b { font-size: 30px; line-height: 1; color: #a4492d; }
  .clp-sub-big.is-all b { color: #23655f; }
  .clp-sub-bar { height: 8px; border-radius: 999px; background: rgba(70,51,34,.12); overflow: hidden; }
  .clp-sub-bar i { display: block; height: 100%; width: 0; background: #a4492d; transition: width .4s; }
  .clp-sub-big.is-all + .clp-sub-bar i { background: #23655f; }
  .clp-sub-state { margin: 8px 0 4px; font-weight: 700; }
  .clp-sub-state[data-state="ok"] { color: #23655f; }
  .clp-sub-state[data-state="error"] { color: #a4492d; }
  .clp-subm details { margin-top: 6px; }
  .clp-subm summary { cursor: pointer; color: #a4492d; font-weight: 700; }
  .clp-subm ol { margin: 6px 0 0; padding-left: 22px; }
  .clp-subm li button { padding: 0; border: 0; background: none; color: #23655f; font: inherit; text-align: left; text-decoration: underline; cursor: pointer; }
  .clp-subm li small { color: #6d6259; margin-left: 6px; }
  .clp-sub-note { margin: 8px 0 0; color: #6d6259; font-size: 12.5px; }
  ${(Live.feedbackBox || {}).css || ''}
  /* 辩论聊天室（2026-10-28） */
  .dbr-note, .dbr-empty { margin: 0; padding: 12px 16px; border-radius: 10px; background: #f6f1e7; color: #6d6259; font-size: 15px; }
  .dbr-join { padding: 16px 18px; border-radius: 12px; border: 1.5px solid rgba(35,101,95,.35); background: #f2f8f6; }
  .dbr-join.is-con { border-color: rgba(164,73,45,.4); background: #fbf2ed; }
  .dbr-lead { margin: 0 0 10px; font-size: 16px; } .dbr-lead b { color: #23655f; } .dbr-join.is-con .dbr-lead b { color: #a4492d; }
  .dbr-nick, .dbr-form { display: flex; gap: 8px; }
  .dbr-nick input, .dbr-form input { flex: 1 1 auto; min-width: 0; padding: 10px 12px; border: 1.5px solid rgba(70,51,34,.22); border-radius: 9px; background: #fff; font-size: 16px; line-height: 1.4; }
  .dbr-nick button, .dbr-form button { flex: 0 0 auto; padding: 10px 18px; border: 0; border-radius: 9px; background: #23655f; color: #fff; font-weight: 800; font-size: 15px; line-height: 1; cursor: pointer; }
  .is-con .dbr-nick button, .dbr-room.is-con .dbr-form button { background: #a4492d; }
  .dbr-nick button[disabled], .dbr-form button[disabled] { opacity: .55; cursor: default; }
  .dbr-hint { margin: 8px 0 0; color: #6d6259; font-size: 13px; }
  .dbr-state { margin: 6px 0 0; min-height: 1em; color: #6d6259; font-size: 13.5px; } .dbr-state[data-state="error"] { color: #a4492d; font-weight: 700; }
  .dbr-room { border-radius: 14px; border: 1.5px solid rgba(35,101,95,.4); background: #fbfdfc; overflow: hidden; }
  .dbr-room.is-con { border-color: rgba(164,73,45,.45); background: #fffbf8; }
  .dbr-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 10px 16px; background: linear-gradient(180deg, #2b7169, #23655f); color: #fff; }
  .dbr-room.is-con .dbr-head { background: linear-gradient(180deg, #b55536, #a4492d); }
  .dbr-head > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
  .dbr-head b { font-size: 17px; letter-spacing: .06em; } .dbr-head span { font-size: 13px; opacity: .92; }
  .dbr-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 16px; border-bottom: 1px solid rgba(70,51,34,.08); background: #fffaf0; color: #6d6259; font-size: 13.5px; }
  .dbr-top[hidden] { display: none; }
  .dbr-top > b { color: #8a5a1a; letter-spacing: .04em; }
  .dbr-top > span { display: inline-flex; align-items: baseline; gap: 5px; padding: 2px 10px; border-radius: 999px; border: 1px solid rgba(184,134,43,.35); background: #fff; color: #201c18; }
  .dbr-top > span i { font-style: normal; font-weight: 800; color: #b8862b; } .dbr-top > span small { color: #23655f; } .dbr-top > span.is-con small { color: #a4492d; }
  .dbr-top > span em { font-style: normal; font-weight: 800; color: #c0392b; } .dbr-top > span.is-me { border-color: #b8862b; background: #fff3cf; }
  .dbr-body { display: grid; grid-template-columns: 188px minmax(0, 1fr); min-height: 300px; }
  .dbr-people { border-right: 1px solid rgba(70,51,34,.1); background: rgba(70,51,34,.03); padding: 10px 8px; max-height: 452px; overflow-y: auto; }
  .dbr-people h5 { margin: 0 6px 8px; font-size: 13px; color: #6d6259; letter-spacing: .04em; }
  .dbr-people ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
  .dbr-people li { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 9px; }
  .dbr-people li.is-me { background: rgba(35,101,95,.08); } .dbr-room.is-con .dbr-people li.is-me { background: rgba(164,73,45,.08); }
  .dbr-people li > span { display: grid; min-width: 0; }
  .dbr-people b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #201c18; } .dbr-people b small { font-weight: 400; color: #6d6259; }
  .dbr-people span > small { color: #8a7f74; font-size: 12px; white-space: nowrap; }
  .dbr-people em, .dbr-who em { margin-right: 4px; padding: 0 6px; border-radius: 999px; background: #b8862b; color: #fff; font-style: normal; font-size: 11.5px; font-weight: 800; }
  .dbr-people-empty { color: #8a7f74; font-size: 13px; }
  .dbr-av { position: relative; flex: 0 0 auto; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: hsl(var(--h) 45% 46%); color: #fff; font-style: normal; font-weight: 800; font-size: 15px; }
  .dbr-av s { position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fbfdfc; background: #c8c0b5; text-decoration: none; }
  .dbr-av s.is-on { background: #2fb36b; }
  .dbr-main { display: flex; flex-direction: column; min-width: 0; }
  .dbr-list { flex: 1 1 auto; max-height: 380px; overflow-y: auto; padding: 12px 16px; display: grid; align-content: start; gap: 12px; }
  .dbr-msg { display: flex; align-items: flex-start; gap: 8px; }
  .dbr-msg.is-mine { flex-direction: row-reverse; }
  .dbr-msg-body { display: grid; gap: 3px; min-width: 0; max-width: min(78%, 520px); }
  .dbr-msg.is-mine .dbr-msg-body { justify-items: end; }
  .dbr-who { display: flex; gap: 6px; align-items: baseline; font-size: 12.5px; color: #8a7f74; } .dbr-who b { color: #4a4038; font-size: 13px; }
  .dbr-msg.is-mine .dbr-who { flex-direction: row-reverse; }
  .dbr-bubble { position: relative; display: flex; align-items: flex-end; gap: 8px; padding: 8px 10px 8px 12px; border-radius: 4px 14px 14px 14px; background: #fff; border: 1px solid rgba(70,51,34,.12); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .dbr-msg.is-mine .dbr-bubble { border-radius: 14px 4px 14px 14px; background: #e2f1ec; border-color: rgba(35,101,95,.2); }
  .dbr-room.is-con .dbr-msg.is-mine .dbr-bubble { background: #f9e5da; border-color: rgba(164,73,45,.2); }
  .dbr-bubble p { margin: 0; font-size: 15.5px; line-height: 1.6; word-break: break-word; }
  .dbr-like { flex: 0 0 auto; padding: 3px 8px; border: 1px solid rgba(192,57,43,.3); border-radius: 999px; background: #fff; color: #c0392b; font-weight: 700; font-size: 12.5px; line-height: 1; cursor: pointer; }
  .dbr-like em { font-style: normal; } .dbr-like[aria-pressed="true"] { background: #c0392b; color: #fff; border-color: #c0392b; }
  .dbr-like[disabled] { opacity: .45; cursor: default; }
  .dbr-room .dbr-form { padding: 10px 16px 0; border-top: 1px solid rgba(70,51,34,.08); } .dbr-room .dbr-state { padding: 0 16px 10px; }
  /* 分组讨论（2026-11-11）：四个角色组聊天室，组色按 r1—r4；顶上是讨论题和本组任务 */
  .dsc-room.is-r1 { border-color: rgba(35,101,95,.4); } .dsc-room.is-r1 .dbr-head { background: linear-gradient(180deg, #2b7169, #23655f); }
  .dsc-room.is-r2 { border-color: rgba(164,73,45,.45); background: #fffbf8; } .dsc-room.is-r2 .dbr-head { background: linear-gradient(180deg, #b55536, #a4492d); }
  .dsc-room.is-r3 { border-color: rgba(61,90,153,.45); background: #f8faff; } .dsc-room.is-r3 .dbr-head { background: linear-gradient(180deg, #4a68a8, #3d5a99); }
  .dsc-room.is-r4 { border-color: rgba(138,90,26,.45); background: #fffcf4; } .dsc-room.is-r4 .dbr-head { background: linear-gradient(180deg, #9b6a25, #8a5a1a); }
  .dsc-room.is-r2 .dbr-form button { background: #a4492d; } .dsc-room.is-r3 .dbr-form button { background: #3d5a99; } .dsc-room.is-r4 .dbr-form button { background: #8a5a1a; }
  .dsc-room.is-r2 .dbr-msg.is-mine .dbr-bubble { background: #f9e5da; border-color: rgba(164,73,45,.2); }
  .dsc-room.is-r3 .dbr-msg.is-mine .dbr-bubble { background: #e3eaf8; border-color: rgba(61,90,153,.2); }
  .dsc-room.is-r4 .dbr-msg.is-mine .dbr-bubble { background: #f6ead2; border-color: rgba(138,90,26,.2); }
  .dsc-join.is-r2 { border-color: rgba(164,73,45,.4); background: #fbf2ed; } .dsc-join.is-r2 .dbr-lead b { color: #a4492d; } .dsc-join.is-r2 .dbr-nick button { background: #a4492d; }
  .dsc-join.is-r3 { border-color: rgba(61,90,153,.4); background: #eff3fb; } .dsc-join.is-r3 .dbr-lead b { color: #3d5a99; } .dsc-join.is-r3 .dbr-nick button { background: #3d5a99; }
  .dsc-join.is-r4 { border-color: rgba(138,90,26,.4); background: #fbf5e8; } .dsc-join.is-r4 .dbr-lead b { color: #8a5a1a; } .dsc-join.is-r4 .dbr-nick button { background: #8a5a1a; }
  .dsc-task { display: grid; gap: 4px; padding: 10px 16px; border-bottom: 1px solid rgba(70,51,34,.08); background: #fffaf0; font-size: 14.5px; line-height: 1.6; color: #3b3129; }
  .dsc-task p { margin: 0; } .dsc-task p:empty { display: none; }
  .dsc-task b { display: inline-block; margin-right: 8px; padding: 0 8px; border-radius: 999px; background: #b8862b; color: #fff; font-size: 12.5px; font-weight: 800; letter-spacing: .04em; }
  .dsc-room .dbr-stage { padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,.18); font-size: 13px; font-weight: 700; }
  @media (max-width: 640px) {
    .dbr-body { grid-template-columns: 1fr; }
    .dbr-people { border-right: 0; border-bottom: 1px solid rgba(70,51,34,.1); max-height: none; padding: 8px 10px; }
    .dbr-people ul { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
    .dbr-people li { flex: 0 0 auto; padding: 4px 8px 4px 4px; border: 1px solid rgba(70,51,34,.1); border-radius: 999px; background: #fff; }
    .dbr-people span > small { display: none; }
    .dbr-msg-body { max-width: 86%; }
  }
  @media print { .clp-fb { display: none !important; } }
  .clp-panel.is-gate { border-color: rgba(164,73,45,.35); }
  .clp-gate-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .clp-panel.is-gate.is-folded { width: auto; max-width: calc(100vw - 32px); padding: 8px 14px; }
  .clp-panel.is-gate a { display: inline-block; margin-top: 8px; padding: 8px 12px; border-radius: 7px; color: #fff; background: #a4492d; text-decoration: none; font-weight: 800; }
  .clp-panel.is-gate .clp-gate-leave { margin: 8px 0 0 6px; padding: 8px 12px; border: 0; border-radius: 7px; color: #a4492d; background: #f5e7df; font: inherit; font-weight: 800; cursor: pointer; }
  input[data-student-field][readonly] { background: #f1ece3; color: #4d443c; }
  .clp-q { position: relative; margin: 10px 0 6px; padding: 10px 12px; border: 1px dashed rgba(35,101,95,.4); border-radius: 8px; background: rgba(228,239,235,.45); color: #201c18; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-q.is-locked { border-style: solid; background: rgba(228,239,235,.7); }
  .clp-q-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 44px; padding-right: 112px; box-sizing: border-box; }
  .clp-q-send { flex: 0 0 auto; min-width: 112px; min-height: 44px; padding: 0 26px; border: 0; border-radius: 10px; color: #fff; background: linear-gradient(180deg, #2f7a72, #23655f); box-shadow: 0 2px 6px rgba(35,101,95,.28); font-weight: 800; font-size: 16px; line-height: 1; letter-spacing: .12em; cursor: pointer; touch-action: manipulation; }
  .clp-q-send:active { transform: translateY(1px); }
  .clp-q-send.is-confirm { background: #a4492d; box-shadow: 0 2px 6px rgba(164,73,45,.3); letter-spacing: 0; }
  .clp-q-send[disabled] { opacity: .5; cursor: default; }
  .clp-q-state { color: #6d6259; font-size: 13px; }
  .clp-q-state[data-state=ok] { color: #23655f; font-weight: 700; }
  .clp-q-state[data-state=error] { color: #a4492d; font-weight: 700; }
  .clp-q-state[data-state=stopped] { color: #a4492d; font-weight: 700; }
  /* 我的备注放在右上角，和左边的“递交”隔开，手机上不容易误点（2026-10-29 用户：“手机页面，点击递交按钮容易误触我的备注”） */
  .clp-note { margin-top: 6px; }
  .clp-q-row:not([hidden]) ~ .clp-note { margin-top: 0; }
  .clp-q-row:not([hidden]) ~ .clp-note > summary { position: absolute; top: 10px; right: 12px; }
  .clp-note summary { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; box-sizing: border-box; border: 1px dashed rgba(164,73,45,.45); border-radius: 10px; background: #fffdf8; color: #a4492d; font-size: 13.5px; font-weight: 700; cursor: pointer; touch-action: manipulation; }
  .clp-note[open] > summary { border-style: solid; background: #fbeee6; }
  @media (max-width: 640px) {
    .clp-q-row { padding-right: 0; }
    .clp-q-state { flex: 1 1 100%; }
    .clp-q-send[hidden] + .clp-q-state { margin-right: 108px; }
  }
  .clp-note textarea { display: block; box-sizing: border-box; width: 100%; min-height: 64px; margin-top: 8px; padding: 7px 9px; border: 1.5px solid rgba(70,51,34,.2); border-radius: 7px; background: #fffdf8; color: #201c18; font-size: 14px; line-height: 1.6; resize: vertical; }
  .clp-note textarea:focus { outline: none; border-color: #23655f; }
  /* 课堂面板（已进入课堂）：境界头部＋醒目的发弹幕＋作答进度；按境界换材质（is-r0 素石 … is-r4 神光）。离线版与未进入课堂的面板仍用上面的样式 */
  .clp-panel.clp-v2 { --clp-head-bg: linear-gradient(135deg, #f1ece2, #d9d2c4); --clp-head-ink: #2f2a24; --clp-head-sub: #6d6259; --clp-link: #8a3b22;
    --clp-accent: #6b6255; --clp-accent-ink: #fff; --clp-accent-glow: none; --clp-border: #ddd3c2; --clp-shadow: 0 18px 40px rgba(40,30,20,.16);
    --clp-bar: #8a8173; --clp-track: rgba(0,0,0,.1); --clp-input-border: #d6cdbd; --clp-ring: rgba(107,98,85,.18); --clp-label: #6d6259;
    display: flex; flex-direction: column; width: min(372px, calc(100vw - 32px)); max-height: calc(100vh - 110px); padding: 0; overflow: hidden;
    border: 1px solid var(--clp-border); border-radius: 16px; background: #fffaf3; box-shadow: var(--clp-shadow); }
  .clp-v2.is-r1 { --clp-head-bg: linear-gradient(135deg, #e6f7f0, #a9dccb 70%, #86cbb5); --clp-head-ink: #12382f; --clp-head-sub: #2e5c50; --clp-link: #1f6455;
    --clp-accent: #2a7d69; --clp-border: #b8dccf; --clp-shadow: 0 18px 40px rgba(20,60,48,.16); --clp-bar: linear-gradient(90deg, #3fa88d, #2a7d69);
    --clp-track: rgba(10,60,48,.14); --clp-input-border: #9fd2c1; --clp-ring: rgba(42,125,105,.18); --clp-label: #2e5c50; }
  .clp-v2.is-r2 { --clp-head-bg: linear-gradient(135deg, #fff7dc, #f4d37c 55%, #dcab45); --clp-head-ink: #3a2300; --clp-head-sub: #6b4a14; --clp-link: #6b4200;
    --clp-accent: linear-gradient(180deg, #d9a43a, #a8730f); --clp-border: #e4c88a; --clp-shadow: 0 18px 40px rgba(120,80,10,.18);
    --clp-bar: linear-gradient(90deg, #f2c64f, #b8801a); --clp-track: rgba(90,60,0,.15); --clp-input-border: #e4c88a; --clp-ring: rgba(216,164,58,.2); --clp-label: #6b4a14; }
  .clp-v2.is-r3 { --clp-head-bg: linear-gradient(135deg, #25104f, #5427ad 60%, #7a45e0); --clp-head-ink: #f6eaff; --clp-head-sub: #d6c3f5; --clp-link: #e3cfff;
    --clp-accent: linear-gradient(160deg, #7a3fe0, #4b1d8f); --clp-accent-glow: 0 0 12px rgba(150,100,255,.55); --clp-border: #c9b0f2;
    --clp-shadow: 0 18px 44px rgba(80,40,160,.24), 0 0 0 3px rgba(170,120,255,.15); --clp-bar: linear-gradient(90deg, #b98cff, #f2e6ff);
    --clp-track: rgba(255,255,255,.16); --clp-input-border: #8b5fe0; --clp-ring: rgba(170,120,255,.2); --clp-label: #5427ad; }
  .clp-v2.is-r4 { --clp-head-bg: radial-gradient(circle at 88% 18%, rgba(255,214,110,.35), transparent 42%), radial-gradient(circle at 10% 90%, rgba(155,107,255,.45), transparent 48%), #140d24;
    --clp-head-ink: #fff4dc; --clp-head-sub: #e4d6c0; --clp-link: #ffe7a3; --clp-accent: linear-gradient(90deg, #ffb347, #ff8fc4, #9b6bff, #ffb347); --clp-accent-ink: #2a1440;
    --clp-accent-glow: 0 0 14px rgba(255,200,120,.6); --clp-shadow: 0 18px 50px rgba(120,60,160,.28), 0 0 26px rgba(255,200,120,.35);
    --clp-bar: linear-gradient(90deg, #ffb347, #ff8fc4, #9b6bff, #ffb347); --clp-track: rgba(255,255,255,.14); --clp-input-border: #c9a24a; --clp-ring: rgba(255,214,110,.2); --clp-label: #8a5a1a;
    border: 2px solid transparent; background: linear-gradient(#fffaf3, #fffaf3) padding-box, linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b) border-box;
    background-size: 100% 100%, 300% 100%; animation: clp-flow 5s linear infinite; }
  .clp-v2 .clp-head { position: relative; flex: 0 0 auto; padding: 10px 14px 8px; background: var(--clp-head-bg); color: var(--clp-head-ink); }
  .clp-v2 .clp-who { display: flex; align-items: center; gap: 7px; }
  .clp-v2 .clp-no { margin: 0; flex: 0 0 auto; }
  .clp-v2 .clp-name { min-width: 0; overflow: hidden; font-size: 17px; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
  .clp-v2 .clp-realm { flex: 0 0 auto; margin: 0; padding: 1px 9px; border-radius: 5px; font: 700 14px/1.5 "Kaiti SC", STKaiti, KaiTi, serif; }
  .clp-v2 .clp-links { display: flex; flex: 0 0 auto; gap: 10px; margin-left: auto; }
  .clp-v2 .clp-head .clp-link { color: var(--clp-link); font-size: 13px; }
  .clp-v2 .clp-sub { margin-top: 3px; color: var(--clp-head-sub); font-size: 12.5px; }
  .clp-v2 .clp-rise { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: var(--clp-head-sub); font-size: 12px; }
  .clp-v2 .clp-rise[hidden] { display: none; }
  .clp-v2 .clp-rise-bar { flex: 1 1 auto; height: 6px; border-radius: 3px; background: var(--clp-track); overflow: hidden; }
  .clp-v2 .clp-rise-bar i { display: block; height: 100%; border-radius: 3px; background: var(--clp-bar); background-size: 300% 100%; }
  .clp-v2.is-r3 .clp-rise-bar i { box-shadow: 0 0 8px rgba(200,160,255,.9); }
  .clp-v2.is-r4 .clp-rise-bar i { box-shadow: 0 0 8px rgba(255,214,110,.9); animation: clp-textflow 4s linear infinite; }
  .clp-v2 .clp-star { display: none; position: absolute; color: #e8d8ff; font-style: normal; pointer-events: none; animation: clp-twinkle 2.2s ease-in-out infinite; }
  .clp-v2.is-r3 .clp-star, .clp-v2.is-r4 .clp-star { display: block; }
  .clp-v2 .clp-star:nth-child(1) { right: 126px; top: 6px; font-size: 11px; }
  .clp-v2 .clp-star:nth-child(2) { right: 26px; top: 56px; font-size: 9px; animation-delay: .8s; }
  .clp-v2 .clp-star:nth-child(3) { right: 74px; top: 30px; font-size: 7px; animation-delay: 1.4s; color: #fff; }
  .clp-v2.is-r4 .clp-star:nth-child(1) { color: #ffe08a; }
  .clp-v2.is-r4 .clp-star:nth-child(2) { color: #ffb3d6; }
  .clp-v2.is-r4 .clp-star:nth-child(3) { color: #a8e6ff; }
  @keyframes clp-twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
  @keyframes clp-textflow { from { background-position: 0% 50%; } to { background-position: 300% 50%; } }
  .clp-v2 .clp-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .clp-v2 .clp-sec { padding: 9px 14px; }
  .clp-v2 .clp-sec[hidden] { display: none; }
  .clp-v2 .clp-sec + .clp-sec { border-top: 1px dashed rgba(70,51,34,.18); }
  /* 字号放大后（live-readable.js）：“已递交 0/26 题”不拆开，说明放不下就换到下一行 */
  .clp-v2 .clp-sec-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 8px; margin-bottom: 6px; }
  .clp-v2 .clp-sec-title, .clp-v2 .clp-count { font-size: 15px; font-weight: 800; white-space: nowrap; }
  .clp-v2 .clp-sec-note { color: #8a7f74; font-size: 12px; text-wrap: pretty; }
  .clp-v2 .clp-sec-note[data-state=ok] { color: #23655f; font-weight: 700; }
  .clp-v2 .clp-relogin { margin: 0 0 10px; }
  /* 情境猜谜抢答对话框（2026-11-05）：老师点“看玩法”或出题后在页面上方弹出，大屏关闭前一直在；出题后按后台时钟同步倒计时 */
  .clp-pzd { position: fixed; z-index: 2147482900; top: 12px; left: 50%; transform: translateX(-50%); width: min(560px, calc(100vw - 24px)); box-sizing: border-box;
    padding: 12px 16px 12px; border: 1.5px solid #dcae57; border-radius: 16px; background: linear-gradient(180deg, #fff3d6, #fffaf0); color: #2b2118;
    box-shadow: 0 14px 34px rgba(80,50,10,.24); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-pzd[hidden] { display: none; }
  .clp-pzd-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 6px; }
  .clp-pzd-head b { color: #a4492d; font-size: 17px; font-weight: 900; letter-spacing: .04em; }
  .clp-pzd-head span { color: #6d5a44; font-size: 13.5px; font-weight: 700; text-align: right; }
  .clp-pzd-surface { margin: 0 0 8px; color: #5b4a3a; font-size: 13.5px; }
  .clp-pzd-surface summary { color: #a4492d; font-weight: 700; cursor: pointer; }
  .clp-pzd-surface p { margin: 4px 0 0; line-height: 1.65; }
  .clp-pzd-count { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 2px 0 10px; color: #7a4a10; font-weight: 800; font-size: 15.5px; }
  .clp-pzd-count[hidden] { display: none; }
  .clp-pzd-num { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffe08a, #e0a12a); color: #4a2b00;
    font: 900 30px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 4px rgba(224,161,42,.22); }
  .clp-pzd-count.is-go .clp-pzd-num { background: radial-gradient(circle at 35% 30%, #9be8c4, #23855f); color: #fff; font-size: 20px; }
  .clp-pzd-count.is-tick .clp-pzd-num { animation: clp-pzd-tick .35s ease; }
  @keyframes clp-pzd-tick { 0% { transform: scale(1.18); } 100% { transform: none; } }
  .clp-pzd-form { display: flex; gap: 8px; margin: 0; }
  .clp-pzd-form input { flex: 1 1 auto; min-width: 0; height: 44px; padding: 0 12px; border: 1.5px solid #dcae57; border-radius: 12px; background: #fff; color: #2b2118; font-size: 17px; }
  .clp-pzd-form input:focus { outline: none; box-shadow: 0 0 0 3px rgba(220,174,87,.35); }
  .clp-pzd-form button { min-width: 82px; height: 44px; padding: 0 16px; border: 0; border-radius: 12px; color: #fff; background: #a4492d; font-family: inherit; font-size: 17px; font-weight: 800; cursor: pointer; }
  .clp-pzd-form :disabled { opacity: .5; cursor: default; }
  .clp-pzd-state { margin: 7px 0 0; color: #5b4a3a; font-size: 13.5px; }
  .clp-pzd-state[data-state=ok] { color: #23655f; font-weight: 800; }
  .clp-pzd-state[data-state=bad] { color: #a4492d; font-weight: 700; }
  .clp-pzd.is-won { animation: clp-pz-pop .7s ease; }
  @keyframes clp-pz-pop { 0% { transform: translateX(-50%) scale(.96); } 50% { transform: translateX(-50%) scale(1.03); } 100% { transform: translateX(-50%); } }
  @media (max-width: 560px) { .clp-pzd { top: 8px; width: calc(100vw - 16px); padding: 10px 12px; } .clp-pzd-num { width: 50px; height: 50px; font-size: 26px; } }
  /* 时间轴排排站·全班分队（2026-11-11）：老师分组后弹出的答题对话框（同情境猜谜的位置和配色）；红蓝队标、倒计时、可点的时间轴位置、揭晓结果 */
  .clp-tl { position: fixed; z-index: 2147482900; top: 12px; left: 50%; transform: translateX(-50%); width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px);
    box-sizing: border-box; display: flex; flex-direction: column; padding: 12px 16px; border: 1.5px solid #dcae57; border-radius: 16px; background: linear-gradient(180deg, #fff3d6, #fffaf0); color: #2b2118;
    box-shadow: 0 14px 34px rgba(80,50,10,.24); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-tl[hidden] { display: none; }
  .clp-tl.is-red { border-color: #e08a74; box-shadow: 0 14px 34px rgba(80,50,10,.24), inset 0 4px 0 #c8452d; }
  .clp-tl.is-blue { border-color: #8fb2dc; box-shadow: 0 14px 34px rgba(80,50,10,.24), inset 0 4px 0 #2f6fb3; }
  .clp-tl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .clp-tl-head > b { color: #a4492d; font-size: 17px; font-weight: 900; letter-spacing: .04em; }
  .clp-tl-team { padding: 1px 10px; border-radius: 999px; color: #fff; font-size: 13.5px; font-weight: 800; }
  .clp-tl-team:empty { display: none; }
  .clp-tl-team.is-red { background: #c8452d; } .clp-tl-team.is-blue { background: #2f6fb3; }
  .clp-tl-q { margin-left: auto; color: #6d5a44; font-size: 13.5px; font-weight: 700; }
  .clp-tl-fold { padding: 2px 10px; border: 1px solid #dcae57; border-radius: 999px; color: #7a4a10; background: #fff; font: 700 12.5px/1.5 inherit; font-family: inherit; cursor: pointer; }
  .clp-tl.is-folded .clp-tl-body { display: none; }
  .clp-tl-body { min-height: 0; overflow-y: auto; margin-top: 6px; }
  .clp-tl-score { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0 0 8px; font-weight: 900; font-size: 15px; }
  .clp-tl-score:empty { display: none; }
  .clp-tl-score .is-red { color: #c8452d; } .clp-tl-score .is-blue { color: #2f6fb3; }
  .clp-tl-score b { font: 900 22px/1 Georgia, "Times New Roman", serif; }
  .clp-tl-card { margin: 0 0 8px; padding: 9px 12px; border: 1.5px solid #e0a12a; border-radius: 12px; background: #fffaf0; text-align: center; }
  .clp-tl-card small { display: block; color: #7a4a10; font-size: 12.5px; font-weight: 700; }
  .clp-tl-card b { display: block; font-size: 16.5px; line-height: 1.5; }
  .clp-tl-count { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0 0 8px; color: #7a4a10; font-weight: 800; font-size: 14.5px; }
  .clp-tl-count[hidden] { display: none; }
  .clp-tl-num { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffe08a, #e0a12a); color: #4a2b00;
    font: 900 24px/1 Georgia, "Times New Roman", serif; box-shadow: 0 4px 12px rgba(160,100,10,.3); }
  .clp-tl-count.is-hurry .clp-tl-num { background: radial-gradient(circle at 35% 30%, #ffc2b2, #d0553a); color: #fff; }
  .clp-tl-count.is-tick .clp-tl-num { animation: clp-pzd-tick .35s ease; }
  .clp-tl-line { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .clp-tl-ev { padding: 6px 10px; border-left: 4px solid #c9a24a; border-radius: 6px; background: rgba(201,162,74,.12); font-size: 14px; line-height: 1.5; }
  .clp-tl-ev span { display: block; color: #8a5a06; font: 800 13px/1.4 Georgia, "Times New Roman", serif; }
  .clp-tl-slot { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 4px 10px; border: 1.5px dashed #dcae57; border-radius: 10px; color: #7a4a10; background: #fff;
    font: 700 14.5px/1.4 inherit; font-family: inherit; text-align: left; cursor: pointer; }
  .clp-tl-slot i { flex: 0 0 auto; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 2px solid #e0a12a; font: 900 14px/1 inherit; font-style: normal; }
  .clp-tl-slot:disabled { cursor: default; }
  .clp-tl-slot:not(:disabled):hover { background: #fff3d6; }
  .clp-tl-slot.is-picked { border-style: solid; border-color: #a4492d; color: #fff; background: #a4492d; }
  .clp-tl-slot.is-picked i { border-color: #fff; }
  .clp-tl-slot.is-right { border-style: solid; border-color: #23855f; color: #fff; background: #23855f; }
  .clp-tl-slot.is-wrong { border-style: solid; border-color: #d0553a; color: #a4492d; background: #ffe7df; text-decoration: line-through; }
  .clp-tl-wait { margin: 2px 0 6px; line-height: 1.7; }
  .clp-tl-wait b.is-red { color: #c8452d; } .clp-tl-wait b.is-blue { color: #2f6fb3; }
  .clp-tl-tally { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 8px; }
  .clp-tl-tally div { padding: 6px 10px; border-radius: 10px; color: #fff; font-size: 13px; font-weight: 700; }
  .clp-tl-tally div b { display: block; font: 900 22px/1.1 Georgia, "Times New Roman", serif; }
  .clp-tl-tally .is-red { background: #c8452d; } .clp-tl-tally .is-blue { background: #2f6fb3; text-align: right; }
  .clp-tl-tally .is-win { box-shadow: 0 0 0 3px #ffd36b; }
  .clp-tl-over { margin: 4px 0 8px; text-align: center; font-size: 16px; font-weight: 800; line-height: 1.6; }
  .clp-tl-over big { display: block; font-size: 40px; line-height: 1.2; }
  .clp-tl-state { margin: 7px 0 0; color: #5b4a3a; font-size: 13.5px; }
  .clp-tl-state[data-state=ok] { color: #23655f; font-weight: 800; }
  .clp-tl-state[data-state=bad] { color: #a4492d; font-weight: 700; }
  @media (max-width: 560px) { .clp-tl { top: 8px; width: calc(100vw - 16px); padding: 10px 12px; } }
  .clp-v2 .clp-danmaku { gap: 8px; margin: 0; padding: 0; border: 0; }
  .clp-v2 .clp-dm-field { display: flex; flex: 1 1 auto; min-width: 0; border-radius: 12px; }
  .clp-v2 .clp-danmaku input { flex: 1 1 auto; height: 40px; padding: 0 12px; border: 1.5px solid var(--clp-input-border); border-radius: 12px; background: #fff; font-size: 16px; }
  .clp-v2 .clp-danmaku input:focus { border-color: var(--clp-input-border); box-shadow: 0 0 0 3px var(--clp-ring); }
  .clp-v2 .clp-danmaku button { min-width: 74px; height: 40px; padding: 0 14px; border-radius: 12px; color: var(--clp-accent-ink); background: var(--clp-accent);
    background-size: 300% 100%; box-shadow: var(--clp-accent-glow); font-size: 16px; }
  .clp-v2.is-r4 .clp-danmaku button:not([disabled]) { animation: clp-textflow 4s linear infinite; }
  .clp-v2.has-color .clp-danmaku input { border-color: #8b5fe0; background: #1d1630; color: var(--clp-dm-color, #e3cfff); font-weight: 700; caret-color: #fff; }
  .clp-v2.has-color .clp-danmaku input::placeholder { color: #8d82a8; -webkit-text-fill-color: #8d82a8; font-weight: 500; }
  .clp-v2.is-r4.has-color .clp-danmaku input { border-color: #c9a24a; }
  .clp-v2.has-flow .clp-dm-field { background: #140d24; }
  .clp-v2.has-flow .clp-danmaku input { background-color: transparent; background-image: var(--clp-dm-flow); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
    color: transparent; -webkit-text-fill-color: transparent; caret-color: #ffe08a; animation: clp-textflow 4s linear infinite; }
  /* 弹幕输入框的境界流光（2026-10-22）：结丹金丹一道金光绕框，元婴紫霄紫、冰蓝两道电光对绕并呼吸发光，化神神光七彩光环旋转、外晕变色。
     做法：输入框外套一层 2px 的框（.clp-dm-field），里面放一块旋转的锥形渐变（::before），::after 垫上输入框底色 */
  .clp-v2.is-r2 .clp-dm-field, .clp-v2.is-r3 .clp-dm-field, .clp-v2.is-r4 .clp-dm-field { position: relative; isolation: isolate; padding: 2px; overflow: hidden; border-radius: 13px; }
  .clp-v2.is-r2 .clp-dm-field::before, .clp-v2.is-r3 .clp-dm-field::before, .clp-v2.is-r4 .clp-dm-field::before { content: ''; position: absolute; z-index: -2; left: 50%; top: 50%;
    width: 320%; aspect-ratio: 1; transform: translate(-50%, -50%); animation: clp-orbit 3.6s linear infinite; pointer-events: none; }
  .clp-v2.is-r2 .clp-dm-field::after, .clp-v2.is-r3 .clp-dm-field::after, .clp-v2.is-r4 .clp-dm-field::after { content: ''; position: absolute; z-index: -1; inset: 2px; border-radius: 11px;
    background: var(--clp-dm-fill, #fff); pointer-events: none; }
  .clp-v2.is-r2 .clp-danmaku input, .clp-v2.is-r3 .clp-danmaku input, .clp-v2.is-r4 .clp-danmaku input { height: 36px; border: 0; border-radius: 11px; background-color: transparent; }
  .clp-v2.is-r2 .clp-danmaku input:focus, .clp-v2.is-r3 .clp-danmaku input:focus, .clp-v2.is-r4 .clp-danmaku input:focus { box-shadow: none; }
  .clp-v2.has-color { --clp-dm-fill: #1d1630; }
  .clp-v2.has-flow { --clp-dm-fill: #140d24; }
  .clp-v2.has-color .clp-dm-field, .clp-v2.has-flow .clp-dm-field { background: transparent; }
  .clp-v2.is-r2 .clp-dm-field { box-shadow: 0 0 8px rgba(242,198,79,.45); }
  .clp-v2.is-r2 .clp-dm-field::before { background: conic-gradient(from 0deg, transparent 0 58%, rgba(255,214,110,.35) 68%, #f2b52f 80%, #ffffff 88%, #ffd36b 92%, transparent 100%), #e6c98a; }
  .clp-v2.is-r3 .clp-dm-field { animation: clp-breathe-violet 2.2s ease-in-out infinite; }
  .clp-v2.is-r3 .clp-dm-field::before { animation-duration: 2.4s;
    background: conic-gradient(from 0deg, transparent 0 22%, #8b5fe0 32%, #f2e6ff 40%, transparent 48% 72%, #6fd0ff 82%, #ffffff 90%, transparent 98%), #3a1673; }
  .clp-v2.is-r4 .clp-dm-field { animation: clp-halo 6s linear infinite; }
  .clp-v2.is-r4 .clp-dm-field::before { animation-duration: 4s;
    background: conic-gradient(from 0deg, rgba(255,255,255,.95) 0 2%, transparent 7% 100%), conic-gradient(from 0deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #8affc1, #ffd36b); }
  .clp-v2.is-r2 .clp-dm-field:focus-within::before, .clp-v2.is-r3 .clp-dm-field:focus-within::before, .clp-v2.is-r4 .clp-dm-field:focus-within::before { animation-duration: 1.6s; }
  @keyframes clp-orbit { to { transform: translate(-50%, -50%) rotate(1turn); } }
  @keyframes clp-breathe-violet { 0%, 100% { box-shadow: 0 0 6px rgba(150,100,255,.35); } 50% { box-shadow: 0 0 14px rgba(170,120,255,.8), 0 0 4px rgba(111,208,255,.6); } }
  @keyframes clp-halo { 0% { box-shadow: 0 0 12px rgba(255,211,107,.6); } 25% { box-shadow: 0 0 14px rgba(255,143,196,.6); } 50% { box-shadow: 0 0 14px rgba(185,140,255,.65); }
    75% { box-shadow: 0 0 14px rgba(127,216,255,.6); } 100% { box-shadow: 0 0 12px rgba(255,211,107,.6); } }
  @media (prefers-reduced-motion: reduce) { .clp-v2 .clp-dm-field, .clp-v2 .clp-dm-field::before { animation: none !important; } }
  .clp-v2 .clp-dm-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 4px; color: #8a7f74; font-size: 12px; }
  .clp-v2 .clp-dm-meta .clp-hint { margin: 0; font-size: 12px; }
  .clp-v2 .clp-dm-meta > span { flex: 0 0 auto; }
  .clp-v2 .clp-colors { gap: 5px; margin: 7px 0 0; font-size: 12.5px; color: #8a7f74; }
  .clp-v2 .clp-label { margin-right: 3px; color: var(--clp-label); font-weight: 700; }
  .clp-v2.is-r4 .clp-label { color: #8a5a1a; }
  .clp-v2 .clp-colors button { width: 20px; height: 20px; border-radius: 50%; }
  .clp-v2 .clp-colors button[aria-pressed="true"] { outline: 2px solid #201c18; outline-offset: 2px; }
  .clp-v2 .clp-colors em { margin-left: 4px; font-size: 12px; }
  .clp-v2 .clp-gifts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin: 7px 0 0; }
  .clp-v2 .clp-gifts[hidden] { display: none; }
  .clp-v2 .clp-gifts button { display: flex; align-items: center; gap: 7px; min-width: 0; height: 30px; padding: 0 10px; border: 1px solid #e0b64a; border-radius: 9px;
    background: linear-gradient(180deg, #fff8e1, #ffefc2); color: #5a3a00; font-family: inherit; font-weight: 800; font-size: 13px; line-height: 1; text-align: left; white-space: nowrap; }
  .clp-v2 .clp-gifts button > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .clp-v2 .clp-gifts button[disabled] { opacity: .7; }
  .clp-v2 .clp-gifts .is-qingzhu { border-color: #7fcf9f; background: linear-gradient(180deg, #effbf3, #d7f3e1); color: #10432a; }
  .clp-v2 .clp-gifts .is-fenglei { border-color: #8fcfee; background: linear-gradient(180deg, #eef9ff, #d6effc); color: #0f3e57; }
  .clp-v2 .clp-gifts .is-zhangtian { border-color: #6fd39b; background: linear-gradient(180deg, #14261f, #0e1c16); color: #c9f7dc; box-shadow: 0 0 10px rgba(90,230,150,.35); }
  .clp-v2 .clp-gifts button.is-locked { border: 1px dashed #cfc5b5; background: #f6f1e8; color: #a59a8d; box-shadow: none; font-weight: 700; opacity: 1; }
  .clp-gifts button.is-used { border-style: solid; background: #efe9df; color: #8a7f74; cursor: default; opacity: 1; }
  .clp-v2 .clp-gifts button.is-used { border: 1px solid #d6cdbf; background: #efe9df; color: #8a7f74; box-shadow: none; }
  .clp-gifts button.is-used small { color: #a4492d; font-weight: 800; }
  .clp-v2 .clp-gifts small { flex: 0 0 auto; margin-left: auto; font-size: 11px; font-weight: 700; }
  /* 电脑上收起时：只留编号、姓名、境界、“展开”和“距下一境界”进度，窄一些、矮一些（学号、班级、“字号”“请假”展开后再看，“注销登录”在展开后的最下面；
     2026-10-22 用户反映收起时点“字号”，弹出的三档被收起的面板遮住，要求“只有在展开的时候才显示请假和字号”） */
  @media (min-width: 701px) {
    .clp-panel.clp-v2.is-folded { width: 290px; }
    .clp-v2.is-folded .clp-head { padding: 8px 14px 7px; }
    .clp-v2.is-folded .clp-sub, .clp-v2.is-folded .clp-acts { display: none; }
    .clp-v2.is-folded [data-cl-font], .clp-v2.is-folded [data-cl-leave], .clp-v2.is-folded .clp-font-pop { display: none; }
  }
  @media (min-width: 701px) {
    .clp-v2 .clp-gifts { display: flex; gap: 5px; }
    .clp-v2 .clp-gifts button { flex: 1 1 auto; justify-content: center; gap: 4px; padding: 0 6px; font-size: 12.5px; }
    .clp-v2 .clp-gifts small { display: none; }
  }
  .clp-v2 .clp-gi { flex: 0 0 auto; display: inline-grid; place-items: center; }
  .clp-v2 .clp-gi-dan { width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 34% 28%, #fff4c4, #ffc23a 40%, #c97300); box-shadow: 0 0 6px rgba(255,190,40,.8);
    color: #7a1a0a; font: 700 11px/1 "Kaiti SC", STKaiti, KaiTi, serif; }
  .clp-v2 .clp-progress { margin: 0; border-top: 1px dashed rgba(70,51,34,.18); }
  .clp-v2 .clp-prog { height: 6px; margin: -1px 0 0; border-radius: 3px; background: #ece4d6; overflow: hidden; }
  .clp-v2 .clp-prog i { display: block; width: 0; height: 100%; border-radius: 3px; background: var(--clp-bar); background-size: 300% 100%; transition: width .4s; }
  .clp-v2.is-r0 .clp-prog i { background: #23655f; }
  .clp-v2 .clp-state { font-size: 12.5px; }
  .clp-v2 .clp-tools { flex-wrap: wrap; gap: 8px; margin-top: 8px; }   /* 手机上字号放大后“导出 PDF”放不下就换行，不被裁掉 */
  .clp-v2 .clp-state:not([data-state]) { display: none; }   /* 操作提示并进进度行右侧的小字；只在有新状态（如全部递交）时显示 */
  .clp-v2 .clp-state[data-state] { margin-top: 6px; }
  .clp-v2 .clp-tools button { height: 34px; padding: 0 11px; border-radius: 10px; white-space: nowrap; }
  .clp-v2 .clp-tools button.is-main { flex: 1 1 auto; font-size: 14.5px; }
  .clp-v2 [data-cl-export-state]:not([data-state]) { display: none; }
  .clp-v2 .clp-foot { position: relative; padding: 8px 14px; border-top: 1px solid rgba(70,51,34,.12); }
  .clp-v2 .clp-mydm { margin: 0; }
  .clp-v2 .clp-mydm summary { padding-right: 132px; }
  .clp-v2 .clp-foot-links { position: absolute; top: 8px; right: 14px; display: flex; gap: 10px; }
  .clp-v2 .clp-foot-links .clp-link { font-size: 13px; }
  /* 注销登录（原头部的“不是我”，2026-10-22 用户要求改名、放到面板最下面） */
  .clp-v2 .clp-out { display: flex; justify-content: flex-end; margin-top: 7px; padding-top: 7px; border-top: 1px dashed rgba(70,51,34,.16); }
  .clp-v2 .clp-out .clp-link { color: #8a7d70; font-size: 13px; }
  /* 手机端收起时只留一个境界小图标（像“使用说明”的问号），点一下展开 */
  .clp-v2 .clp-mini { display: none; position: relative; place-items: center; width: 46px; height: 46px; padding: 0; border: 1px solid #b9b1a3; border-radius: 50%;
    color: #4a443c; background: radial-gradient(circle at 35% 30%, #f1ece2, #d9d4ca 60%, #b9b1a3); box-shadow: 0 6px 16px rgba(0,0,0,.22);
    font: 700 21px/1 "Kaiti SC", STKaiti, KaiTi, serif; cursor: pointer; }
  .clp-v2.is-r1 .clp-mini { color: #f2fffa; border-color: #1f6455; background: radial-gradient(circle at 35% 30%, #9fe3cc, #3fa88d 55%, #2a7d69); text-shadow: 0 1px 1px rgba(10,60,48,.6); }
  .clp-v2.is-r2 .clp-mini { color: #3e2400; border-color: #7a5208; background: radial-gradient(circle at 35% 30%, #fff3c4, #f2c64f 45%, #b8801a); box-shadow: 0 6px 16px rgba(0,0,0,.2), 0 0 10px rgba(240,194,75,.6); }
  .clp-v2.is-r3 .clp-mini { color: #f6eaff; border-color: #d8b8ff; background: radial-gradient(circle at 35% 30%, #8a55ea, #4b1d8f 60%, #3a1673); text-shadow: 0 0 6px rgba(220,190,255,.8); animation: clp-ying 2.4s ease-in-out infinite; }
  .clp-v2.is-r4 .clp-mini { color: #ffe08a; border: 2px solid transparent; background: radial-gradient(circle at 35% 30%, #3a2560, #140d24 70%) padding-box, linear-gradient(90deg, #ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b) border-box;
    background-size: 100% 100%, 300% 100%; box-shadow: 0 6px 16px rgba(0,0,0,.25), 0 0 12px rgba(255,214,110,.6); animation: clp-flow 3s linear infinite; }
  .clp-mini-dot { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; background: #c8452d; }
  .clp-mini-dot[hidden] { display: none; }
  /* 字号：面板头部“字号”按钮弹出三档（live-readable.js 改写页面字号）；未进入课堂的面板直接显示三档 */
  .clp-font-pop { position: absolute; z-index: 6; top: 46px; right: 10px; display: flex; align-items: center; gap: 6px; padding: 8px 10px;
    border: 1px solid rgba(70,51,34,.2); border-radius: 12px; background: #fffdf8; color: #463322; box-shadow: 0 10px 28px rgba(0,0,0,.2); font-size: 13.5px; font-weight: 800; }
  .clp-font-pop[hidden] { display: none; }
  .clp-font-pop button, .clp-gate-font button { min-width: 46px; height: 32px; padding: 0 10px; border: 1px solid #d6cdbf; border-radius: 999px; background: #fff; color: #463322;
    font-family: inherit; font-weight: 800; line-height: 1; cursor: pointer; }
  .clp-font-pop button[data-font="0"], .clp-gate-font button[data-font="0"] { font-size: 13px; }
  .clp-font-pop button[data-font="1"], .clp-gate-font button[data-font="1"] { font-size: 15px; }
  .clp-font-pop button[data-font="2"], .clp-gate-font button[data-font="2"] { font-size: 17px; }
  .clp-font-pop button.is-on, .clp-gate-font button.is-on { border-color: #a4492d; background: #a4492d; color: #fff; }
  .clp-gate-font { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 2px; color: #6d6259; font-size: 13px; font-weight: 700; }
  /* 修为榜：面板头部的金色按钮＋星空弹窗（前三名领奖台、第四名起逐行飞入、本人高亮） */
  .clp-v2 .clp-sub { display: flex; align-items: center; gap: 8px; }
  .clp-v2 .clp-sub > span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clp-audit-tag { margin-left: 6px; padding: 0 7px; border: 1px solid #8a7f74; border-radius: 999px; color: #5b5047; background: #f1ece4; font-size: 12px; font-weight: 800; line-height: 1.6; }
  .clp-audit p { margin: 0; padding: 8px 10px; border-radius: 10px; background: #f3efe8; color: #4a4038; font-size: 13px; line-height: 1.6; }
  .clp-rankbtn[hidden] { display: none; }
  .clp-rankbtn { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px 2px 8px; overflow: hidden; border: 1px solid #b8801a; border-radius: 999px;
    color: #3e2400; background: linear-gradient(180deg, #fff3c4, #f2c64f 55%, #d9a032); box-shadow: 0 0 8px rgba(242,198,79,.45), inset 0 1px 0 rgba(255,255,255,.8);
    font: 800 12.5px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; cursor: pointer; }
  .clp-rankbtn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .clp-rankbtn::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.8) 50%, transparent 65%) -160% 0 / 220% 100% no-repeat; animation: clp-sweep 3.6s ease-in-out 1.2s infinite; }
  @keyframes clp-sweep { to { background-position: 260% 0; } }
  /* 2026-11-05 用户：“‘修炼场’和‘宗门’的按钮也要做和‘修为榜’类似的渐变特效”：上亮下深的渐变、外发光，再加一道斜光扫过（三个按钮依次扫过，像一道光从左到右） */
  .clp-xlbtn { position: relative; overflow: hidden; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; padding: 2px 10px; border: 1px solid #1f5c52; border-radius: 999px;
    color: #fff; background: linear-gradient(180deg, #8bd3bf, #3a8a7b 55%, #1f574d); box-shadow: 0 0 8px rgba(58,160,138,.5), inset 0 1px 0 rgba(255,255,255,.55);
    text-shadow: 0 1px 1px rgba(0,40,30,.35);
    font: 800 12.5px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; cursor: pointer; }
  .clp-sub .clp-xlbtn { margin-left: 6px; }
  /* 2026-11-11：按钮多了“灵根”，四个按钮从学号那一行挪到下面单独一行（窄屏自动折行） */
  .clp-v2 .clp-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 7px; margin-top: 6px; }
  .clp-acts .clp-xlbtn, .clp-acts .clp-sectbtn { margin-left: 0; }
  .clp-lgbtn { position: relative; overflow: hidden; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px 2px 8px; border: 1px solid #8f1d47; border-radius: 999px;
    color: #fff; background: linear-gradient(180deg, #ffb3cf, #e8467f 55%, #a61c4e); box-shadow: 0 0 8px rgba(255,15,107,.42), inset 0 1px 0 rgba(255,255,255,.6);
    text-shadow: 0 1px 1px rgba(80,0,30,.35);
    font: 800 12.5px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; cursor: pointer; }
  .clp-lgbtn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; }
  .clp-lgbtn svg .is-in { fill: currentColor; fill-opacity: .5; stroke: none; }
  .clp-xlbtn::after, .clp-sectbtn::after, .clp-lgbtn::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.7) 50%, transparent 65%) -160% 0 / 220% 100% no-repeat; animation: clp-sweep 3.6s ease-in-out 1.6s infinite; }
  .clp-xlbtn::after { animation-delay: 2s; }
  .clp-sectbtn::after { animation-delay: 2.4s; }
  /* 宗门（2026-11-05）：面板头部的宗门按钮（拜入后显示宗门名和宗门色）＋宗门榜弹窗（沿用修为榜的星空卡片） */
  .clp-sectbtn[hidden] { display: none; }
  .clp-sectbtn { position: relative; overflow: hidden; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; padding: 2px 10px 2px 4px; border: 1px solid rgba(0,0,0,.22); border-radius: 999px;
    color: #fff; background: var(--sc, #5b4a9e);
    background: linear-gradient(180deg, color-mix(in srgb, var(--sc, #5b4a9e) 50%, #fff), var(--sc, #5b4a9e) 55%, color-mix(in srgb, var(--sc, #5b4a9e) 72%, #000));
    box-shadow: 0 0 9px var(--sg, rgba(150,130,230,.5)), inset 0 1px 0 rgba(255,255,255,.55); text-shadow: 0 1px 1px rgba(0,0,0,.3);
    font: 800 12.5px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; cursor: pointer; }
  .clp-sectbtn > span:first-child, .clp-sect-dot, .clp-sect-emb { display: inline-grid; place-items: center; border-radius: 50%; font-family: "Kaiti SC", STKaiti, KaiTi, serif; font-weight: 900; font-style: normal; }
  .clp-sectbtn > span:first-child { width: 17px; height: 17px; background: rgba(255,255,255,.94); color: var(--sc, #5b4a9e); font-size: 11.5px; line-height: 1; text-shadow: none; }
  .clp-sectbtn.is-sanxiu { background: linear-gradient(180deg, #b1a79b, #6f665c 55%, #4d463f); box-shadow: 0 0 6px rgba(111,102,92,.4), inset 0 1px 0 rgba(255,255,255,.45); }
  .clp-sect-dot { flex: 0 0 auto; width: 17px; height: 17px; margin-left: 4px; background: var(--sc); color: #fff; font-size: 10.5px; line-height: 1; vertical-align: 1px; box-shadow: 0 0 6px var(--sg); }
  .clp-sect-welcome { margin: 4px 0 8px; padding: 9px 12px; border-radius: 12px; background: linear-gradient(100deg, rgba(255,211,107,.26), rgba(185,140,255,.14)); color: #ffe8a8; font-size: 13.5px; font-weight: 700; line-height: 1.6; }
  .clp-sect-list { display: grid; gap: 10px; margin: 6px 0 0; padding: 0; list-style: none; }
  .clp-sect-row { display: grid; grid-template-columns: 24px 44px minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
    background: linear-gradient(100deg, var(--sa), rgba(255,255,255,.03) 70%); animation: clp-rank-in .5s ease both; animation-delay: calc(var(--i, 0) * 90ms); }
  .clp-sect-row.is-mine { border-color: rgba(255,211,107,.8); box-shadow: 0 0 16px rgba(255,211,107,.28); }
  .clp-sect-emb { width: 44px; height: 44px; background: radial-gradient(circle at 35% 30%, var(--sg), var(--sc) 62%); color: #fff; font-size: 22px; line-height: 1;
    box-shadow: 0 0 14px var(--sg), inset 0 0 0 2px rgba(255,255,255,.55); text-shadow: 0 1px 2px rgba(0,0,0,.35); }
  .clp-sect-main { min-width: 0; }
  .clp-sect-main strong { display: block; color: #fff; font: 900 19px/1.3 "Kaiti SC", STKaiti, KaiTi, serif; letter-spacing: .08em; }
  .clp-sect-main strong small { margin-left: 6px; padding: 0 7px; border-radius: 999px; background: #ffd36b; color: #3e2400; font: 800 11px/1.6 -apple-system, "PingFang SC", sans-serif; letter-spacing: 0; vertical-align: 2px; }
  .clp-sect-motto { display: block; margin-top: 2px; color: rgba(244,236,255,.72); font-size: 12px; line-height: 1.5; }
  .clp-sect-way { display: block; color: rgba(244,236,255,.5); font-size: 11.5px; }
  .clp-sect-meta { display: block; margin-top: 3px; color: rgba(255,232,168,.85); font-size: 12px; font-weight: 700; }
  .clp-sect-pts { align-self: start; padding-top: 2px; text-align: right; color: #ffd36b; font: 800 18px/1.2 Georgia, "Times New Roman", serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .clp-sect-pts small { display: block; margin-top: 3px; color: rgba(244,236,255,.62); font: 600 11px/1.4 -apple-system, "PingFang SC", sans-serif; }
  .clp-sect-act { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .clp-sect-act p { flex: 1 1 100%; margin: 2px 0 0; color: #ffe8a8; font-size: 12.5px; line-height: 1.55; }
  .clp-sect-act button, .clp-sect-mine button { padding: 6px 14px; border: 1px solid rgba(255,255,255,.35); border-radius: 999px; background: rgba(255,255,255,.08); color: #f4ecff;
    font-family: inherit; font-weight: 800; font-size: 13px; line-height: 1.2; cursor: pointer; }
  .clp-sect-act button.is-go { border-color: var(--sg); background: var(--sc); color: #fff; box-shadow: 0 0 10px var(--sg); }
  .clp-sect-act button:disabled, .clp-sect-mine button:disabled { opacity: .55; cursor: default; }
  .clp-sect-mine { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .clp-sect-mine span { flex: 1 1 200px; }
  .clp-sect-gate { position: relative; overflow: hidden; border-color: #ffd36b !important; background: linear-gradient(180deg, #fff3c4, #f2c64f 55%, #d9a032) !important; color: #3e2400 !important;
    box-shadow: 0 0 12px rgba(242,198,79,.5); }
  .clp-sect-gate::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.75) 50%, transparent 65%) -160% 0 / 220% 100% no-repeat;
    animation: clp-sweep 3.6s ease-in-out 1s infinite; }
  @media (max-width: 420px) { .clp-sect-row { grid-template-columns: 22px 38px minmax(0, 1fr) auto; gap: 4px 8px; padding: 9px 10px; } .clp-sect-emb { width: 38px; height: 38px; font-size: 19px; } .clp-sect-main strong { font-size: 17px; } }
  .clp-rank-link { display: inline-flex; align-items: center; gap: 5px; margin: 6px 0 2px; padding: 4px 12px; border: 1px solid #b8801a; border-radius: 999px;
    color: #3e2400; background: linear-gradient(180deg, #fff3c4, #f2c64f); font-family: inherit; font-weight: 800; font-size: 13px; line-height: 1.5; cursor: pointer; }
  .clp-rank-link svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .clp-rank-modal { background: rgba(8,6,16,.62); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  .clp-rank-card { position: relative; isolation: isolate; width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 16px 18px 18px; border: 1px solid rgba(255,214,110,.35); border-radius: 18px;
    color: #f4ecff; background: radial-gradient(ellipse at 50% -10%, #43307a 0%, #1a1233 46%, #0b0914 100%);
    box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 40px rgba(185,140,255,.2); font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-rank-stars { position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit;
    background-image: radial-gradient(1.3px 1.3px at 12% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 28% 62%, #ffe8a8 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 46% 9%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 66% 40%, #cfe6ff 50%, transparent 51%),
      radial-gradient(1.4px 1.4px at 86% 20%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 92% 72%, #ffd6f0 50%, transparent 51%),
      radial-gradient(1.2px 1.2px at 7% 86%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 58% 92%, #fff 50%, transparent 51%);
    background-size: 220px 260px; animation: clp-twinkle 3.2s ease-in-out infinite; }
  .clp-rank-stars.is-b { background-position: 90px 130px; animation-delay: 1.6s; }
  .clp-rank-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .clp-rank-head span { color: rgba(244,236,255,.66); font-size: 12.5px; letter-spacing: .06em; }
  .clp-rank-head h3 { margin: 0; font: 900 30px/1.25 "Kaiti SC", STKaiti, KaiTi, serif; letter-spacing: .2em; color: #ffd36b;
    background: linear-gradient(90deg, #fff3c4, #ffd36b 30%, #ff9fd0 50%, #ffd36b 70%, #fff3c4) 0 0 / 220% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 10px rgba(255,200,90,.45)); animation: clp-rank-shine 4s linear infinite; }
  @keyframes clp-rank-shine { to { background-position: -220% 0; } }
  .clp-rank-head button { flex: 0 0 auto; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.22); border-radius: 50%; background: rgba(255,255,255,.06); color: #f4ecff; font-size: 20px; line-height: 1; cursor: pointer; }
  .clp-rank-meta { margin: 0 0 4px; color: rgba(244,236,255,.6); font-size: 12px; }
  .clp-podium { display: grid; grid-template-columns: 1fr 1.18fr 1fr; align-items: end; gap: 8px; margin: 30px 0 12px; }
  .clp-pod { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0;
    animation: clp-pod-in .65s cubic-bezier(.2,.9,.3,1.25) both; animation-delay: calc(var(--d, 0) * .18s + .25s); }
  @keyframes clp-pod-in { from { opacity: 0; transform: translateY(26px) scale(.85); } }
  .clp-pod.is-empty { visibility: hidden; }
  .clp-ava, .clp-rank-ava { position: relative; display: grid; place-items: center; border-radius: 50%; font-family: "Kaiti SC", STKaiti, KaiTi, serif; font-weight: 800; }
  .clp-ava { width: 52px; height: 52px; font-size: 24px; }
  .clp-pod.is-1 .clp-ava { width: 68px; height: 68px; font-size: 32px; }
  .clp-ava::before { content: ''; position: absolute; inset: -7px; z-index: -1; border-radius: 50%; opacity: 0;
    background: conic-gradient(#ffd36b, #ff8fc4, #b98cff, #7fd8ff, #ffd36b); filter: blur(2px); animation: clp-rank-spin 5s linear infinite; }
  @keyframes clp-rank-spin { to { transform: rotate(1turn); } }
  .clp-pod.is-1 .clp-ava::before { opacity: 1; }
  .clp-pod.is-1 .clp-ava { box-shadow: 0 0 0 3px #ffd36b, 0 0 26px rgba(255,211,107,.8); }
  .clp-pod.is-2 .clp-ava { box-shadow: 0 0 0 3px #dfe3ec, 0 0 16px rgba(220,226,240,.55); }
  .clp-pod.is-3 .clp-ava { box-shadow: 0 0 0 3px #d79a63, 0 0 16px rgba(215,154,99,.5); }
  .clp-ava.is-r0, .clp-rank-ava.is-r0 { color: #4a443c; background: radial-gradient(circle at 35% 30%, #f1ece2, #d9d4ca 60%, #b9b1a3); }
  .clp-ava.is-r1, .clp-rank-ava.is-r1 { color: #f2fffa; background: radial-gradient(circle at 35% 30%, #9fe3cc, #3fa88d 55%, #2a7d69); text-shadow: 0 1px 1px rgba(10,60,48,.6); }
  .clp-ava.is-r2, .clp-rank-ava.is-r2 { color: #3e2400; background: radial-gradient(circle at 35% 30%, #fff3c4, #f2c64f 45%, #b8801a); }
  .clp-ava.is-r3, .clp-rank-ava.is-r3 { color: #f6eaff; background: radial-gradient(circle at 35% 30%, #8a55ea, #4b1d8f 60%, #3a1673); text-shadow: 0 0 6px rgba(220,190,255,.8); }
  .clp-ava.is-r4, .clp-rank-ava.is-r4 { color: #ffe08a; background: radial-gradient(circle at 35% 30%, #4a3478, #140d24 72%); text-shadow: 0 0 8px rgba(255,214,110,.9); }
  .clp-crown { position: absolute; z-index: 2; top: -30px; left: 50%; width: 48px; transform: translateX(-50%) rotate(-8deg); filter: drop-shadow(0 0 8px rgba(255,211,107,.85)); animation: clp-crown 2.6s ease-in-out infinite; }
  .clp-crown svg { display: block; width: 100%; height: auto; }
  @keyframes clp-crown { 50% { transform: translateX(-50%) translateY(-4px) rotate(5deg); } }
  .clp-pod-name { max-width: 100%; overflow: hidden; color: #fff; font-size: 14.5px; text-overflow: ellipsis; white-space: nowrap; }
  .clp-pod.is-1 .clp-pod-name { color: #ffe8a8; font-size: 16px; text-shadow: 0 0 10px rgba(255,211,107,.6); }
  .clp-pod .clp-realm, .clp-rank-row .clp-realm, .clp-rank-mine .clp-realm { margin: 0; font-size: 12px; cursor: default; white-space: nowrap; }
  .clp-pod-base { position: relative; display: grid; place-items: center; width: 100%; margin-top: 3px; overflow: hidden; border-radius: 10px 10px 4px 4px;
    transform-origin: bottom; animation: clp-base-up .7s cubic-bezier(.2,.9,.3,1) both; animation-delay: calc(var(--d, 0) * .18s); }
  @keyframes clp-base-up { from { transform: scaleY(0); } }
  .clp-pod.is-1 .clp-pod-base { height: 78px; background: linear-gradient(180deg, #ffe7a3, #f2c64f 40%, #a8720f); box-shadow: 0 0 24px rgba(255,200,80,.5), inset 0 2px 0 rgba(255,255,255,.7); }
  .clp-pod.is-2 .clp-pod-base { height: 56px; background: linear-gradient(180deg, #f6f8fc, #c3c9d6 45%, #7f8796); box-shadow: inset 0 2px 0 rgba(255,255,255,.8); }
  .clp-pod.is-3 .clp-pod-base { height: 42px; background: linear-gradient(180deg, #f7d2ac, #d79a63 45%, #8e5528); box-shadow: inset 0 2px 0 rgba(255,255,255,.6); }
  .clp-pod-base::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%) -160% 0 / 220% 100% no-repeat;
    animation: clp-sweep 3.2s ease-in-out 1.4s infinite; }
  .clp-pod-base em { font: italic 900 30px/1 Georgia, "Times New Roman", serif; color: rgba(60,36,0,.78); text-shadow: 0 1px 0 rgba(255,255,255,.6); }
  .clp-pod.is-1 .clp-pod-base em { font-size: 40px; }
  .clp-pod.is-2 .clp-pod-base em { color: rgba(40,46,60,.75); }
  .clp-pod-name i, .clp-rank-name i { margin-left: 4px; padding: 0 6px; border-radius: 999px; background: #c8452d; color: #fff; font: 800 11px/1.6 -apple-system, "PingFang SC", sans-serif; font-style: normal; vertical-align: 2px; }
  .clp-pod.is-me .clp-ava { outline: 2px dashed #ffd36b; outline-offset: 5px; }
  .clp-rank-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .clp-rank-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px;
    background: linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); animation: clp-row-in .45s ease both; animation-delay: calc(.8s + var(--i, 0) * .08s); }
  @keyframes clp-row-in { from { opacity: 0; transform: translateX(-22px); } }
  .clp-rank-no { flex: 0 0 26px; color: rgba(244,236,255,.75); font: italic 900 19px/1 Georgia, "Times New Roman", serif; text-align: center; }
  .clp-rank-ava { flex: 0 0 30px; width: 30px; height: 30px; font-size: 15px; }
  .clp-pod-pts { color: #ffe39a; font: 800 14px/1.2 Georgia, "Times New Roman", serif; letter-spacing: .02em; text-shadow: 0 0 8px rgba(255,211,107,.45); white-space: nowrap; }
  .clp-pod-pts small, .clp-rank-pts small { font: 600 10.5px/1 -apple-system, "PingFang SC", sans-serif; color: rgba(255,236,190,.75); }
  .clp-rank-pts { flex: 0 0 auto; color: #ffd36b; font: 800 14.5px/1 Georgia, "Times New Roman", serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .clp-rank-name { flex: 1 1 auto; min-width: 0; overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .clp-rank-row.is-me { border-color: rgba(255,211,107,.75); background: linear-gradient(90deg, rgba(255,211,107,.24), rgba(255,211,107,.05)); box-shadow: 0 0 16px rgba(255,211,107,.28); }
  .clp-rank-mine { margin: 12px 0 0; padding: 10px 12px; border: 1px dashed rgba(255,211,107,.55); border-radius: 12px; background: rgba(255,211,107,.08); color: #ffe8a8; font-weight: 700; }
  .clp-rank-note { margin: 10px 0 0; color: rgba(244,236,255,.5); font-size: 11.5px; line-height: 1.55; }
  /* 修为榜隐匿姓名（2026-10-30）：本人的名字可以点（结丹以上），说明行带切换按钮 */
  button.clp-rank-hide { padding: 0; border: 0; border-bottom: 1px dashed rgba(255,211,107,.6); background: none; color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
  button.clp-rank-hide:hover { color: #ffd36b; } button.clp-rank-hide:disabled { opacity: .6; cursor: default; }
  .clp-pod button.clp-rank-hide { font-size: 14.5px; } .clp-pod.is-1 button.clp-rank-hide { color: #ffe8a8; font-size: 16px; }
  .clp-rank-privacy { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 10px 0 0; color: rgba(244,236,255,.75); font-size: 12.5px; line-height: 1.6; }
  .clp-rank-privacy button { padding: 4px 12px; border: 1px solid rgba(255,211,107,.6); border-radius: 999px; background: rgba(255,211,107,.12); color: #ffe8a8; font: 700 12.5px/1.4 -apple-system, "PingFang SC", sans-serif; cursor: pointer; }
  .clp-rank-privacy button:hover { background: rgba(255,211,107,.25); } .clp-rank-privacy button:disabled { opacity: .6; cursor: default; }
  .clp-rank-state { margin: 28px 0 20px; color: rgba(244,236,255,.82); text-align: center; }
  /* 灵根八相（2026-11-11）：沿用修为榜的星空卡片；八边形雷达（粉＝本人，青＝全班平均）＋所长/待补＋八项明细 */
  .clp-lg-card { width: min(500px, 100%); }
  .clp-lg-intro { margin: 2px 0 0; color: rgba(244,236,255,.74); font-size: 12.5px; line-height: 1.65; }
  .clp-lg-keys { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; margin: 10px 0 0; color: rgba(244,236,255,.86); font-size: 12.5px; }
  .clp-lg-keys i { display: inline-block; width: 16px; height: 10px; margin-right: 6px; border-radius: 3px; vertical-align: -1px; }
  .clp-lg-keys i.is-me { background: rgba(255,15,107,.45); box-shadow: inset 0 0 0 2px #FF0F6B; }
  .clp-lg-keys i.is-avg { background: rgba(34,193,220,.3); box-shadow: inset 0 0 0 2px #22C1DC; }
  .clp-lg-radar { display: block; width: 100%; max-width: 380px; height: auto; margin: 2px auto 0; overflow: visible; }
  .clp-lg-radar .is-ring { fill: none; stroke: rgba(255,255,255,.13); stroke-width: 1; }
  .clp-lg-radar .is-rim { fill: rgba(255,255,255,.03); stroke: rgba(255,214,110,.5); stroke-width: 1.2; }
  .clp-lg-radar .is-name { fill: #ffe8a8; font: 800 15px/1 "Kaiti SC", STKaiti, KaiTi, serif; letter-spacing: .08em; }
  .clp-lg-radar .is-what { fill: rgba(244,236,255,.58); font: 500 10.5px/1 -apple-system, "PingFang SC", sans-serif; }
  .clp-lg-shape { animation: clp-lg-grow .9s cubic-bezier(.2,.9,.3,1.15) both; }
  .clp-lg-shape.is-me { animation-delay: .35s; }
  @keyframes clp-lg-grow { from { opacity: 0; transform: scale(.15); } }
  .clp-lg-shape.is-avg polygon { fill: rgba(34,193,220,.2); stroke: #22C1DC; stroke-width: 1.8; stroke-linejoin: round; stroke-dasharray: 5 3; }
  .clp-lg-shape.is-avg circle { fill: #22C1DC; }
  .clp-lg-shape.is-me polygon { fill: url(#clp-lg-me); stroke: #FF0F6B; stroke-width: 2.2; stroke-linejoin: round; filter: drop-shadow(0 0 6px rgba(255,15,107,.7)); }
  .clp-lg-shape.is-me circle { fill: #fff; stroke: #FF0F6B; stroke-width: 2; }
  .clp-lg-verdict { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 0; }
  .clp-lg-verdict section { min-width: 0; padding: 9px 11px; border: 1px solid; border-radius: 12px; }
  .clp-lg-verdict .is-good { border-color: rgba(126,211,33,.45); background: linear-gradient(135deg, rgba(126,211,33,.16), rgba(34,193,220,.07)); }
  .clp-lg-verdict .is-weak { border-color: rgba(255,138,0,.5); background: linear-gradient(135deg, rgba(255,138,0,.16), rgba(255,15,107,.07)); }
  .clp-lg-verdict h4 { margin: 0; font: 900 17px/1.3 "Kaiti SC", STKaiti, KaiTi, serif; letter-spacing: .2em; }
  .clp-lg-verdict .is-good h4 { color: #c4f08a; } .clp-lg-verdict .is-weak h4 { color: #ffc680; }
  .clp-lg-lead { margin: 2px 0 4px; color: rgba(244,236,255,.66); font-size: 11.5px; }
  .clp-lg-verdict ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; line-height: 1.55; }
  .clp-lg-verdict li b { margin-right: 3px; color: #fff; font: 800 15px/1.2 "Kaiti SC", STKaiti, KaiTi, serif; }
  .clp-lg-verdict li small { margin-right: 6px; color: rgba(244,236,255,.6); font-size: 11px; }
  .clp-lg-verdict li span { color: rgba(244,236,255,.84); }
  .clp-lg-list { display: grid; gap: 5px; margin: 12px 0 0; padding: 0; list-style: none; }
  .clp-lg-row { display: grid; grid-template-columns: 82px minmax(60px, 1fr) minmax(0, auto); align-items: center; gap: 2px 10px; padding: 6px 10px; border: 1px solid rgba(255,255,255,.07); border-radius: 10px;
    background: linear-gradient(90deg, rgba(255,255,255,.07), rgba(255,255,255,.015)); animation: clp-row-in .45s ease both; animation-delay: calc(.6s + var(--i, 0) * .06s); }
  .clp-lg-name { white-space: nowrap; } .clp-lg-name b { color: #ffe8a8; font: 800 16px/1.2 "Kaiti SC", STKaiti, KaiTi, serif; } .clp-lg-name small { margin-left: 5px; color: rgba(244,236,255,.58); font-size: 11px; }
  .clp-lg-bar { position: relative; height: 8px; border-radius: 4px; background: rgba(255,255,255,.1); }
  .clp-lg-bar i.is-me { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(90deg, #ff7aa8, #FF0F6B); box-shadow: 0 0 8px rgba(255,15,107,.55); }
  .clp-lg-bar i.is-avg { position: absolute; top: -3px; bottom: -3px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: #22C1DC; box-shadow: 0 0 0 1px rgba(11,9,20,.8); }
  .clp-lg-val { text-align: right; white-space: nowrap; font-size: 12px; } .clp-lg-val b { color: #fff; font: 800 15px/1 Georgia, "Times New Roman", serif; font-variant-numeric: tabular-nums; }
  .clp-lg-val small { display: block; color: rgba(244,236,255,.55); font-size: 10.5px; }
  @media (max-width: 460px) {
    .clp-lg-verdict { grid-template-columns: 1fr; }
    .clp-lg-row { grid-template-columns: 1fr auto; } .clp-lg-bar { grid-column: 1 / -1; grid-row: 2; }
  }
  @media (max-width: 420px) {
    .clp-rank-card { padding: 14px 12px 16px; }
    .clp-ava { width: 44px; height: 44px; font-size: 20px; }
    .clp-pod.is-1 .clp-ava { width: 56px; height: 56px; font-size: 26px; }
    .clp-pod .clp-realm { font-size: 11px; padding: 0 5px; }
  }
  @media (prefers-reduced-motion: reduce) { .clp-rank-card, .clp-rank-card *, .clp-rankbtn::after, .clp-xlbtn::after, .clp-sectbtn::after, .clp-lgbtn::after { animation: none !important; } }
  /* 2026-11-06：手机横着拿（高度很小）时，收起的面板也只剩小圆图标，不再是一长条压在正文上 */
  @media (max-width: 700px), (orientation: landscape) and (max-height: 520px) {
    .clp-panel.clp-v2.is-folded { width: auto; max-height: none; padding: 0; border: 0; background: none; box-shadow: none; overflow: visible; animation: none; }
    .clp-panel.clp-v2.is-folded > :not(.clp-mini) { display: none; }
    .clp-panel.clp-v2.is-folded > .clp-mini { display: grid; }
  }
  /* 老师点赞：本人页面上盖一枚「师赞」朱印 */
  .clp-zan { position: fixed; z-index: 2147483001; left: 50%; top: 42%; display: grid; justify-items: center; gap: 12px; transform: translate(-50%, -50%); pointer-events: none; }
  .clp-zan-seal { display: grid; place-items: center; width: 116px; height: 116px; border: 5px solid #c8281e; border-radius: 14px; color: #c8281e; background: rgba(255,244,224,.94);
    box-shadow: inset 0 0 0 4px rgba(255,244,224,.94), inset 0 0 0 7px #c8281e, 0 14px 34px rgba(0,0,0,.28); font: 700 42px/1.05 "Kaiti SC", STKaiti, KaiTi, serif; text-align: center;
    animation: clp-zan-stamp 2.8s ease-out forwards; }
  .clp-zan-text { max-width: min(86vw, 380px); padding: 8px 14px; border-radius: 10px; background: rgba(32,28,24,.9); color: #fff4e0; text-align: center;
    font: 800 14.5px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; animation: clp-zan-fade 2.8s ease-out forwards; }
  .clp-zan-text small { display: block; color: #e6c98e; font-weight: 700; font-size: 12.5px; }
  @keyframes clp-zan-stamp { 0% { transform: scale(2.4) rotate(-26deg); opacity: 0; } 16% { transform: scale(.9) rotate(-14deg); opacity: 1; } 24% { transform: scale(1.05) rotate(-14deg); }
    30%, 82% { transform: scale(1) rotate(-14deg); opacity: 1; } 100% { transform: scale(1) rotate(-14deg); opacity: 0; } }
  @keyframes clp-zan-fade { 0%, 14% { opacity: 0; transform: translateY(8px); } 28%, 82% { opacity: 1; transform: none; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .clp-v2, .clp-v2 * { animation: none !important; } .clp-zan-seal { animation: clp-zan-fade 2.8s ease-out forwards; transform: rotate(-14deg); } }
  #clp-print-view { display: none; }
  @media print {
    .clp-panel, .clp-q { display: none !important; }
    body.clp-printing > *:not(#clp-print-view) { display: none !important; }
    body.clp-printing #clp-print-view { display: block !important; }
  }
  .clp-poll { position: fixed; left: 50%; bottom: 24px; z-index: 2147482000; width: min(520px, calc(100vw - 28px)); box-sizing: border-box; transform: translateX(-50%);
    padding: 18px 20px 16px; border: 1px solid rgba(70,51,34,.14); border-radius: 18px; background: #fffdf8; color: #201c18;
    box-shadow: 0 24px 60px rgba(32,28,24,.28), 0 0 0 4px rgba(232,196,106,.35); font-family: -apple-system, "PingFang SC", sans-serif; animation: clpPollIn .35s ease; }
  .clp-poll[hidden] { display: none; }
  @keyframes clpPollIn { from { opacity: 0; transform: translate(-50%, 24px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .clp-poll-x { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 1px solid rgba(70,51,34,.18); border-radius: 50%; background: #fff; color: #6d6259; font-size: 20px; line-height: 1; cursor: pointer; }
  .clp-poll-kicker { margin: 0 40px 4px 0; color: #a4492d; font-weight: 800; font-size: 14px; letter-spacing: .06em; }
  .clp-poll h3 { margin: 0 40px 12px 0; font-size: 1.15em; line-height: 1.45; }
  .clp-poll-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
  .clp-poll-options button { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 64px; padding: 10px 8px;
    border: 2px solid var(--c); border-radius: 14px; background: #fff; color: var(--c); font-family: inherit; font-weight: 800; font-size: 1.15em; line-height: 1.2; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
  .clp-poll-options button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,.1); }
  .clp-poll-options button[aria-pressed="true"] { background: var(--c); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 6px 14px rgba(0,0,0,.14); }
  .clp-poll-options button:disabled { cursor: default; }
  .clp-poll-options button span, .clp-poll-options button b { position: relative; z-index: 1; }
  .clp-poll-options button b { font-size: .62em; font-weight: 700; }
  .clp-poll-options.has-result button { color: #201c18; background: #f4ede3; }
  .clp-poll-options.has-result button[aria-pressed="true"] { color: #201c18; box-shadow: inset 0 0 0 2px var(--c); }
  .clp-poll-options.has-result button i { position: absolute; inset: 0 auto 0 0; background: var(--c); opacity: .22; }
  .clp-poll-note { margin: 10px 0 0; color: #6d6259; font-size: .9em; text-align: center; }
  ${worksheet ? `
  form.cl-mcq > .cl-actions { display: none !important; }
  .cl-exit [data-action="submit"], .cl-exit [data-action="reset"], .cl-export, .cl-overview-exit { display: none !important; }
  .clp-exam-due { margin: 10px 0; padding: 9px 14px; border-left: 4px solid #a87a2a; border-radius: 8px; background: #fbf3e2; color: #6b4d14; font-weight: 700; }
  .clp-exam-due.is-over { border-left-color: #a4492d; background: #f5e7df; color: #a4492d; }
  .clp-exam-due.is-soon { border-left-color: #c0502a; background: #fdece3; color: #a33c1c; }
  .clp-exam-clock { display: grid; gap: 12px; margin: 4px 0 18px; padding: 18px 22px; border: 1px solid #e6d3a3; border-left: 6px solid #b8913a; border-radius: 14px;
    background: linear-gradient(135deg, #fdf8ea, #f7ecd2); color: #4a3510; box-shadow: 0 6px 18px rgba(120, 90, 30, .1); }
  .clp-exam-clock[hidden], .clp-exam-clock [hidden] { display: none !important; }
  .clp-exam-clock-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; }
  .clp-exam-clock-head b { padding: 2px 10px; border-radius: 999px; background: #2e4a70; color: #fff; font-size: .9em; letter-spacing: .12em; }
  .clp-exam-clock-head strong { color: #201c18; font-size: 1.5em; font-weight: 800; line-height: 1.3; }
  .clp-exam-clock-left { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .clp-exam-clock-left > span:first-child { color: #6b4d14; font-weight: 700; }
  .clp-exam-clock-units { display: flex; flex-wrap: wrap; gap: 6px; }
  .clp-exam-clock-units i { display: inline-flex; align-items: baseline; justify-content: center; gap: 3px; min-width: 3.6em; padding: 6px 10px; border-radius: 10px;
    background: #2e4a70; color: #fff; font-style: normal; box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .18); }
  .clp-exam-clock-units b { font-size: 1.55em; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .clp-exam-clock-units small { font-size: .8em; font-weight: 700; opacity: .85; }
  .clp-exam-clock-note { margin: 0; color: #6b4d14; font-size: .95em; line-height: 1.6; }
  .clp-exam-clock.is-soon { border-color: #efc2ab; border-left-color: #c0502a; background: linear-gradient(135deg, #fff3ec, #fbdfd0); }
  .clp-exam-clock.is-soon .clp-exam-clock-units i { background: #b4432a; }
  .clp-exam-clock.is-soon .clp-exam-clock-units i:last-child { animation: clp-due-pulse 1s ease-in-out infinite; }
  .clp-exam-clock.is-soon .clp-exam-clock-note { color: #a33c1c; font-weight: 700; }
  .clp-exam-clock.is-over { border-color: #e3bfb2; border-left-color: #a4492d; background: #f5e7df; }
  .clp-exam-clock.is-over .clp-exam-clock-head b { background: #a4492d; }
  .clp-exam-clock.is-over .clp-exam-clock-note { color: #a4492d; font-weight: 700; }
  .clp-exam-clock.is-done { border-color: #bcd9c9; border-left-color: #2f7a55; background: linear-gradient(135deg, #f1f8f3, #e3f0e8); }
  .clp-exam-clock.is-done .clp-exam-clock-head b { background: #2f7a55; }
  .clp-exam-clock.is-done .clp-exam-clock-units i { background: #5f8a74; }
  .clp-exam-clock.is-done .clp-exam-clock-note { color: #2f7a55; font-weight: 700; }
  @keyframes clp-due-pulse { 50% { transform: scale(1.06); } }
  @media (prefers-reduced-motion: reduce) { .clp-exam-clock .clp-exam-clock-units i { animation: none !important; } }
  @media (max-width: 520px) {
    .clp-exam-clock { padding: 14px 14px 14px 16px; }
    .clp-exam-clock-head strong { font-size: 1.25em; }
    .clp-exam-clock-units i { min-width: 0; padding: 5px 7px; }
    .clp-exam-clock-units b { font-size: 1.3em; }
  }` : ''}
  `;
  document.head.appendChild(style);

  // 全屏答题与手机横屏（2026-11-05）：单独一张样式表，不随“字号”档位缩放（data-readable=skip）
  const fsStyle = document.createElement('style');
  fsStyle.dataset.readable = 'skip';
  fsStyle.textContent = `
  .clp-q-fs { flex: 0 0 auto; min-height: 44px; padding: 0 14px; border: 1.5px solid rgba(35,101,95,.45); border-radius: 10px; background: #fff; color: #23655f;
    font: 800 14px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
  .clp-q-fs:active { transform: translateY(1px); }
  /* 窄屏：第一行只有“递交”（右上角是“我的备注”），第二行状态文字＋“⤢ 全屏”。
     2026-11-06 用户截图：状态文字（如旁听说明）挤到第一行，被“我的备注”盖住——用 .clp-q-br 强制换行 */
  .clp-q-br { display: none; }
  @media (max-width: 640px) {
    .clp-q-row .clp-q-br { display: block; flex: 0 0 100%; height: 0; order: 2; }
    .clp-q-row .clp-q-state { order: 3; flex: 1 1 0 !important; min-width: 0; }
    .clp-q-fs { order: 4; margin-left: auto; min-height: 38px; padding: 0 12px; font-size: 13.5px; }
    .clp-q-send[hidden] ~ .clp-q-br { display: none; }
    .clp-q-send[hidden] ~ .clp-q-state { flex-basis: calc(100% - 120px) !important; margin-right: 108px; }   /* 已递交：状态在第一行（让出“我的备注”的位置），“⤢ 全屏”换到下一行 */
  }
  .clp-v2 .clp-tools button.clp-fs-entry { border-color: #b8801a; color: #5a3a00; background: linear-gradient(180deg, #fff3c4, #f2c64f); }
  /* 电脑上（鼠标、宽屏）不显示全屏答题的入口 */
  @media (hover: hover) and (pointer: fine) and (min-width: 900px) { .clp-q-fs, .clp-fs-entry { display: none !important; } }
  /* ---- 全屏答题：只显示当前这道题 ---- */
  html.clp-fs { --fs-top: 52px; --fs-bottom: 74px; }
  html.clp-fs, html.clp-fs body { background: #f4efe6 !important; }
  html.clp-fs body { margin: 0 !important; min-height: 100vh; padding: calc(var(--fs-top) + 8px + env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) calc(var(--fs-bottom) + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left)) !important; box-sizing: border-box; }
  html.clp-fs body > [data-fs-hide] { display: none !important; }
  html.clp-fs [data-fs-path]:not(body) > :not([data-fs-path]):not([data-fs-on]) { display: none !important; }
  html.clp-fs [data-fs-path]:not(body) { display: block !important; position: static !important; float: none !important; width: auto !important; max-width: none !important; min-width: 0 !important;
    height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: transparent !important;
    box-shadow: none !important; transform: none !important; filter: none !important; overflow: visible !important; animation: none !important; opacity: 1 !important; columns: auto !important; }
  html.clp-fs [data-fs-path]::before, html.clp-fs [data-fs-path]::after { display: none !important; }
  html.clp-fs [data-fs-root][data-fs-path] { display: flex !important; flex-direction: column; justify-content: center;
    min-height: calc(100vh - var(--fs-top) - var(--fs-bottom) - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important;
    min-height: calc(100dvh - var(--fs-top) - var(--fs-bottom) - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important; }
  html.clp-fs [data-fs-on] { max-width: 1040px !important; margin-left: auto !important; margin-right: auto !important; zoom: var(--fs-zoom, 1); }
  html.clp-fs [data-fs-on]:not(.clp-q) { margin-top: 0 !important; }
  html.clp-fs .clp-q-fs, html.clp-fs .cl-zoom-btn { display: none !important; }
  /* 2026-11-06 用户：“横屏的时候，‘递交’和‘我的备注’按钮放在最下方的中间，不然有时候会被‘上一题’按钮挡住”：
     全屏答题里递交条改成居中排布——递交、我的备注同一行居中，状态文字、展开的备注和解答在下面占满一行 */
  html.clp-fs .clp-q { display: flex !important; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px 12px; }
  html.clp-fs .clp-q > .clp-q-row:not([hidden]) { display: contents; }
  html.clp-fs .clp-q-send { order: 1; }
  html.clp-fs .clp-q-br { display: none !important; }
  html.clp-fs .clp-q > .clp-note { order: 2; margin: 0 !important; }
  html.clp-fs .clp-q > .clp-note > summary { position: static !important; }
  html.clp-fs .clp-q > .clp-note[open] { flex: 1 1 100%; text-align: center; }
  html.clp-fs .clp-q > .clp-note[open] textarea { text-align: left; }
  html.clp-fs .clp-q-row .clp-q-state { order: 3; flex: 1 1 100% !important; margin: 0 !important; text-align: center; }
  html.clp-fs .clp-q > :not(.clp-q-row):not(.clp-note) { order: 4; flex: 1 1 100%; }
  .clp-fs-ui { position: fixed; inset: 0; z-index: 2147481000; pointer-events: none; color: #201c18; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-fs-ui[hidden] { display: none; }
  .clp-fs-top { pointer-events: auto; position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 10px; box-sizing: border-box; min-height: calc(46px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left)); color: #fff; background: linear-gradient(180deg, #2f7a72, #23655f); box-shadow: 0 2px 10px rgba(0,0,0,.18); }
  .clp-fs-top button { flex: 0 0 auto; height: 34px; padding: 0 12px; border: 1px solid rgba(255,255,255,.45); border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; font-family: inherit; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
  .clp-fs-top button[hidden] { display: none; }
  .clp-fs-top button[aria-pressed="true"] { background: #fff; color: #23655f; }
  .clp-fs-where { flex: 1 1 auto; min-width: 0; display: grid; line-height: 1.25; }
  .clp-fs-where b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clp-fs-where span { font-size: 12.5px; opacity: .88; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clp-fs-badge { flex: 0 0 auto; padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,.18); font-size: 12.5px; font-weight: 800; white-space: nowrap; }
  .clp-fs-badge[data-state="ok"] { background: #f2c64f; color: #3e2400; }
  .clp-fs-badge[data-state="stop"] { background: #f3d4c6; color: #8a2f18; }
  .clp-fs-tools { flex: 0 0 auto; display: flex; gap: 6px; }
  .clp-fs-tools button { min-width: 38px; padding: 0 9px; }
  .clp-fs-nav { pointer-events: auto; position: absolute; bottom: calc(12px + env(safe-area-inset-bottom)); min-width: 112px; height: 50px; padding: 0 20px; border: 0; border-radius: 999px;
    color: #23655f; background: rgba(255,255,255,.96); box-shadow: 0 4px 16px rgba(0,0,0,.22), inset 0 0 0 1.5px rgba(35,101,95,.4); font: 800 16px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
  /* 上一题、下一题悬浮在左下、右下角（2026-11-06 用户：“还是悬浮显示吧，屏幕中要能够尽量多地显示题目”）；题目滑到最后时留出按钮的高度 */
  .clp-fs-prev { left: max(12px, env(safe-area-inset-left)); }
  .clp-fs-next { right: max(12px, env(safe-area-inset-right)); }
  .clp-fs-nav:disabled { opacity: .35; cursor: default; }
  .clp-fs-next.is-ready { color: #3e2400; background: linear-gradient(180deg, #fff3c4, #f2c64f 55%, #d9a032); box-shadow: 0 0 0 3px rgba(242,198,79,.35), 0 6px 18px rgba(184,128,26,.35); animation: clp-fs-pulse 1.6s ease-in-out infinite; }
  @keyframes clp-fs-pulse { 50% { box-shadow: 0 0 0 8px rgba(242,198,79,.12), 0 6px 18px rgba(184,128,26,.35); } }
  .clp-fs-hint { pointer-events: auto; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box; width: min(420px, calc(100% - 32px)); padding: 18px 18px 16px;
    border-radius: 16px; background: #fffdf8; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  .clp-fs-hint[hidden] { display: none; }
  .clp-fs-hint b { display: block; margin-bottom: 6px; color: #23655f; font-size: 17px; }
  .clp-fs-hint p { margin: 0 0 12px; color: #4a4038; font-size: 14.5px; line-height: 1.65; }
  .clp-fs-hint div { display: flex; gap: 8px; }
  .clp-fs-hint button { flex: 1 1 0; height: 42px; border: 1.5px solid rgba(35,101,95,.4); border-radius: 12px; background: #fff; color: #23655f; font-family: inherit; font-weight: 800; font-size: 15px; line-height: 1; cursor: pointer; }
  .clp-fs-hint button.is-main { border-color: #23655f; background: #23655f; color: #fff; }
  @media (max-width: 520px) { .clp-fs-badge { display: none; } .clp-fs-top { gap: 6px; } .clp-fs-top button { padding: 0 9px; } .clp-fs-tools { gap: 4px; } .clp-fs-tools button { min-width: 34px; padding: 0 6px; } }
  @media (prefers-reduced-motion: reduce) { .clp-fs-next.is-ready { animation: none; } }
  /* 横屏（或旋转画面）：选项排成两列，少翻页 */
  @media (orientation: landscape) and (min-width: 640px) {
    html.clp-fs [data-fs-on] .quiz-options, html.clp-fs [data-fs-on] .live-options, html.clp-fs [data-fs-on] .cl-options { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px 10px !important; }
  }
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) [data-fs-on] .quiz-options, html.clp-fs.clp-fs-rot:not(.clp-fs-pause) [data-fs-on] .live-options,
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) [data-fs-on] .cl-options { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px 10px !important; }
  @media (orientation: landscape) and (max-height: 520px) { html.clp-fs { --fs-top: 46px; --fs-bottom: 60px; } .clp-fs-nav { height: 42px; min-width: 100px; bottom: calc(8px + env(safe-area-inset-bottom)); } }
  /* ---- 旋转画面：竖着拿时把题目和按钮一起转 90°，宽高对调 ---- */
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) body { overflow: hidden !important; height: 100vh; padding: 0 !important; }
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) [data-fs-root] { position: fixed !important; top: 0 !important; left: 0 !important; width: var(--fs-h) !important; height: var(--fs-w) !important; max-width: none !important;
    transform-origin: 0 0 !important; transform: translateX(var(--fs-w)) rotate(90deg) !important; overflow-x: hidden !important; overflow-y: auto !important; overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch; box-sizing: border-box !important; padding: 56px 14px 72px !important; background: #f4efe6 !important;
    display: block !important; min-height: 0 !important; touch-action: none; scroll-behavior: auto !important; }
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) .clp-fs-ui { inset: auto; top: 0; left: 0; width: var(--fs-h); height: var(--fs-w); transform-origin: 0 0; transform: translateX(var(--fs-w)) rotate(90deg); touch-action: none; }
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) .clp-fs-top { min-height: 46px; padding-top: 0; }
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) .clp-fs-nav { bottom: 9px; height: 42px; }
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) .clp-fs-badge, html.clp-fs.clp-fs-rot:not(.clp-fs-pause) .clp-fs-tools [data-fs-size],
  html.clp-fs.clp-fs-rot:not(.clp-fs-pause) .clp-fs-where span { display: revert; }
  /* ---- 手机横着拿（高度很小）：面板、弹窗、聊天室都矮一些，放不下就在框里滚动 ---- */
  @media (orientation: landscape) and (max-height: 520px) {
    .clp-panel { width: min(330px, 44vw); }
    .clp-panel:not(.is-folded) { bottom: 8px !important; max-height: calc(100vh - 16px) !important; max-height: calc(100dvh - 16px) !important; }   /* 展开时用满整个高度，里面的内容照常在框里滚动 */
    .clp-realm-modal, .clp-egg, .lp-modal, .cl-leave { padding: 8px !important; }
    .clp-realm-card, .clp-rank-card { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 12px 16px; }
    .clp-egg-card { max-height: calc(100dvh - 16px); overflow-y: auto; padding: 14px 18px 12px; }
    .clp-egg-burst { font-size: 26px; }
    .lp-card { max-height: calc(100dvh - 16px) !important; }
    .lp-head { padding: 8px 14px !important; }
    .lp-head h3 { font-size: 20px !important; }
    .cl-leave-card { max-height: calc(100dvh - 16px) !important; padding: 12px 16px !important; }
    /* 时间轴排排站（2026-11-11）：同情境猜谜，放在左上、高度不超过屏幕 */
    .clp-tl { top: 6px; left: max(8px, env(safe-area-inset-left)); transform: none; width: min(600px, calc(100vw - 24px)); max-height: calc(100dvh - 12px); padding: 8px 12px; }
    /* 情境猜谜抢答：放在左上，宽一点、矮一点；倒计时小一号 */
    .clp-pzd { top: 6px; left: max(8px, env(safe-area-inset-left)); transform: none; width: min(600px, calc(100vw - 24px)); max-height: calc(100dvh - 12px); overflow-y: auto; padding: 8px 12px; }
    .clp-pzd-head { margin-bottom: 2px; }
    .clp-pzd-surface p { max-height: 30vh; overflow-y: auto; }
    .clp-pzd-count { margin: 0 0 6px; }
    .clp-pzd-num { width: 40px; height: 40px; font-size: 20px; }
    .clp-pzd-form input, .clp-pzd-form button { height: 40px; }
    /* 课堂投票：选项排成一行，按钮矮一些 */
    .clp-poll { bottom: 6px; max-height: calc(100dvh - 12px); overflow-y: auto; padding-top: 10px; padding-bottom: 10px; width: min(640px, calc(100vw - 24px)); }
    .clp-poll h3 { margin-bottom: 8px; }
    .clp-poll-options { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
    .clp-poll-options button { min-height: 46px; padding: 6px 8px; }
    .clp-poll-note { margin-top: 6px; }
    /* 辩论聊天室、经营沙盘聊天室：消息区矮一些，成员名单改成横排 */
    .dbr-body { grid-template-columns: 1fr; min-height: 0; }
    .dbr-people { border-right: 0; border-bottom: 1px solid rgba(70,51,34,.1); max-height: none; padding: 6px 10px; }
    .dbr-people h5 { display: none; }
    .dbr-people ul { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
    .dbr-people li { flex: 0 0 auto; padding: 3px 8px 3px 3px; border: 1px solid rgba(70,51,34,.1); border-radius: 999px; background: #fff; }
    .dbr-people span > small { display: none; }
    .dbr-list { max-height: max(120px, calc(100vh - 240px)); max-height: max(120px, calc(100dvh - 240px)); }
    .clp-toast { top: 8px; }
  }
  `;
  document.head.appendChild(fsStyle);

  // 弹幕小问题：政治经济学插在没有题目的页面（学习路线、线索页、概念小结）；习经章节页放在生成器留好的位置（data-dm-slot）。
  // 弹幕带“【问N】”标签，投屏讲解版据此汇总到对应问题下
  const dmqCards = [];
  // 回答弹幕小问题、弹幕接龙：内容最多 50 字（前面的“【问N】【角色】”等标签另算，后台弹幕总长上限 80）；左下角自由发的弹幕仍是 40 字
  const DMQ_MAX = 50;
  if (Array.isArray(config.danmaku)) {
    config.danmaku.forEach((item, index) => {
      const slot = item.slot ? document.querySelector(`[data-dm-slot="${item.slot}"]`) : null;
      const page = slot ? null : document.getElementById(item.after);
      if (!slot && !page) return;
      const box = slot || page.querySelector('.inner') || page;
      const tag = `【问${index + 1}】`;
      // 辩论质询（习经 slot“NN-debate”）：弹幕自动加上【正方】或【反方】，按本人递交的辩前投票
      const debate = (/^(\d{2})-debate$/.exec(item.slot || '') || [])[1] || '';
      // 圆桌表态（习经 slot“NN-roundtable”）：弹幕自动加上【角色名】，按本人递交的“认领角色”
      const rt = (/^(\d{2})-roundtable$/.exec(item.slot || '') || [])[1] || '';
      const roleRoom = rt ? Math.max(0, ...(item.roles || []).map((role) => role.length)) + 2 : 0;
      const card = document.createElement('section');
      card.className = 'clp-dmq';
      card.dataset.dmq = String(index + 1);
      card.innerHTML = `<div class="clp-dmq-head"><span class="clp-dmq-tag">弹幕小问题 · 问${index + 1}</span><span class="clp-dmq-label">${esc(item.label)}</span></div>
        <h4>${esc(item.prompt)}</h4>${item.hint ? `<p class="clp-dmq-hint">${esc(item.hint)}</p>` : ''}
        <form class="clp-dmq-form"><input type="text" maxlength="${DMQ_MAX}" placeholder="写一句话（最多 ${DMQ_MAX} 字），发到投屏上" aria-label="弹幕：${esc(item.prompt)}" disabled><button type="submit" disabled>发送</button></form>
        <p class="clp-dmq-state" role="status"></p>`;
      if (slot) {
        slot.replaceChildren(card);
        dmqCards.push({ card, tag, debate, rt });
        return;
      }
      const head = box.querySelector('.page-head');
      // 概念页：辨一辨追问紧跟在辨一辨之后；读情境紧跟在并入的“事实与情境”之后
      const spot = item.where === 'check' ? page.querySelector('[data-step="check"]') : item.where === 'scene' ? page.querySelector('.cl-scene') : null;
      if (spot) spot.insertAdjacentElement('afterend', card);
      else if (item.where === 'start' && head) head.insertAdjacentElement('afterend', card);
      else box.appendChild(card);
      dmqCards.push({ card, tag, debate, rt });
    });
  }
  // ---------- 匿名建议箱：针对本堂课（老师的讲授、案例呈现、互动方式、以后想加的内容），放在页面最后的“资料与延伸阅读”之后
  //   （习经章节页：本章知识点小结→资料与延伸阅读→建议箱；政经案例页同理）。网站版才有，离线版不加。建议本身只记日期；
  //   2026-11-05 起后台另记提交者（老师读不到），只用于老师点赞采纳后给作者加修为、作者下次打开页面时通知
  //   政经叫“匿名建议和提问箱”：2026-10-22 起概念小结的“提问墙”弹幕删去，没想通的问题写在这里，老师下一堂课统一解答 ----------
  const fbCards = [];
  const FB = Live.feedbackBox ? Live.feedbackBox.texts(worksheet) : {};   // 文字、样式、卡片与投屏页共用（live-core.js；离线版没有建议箱）
  if (!OFFLINE) {
    const spots = worksheet
      ? [{ caseNo: (/(\d{2})$/.exec(unit) || [])[1], page: document.getElementById('sources') }]
      // 习经：章节页最后（“本章知识点小结”之后）的“资料与延伸阅读”末尾放一个，针对本堂课（案例号记 00）；旧页面没有这一节时退回每个案例第二课时末尾
      : document.getElementById('chapter-sources') ? [{ caseNo: '00', page: document.getElementById('chapter-sources') }]
        : $$('section[id^="case-"][id$="-questions"]').map((page) => ({ caseNo: page.id.slice(5, 7), page }));
    spots.forEach(({ caseNo, page }) => {
      if (!/^\d{2}$/.test(caseNo || '') || !page) return;
      const card = document.createElement('section');
      card.className = 'clp-fb';
      card.innerHTML = Live.feedbackBox.html(FB, false);
      // 政治经济学：放在“资料与延伸阅读”里、“继续阅读下一案例”之前；习经：放在章节页“资料与延伸阅读”这一节的末尾
      const pager = worksheet ? page.querySelector('.case-sequence') : null;
      if (pager) pager.insertAdjacentElement('beforebegin', card);
      else (page.querySelector('.section-inner') || page.querySelector('.inner') || page).appendChild(card);
      fbCards.push({ card, caseNo });
    });
  }
  const panel = document.createElement('aside');
  panel.className = 'clp-panel';
  panel.setAttribute('data-ix', '');
  panel.setAttribute('aria-label', '课堂作业');
  shield(panel);
  // 避开页面自带的底部固定元素（页码、手机版底部导航等），防止互相遮挡
  const dodge = () => {
    const left = panel.getBoundingClientRect().left;
    const right = panel.getBoundingClientRect().right;
    let bottom = 80;
    document.querySelectorAll('body *').forEach((el) => {
      if (el === panel || panel.contains(el) || getComputedStyle(el).position !== 'fixed') return;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.top < innerHeight / 2 || box.right <= left || box.left >= right) return;
      bottom = Math.max(bottom, Math.ceil(innerHeight - box.top) + 8);
    });
    panel.style.bottom = `${bottom}px`;
  };
  let dodgeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(dodgeTimer); dodgeTimer = setTimeout(dodge, 200); });

  // ---------- 题目 ----------
  // 每道题：{ key, section, title, prompt, el, anchor, read(), check(v), show(v), lock(), restore(v), send(v) }
  const questions = (worksheet ? conceptQuestions() : caseQuestions())
    .filter((q) => !activeCase || String(q.key).startsWith(`${String(activeCase).padStart(2, '0')}:`));

  // 递交记录：按页面保存，每个课堂一份（同一页面在别的课堂重新发布时重新作答）
  const LOCK_KEY = `classlive-locked${PREVIEW ? '-preview' : AUDIT ? '-audit' : ''}:${location.pathname}`;   // 测试页、旁听的递交记录另存（测试页可一键清空；旁听转正后不挡正式递交）
  const lockBook = load(LOCK_KEY, {});
  const lastRoom = () => Object.keys(lockBook).sort((a, b) => (lockBook[b].$t || 0) - (lockBook[a].$t || 0))[0];
  const roomKey = OFFLINE ? 'offline' : joined ? String(identity.classroom) : lastRoom();
  const locked = (roomKey && lockBook[roomKey]) || {};
  const remember = (key, entry) => {
    if (!joined) return;
    lockBook[roomKey] = { ...(lockBook[roomKey] || {}), [key]: entry, $t: Date.now() };
    Object.assign(locked, { [key]: entry });
    save(LOCK_KEY, lockBook);
  };
  const noteKey = (key) => `classlive-note:${location.pathname}:${key}`;
  const noteOf = (key) => { try { return localStorage.getItem(noteKey(key)) || ''; } catch (error) { return ''; } };

  // 题目下方：递交按钮、状态、我的备注
  questions.forEach((q) => {
    const bar = document.createElement('div');
    bar.className = 'clp-q';
    bar.setAttribute('data-ix', '');
    bar.innerHTML = `<div class="clp-q-row"${joined ? '' : ' hidden'}><button type="button" class="clp-q-send">递交</button><i class="clp-q-br" aria-hidden="true"></i><button type="button" class="clp-q-fs" title="全屏答题：从这一题开始，一题一屏，可以横屏">⤢ 全屏</button><span class="clp-q-state" aria-live="polite"></span></div>
      <details class="clp-note"><summary>我的备注</summary><textarea rows="3" maxlength="2000" placeholder="写下自己的理解、疑问或课堂讲评要点（只保存在这台设备上，可导出复习）"></textarea></details>`;
    shield(bar);
    q.anchor(bar);
    q.bar = bar;
    q.button = $('.clp-q-send', bar);
    q.state = $('.clp-q-state', bar);
    const note = $('textarea', bar);
    note.value = noteOf(q.key);
    if (note.value) $('details', bar).open = true;
    note.addEventListener('input', () => { try { localStorage.setItem(noteKey(q.key), note.value); } catch (error) { /* 忽略 */ } });
    q.button.addEventListener('click', () => submit(q));
    $('.clp-q-fs', bar).addEventListener('click', () => openFullscreen(q));
  });

  const IDLE = OFFLINE ? '选好或写好后点“递交”锁定答案，递交后不能修改'
    : PREVIEW ? '测试页：点“递交”只在本机锁定，不交给后台、不计入统计'
      : AUDIT ? '旁听：点“递交”只在这台设备上锁定答案，不交给老师、不计入统计' : '选好或写好后点“递交”交给老师，递交后不能修改';
  const setQ = (q, text, state) => { q.state.textContent = text; q.state.dataset.state = state || ''; };
  // ---------- 境界解锁（2026-10-22）：筑基解锁递交后的题目解答（后台 ck_my_explain 再核对境界和递交），结丹解锁“学习方法小锦囊” ----------
  const EXPLAIN_LEVEL = 1;
  const STUDY_LEVEL = 2;
  const canExplain = !OFFLINE && joined && !AUDIT;   // 测试页也可展开（后台对教师账号直接给解答）；旁听没有境界，不展开
  const cachedRealm = load(`classlive-realm:${config.course}:${identity.sid}`, null);
  let gateLevel = OFFLINE || PREVIEW ? 4 : AUDIT ? 0 : cachedRealm ? Number(cachedRealm.realm) || 0 : -1;   // -1：还不知道本人境界；旁听按炼气
  const EXPLAIN_TEXT = {
    none: '这道题是开放题，没有标准解答，请对照课堂讲评。', todo: '后台还没收到你这道题的递交：递交成功后再来看解答。',
    locked: '达到「筑基」境界才能看解答：老师结算修为后，境界会更新。', login: '请回首页用课堂码重新登录后再看解答。',
  };
  const explainHtml = (body) => `${body.answer ? `<p class="clp-ex-ans"><b>参考答案</b>${esc(body.answer)}</p>` : ''}${(body.lines || []).length ? `<ul>${body.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}`;
  function paintExplain(q) {
    if (!canExplain || !q.bar || !q.bar.classList.contains('is-locked')) return;
    let box = q.bar.querySelector('.clp-ex');
    if (!box) {
      box = document.createElement('div');
      box.className = 'clp-ex';
      box.innerHTML = '<button type="button" class="clp-ex-btn"></button><div class="clp-ex-body" hidden></div>';
      q.bar.querySelector('.clp-q-row').insertAdjacentElement('afterend', box);
      box.querySelector('.clp-ex-btn').addEventListener('click', () => toggleExplain(q, box));
    }
    const button = box.querySelector('.clp-ex-btn');
    const open = gateLevel >= EXPLAIN_LEVEL;
    if (button.dataset.busy) return;
    button.disabled = !open;
    button.classList.toggle('is-locked', !open);
    button.textContent = open ? (box.querySelector('.clp-ex-body').hidden ? '展开解答' : '收起解答') : '🔒 解答：达到「筑基」境界解锁';
  }
  async function toggleExplain(q, box) {
    const body = box.querySelector('.clp-ex-body');
    const button = box.querySelector('.clp-ex-btn');
    if (!body.hidden) { body.hidden = true; button.textContent = '展开解答'; return; }
    if (!q.explained) {
      button.dataset.busy = '1';
      button.disabled = true;
      button.textContent = '正在读取解答……';
      let html = '';
      try {
        const value = await backend.rpc('ck_my_explain', { p_classroom: Number(identity.classroom) || identity.classroom, p_key: q.key });
        const res = (Array.isArray(value) ? value[0] : value) || {};
        if (res.status === 'ok') q.explained = explainHtml(res.body || {});
        else if (res.status === 'none') q.explained = `<p class="clp-ex-note">${EXPLAIN_TEXT.none}</p>`;
        else html = `<p class="clp-ex-note">${esc(EXPLAIN_TEXT[res.status] || '暂时读不到解答。')}</p>`;
        if (res.status === 'locked') applyRealmGates(Number(res.realm) || 0);
      } catch (problem) {
        html = `<p class="clp-ex-note">${/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem))
          ? '题目解答还没有开通（老师后台尚未更新）。' : '读取解答失败：请检查网络后再试。'}</p>`;
      }
      delete button.dataset.busy;
      button.disabled = false;
      if (!q.explained) { body.innerHTML = html; body.hidden = false; button.textContent = '再试一次'; return; }
    }
    body.innerHTML = q.explained;
    body.hidden = false;
    button.textContent = '收起解答';
  }
  function applyRealmGates(level) {
    gateLevel = level;
    document.documentElement.classList.toggle('clp-study-open', level >= STUDY_LEVEL);
    questions.forEach(paintExplain);
  }
  const markLocked = (q, entry) => {
    q.bar.classList.add('is-locked');
    q.button.hidden = true;
    q.lock();
    if (entry && entry.v !== undefined && entry.v !== null && q.restore) q.restore(entry.v);
    setQ(q, entry && entry.other ? '已在其他设备递交（每题只算第一次）' : `已递交（${(entry && entry.at) || ''}），不能再修改`, 'ok');
    paintExplain(q);
  };
  questions.forEach((q) => {
    if (locked[q.key]) markLocked(q, locked[q.key]);
    else setQ(q, joined ? IDLE : '', '');
  });
  applyRealmGates(gateLevel);
  if (worksheet && joined && !OFFLINE && !AUDIT) setupSelfStudy();   // 测试页也计（以王不凡记在后台，结算不计）；旁听不计

  // ---------- 政经“课后自修”计分（2026-10-22）：主动回忆、温故、讲给别人听交到修炼场后台（ck_practice_essay / answer），计入修炼场每日上限 ----------
  // 都写成函数声明：setupSelfStudy 在本段之前就被调用
  async function xlCall(name, params) {
    const value = await backend.rpc(name, { p_classroom: Number(identity.classroom) || identity.classroom, p_unit: unit, ...params });
    return (Array.isArray(value) ? value[0] : value) || {};
  }
  // blind：出门测、温故（2026-10-28 起课后自修不给答案，后台只回答“记下了”，不说对错和得分）
  function xlSay(host, res, fallback, blind) {
    const P = Live.PRACTICE || { of: () => ({ cap: 10 }) };
    let el = host.querySelector(':scope > .clp-xl-state');
    if (!el) { el = document.createElement('p'); el.className = 'clp-xl-state'; host.appendChild(el); }
    const why = { earned: '这一项以前已经得过修为。', today: '今天先答错过：隔天在修炼场“回炉巩固”再答对才计修为。', cap: `今天的修炼修为已满 ${P.of(config.course).cap} 点，明天再来。` };
    const text = res && res.status === 'ok' && blind ? '已记下。答案在下一次课讲评，答对的计入修为。'
      : res && res.status === 'ok' ? (res.points ? `+${res.points} 修为（今日 ${res.today}/${res.cap}）` : res.correct === false ? '没答对，这题不计修为。' : why[res.reason] || '已记录。')
      : res && res.status === 'short' ? `还没写满 ${res.min} 个字，写满再递交才计修为。`
        : res && res.status === 'closed' ? '本单元还没有上课，暂不计修为。' : fallback || '暂时没能记上修为，请稍后再试。';
    el.textContent = text;
    el.dataset.state = res && res.status === 'ok' && res.points ? 'ok' : '';
  }
  function xlFailed(host) {
    return (problem) => xlSay(host, null, /PGRST202|42883|Could not find the function/.test(String((problem && problem.message) || problem))
      ? '课后自修计分还没有开通（老师后台尚未更新）。' : '网络不通，没能记上修为，请稍后再试。');
  }
  // 课后自修里的出门测（2026-10-23 起）：照常逐题递交给老师（作业记录、工作台和投屏统计照旧；结算课堂修为时不再算），
  // 递交锁定后再交修炼场后台计修为——每题第一次作答答对 +2（测试页也计，记在王不凡名下、不计入班级）；
  // 本机记下已计过的，10-23 以前递交、还没计过的进入课堂后补计一次。课后思考（原 +5）2026-10-28 起改为期中考查作业，不计修为
  function xlFlag(key) { return `classlive-xl-award:${config.course}:${unit}:${key}`; }
  function xlAward(key, value, host, quiet) {
    const exit = /^exit\.(\d+)$/.exec(key);
    if (!exit) return;
    xlCall('ck_practice_answer', { p_item: `exit${Number(exit[1]) + 1}`, p_answer: value }).then((res) => {
      if (res.status === 'ok') save(xlFlag(key), 1);
      if (!quiet) xlSay(host, res, null, true);
    }).catch(quiet ? () => {} : xlFailed(host));
  }
  function setupSelfStudy() {
    const box = document.querySelector('[data-xl]');
    if (!box) return;
    const call = xlCall, say = xlSay, failed = xlFailed;
    const sent = new Set();
    // 主动回忆：写满 8 个字后点“写好了”即递交（2026-10-28 起不再翻开对照）
    box.querySelectorAll('[data-xl-recall]').forEach((li) => {
      const kid = li.dataset.xlRecall;
      const area = li.querySelector('textarea');
      li.querySelector('[data-xl-open]').addEventListener('click', () => {
        const text = (area.value || '').trim();
        if (sent.has(kid)) return;
        if (text.replace(/\s/g, '').length < 8) { say(li, null, '先凭记忆写满 8 个字再点“写好了”，才计修为。'); return; }
        sent.add(kid);
        call('ck_practice_essay', { p_item: `recall.${kid}`, p_text: text }).then((res) => say(li, res)).catch(failed(li));
      }, true);
    });
    // 温故：第一次选择就递交（答对 +2）；2026-10-28 起不显示对错和答案，讲评在下一次课
    box.querySelectorAll('[data-xl-review]').forEach((li) => {
      const index = Number(li.dataset.xlReview);
      li.querySelectorAll('input[type=radio]').forEach((input) => input.addEventListener('change', () => {
        if (sent.has(`review${index}`)) return;
        sent.add(`review${index}`);
        call('ck_practice_answer', { p_item: `review${index + 1}`, p_answer: Number(input.value) }).then((res) => say(li, res, null, true)).catch(failed(li));
      }));
    });
    // 讲给别人听：加一个“递交”按钮（写满 30 字）
    const feynman = box.querySelector('[data-xl-block="feynman"]');
    if (feynman) {
      const area = feynman.querySelector('textarea[data-xl-text="feynman"]');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'clp-xl-send';
      button.textContent = '递交，积累修为';
      area.insertAdjacentElement('afterend', button);
      button.addEventListener('click', () => {
        const text = (area.value || '').trim();
        if (text.replace(/\s/g, '').length < 30) { say(feynman, null, '写满 30 个字再递交。'); return; }
        button.disabled = true;
        call('ck_practice_essay', { p_item: 'feynman', p_text: text }).then((res) => { say(feynman, res); button.disabled = false; })
          .catch((problem) => { failed(feynman)(problem); button.disabled = false; });
      });
    }
  }

  // ---------- 学生版测试页：右下角“测试页”按钮（叠在“使用说明”上方，点开小卡片：说明、清空测试作答、清空修炼记录）；同一把钥匙的附页链接带上解密值 ----------
  //   2026-11-05 用户：“把这个缩小后放到右下角，做成类似于使用说明的按钮”（原来是页面顶部一整条提示条）
  if (PREVIEW) {
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'clp-pv-btn';
    bar.setAttribute('data-ix', '');
    bar.setAttribute('aria-haspopup', 'dialog');
    bar.setAttribute('aria-expanded', 'false');
    bar.title = '学生版测试页：说明与清空测试记录';
    bar.innerHTML = '<b aria-hidden="true">测</b><span>测试页</span>';
    const pop = document.createElement('div');
    pop.className = 'clp-pv-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', '学生版测试页');
    pop.setAttribute('data-ix', '');
    pop.innerHTML = `<header><b>学生版测试页</b><button type="button" data-preview-close aria-label="关闭">×</button></header>
      <p data-preview-note>王不凡 · 化神 · 弹幕和法宝照常上投屏 · 课堂作答只在本机 · 修炼场${worksheet ? '和课后自修' : ''}以王不凡记在后台，不计入班级修为</p>
      <div><button type="button" data-preview-clear>清空测试作答</button><button type="button" data-preview-practice>清空修炼记录</button></div>`;
    shield(bar);
    shield(pop);
    const showPop = (open) => { pop.hidden = !open; bar.setAttribute('aria-expanded', String(open)); };
    bar.addEventListener('click', () => showPop(pop.hidden));
    pop.querySelector('[data-preview-close]').addEventListener('click', () => showPop(false));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !pop.hidden) showPop(false); });
    document.addEventListener('click', (event) => { if (!pop.hidden && !pop.contains(event.target) && !bar.contains(event.target)) showPop(false); }, true);
    pop.querySelector('[data-preview-clear]').addEventListener('click', () => {
      if (!window.confirm('清空这一页的测试作答和递交记录？（只影响这台电脑上的测试页）')) return;
      try { localStorage.removeItem(LOCK_KEY); if (config.stateKey) localStorage.removeItem(config.stateKey); } catch (error) { /* 忽略 */ }
      location.reload();
    });
    // 修炼场、课后自修的测试记录在后台（王不凡 WBF0001，本课程各班）：教师账号可以删除
    pop.querySelector('[data-preview-practice]').addEventListener('click', async (event) => {
      if (!window.confirm('清空王不凡在本课程修炼场和课后自修里的全部测试记录？（只删测试记录，不影响学生）')) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await backend.removeAll('practice', { course: config.course, sid: 'WBF0001' });
        button.textContent = '已清空修炼记录';
      } catch (error) {
        console.warn('[测试页]', error);
        button.textContent = '清空失败，请先登录教师工作台';
        button.disabled = false;
      }
    });
    document.body.appendChild(bar);
    document.body.appendChild(pop);
    // 叠在页面右下角“使用说明”按钮的正上方（两门课、学生版各页位置不同，按实际位置算；没有使用说明按钮时放在右下角）
    const place = () => {
      const guide = document.querySelector('.guide-toggle, .peg-toggle');
      const box = guide ? guide.getBoundingClientRect() : null;   // 使用说明按钮是 position: fixed，offsetParent 总是 null，按尺寸判断是否显示
      const rect = box && box.width > 0 && box.height > 0 ? box : null;
      const right = rect ? Math.max(8, Math.round(window.innerWidth - rect.right)) : 18;
      const bottom = rect ? Math.round(window.innerHeight - rect.top + 10) : 20;
      bar.style.right = `${right}px`;
      bar.style.bottom = `${bottom}px`;
      if (rect) {   // 外形跟使用说明按钮一致（习经圆角方形、政经胶囊形）
        const look = getComputedStyle(guide);
        bar.style.borderRadius = look.borderRadius;
        bar.style.minHeight = `${Math.round(rect.height)}px`;
      }
      pop.style.right = `${right}px`;
      pop.style.bottom = `${bottom + bar.offsetHeight + 8}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    setTimeout(place, 800);
    backend.session().then((session) => {
      if (!session || session.anonymous) {
        const note = pop.querySelector('[data-preview-note]');
        note.textContent = '请先在这台电脑的浏览器里登录教师工作台，测试页才能发弹幕和法宝。';
        note.classList.add('is-warn');
        bar.classList.add('is-warn');
        showPop(true);
      }
    }).catch(() => { /* 忽略 */ });
    const pagePwd = new URLSearchParams(location.search).get('staticrypt_pwd');
    if (pagePwd) $$('a[href*="-notes.html"]').forEach((link) => {   // 附页链接可能带 #章节 锚点：解密参数放在锚点之前
      const [path, hash] = link.getAttribute('href').split('#');
      link.href = `${path}?staticrypt_pwd=${encodeURIComponent(pagePwd)}${hash ? `#${hash}` : ''}`;
    });
  }

  // ---------- 停止递交：老师在投屏页停止某道题后，这道题不再收递交（数据库拒绝写入，不计修为） ----------
  const STOPPED = '老师已停止递交这道题，不能再递交（不计修为）；可以继续看题、写备注';
  let stops = [];
  const stoppedQ = (q) => Boolean(Live.isStopped) && Live.isStopped(stops, q.key);
  // 暂时收起递交的题（2026-10-29 为 3v3 辩论台进行中的“辩后投票”而设；2026-11-05 取消 3v3 后暂无调用），与老师“停止递交”共用下面的显示
  const heldQuestions = new Map();
  function holdQuestion(key, text) {
    if ((heldQuestions.get(key) || '') === (text || '')) return;
    if (text) heldQuestions.set(key, text); else heldQuestions.delete(key);
    applyStops(key);
  }
  function applyStops(changedKey) {
    questions.forEach((q) => {
      if (locked[q.key]) return;
      const held = heldQuestions.get(q.key) || '';
      const on = stoppedQ(q) || Boolean(held);
      if (q.key !== changedKey && on === Boolean(q.stopped)) return;
      q.stopped = on;
      clearTimeout(q.timer);
      q.button.classList.remove('is-confirm');
      q.button.textContent = '递交';
      q.button.disabled = false;
      q.button.hidden = on;
      q.bar.classList.toggle('is-stopped', on);
      setQ(q, on ? (stoppedQ(q) ? STOPPED : held) : IDLE, on ? 'stopped' : '');
    });
  }
  async function loadStops() {
    if (OFFLINE || !joined || !Live.stopList) return;
    try {
      stops = Live.stopList(await backend.rpc('ck_stopped_items', { p_classroom: Number(identity.classroom) || identity.classroom }));
      applyStops();
    } catch (error) { /* 后台还没有“停止递交”功能时忽略 */ }
  }
  if (!OFFLINE && joined && questions.length) {
    loadStops();
    setInterval(() => { if (!document.hidden && questions.some((q) => !locked[q.key])) loadStops(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStops(); });
  }

  // 递交：第一次点出现“确认递交？”，3 秒内再点一次才发送
  async function submit(q) {
    if (locked[q.key]) return;
    if (!joined) {   // 没进入本周课堂（含用历史课堂码只查看的）：点“递交”时说明原因，不再没反应
      setQ(q, viewing ? '历史课堂只能查看，不能递交，也不计修为' : '进入本周课堂后才能递交：请先在首页输入老师发布的课堂码', 'error');
      return;
    }
    if (q.stopped) { setQ(q, STOPPED, 'stopped'); return; }
    const value = q.read();
    const problem = q.check(value);
    if (problem) { setQ(q, problem, 'error'); return; }
    if (!q.button.classList.contains('is-confirm')) {
      q.button.classList.add('is-confirm');
      q.button.textContent = '确认递交？';
      const hint = q.remind ? q.remind() : '';
      setQ(q, hint ? `${hint}；递交后不能修改，确认请再点一次` : '递交后不能修改，确认请再点一次', 'error');
      clearTimeout(q.timer);
      q.timer = setTimeout(() => {
        q.button.classList.remove('is-confirm');
        q.button.textContent = '递交';
        if (!locked[q.key]) setQ(q, IDLE, '');
      }, 3000);
      return;
    }
    clearTimeout(q.timer);
    q.button.classList.remove('is-confirm');
    q.button.textContent = '正在递交……';
    q.button.disabled = true;
    try {
      // 离线版、学生版测试页、旁听只在本机锁定；在线版交给后台
      const result = OFFLINE || LOCAL_ONLY ? null : await q.send(value);
      // 服务器说这题之前已递交过（例如在另一台设备上）：以第一次为准，不记这次的作答
      const rejected = result && result.accepted === false;
      const entry = rejected ? { at: '', v: null, other: true } : { at: time(), iso: new Date().toISOString(), v: value };
      remember(q.key, entry);
      markLocked(q, entry);
      if (rejected) setQ(q, '这道题之前已递交过，以第一次为准', 'ok');
      else if (q.after && !OFFLINE) q.after(value);   // 课后自修里的出门测、课后思考：再交修炼场后台计修为
      if (result && Array.isArray(result.keys)) syncKeys(result.keys);
    } catch (problemError) {
      console.error(problemError);
      if (Live.isDuplicateError(problemError)) {
        const entry = { at: '', v: null, other: true };
        remember(q.key, entry);
        markLocked(q, entry);
        setQ(q, '这道题之前已递交过，以第一次为准', 'ok');
      } else if (!OFFLINE && Live.isClosedError(problemError) && (/已停止递交/.test(String(problemError && problemError.message))
        || (await loadStops(), stoppedQ(q)))) {
        // 老师刚刚停止了这道题（政经的后台直接说明；习经的行级安全只说拒绝写入，再核对一次停止列表）
        if (!stoppedQ(q)) stops = stops.concat(q.key);
        applyStops();
      } else {
        q.button.disabled = false;
        q.button.textContent = '递交';
        if (Live.isClosedError(problemError)) onBlocked();
        setQ(q, Live.isClosedError(problemError) ? (needsRelogin(problemError) ? reloginText : closedText) : '递交失败：请检查网络后再试（作答仍在页面上）', 'error');
      }
    }
    refreshCount();
    document.dispatchEvent(new Event('classlive:submitted'));
  }
  // 概念学习课程：服务器返回本人已递交的全部题目（可能来自另一台设备）
  function syncKeys(keys) {
    questions.forEach((q) => {
      if (keys.includes(q.key) && !locked[q.key]) {
        const entry = { at: '', v: null, other: true };
        remember(q.key, entry);
        markLocked(q, entry);
      }
    });
  }

  // 收起 / 展开（手机等窄屏默认收起，避免挡住正文；学生展开或收起后记住选择）
  function setupFold() {
    const fold = panel.querySelector('[data-cl-fold]');
    const setFolded = (value) => { panel.classList.toggle('is-folded', value); fold.textContent = value ? '展开' : '收起'; save('classlive-panel-folded', value); dodge(); };
    fold.addEventListener('click', () => setFolded(!panel.classList.contains('is-folded')));
    // 手机端收起后只剩境界小图标：点它展开
    const mini = panel.querySelector('[data-cl-mini]');
    if (mini) mini.addEventListener('click', () => setFolded(false));
    const savedFold = load('classlive-panel-folded', null);
    setFolded(savedFold === null ? window.innerWidth < 700 || window.innerHeight < 500 : Boolean(savedFold));
  }

  // ---------- 面板按钮：下一道未递交、导出 ----------
  function bindTools() {
    const next = panel.querySelector('[data-cl-next]');
    if (next) next.addEventListener('click', () => {
      const q = questions.find((item) => !locked[item.key] && !item.stopped);
      if (!q) { const state = panel.querySelector('[data-cl-state]'); if (state) { state.textContent = '全部题目都已递交'; state.dataset.state = 'ok'; } return; }
      reveal(q.bar);
    });
    panel.querySelectorAll('[data-cl-export]').forEach((button) => button.addEventListener('click', () => exportWork(button.dataset.clExport)));
    const fs = panel.querySelector('[data-cl-fs]');
    if (fs) fs.addEventListener('click', () => openFullscreen(null));
  }
  // 翻到题目所在的页（分页式页面），再滚动到题目
  function reveal(el) {
    const page = el.closest('section.page[id], section[id^="case-"]');
    if (page && !page.offsetParent && page.id) location.hash = page.id;
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const button = el.querySelector('.clp-q-send');
      if (button && !button.hidden) button.focus({ preventScroll: true });
    }, 250);
  }

  // ---------- 全屏答题（2026-11-05 用户：“对于手机登录的同学，做一个可以全屏的答题模式，点击后可以横屏显示题目，然后每个题目都可以全屏显示方便阅读答题，
  // 顺着答下去，左下角和右下角有‘上一题’‘下一题’的按钮可以选择题目。也可以退出全屏模式，然后自己划到某一题再进入该题的全屏模式。”） ----------
  //   不搬动、不复制题目：给当前这道题（及它的各层父元素）做标记，页面上其它内容一律隐藏，父元素的边距、底色去掉，题目铺满屏幕；
  //   选项、递交按钮、我的备注都还是原来那一份，作答、递交和平常一样。
  //   安卓等支持的浏览器进入系统全屏并锁定横屏；不能锁定（iPhone、微信里打开等）又竖着拿时，可以“旋转画面”把题目转成横向显示（写字时自动转回竖屏，
  //   有弹窗——投票、情境猜谜等——时也先转回竖屏）；手机本来就横着拿时直接是横屏排版。
  //   入口：每道题递交按钮旁的“⤢ 全屏”（从这一题开始）、面板里的“全屏答题”（从第一道未递交的题开始）。返回键、Esc、左上角“退出”都能退出，退出后停在刚才那道题。
  const FS = { on: false, at: 0, list: [], marked: [], opened: [], hidden: [], ui: null, timer: 0, locked: false, rot: load('classlive-fs-rot', ''), zoom: Number(load('classlive-fs-zoom', 1)) || 1 };
  const FS_STOP = 'main, body, .section-inner, .inner, section.page, .page-section, .cl-unit, [data-nav]';
  const FS_POPUP = '.cl-ascend-layer, .clp-poll, .clp-pzd, .clp-tl, .clp-realm-modal, .clp-egg, .clp-toast, .clp-zan, .lp-modal, .sg-root, .dm-gifts, .clp-pv-pop, .cl-leave, dialog, [role="dialog"], [aria-modal="true"]';
  const fsRoot = () => document.querySelector('main') || document.body;
  // 这道题在页面上占哪一块：往上找“只含这一道题”的最大容器（不越过整页、整节的容器）；找不到就取递交条前面紧挨着的几个元素
  function fsZone(q) {
    const bar = q.bar;
    let node = bar;
    while (node.parentElement && !node.parentElement.matches(FS_STOP) && node.parentElement.querySelectorAll('.clp-q').length === 1) node = node.parentElement;
    if (node !== bar) return [node];
    const list = [bar];
    let prev = bar.previousElementSibling;
    while (prev && !prev.classList.contains('clp-q') && !prev.querySelector('.clp-q') && !prev.matches('header, h1, h2, .page-head')) { list.unshift(prev); prev = prev.previousElementSibling; }
    return list;
  }
  function fsMark(zone) {
    zone.forEach((el) => { el.setAttribute('data-fs-on', ''); FS.marked.push(el); });
    let node = zone[0].parentElement;
    while (node && node !== document.documentElement) {
      node.setAttribute('data-fs-path', '');
      FS.marked.push(node);
      if (node.tagName === 'DETAILS' && !node.open) { node.open = true; FS.opened.push(node); }   // 收起的折叠块先展开
      if (node === document.body) break;
      node = node.parentElement;
    }
  }
  function fsUnmark() {
    FS.marked.forEach((el) => { el.removeAttribute('data-fs-on'); el.removeAttribute('data-fs-path'); });
    FS.opened.forEach((el) => { el.open = false; });
    FS.marked = [];
    FS.opened = [];
  }
  const fsPortrait = () => window.innerHeight > window.innerWidth;
  // 竖着拿、不能锁定横屏、选了“旋转画面”时才旋转；正在输入文字或有弹窗时暂时转回竖屏
  function fsPopupOpen() {
    if (document.querySelector('dialog[open]')) return true;
    return Array.from(document.body.children).some((el) => {
      if (el === FS.ui || el.hasAttribute('data-fs-path') || el.hasAttribute('data-fs-hide') || /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return false;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
      const box = el.getBoundingClientRect();
      return box.width * box.height > window.innerWidth * window.innerHeight * 0.06;
    });
  }
  function fsApplyRot() {
    const html = document.documentElement;
    const want = FS.on && FS.rot === 'on' && !FS.locked && fsPortrait() && fsRoot() !== document.body;
    html.style.setProperty('--fs-w', `${window.innerWidth}px`);
    html.style.setProperty('--fs-h', `${window.innerHeight}px`);
    html.classList.toggle('clp-fs-rot', want);
    const typing = document.activeElement && document.activeElement.matches('textarea, input:not([type=radio]):not([type=checkbox]):not([type=button]), [contenteditable="true"]');
    html.classList.toggle('clp-fs-pause', want && (typing || fsPopupOpen()));
    const rotButton = FS.ui && FS.ui.querySelector('[data-fs-rot]');
    if (rotButton) {
      rotButton.hidden = FS.locked || !fsPortrait();
      rotButton.textContent = FS.rot === 'on' ? '⟲ 竖屏' : '⟳ 横屏';
      rotButton.setAttribute('aria-pressed', String(FS.rot === 'on'));
    }
  }
  function fsBuildUi() {
    if (FS.ui) return FS.ui;
    const ui = document.createElement('div');
    ui.className = 'clp-fs-ui';
    ui.hidden = true;
    ui.setAttribute('data-ix', '');
    ui.innerHTML = `<header class="clp-fs-top">
        <button type="button" class="clp-fs-exit" data-fs-exit aria-label="退出全屏答题">✕ 退出</button>
        <div class="clp-fs-where"><b data-fs-pos></b><span data-fs-title></span></div>
        <span class="clp-fs-badge" data-fs-badge></span>
        <div class="clp-fs-tools"><button type="button" data-fs-rot hidden></button><button type="button" data-fs-size="-1" aria-label="字小一点">A−</button><button type="button" data-fs-size="1" aria-label="字大一点">A+</button></div>
      </header>
      <button type="button" class="clp-fs-nav clp-fs-prev" data-fs-step="-1">‹ 上一题</button>
      <button type="button" class="clp-fs-nav clp-fs-next" data-fs-step="1">下一题 ›</button>
      <div class="clp-fs-hint" data-fs-hint hidden role="dialog" aria-label="横屏看题">
        <b>横过来看更清楚</b>
        <p>这台手机的浏览器不能自动转成横屏。可以把手机横过来（iPhone 先在控制中心关掉“竖排方向锁定”），或者点“旋转画面”，把题目转成横向显示（写字时会自动转回竖屏）。</p>
        <div><button type="button" class="is-main" data-fs-hint-rot>旋转画面</button><button type="button" data-fs-hint-keep>竖屏就好</button></div>
      </div>`;
    shield(ui);
    document.body.appendChild(ui);
    ui.addEventListener('click', (event) => {
      const t = event.target;
      if (t.closest('[data-fs-exit]')) fsExit(false);
      else if (t.closest('[data-fs-step]')) {
        const step = Number(t.closest('[data-fs-step]').dataset.fsStep);
        if (step > 0 && FS.at >= FS.list.length - 1) fsExit(false); else fsShow(FS.at + step);
      } else if (t.closest('[data-fs-size]')) {
        FS.zoom = Math.max(0.85, Math.min(1.8, Math.round((FS.zoom + Number(t.closest('[data-fs-size]').dataset.fsSize) * 0.1) * 100) / 100));
        save('classlive-fs-zoom', FS.zoom);
        document.documentElement.style.setProperty('--fs-zoom', String(FS.zoom));
      } else if (t.closest('[data-fs-rot]')) {
        FS.rot = FS.rot === 'on' ? 'off' : 'on';
        save('classlive-fs-rot', FS.rot);
        fsApplyRot();
        fsScrollTop();
      } else if (t.closest('[data-fs-hint-rot]') || t.closest('[data-fs-hint-keep]')) {
        FS.rot = t.closest('[data-fs-hint-rot]') ? 'on' : 'off';
        save('classlive-fs-rot', FS.rot);
        ui.querySelector('[data-fs-hint]').hidden = true;
        fsApplyRot();
        fsScrollTop();
      }
    });
    FS.ui = ui;
    return ui;
  }
  function fsScrollTop() {
    const root = fsRoot();
    if (document.documentElement.classList.contains('clp-fs-rot')) root.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function fsPaint() {
    if (!FS.on) return;
    const q = FS.list[FS.at];
    const ui = FS.ui;
    const done = FS.list.filter((item) => locked[item.key]).length;
    ui.querySelector('[data-fs-pos]').textContent = `第 ${FS.at + 1} / ${FS.list.length} 题`;
    ui.querySelector('[data-fs-title]').textContent = [`已递交 ${done}`, q.section, q.title].filter(Boolean).join(' · ');
    const entry = locked[q.key];
    const badge = ui.querySelector('[data-fs-badge]');
    badge.textContent = entry ? '已递交' : q.stopped ? '已停止递交' : '未递交';
    badge.dataset.state = entry ? 'ok' : q.stopped ? 'stop' : '';
    ui.querySelector('[data-fs-step="-1"]').disabled = FS.at === 0;
    const next = ui.querySelector('[data-fs-step="1"]');
    const last = FS.at >= FS.list.length - 1;
    next.textContent = last ? '完成，退出 ✓' : '下一题 ›';
    next.classList.toggle('is-ready', Boolean(entry || q.stopped));   // 这一题递交了：“下一题”亮起来，顺着答下去
  }
  function fsShow(index) {
    FS.at = Math.max(0, Math.min(FS.list.length - 1, index));
    fsUnmark();
    fsMark(fsZone(FS.list[FS.at]));
    fsPaint();
    fsApplyRot();
    requestAnimationFrame(fsScrollTop);
  }
  // 全屏、锁定横屏：必须在点击里直接调用（浏览器要求用户手势）
  function fsLandscape() {
    const el = document.documentElement;
    const lock = () => {
      if (!(screen.orientation && screen.orientation.lock)) return Promise.reject(new Error('no lock'));
      return screen.orientation.lock('landscape');
    };
    let full = null;
    try {
      if (el.requestFullscreen && !document.fullscreenElement) full = el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) el.webkitRequestFullscreen();
    } catch (error) { full = null; }
    // 有的浏览器（内嵌页面、部分 WebView）全屏或锁定的承诺迟迟不返回：最多等 1.5 秒
    const wait = (promise) => Promise.race([Promise.resolve(promise), new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 1500))]);
    return wait(full).catch(() => null).then(() => wait(lock())).then(() => true, () => false);
  }
  // 按页面上的先后排（questions 是按题型分组登记的），“下一题”顺着页面往下走
  const fsOrder = () => questions.filter((item) => item.bar && item.bar.isConnected)
    .sort((x, y) => (x.bar.compareDocumentPosition(y.bar) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  function openFullscreen(q) {
    if (!questions.length) return;
    if (!FS.on) FS.list = fsOrder();
    const start = q ? FS.list.indexOf(q) : FS.list.findIndex((item) => !locked[item.key] && !item.stopped);
    const ui = fsBuildUi();
    const landing = fsLandscape();
    if (!FS.on) {
      FS.on = true;
      document.documentElement.classList.add('clp-fs');
      document.documentElement.style.setProperty('--fs-zoom', String(FS.zoom));
      fsRoot().setAttribute('data-fs-root', '');
      // 页面上其它固定显示的东西（导航、页码、面板、使用说明……）先藏起来；弹窗不动
      Array.from(document.body.children).forEach((el) => {
        if (el === ui || el === fsRoot() || el.matches(FS_POPUP) || /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return;
        if (el.offsetWidth || el.offsetHeight || getComputedStyle(el).position === 'fixed') { el.setAttribute('data-fs-hide', ''); FS.hidden.push(el); }
      });
      ui.hidden = false;
      // 返回键退出全屏；退出时浏览器不要把页面滚回进入前的位置（要停在刚才那道题）
      try { FS.restore = history.scrollRestoration; history.scrollRestoration = 'manual'; } catch (error) { /* 忽略 */ }
      if (!(history.state && history.state.clpFs)) { try { history.pushState({ ...(history.state || {}), clpFs: true }, ''); } catch (error) { /* 忽略 */ } }
      clearInterval(FS.timer);
      FS.timer = setInterval(() => { fsPaint(); fsApplyRot(); }, 700);
    }
    fsShow(start >= 0 ? start : 0);
    landing.then((ok) => {
      FS.locked = ok;
      if (!FS.on) return;
      if (!ok && fsPortrait() && !FS.rot) ui.querySelector('[data-fs-hint]').hidden = false;
      fsApplyRot();
    });
  }
  function fsExit(fromHistory) {
    if (!FS.on) return;
    const q = FS.list[FS.at];
    FS.on = false;
    clearInterval(FS.timer);
    fsUnmark();
    FS.hidden.forEach((el) => el.removeAttribute('data-fs-hide'));
    FS.hidden = [];
    fsRoot().removeAttribute('data-fs-root');
    document.documentElement.classList.remove('clp-fs', 'clp-fs-rot', 'clp-fs-pause');
    FS.ui.hidden = true;
    FS.ui.querySelector('[data-fs-hint]').hidden = true;
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (error) { /* 忽略 */ }
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (error) { /* 忽略 */ }
    FS.locked = false;
    if (!fromHistory && history.state && history.state.clpFs) { try { history.back(); } catch (error) { /* 忽略 */ } }
    // 退出后直接停在刚才那道题（2026-11-06 用户：“退出全屏模式的时候，要自动跳到退出时候题目的所在位置”）：
    //   页面样式里有 scroll-behavior: smooth，先临时改成立即跳；退出系统全屏、手机转回竖屏后浏览器还可能恢复一次旧的滚动位置，
    //   所以 0.1、0.45、0.9、1.6 秒各对齐一次；中途学生自己滑动了就不再拉回
    if (q) {
      const html = document.documentElement;
      const zone = fsZone(q)[0] || q.bar;
      // 学生自己动了（触屏、滚轮、按键）就不再拉回；浏览器自己恢复的滚动不算
      let touched = false;
      const mark = () => { touched = true; };
      ['touchstart', 'wheel', 'keydown', 'mousedown'].forEach((type) => window.addEventListener(type, mark, { once: true, passive: true, capture: true }));
      setTimeout(() => ['touchstart', 'wheel', 'keydown', 'mousedown'].forEach((type) => window.removeEventListener(type, mark, { capture: true })), 1800);
      const land = () => {
        if (FS.on || touched) return;
        const page = q.bar.closest('section.page[id], section[id^="case-"]');
        if (page && !page.offsetParent && page.id) location.hash = page.id;
        const old = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        const box = zone.getBoundingClientRect();
        const top = box.height < window.innerHeight * 0.8
          ? window.scrollY + box.top - (window.innerHeight - box.height) / 2   // 整道题放得下：居中
          : window.scrollY + q.bar.getBoundingClientRect().top - window.innerHeight * 0.45;   // 放不下：让递交条在屏幕中间
        window.scrollTo(0, Math.max(0, Math.round(top)));
        html.style.scrollBehavior = old;
      };
      [100, 450, 900, 1600].forEach((ms) => setTimeout(land, ms));
      setTimeout(() => { try { if (FS.restore) history.scrollRestoration = FS.restore; } catch (error) { /* 忽略 */ } }, 2000);
    }
  }
  window.addEventListener('popstate', () => { if (FS.on && !(history.state && history.state.clpFs)) fsExit(true); });
  document.addEventListener('keydown', (event) => {
    if (!FS.on || event.defaultPrevented) return;
    if (event.key === 'Escape' && !fsPopupOpen()) { fsExit(false); return; }
    if (event.target.closest && event.target.closest('textarea, input, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); fsShow(FS.at - 1); }
    else if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); if (FS.at < FS.list.length - 1) fsShow(FS.at + 1); }
  });
  window.addEventListener('resize', () => { if (FS.on) fsApplyRot(); });
  document.addEventListener('focusin', () => { if (FS.on) fsApplyRot(); });
  document.addEventListener('focusout', () => { if (FS.on) setTimeout(fsApplyRot, 250); });
  // 旋转画面时自己处理滑动（2026-11-06 用户：“有些较长的题目，在横屏的时候也要允许上下滑动，看到下面的内容”）：
  //   画面转了 90°，手机自带的滑动方向对不上（iPhone 上滑不动），这里把手指沿题目“上下”方向（竖拿的手机上是左右方向）的移动换算成滚动，
  //   松手后带一点惯性；题目里本身能滚动的小框（表格等）优先滚它。鼠标滚轮同样换算
  const FSD = { touch: null, raf: 0 };
  const fsRotActive = () => FS.on && document.documentElement.classList.contains('clp-fs-rot') && !document.documentElement.classList.contains('clp-fs-pause');
  function fsScroller(target, delta) {
    const root = fsRoot();
    for (let el = target && target.nodeType === 1 ? target : null; el && el !== root && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 2 && /^(auto|scroll)$/.test(getComputedStyle(el).overflowY)) {
        const atEnd = delta > 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0;
        if (!delta || !atEnd) return el;
      }
    }
    return root;
  }
  document.addEventListener('touchstart', (event) => {
    cancelAnimationFrame(FSD.raf);
    if (!fsRotActive() || event.touches.length !== 1) { FSD.touch = null; return; }
    const t = event.touches[0];
    FSD.touch = { x: t.clientX, y: t.clientY, lastX: t.clientX, lastT: performance.now(), v: 0, moved: false, target: event.target, el: null };
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    const s = FSD.touch;
    if (!s || !fsRotActive() || event.touches.length !== 1) return;
    const t = event.touches[0];
    if (!s.moved && Math.abs(t.clientX - s.x) < 6 && Math.abs(t.clientY - s.y) < 6) return;   // 还算点按
    event.preventDefault();
    s.moved = true;
    const dx = t.clientX - s.lastX;   // 画面顺时针转了 90°：手指往屏幕右边移＝往题目上方推，内容跟着往上走
    if (!s.el) s.el = fsScroller(s.target, dx);
    s.el.scrollTop += dx;
    const now = performance.now();
    s.v = 0.8 * (dx / Math.max(1, now - s.lastT)) + 0.2 * s.v;
    s.lastX = t.clientX;
    s.lastT = now;
  }, { passive: false });
  const fsTouchEnd = () => {
    const s = FSD.touch;
    FSD.touch = null;
    if (!s || !s.moved || !s.el || performance.now() - s.lastT > 90) return;   // 停住再松手就不再滑
    let v = Math.max(-4, Math.min(4, s.v));
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(40, now - last);
      last = now;
      s.el.scrollTop += v * dt;
      v *= Math.pow(0.95, dt / 16);
      if (Math.abs(v) > 0.03) FSD.raf = requestAnimationFrame(step);
    };
    FSD.raf = requestAnimationFrame(step);
  };
  document.addEventListener('touchend', fsTouchEnd, { passive: true });
  document.addEventListener('touchcancel', () => { FSD.touch = null; }, { passive: true });
  document.addEventListener('wheel', (event) => {
    if (!fsRotActive()) return;
    event.preventDefault();
    fsScroller(event.target, event.deltaY).scrollTop += event.deltaY;
  }, { passive: false });
  // 手机横过来以后：页面本身也按横屏排版（弹窗、聊天室等矮一些）——见样式表里的 (orientation: landscape) and (max-height: 520px)

  // ---------- 导出 ----------
  function exportBody() {
    const who = identity.name ? `${esc(identity.name)}（${esc(identity.sid)}${identity.class_name ? ' · ' + esc(identity.class_name) : ''}）` : '未登录';
    let html = `<h1>${esc(document.title)}</h1><p class="meta">${who}　导出时间：${esc(stamp())}${identity.classroom_name && joined ? '　课堂：' + esc(identity.classroom_name) : ''}</p>
      <p class="meta">本文件由课程网站导出，包含题目、我的作答、递交状态${questions.some((q) => q.extra) ? '、自检' : ''}和备注（不含参考答案），供课后复习。</p>`;
    let section = '';
    questions.forEach((q) => {
      if (q.section !== section) { section = q.section; html += `<h2>${esc(section)}</h2>`; }
      const entry = locked[q.key];
      const value = entry && entry.v !== null && entry.v !== undefined ? entry.v : q.read();
      // 在其他设备递交的题：本设备没有当时的作答，不拿页面上现在的选择冒充
      const lines = entry && entry.other ? ['（本题已在其他设备递交，以第一次递交为准；本设备没有记录当时的作答）'] : q.show(value);
      const note = noteOf(q.key).trim();
      const extra = q.extra ? q.extra() : null;
      const state = entry ? (entry.other ? '已在其他设备递交' : `已递交 ${entry.at || ''}`) : q.stopped ? '老师已停止递交（未递交）' : (lines.length ? '未递交（草稿）' : '未作答');
      html += `<article><h3>${esc(q.title)}<span class="state${entry ? ' ok' : ''}">${esc(state)}</span></h3>
        ${q.prompt ? `<p class="prompt">${esc(q.prompt)}</p>` : ''}
        <div class="answer"><b>我的作答</b>${lines.length ? lines.map((line) => `<p>${esc(line)}</p>`).join('') : '<p class="empty">（未作答）</p>'}</div>
        ${extra ? `<div class="check"><b>${esc(extra.label)}</b>${extra.lines.map((line) => `<p>${esc(line)}</p>`).join('')}</div>` : ''}
        ${note ? `<div class="note"><b>我的备注</b><p>${esc(note)}</p></div>` : ''}</article>`;
    });
    return html;
  }
  const EXPORT_CSS = `body{margin:0 auto;max-width:860px;padding:28px 22px;color:#201c18;background:#fff;font:15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","SimSun",sans-serif}
    h1{margin:0 0 6px;font-size:24px}h2{margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid #23655f;color:#23655f;font-size:19px}
    h3{display:flex;justify-content:space-between;gap:12px;margin:0 0 4px;font-size:16px}.meta{margin:2px 0;color:#6d6259;font-size:13px}
    article{margin:12px 0;padding:12px 14px;border:1px solid #ddd3c4;border-radius:8px;break-inside:avoid;page-break-inside:avoid}
    .state{flex:0 0 auto;color:#a4492d;font-size:13px;font-weight:600}.state.ok{color:#23655f}.prompt{margin:4px 0 8px;color:#4d443c}
    .answer,.note,.check{margin-top:6px;padding:8px 10px;border-radius:6px;background:#f4f8f6}.note{background:#fbf3e6}.check{background:#f1f3f8}
    .answer b,.note b,.check b{display:block;color:#6d6259;font-size:12.5px}.answer p,.note p,.check p{margin:2px 0;white-space:pre-wrap}.empty{color:#9a8f85}`;
  // 导出文件里附带已递交的作答（JSON），老师可在离线完整版“导入学生文件”统计
  function exportData() {
    const answers = {};
    questions.forEach((q) => {
      const entry = locked[q.key];
      if (entry && entry.v !== null && entry.v !== undefined) answers[q.key] = { v: entry.v, at: entry.iso || '' };
    });
    return { format: 'classlive-export', version: 1, course: config.course, kind: config.kind, unit, title: document.title,
      mode: OFFLINE ? 'offline' : 'online', exported_at: new Date().toISOString(), total: questions.length,
      student: { name: identity.name || '', sid: identity.sid || '', class_name: identity.class_name || '' }, answers };
  }
  function exportWork(kind) {
    const state = panel.querySelector('[data-cl-export-state]');
    const wechat = /MicroMessenger/i.test(navigator.userAgent);
    if (OFFLINE && (!identity.name || !identity.sid)) {
      if (state) { state.textContent = '请先在面板上方填写姓名和学号，导出的文件交给老师时才能对上人。'; state.dataset.state = 'error'; }
      const first = panel.querySelector(identity.name ? '[data-off="sid"]' : '[data-off="name"]');
      if (first) first.focus();
      return;
    }
    if (state) state.dataset.state = '';
    const who = identity.name ? `${identity.name}_${identity.sid || ''}_` : '';
    const name = `${who}${document.title.replace(/[\\/:*?"<>|\s·]+/g, '_')}_我的作答与备注_${stamp().slice(0, 10)}`.replace(/[\\/:*?"<>|\s]+/g, '_');
    if (kind === 'html') {
      const data = JSON.stringify(exportData()).replace(/</g, '\\u003c');
      const doc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(document.title)} · 我的作答与备注</title><style>${EXPORT_CSS}</style>`
        + `<script type="application/json" id="classlive-export">${data}</` + `script></head><body>${exportBody()}</body></html>`;
      const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (state) state.textContent = wechat ? '微信里可能无法下载文件：请点右上角“…”，选择在浏览器中打开后再导出。'
        : OFFLINE ? '已生成 HTML 文件（在“下载”里找到）：把这个文件发给老师，自己也可以离线打开复习。' : '已生成 HTML 文件（在“下载”里找到，离线也能打开）。';
      return;
    }
    // PDF：只打印导出内容，在打印对话框里选“存储为 PDF”
    let view = document.getElementById('clp-print-view');
    if (!view) { view = document.createElement('div'); view.id = 'clp-print-view'; document.body.appendChild(view); }
    view.innerHTML = `<style>@media print{${EXPORT_CSS.replace(/body\{/, '#clp-print-view{')}}</style>${exportBody()}`;
    document.body.classList.add('clp-printing');
    const done = () => { document.body.classList.remove('clp-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    if (state) state.textContent = wechat ? '微信里可能无法打印：请点右上角“…”，选择在浏览器中打开后再导出。' : '在打印窗口的“目标打印机”里选择“存储为 PDF”（手机上选“打印”后再分享或存储）。';
    try { window.print(); } catch (error) { done(); }
    setTimeout(done, 60000);
  }

  // 请假（live-leave.js）：面板上的“请假”打开请假框，凭本机登录过的课堂核对身份
  // ---------- 字号：三档（标准／大／特大），由 live-readable.js 改写页面字号，选择存在本机、各页面通用 ----------
  function fontChoices(cls, pop) {
    const R = window.ClassReadable;
    if (!R) return '';
    return `<div class="${cls}" data-cl-font-choices${pop ? ' hidden role="group" aria-label="字号"' : ''}><span>字号</span>${R.LEVELS.map((name, i) =>
      `<button type="button" data-font="${i}" class="${R.level() === i ? 'is-on' : ''}" aria-pressed="${R.level() === i}">${esc(name)}</button>`).join('')}</div>`;
  }
  function bindFont() {
    const R = window.ClassReadable;
    const box = panel.querySelector('[data-cl-font-choices]');
    if (!R || !box) return;
    const toggle = panel.querySelector('[data-cl-font]');
    const paint = () => box.querySelectorAll('[data-font]').forEach((button) => {
      const on = Number(button.dataset.font) === R.level();
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-font]');
      if (!button) return;
      R.set(Number(button.dataset.font));
      paint();
      dodge();
    });
    R.onChange(paint);
    if (!toggle) return;
    const show = (open) => { box.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', (event) => { event.stopPropagation(); show(box.hidden); });
    document.addEventListener('click', (event) => { if (!box.hidden && !box.contains(event.target) && event.target !== toggle) show(false); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !box.hidden) show(false); });
  }

  function bindLeave() {
    panel.addEventListener('click', (event) => {
      if (!event.target.closest('[data-cl-leave]') || !window.ClassLeave || !backend) return;
      window.ClassLeave.open({ backend, identity });
    });
  }

  // ---------- 面板 ----------
  const tools = `<div class="clp-tools"><button type="button" data-cl-next class="is-main"${joined ? '' : ' hidden'}>下一道未递交 ↓</button><button type="button" data-cl-fs class="clp-fs-entry"${joined ? '' : ' hidden'} title="一题一屏，可以横屏；从第一道未递交的题开始">⤢ 全屏答题</button><button type="button" data-cl-export="html">导出 HTML</button><button type="button" data-cl-export="pdf">导出 PDF</button></div>
    <p class="clp-hint" data-cl-export-state>导出内容：题目、我的作答、递交状态${questions.some((q) => q.extra) ? '、自检' : ''}和备注，方便课后复习。</p>`;
  if (!joined) {
    panel.classList.add('is-gate');
    const elsewhere = identity.classroom && identity.course === config.course && identity.chapter && identity.chapter !== unit;
    // 用历史课堂（停止的、提前发布还没开课的）的课堂码进来的：只能查看（首页 live-join.js 记下）
    const viewed = viewing ? viewFlag : null;
    const pastNote = '历史课堂只能查看，';
    panel.innerHTML = (viewed
      ? `<strong>历史课堂：只能查看</strong><div class="clp-room">你用“${esc(viewed.room || '历史课堂')}”的课堂码进入。这一课现在不是本周课堂：可以查看、写备注、导出复习，但不能递交、发弹幕，也不计修为。</div><a href="${joinUrl()}">回到登录页</a>`
      : elsewhere
      ? `<strong>本周课堂不在这一页</strong><div class="clp-room">你已进入“${esc(identity.classroom_name)}”。本页可以写备注、导出复习，但不能递交。</div><a href="${joinUrl()}">回到登录页</a>${window.ClassLeave ? '<button type="button" class="clp-gate-leave" data-cl-leave>请假</button>' : ''}`
      : '<strong>还没有进入课堂</strong><div class="clp-room">请在首页输入老师发布的课堂码并填写个人信息，才能递交作答。本页可以写备注、导出复习。</div><a href="/">去登录</a>')
      + (questions.length ? tools : '') + fontChoices('clp-gate-font');
    // 2026-11-06（用户：“你再看下还有些地方会挡住字体”）：这张卡片在手机上很大、又不能收起，一直压着正文——
    // 改成和课堂面板一样：标题一行带“收起／展开”，手机上默认收起
    const gateTitle = panel.querySelector(':scope > strong');
    const gateHead = document.createElement('div');
    gateHead.className = 'clp-gate-head';
    gateHead.innerHTML = '<button type="button" class="clp-link" data-cl-fold>收起</button>';
    if (gateTitle) gateHead.prepend(gateTitle);
    const gateBody = document.createElement('div');
    gateBody.className = 'clp-body';
    while (panel.firstChild) gateBody.appendChild(panel.firstChild);
    panel.append(gateHead, gateBody);
    document.body.appendChild(panel);
    setupFold();
    dodge();
    bindTools();
    bindFont();
    if (elsewhere) bindLeave();
    setupMechDanmaku(false, viewed ? `${pastNote}这里不能发弹幕。` : elsewhere ? '本周课堂不在这一页，这里不能发弹幕。' : '进入课堂后才能发弹幕：请先在首页输入老师发布的课堂码。');
    setupFeedback(false, viewed ? `${pastNote}这里不能提交${FB.what}。` : elsewhere ? `本周课堂不在这一页，这里不能提交${FB.what}。` : `进入课堂后才能提交${FB.what}：请先在首页输入老师发布的课堂码。`);
    setupDebateRooms(false, viewed ? `${pastNote}聊天室不能进入。` : elsewhere ? '本周课堂不在这一页，聊天室不能进入。' : '进入本周课堂后，递交辩前票就能进入本方聊天室。');
    setupBizGames(false, viewed ? `${pastNote}经营会不能参加。` : elsewhere ? '本周课堂不在这一页，经营会不能参加。' : '进入本周课堂后，递交角色就能进入本组聊天室。');
    setupDiscuss(false, viewed ? `${pastNote}讨论聊天室不能进入。` : elsewhere ? '本周课堂不在这一页，讨论聊天室不能进入。' : '进入本周课堂后，递交角色就能进入本组聊天室。');
    return;
  }

  // 离线版：面板里填写姓名、学号、班级（导出文件靠它对上人）；不联网，没有弹幕
  if (OFFLINE) {
    panel.innerHTML = `
      <div class="clp-who"><span><strong>离线作业</strong> <small>不联网也能用</small></span><span><button type="button" class="clp-link" data-cl-fold>收起</button></span></div>
      <div class="clp-body">
        <div class="clp-ident">
          <input type="text" data-off="name" maxlength="20" placeholder="姓名" aria-label="姓名" autocomplete="name">
          <input type="text" data-off="sid" maxlength="20" placeholder="学号" aria-label="学号" autocomplete="off">
          <input type="text" data-off="class_name" maxlength="40" placeholder="班级" aria-label="班级" autocomplete="off">
        </div>
        <div class="clp-progress"${questions.length ? '' : ' hidden'}><span class="clp-count" data-cl-count></span><span class="clp-state" data-cl-state>每题做完点题目下方的“递交”锁定答案；全部做完后点“导出 HTML”，把文件发给老师</span>${tools}</div>
      </div>`;
    document.body.appendChild(panel);
    dodge();
    setupFold();
    bindTools();
    refreshCount();
    setupMechDanmaku(false, '离线版不能发弹幕，可以在课堂上直接说一说。');
    // 与练习页自带的姓名、学号、班级同步
    const pageField = { name: 'name', sid: 'id', class_name: 'class' };
    panel.querySelectorAll('[data-off]').forEach((input) => {
      const field = input.dataset.off;
      const pageInput = document.querySelector(`input[data-student-field="${pageField[field]}"]`);
      input.value = identity[field] || (pageInput && pageInput.value) || '';
      identity[field] = input.value.trim();
      input.addEventListener('input', () => {
        identity[field] = input.value.trim();
        save(OFFLINE_STORE, identity);
        if (pageInput) { pageInput.value = input.value; pageInput.dispatchEvent(new Event('input', { bubbles: true })); }
      });
    });
    return;
  }

  // 已进入课堂的面板：境界头部（编号、姓名、称号、学号·班级·课堂、距下一境界）→ 发弹幕（字色、法宝）→ 作答进度 → 我发过的弹幕
  panel.classList.add('clp-v2', 'is-r0');
  const STAR = '<i class="clp-star" aria-hidden="true">✦</i>';
  const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4.5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1.5A3 3 0 0 0 7 10.5M17 6h3v1.5a3 3 0 0 1-3 3M12 13.5V17M8.5 20.5h7M10 17h4v3.5h-4z"/></svg>';
  // 灵根八相按钮的小八边形（2026-11-11）
  const LINGEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 18.7 5.3 21.5 12 18.7 18.7 12 21.5 5.3 18.7 2.5 12 5.3 5.3Z"/><path d="M12 6.5 15.5 9.5 17 12.5 13.5 16 9.5 15.5 7.5 11.5Z" class="is-in"/></svg>';
  const DM_HINT = '投屏可见 · 老师能看到发送人 · 请文明发言';
  panel.innerHTML = `
    <button type="button" class="clp-mini" data-cl-mini aria-label="展开课堂面板"><span data-cl-mini-ch>炼</span><i class="clp-mini-dot" data-cl-mini-dot hidden></i></button>
    <div class="clp-head">${STAR}${STAR}${STAR}
      <div class="clp-who"><b class="clp-no" data-cl-no title="你在点名册上的编号" hidden></b><strong class="clp-name">${esc(identity.name)}</strong><b class="clp-realm" data-cl-realm role="button" tabindex="0" title="修为境界（点开看说明）" hidden></b>${AUDIT ? '<b class="clp-audit-tag" title="点名册外、老师允许旁听">旁听</b>' : ''}
        <span class="clp-links">${window.ClassReadable ? '<button type="button" class="clp-link" data-cl-font aria-haspopup="true" aria-expanded="false" title="调整页面字号（标准、大、特大）">字号</button>' : ''}${PREVIEW || AUDIT || !window.ClassLeave ? '' : '<button type="button" class="clp-link" data-cl-leave title="选择请假日期、写明原因，老师在加入名单里能看到">请假</button>'}<button type="button" class="clp-link" data-cl-fold>收起</button></span></div>
      <div class="clp-sub"><span>${[identity.sid, identity.class_name, identity.group_name, identity.classroom_name].filter(Boolean).map(esc).join(' · ')}</span></div>
      ${AUDIT ? '' : `<div class="clp-acts"><button type="button" class="clp-rankbtn" data-cl-rank-open title="本班修为前十名">${TROPHY}修为榜</button>${OFFLINE ? '' : `<button type="button" class="clp-lgbtn" data-cl-lingen-open title="灵根八相：八个方向看自己的长处和短处">${LINGEN_ICON}灵根</button>`}${window.ClassLivePractice && !AUDIT ? '<button type="button" class="clp-xlbtn" data-cl-practice-open title="平时做题攒修为：每天有上限">修炼场</button>' : ''}${(Live.SECTS || []).length && !AUDIT && !OFFLINE ? '<button type="button" class="clp-sectbtn" data-cl-sect-open title="宗门榜：达到「筑基」后可以拜入宗门"><span aria-hidden="true">宗</span>宗门</button>' : ''}</div>`}
      <div class="clp-rise" data-cl-rise hidden><span data-cl-rise-label></span><span class="clp-rise-bar"><i data-cl-rise-fill></i></span></div>
    </div>
    <div class="clp-body">
      ${AUDIT ? `<section class="clp-sec clp-audit"><p>${esc(AUDIT_NOTE)}</p></section>` : ''}
      <section class="clp-sec"${AUDIT ? ' hidden' : ''}>
        <div class="clp-relogin" data-cl-relogin hidden><b>请回首页重新登录</b>：本课堂要核对身份（课堂码＋点名册＋个人口令），核对通过后才能递交作答、发弹幕。<a href="${joinUrl()}" data-cl-relogin-link>去首页登录 →</a></div>
        <div class="clp-sec-head"><span class="clp-sec-title">发弹幕</span></div>
        <form class="clp-danmaku" data-cl-danmaku>
          <span class="clp-dm-field"><input type="text" maxlength="40" placeholder="说点什么，发到投屏上…" aria-label="弹幕内容" autocomplete="off"></span>
          <button type="submit">发送</button>
        </form>
        <div class="clp-dm-meta"><p class="clp-hint" data-cl-dm-state>${DM_HINT}</p><span data-cl-dm-len>0/40</span></div>
        <div class="clp-colors" data-cl-colors hidden><span class="clp-label">字色</span><em data-cl-colors-note></em></div>
        <div class="clp-gifts" data-cl-gifts hidden></div>
      </section>
      <section class="clp-sec clp-progress"${questions.length ? '' : ' hidden'}>
        <div class="clp-sec-head"><span class="clp-count" data-cl-count></span><span class="clp-sec-note" data-cl-count-note>每题点下方“递交”，递交后不能修改</span></div>
        <div class="clp-prog"><i data-cl-prog></i></div>
        <span class="clp-state" data-cl-state>每题做完点题目下方的“递交”</span>${tools}
      </section>
      <div class="clp-foot">
        <details class="clp-mydm" data-cl-mydm${AUDIT ? ' hidden' : ''}>
          <summary>我发过的弹幕<span data-cl-mydm-count></span></summary>
          <ul class="clp-mydm-list" data-cl-mydm-list></ul>
          <p class="clp-hint" data-cl-mydm-state></p>
        </details>
        <span class="clp-foot-links"><button type="button" class="clp-link" data-cl-news-open>更新说明</button><button type="button" class="clp-link clp-realm-open" data-cl-realm-open>修为说明</button></span>
        ${PREVIEW ? '' : '<div class="clp-out"><button type="button" class="clp-link" data-cl-switch title="退出本机的登录（换同学用这台设备时点这里）">注销登录</button></div>'}
      </div>
    </div>`;
  if (window.ClassReadable) panel.insertAdjacentHTML('beforeend', fontChoices('clp-font-pop', true));
  document.body.appendChild(panel);
  dodge();
  bindFont();
  // 注销登录（原“不是我”）：清掉本机的身份并退出这次登录（下一位同学在这台设备上登录算新设备，要输自己的口令）；先确认，免得误点
  const switchButton = panel.querySelector('[data-cl-switch]');   // 学生版测试页没有“注销登录”（以免退出老师的工作台登录）
  if (switchButton) switchButton.addEventListener('click', async () => {
    if (!window.confirm('注销登录后，要重新输入课堂码、姓名、学号和口令才能再进来。确定注销吗？')) return;
    save(STORE, { code: identity.code });
    try { Object.keys(localStorage).filter((key) => key.startsWith(`${STORE}:`)).forEach((key) => localStorage.removeItem(key)); } catch (error) { /* 忽略 */ }
    try { if (backend.signOutStudent) await backend.signOutStudent(); } catch (error) { /* 忽略 */ }
    location.href = joinUrl();
  });
  setupFold();
  bindLeave();
  if (window.ClassLive) window.ClassLive.attached = true;
  bindTools();

  function refreshCount() {
    const countEl = panel.querySelector('[data-cl-count]');
    if (!countEl) return;
    const done = questions.filter((q) => locked[q.key]).length;
    countEl.textContent = `已递交 ${done}/${questions.length} 题`;
    const bar = panel.querySelector('[data-cl-prog]');
    if (bar) bar.style.width = `${questions.length ? Math.round(done / questions.length * 100) : 0}%`;
    const note = panel.querySelector('[data-cl-count-note]');
    const all = questions.length > 0 && done >= questions.length;
    if (note) { note.textContent = all ? '全部递交 ✓' : '每题点下方“递交”，递交后不能修改'; note.dataset.state = all ? 'ok' : ''; }
    const next = panel.querySelector('[data-cl-next]');
    if (next && panel.classList.contains('clp-v2')) next.textContent = all ? '全部已递交 ✓' : '下一道未递交 ↓';
  }
  refreshCount();

  // 页面原有的即时提交（选择类）改为先选、再“递交”
  document.addEventListener('classlive:choice', (event) => {
    const el = event.detail && event.detail.el;
    const status = el && el.querySelector('[data-live-status]');
    if (status) { status.textContent = AUDIT ? '已选择，点下方“递交”锁定答案（旁听：只在这台设备上）' : '已选择，点下方“递交”交给老师'; status.dataset.state = ''; }
  });

  // 页面里的姓名、学号、班级：按课堂登录信息填写并锁定
  const fields = { name: identity.name, id: identity.sid, class: identity.class_name || '' };
  $$('input[data-student-field]').forEach((input) => {
    const value = fields[input.dataset.studentField];
    if (value === undefined) return;
    if (input.value !== value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.readOnly = true;
    input.title = '已按课堂登录信息填写';
  });

  // ---------- 弹幕 ----------
  const dmForm = panel.querySelector('[data-cl-danmaku]');
  const dmInput = dmForm.querySelector('input');
  const dmButton = dmForm.querySelector('button');
  const dmState = panel.querySelector('[data-cl-dm-state]');
  const COOLDOWN = 5;
  let cooling = 0;
  // 面板和机制图“弹幕接龙”共用每 5 秒一条的冷却；ready() 为 false 的按钮冷却结束后仍保持不可用
  const dmButtons = [{ button: dmButton, ready: () => true }];
  const showCooling = () => dmButtons.forEach(({ button, ready }) => {
    button.textContent = cooling > 0 ? `${cooling}s` : '发送';
    button.disabled = cooling > 0 || !ready();
  });
  const cool = () => {
    cooling = COOLDOWN;
    showCooling();
    const tick = setInterval(() => {
      cooling -= 1;
      showCooling();
      if (cooling <= 0) clearInterval(tick);
    }, 1000);
  };
  const dmProblem = (problem) => (Live.isClosedError(problem) && (onBlocked(), needsRelogin(problem))
    ? reloginText + '。'
    : Live.isClosedError(problem)
    ? '现在不能发弹幕：老师未开放弹幕，或发送太快（每 5 秒一条）。'
    : '发送失败：请检查网络后再试。');
  async function sendDanmaku(text) {
    const doc = { course: config.course, classroom: identity.classroom, name: identity.name, sid: identity.sid, text };
    const color = myDanmakuColor();   // 带上自选字色（投屏页还会按境界核对）
    if (color) doc.color = color;
    if (PREVIEW) await backend.rpc('ck_test_danmaku', { p_classroom: previewRoom, p_text: text, p_color: color || null, p_gift: null });
    else await backend.add('danmaku', doc);
    cool();
    sentMine = true;
    if (typeof scheduleLikes === 'function') scheduleLikes(12000);
    loadMyDanmaku(true);
  }

  // ---------- 我发过的弹幕：查看、删除（后台函数只认本人这次登录发的；删除＝撤回：投屏不再显示，老师的记录里仍保留） ----------
  const mydm = panel.querySelector('[data-cl-mydm]');
  const mydmList = mydm.querySelector('[data-cl-mydm-list]');
  const mydmCount = mydm.querySelector('[data-cl-mydm-count]');
  const mydmState = mydm.querySelector('[data-cl-mydm-state]');
  const MY_STATUS = { new: '已发送', shown: '已上屏', hidden: '老师已隐藏' };
  const sayMine = (text, kind) => { mydmState.textContent = text; mydmState.dataset.state = kind || ''; };
  const notReady = (problem) => /PGRST202|42883|Could not find the function|does not exist|未知的后台函数/i.test(
    `${(problem && problem.code) || ''} ${(problem && problem.message) || problem || ''}`);
  // 弹幕开头的标签（【问3】【正方】【01①→②】）拆出来单独显示
  const splitTags = (text) => {
    let rest = String(text || '');
    const tags = [];
    for (let match = /^【([^】]{1,12})】/.exec(rest); match; match = /^【([^】]{1,12})】/.exec(rest)) {
      tags.push(match[1].replace(/^\d{2}(?=[①②③④])/, ''));
      rest = rest.slice(match[0].length);
    }
    return { tags, rest };
  };
  const setMineCount = () => { const n = mydmList.children.length; mydmCount.textContent = n ? `（${n}）` : ''; };
  function mineItem(row) {
    const li = document.createElement('li');
    const body = document.createElement('span');
    const { tags, rest } = splitTags(row.text);
    tags.forEach((tag) => { const label = document.createElement('b'); label.textContent = tag; body.appendChild(label); });
    body.appendChild(document.createTextNode(rest));
    const meta = document.createElement('em');
    const at = row.ts ? new Date(Number(row.ts)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    meta.textContent = [row.liked ? '「师赞」老师点赞' : '', MY_STATUS[row.status] || '', at].filter(Boolean).join(' · ');
    body.appendChild(meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除';
    let timer = 0;
    const reset = () => { remove.classList.remove('is-confirm'); remove.textContent = '删除'; };
    remove.addEventListener('click', async () => {
      // 第一次点变成“确认删除？”，3 秒内再点一次才删除
      if (!remove.classList.contains('is-confirm')) {
        remove.classList.add('is-confirm');
        remove.textContent = '确认删除？';
        clearTimeout(timer);
        timer = setTimeout(reset, 3000);
        return;
      }
      clearTimeout(timer);
      remove.disabled = true;
      remove.textContent = '正在删除…';
      try {
        const done = await backend.rpc('ck_withdraw_my_danmaku', { p_id: Number(row.id) || row.id });
        li.remove();
        setMineCount();
        sayMine(done === false ? '这条弹幕已经不在了（可能已被老师删除）。' : '已删除，投屏上几秒内会撤下；老师的记录里仍会保留。', 'ok');
      } catch (problem) {
        console.error(problem);
        remove.disabled = false;
        reset();
        sayMine(notReady(problem) ? '这个功能还没开通，请告诉老师。' : '删除失败：请检查网络后再试。', 'error');
      }
    });
    li.append(body, remove);
    return li;
  }
  async function loadMyDanmaku(quiet) {
    if (quiet && !mydm.open) return;
    try {
      const rows = (await backend.rpc('ck_my_danmaku', { p_classroom: Number(identity.classroom) || identity.classroom })) || [];
      mydmList.replaceChildren(...rows.map(mineItem));
      setMineCount();
      sayMine(rows.length ? '只列出你这次登录后在本课堂发的弹幕。删除后投屏上会撤下，但老师的记录里仍会保留，请文明发言。' : '你在本课堂还没有发过弹幕。');
    } catch (problem) {
      console.error(problem);
      sayMine(notReady(problem) ? '这个功能还没开通，请告诉老师。' : '读取失败：请检查网络后再试。', 'error');
    }
  }
  mydm.addEventListener('toggle', () => { if (mydm.open) loadMyDanmaku(); });

  // 老师在投屏上给自己的弹幕点赞：本人页面盖一枚「师赞」朱印（短动画）。只查本人的弹幕（ck_my_danmaku）；
  // 发过弹幕后每 12 秒查一次，没发过时 45 秒一次；已经播过的赞按课堂记在本机，刷新页面不重复播放
  const likedKey = `classlive-liked:${identity.classroom}`;
  const likedStored = load(likedKey, null);
  let likedSeen = new Set(Array.isArray(likedStored) ? likedStored : []);
  let likesPrimed = Array.isArray(likedStored);
  let sentMine = false;
  function stampZan(row, more) {
    const box = document.createElement('div');
    box.className = 'clp-zan';
    box.setAttribute('role', 'status');
    const text = splitTags(row.text).rest.trim();
    box.innerHTML = '<div class="clp-zan-seal" aria-hidden="true">师<br>赞</div><div class="clp-zan-text"></div>';
    const caption = box.querySelector('.clp-zan-text');
    caption.textContent = `老师赞了你的弹幕「${text.length > 18 ? text.slice(0, 18) + '…' : text}」${more > 1 ? `等 ${more} 条` : ''}！`;
    const note = document.createElement('small');
    note.textContent = `每个赞额外加 ${(Live.LIKE || {}).points || 5} 修为（每次课最多算 ${(Live.LIKE || {}).perStudent || 2} 个）`;
    caption.appendChild(note);
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }
  async function checkLikes() {
    if (document.hidden || loginNeeded) return;
    try {
      const rows = (await backend.rpc('ck_my_danmaku', { p_classroom: Number(identity.classroom) || identity.classroom })) || [];
      if (rows.length) sentMine = true;
      const liked = rows.filter((row) => row.liked).map((row) => String(row.id));
      const fresh = rows.filter((row) => row.liked && !likedSeen.has(String(row.id)));
      if (likesPrimed && fresh.length) {
        stampZan(fresh[0], fresh.length);
        if (mydm.open) loadMyDanmaku(true);
      }
      likedSeen = new Set(liked);
      likesPrimed = true;
      save(likedKey, liked);
    } catch (problem) { /* 后台还没有这个函数或网络中断：下次再查 */ }
  }
  let likeTimer = 0;
  const scheduleLikes = (ms) => { if (AUDIT) return; clearTimeout(likeTimer); likeTimer = setTimeout(likeLoop, ms); };   // 旁听不发弹幕，不查点赞
  async function likeLoop() { await checkLikes(); await checkRemoved(); scheduleLikes(sentMine ? 12000 : 45000); }
  // 老师删除了本人的无效弹幕（2026-11-06）：弹窗提醒一次，说明撤回了多少修为（本班各课堂的都算，下次打开页面也能收到）；
  // 跟着上面的轮询走，但至少隔 20 秒查一次，几条一起删时并成一个弹窗
  let removedAt = 0;
  async function checkRemoved() {
    if (OFFLINE || LOCAL_ONLY || document.hidden || loginNeeded || Date.now() - removedAt < 20000) return;
    removedAt = Date.now();
    try {
      const got = await backend.rpc('ck_my_danmaku_removed', { p_classroom: Number(identity.classroom) || identity.classroom });
      const list = (got && got.removed) || [];
      if (!list.length) return;
      const quote = (row) => {
        const text = splitTags(row.text).rest.trim() || String(row.text);
        return `“${text.length > 18 ? `${text.slice(0, 18)}…` : text}”`;
      };
      const total = Number(got.points) || 0;
      const before = Number((myRealm || {}).realm) || 0;
      if (total > 0) await refreshRealm();
      const after = Number((myRealm || {}).realm) || 0;
      const many = `${list.slice(0, 3).map(quote).join('、')}${list.length > 3 ? ' 等' : ''}`;
      let text = list.length === 1
        ? `老师删除了你发的无效弹幕${quote(list[0])}${total > 0 ? `，撤回 ${total} 修为。` : '，这条弹幕不计修为。'}`
        : `老师删除了你发的 ${list.length} 条无效弹幕（${many}）${total > 0 ? `，共撤回 ${total} 修为。` : '，这些弹幕不计修为。'}`;
      if (after < before) text += `你的境界回落到「${REALMS[after].name}」。`;
      egg(text, true, true);
      if (mydm.open) loadMyDanmaku(true);
    } catch (problem) { /* 后台还没有这个函数或网络中断：下次再查 */ }
  }
  // 切回这个页面（手机解锁、从别的应用回来）时马上查一次
  document.addEventListener('visibilitychange', () => { if (!document.hidden && likesPrimed) scheduleLikes(300); });
  const dmLen = panel.querySelector('[data-cl-dm-len]');
  const showLen = () => { if (dmLen) dmLen.textContent = `${dmInput.value.length}/40`; };
  dmInput.addEventListener('input', showLen);
  dmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = dmInput.value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!text || cooling > 0) return;
    dmButton.disabled = true;
    try {
      await sendDanmaku(text);
      dmInput.value = '';
      showLen();
      dmState.textContent = `已发送（${time()}）。若老师开启了审核，通过后才会上屏。`;
      dmState.dataset.state = 'ok';
    } catch (problem) {
      console.error(problem);
      dmButton.disabled = false;
      dmState.dataset.state = 'error';
      dmState.textContent = dmProblem(problem);
    }
  });
  if (AUDIT) {
    // 旁听（2026-11-05）：弹幕接龙、匿名建议（含笑脸投票）、辩论聊天室、经营会都不参加，页面里显示说明
    setupMechDanmaku(false, '旁听同学不能发弹幕，可以看看大家怎么说。');
    setupFeedback(false, `旁听同学不能提交${FB.what}。`);
    setupExamExport();
    setupDebateRooms(false, '旁听同学不参加辩论聊天室，可以看大屏上的辩论。');
    setupBizGames(false, '旁听同学不参加经营会，可以看大屏上的经营台。');
    setupDiscuss(false, '旁听同学不参加分组讨论的聊天室，可以看大屏上各组的观点。');
  } else {
    setupMechDanmaku(true);
    setupFeedback(true);
    setupExamExport();
    setupDebateRooms(true);
    setupBizGames(true);
    setupDiscuss(true);
  }

  // 辩论聊天室（2026-10-28 用户：“设置辩论赛聊天室，正方反方都有各自的聊天室，选择立场后自动进入聊天室（进入聊天室之前可以自己取一个昵称，聊天室中
  // 大家不知道你是谁），然后大家可以在聊天室中发表自己的观点，其它同学可以点赞，每一方被点赞次数最多的三位同学上台辩论……”）：
  // 习经“辩论赛”卡片里的 [data-debate-room]。立场取递交的辩前票（后台核对）；取昵称后进本方聊天室，只看得到本方发言；每 poll 毫秒刷新一次。
  // 学生版测试页（王不凡）的辩前票只在本机：按本机递交的辩前票进入那一方（2026-10-29 用户：“学生选完正反方后，不用再选了，直接填写昵称让他们进入聊天室就行”）。
  // 后台还没有这组函数（未执行 SQL）时显示说明
  // 辩论赛的题号：习经“案例号:debate-pre”（ck_choices），政经“debate.pre”（ck_homework，一个课堂一个案例）
  function debateKey(no, part) { return worksheet ? `debate.${part}` : `${no}:debate-${part}`; }
  function setupDebateRooms(enabled, note) {
    const boxes = $$('[data-debate-room]');
    if (!boxes.length || OFFLINE) return;
    if (!enabled) { boxes.forEach((box) => { box.innerHTML = `<p class="debate-room-off">${esc(note || '进入本周课堂后，递交辩前票就能进入本方聊天室。')}</p>`; }); return; }
    const DB = Live.DEBATE || { likes: 5, win: 5, top: 3, nickMax: 10, textMax: 100, poll: 4000 };
    const SIDE = { pro: '正方', con: '反方' };
    const roomId = Number(identity.classroom) || identity.classroom;
    const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
    const call = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
    boxes.forEach((box) => {
      const no = box.dataset.case;
      shield(box);
      let mode = '';
      let feedKey = '';
      let timer = 0;
      const say = (text, kind) => { const el = box.querySelector('[data-dbr-state]'); if (el) { el.textContent = text || ''; el.dataset.state = kind || ''; } };
      const stop = () => { clearInterval(timer); timer = 0; };
      async function refresh() {
        let state;
        try { state = await call('ck_debate_state', { p_classroom: roomId, p_case: no }); } catch (problem) {
          console.warn('[辩论聊天室]', problem);
          box.innerHTML = `<p class="debate-room-off">${missing(problem) ? '辩论聊天室还没有开通（老师后台尚未更新）。' : '聊天室暂时连不上，请稍后刷新页面。'}</p>`;
          return;
        }
        if (state.status === 'login') { box.innerHTML = '<p class="debate-room-off">请回首页用课堂码重新登录后再进聊天室。</p>'; return; }
        if (state.status === 'pick') { showPick(); return; }
        if (state.status === 'nick' && state.test) {
          const side = localSide();
          if (!side) { showPick(); return; }
          showNick({ ...state, side });
          return;
        }
        if (state.status === 'nick') { showNick(state); return; }
        showRoom();
      }
      // 测试页：本机递交的辩前票（在别的设备递交的，看页面上恢复的选择）
      function localSide() {
        const key = debateKey(no, 'pre');
        if (!locked[key]) return '';
        const group = document.querySelector(`[data-live-choice][data-live-case="${no}"][data-live-item="debate-pre"]`);
        const pressed = group && group.querySelector('[data-live-option][aria-pressed="true"]');
        const checked = document.querySelector(`.cl-debate[data-case="${no}"] input[name="debate-pre"]:checked`);   // 政经辩论赛（单选）
        const value = locked[key].v || (pressed && pressed.dataset.liveOption) || (checked && checked.value);
        return value === 'pro' || value === 'con' ? value : '';
      }
      function showPick() {
        if (mode === 'pick') return;
        mode = 'pick';
        stop();
        box.innerHTML = '<p class="dbr-note">先在上面“① 选立场”选好并点“递交”：递交后自动带你进入本方聊天室。</p>';
      }
      function showNick(state) {
        if (mode === 'nick') return;
        mode = 'nick';
        stop();
        box.innerHTML = `<div class="dbr-join is-${esc(state.side || 'pro')}">
          <p class="dbr-lead">你站在<b>${SIDE[state.side]}</b>：取一个昵称，进入${SIDE[state.side]}聊天室。${state.test ? '（测试页按本机递交的辩前票）' : ''}</p>
          <form class="dbr-nick"><input type="text" maxlength="${DB.nickMax}" placeholder="昵称（2—${DB.nickMax} 个字）" aria-label="聊天室昵称" autocomplete="off"><button type="submit">进入聊天室</button></form>
          <p class="dbr-hint">聊天室里同学看不到你是谁（老师能看到，请文明发言）；不能用自己的名字，进入后不能再改。</p>
          <p class="dbr-state" data-dbr-state role="status"></p></div>`;
        const side = state.side;
        box.querySelector('form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const input = box.querySelector('input');
          const nick = input.value.replace(/\s+/g, '');
          if (nick.length < 2) { say(`昵称至少 2 个字。`, 'error'); return; }
          const button = box.querySelector('form button');
          button.disabled = true;
          try {
            const res = await call('ck_debate_join', { p_classroom: roomId, p_case: no, p_nick: nick, p_side: side });
            const why = { taken: '这个昵称已经有人用了，换一个吧。', own_name: '昵称里不能有你自己的名字（同学会认出你）。', bad_nick: `昵称要 2—${DB.nickMax} 个字。`,
              closed: '这个课堂已经停止，聊天室关闭了。', pick: '先递交辩前票，才能进入本方聊天室。', login: '请回首页用课堂码重新登录。' };
            if (res.status === 'ok') { mode = ''; await refresh(); return; }
            say(why[res.status] || '没有进去，请再试一次。', 'error');
          } catch (problem) {
            console.warn('[辩论聊天室]', problem);
            say(missing(problem) ? '辩论聊天室还没有开通（老师后台尚未更新）。' : '网络不通，请稍后再试。', 'error');
          } finally {
            button.disabled = false;
          }
        });
      }
      // 聊天室（2026-10-29 用户：“要能显示聊天室里面人的名字，你可以参照网上的一些聊天室来设计一下”）：仿群聊——左边成员名单（昵称、在线、点赞），
      // 右边消息气泡（头像取昵称第一个字，自己的靠右）。同学之间仍只看到昵称。
      // 2026-11-05 取消 3v3：顶部一行显示全场（两方合起来）点赞前三的昵称，他们各加修为；辩后投票票多一方聊天室里的同学也加修为
      function showRoom() {
        if (mode !== 'room') {
          mode = 'room';
          feedKey = '';
          box.innerHTML = `<div class="dbr-room">
            <header class="dbr-head"><div><b data-dbr-title></b><span data-dbr-meta></span></div></header>
            <div class="dbr-top" data-dbr-top hidden></div>
            <div class="dbr-body">
              <aside class="dbr-people"><h5 data-dbr-people-title>成员</h5><ul data-dbr-people></ul></aside>
              <div class="dbr-main">
                <div class="dbr-list" data-dbr-list aria-live="polite"></div>
                <form class="dbr-form"><input type="text" maxlength="${DB.textMax}" placeholder="写下你的论点（最多 ${DB.textMax} 字），用上论据卡和本章理论" aria-label="聊天室发言" autocomplete="off"><button type="submit">发送</button></form>
                <p class="dbr-state" data-dbr-state role="status"></p>
              </div>
            </div></div>`;
          box.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = box.querySelector('.dbr-form input');
            const text = input.value.trim();
            if (text.length < 2) { say('写两个字以上再发送。', 'error'); return; }
            const button = box.querySelector('.dbr-form button');
            button.disabled = true;
            try {
              const res = await call('ck_debate_post', { p_classroom: roomId, p_case: no, p_text: text });
              const why = { wait: '发得太快了，等几秒再发。', too_many: '每人最多发 30 条，把机会留给别人吧。', closed: '老师已结束提交，聊天室不能再发言。', short: `发言要 2—${DB.textMax} 个字。`, join: '请先取昵称进入聊天室。' };
              if (res.status === 'ok') { input.value = ''; say(''); await loadFeed(true); } else say(why[res.status] || '没有发出去，请再试一次。', 'error');
            } catch (problem) {
              console.warn('[辩论聊天室]', problem);
              say('网络不通，没有发出去，请稍后再试。', 'error');
            } finally {
              button.disabled = false;
            }
          });
          box.querySelector('[data-dbr-list]').addEventListener('click', async (event) => {
            const like = event.target.closest('[data-dbr-like]');
            if (!like || like.disabled) return;
            const on = like.getAttribute('aria-pressed') !== 'true';
            like.disabled = true;
            try {
              const res = await call('ck_debate_like', { p_post: Number(like.dataset.dbrLike) || like.dataset.dbrLike, p_like: on });
              if (res.status === 'ok') { like.setAttribute('aria-pressed', String(Boolean(res.liked))); like.querySelector('em').textContent = res.likes; }
              else if (res.status === 'mine') say('不能给自己的发言点赞。');
              await loadFeed(true);
            } catch (problem) { console.warn('[辩论聊天室]', problem); } finally { like.disabled = false; }
          });
        }
        loadFeed(true);
        stop();
        timer = setInterval(() => { if (!document.hidden && box.isConnected && !box.closest('[hidden]')) loadFeed(false); }, DB.poll);
      }
      async function loadFeed(force) {
        let feed;
        try { feed = await call('ck_debate_feed', { p_classroom: roomId, p_case: no }); } catch (problem) { console.warn('[辩论聊天室]', problem); return; }
        if (feed.status !== 'ok') { mode = ''; refresh(); return; }
        const people = Array.isArray(feed.list) ? feed.list : [];
        const leaders = Array.isArray(feed.leaders) ? feed.leaders : [];
        const key = JSON.stringify([feed.posts.map((p) => [p.id, p.likes, p.liked]), people, feed.members, feed.others, leaders]);
        if (!force && key === feedKey) return;
        feedKey = key;
        const room = box.querySelector('.dbr-room');
        room.className = `dbr-room is-${feed.side}`;
        const online = people.filter((p) => p.online).length;
        box.querySelector('[data-dbr-title]').textContent = `${SIDE[feed.side]}聊天室`;
        box.querySelector('[data-dbr-meta]').textContent = `我是“${feed.nick}” · 本方 ${feed.members} 人${people.length ? `（在线 ${online}）` : ''} · 对方 ${feed.others} 人`;
        const top = box.querySelector('[data-dbr-top]');
        top.hidden = !leaders.length;
        top.innerHTML = leaders.length ? `<b>全场点赞前三 · 各加 ${DB.likes} 修为</b>${leaders.map((m, i) => `<span class="is-${esc(m.side)}${m.me ? ' is-me' : ''}"><i>${i + 1}</i>${esc(m.nick)}${m.me ? '（我）' : ''}<small>${SIDE[m.side] || ''}</small><em>♥ ${m.likes}</em></span>`).join('')}` : '';
        box.querySelector('[data-dbr-people-title]').textContent = `成员 ${people.length || feed.members}${people.length ? ` · 在线 ${online}` : ''}`;
        box.querySelector('[data-dbr-people]').innerHTML = people.map((p) => `<li class="${p.me ? 'is-me' : ''}">
            ${avatar(p.nick, p.online)}<span><b>${esc(p.nick)}${p.me ? '<small>（我）</small>' : ''}</b><small>♥ ${p.likes} · ${p.posts} 条</small></span></li>`).join('')
          || '<li class="dbr-people-empty">还没有人进来</li>';
        const list = box.querySelector('[data-dbr-list]');
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        const clock = (iso) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
        list.innerHTML = feed.posts.map((p) => `<div class="dbr-msg${p.mine ? ' is-mine' : ''}">${avatar(p.nick)}<div class="dbr-msg-body">
            <div class="dbr-who"><b>${esc(p.nick)}</b><time>${esc(clock(p.at))}</time></div>
            <div class="dbr-bubble"><p>${esc(p.text)}</p><button type="button" class="dbr-like" data-dbr-like="${esc(p.id)}" aria-pressed="${p.liked}"${p.mine ? ' disabled title="自己的发言不能点赞"' : ''} aria-label="点赞">♥ <em>${p.likes}</em></button></div></div></div>`).join('')
          || `<p class="dbr-empty">还没有发言。说说你为什么支持本方：用上一条案例事实或本章的一个理论要点。全场点赞最多的三位同学各加 ${DB.likes} 修为。</p>`;
        if (atBottom || force) list.scrollTop = list.scrollHeight;
      }
      refresh();
      // 递交辩前票后自动进聊天室
      document.addEventListener('classlive:submitted', () => { if (mode === 'pick' || mode === '') { mode = ''; refresh(); } });
    });
  }

  // 经营沙盘（2026-11-03，习经案例 08 第二课时，代替圆桌会议；用户：“让他们自己选择角色卡，然后每个角色卡通过内部聊天室讨论，
  // 最后再各自选出一位同学来代表本角色组做决策”）：[data-biz-room] 本组聊天室，[data-biz-game] 经营会。
  // 角色取递交的“biz-role”（后台核对）；聊天室沿用辩论聊天室的函数（房间＝案例号＋b，ck_debate_post / feed / like）；
  // 代表由老师在投屏页按点赞确认（ck_biz_control）；代表在这里为三项决策投票（ck_biz_vote），大家都看得到四位代表的选择、事件卡和老师揭晓的指标。
  // 测试页（王不凡）按本机递交的角色进入。后台还没有这组函数时显示说明
  function setupBizGames(enabled, note) {
    const sections = $$('[data-biz]').filter((section) => section.querySelector('[data-biz-room], [data-biz-game]'));
    if (!sections.length || OFFLINE) return;
    if (!enabled) {
      sections.forEach((section) => $$('[data-biz-room], [data-biz-game]', section).forEach((box) => { box.innerHTML = `<p class="debate-room-off">${esc(note || '进入本周课堂后，递交角色就能进入本组聊天室。')}</p>`; }));
      return;
    }
    const BZ = Live.BIZ || { rep: 10, top: 5, poll: 3000 };
    const DB = Live.DEBATE || { nickMax: 10, textMax: 100 };
    const roomId = Number(identity.classroom) || identity.classroom;
    const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
    const call = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
    const STAGE = { chat: '各组在聊天室商量本组主张，等老师确认四位代表', vote1: '第一轮决策：四位代表投票中', show1: '第一轮结果已揭晓，等老师抽突发事件卡',
      vote2: '突发事件后：代表可以改投（改投有代价，会扣分）', done: '已结束，看下面的结算结果' };
    sections.forEach((section) => {
      const node = section.querySelector('script[data-biz-public]');
      const pub = node ? JSON.parse(node.textContent) : { roles: [], indicators: [], decisions: [], red: 30 };
      const ROLE = Object.fromEntries(pub.roles.map((r) => [r.key, r.name]));
      const roomBox = section.querySelector('[data-biz-room]');
      const gameBox = section.querySelector('[data-biz-game]');
      const no = (roomBox || gameBox).dataset.case;
      const chatNo = `${no}b`;
      [roomBox, gameBox].filter(Boolean).forEach((box) => shield(box));
      let mode = '';
      let feedKey = '';
      let gameKey = '';
      let state = {};
      let timer = 0;
      const say = (box, text, kind) => { const el = box && box.querySelector('[data-bz-state]'); if (el) { el.textContent = text || ''; el.dataset.state = kind || ''; } };
      const localRole = () => {
        const key = `${no}:biz-role`;
        const group = section.querySelector('[data-live-item="biz-role"]');
        const pressedButton = group && group.querySelector('[data-live-option][aria-pressed="true"]');
        const value = (locked[key] && locked[key].v) || (locked[key] && pressedButton && pressedButton.dataset.liveOption);
        return ROLE[value] ? value : '';
      };
      async function tick(force) {
        if (document.hidden && !force) return;
        try { state = await call('ck_biz_state', { p_classroom: roomId, p_case: no }); } catch (problem) {
          console.warn('[经营沙盘]', problem);
          const text = missing(problem) ? '经营沙盘还没有开通（老师后台尚未更新）。' : '暂时连不上，请稍后刷新页面。';
          [roomBox, gameBox].filter(Boolean).forEach((box) => { box.innerHTML = `<p class="debate-room-off">${text}</p>`; });
          mode = 'error';
          return;
        }
        if (state.status === 'login') { if (roomBox) roomBox.innerHTML = '<p class="debate-room-off">请回首页用课堂码重新登录后再进聊天室。</p>'; mode = 'login'; return; }
        if (roomBox) {
          if (state.status === 'pick') showPick();
          else if (state.status === 'nick') { const role = state.role || (state.test ? localRole() : ''); if (role) showNick(role, state.test); else showPick(); }
          else showRoom(force);
        }
        if (gameBox) renderGame(force);
      }
      function showPick() {
        if (mode === 'pick') return;
        mode = 'pick';
        roomBox.innerHTML = '<p class="dbr-note">先在上面“① 选角色”选好并点“递交”：递交后自动带你进入本组聊天室。</p>';
      }
      function showNick(role, test) {
        if (mode === 'nick') return;
        mode = 'nick';
        roomBox.innerHTML = `<div class="dbr-join is-pro">
          <p class="dbr-lead">你在<b>${esc(ROLE[role])}组</b>：取一个昵称，进入本组聊天室。${test ? '（测试页按本机递交的角色）' : ''}</p>
          <form class="dbr-nick"><input type="text" maxlength="${DB.nickMax}" placeholder="昵称（2—${DB.nickMax} 个字）" aria-label="聊天室昵称" autocomplete="off"><button type="submit">进入聊天室</button></form>
          <p class="dbr-hint">聊天室里同学看不到你是谁（老师能看到，请文明发言）；不能用自己的名字，进入后不能再改。</p>
          <p class="dbr-state" data-bz-state role="status"></p></div>`;
        roomBox.querySelector('form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const nick = roomBox.querySelector('input').value.replace(/\s+/g, '');
          if (nick.length < 2) { say(roomBox, '昵称至少 2 个字。', 'error'); return; }
          const button = roomBox.querySelector('form button');
          button.disabled = true;
          try {
            const res = await call('ck_biz_join', { p_classroom: roomId, p_case: no, p_nick: nick, p_role: role });
            const why = { taken: '这个昵称已经有人用了，换一个吧。', own_name: '昵称里不能有你自己的名字（同学会认出你）。', bad_nick: `昵称要 2—${DB.nickMax} 个字。`,
              closed: '这个课堂已经停止，聊天室关闭了。', pick: '先递交角色，才能进入本组聊天室。', login: '请回首页用课堂码重新登录。' };
            if (res.status === 'ok') { mode = ''; await tick(true); return; }
            say(roomBox, why[res.status] || '没有进去，请再试一次。', 'error');
          } catch (problem) {
            console.warn('[经营沙盘]', problem);
            say(roomBox, missing(problem) ? '经营沙盘还没有开通（老师后台尚未更新）。' : '网络不通，请稍后再试。', 'error');
          } finally {
            button.disabled = false;
          }
        });
      }
      function showRoom(force) {
        if (mode !== 'room') {
          mode = 'room';
          feedKey = '';
          roomBox.innerHTML = `<div class="dbr-room is-pro">
            <header class="dbr-head"><div><b data-bz-title></b><span data-bz-meta></span></div><span class="dbr-stage" data-bz-rep hidden></span></header>
            <div class="dbr-body">
              <aside class="dbr-people"><h5 data-bz-people-title>成员</h5><ul data-bz-people></ul></aside>
              <div class="dbr-main">
                <div class="dbr-list" data-bz-list aria-live="polite"></div>
                <form class="dbr-form"><input type="text" maxlength="${DB.textMax}" placeholder="本组对三项决策怎么主张？用上私密信息和本章理论（最多 ${DB.textMax} 字）" aria-label="聊天室发言" autocomplete="off"><button type="submit">发送</button></form>
                <p class="dbr-state" data-bz-state role="status"></p>
              </div>
            </div></div>`;
          roomBox.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = roomBox.querySelector('.dbr-form input');
            const text = input.value.trim();
            if (text.length < 2) { say(roomBox, '写两个字以上再发送。', 'error'); return; }
            const button = roomBox.querySelector('.dbr-form button');
            button.disabled = true;
            try {
              const res = await call('ck_debate_post', { p_classroom: roomId, p_case: chatNo, p_text: text });
              const why = { wait: '发得太快了，等几秒再发。', too_many: '每人最多发 30 条，把机会留给别人吧。', closed: '老师已结束提交，聊天室不能再发言。', short: `发言要 2—${DB.textMax} 个字。`, join: '请先取昵称进入聊天室。' };
              if (res.status === 'ok') { input.value = ''; say(roomBox, ''); await loadFeed(true); } else say(roomBox, why[res.status] || '没有发出去，请再试一次。', 'error');
            } catch (problem) {
              console.warn('[经营沙盘]', problem);
              say(roomBox, '网络不通，没有发出去，请稍后再试。', 'error');
            } finally {
              button.disabled = false;
            }
          });
          roomBox.querySelector('[data-bz-list]').addEventListener('click', async (event) => {
            const like = event.target.closest('[data-dbr-like]');
            if (!like || like.disabled) return;
            const on = like.getAttribute('aria-pressed') !== 'true';
            like.disabled = true;
            try {
              const res = await call('ck_debate_like', { p_post: Number(like.dataset.dbrLike) || like.dataset.dbrLike, p_like: on });
              if (res.status === 'mine') say(roomBox, '不能给自己的发言点赞。');
              await loadFeed(true);
            } catch (problem) { console.warn('[经营沙盘]', problem); } finally { like.disabled = false; }
          });
        }
        loadFeed(force);
      }
      async function loadFeed(force) {
        let feed;
        try { feed = await call('ck_debate_feed', { p_classroom: roomId, p_case: chatNo }); } catch (problem) { console.warn('[经营沙盘]', problem); return; }
        if (feed.status !== 'ok') { mode = ''; return; }
        const people = Array.isArray(feed.list) ? feed.list : [];
        const reps = (state.game && state.game.reps) || {};
        const rep = reps[feed.side];
        const key = JSON.stringify([feed.posts.map((p) => [p.id, p.likes, p.liked]), people, feed.members, feed.others, rep]);
        if (!force && key === feedKey) return;
        feedKey = key;
        const room = roomBox.querySelector('.dbr-room');
        room.className = `dbr-room is-${feed.side === 'r4' ? 'con' : 'pro'}`;
        const online = people.filter((p) => p.online).length;
        roomBox.querySelector('[data-bz-title]').textContent = `${ROLE[feed.side] || ''}组聊天室`;
        roomBox.querySelector('[data-bz-meta]').textContent = `我是“${feed.nick}” · 本组 ${feed.members} 人${people.length ? `（在线 ${online}）` : ''} · 其他三组 ${feed.others} 人`;
        const pill = roomBox.querySelector('[data-bz-rep]');
        pill.hidden = !rep;
        pill.textContent = rep ? `本组代表：${rep.nick}${state.rep ? '（就是你）' : ''}` : '';
        roomBox.querySelector('[data-bz-people-title]').textContent = `成员 ${people.length || feed.members}${people.length ? ` · 在线 ${online}` : ''}`;
        roomBox.querySelector('[data-bz-people]').innerHTML = people.map((p) => `<li class="${p.me ? 'is-me' : ''}${rep && rep.nick === p.nick ? ' is-debater' : ''}">
            ${avatar(p.nick, p.online)}<span><b>${esc(p.nick)}${p.me ? '<small>（我）</small>' : ''}</b><small>${rep && rep.nick === p.nick ? '<em>代表</em>' : ''}♥ ${p.likes} · ${p.posts} 条</small></span></li>`).join('')
          || '<li class="dbr-people-empty">还没有人进来</li>';
        const list = roomBox.querySelector('[data-bz-list]');
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        const clock = (iso) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
        list.innerHTML = feed.posts.map((p) => `<div class="dbr-msg${p.mine ? ' is-mine' : ''}">${avatar(p.nick)}<div class="dbr-msg-body">
            <div class="dbr-who"><b>${esc(p.nick)}</b>${rep && rep.nick === p.nick ? '<em>代表</em>' : ''}<time>${esc(clock(p.at))}</time></div>
            <div class="dbr-bubble"><p>${esc(p.text)}</p><button type="button" class="dbr-like" data-dbr-like="${esc(p.id)}" aria-pressed="${p.liked}"${p.mine ? ' disabled title="自己的发言不能点赞"' : ''} aria-label="点赞">♥ <em>${p.likes}</em></button></div></div></div>`).join('')
          || '<p class="dbr-empty">还没有发言。说说本组对三项决策的主张：定价、供应链、资金投向各选哪个方案，为什么。点赞最多的建议作者当本组代表。</p>';
        if (atBottom || force) list.scrollTop = list.scrollHeight;
      }
      // 经营会：代表投票（只有代表、只在投票阶段）；大家都看得到四位代表的选择、事件卡和老师揭晓的指标
      function renderGame(force) {
        const game = state.game || {};
        const key = JSON.stringify([game, state.rep, state.role]);
        if (!force && key === gameKey) return;
        gameKey = key;
        const stage = game.stage || 'chat';
        const reps = game.reps || {};
        const votes = game.votes || {};
        const round = stage === 'vote2' || stage === 'done' ? 2 : 1;
        const open = state.rep && (stage === 'vote1' || stage === 'vote2');
        const ballot = (d, role) => {
          const v1 = ((votes['1'] || {})[String(d + 1)] || {})[role];
          const v2 = ((votes['2'] || {})[String(d + 1)] || {})[role];
          return round === 2 ? v2 || v1 : v1;
        };
        const myRole = state.role;
        const shown = game.shown;
        const bars = shown && Array.isArray(shown.values) ? `<div class="bzs-bars">${pub.indicators.map((ind, i) => {
          const v = shown.values[i];
          return `<div class="bzs-bar${v < pub.red ? ' is-low' : ''}"><div class="bzs-bar-head"><b>${esc(ind.name)}</b><small>${ind.role ? `${esc(ind.roleName)}组` : '全班共同'}</small><em>${v}</em></div>
            <div class="bzs-track"><span style="width:${Math.max(0, Math.min(100, v))}%"></span><s style="left:${pub.red}%"></s></div></div>`;
        }).join('')}</div>` : '';
        const verdict = shown && shown.round === 2 ? `<p class="bzg-me">${shown.pass ? `经营合格！本方指标最高：${(shown.top || []).map((k) => `${ROLE[k]}组`).join('、')}。四位代表各加 ${BZ.rep} 修为，指标最高的组里发过言的同学各加 ${BZ.top} 修为。` : '经营不合格：有指标跌破了红线，这次不加修为。'}</p>` : '';
        gameBox.innerHTML = `<p class="bzg-stage"><b>经营会</b>${esc(STAGE[stage] || '')}</p>
          <ul class="bzg-reps">${pub.roles.map((r) => `<li><b>${esc(r.name)}组</b>${reps[r.key] ? `代表 ${esc(reps[r.key].nick)}` : '代表未定'}</li>`).join('')}</ul>
          ${state.rep ? `<p class="bzg-me">你是${esc(ROLE[myRole] || '')}组的代表：${open ? '请为三项决策各投一票（可以改选）。组员在聊天室给你出主意。'
            : stage === 'show1' ? '第一轮投票结束了，等老师抽突发事件卡，之后可以改投。' : stage === 'done' ? '经营会结束了，谢谢你代表本组投票。' : '老师开始投票后，在这里为三项决策投票。'}</p>` : ''}
          ${game.event ? `<div class="bzs-event"><span>突发事件</span><h5>${esc(game.event.title)}</h5><p>${esc(game.event.text)}</p></div>` : ''}
          ${pub.decisions.map((dec, d) => `<div class="bzg-dec"><h5>${d + 1}. ${esc(dec.title)}</h5><div class="bzg-opts">${dec.options.map((text, k) => {
            const c = 'ABC'[k];
            const who = pub.roles.filter((r) => ballot(d, r.key) === c).map((r) => `<i class="bzs-chip is-${r.key}">${esc(r.name)}</i>`).join('');
            const mine = state.rep && ballot(d, myRole) === c;
            const inner = `<span>${c}</span><p>${esc(text)}</p><div class="bzs-who">${who}</div>`;
            return open ? `<button type="button" class="bzg-opt" data-bz-vote="${d + 1}:${c}" aria-pressed="${mine}">${inner}</button>` : `<div class="bzg-opt" aria-pressed="${mine}">${inner}</div>`;
          }).join('')}</div></div>`).join('')}
          ${bars ? `<h5>${shown.round === 2 ? '最终指标' : '第一轮指标'}（红线 ${pub.red}）</h5>${bars}` : ''}${verdict}
          <p class="bzg-state" data-bz-state role="status"></p>`;
      }
      if (gameBox) {
        gameBox.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-bz-vote]');
          if (!button || button.disabled) return;
          const [d, c] = button.dataset.bzVote.split(':');
          button.disabled = true;
          try {
            const res = await call('ck_biz_vote', { p_classroom: roomId, p_case: no, p_decision: Number(d), p_choice: c });
            const why = { not_rep: '你不是本组代表，只有代表能投票。', closed: '现在不是投票时间。', bad: '没有投上，请再试一次。', login: '请回首页用课堂码重新登录。' };
            if (res.status !== 'ok') say(gameBox, why[res.status] || '没有投上，请再试一次。', 'error');
            await tick(true);
          } catch (problem) {
            console.warn('[经营沙盘]', problem);
            say(gameBox, '网络不通，没有投上，请稍后再试。', 'error');
            button.disabled = false;
          }
        });
      }
      tick(true);
      timer = setInterval(() => { if (section.isConnected && !section.closest('[hidden]')) tick(false); }, BZ.poll);
      document.addEventListener('classlive:submitted', () => { if (mode === 'pick' || mode === '') { mode = ''; tick(true); } });
    });
  }

  // 分组讨论（2026-11-11 用户：“你看下能否把‘机制图 · 弹幕接龙’和‘圆桌会议’改为讨论课，比如让学生进行分组讨论？比如可以按照角色的不同分成四组……
  // 讨论的形式可以让同学们在聊天室中进行，然后点赞”）：习经有圆桌会议的案例里的 [data-disc-room]。
  // 角色取递交的“rt-role”（值是角色名，后台按页面传来的四个角色名排第几算 r1—r4）；取昵称后进本组聊天室（房间＝案例号＋d，沿用 ck_debate_post / feed / like），
  // 只看得到本组的发言；顶上显示讨论题、本组任务和本组点赞最多的发言人。测试页（王不凡）按本机递交的角色进入。后台还没有这组函数时显示说明
  function setupDiscuss(enabled, note) {
    const boxes = $$('[data-disc-room]');
    if (!boxes.length || OFFLINE) return;
    if (!enabled) {
      boxes.forEach((box) => { box.innerHTML = `<p class="debate-room-off">${esc(note || '进入本周课堂后，递交角色就能进入本组聊天室。')}</p>`; });
      return;
    }
    const DS = Live.DISCUSS || { leader: 5, win: 5, poll: 3000 };
    const DB = Live.DEBATE || { nickMax: 10, textMax: 100 };
    const roomId = Number(identity.classroom) || identity.classroom;
    const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
    const call = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
    boxes.forEach((roomBox) => {
      const section = roomBox.closest('[data-discuss]') || roomBox.parentElement;
      const no = roomBox.dataset.case;
      const chatNo = `${no}d`;
      let roles = [];
      let asks = [];
      try { roles = JSON.parse(roomBox.dataset.roles || '[]'); asks = JSON.parse(roomBox.dataset.asks || '[]'); } catch (error) { /* 页面数据不全时只显示说明 */ }
      const question = textOf(section.querySelector('.disc-question p'));
      const roleName = (key) => roles[Number(String(key || '').slice(1)) - 1] || '';
      const askOf = (key) => asks[Number(String(key || '').slice(1)) - 1] || '';
      shield(roomBox);
      let mode = '';
      let feedKey = '';
      const say = (text, kind) => { const el = roomBox.querySelector('[data-ds-state]'); if (el) { el.textContent = text || ''; el.dataset.state = kind || ''; } };
      // 测试页：本机递交的角色（角色名）→ r1—r4
      const localRole = () => {
        const key = `${no}:rt-role`;
        const group = section.querySelector('[data-live-item="rt-role"]');
        const pressedButton = group && group.querySelector('[data-live-option][aria-pressed="true"]');
        const value = (locked[key] && locked[key].v) || (pressedButton && pressedButton.dataset.liveOption);
        const at = roles.indexOf(value);
        return at >= 0 ? `r${at + 1}` : '';
      };
      async function tick(force) {
        if (document.hidden && !force) return;
        let state;
        try { state = await call('ck_disc_state', { p_classroom: roomId, p_case: no, p_roles: roles }); } catch (problem) {
          console.warn('[分组讨论]', problem);
          roomBox.innerHTML = `<p class="debate-room-off">${missing(problem) ? '分组讨论的聊天室还没有开通（老师后台尚未更新）。' : '暂时连不上，请稍后刷新页面。'}</p>`;
          mode = 'error';
          return;
        }
        if (state.status === 'login') { roomBox.innerHTML = '<p class="debate-room-off">请回首页用课堂码重新登录后再进聊天室。</p>'; mode = 'login'; return; }
        if (state.status === 'pick') showPick();
        else if (state.status === 'nick') { const role = state.role || (state.test ? localRole() : ''); if (role) showNick(role, state.test); else showPick(); }
        else showRoom(force);
      }
      function showPick() {
        if (mode === 'pick') return;
        mode = 'pick';
        roomBox.innerHTML = '<p class="dbr-note">先在上面“① 选角色 · 进组”选好你代表的一方并点“递交”：递交后在这里取昵称，进入本组聊天室。</p>';
      }
      function showNick(role, test) {
        if (mode === 'nick') return;
        mode = 'nick';
        roomBox.innerHTML = `<div class="dbr-join dsc-join is-${esc(role)}">
          <p class="dbr-lead">你在<b>${esc(roleName(role))}组</b>：取一个昵称，进入本组聊天室。${test ? '（测试页按本机递交的角色）' : ''}</p>
          <form class="dbr-nick"><input type="text" maxlength="${DB.nickMax}" placeholder="昵称（2—${DB.nickMax} 个字）" aria-label="聊天室昵称" autocomplete="off"><button type="submit">进入聊天室</button></form>
          <p class="dbr-hint">聊天室里同学看不到你是谁（老师能看到，请文明发言）；不能用自己的名字，进入后不能再改。</p>
          <p class="dbr-state" data-ds-state role="status"></p></div>`;
        roomBox.querySelector('form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const nick = roomBox.querySelector('input').value.replace(/\s+/g, '');
          if (nick.length < 2) { say('昵称至少 2 个字。', 'error'); return; }
          const button = roomBox.querySelector('form button');
          button.disabled = true;
          try {
            const res = await call('ck_disc_join', { p_classroom: roomId, p_case: no, p_nick: nick, p_roles: roles, p_role: role });
            const why = { taken: '这个昵称已经有人用了，换一个吧。', own_name: '昵称里不能有你自己的名字（同学会认出你）。', bad_nick: `昵称要 2—${DB.nickMax} 个字。`,
              closed: '这个课堂已经停止，聊天室关闭了。', pick: '先递交角色，才能进入本组聊天室。', login: '请回首页用课堂码重新登录。' };
            if (res.status === 'ok') { mode = ''; await tick(true); return; }
            say(why[res.status] || '没有进去，请再试一次。', 'error');
          } catch (problem) {
            console.warn('[分组讨论]', problem);
            say(missing(problem) ? '分组讨论的聊天室还没有开通（老师后台尚未更新）。' : '网络不通，请稍后再试。', 'error');
          } finally {
            button.disabled = false;
          }
        });
      }
      function showRoom(force) {
        if (mode !== 'room') {
          mode = 'room';
          feedKey = '';
          roomBox.innerHTML = `<div class="dbr-room dsc-room">
            <header class="dbr-head"><div><b data-ds-title></b><span data-ds-meta></span></div><span class="dbr-stage" data-ds-lead hidden></span></header>
            <div class="dsc-task"><p><b>讨论题</b>${esc(question)}</p><p data-ds-ask></p></div>
            <div class="dbr-body">
              <aside class="dbr-people"><h5 data-ds-people-title>成员</h5><ul data-ds-people></ul></aside>
              <div class="dbr-main">
                <div class="dbr-list" data-ds-list aria-live="polite"></div>
                <form class="dbr-form"><input type="text" maxlength="${DB.textMax}" placeholder="本方主张什么、为什么、怎样说服另外三组？（最多 ${DB.textMax} 字）" aria-label="聊天室发言" autocomplete="off"><button type="submit">发送</button></form>
                <p class="dbr-state" data-ds-state role="status"></p>
              </div>
            </div></div>`;
          roomBox.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = roomBox.querySelector('.dbr-form input');
            const text = input.value.trim();
            if (text.length < 2) { say('写两个字以上再发送。', 'error'); return; }
            const button = roomBox.querySelector('.dbr-form button');
            button.disabled = true;
            try {
              const res = await call('ck_debate_post', { p_classroom: roomId, p_case: chatNo, p_text: text });
              const why = { wait: '发得太快了，等几秒再发。', too_many: '每人最多发 30 条，把机会留给别人吧。', closed: '老师已结束提交，聊天室不能再发言。', short: `发言要 2—${DB.textMax} 个字。`, join: '请先取昵称进入聊天室。' };
              if (res.status === 'ok') { input.value = ''; say(''); await loadFeed(true); } else say(why[res.status] || '没有发出去，请再试一次。', 'error');
            } catch (problem) {
              console.warn('[分组讨论]', problem);
              say('网络不通，没有发出去，请稍后再试。', 'error');
            } finally {
              button.disabled = false;
            }
          });
          roomBox.querySelector('[data-ds-list]').addEventListener('click', async (event) => {
            const like = event.target.closest('[data-dbr-like]');
            if (!like || like.disabled) return;
            const on = like.getAttribute('aria-pressed') !== 'true';
            like.disabled = true;
            try {
              const res = await call('ck_debate_like', { p_post: Number(like.dataset.dbrLike) || like.dataset.dbrLike, p_like: on });
              if (res.status === 'mine') say('不能给自己的发言点赞。');
              await loadFeed(true);
            } catch (problem) { console.warn('[分组讨论]', problem); } finally { like.disabled = false; }
          });
        }
        loadFeed(force);
      }
      async function loadFeed(force) {
        let feed;
        try { feed = await call('ck_debate_feed', { p_classroom: roomId, p_case: chatNo }); } catch (problem) { console.warn('[分组讨论]', problem); return; }
        if (feed.status !== 'ok') { mode = ''; return; }
        const people = Array.isArray(feed.list) ? feed.list : [];
        const top = (Array.isArray(feed.top) ? feed.top : []).filter((t) => t.likes > 0);
        const lead = top[0] || null;
        const key = JSON.stringify([feed.posts.map((p) => [p.id, p.likes, p.liked]), people, feed.members, feed.others, top]);
        if (!force && key === feedKey) return;
        feedKey = key;
        const room = roomBox.querySelector('.dbr-room');
        room.className = `dbr-room dsc-room is-${feed.side}`;
        const online = people.filter((p) => p.online).length;
        roomBox.querySelector('[data-ds-title]').textContent = `${roleName(feed.side)}组聊天室`;
        roomBox.querySelector('[data-ds-meta]').textContent = `我是“${feed.nick}” · 本组 ${feed.members} 人${people.length ? `（在线 ${online}）` : ''} · 其他三组 ${feed.others} 人`;
        roomBox.querySelector('[data-ds-ask]').innerHTML = askOf(feed.side) ? `<b>本组任务</b>${esc(askOf(feed.side))}` : '';
        const pill = roomBox.querySelector('[data-ds-lead]');
        pill.hidden = !lead;
        pill.textContent = lead ? `本组发言人：${lead.nick}${lead.me ? '（就是你）' : ''} · ♥ ${lead.likes}` : '';
        roomBox.querySelector('[data-ds-people-title]').textContent = `成员 ${people.length || feed.members}${people.length ? ` · 在线 ${online}` : ''}`;
        roomBox.querySelector('[data-ds-people]').innerHTML = people.map((p) => `<li class="${p.me ? 'is-me' : ''}${lead && lead.nick === p.nick ? ' is-debater' : ''}">
            ${avatar(p.nick, p.online)}<span><b>${esc(p.nick)}${p.me ? '<small>（我）</small>' : ''}</b><small>${lead && lead.nick === p.nick ? '<em>发言人</em>' : ''}♥ ${p.likes} · ${p.posts} 条</small></span></li>`).join('')
          || '<li class="dbr-people-empty">还没有人进来</li>';
        const list = roomBox.querySelector('[data-ds-list]');
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        const clock = (iso) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
        list.innerHTML = feed.posts.map((p) => `<div class="dbr-msg${p.mine ? ' is-mine' : ''}">${avatar(p.nick)}<div class="dbr-msg-body">
            <div class="dbr-who"><b>${esc(p.nick)}</b>${lead && lead.nick === p.nick ? '<em>发言人</em>' : ''}<time>${esc(clock(p.at))}</time></div>
            <div class="dbr-bubble"><p>${esc(p.text)}</p><button type="button" class="dbr-like" data-dbr-like="${esc(p.id)}" aria-pressed="${p.liked}"${p.mine ? ' disabled title="自己的发言不能点赞"' : ''} aria-label="点赞">♥ <em>${p.likes}</em></button></div></div></div>`).join('')
          || `<p class="dbr-empty">还没有发言。先说说本组的主张：本方最想要什么、为什么、怎样说服另外三组。看到说得好的就点赞——点赞最多的就是本组发言人（加 ${DS.leader} 修为）。</p>`;
        if (atBottom || force) list.scrollTop = list.scrollHeight;
      }
      tick(true);
      setInterval(() => { if (roomBox.isConnected && !roomBox.closest('[hidden]')) tick(false); }, DS.poll);
      document.addEventListener('classlive:submitted', () => { if (mode === 'pick' || mode === '') { mode = ''; tick(true); } });
    });
  }

  // 头像：昵称第一个字，底色按昵称算出（同一昵称颜色固定）；online 不传＝不显示在线点
  function avatar(nick, online) {
    const hue = Array.from(String(nick || '')).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 17);
    return `<i class="dbr-av" style="--h:${hue}" aria-hidden="true">${esc(Array.from(String(nick || '?'))[0])}${online === undefined ? '' : `<s class="${online ? 'is-on' : ''}"></s>`}</i>`;
  }
  // 期中考查作业（2026-10-28）：学生一键导出自己的作业（Word，含姓名、学号、班级、递交时间），草稿也能导出备份
  function setupExamExport() {
    const area = $('textarea[data-cl-text="exam"]');
    const O = Live.office;
    if (!area || !O) return;
    const box = area.closest('.cl-essay') || area.parentElement;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clp-xl-send';
    button.textContent = '导出 Word（含姓名、学号）';
    shield(button);
    box.appendChild(button);
    // 2026-10-29 按用户截图改版：学生信息栏（班级、学号、姓名）、“作答说明”框（含作答要求）、作答题目、作答
    button.addEventListener('click', () => {
      const entry = locked.exam;
      const text = (entry && entry.v) || area.value || '';
      const words = String(text).replace(/\s/g, '').length;
      const node = document.getElementById('concept-data');
      const D = node ? JSON.parse(node.textContent) : {};
      const info = D.exam || {};
      const title = info.title || textOf($('#start h2')) || '期中考查作业';
      const dueAt = Number(area.dataset.due) || 0;
      const d = new Date(dueAt);
      const deadline = dueAt ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（周${'日一二三四五六'[d.getDay()]}）${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
      const notes = O.examNotes({ chapter: D.chapterTitle, type: info.type, words: info.words, requirements: $$('.cl-essay-req li', box).map(textOf), deadline });
      const status = entry ? (entry.other ? '已在其他设备递交（以第一次为准）' : `已递交 ${entry.iso ? new Date(entry.iso).toLocaleString('zh-CN', { hour12: false }) : entry.at || ''}`) : '未递交（草稿）';
      const body = O.para('政治经济学 · 期中考查作业', 'title') + O.para(`${title}（${info.type ? `${info.type}题 · ` : ''}总分 100 分）`, 'subtitle')
        + O.examHead({ klass: identity.class_name, sid: identity.sid, name: identity.name }, notes)
        + O.para('一、作答题目', 'h') + O.para([{ text: textOf(box.querySelector('.cl-essay-q')), bold: true }], 'body')
        + O.para('二、作答', 'h') + O.para(`${status}　　字数：${words} 字`, 'note')
        + (String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => O.para(line, 'body')).join('') || O.para('（还没有写）', 'note'));
      const safe = (value) => String(value || '').replace(/[\\/:*?"<>|\s]+/g, '_');
      O.save(O.docx(body), `期中考查作业_${safe(identity.sid)}_${safe(identity.name)}.docx`);
    });
  }

  // 每次打开本章页面都向后台核对：这台设备是否已经过首页核对（课堂码＋点名册＋口令）登录本课堂；没有就提示回首页重新登录。
  // 同一课堂分几次课上时，后台在每天第一次打开时补记一次登录，老师可按日期看每次到课
  const reloginBox = panel.querySelector('[data-cl-relogin]');
  const checkMembership = () => (PREVIEW ? Promise.resolve('ok') : backend.rpc('ck_checkin_today', { p_classroom: Number(identity.classroom) || identity.classroom, p_sid: identity.sid }))
    .then((result) => {
      const status = Array.isArray(result) ? result[0] : result;
      // 老师把旁听改成“加进点名册”或反过来（2026-11-05）：按后台的身份重新打开本页
      if ((status === 'audit' && !AUDIT) || (status === 'ok' && AUDIT)) {
        const flip = { ...identity, audit: status === 'audit' };
        save(STORE, flip);
        save(`${STORE}:${config.course}:${unit}`, flip);
        location.reload();
        return status;
      }
      loginNeeded = status === 'login';
      // 刚从首页登录进来（3 分钟内）：上方提示一句登录结果（2026-11-06 用户：“学生登录课程的时候设置一个加载页面，可以让他们看到登录情况”）
      const joinedAt = Number(identity.joined_at) || 0;
      if ((status === 'ok' || status === 'audit') && joinedAt && Date.now() - joinedAt < 180000) {
        const welcomeKey = `classlive-welcome:${identity.classroom}:${joinedAt}`;
        try {
          if (!sessionStorage.getItem(welcomeKey)) {
            sessionStorage.setItem(welcomeKey, '1');
            toast(`已进入课堂：${identity.name}（${identity.sid}）${identity.classroom_name ? ` · ${identity.classroom_name}` : ''}${AUDIT ? ' · 旁听' : ''}。登录已记录，可以开始作答了。`);
          }
        } catch (error) { /* 忽略 */ }
      }
      // 隐藏彩蛋（2026-11-05 用户：“对于一个礼拜登陆3次以上的同学，也自动增加10点修为值”）：后台只在加上修为的这一次多返回 {bonus, days}
      const extra = Array.isArray(result) ? result[1] : null;
      if (status === 'ok' && !LOCAL_ONLY && extra && Number(extra.bonus) > 0) {
        egg(`这周你已经登录 ${Number(extra.days) || 3} 天啦！勤学不辍，修为值提升 ${Number(extra.bonus)} 点（每周一次）^_^`);
      }
      reloginBox.hidden = !loginNeeded;
      panel.querySelector('[data-cl-mini-dot]').hidden = !loginNeeded;
      if (loginNeeded && panel.classList.contains('is-folded')) panel.querySelector('[data-cl-fold]').click();
      return status;
    })
    .catch((problem) => { console.warn('[登录核对] 没有完成：', (problem && problem.message) || problem); return null; });
  let blockedAt = 0;
  onBlocked = () => { if (Date.now() - blockedAt > 10000) { blockedAt = Date.now(); checkMembership(); } };
  const checkedIn = checkMembership();
  // 旁听（2026-11-05）：每分钟再核对一次，老师改为“加进点名册”后本页自动切换为正式（正式同学被改为旁听时，下一次递交被后台拒收就会核对、切换）
  if (AUDIT) setInterval(() => { if (!document.hidden) checkMembership(); }, 60000);
  if (!OFFLINE && joined) checkedIn.then(() => questions.forEach((q) => {
    const entry = locked[q.key];
    if (q.after && entry && entry.v != null && !load(xlFlag(q.key), 0)) q.after(entry.v, true);
  }));
  checkedIn.then(() => scheduleLikes(3000));
  // 隐藏彩蛋（2026-11-05 用户：“老师也可以进行点赞……学生下次登陆的时候弹出一条信息”）：老师在工作台点赞采纳了自己的匿名建议，
  // 打开页面时弹出（ck_my_notices 返回新加的修为，问过即记为已通知；本班哪个课堂的建议都算）
  if (!OFFLINE && !LOCAL_ONLY && joined) checkedIn.then((status) => {
    if (status !== 'ok') return;
    backend.rpc('ck_my_notices', { p_classroom: Number(identity.classroom) || identity.classroom }).then((got) => {
      const row = Array.isArray(got) ? got[0] : got;
      const points = Number(row && row.adopt) || 0;
      if (points > 0) egg(`你的匿名建议已被采纳，虽然不知道你是谁，但是恭喜你的修为值莫名提升了${points}点，勇敢的人先享受世界^_^`, true);
    }).catch(() => {});   // 后台还没有这个函数（未执行 SQL）时安静跳过
  });

  // 在线状态：页面在前台（没有切走、手机没锁屏）时每 45 秒向后台报一次“在线”，老师在工作台加入名单里看到小绿灯；
  // 后台还没有 ck_ping（未执行 SQL）时安静停止；旁听不报在线（工作台小绿灯、猜词抽人只看点名册上的同学）
  if (!LOCAL_ONLY) {
    let pingOff = false;
    const ping = () => {
      if (pingOff || document.hidden || loginNeeded) return;
      backend.rpc('ck_ping', { p_classroom: Number(identity.classroom) || identity.classroom }).catch((problem) => {
        if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem))) pingOff = true;
      });
    };
    checkedIn.then(ping);
    setInterval(ping, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
  }

  // ---------- 时间轴排排站·全班分队（2026-11-11 用户：“PK 对决 · 时间轴排排站，改一下玩法，将已加入班级的同学随机平均分成两组，而不是抽两名同学上台。
  //   然后在固定时间内（比如10秒）让所有学生可以在自己的设备上选择这件事该放在时间轴的哪个位置，倒计时结束看哪一方正确的数量更多，类似于情景猜谜的抢答。
  //   一题结束后揭示正确答案，另外一个按钮可以开始下一题。最终得分最高一方的修为值集体+1。”）----------
  //   · 只在有“时间轴排排站”的案例页上问后台（页面里有 [data-pk-type="timeline"]）；老师在投屏页大屏点“分组”后 ck_tl_live 返回 open，弹出对话框；
  //   · 倒计时按后台时钟（同情境猜谜：按请求往返估计时差），倒计时内点位置就交（可以改选，以最后一次为准）；正确位置只在后台，揭晓后才返回；
  //   · 揭晓后显示正确位置、自己对不对、两队答对人数和比分；结束显示胜方和修为。旁听、测试页不参加；后台没有这组函数（未执行 SQL）时安静停止
  if (!LOCAL_ONLY && document.querySelector('[data-pk-type="timeline"]')) setupTimeline();
  function setupTimeline() {
    const T = Live.TIMELINE || { points: 1 };
    const SIDE = { red: '红方', blue: '蓝方' };
    const box = document.createElement('div');
    box.className = 'clp-tl';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '时间轴排排站');
    box.innerHTML = `<div class="clp-tl-head"><b>时间轴排排站</b><span class="clp-tl-team" data-tl-team></span><span class="clp-tl-q" data-tl-q></span>
        <button type="button" class="clp-tl-fold" data-tl-fold aria-expanded="true">收起</button></div>
      <div class="clp-tl-body">
        <div class="clp-tl-score" data-tl-score></div>
        <div data-tl-main></div>
        <div class="clp-tl-count" data-tl-count hidden><span class="clp-tl-num" data-tl-num></span><span data-tl-count-text></span></div>
        <ol class="clp-tl-line" data-tl-line></ol>
        <p class="clp-tl-state" data-tl-state role="status" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(box);
    const $tl = (key) => box.querySelector(`[data-tl-${key}]`);
    const room = Number(identity.classroom) || identity.classroom;
    const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
    let game = null;
    let offset = null;
    let off = false;
    let noLogin = false;
    let busy = false;
    let picked = null;       // 本机刚点的位置（后台确认前先显示）
    let stamp = '';
    let shownNum = null;
    let tick = 0;
    let poll = 0;
    let lineKey = '';
    let holdUntil = 0;
    const say = (text, state) => { const el = $tl('state'); el.textContent = text; el.dataset.state = state || ''; };
    const serverNow = () => Date.now() + (offset || 0);
    const leftMs = () => (game && game.end_at ? Number(game.end_at) - serverNow() : 0);
    function measure(t0, t1, now) {
      const value = Number(now);
      if (!value) return;
      const estimate = value - (t0 + t1) / 2;
      if (offset === null || Math.abs(estimate - offset) > 250) offset = estimate;
    }
    const mineSlot = () => (picked !== null ? picked : game && game.mine != null ? Number(game.mine) : null);
    function paintLine(mode) {
      // mode：pick 可以选 / locked 时间到 / reveal 揭晓 / none 不显示
      const slots = (game && game.slots) || [];
      const mine = mineSlot();
      const answer = game && game.answer != null ? Number(game.answer) : null;
      const key = `${mode}|${game && game.q_no}|${mine}|${answer}|${slots.length}`;
      if (key === lineKey) return;
      lineKey = key;
      const line = $tl('line');
      if (mode === 'none' || !slots.length) { line.innerHTML = ''; line.hidden = true; return; }
      line.hidden = false;
      const parts = [];
      for (let i = 0; i <= slots.length; i += 1) {
        let cls = '';
        let text = '放在这里';
        if (mode === 'reveal') {
          if (i === answer) { cls = ' is-right'; text = i === mine ? '正确位置 · 你选对了' : '正确位置'; }
          else if (i === mine) { cls = ' is-wrong'; text = '你选的位置'; }
        } else if (i === mine) { cls = ' is-picked'; text = mode === 'locked' ? '你选的位置' : '已选（可以改选）'; }
        parts.push(`<li><button type="button" class="clp-tl-slot${cls}" data-tl-slot="${i}"${mode === 'pick' ? '' : ' disabled'}><i>${i + 1}</i>${esc(text)}</button></li>`);
        if (i < slots.length) parts.push(`<li class="clp-tl-ev"><span>${esc(slots[i].date)}</span>${esc(slots[i].label)}</li>`);
      }
      line.innerHTML = parts.join('');
    }
    function paintScore() {
      const el = $tl('score');
      if (!game || !(Number(game.q_no) > 0)) { el.innerHTML = ''; return; }
      el.innerHTML = `<span class="is-red">红方 <b>${Number(game.score_red) || 0}</b></span><span>：</span><span class="is-blue"><b>${Number(game.score_blue) || 0}</b> 蓝方</span>`;
    }
    function paint() {
      if (!game) { box.hidden = true; return; }
      box.hidden = false;
      const team = game.team;
      box.classList.toggle('is-red', team === 'red');
      box.classList.toggle('is-blue', team === 'blue');
      const teamEl = $tl('team');
      teamEl.className = `clp-tl-team${team ? ` is-${team}` : ''}`;
      teamEl.textContent = team ? `你在${SIDE[team]}` : '';
      $tl('q').textContent = Number(game.q_no) > 0 ? `第 ${game.q_no}${game.q_total ? ` / ${game.q_total}` : ''} 题` : '等待出题';
      paintScore();
      const main = $tl('main');
      const count = $tl('count');
      const sizes = game.sizes || {};
      const phase = game.phase;
      if (phase === 'rules') {
        count.hidden = true;
        main.innerHTML = `<p class="clp-tl-wait">全班已随机分成两队：你在<b class="is-${esc(team || 'red')}">${esc(SIDE[team] || '')}</b>（${Number(sizes[team]) || 0} 人），
          对手${esc(SIDE[team === 'red' ? 'blue' : 'red'])} ${Number(sizes[team === 'red' ? 'blue' : 'red']) || 0} 人。</p>`;
        paintLine('none');
        say('老师出题后，在这里选大屏上那张事件卡该放在时间轴的第几个位置；倒计时内可以改选。每题答对人数多的一队得 1 分，最后得分高的一队每人修为 +' + (T.points || 1) + '。');
        return;
      }
      if (phase === 'over') {
        count.hidden = true;
        const win = game.winner;
        const mineWon = win === 'tie' || (team && win === team);
        main.innerHTML = `<div class="clp-tl-over">${win === 'red' || win === 'blue' ? `<big>🏆</big>${esc(SIDE[win])}获胜！` : win === 'tie' ? '<big>🤝</big>平局！两队并列第一' : '比赛结束'}</div>`;
        paintLine('none');
        say(win === 'none' ? '这一局没有揭晓过题目，不加修为。' : mineWon ? `你所在的${esc(SIDE[team] || '队伍')}每人修为 +${T.points || 1}（老师结算修为时计入）。` : `这一局${esc(SIDE[win])}赢了，下次加油！`, mineWon && win !== 'none' ? 'ok' : '');
        return;
      }
      const cardHtml = `<div class="clp-tl-card"><small>这件事该放在时间轴的哪个位置？</small><b>${esc(game.card || '')}</b></div>`;
      if (phase === 'reveal') {
        count.hidden = true;
        const red = Number(game.red_ok) || 0;
        const blue = Number(game.blue_ok) || 0;
        const win = red > blue ? 'red' : blue > red ? 'blue' : 'tie';
        main.innerHTML = `${cardHtml}<div class="clp-tl-tally"><div class="is-red${win === 'red' ? ' is-win' : ''}">红方答对<b>${red}</b></div><div class="is-blue${win === 'blue' ? ' is-win' : ''}">蓝方答对<b>${blue}</b></div></div>`;
        paintLine('reveal');
        const mine = mineSlot();
        const mineLine = mine === null ? '这题你没有作答。' : game.ok ? '你放对了！' : `你选的是第 ${mine + 1} 个位置，正确的是第 ${Number(game.answer) + 1} 个。`;
        say(`${mineLine}${win === 'tie' ? '两队答对人数相同，本题不计分。' : `${SIDE[win]}答对的人多，得 1 分。`}等老师出下一题。`, game.ok ? 'ok' : mine === null ? '' : 'bad');
        return;
      }
      // ask：倒计时内可以选；到 0 锁住等揭晓
      const left = leftMs();
      if (!main.querySelector('.clp-tl-card') || main.dataset.q !== String(game.q_no)) { main.innerHTML = cardHtml; main.dataset.q = String(game.q_no); }
      if (left > 0) {
        const n = Math.ceil(left / 1000);
        count.hidden = false;
        count.classList.toggle('is-hurry', n <= 3);
        if (n !== shownNum) {
          shownNum = n;
          $tl('num').textContent = String(n);
          count.classList.remove('is-tick'); void count.offsetWidth; count.classList.add('is-tick');
        }
        $tl('count-text').textContent = '秒内选好位置（全班同步倒计时）';
        paintLine('pick');
        if (Date.now() >= holdUntil && !busy) say(mineSlot() === null ? '点下面的位置作答；倒计时结束前可以改选。' : `已选第 ${mineSlot() + 1} 个位置，倒计时结束前可以改选。`, mineSlot() === null ? '' : 'ok');
      } else {
        count.hidden = false;
        count.classList.remove('is-hurry');
        $tl('num').textContent = '0';
        $tl('count-text').textContent = '时间到，等老师揭晓';
        paintLine('locked');
        if (Date.now() >= holdUntil) say(mineSlot() === null ? '这题没来得及作答。' : `你选的是第 ${mineSlot() + 1} 个位置，等老师揭晓。`);
      }
    }
    function startTick() {
      clearInterval(tick);
      tick = 0;
      if (game && game.phase === 'ask' && leftMs() > 0) {
        tick = setInterval(() => { paint(); if (leftMs() <= 0) { clearInterval(tick); tick = 0; paint(); } }, 100);
      }
    }
    function apply(data, t0, t1) {
      if (data) measure(t0, t1, data.now);
      if (!data || data.status !== 'open') {
        game = null; stamp = ''; picked = null; lineKey = '';
        clearInterval(tick); tick = 0;
        box.hidden = true;
        return;
      }
      const key = `${data.phase}:${data.q_no}:${data.end_at || ''}`;
      if (key !== stamp) {
        const fresh = data.phase === 'ask' && !stamp.startsWith(`ask:${data.q_no}:`);
        stamp = key;
        picked = null;
        shownNum = null;
        lineKey = '';
        if (fresh) { box.classList.remove('is-folded'); $tl('fold').textContent = '收起'; $tl('fold').setAttribute('aria-expanded', 'true'); }
      }
      if (data.mine != null && picked !== null && Number(data.mine) === picked) picked = null;
      game = data;
      paint();
      startTick();
    }
    function schedule() {
      clearTimeout(poll);
      // 游戏进行中：出题时每 1.5 秒、其余每 2.5 秒；没有游戏每 4 秒；这台设备没登录本课堂时 30 秒
      poll = setTimeout(check, game ? (game.phase === 'ask' ? 1500 : 2500) : (noLogin || loginNeeded) ? 30000 : 4000);
    }
    async function check() {
      clearTimeout(poll);
      if (off) return;
      if (document.hidden || loginNeeded) { schedule(); return; }
      const t0 = Date.now();
      try {
        const result = await backend.rpc('ck_tl_live', { p_classroom: room });
        const data = Array.isArray(result) ? result[0] : result;
        noLogin = Boolean(data && data.status === 'login');
        apply(noLogin ? null : data, t0, Date.now());
      } catch (problem) {
        if (missing(problem)) { off = true; box.hidden = true; return; }
      }
      schedule();
    }
    box.addEventListener('click', async (event) => {
      if (event.target.closest('[data-tl-fold]')) {
        const folded = box.classList.toggle('is-folded');
        $tl('fold').textContent = folded ? '展开' : '收起';
        $tl('fold').setAttribute('aria-expanded', String(!folded));
        return;
      }
      const button = event.target.closest('[data-tl-slot]');
      if (!button || button.disabled || !game || game.phase !== 'ask') return;
      if (leftMs() <= 0) { say('时间到了，不能再改。', 'bad'); return; }
      const slot = Number(button.dataset.tlSlot);
      const before = picked;
      picked = slot;
      busy = true;
      paint();
      const t0 = Date.now();
      try {
        const result = await backend.rpc('ck_tl_answer', { p_classroom: room, p_q_no: Number(game.q_no), p_slot: slot });
        const data = (Array.isArray(result) ? result[0] : result) || {};
        busy = false;
        holdUntil = Date.now() + 2500;
        if (data.status === 'ok') {
          game.mine = slot;
          if (data.team && !game.team) game.team = data.team;
          picked = null;
          paint();
          say(`已选第 ${slot + 1} 个位置，倒计时结束前可以改选。`, 'ok');
        } else if (data.status === 'late') {
          measure(t0, Date.now(), data.now);
          picked = before;
          paint();
          say('时间到了，这次没有记上。', 'bad');
        } else if (data.status === 'login') {
          picked = before;
          say('这台设备还没有登录本堂课：请回首页用课堂码重新登录。', 'bad');
        } else {
          picked = before;
          say('这一题已经结束了。', 'bad');
          check();
        }
      } catch (problem) {
        busy = false;
        picked = before;
        paint();
        say('没有交上，请检查网络后再点一次。', 'bad');
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    checkedIn.then(check);
  }

  // 情境猜谜抢答（2026-11-05 改为对话框）：用户：“老师点击‘看玩法’或者‘开始第一题’后，学生端立马出现情景猜谜抢答对话框。该对话框在未关闭游戏期间一直存在。
  // 然后学生端统一延迟10秒才可以抢答，在此期间学生端会有倒计时，要注意所有学生的倒计时都要求是同步的（如果不同步的话瞬间刷新同步），倒计时结束才可以输入答案抢答。
  // 点‘下一题’后重新开始倒计时，在倒计时的同时也在同步学生端，这样可以缓解有些同学因为网速原因弹不出输入框。”
  //   · 后台 ck_puzzle_live 在投屏页大屏打开期间一直返回 open（phase：rules 讲玩法 / ask 出题 / reveal 揭晓），出题时带 go_at（可以抢答的时刻）和后台现在的时刻；
  //   · 本页按“后台时刻－请求往返中点”估计本机与后台的时差，倒计时一律按后台时钟算，所以全班同时到 0；每次读到的时差与原来差 0.25 秒以上就立刻改用新的；
  //   · 对话框打开时每 2 秒、没打开时每 3 秒问一次后台（页面在前台时）；倒计时没结束输入框不能用，后台 ck_puzzle_guess 也不收（返回 wait 时顺带重新同步）。
  //   谜底由后台核对（学生页拿不到谜底），每题最多猜 PUZZLE.tries 次，第一个猜中的自动加修为；后台还没有这组函数（未执行 SQL）时安静停止
  if (!LOCAL_ONLY) setupPuzzle();   // 旁听不参加抢答
  function setupPuzzle() {
    const P = Live.PUZZLE || { points: 5, tries: 3, delay: 10 };
    const delay = P.delay || 10;
    const box = document.createElement('div');
    box.className = 'clp-pzd';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '情境猜谜抢答');
    box.innerHTML = `<div class="clp-pzd-head"><b>情境猜谜抢答</b><span data-pzd-label></span></div>
      <details class="clp-pzd-surface" data-pzd-surface hidden><summary>看汤面</summary><p></p></details>
      <div class="clp-pzd-count" data-pzd-count hidden><span class="clp-pzd-num" data-pzd-num></span><span data-pzd-count-text></span></div>
      <form class="clp-pzd-form" data-pzd-form>
        <input type="text" maxlength="20" aria-label="情境猜谜的谜底" autocomplete="off" enterkeyhint="send">
        <button type="submit">抢答</button>
      </form>
      <p class="clp-pzd-state" data-pzd-state role="status" aria-live="polite"></p>`;
    document.body.appendChild(box);
    const form = box.querySelector('[data-pzd-form]');
    const input = form.querySelector('input');
    const button = form.querySelector('button');
    const stateEl = box.querySelector('[data-pzd-state]');
    const labelEl = box.querySelector('[data-pzd-label]');
    const surfaceBox = box.querySelector('[data-pzd-surface]');
    const countEl = box.querySelector('[data-pzd-count]');
    const numEl = box.querySelector('[data-pzd-num]');
    const countText = box.querySelector('[data-pzd-count-text]');
    const room = Number(identity.classroom) || identity.classroom;
    const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
    let round = null;        // 后台最近一次返回的状态
    let off = false;
    let busy = false;
    let offset = null;       // 后台时钟－本机时钟（毫秒）
    let goAt = null;         // 本题可以抢答的时刻（后台时钟）
    let shownNum = null;
    let tick = 0;
    let poll = 0;
    let stamp = '';          // 换题、换阶段时清空输入框
    let noLogin = false;     // 这台设备没登录本课堂（后台返回 login）：放慢询问
    let holdUntil = 0;       // 刚抢答过：几秒内不让定时刷新盖掉“不对，再想想”之类的提示
    const say = (text, state) => { stateEl.textContent = text; stateEl.dataset.state = state || ''; };
    const serverNow = () => Date.now() + (offset || 0);
    const leftMs = () => (goAt ? goAt - serverNow() : 0);
    // 按一次请求的往返估计时差；和原来差 0.25 秒以上就立刻改用新的（“不同步就瞬间刷新同步”），小的网络抖动不让数字来回跳
    function measure(t0, t1, now) {
      const value = Number(now);
      if (!value) return;
      const estimate = value - (t0 + t1) / 2;
      if (offset === null || Math.abs(estimate - offset) > 250) offset = estimate;
    }
    const triesOf = () => (round && round.tries) || P.tries;
    const usedOf = () => (round && Number(round.used)) || 0;
    const finished = () => Boolean(round && (round.mine === 'won' || round.mine === 'right' || usedOf() >= triesOf()));
    function resultLine() {
      if (round.mine === 'won') return [`恭喜！你第一个猜中，修为 +${round.points || P.points}（老师结算修为时计入）。`, 'ok'];
      if (round.mine === 'right') return ['你猜对了！不过已经有同学抢先一步。', 'ok'];
      return null;
    }
    // 画对话框：讲玩法 → 出题倒计时 → 可以抢答 → 揭晓（等下一题）
    function paint() {
      if (!round) { box.hidden = true; return; }
      box.hidden = false;
      const phase = round.phase || 'ask';
      const label = round.label || '';
      surfaceBox.hidden = !(phase !== 'rules' && round.surface);
      surfaceBox.querySelector('p').textContent = round.surface || '';
      if (phase === 'rules') {
        labelEl.textContent = '等待出题';
        countEl.hidden = true;
        input.disabled = true;
        button.disabled = true;
        input.placeholder = `出题后统一倒计时 ${delay} 秒`;
        say(`老师正在讲玩法。出题后全班统一倒计时 ${delay} 秒，倒计时结束才能输入谜底抢答；每题最多猜 ${P.tries} 次，第一个猜中的加 ${P.points} 修为。`);
        return;
      }
      if (phase === 'reveal') {
        labelEl.textContent = label ? `${label} · 已揭晓` : '已揭晓';
        countEl.hidden = true;
        input.disabled = true;
        button.disabled = true;
        input.placeholder = '等老师出下一题';
        const line = resultLine();
        if (line) say(line[0] + '　等老师出下一题。', line[1]);
        else say('谜底已经揭晓，看大屏上的汤底；老师出下一题时这里会重新倒计时。');
        return;
      }
      labelEl.textContent = label || '这一题';
      const left = leftMs();
      if (left > 0) {
        const n = Math.ceil(left / 1000);
        countEl.hidden = false;
        countEl.classList.remove('is-go');
        if (n !== shownNum) {
          shownNum = n;
          numEl.textContent = String(n);
          countEl.classList.remove('is-tick');
          void countEl.offsetWidth;
          countEl.classList.add('is-tick');
        }
        countText.textContent = '秒后开始抢答（全班同步倒计时）';
        input.disabled = true;
        button.disabled = true;
        input.placeholder = '倒计时结束后输入谜底';
        say('先看大屏上的汤面想一想，倒计时结束才能输入。');
        return;
      }
      // 倒计时结束（或没有倒计时的旧版出题）：可以抢答
      if (shownNum !== 0) {
        const wasCounting = shownNum !== null;
        shownNum = 0;
        if (goAt && wasCounting) {
          countEl.hidden = false;
          countEl.classList.add('is-go');
          numEl.textContent = '抢!';
          countText.textContent = '抢答开始！';
          setTimeout(() => { if (shownNum === 0) countEl.hidden = true; }, 1600);
          if (!finished()) setTimeout(() => { if (!input.disabled && document.activeElement !== input) input.focus(); }, 30);
        } else {
          countEl.hidden = true;
        }
      }
      const done = finished();
      input.disabled = done || busy;
      button.disabled = done || busy;
      input.placeholder = '输入谜底（一个概念）';
      if (Date.now() < holdUntil) return;
      const line = resultLine();
      if (line) say(line[0] + '　等老师揭晓汤底吧。', line[1]);
      else if (usedOf() >= triesOf()) say(`${triesOf()} 次机会已经用完，等老师揭晓谜底吧。`);
      else if (!busy) say(`${round.won ? '已经有同学猜中了，你也可以试试' : `第一个猜中的同学加 ${round.points || P.points} 修为`}；每题最多猜 ${triesOf()} 次${usedOf() ? `，还剩 ${triesOf() - usedOf()} 次` : ''}。`);
    }
    function startTick() {
      clearInterval(tick);
      tick = 0;
      if (leftMs() > 0) {
        tick = setInterval(() => { paint(); if (leftMs() <= 0) { clearInterval(tick); tick = 0; paint(); } }, 100);
      }
    }
    function apply(data, t0, t1) {
      if (data) measure(t0, t1, data.now);
      if (!data || data.status !== 'open') {
        round = null;
        goAt = null;
        stamp = '';
        clearInterval(tick);
        tick = 0;
        box.hidden = true;
        return;
      }
      const key = `${data.phase || 'ask'}:${data.round || ''}:${data.go_at || ''}`;
      if (key !== stamp) {
        stamp = key;
        input.value = '';
        box.classList.remove('is-won');
        shownNum = null;
      }
      round = data;
      goAt = Number(data.go_at) || null;
      paint();
      startTick();
    }
    function schedule() {
      clearTimeout(poll);
      // 对话框开着（游戏进行中）每 2 秒、没开时每 3 秒；这台设备没登录本课堂时放慢到 30 秒
      poll = setTimeout(check, round ? 2000 : (noLogin || loginNeeded) ? 30000 : 3000);
    }
    async function check() {
      clearTimeout(poll);
      if (off) return;
      if (document.hidden || loginNeeded) { schedule(); return; }
      const t0 = Date.now();
      try {
        const result = await backend.rpc('ck_puzzle_live', { p_classroom: room });
        const data = Array.isArray(result) ? result[0] : result;
        noLogin = Boolean(data && data.status === 'login');
        apply(noLogin ? null : data, t0, Date.now());
      } catch (problem) {
        if (missing(problem)) { off = true; box.hidden = true; return; }
      }
      schedule();
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!round || busy || (round.phase || 'ask') !== 'ask') return;
      if (leftMs() > 0) { say('还没到抢答时间，倒计时结束再抢答。', 'bad'); return; }
      if (!text) { say('先输入谜底再抢答。', 'bad'); input.focus(); return; }
      busy = true;
      button.disabled = true;
      say('正在核对……');
      const t0 = Date.now();
      try {
        const result = await backend.rpc('ck_puzzle_guess', { p_classroom: room, p_round: Number(round.round) || round.round, p_text: text });
        const data = Array.isArray(result) ? result[0] : result;
        const status = data && data.status;
        busy = false;
        holdUntil = Date.now() + 6000;
        if (status === 'won' || status === 'right') {
          round.mine = status;
          if (status === 'won') box.classList.add('is-won');
          paint();
          const line = resultLine();
          say(line[0] + '　等老师揭晓汤底吧。', line[1]);
        } else if (status === 'wrong') {
          round.used = data.used;
          paint();
          const left = (data.tries || P.tries) - (Number(data.used) || 0);
          say(left > 0 ? `“${text}”不对，再想想，还能猜 ${left} 次。` : `“${text}”不对，${data.tries || P.tries} 次机会已经用完，等老师揭晓谜底吧。`, 'bad');
          if (left > 0) input.select();
        } else if (status === 'used') {
          round.used = data.used;
          paint();
        } else if (status === 'wait') {
          // 本机倒计时比后台快：按后台重新同步
          measure(t0, Date.now(), data.now);
          goAt = Number(data.go_at) || goAt;
          shownNum = null;
          paint();
          startTick();
          say('还没到抢答时间，已按老师的时钟重新同步倒计时。', 'bad');
        } else if (status === 'closed') {
          paint();
          say('这一题已经结束了。');
          setTimeout(check, 800);
        } else if (status === 'login') {
          say('这台设备还没有通过本堂课的登录核对：请回首页用课堂码重新登录。', 'bad');
          onBlocked();
        } else {
          paint();
          say('先输入谜底再抢答。', 'bad');
        }
      } catch (problem) {
        busy = false;
        holdUntil = Date.now() + 6000;
        paint();
        say(missing(problem) ? '情境猜谜抢答还没有开通（老师后台尚未更新）。' : '没有交上去：请检查网络后再点“抢答”。', 'bad');
      }
    });
    checkedIn.then(check);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  // 投票器（2026-10-29 用户：“课堂工具可以再增加一个投票器的功能……点击投票器后学生端会弹出投票选项可以让学生选择”）：
  // 页面在前台时每 4 秒问一次本课堂有没有正在进行的投票（ck_poll_live），有就在屏幕中间弹出选项；投票结束前可以改。
  // 老师结束并公布结果后显示各项人数（3 分钟内）。点“×”收起，有新的投票或投票结束时再弹出。学生版测试页只在本机点选，不计入。
  if (!OFFLINE && !AUDIT) setupPoll();   // 旁听不参加课堂投票
  function setupPoll() {
    const P = Live.POLL || { check: 4000 };
    const room = Number(identity.classroom) || identity.classroom;
    const COLORS = ['#23655f', '#a4492d', '#3b5683', '#8a6418', '#7a4572', '#55672b'];
    const card = document.createElement('div');
    card.className = 'clp-poll';
    card.hidden = true;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', '课堂投票');
    document.body.appendChild(card);
    let poll = null;
    let off = false;
    let busy = false;
    let dismissed = '';
    let note = '';
    const stamp = (data) => `${data.poll}:${data.status}`;
    function render() {
      if (!poll || dismissed === stamp(poll)) { card.hidden = true; return; }
      const open = poll.status === 'open';
      const counts = poll.counts;
      const total = counts ? counts.reduce((a, b) => a + Number(b || 0), 0) : 0;
      card.hidden = false;
      card.innerHTML = `<button type="button" class="clp-poll-x" data-poll-x aria-label="收起">×</button>
        <p class="clp-poll-kicker">${open ? '老师发起了投票' : '投票已结束'}</p>
        ${poll.question ? `<h3>${esc(poll.question)}</h3>` : ''}
        <div class="clp-poll-options${counts ? ' has-result' : ''}">${poll.options.map((option, i) => {
          const pct = total ? Math.round((Number(counts[i] || 0) / total) * 100) : 0;
          return `<button type="button" data-poll-choice="${i}" style="--c:${COLORS[i % COLORS.length]}"${open ? '' : ' disabled'} aria-pressed="${poll.mine === i}">
            ${counts ? `<i style="width:${pct}%"></i>` : ''}<span>${esc(option)}</span>${counts ? `<b>${counts[i]} 人 · ${pct}%</b>` : poll.mine === i ? '<b>✓ 已选</b>' : ''}</button>`;
        }).join('')}</div>
        <p class="clp-poll-note">${esc(note || (open ? (poll.mine == null ? '点一个选项投票；投票结束前可以改。' : `已投“${poll.options[poll.mine]}”，投票结束前可以改。`)
          : counts ? `共 ${total} 人投票${poll.mine != null ? `，你投的是“${poll.options[poll.mine]}”` : ''}。` : '老师没有公布结果。'))}</p>`;
    }
    function apply(data) {
      if (!data || !data.poll) { poll = null; card.hidden = true; return; }
      const changed = !poll || stamp(poll) !== stamp(data);
      // 学生版测试页：本机点的选项留着（后台没有记）
      if (PREVIEW && poll && String(poll.poll) === String(data.poll) && data.mine == null) data.mine = poll.mine;
      poll = data;
      if (changed) note = '';
      render();
    }
    async function check() {
      if (off || document.hidden || loginNeeded) return;
      try {
        const result = await backend.rpc('ck_poll_live', { p_classroom: room });
        apply(Array.isArray(result) ? result[0] : result);
      } catch (problem) {
        if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem))) { off = true; card.hidden = true; }
      }
    }
    card.addEventListener('click', async (event) => {
      if (event.target.closest('[data-poll-x]')) { dismissed = poll ? stamp(poll) : ''; card.hidden = true; return; }
      const button = event.target.closest('[data-poll-choice]');
      if (!button || !poll || poll.status !== 'open' || busy) return;
      const choice = Number(button.dataset.pollChoice);
      if (PREVIEW) { poll.mine = choice; note = `测试页：选了“${poll.options[choice]}”，只在本机，不计入投票。`; render(); return; }
      busy = true;
      try {
        const result = await backend.rpc('ck_poll_vote', { p_poll: Number(poll.poll) || poll.poll, p_choice: choice });
        const data = Array.isArray(result) ? result[0] : result;
        if (data && data.status === 'ok') { poll.mine = choice; note = ''; }
        else if (data && data.status === 'login') note = '没有记上：请回首页重新登录本堂课。';
        else { note = '投票已经结束了。'; poll.status = 'closed'; }
      } catch (problem) {
        note = `没有记上：${(problem && problem.message) || problem}`;
      }
      busy = false;
      render();
    });
    checkedIn.then(check);
    setInterval(check, P.check || 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  // 本堂作业递交情况（页面最下方，匿名建议箱之后）：读后台收到的本人递交记录（ck_my_submissions），
  // 与教师工作台“递交情况”同一来源；在别的设备递交过的题，这台设备上也标成已递交
  if (!OFFLINE && questions.length) setupSubmissions();
  function setupSubmissions() {
    const card = document.createElement('section');
    card.className = 'clp-subm';
    card.setAttribute('data-ix', '');
    card.innerHTML = `<div class="clp-sub-head"><span class="clp-sub-tag">本堂作业递交情况</span><span class="clp-sub-who"></span><button type="button" data-sub-refresh>刷新</button></div>
      <div class="clp-sub-big"><b data-sub-count>—</b><span>题已递交（${PREVIEW ? '测试页：按这台电脑上的测试递交统计' : AUDIT ? '旁听：按这台设备上锁定的答案统计，不交给老师' : '以老师后台收到的为准'}）</span></div>
      <div class="clp-sub-bar"><i data-sub-bar></i></div>
      <p class="clp-sub-state" data-sub-state role="status">正在读取后台的递交记录……</p>
      <details data-sub-missing hidden><summary></summary><ol></ol></details>
      <p class="clp-sub-note" data-sub-note>和老师工作台“加入名单”里的“递交情况”一致。如果这里和左下角面板的数字不一样，以这里为准；有疑问可以截图给老师。</p>`;
    shield(card);
    card.querySelector('.clp-sub-who').textContent = [identity.name, identity.sid].filter(Boolean).join(' · ');
    // 2026-10-23 起放在“课后自修”页的最后（用户：“本堂作业递交情况放到课后自修后面”）；没有这一页时仍放在匿名建议箱之后
    // 习经（2026-10-23 用户：“把本堂作业递交情况放到本章知识点小结前面”）：放在显示的最后一个案例那一节的末尾，紧挨着“本章知识点小结”
    const selfStudy = document.querySelector('#practice [data-xl]');
    const lastCase = document.getElementById('chapter-summary')
      ? $$('section[id^="case-"]').filter((section) => !section.hidden).pop() : null;
    const lastFb = fbCards.length ? fbCards[fbCards.length - 1].card : null;
    if (selfStudy) selfStudy.insertAdjacentElement('afterend', card);
    else if (lastCase) (lastCase.querySelector('.section-inner') || lastCase).appendChild(card);
    else if (lastFb) lastFb.insertAdjacentElement('afterend', card);
    else {
      const pages = $$('section.page[id], section[id^="case-"], section.page-section');
      const host = pages.length ? pages[pages.length - 1] : document.body;
      (host.querySelector('.section-inner') || host.querySelector('.inner') || host).appendChild(card);
    }
    const countEl = card.querySelector('[data-sub-count]');
    const stateEl = card.querySelector('[data-sub-state]');
    const missing = card.querySelector('[data-sub-missing]');
    const clockOf = (ts) => (ts ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(ts))) : '');
    let busy = false;
    let lastAt = 0;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        // 测试页的递交只在本机：按本机记下的测试递交统计
        const result = LOCAL_ONLY ? { status: 'ok', items: questions.filter((q) => locked[q.key]).map((q) => ({ key: q.key, ts: Date.parse(locked[q.key].iso || '') || 0 })) }
          : await backend.rpc('ck_my_submissions', { p_classroom: Number(identity.classroom) || identity.classroom });
        const data = Array.isArray(result) ? result[0] : result;
        if (!data || data.status === 'login') {
          stateEl.textContent = '这台设备还没有通过本堂课的登录核对，读不到递交记录：请回首页用课堂码重新登录。';
          stateEl.dataset.state = 'error';
          return;
        }
        const got = new Map((data.items || []).map((item) => [String(item.key), Number(item.ts) || 0]));
        // 别的设备递交过、这台设备不知道的题：标成已递交（每题只算第一次）
        syncKeys(Array.from(got.keys()));
        refreshCount();
        const done = questions.filter((q) => got.has(q.key));
        const todo = questions.filter((q) => !got.has(q.key));
        const all = todo.length === 0;
        const lastTs = Math.max(0, ...done.map((q) => got.get(q.key)));
        countEl.textContent = `${done.length} / ${questions.length}`;
        countEl.parentElement.classList.toggle('is-all', all);
        card.querySelector('[data-sub-bar]').style.width = `${questions.length ? Math.round(done.length / questions.length * 100) : 0}%`;
        stateEl.textContent = all ? `全部递交 ✓（最后一题 ${clockOf(lastTs)} 递交）`
          : done.length ? `已递交 ${done.length}/${questions.length} 题，还有 ${todo.length} 题没有递交。` : '还没有递交：每题选好或写好后，点题目下方的“递交”。';
        stateEl.dataset.state = all ? 'ok' : '';
        missing.hidden = all;
        missing.querySelector('summary').textContent = `还没递交的 ${todo.length} 题（点题目跳过去）`;
        const list = missing.querySelector('ol');
        list.innerHTML = '';
        todo.forEach((q) => {
          const li = document.createElement('li');
          const go = document.createElement('button');
          go.type = 'button';
          go.textContent = [q.section, q.title].filter(Boolean).join(' · ');
          go.addEventListener('click', () => reveal(q.bar));
          li.appendChild(go);
          if (q.stopped) { const tip = document.createElement('small'); tip.textContent = '老师已停止递交'; li.appendChild(tip); }
          list.appendChild(li);
        });
        card.querySelector('[data-sub-note]').textContent = `核对时间 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())}。`
          + (PREVIEW ? '学生页读的是老师后台收到的记录，和老师工作台“加入名单”里的“递交情况”一致。'
            : AUDIT ? '旁听的答案只保存在这台设备上，不交给老师、不计入统计。'
            : '和老师工作台“加入名单”里的“递交情况”一致；如果这里和左下角面板的数字不一样，以这里为准，有疑问可以截图给老师。');
        lastAt = Date.now();
      } catch (problem) {
        const text = String((problem && problem.message) || problem || '');
        stateEl.textContent = /PGRST202|42883|Could not find the function|未知的后台函数/.test(text)
          ? '递交情况还没有开通（老师后台尚未更新），可以先看左下角面板的数字。' : '读取递交记录失败：请检查网络后点“刷新”。';
        stateEl.dataset.state = 'error';
      } finally {
        busy = false;
      }
    }
    card.querySelector('[data-sub-refresh]').addEventListener('click', load);
    checkedIn.then(load);
    // 递交以后、翻到这张卡片时（15 秒内不重复读）再核对一次
    let soon = null;
    document.addEventListener('classlive:submitted', () => { clearTimeout(soon); soon = setTimeout(load, 1500); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting) && Date.now() - lastAt > 15000) load(); }).observe(card);
    }
  }

  // 点名册编号（点名册第几行）：老师在课堂工具里抽人上台时按这个编号叫人。先显示上次记住的，再向后台核对；
  // 后台函数只认本人这次登录对应的学号，看不到别人的；不在点名册里或后台还没有这个函数时不显示
  const noEl = panel.querySelector('[data-cl-no]');
  const noKey = `classlive-roster-no:${identity.classroom}`;
  const showNo = (no) => {
    noEl.textContent = no ? `${no}号` : '';
    noEl.hidden = !no;
  };
  showNo(load(noKey, null));
  checkedIn.then(() => (LOCAL_ONLY ? null : backend.rpc('ck_my_roster_no', { p_classroom: Number(identity.classroom) || identity.classroom })))
    .then((value) => {
      const raw = Array.isArray(value) ? value[0] : value;
      const no = Number(raw && typeof raw === 'object' ? Object.values(raw)[0] : raw) || null;
      save(noKey, no);
      showNo(no);
    })
    .catch(() => { /* 后台还没有 ck_my_roster_no 时不显示编号 */ });

  // ---------- 修为境界：老师在工作台按后台记录结算（签到、作答、弹幕），这里只显示本人的境界称号；分数不在页面上显示 ----------
  const REALMS = Live.realmsFor ? Live.realmsFor(config.course) : (Live.REALMS || []);   // 门槛按课程（2026-11-11 习经化神 140%）
  const GIFTS = Live.GIFTS || [];
  const realmEl = panel.querySelector('[data-cl-realm]');
  const giftBox = panel.querySelector('[data-cl-gifts]');
  const colorBox = panel.querySelector('[data-cl-colors]');
  const colorNote = panel.querySelector('[data-cl-colors-note]');
  const COLORS = Live.COLORS || [];
  const colorKey = `classlive-dmcolor:${config.course}`;
  const realmKey = `classlive-realm:${config.course}:${identity.sid}`;   // 按学号分开记（同一台设备换人时不串）
  let myRealm = PREVIEW ? { realm: 4, stage: 2, ratio: 1, updated_at: '' } : load(realmKey, null);   // 测试页：化神
  const realmModal = document.createElement('div');
  realmModal.className = 'clp-realm-modal';
  realmModal.hidden = true;
  document.body.appendChild(realmModal);
  const chip = (level, text) => `<b class="clp-realm is-r${level}">${esc(text || REALMS[level].name)}</b>`;
  // 境界阶梯图：越往上台阶越高、材质越华贵；台阶上写解锁的法宝和弹幕特权，“你”标出本人所在境界
  // 每境解锁的弹幕字色（与 live-core.js 的 ClassLive.COLORS 同名）和边框
  const PERKS = { 0: ['霜白、月银'], 1: ['加青冥、翠竹', '可入宗门'], 2: ['加金曦、大红', '修为榜可隐名'], 3: ['加樱粉、紫霄', '紫色辉边'], 4: ['加流金、七彩', '七彩边框'] };
  const ladderHtml = (mine) => `<div class="clp-ladder" role="img" aria-label="${esc(REALMS.map((realm) => {
    const gift = GIFTS.find((item) => item.level === realm.level);
    return `${realm.name}（${realm.look}，${realm.min ? `${Math.round(realm.min * 100)}%` : '起步'}${gift ? `，解锁${gift.name}` : ''}${(PERKS[realm.level] || []).map((perk) => `，${perk}`).join('')}）`;
  }).join(' → '))}">${REALMS.map((realm) => {
    const gift = GIFTS.find((item) => item.level === realm.level);
    return `<div class="clp-step is-r${realm.level}${realm.level === mine ? ' is-me' : ''}" aria-hidden="true">
      ${realm.level === mine ? '<i class="clp-me">你</i>' : ''}${chip(realm.level)}
      <div class="clp-stone"><b>${esc(realm.look)}</b><em>${realm.min ? `${Math.round(realm.min * 100)}%` : '起步'}</em>${gift ? `<span class="clp-step-gift">${GIFT_ICONS[gift.id] || ''}${esc(gift.name).replace(/^(.{2})(.{3,})$/, '$1<wbr>$2')}</span>` : ''}${(PERKS[realm.level] || []).map((perk) => `<span>${esc(perk)}</span>`).join('')}</div>
    </div>`;
  }).join('')}</div>`;
  // 修炼场规则说明（分值按课程，见 live-core.js 的 ClassLive.PRACTICE）
  function practiceRule() {
    const P = Live.PRACTICE || { gap: 3, of: () => ({ cap: 10 }), text: () => '' };
    const r = P.of(config.course);
    return `题目是另写的新题，和课堂上的题不重复；老师开过的每一次课，对应的题都开放（以前的课也能复习；提前发布、还没开课的只能查看，开课后才开放、才计修为）；每题第一次答对得修为：${P.text(config.course)}（当天先答错的，隔天再答对也算）；隔 ${P.gap || 3} 天以上再答对，还能再得一次（复习巩固，每题最多两次）${config.course === 'political-economy' ? '；案例页的“课后自修”也计修为（出门测每题答对 +2、主动回忆每个概念 +1、温故答对 +2、写一段话讲给别人听 +3、课后思考写满 100 字 +5，只算一次）' : ''}；每天最多 ${r.cap} 修为。境界按全学期满分算，平时天天练、修为攒得早的同学，能更早冲上「化神」；临时突击受每日上限所限，补不回来。`;
  }
  function openRealm() {
    const r = myRealm;
    const level = r ? r.realm : 0;
    const next = REALMS[level + 1];
    const lo = REALMS[level] ? REALMS[level].min : 0;
    const hi = next ? next.min : 1;
    const within = r ? Math.max(0, Math.min(1, ((Number(r.ratio) || 0) - lo) / (hi - lo || 1))) : 0;
    realmModal.innerHTML = `<div class="clp-realm-card" role="dialog" aria-modal="true" aria-label="修为说明">
      <h3><span>修为境界 ${r ? chip(level, REALMS[level].name + (Live.STAGES || [])[r.stage || 0]) : chip(0, '炼气')}</span><button type="button" data-realm-close aria-label="关闭">×</button></h3>
      ${r ? `<div class="clp-realm-bar" title="本境界进度"><i style="width:${Math.round(within * 100)}%"></i></div>
        <p class="clp-hint">${next ? `再积累一些修为就能突破到「${next.name}」。` : '已达化神境界，继续保持！'}${r.updated_at ? ` 上次结算：${String(r.updated_at).slice(0, 10)}` : ''}</p>`
        : '<p class="clp-hint">老师结算后这里会显示你的境界（第一次结算前都是炼气）。</p>'}
      <button type="button" class="clp-rank-link" data-realm-rank>${TROPHY}看本班修为榜（前十名）</button>
      <h4>怎样积累修为</h4>
      <ul>
        <li>本学期每次课都能积累修为，每次课最多 100：上课签到 20、作答完成 35、作答正确 35、发弹幕最多 10。</li>
        <li>签到：上课时进入本次课堂就算；课后再打开页面不算。</li>
        <li>作答完成：每道题点“递交”就算（投票、站队也算）；要写的题认真写满一句话，只填几个字或留着空格线不算。</li>
        <li>作答正确：有参考答案的题按你第一次递交的答案判对错，递交后改不了，先想清楚再递交。</li>
        <li>弹幕：每条有内容的弹幕都有修为，同一句只算一次，每次课最多 10；被老师隐藏或自己撤回的不算。被老师删除的无效弹幕，已经得到的修为会撤回，页面上会提醒你。</li>
        <li>请假：不能来上课时，点面板上的“请假”选好日期、写明原因；请假的那次课计 ${(Live.LEAVE || {}).points || 20} 修为（相当于签到）。没有登录也没有请假的课，不得任何修为（作答、弹幕也不算）。</li>
        <li>猜词游戏：每次课得分第一的一组，两位同学各加 ${(Live.WORDGAME || {}).points || 10} 修为。</li>
        ${config.course === 'xjp-economy' ? `<li>PK 对决：被抽到上台一对一（擂台抢答、因果链拼图赛、数据猜猜猜），获胜的同学加 ${(Live.PK || {}).points || 5} 修为；时间轴排排站是全班随机分成红、蓝两队，每人在自己页面弹出的对话框里选位置，每题答对人数多的一队得 1 分，最后得分高的一队每人加 ${(Live.TIMELINE || {}).points || 1} 修为。</li>` : ''}
        ${config.course === 'xjp-economy' ? `<li>经营沙盘（案例 06、08、09、19）：各项指标都守住红线（经营合格）时，四位代表各加 ${(Live.BIZ || {}).rep || 10} 修为，本方指标最高的角色组里在聊天室发过言的同学各加 ${(Live.BIZ || {}).top || 5} 修为。</li>` : ''}
        ${config.course === 'xjp-economy' ? `<li>分组讨论（案例 02、03、04、05、10、11、13、14）：每组聊天室里点赞最多的一位（本组发言人）加 ${(Live.DISCUSS || {}).leader || 5} 修为；本方提案被全班表决采纳的角色组，组里在聊天室发过言的同学各加 ${(Live.DISCUSS || {}).win || 5} 修为（两项可以都得）。</li>` : ''}
        <li>辩论赛：两方聊天室合起来，发言被点赞最多的三位同学各加 ${(Live.DEBATE || {}).likes || 5} 修为；辩后投票票数多的一方，聊天室里的同学各加 ${(Live.DEBATE || {}).win || 5} 修为（两项可以都得）。</li>
        <li>修炼场：点面板上的“修炼场”平时做题。${practiceRule()}</li>
        <li>匿名建议：在页面最后的${config.course === 'xjp-economy' ? '“匿名建议箱”' : '“匿名建议和提问箱”'}里，每个课堂第一次写 ${(Live.FEEDBACK || {}).min || 10} 字以上的建议或提问，加 ${(Live.FEEDBACK || {}).points || 5} 修为（只记你提交过，老师看不到哪一条是你写的）。</li>
        <li>情境猜谜抢答：老师点“看玩法”或出题后，页面上方弹出“情境猜谜抢答”对话框；每次出题后全班统一倒计时 ${(Live.PUZZLE || {}).delay || 10} 秒，倒计时结束才能输入谜底，每题最多猜 ${(Live.PUZZLE || {}).tries || 3} 次；第一个猜中的同学加 ${(Live.PUZZLE || {}).points || 5} 修为（每次课最多累计 ${(Live.PUZZLE || {}).cap || 20}）。</li>
        <li>老师点赞：说得好的弹幕，老师会在投屏上盖一枚「师赞」朱印（每堂课最多 ${(Live.LIKE || {}).limit || 20} 个赞），被赞一次额外加 ${(Live.LIKE || {}).points || 5} 修为，每次课最多算 ${(Live.LIKE || {}).perStudent || 2} 个。被赞的弹幕在“我发过的弹幕”里标着「师赞」。</li>
      </ul>
      <h4>境界与奖励</h4>
      ${ladderHtml(r ? level : 0)}
      <p class="clp-hint">百分比＝修为占全学期满分的比例，每个境界再分初期、中期、后期${(REALMS[REALMS.length - 1] || {}).min > 1 ? `；修炼场和额外奖励也计入修为，所以可以超过 100%，「${esc(REALMS[REALMS.length - 1].name)}」要到 ${Math.round(REALMS[REALMS.length - 1].min * 100)}%` : ''}。每升到一个境界，获得一次祭出该境界法宝的机会（每件只能祭出一次，每次课最多一件），不加修为。</p>
      <p class="clp-hint">突破「元婴」「化神」时，课堂投屏和你自己的页面都会播放一次突破画面（每台设备各一次）。修为榜隐匿姓名只在「结丹」：到「元婴」以后照常显示姓名。面板上的“灵根”可以看自己八个方向的所长和待补。</p>
      ${PREVIEW && window.ClassLiveAscend ? '<p class="clp-hint">测试页预览突破画面：<button type="button" class="clp-rank-link" data-realm-ascend="3">突破元婴</button> <button type="button" class="clp-rank-link" data-realm-ascend="4">突破化神</button></p>' : ''}</div>`;
    realmModal.hidden = false;
    realmModal.querySelector('[data-realm-close]').focus();
  }
  realmModal.addEventListener('click', (event) => {
    if (event.target.closest('[data-realm-rank]')) { realmModal.hidden = true; openRank(); return; }
    const ascendDemo = event.target.closest('[data-realm-ascend]');
    if (ascendDemo && window.ClassLiveAscend) {
      realmModal.hidden = true;
      window.ClassLiveAscend.play({ level: Number(ascendDemo.dataset.realmAscend) || 3, self: true, names: [identity.name], fit: 'narrow' });
      return;
    }
    if (event.target === realmModal || event.target.closest('[data-realm-close]')) realmModal.hidden = true;
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !realmModal.hidden) realmModal.hidden = true; });
  // ---------- 修为榜：本班修为前十名（ck_realm_top；按老师最近一次结算排名，显示名次、姓名、境界和修为） ----------
  const CROWN = '<svg viewBox="0 0 64 42" aria-hidden="true"><defs><linearGradient id="clp-crown-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffd36b"/><stop offset="1" stop-color="#c88a12"/></linearGradient></defs>'
    + '<path d="M5 34 L9 11 L22 24 L32 5 L42 24 L55 11 L59 34 Z" fill="url(#clp-crown-g)" stroke="#8a5a06" stroke-width="2" stroke-linejoin="round"/>'
    + '<rect x="5" y="33" width="54" height="6" rx="2" fill="url(#clp-crown-g)" stroke="#8a5a06" stroke-width="2"/>'
    + '<circle cx="9" cy="10" r="3.6" fill="#ff8fc4"/><circle cx="32" cy="5" r="4" fill="#7fd8ff"/><circle cx="55" cy="10" r="3.6" fill="#b98cff"/><circle cx="32" cy="36" r="2.4" fill="#c8452d"/></svg>';
  const rankModal = document.createElement('div');
  rankModal.className = 'clp-realm-modal clp-rank-modal';
  rankModal.hidden = true;
  document.body.appendChild(rankModal);
  let rankCache = null;   // 30 秒内重复打开不再读后台
  const realmText = (row) => `${REALMS[row.realm] ? REALMS[row.realm].name : '炼气'}${(Live.STAGES || [])[row.stage || 0] || ''}`;
  const initial = (name) => Array.from(String(name || '').trim())[0] || '？';
  const youTag = (row) => (row.me ? '<i>你</i>' : '');
  // 修为榜隐匿姓名（2026-10-30 用户：“到结丹期后，学生可以选择在修为榜上隐匿自己的名字，修为值和排名正常显示……比如点击一下自己的名字就显示为‘***’”）：
  // 隐匿的同学在榜上显示“***”（后台对别人已换成 ***，本人那一行带真名和 hidden），头像换成“＊”；本人达到「结丹」后点自己的名字切换
  const shownName = (row) => (row.hidden ? '***' : row.name);
  const avatarText = (row) => (row.hidden ? '＊' : initial(row.name));
  let rankCanHide = false;
  const nameHtml = (row, cls) => (row.me && !PREVIEW && (rankCanHide || row.hidden)
    ? `<button type="button" class="${cls} clp-rank-hide" data-rank-hide title="${row.hidden ? '点一下恢复显示你的姓名' : '点一下在榜上隐匿你的姓名（显示为 ***）'}">${esc(shownName(row))}${youTag(row)}${sectDot(row.sect)}</button>`
    : `<strong class="${cls}">${esc(shownName(row))}${youTag(row)}${sectDot(row.sect)}</strong>`);
  const rankShell = (inner) => `<div class="clp-rank-card" role="dialog" aria-modal="true" aria-label="修为榜">
      <i class="clp-rank-stars" aria-hidden="true"></i><i class="clp-rank-stars is-b" aria-hidden="true"></i>
      <header class="clp-rank-head"><div><span>${esc(identity.class_name || '本班')} · 修为前十名</span><h3>修为榜</h3></div><button type="button" data-rank-close aria-label="关闭">×</button></header>
      ${inner}</div>`;
  function podiumHtml(top) {
    // 领奖台：左第二、中第一、右第三（并列时按名单顺序站位，台座上写实际名次）
    return `<div class="clp-podium">${[[top[1], 'is-2', 1], [top[0], 'is-1', 0], [top[2], 'is-3', 2]].map(([row, cls, d]) => (row
      ? `<div class="clp-pod ${cls}${row.me ? ' is-me' : ''}" style="--d:${d}">${cls === 'is-1' ? `<span class="clp-crown">${CROWN}</span>` : ''}
          <span class="clp-ava is-r${Number(row.realm) || 0}"><b>${esc(avatarText(row))}</b></span>
          ${nameHtml(row, 'clp-pod-name')}${chip(Number(row.realm) || 0, realmText(row))}${ptsHtml(row, 'clp-pod-pts')}
          <span class="clp-pod-base"><em>${Number(row.rank) || ''}</em></span></div>`
      : `<div class="clp-pod ${cls} is-empty" aria-hidden="true"><span class="clp-pod-base"></span></div>`)).join('')}</div>`;
  }
  // 修为值（2026-10-22 起修为榜显示；后台旧版不返回时不显示）
  const ptsText = (value) => { const n = Number(value); return Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : ''; };
  const ptsHtml = (row, cls) => (row && row.points != null ? `<span class="${cls}">${ptsText(row.points)}<small> 修为</small></span>` : '');
  function rankBody(data) {
    if (!data || data.status === 'login') return '<p class="clp-rank-state">这台设备还没有通过本堂课的登录核对，看不到修为榜：请回首页用课堂码重新登录。</p>';
    const top = data.top || [];
    if (!top.length) return '<p class="clp-rank-state">老师还没有结算修为。结算以后，这里会显示本班修为前十名。</p>';
    const when = data.updated_at ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(data.updated_at)) : '';
    const rest = top.slice(3);
    const mine = data.mine;
    rankCanHide = Boolean(mine && mine.can_hide);
    const onBoard = top.some((row) => row.me);
    const mineHtml = PREVIEW ? ''
      : mine && onBoard ? `<p class="clp-rank-mine">你在榜上：第 ${Number(mine.rank)} 名${mine.points != null ? `，修为 ${ptsText(mine.points)}` : ''}！${Number(mine.rank) === 1 ? '傲视全班，' : ''}继续保持。</p>`
      : mine ? `<p class="clp-rank-mine">你目前第 ${Number(mine.rank)} 名（共 ${Number(data.total) || 0} 人上榜）${mine.points != null ? `，修为 ${ptsText(mine.points)}` : ''}，境界 ${chip(Number(mine.realm) || 0, realmText(mine))}。签到、作答、发弹幕、修炼场做题都能积累修为，冲进前十！</p>`
      : '<p class="clp-rank-mine">你还没有上榜：老师下次结算修为时，签到、作答、发弹幕积累的修为都会算进来。</p>';
    return `<p class="clp-rank-meta">共 ${Number(data.total) || 0} 人上榜${when ? ` · 结算于 ${esc(when)}` : ''}</p>
      ${podiumHtml(top)}
      ${rest.length ? `<ol class="clp-rank-list">${rest.map((row, i) => `<li class="clp-rank-row${row.me ? ' is-me' : ''}" style="--i:${i}">
        <span class="clp-rank-no">${Number(row.rank) || ''}</span><span class="clp-rank-ava is-r${Number(row.realm) || 0}">${esc(avatarText(row))}</span>
        ${nameHtml(row, 'clp-rank-name')}${ptsHtml(row, 'clp-rank-pts')}${chip(Number(row.realm) || 0, realmText(row))}</li>`).join('')}</ol>` : ''}
      ${mineHtml}${PREVIEW || !mine ? '' : mine.locked
        ? `<p class="clp-rank-privacy">你已达到「${esc((REALMS[Number(mine.realm) || 3] || {}).name || '元婴')}」：元婴以后，修为榜上照常显示你的姓名，不能再隐匿。</p>`
        : mine.can_hide || mine.hidden
        ? `<p class="clp-rank-privacy">${mine.hidden ? '你的姓名已在榜上隐匿：同学们看到的是“***”，修为和名次照常显示。到「元婴」以后照常显示姓名。' : '你已达到「结丹」，可以在榜上隐匿姓名：同学们会看到“***”，修为和名次照常显示（老师那里照常显示）。到「元婴」以后照常显示姓名，不能再隐匿。'}<button type="button" data-rank-hide>${mine.hidden ? '恢复显示我的姓名' : '隐匿我的姓名'}</button></p>`
        : '<p class="clp-rank-privacy">达到「结丹」境界后，可以在修为榜上隐匿自己的姓名（显示为“***”）；到「元婴」以后照常显示姓名。</p>'}
      <p class="clp-rank-note">按老师最近一次结算的全学期修为排名，修为相同名次并列；榜上显示境界和修为。老师结算后这里随之更新。</p>`;
  }
  async function openRank() {
    rankModal.innerHTML = rankShell('<p class="clp-rank-state">正在读取修为榜……</p>');
    rankModal.hidden = false;
    rankModal.querySelector('[data-rank-close]').focus();
    try {
      let data = rankCache && Date.now() - rankCache.at < 30000 ? rankCache.data : null;
      if (!data) {
        const value = await backend.rpc('ck_realm_top', { p_classroom: Number(identity.classroom) || identity.classroom });
        data = Array.isArray(value) ? value[0] : value;
        if (data && data.status === 'ok') rankCache = { at: Date.now(), data };
      }
      if (rankModal.hidden) return;
      rankModal.innerHTML = rankShell(rankBody(data));
    } catch (problem) {
      if (rankModal.hidden) return;
      const missing = /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
      rankModal.innerHTML = rankShell(`<p class="clp-rank-state">${missing ? '修为榜还没有开通（老师后台尚未更新）。' : '读取修为榜失败：请检查网络后再打开一次。'}</p>`);
    }
    const close = rankModal.querySelector('[data-rank-close]');
    if (close) close.focus();
  }
  rankModal.addEventListener('click', async (event) => {
    if (event.target === rankModal || event.target.closest('[data-rank-close]')) { rankModal.hidden = true; return; }
    const hide = event.target.closest('[data-rank-hide]');
    if (!hide || !rankCache) return;
    const mine = rankCache.data.mine || {};
    hide.disabled = true;
    try {
      const value = await backend.rpc('ck_set_rank_hidden', { p_classroom: Number(identity.classroom) || identity.classroom, p_hidden: !mine.hidden });
      const res = (Array.isArray(value) ? value[0] : value) || {};
      if (res.status === 'ok') { rankCache = null; await openRank(); toast(res.hidden ? '已在修为榜上隐匿你的姓名，同学们看到的是“***”。' : '已恢复在修为榜上显示你的姓名。'); }
      else if (res.status === 'locked') { rankCache = null; await openRank(); toast('元婴以后，修为榜上照常显示姓名，不能再隐匿。'); }
      else toast(res.status === 'realm' ? '达到「结丹」境界后才能在修为榜上隐匿姓名。' : '请回首页用课堂码重新登录后再试。');
    } catch (problem) {
      const missing = /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
      toast(missing ? '隐匿姓名还没有开通（老师后台尚未更新）。' : '没有改成功，请检查网络后再试。');
    } finally {
      hide.disabled = false;
    }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !rankModal.hidden) rankModal.hidden = true; });
  panel.querySelectorAll('[data-cl-rank-open]').forEach((button) => button.addEventListener('click', openRank));

  // ---------- 灵根八相（2026-11-11 用户：“把个人学情卡中的那个八边形图加入到学生自己的控制面板中，可以改个修仙的名字，可以体现出自己的能力，
  //   让学生能够看到自己的优势和不足。”）：面板“灵根”按钮打开，和工作台“个人学情卡”同一套八项（ck_my_lingen，统计本班全学期、不含期中考查作业），
  //   每项一个方向：外圈是这一项的满分或全班最高；粉色是本人，青色是全班平均。下面写所长（高于平均最多的两项）和待补（低于平均最多的两项，附修炼建议）。
  //   测试页（老师）只有全班平均 ----------
  const LINGEN = [
    { key: 'attend', name: '勤勉', what: '到课', unit: ' 次', good: '到课勤，根基稳。', tip: '每次课按时进入课堂签到；不能来时记得点“请假”。' },
    { key: 'days', name: '恒心', what: '学习天数', unit: ' 天', good: '细水长流，日日不辍。', tip: '隔一两天打开一次课程页面，复习一下、做几道修炼场题。' },
    { key: 'acts', name: '精进', what: '学习行为', unit: ' 次', good: '课上课后都在用功。', tip: '课上每道题都递交，课后回看本课内容，动手多了自然精进。' },
    { key: 'rate', name: '悟性', what: '正确率', unit: '%', good: '想得清楚，答得准。', tip: '递交前把材料和选项再读一遍；递交后对照解答，弄清错在哪里。' },
    { key: 'danmaku', name: '论道', what: '弹幕', unit: ' 条', good: '敢说爱说，课堂论道常有你。', tip: '课上把自己的想法和理由发成弹幕，说出一句完整的话。' },
    { key: 'practice', name: '历练', what: '修炼场', unit: ' 道', good: '修炼场里没少下功夫。', tip: '点面板上的“修炼场”，每天做几道新题，攒修为也练本事。' },
    { key: 'online', name: '定力', what: '在线时长', unit: ' 分钟', good: '上课专注，心无旁骛。', tip: '上课时让课程页面留在前台，跟着老师一页一页往下走。' },
    { key: 'points', name: '根基', what: '修为', unit: '', good: '修为积累扎实。', tip: '修为是各项的总和：签到、作答、弹幕、修炼场，样样都在添砖加瓦。' },
  ];
  const lgModal = document.createElement('div');
  lgModal.className = 'clp-realm-modal clp-rank-modal';
  lgModal.hidden = true;
  document.body.appendChild(lgModal);
  let lgCache = null;
  const lgNum = (value) => { const n = Number(value); return Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '—'; };
  const lgShell = (inner) => `<div class="clp-rank-card clp-lg-card" role="dialog" aria-modal="true" aria-label="灵根八相">
      <i class="clp-rank-stars" aria-hidden="true"></i><i class="clp-rank-stars is-b" aria-hidden="true"></i>
      <header class="clp-rank-head"><div><span>${esc(identity.class_name || '本班')} · 全学期</span><h3>灵根八相</h3></div><button type="button" data-lg-close aria-label="关闭">×</button></header>
      ${inner}</div>`;
  // 八边形雷达（SVG 固定画布 360 宽，随卡片缩放）
  function lgRadar(rows, hasMe) {
    const W = 360; const R = 100; const cx = W / 2; const cy = R + 50; const H = cy + R + 42;
    const n = rows.length;
    const ang = (i) => -Math.PI / 2 + (i * Math.PI * 2) / n;
    const at = (i, k) => [cx + R * k * Math.cos(ang(i)), cy + R * k * Math.sin(ang(i))].map((v) => Math.round(v * 10) / 10);
    const poly = (fn) => rows.map((d, i) => at(i, fn(d)).join(',')).join(' ');
    const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${poly(() => k)}" class="${k === 1 ? 'is-rim' : 'is-ring'}"/>`).join('');
    const spokes = rows.map((d, i) => { const [x, y] = at(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="is-ring"/>`; }).join('');
    const labels = rows.map((d, i) => {
      const c = Math.cos(ang(i)); const sn = Math.sin(ang(i));
      const [x, y] = at(i, 1 + 16 / R);
      const anchor = c > 0.2 ? 'start' : c < -0.2 ? 'end' : 'middle';
      const y0 = sn < -0.9 ? y - 14 : sn > 0.9 ? y + 8 : y - 2;
      return `<text x="${x}" y="${y0}" text-anchor="${anchor}" class="is-name">${esc(d.name)}</text><text x="${x}" y="${y0 + 14}" text-anchor="${anchor}" class="is-what">${esc(d.what)}</text>`;
    }).join('');
    const shape = (key, cls) => `<g class="clp-lg-shape ${cls}" style="transform-origin:${cx}px ${cy}px"><polygon points="${poly((d) => d[`r_${key}`])}"/>${rows.map((d, i) => { const [x, y] = at(i, d[`r_${key}`]); return `<circle cx="${x}" cy="${y}" r="${key === 'me' ? 3.6 : 2.6}"/>`; }).join('')}</g>`;
    return `<svg class="clp-lg-radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rows.map((d) => `${d.name}（${d.what}）：${hasMe ? `你 ${lgNum(d.me)}${d.unit}，` : ''}全班平均 ${lgNum(d.avg)}${d.unit}`).join('；'))}">
      <defs><radialGradient id="clp-lg-me" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ff7aa8" stop-opacity=".55"/><stop offset="1" stop-color="#FF0F6B" stop-opacity=".28"/></radialGradient></defs>
      ${rings}${spokes}${shape('avg', 'is-avg')}${hasMe ? shape('me', 'is-me') : ''}${labels}</svg>`;
  }
  function lgBody(data) {
    if (!data || data.status === 'login') return '<p class="clp-rank-state">这台设备还没有通过本堂课的登录核对，看不到灵根八相：请回首页用课堂码重新登录。</p>';
    if (!Number(data.held)) return '<p class="clp-rank-state">本班还没有上过课。上过课以后，这里会显示你在八个方向上的修炼情况。</p>';
    const byKey = new Map((data.rows || []).map((row) => [row.key, row]));
    const hasMe = !data.teacher && !PREVIEW && (data.rows || []).some((row) => row.me != null);
    const rows = LINGEN.map((item) => {
      const row = byKey.get(item.key) || {};
      const me = Number(row.me) || 0; const avg = Number(row.avg) || 0;
      const top = Math.max(Number(row.max) || 0, hasMe ? me : 0, avg) || 1;
      return { ...item, me, avg, max: Number(row.max) || 0, top, r_me: Math.max(0, Math.min(1, me / top)), r_avg: Math.max(0, Math.min(1, avg / top)), gap: (me - avg) / top };
    });
    const maxNote = (d) => (d.key === 'attend' ? `共 ${lgNum(d.max)} 次课` : d.key === 'days' ? `开课 ${lgNum(d.max)} 天` : d.key === 'rate' ? '满分 100%' : `全班最高 ${lgNum(d.max)}${d.unit}`);
    let verdict = '';
    if (hasMe) {
      let good = rows.filter((d) => d.gap > 0.03).sort((a, b) => b.gap - a.gap).slice(0, 2);
      const goodAbove = good.length > 0;
      if (!good.length) good = rows.slice().sort((a, b) => b.r_me - a.r_me).slice(0, 1);
      let weak = rows.filter((d) => d.gap < -0.03 && !good.includes(d)).sort((a, b) => a.gap - b.gap).slice(0, 2);
      const weakBelow = weak.length > 0;
      if (!weak.length) weak = rows.filter((d) => !good.includes(d)).sort((a, b) => a.r_me - b.r_me).slice(0, 1);
      const tag = (d) => `<b>${esc(d.name)}</b><small>${esc(d.what)}</small>`;
      verdict = `<div class="clp-lg-verdict">
        <section class="is-good"><h4>所长</h4><p class="clp-lg-lead">${goodAbove ? '这几相高于全班平均：' : '八相里你最接近满格的一相：'}</p>
          <ul>${good.map((d) => `<li>${tag(d)}${esc(lgNum(d.me))}${esc(d.unit)}（平均 ${esc(lgNum(d.avg))}${esc(d.unit)}）<br><span>${esc(d.good)}</span></li>`).join('')}</ul></section>
        <section class="is-weak"><h4>待补</h4><p class="clp-lg-lead">${weakBelow ? '这几相低于全班平均，可以这样补：' : '没有明显低于平均的一相，再往上可以练：'}</p>
          <ul>${weak.map((d) => `<li>${tag(d)}${esc(lgNum(d.me))}${esc(d.unit)}（平均 ${esc(lgNum(d.avg))}${esc(d.unit)}）<br><span>${esc(d.tip)}</span></li>`).join('')}</ul></section></div>`;
    } else {
      verdict = `<p class="clp-lg-intro">${PREVIEW || data.teacher ? '这是学生版测试页：只显示全班平均。同学们打开时，会看到自己的八相（粉色）和所长、待补。' : '你还没有学习记录：签到、作答、发弹幕以后，这里会画出你的八相。'}</p>`;
    }
    const when = data.updated_at ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(data.updated_at)) : '';
    return `<p class="clp-lg-intro">八个方向看你本学期的修炼：越往外越强，外圈是这一项的满分或全班最高。</p>
      <p class="clp-lg-keys">${hasMe ? '<span><i class="is-me"></i>你</span>' : ''}<span><i class="is-avg"></i>全班平均（${Number(data.people) || 0} 人）</span></p>
      ${lgRadar(rows, hasMe)}
      ${verdict}
      <ol class="clp-lg-list">${rows.map((d, i) => `<li class="clp-lg-row" style="--i:${i}">
        <span class="clp-lg-name"><b>${esc(d.name)}</b><small>${esc(d.what)}</small></span>
        <span class="clp-lg-bar" title="${esc(maxNote(d))}">${hasMe ? `<i class="is-me" style="width:${Math.round(d.r_me * 100)}%"></i>` : ''}<i class="is-avg" style="left:${Math.round(d.r_avg * 100)}%"></i></span>
        <span class="clp-lg-val">${hasMe ? `<b>${esc(lgNum(d.me))}</b>${esc(d.unit)}` : ''}<small>平均 ${esc(lgNum(d.avg))}${esc(d.unit)} · ${esc(maxNote(d))}</small></span></li>`).join('')}</ol>
      <p class="clp-rank-note">统计本班全学期的课堂（期中考查作业不算）。勤勉＝到课次数，恒心＝有学习记录的天数，精进＝登录、签到、递交、弹幕、修炼场、抢答、聊天室等学习行为的次数，定力＝课程页面在前台的时间；悟性（作答正确率）和根基（修为）按老师最近一次结算${when ? `（${esc(when)}）` : ''}。全班平均只算点名册上的同学。</p>`;
  }
  async function openLingen() {
    lgModal.innerHTML = lgShell('<p class="clp-rank-state">正在推演灵根……</p>');
    lgModal.hidden = false;
    lgModal.querySelector('[data-lg-close]').focus();
    try {
      let data = lgCache && Date.now() - lgCache.at < 30000 ? lgCache.data : null;
      if (!data) {
        const value = await backend.rpc('ck_my_lingen', { p_classroom: Number(identity.classroom) || identity.classroom });
        data = Array.isArray(value) ? value[0] : value;
        if (data && data.status === 'ok') lgCache = { at: Date.now(), data };
      }
      if (lgModal.hidden) return;
      lgModal.innerHTML = lgShell(lgBody(data));
    } catch (problem) {
      if (lgModal.hidden) return;
      const missing = /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
      lgModal.innerHTML = lgShell(`<p class="clp-rank-state">${missing ? '灵根八相还没有开通（老师后台尚未更新）。' : '读取失败：请检查网络后再打开一次。'}</p>`);
    }
    const close = lgModal.querySelector('[data-lg-close]');
    if (close) close.focus();
  }
  lgModal.addEventListener('click', (event) => {
    if (event.target === lgModal || event.target.closest('[data-lg-close]')) lgModal.hidden = true;
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !lgModal.hidden) lgModal.hidden = true; });
  panel.querySelectorAll('[data-cl-lingen-open]').forEach((button) => button.addEventListener('click', openLingen));

  // ---------- 宗门（2026-11-05 用户：“设置四个不同的宗门……达到筑基期的同学可以让他们选择加入不同的宗门，也可以选择做散修，然后宗门也有分数和排名，
  //   加总宗门弟子的修为值就是宗门的分值，也会有排名。宗门是打通每门课程不同年份的……一年一年一直传承下去，允许新同学的加入。”）：
  //   面板“宗门”按钮打开宗门榜（ck_sect_board：四宗总修为＝本课程历届弟子修为之和，历届／本班弟子人数）；达到「筑基」（按老师最近一次结算）后
  //   可以拜入一个宗门或暂做散修（ck_sect_join）：拜入后可以改投他宗一次（2026-11-05 用户：“学生只有一次更改宗门的机会”），不能退为散修；
  //   散修以后仍可拜入（不算改投）；老师可在工作台解除。
  //   2026-11-05 用户：“达到「筑基」境界的同学，如果还没有选择宗门的，下次登陆的时候会弹出选择宗门的选项，分别介绍一下四大宗门，介绍一下宗训和宗风，
  //   尽量做得美观一些，可以加一些特效。”——选择与改投改在“山门大开”全屏画面里（live-sect.js：四宗简介、宗训释义、宗风说明、各宗特效、拜入庆贺）；
  //   已达筑基、既没拜入宗门也没选散修的同学，每天第一次打开页面自动弹出（这台设备每天一次），选定宗门或散修后不再弹。
  //   拜入后面板按钮显示宗门名和宗门色，修为榜上名字旁有宗门标记。测试页用示意数据，不会真的拜入；旁听没有宗门 ----------
  const SECTS = Live.SECTS || [];
  const SECT_MIN = Live.SECT_MIN_REALM || 1;
  const sectOf = (key) => SECTS.find((item) => item.key === key) || null;
  const rgba = (hex, alpha) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; };
  const sectVars = (sect) => `--sc:${sect.color};--sg:${rgba(sect.glow, 0.75)};--sa:${rgba(sect.color, 0.42)}`;
  function sectDot(key) {
    const sect = sectOf(key);
    return sect ? `<span class="clp-sect-dot" style="${sectVars(sect)}" title="${esc(sect.name)}弟子" aria-label="${esc(sect.name)}弟子">${esc(sect.mark)}</span>` : '';
  }
  const sectButton = panel.querySelector('[data-cl-sect-open]');
  const sectModal = document.createElement('div');
  sectModal.className = 'clp-realm-modal clp-rank-modal';
  sectModal.hidden = true;
  document.body.appendChild(sectModal);
  const sectGateKey = `classlive-sect-gate:${config.course}:${identity.class_name || ''}:${identity.sid || ''}`;   // 记下今天自动弹过“山门大开”
  let sectCache = null;     // { at, data }：30 秒内重复打开不再读后台
  let gateOpen = false;
  function showSectButton(mine) {
    if (!sectButton) return;
    const sect = sectOf(mine && mine.sect);
    sectButton.classList.toggle('is-sanxiu', Boolean(mine && mine.sect === 'sanxiu'));
    sectButton.style.cssText = sect ? sectVars(sect) : '';
    sectButton.innerHTML = sect ? `<span aria-hidden="true">${esc(sect.mark)}</span>${esc(sect.name)}`
      : mine && mine.sect === 'sanxiu' ? '<span aria-hidden="true">散</span>散修' : '<span aria-hidden="true">宗</span>宗门';
    sectButton.title = sect ? `你是${sect.name}弟子：点开看宗门榜` : mine && mine.sect === 'sanxiu' ? '你现在是散修，随时可以拜入宗门' : '宗门榜：达到「筑基」后可以拜入宗门';
  }
  async function loadSect() {
    // 测试页（2026-11-06 用户：“学生测试版中的控制页面，要能够同步宗门的排行”）：宗门榜读后台的真实排行（ck_sect_board 对教师账号照常返回，
    // 只是没有“本人”）；“本人”按测试身份王不凡显示，可以看“山门大开”，不会真的拜入。读不到时才用示意数据
    if (PREVIEW) {
      const me = { sect: null, realm: Number(myRealm && myRealm.realm) || 0, points: null, can_join: true };
      let data = null;
      try {
        const value = await backend.rpc('ck_sect_board', { p_classroom: Number(identity.classroom) || identity.classroom });
        data = Array.isArray(value) ? value[0] : value;
      } catch (problem) { data = null; }
      data = data && data.status === 'ok' ? { ...data, mine: me, live: true }
        : { status: 'ok', sects: SECTS.map((sect) => ({ key: sect.key, points: 0, members: 0, class_members: 0, class_points: 0 })), sanxiu: 0, class_sanxiu: 0, classes: 0, mine: me, live: false };
      sectCache = { at: Date.now(), data };
      return data;
    }
    const value = await backend.rpc('ck_sect_board', { p_classroom: Number(identity.classroom) || identity.classroom });
    const data = Array.isArray(value) ? value[0] : value;
    if (data && data.status === 'ok') { sectCache = { at: Date.now(), data }; showSectButton(data.mine); }
    return data;
  }
  const sectShell = (inner) => `<div class="clp-rank-card" role="dialog" aria-modal="true" aria-label="宗门榜">
      <i class="clp-rank-stars" aria-hidden="true"></i><i class="clp-rank-stars is-b" aria-hidden="true"></i>
      <header class="clp-rank-head"><div><span>${esc({ 'xjp-economy': '习近平经济思想概论', 'political-economy': '政治经济学' }[config.course] || '本课程')} · 历届弟子修为合计</span><h3>宗门榜</h3></div><button type="button" data-sect-close aria-label="关闭">×</button></header>
      ${inner}</div>`;
  const bigNum = (value) => { const n = Number(value) || 0; return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 }); };
  function sectBody(data) {
    if (!data || data.status === 'login') return '<p class="clp-rank-state">这台设备还没有通过本堂课的登录核对，看不到宗门榜：请回首页用课堂码重新登录。</p>';
    const list = SECTS.map((sect) => ({ ...sect, ...((data.sects || []).find((row) => row.key === sect.key) || {}) }))
      .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
    list.forEach((row) => { row.rank = 1 + list.filter((other) => (Number(other.points) || 0) > (Number(row.points) || 0)).length; });
    const mine = data.mine || {};
    const choosing = Boolean(mine.can_join) && (!mine.sect || mine.sect === 'sanxiu');
    const rows = list.map((row, i) => {
      const isMine = mine.sect === row.key;
      return `<li class="clp-sect-row${isMine ? ' is-mine' : ''}" style="${sectVars(row)};--i:${i}">
        <span class="clp-rank-no">${row.rank}</span><span class="clp-sect-emb" aria-hidden="true">${esc(row.mark)}</span>
        <span class="clp-sect-main"><strong>${esc(row.name)}${isMine ? '<small>本门</small>' : ''}</strong>
          <span class="clp-sect-motto">“${esc(row.motto)}”——${esc(row.source)}</span><span class="clp-sect-way">宗风：${esc(row.way)}</span>
          <span class="clp-sect-meta">历届弟子 ${Number(row.members) || 0} 人 · 本班 ${Number(row.class_members) || 0} 人</span></span>
        <span class="clp-sect-pts">${bigNum(row.points)}<small>宗门分</small></span></li>`;
    }).join('');
    const sect = sectOf(mine.sect);
    const gateBtn = (text) => `<button type="button" class="clp-sect-gate" data-sect-gate>${text}</button>`;
    const mineHtml = PREVIEW ? `<div class="clp-rank-mine clp-sect-mine"><span>${data.live ? '测试页：上面是本课程宗门的真实排行（和学生看到的一样）' : '测试页：后台没读到，上面是示意数据'}；可以看“山门大开”的画面，不会真的拜入宗门。</span>${gateBtn('进入山门 · 挑选宗门')}</div>`
      : sect ? `<div class="clp-rank-mine clp-sect-mine"><span>你是「${esc(sect.name)}」弟子${mine.points != null ? `，你的修为 ${ptsText(mine.points)} 计入本门` : ''}。宗训：“${esc(sect.motto)}”。${mine.can_change ? '你还有一次改投他宗的机会（只有一次，改投后不能再换）。' : Number(mine.changes) >= 1 ? '你的改投机会已经用过了。' : ''}</span>${mine.can_change ? gateBtn('改投他宗（仅一次）') : ''}</div>`
      : choosing ? `<div class="clp-rank-mine clp-sect-mine"><span>${mine.sect === 'sanxiu' ? '你现在是散修，修为不计入任何宗门；想清楚了随时可以拜入一个宗门。' : `你已达到「${esc(REALMS[Number(mine.realm) || SECT_MIN].name)}」，可以拜入一个宗门，也可以暂做散修（拜入以后就不能再变回散修）。`}</span>${gateBtn('进入山门 · 挑选宗门')}</div>`
      : `<p class="clp-rank-mine">达到「${esc(REALMS[SECT_MIN].name)}」境界后可以拜入宗门（按老师最近一次结算的境界）。你现在${mine.realm != null ? `是「${esc(REALMS[Number(mine.realm)].name)}」` : '还没有结算境界'}，继续修炼吧！</p>`;
    return `<p class="clp-rank-meta">四大宗门 · 已有 ${Number(data.classes) || 0} 个班的弟子${Number(data.sanxiu) ? ` · 散修 ${Number(data.sanxiu)} 人` : ''}</p>
      <ol class="clp-sect-list">${rows}</ol>${mineHtml}
      <p class="clp-rank-note">宗门分＝本课程历届弟子的修为之和（按老师最近一次结算），分高者排名在前。弟子结课以后修为仍留在宗门里，一届一届传承下去，新同学随时可以加入；散修不计入任何宗门。拜入宗门以后有一次改投他宗的机会，改投时修为随你转到新宗门。</p>`;
  }
  async function openSect() {
    sectModal.innerHTML = sectShell('<p class="clp-rank-state">正在读取宗门榜……</p>');
    sectModal.hidden = false;
    sectModal.querySelector('[data-sect-close]').focus();
    try {
      const data = sectCache && Date.now() - sectCache.at < 30000 ? sectCache.data : await loadSect();
      if (sectModal.hidden) return;
      sectModal.innerHTML = sectShell(sectBody(data));
    } catch (problem) {
      if (sectModal.hidden) return;
      const missing = /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
      sectModal.innerHTML = sectShell(`<p class="clp-rank-state">${missing ? '宗门还没有开通（老师后台尚未更新）。' : '读取宗门榜失败：请检查网络后再打开一次。'}</p>`);
    }
    const close = sectModal.querySelector('[data-sect-close]');
    if (close) close.focus({ preventScroll: true });
  }
  const redrawSect = () => { if (sectCache && !sectModal.hidden) sectModal.innerHTML = sectShell(sectBody(sectCache.data)); };
  // 拜入／改投／做散修（山门画面的回调）：返回 { ok, message }；成功后刷新宗门榜、按钮和修为榜
  async function joinSect(key) {
    const sect = sectOf(key);
    if (PREVIEW) {
      toast(key === 'sanxiu' ? '测试页：不会真的做散修。' : `测试页：只演示画面，不会真的拜入「${sect.name}」。`);
      return { ok: true };
    }
    let res;
    try {
      const value = await backend.rpc('ck_sect_join', { p_classroom: Number(identity.classroom) || identity.classroom, p_sect: key });
      res = (Array.isArray(value) ? value[0] : value) || {};
    } catch (problem) {
      console.error(problem);
      return { ok: false, message: '没有成功，请检查网络后再试。' };
    }
    sectCache = null;
    rankCache = null;
    try { await loadSect(); redrawSect(); } catch (problem) { /* 下次打开再读 */ }
    if (res.status === 'ok') {
      if (key === 'sanxiu') toast('你选择了暂做散修，以后随时可以拜入宗门。');
      return { ok: true };
    }
    const now = sectOf(res.sect);
    return { ok: false, message: res.status === 'locked' || res.status === 'already' ? `你是「${now ? now.name : ''}」弟子：改投机会只有一次${Number(res.changes) >= 1 ? '，已经用过了' : ''}，也不能退为散修。`
      : res.status === 'realm' ? `达到「${REALMS[SECT_MIN].name}」境界后才能拜入宗门（按老师最近一次结算的境界）。`
        : '请回首页用课堂码重新登录后再试。' };
  }
  // “山门大开”：四宗简介、宗训与宗风、特效与拜入庆贺（live-sect.js）；没加载到时退回宗门榜
  async function openGate(welcome) {
    if (gateOpen) return;
    let data = sectCache && Date.now() - sectCache.at < 30000 ? sectCache.data : null;
    try { if (!data) data = await loadSect(); } catch (problem) { data = null; }
    if (!data || data.status !== 'ok' || !window.ClassLiveSect) { openSect(); return; }
    const mine = data.mine || {};
    const switching = Boolean(mine.can_change) && mine.sect && mine.sect !== 'sanxiu';
    if (!PREVIEW && !mine.can_join) { openSect(); return; }
    const list = SECTS.map((sect) => ({ ...sect, ...((data.sects || []).find((row) => row.key === sect.key) || {}) }));
    list.forEach((row) => { row.rank = 1 + list.filter((other) => (Number(other.points) || 0) > (Number(row.points) || 0)).length; });
    sectModal.hidden = true;
    gateOpen = true;
    window.ClassLiveSect.open({ sects: list, mode: switching ? 'switch' : 'join', current: mine.sect, welcome, preview: PREVIEW,
      onPick: joinSect, onClose: () => { gateOpen = false; } });
  }
  sectModal.addEventListener('click', (event) => {
    if (event.target === sectModal || event.target.closest('[data-sect-close]')) { sectModal.hidden = true; return; }
    if (event.target.closest('[data-sect-gate]')) openGate(false);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !sectModal.hidden) sectModal.hidden = true; });
  if (sectButton) sectButton.addEventListener('click', () => openSect());
  // 打开页面（和每分钟刷新境界）时：已达筑基的同学读一次宗门榜，按钮显示所属宗门；既没拜入宗门也没选散修的，每天第一次自动弹出“山门大开”
  // （这台设备每天一次，等更新说明、修为提升等弹窗关掉以后）
  let sectLoaded = false;
  async function sectInit() {
    if (sectLoaded || LOCAL_ONLY || OFFLINE || !joined || !sectButton) return;
    if (!myRealm || (Number(myRealm.realm) || 0) < SECT_MIN) return;
    sectLoaded = true;
    try {
      const data = await loadSect();
      const mine = data && data.mine;
      const today = Live.today();
      if (!mine || !mine.can_join || mine.sect || load(sectGateKey, '') === today) return;
      let waited = 0;
      const tryOpen = () => {
        const busy = gateOpen || !newsModal.hidden || !realmModal.hidden || !rankModal.hidden || !sectModal.hidden || document.querySelector('.clp-egg, .clp-pzd:not([hidden])');
        if (busy) { if ((waited += 1) < 120) setTimeout(tryOpen, 1500); return; }   // 一直有弹窗（如课上的猜谜抢答）就不打扰，下次打开页面再弹
        save(sectGateKey, today);
        openGate(true);
      };
      setTimeout(tryOpen, 2500);
    } catch (problem) {
      sectLoaded = false;   // 后台还没有宗门（未执行 SQL）或网络问题：下次刷新境界时再试
    }
  }
  // 修炼场（live-practice.js）：两门课各自一个，平时做题攒修为
  panel.querySelectorAll('[data-cl-practice-open]').forEach((button) => button.addEventListener('click', () => {
    if (window.ClassLivePractice) window.ClassLivePractice.open({ backend, identity, config });
  }));
  realmEl.addEventListener('click', openRealm);
  panel.querySelector('[data-cl-realm-open]').addEventListener('click', openRealm);
  realmEl.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRealm(); } });

  // ---------- 版本更新说明：每台设备进入课堂后自动弹出一次（NEWS_ID 改了会再弹一次），面板底部“更新说明”可以再看 ----------
  // 内容按课程筛选（course 为空的两门课都显示）；每条是 [小标题, 说明]
  // 版本号按课程分开：只有本课程有新内容时才改，免得另一门课的同学被重复打扰
  const NEWS_ID = config.course === 'political-economy' ? '20261111-ch8-pe' : '20261111-timeline-xjp';   // 两门课各自有新内容时才改自己的
  const newsRangeText = () => (Live.newsRange ? Live.newsRange(newsSections().flatMap((section) => section.items.map((item) => item[2]))) : '');
  const newsKey = `classlive-news:${config.course}`;
  // 2026-11-06 起条目放在 live-core.js（Live.news），带日期；学生页只显示最近 NEWS_DAYS（20）天的，工作台“更新说明”看全部
  function newsSections() {
    return Live.newsList ? Live.newsList(config.course, Live.NEWS_DAYS || 20) : [];
  }
  const newsModal = document.createElement('div');
  newsModal.className = 'clp-realm-modal';
  newsModal.hidden = true;
  document.body.appendChild(newsModal);
  function openNews() {
    newsModal.innerHTML = `<div class="clp-realm-card clp-news-card" role="dialog" aria-modal="true" aria-label="版本更新说明">
      <h3><span>版本更新说明</span><button type="button" data-news-close aria-label="关闭">×</button></h3>
      <p class="clp-hint">${esc(newsRangeText())}，课程网站做了这些更新（只列最近 ${Live.NEWS_DAYS || 20} 天的）。以后点面板底部的“更新说明”可以再看。</p>
      ${newsSections().map((section) => `<h4>${esc(section.title)}</h4><ul>${section.items.map(([label, text]) => `<li><b>${esc(label)}</b>：${esc(text)}</li>`).join('')}</ul>`).join('')}
      <div class="clp-news-ok"><button type="button" data-news-close>知道了</button></div></div>`;
    newsModal.hidden = false;
    newsModal.querySelector('[data-news-close]').focus();
  }
  function closeNews() {
    newsModal.hidden = true;
    save(newsKey, NEWS_ID);   // 看过这一版就不再自动弹出
  }
  newsModal.addEventListener('click', (event) => { if (event.target === newsModal || event.target.closest('[data-news-close]')) closeNews(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !newsModal.hidden) closeNews(); });
  panel.querySelector('[data-cl-news-open]').addEventListener('click', openNews);
  function toast(text) {
    const box = document.createElement('div');
    box.className = 'clp-toast';
    box.setAttribute('role', 'status');
    box.textContent = text;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 6000);
  }
  // 隐藏彩蛋的弹出提示（2026-11-05，“更新说明”里不写，让学生自己发现）：建议被采纳（stay＝一直显示到点“收下”）、点笑脸、一周登录满 3 天；
  // 几条同时到时一条一条显示。warn：无效弹幕被老师删除的提醒（2026-11-06），不是彩蛋，样式和按钮不同
  const eggQueue = [];
  function egg(text, stay, warn) {
    eggQueue.push([text, stay, warn]);
    if (eggQueue.length === 1) showEgg();
  }
  function showEgg() {
    const [text, stay, warn] = eggQueue[0];
    const box = document.createElement('div');
    box.className = 'clp-egg';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', warn ? '弹幕提醒' : '修为提升');
    box.innerHTML = warn
      ? '<div class="clp-egg-card is-warn"><span class="clp-egg-burst" aria-hidden="true">!</span><p></p><small>发有内容的弹幕才有修为，同一句只算一次</small><button type="button">知道了</button></div>'
      : '<div class="clp-egg-card"><span class="clp-egg-burst" aria-hidden="true">✦</span><p></p><small>老师结算修为后计入境界</small><button type="button">收下</button></div>';
    box.querySelector('p').textContent = text;
    shield(box);
    let timer = 0;
    const close = () => {
      if (!box.isConnected) return;
      clearTimeout(timer);
      box.remove();
      eggQueue.shift();
      if (eggQueue.length) showEgg();
    };
    box.addEventListener('click', (event) => { if (event.target === box || event.target.closest('button')) close(); });
    box.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    document.body.appendChild(box);
    box.querySelector('button').focus({ preventScroll: true });
    if (!stay) timer = setTimeout(close, 9000);
  }
  // 法宝小图（与投屏画面同一套造型，用 CSS／SVG 画，不依赖表情字体）
  const GIFT_ICONS = {
    zhujidan: '<span class="clp-gi clp-gi-dan" aria-hidden="true">丹</span>',
    qingzhu: '<svg class="clp-gi" aria-hidden="true" width="22" height="10" viewBox="0 0 240 28"><rect x="0" y="10" width="40" height="8" rx="2" fill="#1d4a2c"/><path d="M40 2h8v24h-8z" fill="#c9a24a"/><path d="M48 8h166l24 6-24 6H48z" fill="#3fbf7a"/></svg>',
    fenglei: '<svg class="clp-gi" aria-hidden="true" width="22" height="14" viewBox="0 0 44 28"><path d="M22 18C16 8 8 4 1 3c4 4 2 6 6 8-3 1-2 4 2 5-2 2 1 4 5 3 2 3 6 2 8-1z" fill="#8fdcff" stroke="#3a9fd6"/><path d="M22 18C28 8 36 4 43 3c-4 4-2 6-6 8 3 1 2 4-2 5 2 2-1 4-5 3-2 3-6 2-8-1z" fill="#8fdcff" stroke="#3a9fd6"/></svg>',
    zhangtian: '<svg class="clp-gi" aria-hidden="true" width="14" height="18" viewBox="0 0 128 176"><path d="M55 12h18v22c0 6 4 9 10 13 18 11 31 31 31 58 0 36-24 63-50 63S14 141 14 105c0-27 13-47 31-58 6-4 10-7 10-13z" fill="#2fae6a" stroke="#9ff0c2" stroke-width="6"/></svg>',
  };
  const STAGES = Live.STAGES || [];
  let usedGifts = new Set();   // 本人已经祭出过的法宝（每件只能祭出一次，后台 ck_my_gifts）
  function showRealm(r) {
    const level = r ? Math.max(0, Math.min(REALMS.length - 1, Number(r.realm) || 0)) : 0;
    if (!PREVIEW) applyRealmGates(level);
    realmEl.className = `clp-realm is-r${level}`;
    realmEl.textContent = REALMS[level] ? REALMS[level].name : '炼气';
    realmEl.hidden = !REALMS.length || AUDIT;   // 旁听没有境界
    const miniCh = panel.querySelector('[data-cl-mini-ch]');
    if (miniCh) {
      miniCh.textContent = AUDIT ? '旁' : (REALMS[level] ? REALMS[level].name : '炼气').slice(0, 1);
      panel.querySelector('[data-cl-mini]').setAttribute('aria-label', `展开课堂面板（境界：${REALMS[level] ? REALMS[level].name : '炼气'}）`);
    }
    // 面板材质随境界变化；头部进度条只显示“距下一境界”，不显示分数
    [0, 1, 2, 3, 4].forEach((n) => panel.classList.toggle(`is-r${n}`, n === level));
    const rise = panel.querySelector('[data-cl-rise]');
    if (rise && REALMS[level] && !AUDIT) {
      const next = REALMS[level + 1];
      const stage = Math.max(0, Math.min(2, Number(r && r.stage) || 0));
      const lo = REALMS[level].min;
      const within = next ? Math.max(0, Math.min(1, ((r ? Number(r.ratio) || 0 : 0) - lo) / (next.min - lo || 1))) : (stage + 1) / 3;
      rise.hidden = false;
      rise.querySelector('[data-cl-rise-label]').textContent = next ? `距「${next.name}」` : `已达${REALMS[level].name} · ${STAGES[stage] || ''}`;
      rise.querySelector('[data-cl-rise-fill]').style.width = `${Math.round(within * 100)}%`;
    }
    giftBox.hidden = !GIFTS.length;
    giftBox.querySelectorAll('button').forEach((button) => button.remove());
    GIFTS.forEach((gift) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.gift = gift.id;
      const used = usedGifts.has(gift.id);
      const open = r && level >= gift.level && !used;
      button.disabled = !open;
      button.className = `is-${gift.id}${used ? ' is-used' : open ? '' : ' is-locked'}`;
      button.innerHTML = used ? `${GIFT_ICONS[gift.id] || ''}<span>${esc(gift.name)}</span><small>已祭出</small>`
        : open ? `${GIFT_ICONS[gift.id] || ''}<span>${esc(gift.name)}</span>` : `<span>${esc(gift.name)}</span><small>${esc(REALMS[gift.level].name)}解锁</small>`;
      button.title = used ? `「${gift.name}」已经祭出过了（每件只能祭出一次）` : open ? `祭出法宝「${gift.name}」（只能祭出一次）` : `${REALMS[gift.level].name}境界解锁`;
      giftBox.appendChild(button);
    });
    // 弹幕字色：每升一个境界多解锁两种（炼气白灰、筑基蓝绿、结丹金红、元婴粉紫、化神流光）；境界不够的显示但不能点
    colorBox.hidden = !COLORS.length;
    colorBox.querySelectorAll('button').forEach((button) => button.remove());
    const current = myDanmakuColor();
    COLORS.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.color = color.id;
      button.style.background = color.flow || color.value;
      const open = level >= color.level;   // 还没有境界记录的按炼气：霜白、月银人人可选
      button.disabled = !open;
      button.setAttribute('aria-pressed', String(open && current === color.id));
      button.title = open ? `弹幕字色：${color.name}` : `${color.name}（${REALMS[color.level].name}解锁）`;
      button.setAttribute('aria-label', button.title);
      colorNote.before(button);
    });
    colorNote.textContent = (COLORS.find((color) => color.id === current) || {}).name || '';
    // 输入框直接用所选字色预览投屏上的样子（流光色用渐变字）
    const chosen = COLORS.find((color) => color.id === current) || null;
    panel.classList.toggle('has-color', Boolean(chosen));
    panel.classList.toggle('has-flow', Boolean(chosen && chosen.flow));
    panel.style.setProperty('--clp-dm-color', chosen && chosen.value ? chosen.value : '#e3cfff');
    panel.style.setProperty('--clp-dm-flow', chosen && chosen.flow ? chosen.flow : 'none');
    if (!dmState.dataset.state) dmState.textContent = chosen ? '输入框里的颜色就是投屏上的字色 · 请文明发言' : DM_HINT;
  }
  // 本人能用的弹幕字色：选过且境界够就用选的，否则用本境界默认色（炼气至结丹没有默认色，不选就是白字）
  function myDanmakuColor() {
    const level = myRealm ? Number(myRealm.realm) || 0 : 0;
    if (!Live.colorFor) return null;
    const color = Live.colorFor(level, load(colorKey, null));
    return color ? color.id : null;
  }
  colorBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-color]');
    if (!button || button.disabled) return;
    save(colorKey, button.dataset.color);
    showRealm(myRealm);
    dmState.textContent = `弹幕字色已换成「${(COLORS.find((color) => color.id === button.dataset.color) || {}).name}」，下一条弹幕起生效。`;
    dmState.dataset.state = 'ok';
  });
  showRealm(myRealm);
  // 本人境界：打开页面时核对一次，之后每分钟核对一次（老师课上结算后不用刷新也能看到突破）
  const ascendKey = `classlive-ascend:me:${config.course}:${identity.sid}`;   // 这台设备给这位同学放过的最高突破境界
  let ascendBusy = false;
  async function refreshRealm() {
    if (LOCAL_ONLY) return false;   // 测试页按化神；旁听没有境界
    let previewed = false;
    try {
      const value = await backend.rpc('ck_my_realm', { p_classroom: Number(identity.classroom) || identity.classroom });
      const row = Array.isArray(value) ? value[0] : value;
      if (!row) { showRealm(myRealm); return; }
      const fresh = { realm: Number(row.realm) || 0, stage: Number(row.stage) || 0, ratio: Number(row.ratio) || 0, updated_at: row.updated_at || '' };
      // 突破元婴/化神画面（2026-11-11 用户：“学生突破元婴的话在课堂页面和学生自己的页面会有类似于祭出法宝的动画和祝福语。只要在该台设备没出现过，
      //   无论是课堂页面还是学生页面，下次登陆的时候都会在各自的页面出现一次。”）：这台设备没给这位同学放过这一境界的，先放突破画面（live-ascend.js），再放法宝预览
      if (fresh.realm >= 3 && window.ClassLiveAscend && Number(load(ascendKey, 0)) < fresh.realm && !ascendBusy) {
        ascendBusy = true;
        try {
          const shown = Number(load(ascendKey, 0)) || 0;
          for (const level of window.ClassLiveAscend.LEVELS.filter((lv) => lv > shown && lv <= fresh.realm).slice(-1)) {
            save(ascendKey, fresh.realm);   // 先记下，播放中刷新或关掉页面也不会再放第二次
            await window.ClassLiveAscend.play({ level, self: true, names: [identity.name], fit: 'narrow' });
          }
        } finally { ascendBusy = false; }
      }
      if (myRealm && fresh.realm > (Number(myRealm.realm) || 0)) {
        const gift = GIFTS.find((item) => item.level === fresh.realm);
        toast(`恭喜突破！你已晋升「${REALMS[fresh.realm].name}」境界${gift ? `，解锁弹幕法宝「${gift.name}」（可祭出一次）。刚才是法宝预览，课上可在面板里祭出一次，投屏全班可见` : ''}。`);
        // 突破的同时，在本人页面预览这件法宝（只在自己页面上，不上投屏、不算祭出；画面在 live-gifts.js）
        if (gift && window.ClassLiveGifts) {
          window.ClassLiveGifts.play({ gift, sealName: REALMS[fresh.realm].name, who: `${identity.name}　突破${REALMS[fresh.realm].name} · 法宝预览`, fit: 'narrow' });
          previewed = true;
        }
      }
      myRealm = fresh;
      save(realmKey, fresh);
      showRealm(fresh);
    } catch (error) { /* 后台还没有修为境界时，按上次记住的显示 */ }
    return previewed;
  }
  // 进入课堂后自动弹出更新说明（每台设备每一版一次）；刚播放突破预览时，等法宝画面放完再弹
  const refreshRealmDone = checkedIn.then(refreshRealm);
  refreshRealmDone.then((previewed) => {
    if (load(newsKey, '') === NEWS_ID) return;
    const gap = previewed ? ((window.ClassLiveGifts && window.ClassLiveGifts.GIFT_MS) || 3200) + 800 : 800;
    setTimeout(() => { if (newsModal.hidden && realmModal.hidden) openNews(); }, gap);
  });
  if (!LOCAL_ONLY) setInterval(() => { if (!document.hidden) refreshRealm().then(() => sectInit()); }, 60000);
  if (!LOCAL_ONLY) refreshRealmDone.then(() => sectInit());   // 宗门：已达筑基的读一次宗门榜，第一次自动弹出
  // 本人已经祭出过的法宝：按钮显示“已祭出”（测试页法宝不限次数；旁听没有法宝）
  if (!LOCAL_ONLY) {
    checkedIn.then(() => backend.rpc('ck_my_gifts', { p_classroom: Number(identity.classroom) || identity.classroom }))
      .then((value) => { usedGifts = new Set(Live.stopList ? Live.stopList(value) : []); showRealm(myRealm); })
      .catch(() => { /* 后台还没有这项功能时忽略 */ });
  }
  giftBox.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-gift]');
    if (!button || button.disabled) return;
    const gift = GIFTS.find((item) => item.id === button.dataset.gift);
    giftBox.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      if (PREVIEW) {
        await backend.rpc('ck_test_danmaku', { p_classroom: previewRoom, p_text: null, p_color: null, p_gift: gift.id });
        dmState.textContent = `已祭出法宝「${gift.name}」，正在飞上投屏！（测试页法宝不限次数）`;
      } else {
        await backend.rpc('ck_send_gift', { p_classroom: Number(identity.classroom) || identity.classroom, p_gift: gift.id });
        usedGifts.add(gift.id);
        dmState.textContent = `已祭出法宝「${gift.name}」，正在飞上投屏！每件法宝只能祭出一次。`;
      }
      dmState.dataset.state = 'ok';
      // 2026-11-04 用户：“学生在使用法宝的时候，自己的页面也会显示”——祭出成功后，本人页面也放一遍同样的法宝画面（名牌与投屏一致：本人境界＋姓名）
      if (window.ClassLiveGifts) {
        const level = PREVIEW ? GIFTS.reduce((top, item) => Math.max(top, item.level), 0) : (myRealm ? Number(myRealm.realm) || 0 : gift.level);
        const sealName = (REALMS[Math.max(level, gift.level)] || REALMS[gift.level] || {}).name || '';
        window.ClassLiveGifts.play({ gift, sealName, who: `${identity.name}　${gift.verb || '祭出'}`, fit: 'narrow' });
      }
    } catch (problem) {
      console.warn('[法宝]', problem);
      const text = String((problem && problem.message) || problem || '');
      dmState.dataset.state = 'error';
      if (/只能祭出一次|已经祭出过|23505|duplicate/i.test(text)) usedGifts.add(gift.id);
      dmState.textContent = /只能祭出一次|已经祭出过|23505|duplicate/i.test(text) ? '这件法宝已经祭出过了（每件只能祭出一次）。'
        : /每次课/.test(text) ? '这次课已经祭出过法宝了，下次课再来。'
        : /境界/.test(text) ? '境界还不够，暂时不能祭出这件法宝。'
          : /重新登录/.test(text) ? reloginText + '。'
            : /弹幕|42501/.test(text) ? '老师还没有开放弹幕，暂时不能祭出法宝。' : '祭出失败：请检查网络后再试。';
    } finally {
      showRealm(myRealm);
    }
  });

  // 这堂课感觉怎么样（2026-10-28 用户：“意见提问箱旁边可以再设置一个笑脸或者不高兴脸的功能，让大家评判上完这节课的感觉怎么样”）：
  //   建议箱里的一行笑脸 / 不高兴的脸，每人每个课堂每天一票（ck_set_mood，按学号记，换设备也是同一票），再点一次已选的＝撤回；
  //   老师在工作台“匿名建议”里只看到人数（ck_mood_stats）。后台还没有这组函数（未执行 SQL）时整行隐藏
  function setupMood(enabled) {
    const rows = fbCards.map(({ card }) => card.querySelector('.clp-mood')).filter(Boolean);
    if (!rows.length) return;
    const buttons = rows.flatMap((row) => Array.from(row.querySelectorAll('[data-mood]')));
    const say = (text) => rows.forEach((row) => { row.querySelector('.clp-mood-state').textContent = text; });
    let mine = 0;
    const show = () => buttons.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.mood) === mine)));
    if (!enabled) { say('进入本周课堂后可以选（历史课堂、别的课堂不能选）。'); return; }
    const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
    if (!PREVIEW) {
      backend.rpc('ck_my_mood', { p_classroom: Number(identity.classroom) || identity.classroom })
        .then((value) => { mine = Number(Array.isArray(value) ? value[0] : value) || 0; show(); if (mine) say(mine > 0 ? '你今天选了“开心”，谢谢！还可以改。' : '你今天选了“不开心”。可以在下面写写哪里不满意，老师会改进。'); })
        .catch((problem) => { if (missing(problem)) rows.forEach((row) => { row.hidden = true; }); });
    }
    let sending = false;
    buttons.forEach((button) => {
      button.disabled = false;
      button.addEventListener('click', async () => {
        if (sending) return;
        const want = Number(button.dataset.mood) === mine ? 0 : Number(button.dataset.mood);
        sending = true;
        buttons.forEach((item) => { item.disabled = true; });
        try {
          if (!PREVIEW) {
            let result = await backend.rpc('ck_set_mood', { p_classroom: Number(identity.classroom) || identity.classroom, p_mood: want });
            if (Array.isArray(result)) result = result[0];
            if (result && result.status === 'login') { say('没有记上：请回到首页用课堂码重新登录后再选。'); return; }
            if (result && result.status === 'closed') { say('这个课堂已经停止，不能再选了。'); return; }
            // 隐藏彩蛋（2026-11-05 用户：“学生点笑脸能够自动增加5点修为值，并弹出修为值增加5点的消息，多点无法重复计数”）：后台每人每天只加一次
            if (result && Number(result.bonus) > 0) egg(`谢谢你的笑脸！修为值增加 ${Number(result.bonus)} 点 😊`);
          }
          mine = want;
          show();
          say(PREVIEW ? '测试页：只在本机显示，不会真的提交。'
            : mine > 0 ? '已记下“开心”，谢谢！今天之内还可以改。'
              : mine < 0 ? '已记下“不开心”。可以在下面写写哪里不满意、希望怎么改，老师会看到。'
                : '已撤回，今天之内还可以重新选。');
        } catch (problem) {
          console.error(problem);
          say(missing(problem) ? '这个功能还没有开通，请稍后再试。' : '没有记上：请检查网络后再试。');
        } finally {
          sending = false;
          buttons.forEach((item) => { item.disabled = false; });
        }
      });
    });
  }

  // 匿名建议箱：只把建议内容交给后台函数，不带姓名、学号（函数按本人这次登录核对进过本课堂；建议行里没有提交者，提交者另记、老师读不到）
  function setupFeedback(enabled, note) {
    setupMood(enabled);
    fbCards.forEach(({ card, caseNo }) => {
      const area = card.querySelector('textarea');
      const button = card.querySelector('.clp-fb-form button[type="submit"]');   // 卡片里第一个按钮是笑脸，不能用 querySelector('button')
      const count = card.querySelector('.clp-fb-count');
      const state = card.querySelector('.clp-fb-state');
      const say = (text, kind) => { state.textContent = text; state.dataset.state = kind || ''; };
      shield(card);
      if (!enabled) { say(note); return; }
      area.disabled = false;
      let sending = false;
      const sync = () => {
        count.textContent = `${area.value.length}/500`;
        button.disabled = sending || area.value.trim().length < 2;
      };
      area.addEventListener('input', sync);
      sync();
      // 只在这台设备上记个数，提醒自己提交过几条
      const key = `classlive-feedback:${identity.classroom}:${caseNo}`;
      const sent = Number(load(key, 0)) || 0;
      // 2026-10-29 用户：“提匿名建议可以增加5分修为值”：每个课堂第一次提交 10 字以上的加修为（后台只记提交过，不记是哪一条）
      const FBP = Live.FEEDBACK || { points: 5, min: 10 };
      const reward = `本堂课第一次提交 ${FBP.min} 字以上的${FB.what}，加 ${FBP.points} 修为（老师看不到哪条是你写的）。`;
      say(sent ? `你在这台设备上已匿名提交过 ${sent} 条，还可以继续写。` : `写好后点“匿名提交”，可以提交多条。${reward}`);
      card.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = area.value.trim();
        if (text.length < 2 || sending) return;
        sending = true;
        sync();
        try {
          if (PREVIEW) { say('测试页：不会真的提交（学生页会匿名提交给老师）。', 'ok'); return; }
          const got = await backend.rpc('ck_submit_feedback', { p_classroom: Number(identity.classroom) || identity.classroom, p_case: caseNo, p_text: text });
          const earned = (Array.isArray(got) ? got[0] : got) === true;
          area.value = '';
          save(key, (Number(load(key, 0)) || 0) + 1);
          say(`已匿名提交（${time()}），${earned ? `修为 +${FBP.points}（老师结算后计入）。` : ''}${FB.thanks}还可以继续写下一条。`, 'ok');
        } catch (problem) {
          console.error(problem);
          const message = `${(problem && problem.message) || problem || ''}`;
          say(notReady(problem) ? '建议箱还没有开通，请稍后再试。'
            : /进入课堂|42501/.test(message) ? '提交没有成功：请回到首页用课堂码重新登录后再试。'
              : '提交没有成功：请检查网络后再试。', 'error');
        } finally {
          sending = false;
          sync();
        }
      });
    });
  }

  // 机制图“弹幕接龙”：选一个箭头（如 ①→②），用一句话说这两步的关系；
  // 弹幕带“【案例号箭头】”标签（如【01①→②】），投屏机制图据此把它放到对应节点下面
  function setupMechDanmaku(enabled, note) {
    setupQuestionDanmaku(enabled, note);
    $$('[data-mech-dm]').forEach((box) => {
      const links = $$('[data-mech-link]', box);
      const form = $('[data-mech-dm-form]', box);
      const input = $('input', form);
      const button = $('button', form);
      const state = $('[data-mech-dm-state]', box);
      const say = (text, kind) => { state.textContent = text; state.dataset.state = kind || ''; };
      shield(box);
      if (!enabled) {
        links.forEach((link) => { link.disabled = true; });
        input.disabled = true;
        button.disabled = true;
        say(note);
        return;
      }
      let link = '';
      dmButtons.push({ button, ready: () => Boolean(link) });
      links.forEach((item) => { item.disabled = false; });
      say('先选一个箭头，再写一句话（老师后台能看到是谁发的）。');
      links.forEach((item) => item.addEventListener('click', () => {
        link = item.dataset.mechLink;
        links.forEach((other) => other.setAttribute('aria-pressed', String(other === item)));
        input.disabled = false;
        input.placeholder = `${link}：这两步之间是什么关系？`;
        showCooling();
        input.focus();
        say(`已选 ${link}，写一句话后点“发送”（${input.maxLength} 字内）。`);
      }));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = input.value.replace(/\s+/g, ' ').trim();
        if (!link) { say('先选一个箭头。', 'error'); return; }
        if (!text || cooling > 0) return;
        button.disabled = true;
        try {
          await sendDanmaku(`【${box.dataset.case}${link}】${text.slice(0, DMQ_MAX)}`);
          input.value = '';
          say(`已发送（${time()}），会出现在投屏机制图 ${link} 的位置。若老师开启了审核，通过后才会上屏。`, 'ok');
        } catch (problem) {
          console.error(problem);
          showCooling();
          say(dmProblem(problem), 'error');
        }
      });
    });
  }

  // 弹幕小问题：与左下角弹幕、机制图弹幕共用每 5 秒一条的冷却
  function setupQuestionDanmaku(enabled, note) {
    dmqCards.forEach(({ card, tag, debate, rt }) => {
      const form = card.querySelector('form');
      const input = form.querySelector('input');
      const button = form.querySelector('button');
      const state = card.querySelector('.clp-dmq-state');
      const say = (text, kind) => { state.textContent = text; state.dataset.state = kind || ''; };
      shield(card);
      if (!enabled) { say(note); return; }
      input.disabled = false;
      dmButtons.push({ button, ready: () => true });
      showCooling();
      say(debate ? '先投辩前票并递交，再写一句话点“发送”：投屏上会标出你是正方还是反方。'
        : rt ? '先在上面“① 认领角色”里递交你代表的角色，再写一句话点“发送”：投屏上会标出你的角色。'
        : '写一句话后点“发送”，会显示在投屏上（老师开启匿名时不显示姓名）。');
      // 圆桌表态：角色以本人已递交的“认领角色”为准
      const roleOf = () => {
        const key = `${rt}:rt-role`;
        if (!locked[key]) return '';
        const group = document.querySelector(`[data-live-choice][data-live-case="${rt}"][data-live-item="rt-role"]`);
        const pressedOption = group && group.querySelector('[data-live-option][aria-pressed="true"]');
        return locked[key].v || (pressedOption && pressedOption.dataset.liveOption) || '';
      };
      // 辩论质询：站哪一方以本人已递交的辩前投票为准（在别的设备递交的，看页面上恢复的选择）
      const sideOf = () => {
        const key = `${debate}:debate-pre`;
        if (!locked[key]) return '';
        const group = document.querySelector(`[data-live-choice][data-live-case="${debate}"][data-live-item="debate-pre"]`);
        const pressedOption = group && group.querySelector('[data-live-option][aria-pressed="true"]');
        const value = locked[key].v || (pressedOption && pressedOption.dataset.liveOption);
        return value === 'pro' ? '【正方】' : value === 'con' ? '【反方】' : '';
      };
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = input.value.replace(/\s+/g, ' ').trim();
        if (!text || cooling > 0) return;
        const role = rt ? roleOf() : '';
        if (rt && !role) { say('请先在上面“① 认领角色”里选好你代表的一方并递交，弹幕才能标出你的角色。', 'error'); return; }
        const side = debate ? sideOf() : role ? `【${role}】` : '';
        if (debate && !side) { say('请先在上面“① 辩前投票”里选好一方并递交，弹幕才能标出你是正方还是反方。', 'error'); return; }
        button.disabled = true;
        try {
          await sendDanmaku(`${tag}${side}${text.slice(0, DMQ_MAX)}`);
          input.value = '';
          say(`已发送（${time()}）。若老师开启了审核，通过后才会上屏。`, 'ok');
        } catch (problem) {
          console.error(problem);
          showCooling();
          say(dmProblem(problem), 'error');
        }
      });
    });
  }

  // ================= 两类课程的题目 =================
  function base() {
    return { course: config.course, classroom: identity.classroom, session: Live.today(),
      name: identity.name, sid: identity.sid, path: location.pathname };
  }

  // ---------- 案例课程（习经章节页） ----------
  function caseQuestions() {
    const list = [];
    const caseTitle = (el) => {
      const section = el.closest('[id^="case-"]');
      const no = el.dataset.liveCase || (section && (section.id.match(/^case-(\d{2})/) || [])[1]) || '';
      const heading = section && section.querySelector('h2');
      return `案例 ${no}${heading ? ' · ' + textOf(heading) : ''}`;
    };
    const pressed = (root, selector) => root.querySelector(`${selector}[aria-pressed="true"]`);
    // 投票（前测、后测）与方案推演每一轮
    $$('[data-live-choice]').forEach((group) => {
      const options = $$('[data-live-option]', group);
      const item = group.dataset.liveItem;
      const heading = group.matches('li') ? `${textOf(group.querySelector('strong'))}：${textOf(group.querySelector('p'))}` : textOf(group.querySelector('h3, h4'));
      const NAMES = { pre: '课堂投票 · 前测', post: '课堂投票 · 后测', 'transfer-k': '迁移任务 · 选一选', 'debate-side': '辩论赛 · 我在哪一方',
        'debate-pre': '辩论赛 · 辩前投票', 'debate-post': '辩论赛 · 辩后投票', 'rt-role': '圆桌会议 · 我代表的角色', 'biz-role': '经营沙盘 · 我加入的角色组' };
      const kind = NAMES[item] || `${group.closest('[data-roundtable]') ? '圆桌会议 · 议程' : '方案推演'} · ${textOf(group.querySelector('strong')) || item}`;
      const labelOf = (value) => { const button = options.find((b) => b.dataset.liveOption === value); return button ? `${textOf(button.querySelector('span'))} ${textOf(button.querySelector('strong') || button)}` : value; };
      list.push({
        key: `${group.dataset.liveCase}:${item}`, section: caseTitle(group), title: kind, prompt: heading,
        anchor: (bar) => group.appendChild(bar),
        read: () => { const button = pressed(group, '[data-live-option]'); return button ? button.dataset.liveOption : null; },
        check: (value) => (value ? '' : '请先选一项，再点“递交”'),
        show: (value) => (value ? [labelOf(value)] : []),
        lock: () => options.forEach((button) => { button.disabled = true; }),
        restore: (value) => options.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.liveOption === value))),
        send: (value) => {
          const button = options.find((b) => b.dataset.liveOption === value);
          return backend.add('choices', { ...base(), case: group.dataset.liveCase, item, choice: value,
            label: textOf(button && (button.querySelector('strong') || button)).slice(0, 120) });
        },
      });
    });
    // 客观题（实操改版：单选、判断、多选、辩论论据卡）：先选、再递交；多选的值按选项顺序用逗号连接
    $$('[data-live-quiz]').forEach((box) => {
      const options = $$('[data-quiz-option]', box);
      const type = box.dataset.quizType;
      const max = Number(box.dataset.quizMax) || 0;
      const picked = () => options.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.quizOption);
      const labelOf = (value) => value.split(',').map((v) => {
        const i = options.findIndex((b) => b.dataset.quizOption === v);
        const text = i >= 0 ? textOf(options[i].querySelector('span')) : v;
        return type === 'judge' ? text : `${String.fromCharCode(65 + i)}. ${text}`;
      });
      list.push({
        key: `${box.dataset.liveCase}:${box.dataset.liveItem}`, section: caseTitle(box), title: box.dataset.quizTitle || '客观题',
        // 题干在用到时再读（旧版圆桌会议的秘密任务题曾在递交角色后才填入）
        get prompt() { return textOf(box.querySelector('.quiz-q')).replace(/^(单选|多选|判断|选 \d+ 张)/, ''); },
        anchor: (bar) => box.appendChild(bar),
        read: () => { const value = picked(); return value.length ? value.join(',') : null; },
        check: (value) => (!value ? '请先选好，再点“递交”' : max && value.split(',').length > max ? `最多选 ${max} 张` : ''),
        show: (value) => (value ? labelOf(value) : []),
        lock: () => options.forEach((button) => { button.disabled = true; }),
        restore: (value) => options.forEach((button) => button.setAttribute('aria-pressed', String(String(value).split(',').includes(button.dataset.quizOption)))),
        send: (value) => backend.add('choices', { ...base(), case: box.dataset.liveCase, item: box.dataset.liveItem, choice: value,
          label: labelOf(value).join('；').slice(0, 120) }),
      });
    });
    // 证据—理论配对：一次递交全部线索
    $$('[data-live-match]').forEach((matchPanel) => {
      const rows = $$('[data-match-row]', matchPanel);
      // 2026-10-29 起是迁移任务的小案例（[data-match-label] 里的标题）；以前是表格里的事实线索
      const clue = (row) => { const cell = (row.querySelector('[data-match-label] b') || row.querySelector('th')).cloneNode(true); cell.querySelectorAll('small').forEach((el) => el.remove()); return textOf(cell); };
      const choiceOf = (row) => { const button = pressed(row, '[data-match-choice]'); return button ? button.dataset.matchChoice : (row.dataset.choice || null); };
      list.push({
        key: `${matchPanel.dataset.liveCase}:match`, section: caseTitle(matchPanel), title: matchPanel.closest('[data-transfer]') ? '迁移任务 · 小案例' : '证据—理论配对', prompt: textOf(matchPanel.querySelector('h3')),
        anchor: (bar) => matchPanel.appendChild(bar),
        read: () => { const value = rows.map(choiceOf); return value.some(Boolean) ? value : null; },
        check: (value) => { const missing = rows.length - (value || []).filter(Boolean).length; return missing ? `还有 ${missing} ${matchPanel.closest('[data-transfer]') ? '个小案例' : '条线索'}没有选，全部选好再递交` : ''; },
        show: (value) => (value ? rows.map((row, i) => `${clue(row)} → ${value[i] ? 'K' + value[i] : '未选'}`) : []),
        lock: () => rows.forEach((row) => $$('[data-match-choice]', row).forEach((button) => { button.disabled = true; })),
        restore: (value) => rows.forEach((row, i) => $$('[data-match-choice]', row).forEach((button) => {
          const on = button.dataset.matchChoice === String(value[i]);
          button.setAttribute('aria-pressed', String(on));
          button.classList.toggle('selected', on);
        })),
        send: (value) => backend.addMany('choices', rows.map((row, i) => ({ ...base(), case: matchPanel.dataset.liveCase, item: row.dataset.liveItem,
          choice: `K${value[i]}`, label: `K${value[i]}` }))),
      });
    });
    // 文字作答
    $$('[data-live-answer]').forEach((box) => {
      const area = box.querySelector('textarea');
      let holder = box.parentElement;
      while (holder && !holder.querySelector('h3')) holder = holder.parentElement;
      const heading = holder ? holder.querySelector('h3') : null;
      const number = box.closest('.question-item') ? textOf(box.closest('.question-item').querySelector('.question-number')) : '';
      const names = { warmup: '导入问题 · 第一判断', digest: '材料归纳 · 申论式', role: '四方立场 · 我选的角色', 'sim-basis': '方案推演 · 教材依据', transfer: '迁移任务 · 说一说', summary: '三句话结论' };
      const item = box.dataset.liveItem;
      const title = names[item] || (/^myth-/.test(item) ? `常见误区 ${item.slice(5)}` : number || item.toUpperCase());
      const selfcheck = box.parentElement ? box.parentElement.querySelector('[data-selfcheck]') : null;
      list.push({
        key: `${box.dataset.liveCase}:${item}`, section: caseTitle(box), title, prompt: heading ? textOf(heading) : '',
        extra: selfcheck ? () => {
          const boxes = $$('input[data-selfcheck-item]', selfcheck);
          const done = boxes.filter((input) => input.checked).length;
          const steps = boxes.map((input) => `${input.checked ? '☑' : '☐'} ${textOf(input.closest('label').querySelector('b')).replace(/^[①②③④]\s*/, '')}`);
          return { label: `写完自检（${done}/${boxes.length}）`, lines: [steps.join('　')] };
        } : null,
        // 自检没勾全时，在“确认递交？”这一步提醒一句（不阻止递交）
        remind: selfcheck ? () => {
          const missing = $$('input[data-selfcheck-item]', selfcheck).filter((input) => !input.checked)
            .map((input) => textOf(input.closest('label').querySelector('b')).replace(/^[①②③④]\s*/, ''));
          return missing.length ? `自检还没勾：${missing.join('、')}，可以先补上` : '';
        } : null,
        // Q1—Q4：递交放在“写完自检”下面——先写、再自检、最后递交
        anchor: (bar) => (selfcheck ? selfcheck.insertAdjacentElement('afterend', bar) : box.appendChild(bar)),
        read: () => (area.value.trim() ? area.value.trim() : null),
        check: (value) => (value ? '' : '请先写好作答，再点“递交”'),
        show: (value) => (value ? [value] : []),
        lock: () => { area.readOnly = true; },
        restore: (value) => { if (!area.value.trim()) area.value = value; },
        send: (value) => backend.add('answers', { ...base(), case: box.dataset.liveCase, item, text: String(value).slice(0, 1500) }),
      });
    });
    return list;
  }

  // ---------- 概念学习课程（政治经济学练习页） ----------
  function conceptQuestions() {
    const node = document.getElementById('concept-data');
    const D = node ? JSON.parse(node.textContent) : { concepts: [], exit: [] };
    const list = [];
    const LET = (i) => String.fromCharCode(65 + Number(i));
    const radio = (root) => { const input = root.querySelector('input[type=radio]:checked'); return input ? input.value : null; };
    const setRadio = (root, value) => $$('input[type=radio]', root).forEach((input) => { input.checked = String(input.value) === String(value); });
    const segValues = (root) => $$('.cl-item', root).map((item) => { const button = item.querySelector('button[aria-pressed="true"]'); return button ? Number(button.dataset.value) : null; });
    const segRestore = (root, values) => $$('.cl-item', root).forEach((item, i) => $$('button', item).forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.value) === values[i]))));
    const disable = (root, selector) => $$(selector, root).forEach((el) => { el.disabled = true; });
    const text = (el) => (el && el.value.trim() ? el.value.trim() : null);
    const after = (el) => (bar) => el.insertAdjacentElement('afterend', bar);
    const send = (key) => async (value) => {
      const rows = await backend.rpc('ck_submit_answer', {
        p_classroom: identity.classroom, p_unit: unit, p_name: identity.name, p_sid: identity.sid,
        p_class: identity.class_name || '', p_group: identity.group_name || '', p_key: key, p_value: value, p_total: list.length,
      });
      return Array.isArray(rows) ? rows[0] : rows;
    };
    const choiceQuestion = (key, section, title, form) => ({
      key, section, title, prompt: textOf(form.querySelector('legend')), anchor: after(form),
      read: () => { const value = radio(form); return value === null ? null : Number(value); },
      check: (value) => (value === null ? '请先选一项，再点“递交”' : ''),
      show: (value) => (value === null || value === undefined ? [] : [`${LET(value)}. ${textOf($$('.cl-option-text', form)[value])}`]),
      lock: () => { const fieldset = form.querySelector('fieldset'); if (fieldset) fieldset.disabled = true; },
      restore: (value) => setRadio(form, value),
      // 先让页面记下这次选择（本机进度），再交给老师
      send: (value) => { try { form.requestSubmit(); } catch (error) { /* 旧浏览器忽略 */ } return send(key)(value); },
    });
    (D.concepts || []).forEach((k, index) => {
      const unitEl = $(`.cl-unit[data-concept="${k.id}"]`);
      if (!unitEl) return;
      const section = `概念 ${index + 1} · ${k.name}`;
      const discover = unitEl.querySelector('.cl-mcq[data-kind="discover"]');
      if (discover) list.push(choiceQuestion(`${k.id}.discover`, section, '想一想', discover));
      const checkStep = unitEl.querySelector('[data-step="check"]');
      const judge = checkStep && checkStep.querySelector('.cl-judge');
      const checkForm = checkStep && checkStep.querySelector('.cl-mcq');
      if (judge) {
        const items = $$('.cl-item', judge);
        list.push({
          key: `${k.id}.check`, section, title: '辨一辨', prompt: textOf(judge.querySelector('.cl-prompt')), anchor: after(judge),
          read: () => { const values = segValues(judge); return values.some((v) => v !== null) ? values : null; },
          check: (values) => { const missing = items.length - (values || []).filter((v) => v !== null).length; return missing ? `还有 ${missing} 条没有判断，全部判断后再递交` : ''; },
          show: (values) => (values ? items.map((item, i) => `${i + 1}. ${textOf(item.querySelector('.cl-item-text'))} —— ${values[i] === 1 ? '说得对' : values[i] === 0 ? '说得不对' : '未选'}`) : []),
          lock: () => disable(judge, 'button'),
          restore: (values) => segRestore(judge, values),
          send: send(`${k.id}.check`),
        });
      } else if (checkForm) {
        list.push(choiceQuestion(`${k.id}.check`, section, '辨一辨', checkForm));
      }
      const applyStep = unitEl.querySelector('[data-step="apply"]');
      const sort = applyStep && applyStep.querySelector('.cl-sort');
      const fill = applyStep && applyStep.querySelector('.cl-fill');
      const calc = applyStep && applyStep.querySelector('.cl-calc');
      if (sort) {
        const items = $$('.cl-item', sort);
        const binOf = (i, value) => { const button = items[i] && items[i].querySelector(`button[data-value="${value}"]`); return button ? textOf(button) : ''; };
        list.push({
          key: `${k.id}.apply`, section, title: '用一用 · 分一分', prompt: textOf(sort.querySelector('.cl-prompt')), anchor: after(sort),
          read: () => { const values = segValues(sort); return values.some((v) => v !== null) ? values : null; },
          check: (values) => { const missing = items.length - (values || []).filter((v) => v !== null).length; return missing ? `还有 ${missing} 项没有分类，全部分好再递交` : ''; },
          show: (values) => (values ? items.map((item, i) => `${textOf(item.querySelector('.cl-item-text'))} → ${values[i] === null ? '未选' : binOf(i, values[i])}`) : []),
          lock: () => disable(sort, 'button'),
          restore: (values) => segRestore(sort, values),
          send: send(`${k.id}.apply`),
        });
      } else if (fill) {
        const selects = $$('select', fill);
        list.push({
          key: `${k.id}.apply`, section, title: '用一用 · 填一填', prompt: textOf(fill.querySelector('.cl-prompt')), anchor: after(fill),
          read: () => { const values = selects.map((s) => s.value || null); return values.some(Boolean) ? values : null; },
          check: (values) => { const missing = selects.length - (values || []).filter(Boolean).length; return missing ? `还有 ${missing} 个空没有选，全部选好再递交` : ''; },
          show: (values) => (values ? selects.map((s, i) => `第 ${i + 1} 空：${values[i] || '未选'}`) : []),
          lock: () => selects.forEach((s) => { s.disabled = true; }),
          restore: (values) => selects.forEach((s, i) => { s.value = values[i] || ''; }),
          send: send(`${k.id}.apply`),
        });
      } else if (calc) {
        const fields = $$('.cl-fields .cl-field', calc);
        const inputs = fields.map((f) => f.querySelector('input'));
        const fieldsBox = calc.querySelector('.cl-fields');
        list.push({
          key: `${k.id}.apply`, section, title: '用一用 · 算一算', prompt: textOf(calc.querySelector('.cl-prompt')),
          anchor: (bar) => (calc.querySelector('.cl-actions') || fieldsBox).insertAdjacentElement('afterend', bar),
          read: () => { const values = inputs.map((i) => i.value.trim() || null); return values.some(Boolean) ? values : null; },
          check: (values) => { const missing = inputs.length - (values || []).filter(Boolean).length; return missing ? `还有 ${missing} 项没有填，全部填好再递交` : ''; },
          show: (values) => (values ? fields.map((f, i) => `${textOf(f.querySelector('label'))}：${values[i] || '未填'} ${textOf(f.querySelector('.cl-input span'))}`.trim()) : []),
          lock: () => inputs.forEach((i) => { i.readOnly = true; }),
          restore: (values) => inputs.forEach((input, i) => { input.value = values[i] || ''; }),
          send: send(`${k.id}.apply`),
        });
        const challenge = calc.querySelector('.cl-challenge');
        if (challenge) {
          const input = challenge.querySelector('input');
          list.push({
            key: `${k.id}.challenge`, section, title: '用一用 · 变一变', prompt: textOf(challenge.querySelector('.cl-prompt')), anchor: (bar) => challenge.appendChild(bar),
            read: () => text(input),
            check: (value) => (value ? '' : '请先填好答案，再点“递交”'),
            show: (value) => (value ? [`${value} ${textOf(challenge.querySelector('.cl-input span'))}`.trim()] : []),
            lock: () => { input.readOnly = true; },
            restore: (value) => { input.value = value; },
            send: send(`${k.id}.challenge`),
          });
        }
      }
      const explainStep = unitEl.querySelector('[data-step="explain"]');
      const explain = explainStep && explainStep.querySelector('textarea');
      if (explain) {
        list.push({
          key: `${k.id}.explain`, section, title: '一句话说清', prompt: textOf(explainStep.querySelector('.cl-frame')).replace(/^句式/, '句式：'),
          anchor: (bar) => explainStep.appendChild(bar),
          read: () => text(explain),
          check: (value) => (value ? '' : '请先写好这句话，再点“递交”'),
          show: (value) => (value ? [value] : []),
          lock: () => { explain.readOnly = true; },
          restore: (value) => { if (!explain.value.trim()) explain.value = value; },
          send: send(`${k.id}.explain`),
        });
      }
    });
    // 概念串联：按页面上的先后顺序递交句子编号
    const chain = $('.cl-chain');
    if (chain) {
      const listEl = chain.querySelector('.cl-chain-list');
      const itemText = (id) => textOf(listEl.querySelector(`.cl-chain-item[data-step-id="${id}"] p`));
      list.push({
        key: 'chain', section: '概念串联', title: '排一排', prompt: textOf(chain.querySelector('.cl-prompt')), anchor: after(chain),
        read: () => $$('.cl-chain-item', listEl).map((li) => Number(li.dataset.stepId)),
        check: () => '',
        show: (order) => (order ? order.map((id, pos) => `${pos + 1}. ${itemText(id)}`) : []),
        lock: () => disable(chain, 'button'),
        restore: (order) => order.forEach((id) => { const li = listEl.querySelector(`.cl-chain-item[data-step-id="${id}"]`); if (li) listEl.appendChild(li); }),
        send: send('chain'),
      });
    }
    // 迁移任务（2026-10-30 起代替各概念里的“把案例和概念对上号”）：给每个小案例选一个概念，全部选好后一起递交（题号 transfer，值是各条所选概念的序号，0 起）
    const transfer = $('.cl-transfer[data-key="transfer"]');
    if (transfer) {
      const items = $$('.cl-item', transfer);
      const names = $$('.cl-tk-legend li', transfer).map((li) => textOf(li.querySelector('a')).replace(/^概念\s*\d+\s*/, ''));
      const labelOf = (item) => textOf(item.querySelector('.cl-tk-label'));
      list.push({
        key: 'transfer', section: '迁移任务', title: '小案例里找概念', prompt: textOf(transfer.querySelector('.cl-prompt')), anchor: after(transfer),
        read: () => { const values = segValues(transfer); return values.some((v) => v !== null) ? values : null; },
        check: (values) => { const missing = items.length - (values || []).filter((v) => v !== null).length; return missing ? `还有 ${missing} 个小案例没有选，全部选好再递交` : ''; },
        show: (values) => (values ? items.map((item, i) => `${i + 1}. ${labelOf(item)} → ${values[i] === null || values[i] === undefined ? '未选' : `概念 ${values[i] + 1} ${names[values[i]] || ''}`}`) : []),
        lock: () => disable(transfer, 'button'),
        restore: (values) => segRestore(transfer, values),
        send: send('transfer'),
      });
    }
    // 小组辨析：立场＋理由；讨论后的补充另行递交
    const disc = $('.cl-disc-work');
    if (disc) {
      const reason = disc.querySelector('textarea[data-cl-text="discussion.reason"]');
      const later = disc.querySelector('textarea[data-cl-text="discussion.after"]');
      const question = textOf(document.querySelector('.cl-claim h3'));
      list.push({
        key: 'discussion', section: '小组辨析', title: '我的立场和理由', prompt: question,
        anchor: (bar) => ((reason && reason.nextElementSibling && reason.nextElementSibling.classList.contains('cl-print')) ? reason.nextElementSibling : reason).insertAdjacentElement('afterend', bar),
        read: () => { const value = { stance: radio(disc.querySelector('.cl-stance')), reason: text(reason) }; return value.stance || value.reason ? value : null; },
        check: (value) => (!value || !value.stance ? '请先选择立场' : !value.reason ? '请写好理由再递交' : ''),
        show: (value) => (value ? [`立场：${value.stance || '未选'}`, `理由：${value.reason || '未写'}`] : []),
        lock: () => { disable(disc.querySelector('.cl-stance'), 'input'); if (reason) reason.readOnly = true; },
        restore: (value) => { setRadio(disc.querySelector('.cl-stance'), value.stance); if (reason && !reason.value.trim()) reason.value = value.reason || ''; },
        send: send('discussion'),
      });
      if (later) {
        list.push({
          key: 'discussion.after', section: '小组辨析', title: '讨论后的修改或补充', prompt: '讨论后，我修改或补充的想法',
          anchor: (bar) => ((later.nextElementSibling && later.nextElementSibling.classList.contains('cl-print')) ? later.nextElementSibling : later).insertAdjacentElement('afterend', bar),
          read: () => text(later),
          check: (value) => (value ? '' : '请先写好，再点“递交”'),
          show: (value) => (value ? [value] : []),
          lock: () => { later.readOnly = true; },
          restore: (value) => { if (!later.value.trim()) later.value = value; },
          send: send('discussion.after'),
        });
      }
    }
    // 辩论赛（2026-10-29 起代替小组辨析，用户：“政经中的‘小组辨析’环节改成习经济思想的辩论赛形式，去掉部分同意这个选项，只保留正反方”）：
    // 辩前投票、论据卡（最多 2 张）、辩后投票各自递交，题号 debate.pre / debate.cards / debate.post（政经一个课堂一个案例；后台 ck_debate_side 按辩前票分边）；
    // 2026-11-05 取消 3v3：辩后票随时可以递交，老师在投屏页停止递交后公布结果
    const debate = $('.cl-debate[data-debate]');
    if (debate) {
      const no = debate.dataset.case;
      const SIDE = { pro: '正方', con: '反方' };
      const motion = textOf(debate.querySelector('[data-debate-motion]'));
      const sideOf = (value) => `${SIDE[value] || value}：${textOf(debate.querySelector(`.cl-debate-sides .is-${value} strong`))}`;
      const vote = (key, title) => {
        const box = debate.querySelector(`[data-debate-vote="${key}"] fieldset`);
        if (!box) return;
        list.push({
          key: `debate.${key}`, section: '辩论赛', title, prompt: motion, anchor: after(box),
          read: () => radio(box),
          check: (value) => (value ? '' : '请先选正方或反方，再点“递交”'),
          show: (value) => (value ? [sideOf(value)] : []),
          lock: () => disable(box, 'input'),
          restore: (value) => setRadio(box, value),
          send: send(`debate.${key}`),
        });
      };
      vote('pre', '辩前投票：我站哪一方');
      const cards = debate.querySelector('.cl-debate-cards');
      if (cards) {
        const max = Number(cards.dataset.max) || 2;
        const boxes = $$('input[name="debate-cards"]', cards);
        list.push({
          key: 'debate.cards', section: '辩论赛', title: '我选的论据卡', prompt: `选 ${max} 张最能支持本方的论据卡`, anchor: after(cards),
          read: () => { const value = boxes.filter((b) => b.checked).map((b) => b.value); return value.length ? value.join(',') : null; },
          check: (value) => (!value ? `请先选好论据卡（最多 ${max} 张），再点“递交”` : value.split(',').length > max ? `最多选 ${max} 张` : ''),
          show: (value) => String(value || '').split(',').filter(Boolean).map((v) => {
            const box = boxes.find((b) => b.value === v);
            return `${String.fromCharCode(64 + Number(v))}. ${textOf(box && box.closest('label').querySelector('.cl-debate-card-text'))}`;
          }),
          lock: () => disable(cards, 'input'),
          restore: (value) => boxes.forEach((b) => { b.checked = String(value || '').split(',').includes(b.value); }),
          send: send('debate.cards'),
        });
      }
      vote('post', '辩后投票：我支持哪一方');
    }
    // 期中考查作业（2026-10-28，原课后思考·申论式大题）：examNN 页，一篇短文写好后递交（key exam，只收第一次）；不计修为，老师在工作台批阅（满分 100）
    const exam = $('textarea[data-cl-text="exam"]');
    if (exam) {
      const box = exam.closest('[data-exam]');
      const count = box && box.querySelector('[data-essay-count]');
      const target = Number(count && count.dataset.target) || 0;
      const least = Number(count && count.dataset.least) || 100;
      // 递交截止时间（2026-10-28 用户：发布期中考查作业时可以设置递交截止日期）：过了截止时间锁上作答框（后台 ck_submit_answer 同样不再收）。
      // 2026-10-29 用户：“要突出显示递交截止日期，最好还有个倒计时功能”——首页醒目的截止卡片（每秒倒计时，最后 24 小时变红），作答框上方一行同步倒计时
      let dueAt = 0;
      const due = document.createElement('p');
      due.className = 'clp-exam-due';
      due.hidden = true;
      exam.insertAdjacentElement('beforebegin', due);
      const clockBox = document.createElement('div');
      clockBox.className = 'clp-exam-clock';
      clockBox.hidden = true;
      clockBox.innerHTML = '<div class="clp-exam-clock-head"><b>递交截止</b><strong data-due-when></strong></div>'
        + '<div class="clp-exam-clock-left" data-due-left><span>距离截止还有</span><span class="clp-exam-clock-units" data-due-units></span></div>'
        + '<p class="clp-exam-clock-note" data-due-note></p>';
      const card = $('#start .cl-exam-card');
      if (card) card.insertAdjacentElement('beforebegin', clockBox);
      const pad = (n) => String(n).padStart(2, '0');
      const dueWhen = (at) => { const d = new Date(at); return `${d.getMonth() + 1} 月 ${d.getDate()} 日（周${'日一二三四五六'[d.getDay()]}）${pad(d.getHours())}:${pad(d.getMinutes())}`; };
      const sentAt = (entry) => (entry.other ? '已在其他设备递交' : entry.iso ? `已于 ${dueWhen(Date.parse(entry.iso))} 递交` : '已递交');
      let dueTimer = 0;
      const tickDue = () => {
        const left = Math.max(0, dueAt - Date.now());
        const over = left <= 0;
        const soon = !over && left < 86400000;
        const entry = locked.exam;
        const days = Math.floor(left / 86400000);
        const hours = Math.floor((left % 86400000) / 3600000);
        const minutes = Math.floor((left % 3600000) / 60000);
        const seconds = Math.floor((left % 60000) / 1000);
        const when = dueWhen(dueAt);
        clockBox.classList.toggle('is-over', over && !entry);
        clockBox.classList.toggle('is-soon', soon && !entry);
        clockBox.classList.toggle('is-done', Boolean(entry));
        clockBox.querySelector('.clp-exam-clock-head b').textContent = entry ? '已递交' : over ? '已截止' : '递交截止';
        clockBox.querySelector('[data-due-when]').textContent = when;
        clockBox.querySelector('[data-due-left]').hidden = over;
        clockBox.querySelector('[data-due-units]').innerHTML = [days ? [days, '天'] : null, [pad(hours), '时'], [pad(minutes), '分'], [pad(seconds), '秒']]
          .filter(Boolean).map(([n, unit]) => `<i><b>${n}</b><small>${unit}</small></i>`).join('');
        clockBox.querySelector('[data-due-note]').textContent = entry ? `✓ 你${sentAt(entry)}，不用再赶时间了。`
          : over ? '递交截止时间已过，作答框已锁定，不能再递交。'
            : soon ? '最后 24 小时！写好后记得点作答框下方的“递交”，递交后不能修改。'
              : '写好后点作答框下方的“递交”，递交后不能修改；到截止时间作答框会自动锁定。';
        due.classList.toggle('is-over', over && !entry);
        due.classList.toggle('is-soon', soon && !entry);
        due.textContent = entry ? `递交截止：${when}。你${sentAt(entry)}。` : over ? `递交截止时间 ${when} 已过，不能再递交。`
          : `递交截止：${when}，还剩 ${days ? `${days} 天 ` : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}。递交后不能修改。`;
        if (over) {
          if (!entry) exam.readOnly = true;
          clearInterval(dueTimer);
        }
      };
      if (!OFFLINE && backend && identity.classroom && (joined || PREVIEW)) {
        backend.rpc('ck_room_deadline', { p_classroom: identity.classroom }).then((value) => {
          const raw = Array.isArray(value) ? value[0] : value;
          const at = Date.parse(String((raw && typeof raw === 'object' ? Object.values(raw)[0] : raw) || '').replace(/(\.\d{3})\d+/, '$1'));
          if (!at) return;
          dueAt = at;
          exam.dataset.due = String(at);
          due.hidden = false;
          clockBox.hidden = false;
          tickDue();
          if (at > Date.now()) dueTimer = setInterval(tickDue, 1000);
        }).catch((error) => console.warn('[期中考查] 截止时间读取失败：', error));
      }
      list.push({
        key: 'exam', section: '期中考查作业', title: (D.exam && D.exam.title) || '期中考查作业',
        prompt: textOf(box && box.querySelector('.cl-essay-q')),
        anchor: (bar) => (count || exam).insertAdjacentElement('afterend', bar),
        read: () => text(exam),
        check: (value) => (dueAt && Date.now() > dueAt ? '已过递交截止时间，不能再递交' : !value ? '请先写好，再点“递交”'
          : value.replace(/\s/g, '').length < least ? `至少写 ${least} 字再递交（作答要求 ${target} 字左右）` : ''),
        remind: () => '递交后不能修改，确定写好了吗？',
        show: (value) => (value ? [value] : []),
        lock: () => { exam.readOnly = true; },
        restore: (value) => { if (!exam.value.trim()) exam.value = value; },
        send: send('exam'),
      });
    }
    // 出门测：每题单独递交
    $$('.cl-exit .cl-exit-item').forEach((item, i) => {
      const legend = item.querySelector('legend').cloneNode(true);
      legend.querySelectorAll('.cl-exit-tag').forEach((tag) => tag.remove());
      list.push({
        key: `exit.${i}`, section: '课后自修 · 出门测', title: `第 ${i + 1} 题`, prompt: textOf(legend), anchor: (bar) => item.appendChild(bar),
        read: () => { const value = radio(item); return value === null ? null : Number(value); },
        check: (value) => (value === null ? '请先选一项，再点“递交”' : ''),
        show: (value) => (value === null || value === undefined ? [] : [`${LET(value)}. ${textOf($$('.cl-option-text', item)[value])}`]),
        lock: () => disable(item, 'input'),
        restore: (value) => setRadio(item, value),
        send: send(`exit.${i}`),
        after: (value, quiet) => xlAward(`exit.${i}`, value, item, quiet),
      });
    });
    // 案例 01：课堂投票
    const poll = $('[data-poll]');
    if (poll && D.poll) {
      const labelOf = (value) => ((D.poll.options || []).find((o) => o.value === value) || {}).label || value;
      list.push({
        key: 'poll', section: '课堂投票', title: textOf(poll.querySelector('h3')), prompt: textOf(poll.querySelector('h3 + p')),
        anchor: after(poll.querySelector('fieldset')),
        read: () => radio(poll),
        check: (value) => (value ? '' : '请先选一项，再点“递交”'),
        show: (value) => (value ? [labelOf(value)] : []),
        lock: () => disable(poll, 'input'),
        restore: (value) => setRadio(poll, value),
        send: send('poll'),
      });
    }
    return list;
  }
})();
