/* 灵田富豪榜 · 坊市成交榜（2026-11-26）
 * 用户：“在灵田里面设置一个灵田富豪榜，按照现在拥有的灵石进行排名。”“富豪榜可以做得豪华一些。”另加“坊市成交榜，放在富豪榜旁边”。
 * 入口在坊市面板右上角（economy-ui.js 的 openRich 调这里的 open）。两张榜同一个对话框、顶上两个页签：
 *   富豪榜：同一门课的道友按现在手里的灵石排名；成交榜：本周（周一起）按“和多少位不同的道友成交过”排名，再看笔数、成交额。
 * 数据来自云函数 GET /api/rich（rich-service.ts，每门课缓存 60 秒）：只有道号和数字，没有姓名、学号。
 * 前三名上领奖台（金、银、铜），第四名起列表；自己那一行标“我”，底部写自己的名次。离线单机模式没有入口。 */
(function (root) {
  'use strict';

  function create(options) {
    const engine = options.engine;
    const I = options.icon || (() => '');
    const E = options.esc || (value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const F = options.fmt || (value => Math.floor(Number(value) || 0).toLocaleString('zh-CN'));
    let data = null, error = '', loading = false, request = 0, tab = 'stones';

    const available = () => !!(engine && engine.online && typeof engine.getRich === 'function');
    const host = () => document.querySelector('[data-rich-board]');
    const clock = at => {
      try { return new Date(at).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
    };
    // 皇冠（第一名头上）：自己画的线稿，不用表情符号
    const CROWN = '<svg viewBox="0 0 48 30" aria-hidden="true" focusable="false"><path d="M4 26h40l3-18-11 8-12-14-12 14L1 8z" fill="currentColor"/><path d="M4 28.5h40" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="2.6" r="2.6" fill="currentColor"/><circle cx="1.6" cy="7" r="1.6" fill="currentColor"/><circle cx="46.4" cy="7" r="1.6" fill="currentColor"/></svg>';

    // 两张榜各自怎么写一行：主数字、小字说明
    const BOARDS = {
      stones: {
        name: '富豪榜', sub: '按现在手里的灵石排名 · 每分钟更新一次', empty: '还没有道友上榜。',
        rows: d => (d && Array.isArray(d.top) ? d.top : []), mine: d => (d ? d.me : null), total: d => (d ? d.total : 0),
        value: row => F(row.stones), unit: () => '灵石', note: () => '',
        mineText: (me, total) => '我的名次：第 ' + F(me.rank) + ' 名 · 共 ' + F(total) + ' 位道友上榜', none: '你还没有上榜：起好道号、进过灵田就会上榜。'
      },
      trades: {
        name: '成交榜', sub: '本周在坊市和多少位不同的道友成交过 · 周一重新算', empty: '这一周还没有人在坊市成交，去挂一单试试。',
        rows: d => (d && d.trades && Array.isArray(d.trades.top) ? d.trades.top : []), mine: d => (d && d.trades ? d.trades.me : null), total: d => (d && d.trades ? d.trades.total : 0),
        value: row => F(row.partners), unit: () => '位道友', note: row => F(row.count) + ' 笔 · ' + F(row.volume) + ' 灵石',
        mineText: (me, total) => '我的名次：第 ' + F(me.rank) + ' 名 · 本周和 ' + F(me.partners) + ' 位道友成交 ' + F(me.count) + ' 笔', none: '你这一周还没有在坊市成交过。'
      }
    };

    const meTag = row => (row.me ? '<em class="rich-me-tag">我</em>' : '');
    function seat(row, board) {
      const note = board.note(row);
      return '<div class="rich-seat seat-' + row.rank + (row.me ? ' is-me' : '') + '"' + (row.me ? ' aria-current="true"' : '') + ' aria-label="第 ' + row.rank + ' 名">' +
        (row.rank === 1 ? '<span class="rich-crown">' + CROWN + '</span>' : '') +
        '<span class="rich-medal" aria-hidden="true">' + row.rank + '</span>' +
        '<strong class="rich-seat-name"><span>' + E(row.alias) + '</span>' + meTag(row) + '</strong>' +
        '<span class="rich-seat-value">' + board.value(row) + '<small>' + board.unit(row) + '</small></span>' +
        (note ? '<span class="rich-seat-note">' + note + '</span>' : '') + '</div>';
    }
    function line(row, board) {
      const note = board.note(row);
      return '<li class="rich-row' + (row.me ? ' is-me' : '') + '"' + (row.me ? ' aria-current="true"' : '') + '>' +
        '<span class="rich-rank" aria-label="第 ' + row.rank + ' 名">' + row.rank + '</span>' +
        '<span class="rich-name"><span>' + E(row.alias) + '</span>' + meTag(row) + '</span>' +
        '<span class="rich-value"><b>' + board.value(row) + '<small>' + board.unit(row) + '</small></b>' + (note ? '<i>' + note + '</i>' : '') + '</span></li>';
    }

    function render() {
      const node = host();
      if (!node) return;
      const board = BOARDS[tab], rows = board.rows(data);
      node.dataset.tab = tab;
      node.querySelectorAll('[data-rich-action="tab"]').forEach(button => {
        const on = button.dataset.tab === tab;
        button.setAttribute('aria-selected', String(on));
        button.classList.toggle('is-on', on);
      });
      node.querySelector('[data-rich-sub]').textContent = board.sub;
      const podium = node.querySelector('[data-rich-podium]'), list = node.querySelector('[data-rich-list]'), mine = node.querySelector('[data-rich-me]');
      const refresh = node.querySelector('[data-rich-action="refresh"]');
      if (refresh) { refresh.disabled = loading; refresh.querySelector('span').textContent = loading ? '读取中…' : '刷新'; }
      if (!data) {
        podium.innerHTML = '<p class="rich-state"' + (error ? ' role="alert"' : '') + '>' + E(error || '正在读取榜单…') + '</p>';
        list.innerHTML = ''; list.hidden = true; mine.textContent = '';
        return;
      }
      if (!rows.length) {
        podium.innerHTML = '<p class="rich-state">' + E(board.empty) + '</p>';
        list.innerHTML = ''; list.hidden = true;
      } else {
        // 领奖台从左到右：第二名、第一名、第三名（不足三位时照人数摆）
        const top = rows.slice(0, 3), order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
        podium.innerHTML = (error ? '<p class="rich-warning" role="alert">' + E(error) + '</p>' : '') +
          '<div class="rich-seats count-' + top.length + '">' + order.map(row => seat(row, board)).join('') + '</div>';
        const rest = rows.slice(3);
        list.hidden = !rest.length;
        list.innerHTML = rest.length ? '<ol class="rich-list" start="4" aria-label="第 4 名起">' + rest.map(row => line(row, board)).join('') + '</ol>' : '';
      }
      const me = board.mine(data);
      mine.innerHTML = '<strong>' + E(me ? board.mineText(me, board.total(data)) : board.none) + '</strong>' +
        (data.at ? '<small>更新于 ' + E(clock(data.at)) + '</small>' : '');
    }

    async function load() {
      if (!available()) { error = '联网进入云间灵田后才能看榜单。'; render(); return; }
      const current = ++request;
      loading = true; render();
      try {
        const next = await engine.getRich();
        if (current !== request) return;
        if (!next || !Array.isArray(next.top)) throw new Error('bad rich');
        data = next; error = '';
      } catch (problem) {
        if (current !== request) return;
        error = problem && problem.status === 429 ? '看得太频繁了，过一会儿再点“刷新”。' : '暂时读不到榜单，请稍后点“刷新”再试。';
      } finally {
        if (current === request) { loading = false; render(); }
      }
    }

    function open(first) {
      if (!available() || typeof options.openDialog !== 'function') return false;
      tab = first === 'trades' ? 'trades' : 'stones';
      options.openDialog('rich', '灵田富豪榜',
        '<div class="rich-board" data-rich-board data-tab="' + tab + '">' +
        '<div class="rich-hero"><div class="rich-tabs" role="tablist" aria-label="榜单">' +
        '<button type="button" role="tab" data-rich-action="tab" data-tab="stones">' + I('gem') + '<span>富豪榜</span></button>' +
        '<button type="button" role="tab" data-rich-action="tab" data-tab="trades">' + I('gem') + '<span>成交榜 · 本周</span></button></div>' +
        '<p class="rich-sub" data-rich-sub></p><div class="rich-podium" data-rich-podium aria-live="polite"></div></div>' +
        '<div class="rich-list-wrap" data-rich-list hidden></div>' +
        '<div class="rich-foot"><p class="rich-mine" data-rich-me></p>' +
        '<button type="button" class="button button-secondary rich-refresh" data-rich-action="refresh">' + I('reset') + '<span>刷新</span></button></div></div>');
      render();
      void load();
      return true;
    }

    // 对话框里的点击：换页签、刷新（事件委托，只认 data-rich-action）
    document.addEventListener('click', event => {
      const target = event.target && event.target.closest ? event.target.closest('[data-rich-action]') : null;
      if (!target || !host() || !host().contains(target)) return;
      const action = target.dataset.richAction;
      if (action === 'tab') { tab = target.dataset.tab === 'trades' ? 'trades' : 'stones'; render(); }
      else if (action === 'refresh') { if (!loading) void load(); }
    });

    return { available, open, refresh: load };
  }

  root.YunjianRichBoard = { create };
})(typeof window !== 'undefined' ? window : globalThis);
