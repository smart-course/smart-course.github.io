/* 投屏弹幕：在课堂完整版页面上滚动显示当前课堂的学生弹幕（“姓名：内容”），并循环播放。
 * 需要教师已在同一浏览器登录教师工作台（读取弹幕需教师账号）。
 * 弹幕模式：关闭 / 直接上屏（未隐藏的都显示）/ 审核后上屏（只显示已通过的）。左下角控件里可以直接切换（与工作台“弹幕”下拉框相同，ck_set_danmaku）。
 * 播放规则：新来的弹幕立即上屏；空档时按顺序循环播放本课堂可显示的弹幕（最近 60 条），被隐藏的立即撤下。
 * 清屏：撤下屏幕上现有弹幕，并让它们不再循环（本机按课堂记住，刷新页面也不会回来）；之后的新弹幕照常上屏和循环。
 *       清屏只影响投屏显示，工作台里的弹幕记录不受影响。
 * 左下角小控件：循环开关、暂停、清屏、收起。页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 * 鼠标移到一条弹幕上：这条弹幕停住，旁边出现垃圾桶；点一次变成“确认删除？”，3 秒内再点一次即从记录里彻底删除（与工作台的删除相同）。
 * 习经辩论质询的弹幕带“【正方】/【反方】”（学生端按本人的辩前投票自动加上），投屏上显示为彩色标签。
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
  .dm-item:hover .dm-del, .dm-item.is-holding .dm-del, .dm-bubble:hover .dm-del, .dm-bubble.is-holding .dm-del { display: inline-flex; }
  .dm-item .dm-del { position: absolute; top: 50%; left: 12px; margin: 0; transform: translateY(-50%); box-shadow: 0 2px 8px rgba(0,0,0,.35); white-space: nowrap; }
  .dm-bubble { position: relative; }
  .dm-bubble .dm-del { position: absolute; top: -12px; right: -6px; margin: 0; padding: 2px 8px; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
  .dm-bubble .dm-del svg { width: 15px; height: 15px; }
  .dm-side { margin-right: 6px; padding: 0 8px; border-radius: 9px; color: #fff; font-size: .78em; font-weight: 800; vertical-align: 1px; }
  .dm-side.is-pro { background: #23655f; }
  .dm-side.is-con { background: #a4492d; }
  .dm-item .dm-side.is-pro { background: #2f8a80; }
  .dm-item .dm-side.is-con { background: #c4572f; }
  .dm-bubble.is-pro { border-color: rgba(35, 101, 95, .55); background: #eef6f4; }
  .dm-bubble.is-con { border-color: rgba(164, 73, 45, .5); background: #fbefea; }
  @media print { .dm-stage, .dm-bar { display: none !important; } }
  `;
  document.head.appendChild(style);

  const stage = document.createElement('div');
  stage.className = 'dm-stage';
  stage.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('div');
  bar.className = 'dm-bar';
  bar.setAttribute('data-ix', '');
  bar.innerHTML = '<label>弹幕<select data-dm-mode disabled aria-label="弹幕模式"><option value="off">关闭</option><option value="direct">直接上屏</option><option value="review">审核后上屏</option></select></label>'
    + '<span data-dm-state>连接中</span><button type="button" data-dm-loop aria-pressed="true">循环：开</button>'
    + '<button type="button" data-dm-pause>暂停</button><button type="button" data-dm-clear title="撤下现有弹幕，且不再循环播放；之后的新弹幕照常显示">清屏</button><button type="button" data-dm-toggle>收起</button>';
  ['click', 'keydown'].forEach((type) => bar.addEventListener(type, (event) => event.stopPropagation()));
  document.body.append(stage, bar);
  const stateEl = bar.querySelector('[data-dm-state]');
  const setState = (html) => { stateEl.innerHTML = html; };
  const loopButton = bar.querySelector('[data-dm-loop]');
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
    const tag = tagOf(doc);
    if (tag) {
      name.textContent = doc.name;
      const link = document.createElement('span');
      link.className = 'dm-link';
      link.textContent = tag.link;
      if (tag.side) item.append(sideBadge(tag.side));
      item.append(name, link, document.createTextNode(`：${tag.text}`));
    } else {
      name.textContent = `${doc.name}：`;
      item.append(name, document.createTextNode(doc.text));
    }
    item.append(trashButton(doc, item));
    item.style.top = `${lane * (100 / LANES)}%`;
    item.style.setProperty('--dm-duration', `${10 + Math.min(doc.text.length + String(doc.name).length, 50) / 8}s`);
    item.style.animationDelay = `${delay}ms`;
    item.addEventListener('animationend', () => { item.remove(); flying.delete(id); });
    flying.set(id, item);
    stage.appendChild(item);
    return true;
  };

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
  function trashButton(doc, host) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dm-del';
    button.title = '删除这条弹幕（从记录里彻底删除，无法恢复）';
    button.setAttribute('aria-label', `删除 ${doc.name} 的弹幕`);
    button.innerHTML = TRASH;
    let timer = 0;
    const reset = () => {
      button.classList.remove('is-confirm');
      button.innerHTML = TRASH;
      host.classList.remove('is-holding');
    };
    ['pointerdown', 'mousedown', 'keydown'].forEach((type) => button.addEventListener(type, (event) => event.stopPropagation()));
    // 飞行弹幕可能很长、一部分在屏幕外：垃圾桶出现在鼠标进入处的右侧，保证看得见、点得到
    if (host.classList.contains('dm-item')) {
      host.addEventListener('mouseenter', (event) => {
        if (button.classList.contains('is-confirm')) return;
        const box = host.getBoundingClientRect();
        const left = Math.min(event.clientX - box.left + 14, box.width - 56, window.innerWidth - box.left - 150);
        button.style.left = `${Math.max(left, 8)}px`;
      });
    }
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
          bubble.append(who, document.createTextNode(tag.text), trashButton(doc, bubble));
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

  async function pollRoom() {
    try {
      const rooms = await backend.fetchAll('classrooms', { course: config.course });
      const unit = config.unit || (location.pathname.match(/([a-z]{2,6}\d{2})\.html$/) || [])[1];
      const next = window.ClassLive.pickRoom(rooms, config.course, unit);
      const changed = !room || !next || `${room.id}|${room.danmaku}` !== `${next.id}|${next.danmaku}`;
      room = next;
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
      // 工作台删除的弹幕：不再出现在读取结果里，从循环和屏幕上撤下
      const present = new Set(rows.map((doc) => String(doc.id)));
      Array.from(inPool).filter((id) => !present.has(id)).forEach(dropFromPool);
      rows.forEach((doc) => {
        const id = String(doc.id);
        if (cleared.has(id)) { seen.add(id); dropFromPool(id); return; }
        if (!visible(doc)) { dropFromPool(id); return; }
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
      wallRows = rows.filter((doc) => !cleared.has(String(doc.id)) && visible(doc));
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
    await pollDanmaku();
    setInterval(pollDanmaku, POLL_MS);
    setInterval(async () => {
      if (await pollRoom()) {
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
