/* 学生端（学生页）：确认是从首页用课堂码进入的本周课堂后，在左下角显示课堂面板。
 * 两类课程共用同一套做法：
 *   · 每道题下方有“递交”按钮：选好或写好后点“递交”（再点一次确认），交给老师；
 *     每题只收第一次，递交后不能修改（数据库同样只收第一次）。老师在工作台和投屏页统计人数与对错。
 *   · 每道题下方有“我的备注”：只保存在这台设备上，不交给老师，导出时一起带走。
 *   · 面板里可以“导出 HTML”（单个文件，离线可打开）或“导出 PDF”（浏览器“存储为 PDF”），内含题目、作答、递交状态与备注。
 * 课程类型：
 *   · 案例课程（kind = case-html，如《习近平经济思想概论》章节页）：投票、配对、推演、文字作答 → ck_choices / ck_answers；
 *   · 概念学习课程（kind = concept-html，如《政治经济学》练习页）：各题 → RPC ck_submit_answer（并入每人一份作业）；
 *     页面里的姓名、学号、班级按课堂登录信息自动填写并锁定。
 * 两类都可发弹幕：显示在老师投屏的课堂页面上（老师开放后可用；老师开启匿名时投屏不显示姓名，后台照常记录发送人）。
 * 未从课堂码进入（或本周课堂不在这一页）时只能写备注、导出，不能递交。
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
  // 地址栏里的解密值用完即清，避免被复制转发
  if (/staticrypt_pwd=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
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
  const identity = OFFLINE ? load(OFFLINE_STORE, {}) : load(STORE, {});
  const unit = config.unit || Live.unitOf();
  const worksheet = config.kind === 'concept-html';
  const joined = OFFLINE || Boolean(identity.classroom && identity.name && identity.sid
    && identity.course === config.course && identity.chapter === unit);
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
  style.textContent = `
  .clp-panel { position: fixed; z-index: 90; left: 16px; bottom: 80px; width: min(360px, calc(100vw - 32px)); padding: 12px 14px; border: 1px solid rgba(35,101,95,.28); border-radius: 10px; background: rgba(255,253,248,.97); color: #201c18; box-shadow: 0 12px 30px rgba(0,0,0,.14); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .clp-who { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .clp-who strong { font-size: 15px; }
  .clp-no { display: inline-block; margin-right: 6px; padding: 1px 8px; border-radius: 999px; color: #fff; background: #a4492d; font-size: 13px; font-weight: 800; vertical-align: 1px; }
  .clp-no[hidden] { display: none; }
  .clp-realm { display: inline-block; margin-left: 6px; padding: 1px 8px; border: 1px solid rgba(0,0,0,.08); border-radius: 999px; font: 800 12.5px/1.5 inherit; vertical-align: 1px; cursor: pointer; }
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
  .clp-gifts button { padding: 3px 9px; border: 1.5px solid rgba(164,73,45,.35); border-radius: 999px; background: #fffaf3; color: #201c18; font: 700 13px/1.4 inherit; cursor: pointer; }
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
  .clp-tools button { padding: 7px 11px; border: 1px solid rgba(35,101,95,.45); border-radius: 7px; color: #23655f; background: #fff; font: 700 13px/1 inherit; cursor: pointer; }
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
  .clp-danmaku button { flex: 0 0 auto; min-width: 52px; padding: 7px 10px; border: 0; border-radius: 7px; color: #fff; background: #a4492d; font: 800 13px/1 inherit; cursor: pointer; }
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
  .clp-dmq-form button { flex: 0 0 auto; min-width: 64px; padding: 9px 14px; border: 0; border-radius: 8px; color: #fff; background: #a4492d; font: 800 14px/1 inherit; cursor: pointer; }
  .clp-dmq-form button[disabled], .clp-dmq-form input[disabled] { opacity: .55; cursor: default; }
  .clp-dmq-state { margin: 6px 0 0; color: #6d6259; font-size: 13px; }
  .clp-dmq-state[data-state="ok"] { color: #23655f; }
  .clp-dmq-state[data-state="error"] { color: #a4492d; }
  @media print { .clp-dmq { display: none !important; } }
  .clp-fb { margin: 28px 0 8px; padding: 16px 18px; border: 1.5px solid rgba(35,101,95,.35); border-radius: 12px; background: #f4f8f6; color: #201c18; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-fb-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .clp-fb-tag { padding: 2px 10px; border-radius: 999px; color: #fff; background: #23655f; font-weight: 800; font-size: 13px; }
  .clp-fb-label { color: #6d6259; font-size: 13px; font-weight: 700; }
  .clp-fb h4 { margin: 8px 0 4px; font-size: 18px; line-height: 1.6; }
  .clp-fb-hint { margin: 0 0 8px; color: #4d443c; font-size: 14px; }
  .clp-fb-hint b { color: #23655f; }
  .clp-fb textarea { display: block; box-sizing: border-box; width: 100%; min-height: 96px; padding: 9px 11px; border: 1.5px solid rgba(70,51,34,.22); border-radius: 8px; background: #fff; color: #201c18; font: inherit; resize: vertical; }
  .clp-fb textarea:focus { outline: none; border-color: #23655f; }
  .clp-fb-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .clp-fb-count { color: #6d6259; font-size: 13px; }
  .clp-fb-row button { padding: 9px 16px; border: 0; border-radius: 8px; color: #fff; background: #23655f; font: 800 14px/1 inherit; cursor: pointer; }
  .clp-fb-row button[disabled], .clp-fb textarea[disabled] { opacity: .55; cursor: default; }
  .clp-fb-state { margin: 6px 0 0; color: #6d6259; font-size: 13px; }
  .clp-fb-state[data-state="ok"] { color: #23655f; font-weight: 700; }
  .clp-fb-state[data-state="error"] { color: #a4492d; font-weight: 700; }
  @media print { .clp-fb { display: none !important; } }
  .clp-panel.is-gate { border-color: rgba(164,73,45,.35); }
  .clp-panel.is-gate a { display: inline-block; margin-top: 8px; padding: 8px 12px; border-radius: 7px; color: #fff; background: #a4492d; text-decoration: none; font-weight: 800; }
  input[data-student-field][readonly] { background: #f1ece3; color: #4d443c; }
  .clp-q { margin: 10px 0 6px; padding: 8px 10px; border: 1px dashed rgba(35,101,95,.4); border-radius: 8px; background: rgba(228,239,235,.45); color: #201c18; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-q.is-locked { border-style: solid; background: rgba(228,239,235,.7); }
  .clp-q-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .clp-q-send { flex: 0 0 auto; padding: 7px 16px; border: 0; border-radius: 7px; color: #fff; background: #23655f; font: 800 14px/1 inherit; cursor: pointer; }
  .clp-q-send.is-confirm { background: #a4492d; }
  .clp-q-send[disabled] { opacity: .5; cursor: default; }
  .clp-q-state { color: #6d6259; font-size: 13px; }
  .clp-q-state[data-state=ok] { color: #23655f; font-weight: 700; }
  .clp-q-state[data-state=error] { color: #a4492d; font-weight: 700; }
  .clp-note { margin-top: 6px; }
  .clp-note summary { color: #a4492d; font-size: 13px; font-weight: 700; cursor: pointer; }
  .clp-note textarea { display: block; box-sizing: border-box; width: 100%; min-height: 64px; margin-top: 6px; padding: 7px 9px; border: 1.5px solid rgba(70,51,34,.2); border-radius: 7px; background: #fffdf8; color: #201c18; font: 14px/1.6 inherit; resize: vertical; }
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
  .clp-v2 .clp-head { position: relative; flex: 0 0 auto; padding: 12px 14px 10px; background: var(--clp-head-bg); color: var(--clp-head-ink); }
  .clp-v2 .clp-who { display: flex; align-items: center; gap: 7px; }
  .clp-v2 .clp-no { margin: 0; flex: 0 0 auto; }
  .clp-v2 .clp-name { min-width: 0; overflow: hidden; font-size: 17px; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
  .clp-v2 .clp-realm { flex: 0 0 auto; margin: 0; padding: 1px 9px; border-radius: 5px; font: 700 14px/1.5 "Kaiti SC", STKaiti, KaiTi, serif; }
  .clp-v2 .clp-links { display: flex; flex: 0 0 auto; gap: 10px; margin-left: auto; }
  .clp-v2 .clp-head .clp-link { color: var(--clp-link); font-size: 13px; }
  .clp-v2 .clp-sub { margin-top: 3px; color: var(--clp-head-sub); font-size: 12.5px; }
  .clp-v2 .clp-rise { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: var(--clp-head-sub); font-size: 12px; }
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
  .clp-v2 .clp-sec { padding: 12px 14px; }
  .clp-v2 .clp-sec[hidden] { display: none; }
  .clp-v2 .clp-sec + .clp-sec { border-top: 1px dashed rgba(70,51,34,.18); }
  .clp-v2 .clp-sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .clp-v2 .clp-sec-title, .clp-v2 .clp-count { font-size: 15px; font-weight: 800; }
  .clp-v2 .clp-sec-note { color: #8a7f74; font-size: 12px; }
  .clp-v2 .clp-sec-note[data-state=ok] { color: #23655f; font-weight: 700; }
  .clp-v2 .clp-relogin { margin: 0 0 10px; }
  .clp-v2 .clp-danmaku { gap: 8px; margin: 0; padding: 0; border: 0; }
  .clp-v2 .clp-dm-field { display: flex; flex: 1 1 auto; min-width: 0; border-radius: 12px; }
  .clp-v2 .clp-danmaku input { flex: 1 1 auto; height: 46px; padding: 0 12px; border: 1.5px solid var(--clp-input-border); border-radius: 12px; background: #fff; font-size: 16px; }
  .clp-v2 .clp-danmaku input:focus { border-color: var(--clp-input-border); box-shadow: 0 0 0 3px var(--clp-ring); }
  .clp-v2 .clp-danmaku button { min-width: 74px; height: 46px; padding: 0 14px; border-radius: 12px; color: var(--clp-accent-ink); background: var(--clp-accent);
    background-size: 300% 100%; box-shadow: var(--clp-accent-glow); font-size: 16px; }
  .clp-v2.is-r4 .clp-danmaku button:not([disabled]) { animation: clp-textflow 4s linear infinite; }
  .clp-v2.has-color .clp-danmaku input { border-color: #8b5fe0; background: #1d1630; color: var(--clp-dm-color, #e3cfff); font-weight: 700; caret-color: #fff; }
  .clp-v2.has-color .clp-danmaku input::placeholder { color: #8d82a8; -webkit-text-fill-color: #8d82a8; font-weight: 500; }
  .clp-v2.is-r4.has-color .clp-danmaku input { border-color: #c9a24a; }
  .clp-v2.has-flow .clp-dm-field { background: #140d24; }
  .clp-v2.has-flow .clp-danmaku input { background-color: transparent; background-image: var(--clp-dm-flow); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
    color: transparent; -webkit-text-fill-color: transparent; caret-color: #ffe08a; animation: clp-textflow 4s linear infinite; }
  .clp-v2 .clp-dm-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; color: #8a7f74; font-size: 12px; }
  .clp-v2 .clp-dm-meta .clp-hint { margin: 0; font-size: 12px; }
  .clp-v2 .clp-dm-meta > span { flex: 0 0 auto; }
  .clp-v2 .clp-colors { gap: 5px; margin: 10px 0 0; font-size: 12.5px; color: #8a7f74; }
  .clp-v2 .clp-label { margin-right: 3px; color: var(--clp-label); font-weight: 700; }
  .clp-v2.is-r4 .clp-label { color: #8a5a1a; }
  .clp-v2 .clp-colors button { width: 20px; height: 20px; border-radius: 50%; }
  .clp-v2 .clp-colors button[aria-pressed="true"] { outline: 2px solid #201c18; outline-offset: 2px; }
  .clp-v2 .clp-colors em { margin-left: 4px; font-size: 12px; }
  .clp-v2 .clp-gifts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 10px 0 0; }
  .clp-v2 .clp-gifts[hidden] { display: none; }
  .clp-v2 .clp-gifts button { display: flex; align-items: center; gap: 7px; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid #e0b64a; border-radius: 9px;
    background: linear-gradient(180deg, #fff8e1, #ffefc2); color: #5a3a00; font: 800 13px/1 inherit; text-align: left; white-space: nowrap; }
  .clp-v2 .clp-gifts button > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .clp-v2 .clp-gifts button[disabled] { opacity: .7; }
  .clp-v2 .clp-gifts .is-qingzhu { border-color: #7fcf9f; background: linear-gradient(180deg, #effbf3, #d7f3e1); color: #10432a; }
  .clp-v2 .clp-gifts .is-fenglei { border-color: #8fcfee; background: linear-gradient(180deg, #eef9ff, #d6effc); color: #0f3e57; }
  .clp-v2 .clp-gifts .is-zhangtian { border-color: #6fd39b; background: linear-gradient(180deg, #14261f, #0e1c16); color: #c9f7dc; box-shadow: 0 0 10px rgba(90,230,150,.35); }
  .clp-v2 .clp-gifts button.is-locked { border: 1px dashed #cfc5b5; background: #f6f1e8; color: #a59a8d; box-shadow: none; font-weight: 700; opacity: 1; }
  .clp-v2 .clp-gifts small { flex: 0 0 auto; margin-left: auto; font-size: 11px; font-weight: 700; }
  .clp-v2 .clp-gi { flex: 0 0 auto; display: inline-grid; place-items: center; }
  .clp-v2 .clp-gi-dan { width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 34% 28%, #fff4c4, #ffc23a 40%, #c97300); box-shadow: 0 0 6px rgba(255,190,40,.8);
    color: #7a1a0a; font: 700 11px/1 "Kaiti SC", STKaiti, KaiTi, serif; }
  .clp-v2 .clp-progress { margin: 0; border-top: 1px dashed rgba(70,51,34,.18); }
  .clp-v2 .clp-prog { height: 6px; margin: -2px 0 8px; border-radius: 3px; background: #ece4d6; overflow: hidden; }
  .clp-v2 .clp-prog i { display: block; width: 0; height: 100%; border-radius: 3px; background: var(--clp-bar); background-size: 300% 100%; transition: width .4s; }
  .clp-v2.is-r0 .clp-prog i { background: #23655f; }
  .clp-v2 .clp-state { font-size: 12.5px; }
  .clp-v2 .clp-tools { flex-wrap: nowrap; gap: 8px; margin-top: 8px; }
  .clp-v2 .clp-tools button { height: 38px; padding: 0 11px; border-radius: 10px; white-space: nowrap; }
  .clp-v2 .clp-tools button.is-main { flex: 1 1 auto; font-size: 14.5px; }
  .clp-v2 [data-cl-export-state]:not([data-state]) { display: none; }
  .clp-v2 .clp-foot { position: relative; padding: 10px 14px; border-top: 1px solid rgba(70,51,34,.12); }
  .clp-v2 .clp-mydm { margin: 0; }
  .clp-v2 .clp-mydm summary { padding-right: 70px; }
  .clp-v2 .clp-realm-open { position: absolute; top: 10px; right: 14px; font-size: 13px; }
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
  @media (max-width: 700px) {
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
  ${worksheet ? `
  form.cl-mcq > .cl-actions { display: none !important; }
  .cl-exit [data-action="submit"], .cl-exit [data-action="reset"], .cl-export, .cl-overview-exit { display: none !important; }` : ''}
  `;
  document.head.appendChild(style);

  // 弹幕小问题：政治经济学插在没有题目的页面（学习路线、线索页、概念小结）；习经章节页放在生成器留好的位置（data-dm-slot）。
  // 弹幕带“【问N】”标签，投屏讲解版据此汇总到对应问题下
  const dmqCards = [];
  if (Array.isArray(config.danmaku)) {
    config.danmaku.forEach((item, index) => {
      const slot = item.slot ? document.querySelector(`[data-dm-slot="${item.slot}"]`) : null;
      const page = slot ? null : document.getElementById(item.after);
      if (!slot && !page) return;
      const box = slot || page.querySelector('.inner') || page;
      const tag = `【问${index + 1}】`;
      // 辩论质询（习经 slot“NN-debate”）：弹幕自动加上【正方】或【反方】，按本人递交的辩前投票
      const debate = (/^(\d{2})-debate$/.exec(item.slot || '') || [])[1] || '';
      const card = document.createElement('section');
      card.className = 'clp-dmq';
      card.dataset.dmq = String(index + 1);
      card.innerHTML = `<div class="clp-dmq-head"><span class="clp-dmq-tag">弹幕小问题 · 问${index + 1}</span><span class="clp-dmq-label">${esc(item.label)}</span></div>
        <h4>${esc(item.prompt)}</h4>${item.hint ? `<p class="clp-dmq-hint">${esc(item.hint)}</p>` : ''}
        <form class="clp-dmq-form"><input type="text" maxlength="${40 - tag.length - (debate ? 4 : 0)}" placeholder="写一句话，发到投屏上" aria-label="弹幕：${esc(item.prompt)}" disabled><button type="submit" disabled>发送</button></form>
        <p class="clp-dmq-state" role="status"></p>`;
      if (slot) {
        slot.replaceChildren(card);
        dmqCards.push({ card, tag, debate });
        return;
      }
      const head = box.querySelector('.page-head');
      // 概念页：辨一辨追问紧跟在辨一辨之后；读情境紧跟在并入的“事实与情境”之后
      const spot = item.where === 'check' ? page.querySelector('[data-step="check"]') : item.where === 'scene' ? page.querySelector('.cl-scene') : null;
      if (spot) spot.insertAdjacentElement('afterend', card);
      else if (item.where === 'start' && head) head.insertAdjacentElement('afterend', card);
      else box.appendChild(card);
      dmqCards.push({ card, tag, debate });
    });
  }
  // ---------- 匿名建议箱：针对本堂课（老师的讲授、案例呈现、互动方式、以后想加的内容），放在每次课最后的“资料与延伸阅读”之后
  //   （习经每个案例两课时为一次课；政经每个案例一次课）。网站版才有，离线版不加。后台不记录提交者，只记日期 ----------
  const fbCards = [];
  if (!OFFLINE) {
    const spots = worksheet
      ? [{ caseNo: (/(\d{2})$/.exec(unit) || [])[1], page: document.getElementById('sources') }]
      // 习经：放在每个案例最后的“资料与延伸阅读”之后（学生版有这一节；没有时退回第二课时末尾）
      : $$('section[id^="case-"][id$="-questions"]').map((page) => ({ caseNo: page.id.slice(5, 7),
        page: document.getElementById(`case-${page.id.slice(5, 7)}-sources`) || page }));
    spots.forEach(({ caseNo, page }) => {
      if (!/^\d{2}$/.test(caseNo || '') || !page) return;
      const card = document.createElement('section');
      card.className = 'clp-fb';
      card.innerHTML = `<div class="clp-fb-head"><span class="clp-fb-tag">匿名建议箱</span><span class="clp-fb-label">本堂课</span></div>
        <h4>对这堂课，你有什么意见或建议？</h4>
        <p class="clp-fb-hint">老师的讲授、案例的呈现、课堂互动和网页用起来怎么样？希望以后的课上增加哪些内容或互动方式？都可以写下来。<b>完全匿名</b>：后台不记录你的姓名、学号和登录信息，老师只看到建议内容和提交日期。</p>
        <form class="clp-fb-form"><textarea maxlength="500" rows="4" placeholder="写下你对这堂课的意见或建议（500 字内）" aria-label="本堂课的匿名建议" disabled></textarea>
        <div class="clp-fb-row"><span class="clp-fb-count">0/500</span><button type="submit" disabled>匿名提交</button></div></form>
        <p class="clp-fb-state" role="status"></p>`;
      // 政治经济学：放在“资料与延伸阅读”里、“继续阅读下一案例”之前；习经：放在“资料与延伸阅读”这一节的末尾
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
  const questions = worksheet ? conceptQuestions() : caseQuestions();

  // 递交记录：按页面保存，每个课堂一份（同一页面在别的课堂重新发布时重新作答）
  const LOCK_KEY = `classlive-locked:${location.pathname}`;
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
    bar.innerHTML = `<div class="clp-q-row"${joined ? '' : ' hidden'}><button type="button" class="clp-q-send">递交</button><span class="clp-q-state" aria-live="polite"></span></div>
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
  });

  const IDLE = OFFLINE ? '选好或写好后点“递交”锁定答案，递交后不能修改' : '选好或写好后点“递交”交给老师，递交后不能修改';
  const setQ = (q, text, state) => { q.state.textContent = text; q.state.dataset.state = state || ''; };
  const markLocked = (q, entry) => {
    q.bar.classList.add('is-locked');
    q.button.hidden = true;
    q.lock();
    if (entry && entry.v !== undefined && entry.v !== null && q.restore) q.restore(entry.v);
    setQ(q, entry && entry.other ? '已在其他设备递交（每题只算第一次）' : `已递交（${(entry && entry.at) || ''}），不能再修改`, 'ok');
  };
  questions.forEach((q) => {
    if (locked[q.key]) markLocked(q, locked[q.key]);
    else setQ(q, joined ? IDLE : '', '');
  });

  // 递交：第一次点出现“确认递交？”，3 秒内再点一次才发送
  async function submit(q) {
    if (!joined || locked[q.key]) return;
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
      // 离线版只在本机锁定；在线版交给后台
      const result = OFFLINE ? null : await q.send(value);
      // 服务器说这题之前已递交过（例如在另一台设备上）：以第一次为准，不记这次的作答
      const rejected = result && result.accepted === false;
      const entry = rejected ? { at: '', v: null, other: true } : { at: time(), iso: new Date().toISOString(), v: value };
      remember(q.key, entry);
      markLocked(q, entry);
      if (rejected) setQ(q, '这道题之前已递交过，以第一次为准', 'ok');
      if (result && Array.isArray(result.keys)) syncKeys(result.keys);
    } catch (problemError) {
      console.error(problemError);
      if (Live.isDuplicateError(problemError)) {
        const entry = { at: '', v: null, other: true };
        remember(q.key, entry);
        markLocked(q, entry);
        setQ(q, '这道题之前已递交过，以第一次为准', 'ok');
      } else {
        q.button.disabled = false;
        q.button.textContent = '递交';
        if (Live.isClosedError(problemError)) onBlocked();
        setQ(q, Live.isClosedError(problemError) ? (needsRelogin(problemError) ? reloginText : closedText) : '递交失败：请检查网络后再试（作答仍在页面上）', 'error');
      }
    }
    refreshCount();
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
    setFolded(savedFold === null ? window.innerWidth < 700 : Boolean(savedFold));
  }

  // ---------- 面板按钮：下一道未递交、导出 ----------
  function bindTools() {
    const next = panel.querySelector('[data-cl-next]');
    if (next) next.addEventListener('click', () => {
      const q = questions.find((item) => !locked[item.key]);
      if (!q) { const state = panel.querySelector('[data-cl-state]'); if (state) { state.textContent = '全部题目都已递交'; state.dataset.state = 'ok'; } return; }
      reveal(q.bar);
    });
    panel.querySelectorAll('[data-cl-export]').forEach((button) => button.addEventListener('click', () => exportWork(button.dataset.clExport)));
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
      const state = entry ? (entry.other ? '已在其他设备递交' : `已递交 ${entry.at || ''}`) : (lines.length ? '未递交（草稿）' : '未作答');
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

  // ---------- 面板 ----------
  const tools = `<div class="clp-tools"><button type="button" data-cl-next class="is-main"${joined ? '' : ' hidden'}>下一道未递交 ↓</button><button type="button" data-cl-export="html">导出 HTML</button><button type="button" data-cl-export="pdf">导出 PDF</button></div>
    <p class="clp-hint" data-cl-export-state>导出内容：题目、我的作答、递交状态${questions.some((q) => q.extra) ? '、自检' : ''}和备注，方便课后复习。</p>`;
  if (!joined) {
    panel.classList.add('is-gate');
    const elsewhere = identity.classroom && identity.course === config.course && identity.chapter && identity.chapter !== unit;
    panel.innerHTML = (elsewhere
      ? `<strong>本周课堂不在这一页</strong><div class="clp-room">你已进入“${esc(identity.classroom_name)}”。本页可以写备注、导出复习，但不能递交。</div><a href="${joinUrl()}">回到登录页</a>`
      : '<strong>还没有进入课堂</strong><div class="clp-room">请在首页输入老师发布的课堂码并填写个人信息，才能递交作答。本页可以写备注、导出复习。</div><a href="/">去登录</a>')
      + (questions.length ? tools : '');
    document.body.appendChild(panel);
    dodge();
    bindTools();
    setupMechDanmaku(false, elsewhere ? '本周课堂不在这一页，这里不能发弹幕。' : '进入课堂后才能发弹幕：请先在首页输入老师发布的课堂码。');
    setupFeedback(false, elsewhere ? '本周课堂不在这一页，这里不能提交建议。' : '进入课堂后才能提交建议：请先在首页输入老师发布的课堂码。');
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
  const DM_HINT = '投屏可见 · 老师能看到发送人 · 请文明发言';
  panel.innerHTML = `
    <button type="button" class="clp-mini" data-cl-mini aria-label="展开课堂面板"><span data-cl-mini-ch>炼</span><i class="clp-mini-dot" data-cl-mini-dot hidden></i></button>
    <div class="clp-head">${STAR}${STAR}${STAR}
      <div class="clp-who"><b class="clp-no" data-cl-no title="你在点名册上的编号" hidden></b><strong class="clp-name">${esc(identity.name)}</strong><b class="clp-realm" data-cl-realm role="button" tabindex="0" title="修为境界（点开看说明）" hidden></b>
        <span class="clp-links"><button type="button" class="clp-link" data-cl-fold>收起</button><button type="button" class="clp-link" data-cl-switch>不是我</button></span></div>
      <div class="clp-sub">${[identity.sid, identity.class_name, identity.group_name, identity.classroom_name].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="clp-rise" data-cl-rise hidden><span data-cl-rise-label></span><span class="clp-rise-bar"><i data-cl-rise-fill></i></span></div>
    </div>
    <div class="clp-body">
      <section class="clp-sec">
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
        <div class="clp-sec-head"><span class="clp-count" data-cl-count></span><span class="clp-sec-note" data-cl-count-note>递交后不能修改</span></div>
        <div class="clp-prog"><i data-cl-prog></i></div>
        <span class="clp-state" data-cl-state>每题做完点题目下方的“递交”</span>${tools}
      </section>
      <div class="clp-foot">
        <details class="clp-mydm" data-cl-mydm>
          <summary>我发过的弹幕<span data-cl-mydm-count></span></summary>
          <ul class="clp-mydm-list" data-cl-mydm-list></ul>
          <p class="clp-hint" data-cl-mydm-state></p>
        </details>
        <button type="button" class="clp-link clp-realm-open" data-cl-realm-open>修为说明</button>
      </div>
    </div>`;
  document.body.appendChild(panel);
  dodge();
  // 不是我：清掉本机的身份并退出这次登录（下一位同学在这台设备上登录算新设备，要输自己的口令）
  panel.querySelector('[data-cl-switch]').addEventListener('click', async () => {
    save(STORE, { code: identity.code });
    try { if (backend.signOutStudent) await backend.signOutStudent(); } catch (error) { /* 忽略 */ }
    location.href = joinUrl();
  });
  setupFold();
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
    if (note) { note.textContent = all ? '全部递交 ✓' : '递交后不能修改'; note.dataset.state = all ? 'ok' : ''; }
    const next = panel.querySelector('[data-cl-next]');
    if (next && panel.classList.contains('clp-v2')) next.textContent = all ? '全部已递交 ✓' : '下一道未递交 ↓';
  }
  refreshCount();

  // 页面原有的即时提交（选择类）改为先选、再“递交”
  document.addEventListener('classlive:choice', (event) => {
    const el = event.detail && event.detail.el;
    const status = el && el.querySelector('[data-live-status]');
    if (status) { status.textContent = '已选择，点下方“递交”交给老师'; status.dataset.state = ''; }
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
    const color = myDanmakuColor();   // 元婴起才带字色（投屏页还会按境界核对）
    if (color) doc.color = color;
    await backend.add('danmaku', doc);
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
  const scheduleLikes = (ms) => { clearTimeout(likeTimer); likeTimer = setTimeout(likeLoop, ms); };
  async function likeLoop() { await checkLikes(); scheduleLikes(sentMine ? 12000 : 45000); }
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
  setupMechDanmaku(true);
  setupFeedback(true);

  // 每次打开本章页面都向后台核对：这台设备是否已经过首页核对（课堂码＋点名册＋口令）登录本课堂；没有就提示回首页重新登录。
  // 同一课堂分几次课上时，后台在每天第一次打开时补记一次登录，老师可按日期看每次到课
  const reloginBox = panel.querySelector('[data-cl-relogin]');
  const checkMembership = () => backend.rpc('ck_checkin_today', { p_classroom: Number(identity.classroom) || identity.classroom, p_sid: identity.sid })
    .then((result) => {
      const status = Array.isArray(result) ? result[0] : result;
      loginNeeded = status === 'login';
      reloginBox.hidden = !loginNeeded;
      panel.querySelector('[data-cl-mini-dot]').hidden = !loginNeeded;
      if (loginNeeded && panel.classList.contains('is-folded')) panel.querySelector('[data-cl-fold]').click();
      return status;
    })
    .catch((problem) => { console.warn('[登录核对] 没有完成：', (problem && problem.message) || problem); return null; });
  let blockedAt = 0;
  onBlocked = () => { if (Date.now() - blockedAt > 10000) { blockedAt = Date.now(); checkMembership(); } };
  const checkedIn = checkMembership();
  checkedIn.then(() => scheduleLikes(3000));

  // 点名册编号（点名册第几行）：老师在课堂工具里抽人上台时按这个编号叫人。先显示上次记住的，再向后台核对；
  // 后台函数只认本人这次登录对应的学号，看不到别人的；不在点名册里或后台还没有这个函数时不显示
  const noEl = panel.querySelector('[data-cl-no]');
  const noKey = `classlive-roster-no:${identity.classroom}`;
  const showNo = (no) => {
    noEl.textContent = no ? `${no}号` : '';
    noEl.hidden = !no;
  };
  showNo(load(noKey, null));
  checkedIn.then(() => backend.rpc('ck_my_roster_no', { p_classroom: Number(identity.classroom) || identity.classroom }))
    .then((value) => {
      const raw = Array.isArray(value) ? value[0] : value;
      const no = Number(raw && typeof raw === 'object' ? Object.values(raw)[0] : raw) || null;
      save(noKey, no);
      showNo(no);
    })
    .catch(() => { /* 后台还没有 ck_my_roster_no 时不显示编号 */ });

  // ---------- 修为境界：老师在工作台按后台记录结算（签到、作答、弹幕），这里只显示本人的境界称号；分数不在页面上显示 ----------
  const REALMS = Live.REALMS || [];
  const GIFTS = Live.GIFTS || [];
  const realmEl = panel.querySelector('[data-cl-realm]');
  const giftBox = panel.querySelector('[data-cl-gifts]');
  const colorBox = panel.querySelector('[data-cl-colors]');
  const colorNote = panel.querySelector('[data-cl-colors-note]');
  const COLORS = Live.COLORS || [];
  const colorKey = `classlive-dmcolor:${config.course}`;
  const realmKey = `classlive-realm:${config.course}:${identity.sid}`;   // 按学号分开记（同一台设备换人时不串）
  let myRealm = load(realmKey, null);
  const realmModal = document.createElement('div');
  realmModal.className = 'clp-realm-modal';
  realmModal.hidden = true;
  document.body.appendChild(realmModal);
  const chip = (level, text) => `<b class="clp-realm is-r${level}">${esc(text || REALMS[level].name)}</b>`;
  // 境界阶梯图：越往上台阶越高、材质越华贵；台阶上写解锁的法宝和弹幕特权，“你”标出本人所在境界
  const PERKS = { 0: ['弹幕白字'], 3: ['自选字色', '紫色辉边'], 4: ['流光字色', '七彩边框'] };
  const ladderHtml = (mine) => `<div class="clp-ladder" role="img" aria-label="${esc(REALMS.map((realm) => {
    const gift = GIFTS.find((item) => item.level === realm.level);
    return `${realm.name}（${realm.look}，${realm.min ? `${Math.round(realm.min * 100)}%` : '起步'}${gift ? `，解锁${gift.name}` : ''}${(PERKS[realm.level] || []).map((perk) => `，${perk}`).join('')}）`;
  }).join(' → '))}">${REALMS.map((realm) => {
    const gift = GIFTS.find((item) => item.level === realm.level);
    return `<div class="clp-step is-r${realm.level}${realm.level === mine ? ' is-me' : ''}" aria-hidden="true">
      ${realm.level === mine ? '<i class="clp-me">你</i>' : ''}${chip(realm.level)}
      <div class="clp-stone"><b>${esc(realm.look)}</b><em>${realm.min ? `${Math.round(realm.min * 100)}%` : '起步'}</em>${gift ? `<span class="clp-step-gift">${GIFT_ICONS[gift.id] || ''}${esc(gift.name)}</span>` : ''}${(PERKS[realm.level] || []).map((perk) => `<span>${esc(perk)}</span>`).join('')}</div>
    </div>`;
  }).join('')}</div>`;
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
      <h4>怎样积累修为</h4>
      <ul>
        <li>本学期每次课都能积累修为，每次课最多 100：上课签到 20、作答完成 35、作答正确 35、发弹幕最多 10。</li>
        <li>签到：上课时进入本次课堂就算；课后再打开页面不算。</li>
        <li>作答完成：每道题点“递交”就算（投票、站队也算）；要写的题认真写满一句话，只填几个字或留着空格线不算。</li>
        <li>作答正确：有参考答案的题按你第一次递交的答案判对错，递交后改不了，先想清楚再递交。</li>
        <li>弹幕：每条有内容的弹幕都有修为，同一句只算一次，每次课最多 10；被老师隐藏或自己撤回的不算。</li>
        <li>猜词游戏：每次课得分第一的一组，两位同学各加 ${(Live.WORDGAME || {}).points || 10} 修为。</li>
        <li>老师点赞：说得好的弹幕，老师会在投屏上盖一枚「师赞」朱印（每堂课最多 ${(Live.LIKE || {}).limit || 5} 个赞），被赞一次额外加 ${(Live.LIKE || {}).points || 5} 修为，每次课最多算 ${(Live.LIKE || {}).perStudent || 2} 个。被赞的弹幕在“我发过的弹幕”里标着「师赞」。</li>
      </ul>
      <h4>境界与奖励</h4>
      ${ladderHtml(r ? level : 0)}
      <p class="clp-hint">百分比＝修为占全学期满分的比例，每个境界再分初期、中期、后期。法宝每次课可祭出一件，不加修为。</p></div>`;
    realmModal.hidden = false;
    realmModal.querySelector('[data-realm-close]').focus();
  }
  realmModal.addEventListener('click', (event) => { if (event.target === realmModal || event.target.closest('[data-realm-close]')) realmModal.hidden = true; });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !realmModal.hidden) realmModal.hidden = true; });
  realmEl.addEventListener('click', openRealm);
  panel.querySelector('[data-cl-realm-open]').addEventListener('click', openRealm);
  realmEl.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRealm(); } });
  function toast(text) {
    const box = document.createElement('div');
    box.className = 'clp-toast';
    box.setAttribute('role', 'status');
    box.textContent = text;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 6000);
  }
  // 法宝小图（与投屏画面同一套造型，用 CSS／SVG 画，不依赖表情字体）
  const GIFT_ICONS = {
    zhujidan: '<span class="clp-gi clp-gi-dan" aria-hidden="true">丹</span>',
    qingzhu: '<svg class="clp-gi" aria-hidden="true" width="22" height="10" viewBox="0 0 240 28"><rect x="0" y="10" width="40" height="8" rx="2" fill="#1d4a2c"/><path d="M40 2h8v24h-8z" fill="#c9a24a"/><path d="M48 8h166l24 6-24 6H48z" fill="#3fbf7a"/></svg>',
    fenglei: '<svg class="clp-gi" aria-hidden="true" width="22" height="14" viewBox="0 0 44 28"><path d="M22 18C16 8 8 4 1 3c4 4 2 6 6 8-3 1-2 4 2 5-2 2 1 4 5 3 2 3 6 2 8-1z" fill="#8fdcff" stroke="#3a9fd6"/><path d="M22 18C28 8 36 4 43 3c-4 4-2 6-6 8 3 1 2 4-2 5 2 2-1 4-5 3-2 3-6 2-8-1z" fill="#8fdcff" stroke="#3a9fd6"/></svg>',
    zhangtian: '<svg class="clp-gi" aria-hidden="true" width="14" height="18" viewBox="0 0 128 176"><path d="M55 12h18v22c0 6 4 9 10 13 18 11 31 31 31 58 0 36-24 63-50 63S14 141 14 105c0-27 13-47 31-58 6-4 10-7 10-13z" fill="#2fae6a" stroke="#9ff0c2" stroke-width="6"/></svg>',
  };
  const STAGES = Live.STAGES || [];
  function showRealm(r) {
    const level = r ? Math.max(0, Math.min(REALMS.length - 1, Number(r.realm) || 0)) : 0;
    realmEl.className = `clp-realm is-r${level}`;
    realmEl.textContent = REALMS[level] ? REALMS[level].name : '炼气';
    realmEl.hidden = !REALMS.length;
    const miniCh = panel.querySelector('[data-cl-mini-ch]');
    if (miniCh) {
      miniCh.textContent = (REALMS[level] ? REALMS[level].name : '炼气').slice(0, 1);
      panel.querySelector('[data-cl-mini]').setAttribute('aria-label', `展开课堂面板（境界：${REALMS[level] ? REALMS[level].name : '炼气'}）`);
    }
    // 面板材质随境界变化；头部进度条只显示“距下一境界”，不显示分数
    [0, 1, 2, 3, 4].forEach((n) => panel.classList.toggle(`is-r${n}`, n === level));
    const rise = panel.querySelector('[data-cl-rise]');
    if (rise && REALMS[level]) {
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
      const open = r && level >= gift.level;
      button.disabled = !open;
      button.className = `is-${gift.id}${open ? '' : ' is-locked'}`;
      button.innerHTML = open ? `${GIFT_ICONS[gift.id] || ''}<span>${esc(gift.name)}</span>` : `<span>${esc(gift.name)}</span><small>${esc(REALMS[gift.level].name)}解锁</small>`;
      button.title = open ? `祭出法宝「${gift.name}」（每次课一件）` : `${REALMS[gift.level].name}境界解锁`;
      giftBox.appendChild(button);
    });
    // 弹幕字色：元婴解锁 8 色，化神再加两种流光色；没到元婴时显示但不能点
    colorBox.hidden = !COLORS.length;
    colorBox.querySelectorAll('button').forEach((button) => button.remove());
    const current = myDanmakuColor();
    COLORS.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.color = color.id;
      button.style.background = color.flow || color.value;
      const open = r && level >= color.level;
      button.disabled = !open;
      button.setAttribute('aria-pressed', String(open && current === color.id));
      button.title = open ? `弹幕字色：${color.name}` : `${color.name}（${REALMS[color.level].name}解锁）`;
      button.setAttribute('aria-label', button.title);
      colorNote.before(button);
    });
    colorNote.textContent = level >= 3 ? (COLORS.find((color) => color.id === current) || {}).name || '' : '元婴解锁';
    // 元婴起：输入框直接用所选字色预览投屏上的样子（流光色用渐变字）
    const chosen = level >= 3 ? COLORS.find((color) => color.id === current) : null;
    panel.classList.toggle('has-color', Boolean(chosen));
    panel.classList.toggle('has-flow', Boolean(chosen && chosen.flow));
    panel.style.setProperty('--clp-dm-color', chosen && chosen.value ? chosen.value : '#e3cfff');
    panel.style.setProperty('--clp-dm-flow', chosen && chosen.flow ? chosen.flow : 'none');
    if (!dmState.dataset.state) dmState.textContent = chosen ? '输入框里的颜色就是投屏上的字色 · 请文明发言' : DM_HINT;
  }
  // 本人能用的弹幕字色：元婴起才有；选过且境界够就用选的，否则用本境界默认色
  function myDanmakuColor() {
    const level = myRealm ? Number(myRealm.realm) || 0 : 0;
    if (level < 3 || !Live.colorFor) return null;
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
  checkedIn.then(() => backend.rpc('ck_my_realm', { p_classroom: Number(identity.classroom) || identity.classroom }))
    .then((value) => {
      const row = Array.isArray(value) ? value[0] : value;
      if (!row) { showRealm(null); return; }
      const fresh = { realm: Number(row.realm) || 0, stage: Number(row.stage) || 0, ratio: Number(row.ratio) || 0, updated_at: row.updated_at || '' };
      if (myRealm && fresh.realm > (Number(myRealm.realm) || 0)) {
        const gift = GIFTS.find((item) => item.level === fresh.realm);
        toast(`恭喜突破！你已晋升「${REALMS[fresh.realm].name}」境界${gift ? `，解锁弹幕法宝「${gift.name}」${gift.icon}` : ''}。`);
      }
      myRealm = fresh;
      save(realmKey, fresh);
      showRealm(fresh);
    })
    .catch(() => { /* 后台还没有修为境界时，按上次记住的显示 */ });
  giftBox.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-gift]');
    if (!button || button.disabled) return;
    const gift = GIFTS.find((item) => item.id === button.dataset.gift);
    giftBox.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      await backend.rpc('ck_send_gift', { p_classroom: Number(identity.classroom) || identity.classroom, p_gift: gift.id });
      dmState.textContent = `已祭出法宝「${gift.name}」${gift.icon}，正在飞上投屏！每次课只能祭出一件。`;
      dmState.dataset.state = 'ok';
    } catch (problem) {
      console.warn('[法宝]', problem);
      const text = String((problem && problem.message) || problem || '');
      dmState.dataset.state = 'error';
      dmState.textContent = /每次课/.test(text) ? '这次课已经祭出过法宝了，下次课再来。'
        : /境界/.test(text) ? '境界还不够，暂时不能祭出这件法宝。'
          : /重新登录/.test(text) ? reloginText + '。'
            : /弹幕|42501/.test(text) ? '老师还没有开放弹幕，暂时不能祭出法宝。' : '祭出失败：请检查网络后再试。';
    } finally {
      showRealm(myRealm);
    }
  });

  // 匿名建议箱：只把建议内容交给后台函数，不带姓名、学号（函数只核对进过本课堂，存下的行里没有提交者）
  function setupFeedback(enabled, note) {
    fbCards.forEach(({ card, caseNo }) => {
      const area = card.querySelector('textarea');
      const button = card.querySelector('button');
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
      say(sent ? `你在这台设备上已匿名提交过 ${sent} 条，还可以继续写。` : '写好后点“匿名提交”，可以提交多条。');
      card.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = area.value.trim();
        if (text.length < 2 || sending) return;
        sending = true;
        sync();
        try {
          await backend.rpc('ck_submit_feedback', { p_classroom: Number(identity.classroom) || identity.classroom, p_case: caseNo, p_text: text });
          area.value = '';
          save(key, (Number(load(key, 0)) || 0) + 1);
          say(`已匿名提交（${time()}），谢谢你的建议！还可以继续写下一条。`, 'ok');
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
          await sendDanmaku(`【${box.dataset.case}${link}】${text}`.slice(0, 40));
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
    dmqCards.forEach(({ card, tag, debate }) => {
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
      say(debate ? '先投辩前票并递交，再写一句话点“发送”：投屏上会标出你是正方还是反方。' : '写一句话后点“发送”，会显示在投屏上（老师开启匿名时不显示姓名）。');
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
        const side = debate ? sideOf() : '';
        if (debate && !side) { say('请先在上面“① 辩前投票”里选好一方并递交，弹幕才能标出你是正方还是反方。', 'error'); return; }
        button.disabled = true;
        try {
          await sendDanmaku(`${tag}${side}${text}`.slice(0, 40));
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
        'debate-pre': '辩论赛 · 辩前投票', 'debate-post': '辩论赛 · 辩后投票', 'rt-role': '圆桌会议 · 我代表的角色' };
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
        // 圆桌会议的秘密任务题在学生递交角色后才填入题目，所以题干在用到时再读
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
      const clue = (row) => { const cell = row.querySelector('th').cloneNode(true); cell.querySelectorAll('small').forEach((el) => el.remove()); return textOf(cell); };
      const choiceOf = (row) => { const button = pressed(row, '[data-match-choice]'); return button ? button.dataset.matchChoice : (row.dataset.choice || null); };
      list.push({
        key: `${matchPanel.dataset.liveCase}:match`, section: caseTitle(matchPanel), title: '证据—理论配对', prompt: textOf(matchPanel.querySelector('h3')),
        anchor: (bar) => matchPanel.appendChild(bar),
        read: () => { const value = rows.map(choiceOf); return value.some(Boolean) ? value : null; },
        check: (value) => { const missing = rows.length - (value || []).filter(Boolean).length; return missing ? `还有 ${missing} 条线索没有选，全部选好再递交` : ''; },
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
    // 课后思考（申论式大题）：一篇短文，写好后递交
    const essay = $('textarea[data-cl-text="essay"]');
    if (essay) {
      const box = essay.closest('[data-essay]');
      const count = box && box.querySelector('[data-essay-count]');
      const target = Number(count && count.dataset.target) || 0;
      list.push({
        key: 'essay', section: '课后思考', title: textOf(document.querySelector('#essay h2')) || '申论式大题',
        prompt: textOf(box && box.querySelector('.cl-essay-q')),
        anchor: (bar) => (count || essay).insertAdjacentElement('afterend', bar),
        read: () => text(essay),
        check: (value) => (!value ? '请先写好，再点“递交”' : value.replace(/\s/g, '').length < 100 ? '至少写 100 字再递交' + (target ? '（建议按作答要求写 ' + target + ' 字左右）' : '') : ''),
        show: (value) => (value ? [value] : []),
        lock: () => { essay.readOnly = true; },
        restore: (value) => { if (!essay.value.trim()) essay.value = value; },
        send: send('essay'),
      });
    }
    // 出门测：每题单独递交
    $$('.cl-exit .cl-exit-item').forEach((item, i) => {
      const legend = item.querySelector('legend').cloneNode(true);
      legend.querySelectorAll('.cl-exit-tag').forEach((tag) => tag.remove());
      list.push({
        key: `exit.${i}`, section: '出门测', title: `第 ${i + 1} 题`, prompt: textOf(legend), anchor: (bar) => item.appendChild(bar),
        read: () => { const value = radio(item); return value === null ? null : Number(value); },
        check: (value) => (value === null ? '请先选一项，再点“递交”' : ''),
        show: (value) => (value === null || value === undefined ? [] : [`${LET(value)}. ${textOf($$('.cl-option-text', item)[value])}`]),
        lock: () => disable(item, 'input'),
        restore: (value) => setRadio(item, value),
        send: send(`exit.${i}`),
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
