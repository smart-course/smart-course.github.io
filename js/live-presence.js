/* 复习资料页报在线（2026-11-21）。
 * 用户：“统计学生的在线时长好像不是很准……有没有办法让这个统计时间更准确一些”；问到“复习资料页仍不计时，要不要补”时回答：“补”。
 * 复习资料页（chNN-notes.html／caseNN-notes.html）原来只有字号和锁定两个脚本，不连后台，学生在这里看多久都不算在线。
 * 现在：页面在前台时每 30 秒报一次在线（ck_ping），切走或关掉时再报一次，和章节页、云间灵田页一样；
 *   记在这台设备在这一章（案例）登录的课堂上；这一章是用历史课堂码“只查看”的，记在查看的那个课堂上；
 *   这一章没有登录过，就记在本机最近一次登录的、同一门课的课堂上（学生的在线合计不少算）。
 * 旁听不报；没登录过任何课堂的设备不报；后台没有 ck_ping 时安静停止。只报在线，不读不写别的数据。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  const Live = window.ClassLive;
  if (!config || !Live || !config.course || config.provider === 'off') return;
  const load = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (error) { return null; } };
  const STORE = 'classlive-student';
  const unit = config.unit || '';
  const last = load(STORE) || {};
  const mine = load(`${STORE}:${config.course}:${unit}`);
  const view = load(`classlive-view:${config.course}:${unit}`);
  // 与章节页（live-student.js）同一套认法：最近一次登录的就是这一章，或这一章没有单独记过，用最近一次登录的；否则用这一章自己的
  const identity = (last.course === config.course && last.chapter === unit) || !(mine && mine.classroom) ? last : mine;
  if (identity.audit) return;
  const viewing = Boolean(view && view.classroom && (!identity.joined_at || Number(view.at) > Number(identity.joined_at)));
  const room = viewing ? Number(view.classroom) || 0 : (identity.course === config.course ? Number(identity.classroom) || 0 : 0);
  if (!room) return;
  let backend = null;
  try { backend = Live.create(config); } catch (error) { return; }
  let off = false;
  const ping = (force) => {
    if (off || (force !== true && document.hidden)) return;
    Promise.resolve().then(() => backend.rpc('ck_ping', { p_classroom: room })).catch((problem) => {
      if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem))) off = true;
    });
  };
  setTimeout(ping, 3000);
  setInterval(ping, 30000);
  document.addEventListener('visibilitychange', () => ping(document.hidden));
  window.addEventListener('pagehide', () => ping(true));
})();
