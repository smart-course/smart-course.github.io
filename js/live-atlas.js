/* 课程地图（学生首页）：登录后先看到本课程的全部章节（案例）——老师已发布给本班的为彩色、点击进入，本周课堂插着小红旗，
 * 还没发布的为灰色、不能进入，学生由此了解整门课的结构。
 *   · 章节列表来自网站构建（window.CLASS_COURSES，只有标题）；哪些已发布、各章钥匙由后台 ck_my_map 给出：
 *     只给本人所在班级，往期章节进入后只能查看、写备注、导出复习；本周课堂须先用本周课堂码登录。
 *   · 首页地址为 /#map 时显示地图（章节页面板的“课程地图”链接到这里），否则显示登录表单；登录成功后自动打开地图。
 *   · 后台暂时读不到地图时，刚登录的同学仍可直接进入本周课堂（用登录时拿到的本章钥匙）。
 * 需要页面先加载 live-core.js、live-map.js、live-join.js（提供 window.ClassJoin）。
 */
(function () {
  'use strict';
  const view = document.querySelector('[data-atlas]');
  const joinView = document.querySelector('[data-join-view]');
  const join = window.ClassJoin;
  if (!view || !joinView || !window.ClassMap || !join) return;
  const STORE = 'classlive-student';
  const $ = (selector) => view.querySelector(selector);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch (error) { return {}; } };
  const save = (value) => { try { localStorage.setItem(STORE, JSON.stringify(value)); } catch (error) { /* 忽略 */ } };
  const COURSES = window.CLASS_COURSES || [];
  // 手机上打开地图时滚到本周课堂：不要让浏览器在页面加载完后恢复上次的滚动位置把它盖掉
  try { history.scrollRestoration = 'manual'; } catch (error) { /* 忽略 */ }
  const baseTitle = document.title;
  let map = null;
  let course = null;
  let loading = 0;

  function setStatus(text, bad) {
    const el = $('[data-atlas-status]');
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('is-bad', Boolean(bad));
  }
  function showJoin(message, focusCode) {
    view.hidden = true;
    joinView.hidden = false;
    document.title = baseTitle;
    if (location.hash === '#map') history.replaceState(null, '', location.pathname + location.search);
    join.showError(message || '');
    join.refresh();
    if (focusCode) setTimeout(() => join.focus('code'), 30);
  }

  const isConcept = (item) => item.kind === 'concept-html';
  function units(published) {
    const concept = isConcept(course);
    const word = concept ? '案例' : '章节';
    return course.chapters.map((chapter) => {
      const room = published[chapter.id] || null;
      const no = concept ? chapter.id.replace(/\D/g, '') : String(Number(chapter.id.replace(/\D/g, '')));
      const name = concept ? `${chapter.cn} · ${chapter.title}` : `${chapter.cn}　${chapter.title}`;
      const sub = concept
        ? (chapter.chapter ? `<small>教材${esc(chapter.chapter)}</small>` : '')
        : (chapter.cases || []).map((item) => `<small>案例 ${esc(item.number)}　${esc(item.title)}</small>`).join('');
      let line, state, go = '进入 →';
      if (!room) { state = '尚未发布'; line = `<em class="is-off">老师还没有发布这个${word}</em>`; }
      else if (room.current && !room.open) { state = '本周课堂，需要课堂码'; line = '<em class="is-current">本周课堂：输入老师公布的课堂码后进入</em>'; go = '输入课堂码 →'; }
      else if (room.current) { state = '本周课堂'; line = '<em class="is-current">本周课堂 · 点击进入</em>'; }
      else { state = '已开放'; line = '<em>已开放 · 进入复习（只能查看、写备注，不能再递交）</em>'; }
      return {
        id: chapter.id, no, label: chapter.short || chapter.title, file: chapter.file, room,
        state: !room ? 'off' : room.current ? 'current' : 'open',
        clickable: Boolean(room), flag: room && room.current ? '本周' : '', go,
        tip: `<strong>${esc(name)}</strong>${sub}${line}`, aria: `${name}（${state}）`,
      };
    });
  }
  function draw(published) {
    const list = units(published);
    const options = { seed: course.slug, label: `${course.title}课程地图`, units: list, onPick: enter };
    if (map) map.update(options); else map = window.ClassMap.journey($('[data-atlas-map]'), options);
    const current = list.find((unit) => unit.state === 'current');
    if (current) setTimeout(() => map && map.reveal(current.id), 0);
    const open = list.filter((unit) => unit.clickable).length;
    $('[data-atlas-count]').textContent = `共 ${list.length} 个${isConcept(course) ? '案例' : '章节'}，已开放 ${open} 个`;
  }
  function enter(unit) {
    const room = unit.room;
    if (!room) return;
    if (room.current && !room.open) { showJoin('本周课堂要先输入老师公布的课堂码：请填写后点“登录”。', true); return; }
    const file = unit.file || `${course.slug}/cases/${unit.id}.html`;
    location.href = `/${file}` + (room.key ? `#staticrypt_pwd=${room.key}&remember_me` : '');
  }

  // fresh：刚登录时 ck_join 的结果（后台读不到地图时，至少能进本周课堂）
  async function open(fresh) {
    const me = load();
    course = COURSES.find((item) => item.slug === me.course);
    if (!me.classroom || !me.sid || !course) { showJoin(me.classroom ? '' : '请先登录：填写老师公布的课堂码和个人信息。'); return; }
    joinView.hidden = true;
    view.hidden = false;
    if (location.hash !== '#map') history.pushState(null, '', '#map');
    document.title = `课程地图 · ${course.title}`;
    $('[data-atlas-title]').textContent = course.title;
    $('[data-atlas-who]').textContent = [me.name, me.sid, me.class_name].filter(Boolean).join(' · ');
    const fallback = {};
    if (fresh && fresh.chapter) fallback[fresh.chapter] = { classroom: fresh.classroom, current: true, open: true, key: fresh.pwd_hash || '' };
    // 先读后台再画（3D 地图画一次要零点几秒，不画两遍）
    if (!map) $('[data-atlas-map]').innerHTML = '<div style="display:grid;place-items:center;min-height:320px;border-radius:14px;background:linear-gradient(180deg,#bfe6fb,#5cb5ea);color:#23655f;font-weight:800">正在打开课程地图……</div>';
    setStatus('正在读取老师已发布的' + (isConcept(course) ? '案例' : '章节') + '……');
    const ticket = (loading += 1);
    try {
      await join.backend.ensureAnonymous();
      let result = await join.backend.rpc('ck_my_map', { p_classroom: Number(me.classroom) || me.classroom });
      if (Array.isArray(result)) result = result[0];
      if (ticket !== loading) return;
      if (!result || result.status !== 'ok') {
        showJoin('请重新登录：这台设备需要先用课堂码、点名册和个人口令核对身份，才能打开课程地图。', true);
        return;
      }
      if (result.course && result.course !== course.slug) {
        course = COURSES.find((item) => item.slug === result.course) || course;
        $('[data-atlas-title]').textContent = course.title;
      }
      if (result.class_name) $('[data-atlas-who]').textContent = [me.name, me.sid, result.class_name].filter(Boolean).join(' · ');
      const published = {};
      (result.units || []).forEach((row) => { published[row.chapter] = row; });
      draw(published);
      setStatus('');
    } catch (problem) {
      console.warn('[课程地图] 没有读到：', (problem && problem.message) || problem);
      if (ticket !== loading) return;
      draw(fallback);
      setStatus(fresh ? '暂时读不到其他章节的开放情况，可以先进入本周课堂（插小红旗的地方）。' : '暂时读不到课程地图，请检查网络后刷新页面；也可以点“输入课堂码”重新登录。', true);
    }
  }

  $('[data-atlas-code]').addEventListener('click', () => showJoin('', true));
  $('[data-atlas-out]').addEventListener('click', async () => {
    const me = load();
    if (!window.confirm(`退出“${me.name || '当前同学'}”的登录？下一位同学在这台设备上登录时要输入自己的个人口令。`)) return;
    save({ code: me.code });
    try { if (join.backend.signOutStudent) await join.backend.signOutStudent(); } catch (error) { /* 忽略 */ }
    if (map) { map.destroy(); map = null; }
    join.clear();
    showJoin('已退出。请填写自己的课堂码和个人信息登录。', true);
  });
  // 前进、后退或点了表单里的“课程地图”链接：按地址里有没有 #map 切换（重复触发不要紧）
  const route = () => {
    if (location.hash === '#map') { if (view.hidden) open(); } else if (!view.hidden) showJoin('');
  };
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  window.ClassAtlas = { open };
  route();
})();
