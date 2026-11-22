/* 答题计时（按次上课的课程：学生页 fim-student.js、投屏页 fim-screen.js 共用，要排在它们前面加载）。
 *
 * 老师在投屏页的一道题（或一组题）上点“开始答题”，学生页那道题上出现倒计时。
 * 后台按自己的钟算“还剩几秒”交给页面，页面在本机倒数：各人设备的钟快慢不影响，晚几秒打开页面的同学看到的也是同一个剩余时间。
 * 这里是两页共用的部分：
 *   · 接口：正式后台（qt_* 函数，sql/cloudbase-pg-按次上课课程-答题计时.sql）和本机模拟（浏览器本机存储，规则照着后台写；
 *     测试/timer_contract.js 让同一串操作分别走两边，逐步比对）；
 *   · 计时表：把后台给的“还剩几秒”换成本机的结束时刻，按题号找这道题现在用哪一个计时；
 *   · 小工具：时间的写法、时长的选项、各题型默认给多久。
 * 题号＝作答项的编号（如 z3、c5.q2）；末尾 * 表示同一前缀的一组题（如 z* ＝这次课随堂检测的各题），写法同课程网站的“停止递交”。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FimTimer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ITEM = /^[a-z0-9][a-z0-9._-]{0,39}[*]?$/;
  const CHOICES = [30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200, 1800];     // 同 fim_build.py 的 TIMER_CHOICES
  const DEFAULT = { single: 60, judge: 45, multi: 90, num: 120, text: 300 };
  const label = (secs) => (secs < 60 ? `${secs}秒` : secs % 60 ? `${Math.floor(secs / 60)}分${secs % 60}秒` : `${secs / 60}分钟`);
  const clock = (left) => {
    const s = Math.max(0, Math.ceil(left));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  /* 一组题默认给多久：各题默认时间加起来，取不小于它的那个选项（最多 20 分钟） */
  const fit = (secs) => CHOICES.find((c) => c >= Math.min(secs, 1200)) || 1200;
  const covers = (item, key) => item === key || (item.endsWith('*') && String(key || '').startsWith(item.slice(0, -1)));
  const fail = (text, code) => Object.assign(new Error(text), code ? { code } : {});

  /* 本机模拟。store＝{read(kind) → 行的数组, write(kind, 行)}；options.clock＝现在的毫秒数；options.teacher＝是不是老师。 */
  function makeMockApi(store, options) {
    const opt = options || {};
    const now = opt.clock || (() => Date.now());
    const teacher = opt.teacher || (() => true);
    const same = (row, room, item) => String(row.classroom) === String(room) && (item === undefined || row.item === item);
    const needTeacher = () => { if (!teacher()) throw fail('只有教师账号可以操作', '42501'); };
    const dropStop = (room, item) => store.write('stops', store.read('stops').filter((s) => !same(s, room, item)));
    function state(room) {
      const all = store.read('qt_timers');
      const t = now();
      const due = all.filter((r) => same(r, room) && r.hard && !r.applied && r.started_at + (r.secs + 3) * 1000 <= t);
      if (due.length) {
        due.forEach((r) => { r.applied = true; });
        store.write('qt_timers', all);
        const stops = store.read('stops');
        due.forEach((r) => { if (!stops.some((s) => same(s, room, r.item))) stops.push({ classroom: room, item: r.item, created_at: new Date(t).toISOString() }); });
        store.write('stops', stops);
      }
      return {
        items: all.filter((r) => same(r, room) && r.started_at + r.secs * 1000 > t - 3 * 3600 * 1000)
          .sort((a, b) => a.started_at - b.started_at || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0))
          .map((r) => ({ item: r.item, secs: r.secs, hard: Boolean(r.hard), left: Math.round((r.started_at + r.secs * 1000 - t) / 100) / 10 })),
      };
    }
    return {
      async list(room) { return state(room); },
      async start(room, item, secs, hard) {
        needTeacher();
        if (!ITEM.test(String(item || ''))) throw fail('题目编号不正确');
        if (!Number.isInteger(secs) || secs < 10 || secs > 3600) throw fail('时间应在10秒到60分钟之间');
        if (!store.read('classrooms').some((c) => String(c.id) === String(room))) throw fail('课堂不存在');
        const all = store.read('qt_timers').filter((r) => !same(r, room, item));
        all.push({ classroom: room, item, started_at: now(), secs, hard: Boolean(hard), applied: false });
        store.write('qt_timers', all);
        dropStop(room, item);
        return state(room);
      },
      async adjust(room, item, delta) {
        needTeacher();
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 3600) throw fail('加减的时间不正确');
        const all = store.read('qt_timers');
        const row = all.find((r) => same(r, room, item));
        if (!row) throw fail('这道题没有在计时');
        const used = (now() - row.started_at) / 1000;
        let next;
        if (row.secs > used) next = Math.max(row.secs + delta, Math.floor(used));
        else if (delta > 0) next = Math.ceil(used) + delta;
        else return state(room);
        if (next > 7200) throw fail('计时太长了，请重新开始答题');
        const applied = row.applied;
        row.secs = next;
        row.applied = false;
        store.write('qt_timers', all);
        if (next > used && applied) dropStop(room, item);
        return state(room);
      },
      async end(room, item, clear) {
        needTeacher();
        const all = store.read('qt_timers');
        if (clear) store.write('qt_timers', all.filter((r) => !same(r, room, item)));
        else {
          const row = all.find((r) => same(r, room, item));
          if (row) { row.secs = Math.min(row.secs, Math.floor((now() - row.started_at) / 1000)); store.write('qt_timers', all); }
        }
        return state(room);
      },
    };
  }

  /* 正式后台。rpc(函数名, 参数) → Promise。 */
  function makeCloudApi(call) {
    const rpc = async (name, args) => { const res = await call(name, args); return Array.isArray(res) ? res[0] : res; };
    return {
      list: (room) => rpc('qt_list', { p_classroom: Number(room) }),
      start: (room, item, secs, hard) => rpc('qt_start', { p_classroom: Number(room), p_item: item, p_secs: Number(secs), p_hard: Boolean(hard) }),
      adjust: (room, item, delta) => rpc('qt_adjust', { p_classroom: Number(room), p_item: item, p_delta: Number(delta) }),
      end: (room, item, clear) => rpc('qt_end', { p_classroom: Number(room), p_item: item, p_clear: Boolean(clear) }),
    };
  }

  /* 浏览器里的本机模拟存储：和课程网站本机测试后台（live-core.js 的 mock）放在一处，“停止递交”就是它的那一份。 */
  function browserStore() {
    const prefix = 'classlive-mock:';
    return {
      read: (kind) => { try { return JSON.parse(localStorage.getItem(prefix + kind) || '[]'); } catch (error) { return []; } },
      write: (kind, rows) => { try { localStorage.setItem(prefix + kind, JSON.stringify(rows)); } catch (error) { /* 忽略 */ } },
    };
  }

  /* 计时表。tick＝本机的单调钟（毫秒，如 performance.now）。
   * 后台给的“还剩几秒”在路上要花一点时间，所以每次读到的结束时刻只会偏晚、不会偏早：同一次计时取读到过的最早的那个，秒数就不会来回跳。 */
  function makeBoard(tick) {
    let rows = [];
    return {
      load(state) {
        const t = tick();
        const old = rows;
        rows = ((state && state.items) || []).map((x) => {
          const row = { item: String(x.item), secs: Number(x.secs) || 0, hard: Boolean(x.hard), endAt: t + (Number(x.left) || 0) * 1000 };
          const was = old.find((r) => r.item === row.item && r.secs === row.secs && r.hard === row.hard);
          if (was && Math.abs(was.endAt - row.endAt) < 2500) row.endAt = Math.min(was.endAt, row.endAt);
          row.startAt = row.endAt - row.secs * 1000;
          return row;
        });
        return rows;
      },
      rows: () => rows.slice(),
      own: (item) => rows.find((r) => r.item === item) || null,
      /* 这道题现在用哪一个计时：盖住它的计时里，开始得最晚的那个 */
      of(key) {
        let best = null;
        rows.forEach((r) => { if (covers(r.item, key) && (!best || r.startAt > best.startAt)) best = r; });
        return best;
      },
      left: (row) => (row.endAt - tick()) / 1000,
    };
  }

  const missing = (error) => /未知的后台函数|does not exist|PGRST202|Could not find the function|could not find/i.test(String((error && error.message) || error || ''));

  /* 两页共用的样式：题目上的小钟、页面上方的计时条 */
  const CSS = `
  .fq-clock { margin-left: auto; padding: 1px 12px; border-radius: 999px; background: #1d5d58; color: #fff; font: 700 15px/1.7 "PingFang SC","Microsoft YaHei",sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fq-clock[hidden] { display: none; }
  .fq-clock.is-hot { background: #b3402b; animation: fq-clock-beat 1s ease-in-out infinite; }
  .fq-clock.is-over { background: #f7e6da; color: #8a3f22; }
  @keyframes fq-clock-beat { 50% { transform: scale(1.06); } }
  .fim-clockbar { position: fixed; top: 10px; left: 50%; z-index: 2147482500; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 20px);
    padding: 7px 10px 7px 16px; border-radius: 999px; background: rgba(29,93,88,.97); color: #fff; box-shadow: 0 10px 26px rgba(20,40,36,.3);
    font: 700 15.5px/1.5 "PingFang SC","Microsoft YaHei",sans-serif; white-space: nowrap; }
  .fim-clockbar[hidden] { display: none; }
  .fim-clockbar span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .fim-clockbar b { font-size: 21px; font-variant-numeric: tabular-nums; }
  .fim-clockbar small { font-size: 13.5px; font-weight: 600; opacity: .9; }
  .fim-clockbar button { flex: 0 0 auto; min-height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: #fff; color: #1d5d58; font: 700 14.5px/1 inherit; cursor: pointer; }
  .fim-clockbar.is-hot { background: rgba(179,64,43,.97); }
  .fim-clockbar.is-hot button { color: #b3402b; }
  .fim-clockbar.is-over { background: rgba(138,63,34,.97); }
  .fim-clockbar.is-big { padding: 10px 22px; gap: 16px; font-size: 20px; cursor: pointer; }
  .fim-clockbar.is-big b { font-size: 44px; line-height: 1.1; }
  @media (max-width: 760px) { .fim-clockbar { font-size: 14px; } .fim-clockbar b { font-size: 19px; } }
  @media print { .fim-clockbar, .fq-clock { display: none !important; } }
  `;

  /* 计时条放在页面顶上那一栏（课次页的目录、案例页的“回到第N次课”）的下面，不挡住它 */
  function place(bar) {
    const set = () => {
      const head = document.querySelector('.fim-top') || document.querySelector('.fim-bar');
      const bottom = head ? head.getBoundingClientRect().bottom : 0;
      bar.style.top = `${Math.max(10, Math.min(120, Math.round(bottom) + 8))}px`;
    };
    set();
    window.addEventListener('resize', set);
  }

  return { ITEM, CHOICES, DEFAULT, label, clock, fit, covers, makeMockApi, makeCloudApi, browserStore, makeBoard, missing, place, CSS };
});
