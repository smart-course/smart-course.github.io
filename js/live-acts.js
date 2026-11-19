/* 限时抢答与闯关（课堂完整版投屏页，习近平经济思想概论，2026-11-20）
 * 用户：“所有章节的‘材料归纳 · 多选’设置为随机抢答模式（学生端暂时先隐藏该题目）也就是设置一个按钮，老师按了以后，随机触发抢答模式（触发概率为99%），
 *   该模式触发的情况下，学生端会弹出一个倒计时（5秒），然后是类似于情景猜谜的页面（第五章给学生60秒的作答时间，第六章50，然后40，最后一直稳定在30），
 *   看哪些同学先回答正确，前10位同学获得5修为值。”
 *   “‘迁移任务 · 小资料分析’改成闯关游戏，学生端先隐藏题目，教师端也设置一个开放入口按钮，老师按了以后，学生端进入类似于情景揭秘的页面，每个小资料设置两道题目……
 *   你算下6个题目，大概给他们多少时间做合适（至少7分钟），要有倒计时。都回答正确的+5修为值。”
 * 页面上带 data-act 的两处各加一条控制条：
 *   · rush（材料归纳 · 多选）：“🎲 随机抢答”——99% 触发抢答（倒计时 5 秒，作答时长按章：第五章及以前 60 秒、第六章 50、第七章 40、第八章起 30），
 *     1% 不触发（题目照常开放给学生作答）；也可以直接点“不抢答，直接开放”。看板：已交、答对人数，按先后列出答对的前 10 名。
 *   · quest（迁移任务 · 小资料分析）：“🚩 开放闯关入口”，时长可选 7／8／10 分钟。估算：读三则小资料约 1.5 分钟，三道四选一约 3 分钟，
 *     三问理论匹配约 1.5 分钟，检查交卷留 1 分钟，合计 7 分钟上下；课时表里这一步是 7 分钟，所以默认 7 分钟，班上读得慢时选 8 或 10 分钟。
 *     看板：已交、三关全过人数、每一问答对人数。
 * 开局时把参考答案（页面上的 data-quiz-answer、data-tk-k）交给后台（ck_act_control），学生页读不到；判对错、名次、加修为都在后台（ck_act_answer）。
 * 需要在本机登录教师工作台，并且当前课堂就是本页章节。只在课程网站的投屏页有，离线版没有（离线版照常显示题目）。
 *
 * 机制图闯关看板（同日）。用户：“‘机制图 · 弹幕接龙’能否换一种方式，比如设置类似于闯关或者boss战的游戏，然后通过前面一个节点推出后面一个节点，
 *   形成一条链路或者闭环？让学生在闯关的过程中理解各节点之间的关系和联系？”
 *   闯关在学生页上进行（不用老师开局，不计修为）。投屏页机制图下面带 data-mech-board 的一块里放看板：在闯人数、推出链条的人数、通关人数，
 *   每个箭头有多少人答错过（答错最多的先讲），最先通关的 12 位。只写箭头编号（①→②），不写节点名称——大屏上的机制图这时还遮着。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!window.ClassLive || config.provider === 'off') return;
  const boxes = Array.from(document.querySelectorAll('[data-act]'));
  const mechs = Array.from(document.querySelectorAll('[data-mech-board]'));
  if (!boxes.length && !mechs.length) return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[抢答与闯关]', error.message); return; }
  const unit = config.unit || window.ClassLive.unitOf();
  const chapter = Number((String(unit).match(/(\d+)$/) || [])[1]) || 0;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RUSH = { chance: 0.99, delay: 5, top: 10, points: 5, secs: chapter <= 5 ? 60 : chapter === 6 ? 50 : chapter === 7 ? 40 : 30 };
  const QUEST = { delay: 5, minutes: [7, 8, 10], pick: 7, points: 5 };
  const clock = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const rpcOne = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
  const roomFor = async (no) => {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const room = window.ClassLive.pickRoom(rooms, config.course, unit);
    if (!room || room.chapter !== unit) return null;
    if (room.case_no && Number(room.case_no) !== Number(no)) return null;
    return room;
  };

  const style = document.createElement('style');
  style.dataset.readable = 'panel';
  style.textContent = `
  .act-ctl { margin: 14px 0; padding: 14px 16px; border: 2px solid #c9a24a; border-radius: 14px; background: linear-gradient(135deg, #fffaf0, #fdf1d8); color: #3b2a07;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .act-ctl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
  .act-ctl button { padding: 9px 16px; border: 1.5px solid rgba(70, 51, 34, .28); border-radius: 10px; background: #fff; color: #3b2a07; font: inherit; font-weight: 800; line-height: 1.2; cursor: pointer; }
  .act-ctl button.is-main { border-color: #b5701e; background: linear-gradient(180deg, #f6c765, #dd9a2c); color: #3b2400; font-size: 18px; padding: 11px 22px; box-shadow: 0 4px 12px rgba(181, 112, 30, .28); }
  .act-ctl button.is-warn { border-color: #a4492d; color: #a4492d; }
  .act-ctl button:disabled { opacity: .5; cursor: default; }
  .act-ctl button[hidden], .act-ctl select[hidden] { display: none; }
  .act-ctl select { padding: 8px 10px; border: 1.5px solid rgba(70, 51, 34, .28); border-radius: 10px; background: #fff; font: inherit; }
  .act-state { flex: 1 1 220px; min-width: 0; font-weight: 700; }
  .act-clock { flex: 0 0 auto; min-width: 92px; padding: 2px 14px; border-radius: 12px; background: #3b2a07; color: #ffe9b3; font: 800 30px/1.3 -apple-system, "PingFang SC", sans-serif; font-variant-numeric: tabular-nums; text-align: center; }
  .act-clock.is-low { background: #a4492d; color: #fff; }
  .act-clock[hidden] { display: none; }
  .act-note { margin: 8px 0 0; color: #6b5a40; font-size: 14.5px; }
  .act-board { margin: 12px 0 0; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, .85); border: 1px solid #ead9bb; }
  .act-board[hidden] { display: none; }
  .act-board h5 { margin: 0 0 8px; font-size: 16px; }
  .act-board h5 b { margin: 0 4px; font-size: 22px; color: #23655f; font-variant-numeric: tabular-nums; }
  .act-rank { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 10px; margin: 0; padding: 0; list-style: none; }
  .act-rank li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: #f3f8f4; border: 1px solid #c5ddce; font-weight: 700; }
  .act-rank li i { flex: 0 0 auto; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #23655f; color: #fff; font-style: normal; font-size: 14px; }
  .act-rank li.is-out { background: #f6f2ea; border-color: #e2d6c2; font-weight: 500; }
  .act-rank li.is-out i { background: #b8ab95; }
  .act-rank li span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act-rank li em { flex: 0 0 auto; font-style: normal; color: #7a6040; font-size: 13.5px; }
  .act-items { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 14.5px; }
  .act-items li { padding: 2px 10px; border-radius: 999px; background: #f1ebdb; }
  .act-items li.is-worst { background: #f6d9cd; color: #7a2c14; font-weight: 800; }
  /* 机制图闯关看板 */
  .mq-board { margin: 12px 0 0; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, .88); border: 1px solid #ead9bb; color: #3b2a07;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .mq-board[hidden] { display: none; }
  .mq-board h5 { margin: 0 0 8px; font-size: 16px; }
  .mq-board h5 b { margin: 0 4px; font-size: 22px; color: #23655f; font-variant-numeric: tabular-nums; }
  .mqb-bars { display: grid; gap: 6px; margin: 0 0 4px; }
  .mqb-bars > div { display: grid; grid-template-columns: 92px minmax(0, 1fr) 44px; align-items: center; gap: 10px; font-weight: 700; }
  .mqb-bars em { display: block; height: 14px; border-radius: 7px; background: #efe6d3; overflow: hidden; }
  .mqb-bars em i { display: block; height: 100%; border-radius: 7px; background: #23655f; transition: width .5s ease; }
  .mqb-bars > div.is-boss em i { background: #a4492d; }
  .mqb-bars b { font-variant-numeric: tabular-nums; text-align: right; }
  /* 开局以前大屏上也先不显示题目（学生页是收起的，大屏提前露出来就不公平了）；老师可以点“先看一眼题目” */
  .act-veil > .quiz-item, .act-veil .tk-items, .act-veil .tk-legend { display: none !important; }
  @media print { .act-ctl, .mq-board { display: none !important; } .act-veil > .quiz-item, .act-veil .tk-items, .act-veil .tk-legend { display: revert !important; } }
  `;
  document.head.appendChild(style);

  // ---------- 机制图闯关看板 ----------
  mechs.forEach((box) => {
    const no = box.dataset.case;
    const el = box.querySelector('[data-mq-board]');
    let links = [];
    try { links = JSON.parse(box.dataset.links || '[]'); } catch (error) { links = []; }
    if (!el || !/^\d{2}$/.test(no || '')) return;
    let room = null;
    let off = false;       // 后台还没有这个功能：不再问
    let seen = true;       // 这一块在屏幕附近才刷新
    let last = '';
    const span = (ms) => { const sec = Math.max(1, Math.round((Number(ms) || 0) / 1000)); return sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`; };
    const paint = (b) => {
      const sig = JSON.stringify(b);
      if (sig === last) return;
      last = sig;
      el.hidden = false;
      if (!b.players) {
        el.innerHTML = '<h5>闯关看板</h5><p class="act-note">还没有同学开始闯关：请同学们在自己页面的机制图下面点“开始闯关”。</p>';
        return;
      }
      const miss = b.miss || {};
      const worst = links.map((tag) => ({ tag, n: Number(miss[tag]) || 0 })).sort((x, y) => y.n - x.n)[0];
      const width = (n) => Math.round(100 * n / b.players);
      el.innerHTML = `<h5>闯关看板 · 在闯<b>${b.players}</b>人 · 推出链条<b>${b.chain}</b>人 · 通关<b>${b.cleared}</b>人</h5>
        <div class="mqb-bars"><div><span>推出链条</span><em><i style="width:${width(b.chain)}%"></i></em><b>${b.chain}</b></div>
          <div class="is-boss"><span>打败 Boss</span><em><i style="width:${width(b.cleared)}%"></i></em><b>${b.cleared}</b></div></div>
        <ul class="act-items"><li>推链条：${Number(miss.next) || 0} 人选错过</li>${links.map((tag) => `<li${worst && worst.n > 0 && worst.tag === tag ? ' class="is-worst"' : ''}>Boss 战 ${esc(tag)}：${Number(miss[tag]) || 0} 人答错过</li>`).join('')}</ul>
        ${worst && worst.n > 0 ? `<p class="act-note">答错的人最多的是 ${esc(worst.tag)}：逐步揭晓时先把这一步讲透。</p>` : ''}
        ${b.list && b.list.length ? `<ol class="act-rank" style="margin-top:10px">${b.list.map((row, i) => `<li><i>${i + 1}</i><span>${esc(row.name)}</span><em>${span(row.ms)}${row.miss ? ` · 错 ${row.miss} 次` : ' · 全对'}</em></li>`).join('')}</ol>` : ''}`;
    };
    const refresh = async () => {
      if (!room || off) return;
      try {
        const res = await rpcOne('ck_mech_board', { p_classroom: Number(room.id) || room.id, p_case: no });
        if (res.status === 'ok') paint(res);
      } catch (error) {
        if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((error && error.message) || error))) off = true;
      }
    };
    if ('IntersectionObserver' in window) {
      seen = false;
      new IntersectionObserver((entries) => { seen = entries.some((entry) => entry.isIntersecting); if (seen) refresh(); }, { rootMargin: '400px 0px' }).observe(box);
    }
    setInterval(() => { if (!document.hidden && seen) refresh(); }, 3000);
    (async () => {
      try { room = await roomFor(no); } catch (error) { room = null; }
      refresh();
      if (!room) setInterval(async () => { if (room || document.hidden) return; try { room = await roomFor(no); } catch (error) { room = null; } if (room) refresh(); }, 20000);
    })();
  });

  boxes.forEach((box) => {
    const kind = box.dataset.act === 'quest' ? 'quest' : 'rush';
    const no = box.dataset.actCase;
    const answer = {};
    if (kind === 'rush') {
      const item = box.querySelector('[data-quiz-key$=":digest"]');
      if (!item) return;
      answer.digest = item.dataset.quizAnswer || '';
    } else {
      Array.from(box.querySelectorAll('.tk-item')).forEach((li) => {
        const item = li.querySelector('[data-quiz-key]');
        if (!item) return;
        const id = item.dataset.quizKey.split(':')[1];
        answer[id] = item.dataset.quizAnswer || '';
        answer[`${id}k`] = li.dataset.tkK || '';
      });
    }
    if (!Object.keys(answer).length || Object.values(answer).some((v) => !v)) return;
    const ctl = document.createElement('div');
    ctl.className = 'act-ctl';
    ctl.setAttribute('data-ix', '');
    ctl.innerHTML = `<div class="act-ctl-row">
        <button type="button" class="is-main" data-act-go>${kind === 'rush' ? '🎲 随机抢答' : '🚩 开放闯关入口'}</button>
        ${kind === 'quest' ? `<select data-act-mins aria-label="闯关时长">${QUEST.minutes.map((m) => `<option value="${m}"${m === QUEST.pick ? ' selected' : ''}>${m} 分钟</option>`).join('')}</select>` : ''}
        <button type="button" data-act-plain>${kind === 'rush' ? '不抢答，直接开放这道题' : '不闯关，直接开放题目'}</button>
        <button type="button" data-act-peek aria-pressed="false">先看一眼题目</button>
        <span class="act-clock" data-act-clock hidden></span>
        <span class="act-state" data-act-state>正在连接课堂……</span>
        <button type="button" data-act-extend hidden>${kind === 'rush' ? '+10 秒' : '+1 分钟'}</button>
        <button type="button" class="is-warn" data-act-stop hidden>${kind === 'rush' ? '结束抢答' : '结束闯关'}</button>
      </div>
      <p class="act-note">${kind === 'rush'
        ? `学生页先不显示这道题。点“随机抢答”：${Math.round(RUSH.chance * 100)}% 的概率触发抢答——学生页弹出 ${RUSH.delay} 秒倒计时，随后限时 ${RUSH.secs} 秒作答，每人只能交一次，前 ${RUSH.top} 位答对的同学各加 ${RUSH.points} 修为；没有触发时题目照常开放。抢答结束后再点下面的“核对”讲评。`
        : `学生页先不显示这三道题。点“开放闯关入口”：学生页弹出 ${QUEST.delay} 秒倒计时，随后三则小资料一关一关作答——每关两问（先选讲对了的分析，再判断它对应哪个理论要点），两问都对才算过关；限时内只能交一次，三关全过加 ${QUEST.points} 修为。交卷后学生页显示题目和解答。`}</p>
      <div class="act-board" data-act-board hidden></div>`;
    const head = box.querySelector('.interaction-heading') || box.querySelector('.tk-intro') || box.firstElementChild;
    head.insertAdjacentElement('afterend', ctl);
    ['click', 'keydown', 'keyup'].forEach((type) => ctl.addEventListener(type, (event) => event.stopPropagation()));
    const ui = { go: ctl.querySelector('[data-act-go]'), plain: ctl.querySelector('[data-act-plain]'), mins: ctl.querySelector('[data-act-mins]'), clock: ctl.querySelector('[data-act-clock]'),
      peek: ctl.querySelector('[data-act-peek]'), state: ctl.querySelector('[data-act-state]'), extend: ctl.querySelector('[data-act-extend]'), stop: ctl.querySelector('[data-act-stop]'), board: ctl.querySelector('[data-act-board]') };
    let room = null;
    let game = null;       // 后台这一局的状态
    let board = null;
    let offset = 0;        // 后台时钟 − 本机时钟
    let note = '';         // 没有触发抢答等一次性的说明
    let busy = false;
    let peek = false;      // 老师点了“先看一眼题目”
    const now = () => Date.now() + offset;
    const phase = () => (!game ? 'none' : game.mode === 'plain' ? 'plain' : game.closed ? 'over' : now() < game.go_at ? 'count' : now() <= game.go_at + game.secs * 1000 ? 'open' : 'over');
    const control = (action, extra = {}) => rpcOne('ck_act_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_kind: kind, p_action: action,
      p_mode: extra.mode || null, p_answer: extra.answer || null, p_secs: extra.secs == null ? null : extra.secs, p_delay: extra.delay == null ? null : extra.delay });
    const adopt = (res, t0) => {
      if (res && res.game) { game = res.game; if (res.game.now && t0) offset = Number(res.game.now) - (t0 + Date.now()) / 2; }
      else if (res && res.status === 'none') game = null;
    };
    function paint() {
      const p = phase();
      const running = p === 'count' || p === 'open';
      ui.go.disabled = busy || !room || running;
      ui.plain.disabled = busy || !room || running;
      ui.plain.hidden = p === 'plain';
      if (ui.mins) ui.mins.disabled = busy || running;
      ui.extend.hidden = !(p === 'open' || p === 'over');
      ui.stop.hidden = !running;
      ui.go.textContent = p === 'none' || p === 'plain' ? (kind === 'rush' ? '🎲 随机抢答' : '🚩 开放闯关入口') : (kind === 'rush' ? '🎲 再来一次（没交的同学）' : '🚩 重新开放（没交的同学）');
      ui.clock.hidden = !running;
      const veil = (p === 'none' || p === 'count') && !peek;
      box.classList.toggle('act-veil', veil);
      ui.peek.hidden = !(p === 'none' || p === 'count');
      ui.peek.textContent = peek ? '收起题目' : '先看一眼题目';
      ui.peek.setAttribute('aria-pressed', String(peek));
      if (p === 'count') { ui.clock.textContent = String(Math.max(1, Math.ceil((game.go_at - now()) / 1000))); ui.clock.classList.remove('is-low'); }
      if (p === 'open') { const left = Math.max(0, Math.ceil((game.go_at + game.secs * 1000 - now()) / 1000)); ui.clock.textContent = clock(left); ui.clock.classList.toggle('is-low', left <= 10); }
      const total = board ? board.total : 0;
      const right = board ? board.right : 0;
      ui.state.textContent = !room ? '当前课堂不是本章（或没有登录教师工作台）：先在工作台发布本章课堂，再刷新本页。'
        : note && (p === 'none' || p === 'plain') ? note
        : p === 'none' ? (kind === 'rush' ? '还没开始：学生页上这道题是收起的。' : '还没开放：学生页上这三道题是收起的。')
        : p === 'plain' ? '这道题已经照常开放给学生作答（不抢答、不闯关），下面的“学生实时结果”照常显示。'
        : p === 'count' ? (kind === 'rush' ? '抢答触发！学生页正在倒计时……' : '闯关入口已开放，学生页正在倒计时……')
        : p === 'open' ? `作答中 · 已交 ${total} 人 · ${kind === 'rush' ? '答对' : '三关全过'} ${right} 人`
        : `已结束 · 共交 ${total} 人 · ${kind === 'rush' ? '答对' : '三关全过'} ${right} 人${kind === 'rush' ? '。请点下面的“核对”讲评。' : '。交了卷的同学已经在自己页面上看到题目和解答。'}`;
      paintBoard(p);
    }
    function paintBoard(p) {
      if (!board || p === 'none' || p === 'plain') { ui.board.hidden = true; return; }
      ui.board.hidden = false;
      const secs = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} 秒`;
      if (kind === 'rush') {
        const winners = board.list.filter((row) => row.ok).sort((x, y) => x.place - y.place);
        ui.board.innerHTML = `<h5>已交<b>${board.total}</b>人 · 答对<b>${board.right}</b>人 · 前 ${RUSH.top} 名各加 ${RUSH.points} 修为</h5>`
          + (winners.length ? `<ol class="act-rank">${winners.slice(0, 20).map((row) => `<li class="${row.bonus > 0 ? '' : 'is-out'}"><i>${row.place}</i><span>${esc(row.name)}</span><em>${secs(row.ms)}${row.bonus > 0 ? ` · +${row.bonus}` : ''}</em></li>`).join('')}</ol>`
            : '<p class="act-note">还没有同学答对。</p>');
      } else {
        const ids = Object.keys(board.items || {}).sort();
        const label = (id) => { const m = /^tk-(\d+)(k?)$/.exec(id); return m ? `第 ${m[1]} 关${m[2] ? '第二问' : '第一问'}` : id; };
        const passed = board.list.filter((row) => row.ok);
        ui.board.innerHTML = `<h5>已交<b>${board.total}</b>人 · 三关全过<b>${board.right}</b>人（各加 ${QUEST.points} 修为）</h5>`
          + (ids.length ? `<ul class="act-items">${ids.map((id) => `<li>${esc(label(id))}：答对 ${board.items[id]} 人</li>`).join('')}</ul>` : '')
          + (passed.length ? `<ol class="act-rank" style="margin-top:10px">${passed.slice(0, 30).map((row, i) => `<li><i>${i + 1}</i><span>${esc(row.name)}</span><em>${secs(row.ms)}</em></li>`).join('')}</ol>` : '');
      }
    }
    async function refresh() {
      if (!room) return;
      const t0 = Date.now();
      try {
        const res = await rpcOne('ck_act_board', { p_classroom: Number(room.id) || room.id, p_case: no, p_kind: kind });
        if (res.status === 'ok') { adopt(res, t0); board = res; } else { game = null; board = null; if (res.now) offset = Number(res.now) - (t0 + Date.now()) / 2; }
      } catch (error) {
        if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((error && error.message) || error))) {
          note = '后台还没有抢答／闯关功能：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261120-抢答与闯关.sql。在这之前学生页照常显示题目。';
          ui.go.disabled = true; ui.plain.disabled = true;
        }
      }
      paint();
    }
    async function act(run) {
      if (busy || !room) return;
      busy = true; paint();
      try { const t0 = Date.now(); adopt(await run(), t0); } catch (error) { note = `没有成功：${(error && error.message) || error}`; }
      busy = false;
      await refresh();
    }
    ui.go.addEventListener('click', () => {
      note = '';
      if (kind === 'rush') {
        if (Math.random() < RUSH.chance) act(() => control('start', { mode: 'game', answer, secs: RUSH.secs, delay: RUSH.delay }));
        else { note = `这一次没有触发抢答（${Math.round((1 - RUSH.chance) * 100)}% 的概率）：题目已经照常开放给学生作答。`; act(() => control('start', { mode: 'plain', secs: 0, delay: 0 })); }
      } else {
        act(() => control('start', { mode: 'game', answer, secs: Number(ui.mins.value) * 60, delay: QUEST.delay }));
      }
    });
    ui.plain.addEventListener('click', () => { note = ''; act(() => control('start', { mode: 'plain', secs: 0, delay: 0 })); });
    ui.peek.addEventListener('click', () => { peek = !peek; paint(); });
    ui.extend.addEventListener('click', () => act(() => control('extend', { secs: kind === 'rush' ? 10 : 60 })));
    ui.stop.addEventListener('click', () => act(() => control('stop')));
    setInterval(paint, 250);
    setInterval(() => { if (!document.hidden && room && game && game.mode === 'game') refresh(); }, 2000);
    (async () => {
      try { room = await roomFor(no); } catch (error) { room = null; }
      await refresh();
      // 课堂稍后才发布时：每 20 秒再找一次
      if (!room) setInterval(async () => { if (room || document.hidden) return; try { room = await roomFor(no); } catch (error) { room = null; } if (room) refresh(); }, 20000);
    })();
  });
})();
