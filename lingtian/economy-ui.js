/* Alchemy and shared, student-priced trading. No fabricated market activity. */
(function () {
  'use strict';

  const SOURCES = [
    ['上海证券交易所 · 交易规则（2026 年修订）', 'https://www.sse.com.cn/lawandrules/sselawsrules2025/trade/universal/c/c_20260424_10816492.shtml'],
    ['Investor.gov · 限价单与订单类型', 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14'],
    ['Investor.gov · 买价与卖价', 'https://www.investor.gov/introduction-investing/investing-basics/glossary/ask-price'],
    ['Investor.gov · 流动性', 'https://www.investor.gov/introduction-investing/investing-basics/glossary/liquidity-or-marketability'],
    ['《资本论》第一卷第一章 · 商品', 'https://www.marxists.org/chinese/marx/capital/01.htm'],
    ['《资本论》第三卷第十章 · 市场价值与市场价格', 'https://www.marxists.org/chinese/marx-engels2/07/10.htm']
  ];
  const LESSONS = {
    empty: ['开市第一课 · 报价与成交', '这里还没有成交。你可以自主报价；只有买卖双方实际达成交易，才会产生最新成交价。挂出的价格不等于已经形成的市场价。'],
    listed: ['限价单 · 报价是一份交易意愿', '订单已进入队列。卖方的报价是愿意接受的最低价格，买方的报价是愿意支付的最高价格。没有合适的对手方时，订单会等待，最新成交价不会因此改变。'],
    priority: ['撮合 · 价格优先，同价按先后', '买价越高、卖价越低，越优先成交；同一价格按服务器受理时间排队。新订单与已有订单相遇时，采用已有对手方订单的价格，并不取两者平均。'],
    partial: ['部分成交 · 余单继续等待', '一张订单可以分几次成交。例如挂出 5 颗、成交 2 颗，剩下 3 颗继续排队；你可以撤回余下 3 颗，已经成交的部分不会被撤销。'],
    cancelled: ['撤单 · 只取回未成交的资产', '未成交余单已申请撤回，返还以服务器结果为准。已经成交的部分属于完成的交易，不能通过撤单取回。订单到期也只退回未成交部分。'],
    spread: ['价差与流动性 · 上一笔不保证下一笔', '最高买价与最低卖价之间的距离叫价差。上一笔成交价只是历史记录；此刻能否按该价成交，还要看对手方报价和可成交数量。'],
    use: ['使用价值 · 效果不等于价格', '服用丹药提升修为，体现它在游戏中的使用价值；交易则形成交换关系。修为效果增加一倍，并不意味着成交价格一定增加一倍。'],
    production: ['供求与生产 · 多炼一炉前想一想', '更多同类丹药进入市场会增加供给，能否卖出还取决于有支付能力的需求。炼制倒计时是生产周期，不是劳动时间；材料支出也不能直接等同于马克思所说的商品价值。']
  };

  function create(options) {
    const engine = options.engine;
    const E = options.esc || (value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
    const I = options.icon || (() => '');
    const F = options.fmt || (value => Math.floor(Number(value) || 0).toLocaleString('zh-CN'));
    const duration = options.durationLabel || (ms => Math.ceil(ms / 60000) + ' 分钟');
    const clock = options.clockTime || (ms => Math.max(0, Math.ceil(ms / 1000)) + ' 秒');
    const definitions = window.SpiritGame;
    const pills = definitions.PILLS || [];
    const crops = definitions.CROPS || [];
    const realms = definitions.REALMS || [];
    const pillMap = Object.fromEntries(pills.map(p => [p.id, p]));
    const cropMap = Object.fromEntries(crops.map(c => [c.id, c]));
    const items = pills.map(p => Object.assign({key:'pill:' + p.id, type:'pill', unit:'颗'}, p))
      .concat(crops.map(c => Object.assign({key:'herb:' + c.id, type:'herb', unit:'份'}, c)));
    const itemMap = Object.fromEntries(items.map(item => [item.key, item]));
    const marketCategories = [['herb','灵植'], ['pill','丹药'], ['cards','道藏']];
    const selectedItems = {herb:items.find(item => item.type === 'herb')?.key, pill:items.find(item => item.type === 'pill')?.key};
    const marketDrafts = {herb:{side:'sell',price:'',quantity:'1'}, pill:{side:'sell',price:'',quantity:'1'}};
    const timeFormatter = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
    let selectedPill = pills[0] && pills[0].id;
    let marketCategory = 'herb';
    let selectedItem = selectedItems.herb;
    let cardMarketUI = null, cardMarketSlot = null, cardMarketClosing = false, mainCardsActive = false;
    let alchemySignature = '';
    let brewConfirmation = null;
    let marketConfirmation = null;
    let cancelConfirmation = null;
    let actionBusy = '';
    let marketData = null;
    let marketError = '';
    let marketLoading = false;
    let lastMarketLoad = 0;
    let marketRequest = 0;
    let serverOffset = 0;
    let marketInterval = '1h', marketSelectedTime = null, chartSignature = '', chartHost = null, chartDispose = null;
    let lesson = 'empty';
    let draft = marketDrafts.herb;

    const content = () => document.getElementById('dialog-content');
    const root = kind => content() && content().querySelector('[data-econ-screen="' + kind + '"]');
    const visible = kind => {
      const dialog = document.getElementById('game-dialog');
      return !!(dialog && dialog.open && dialog.dataset.kind === kind && root(kind));
    };
    const categoryBusy = () => !!(actionBusy || cardMarketUI?.isBusy?.());
    const isCardsMarketVisible = () => !!(visible('market') && marketCategory === 'cards' && cardMarketSlot && !cardMarketSlot.hidden && root('market')?.contains(cardMarketSlot));
    function syncCardActivity(mainCardsOpen = false) {
      mainCardsActive = !!mainCardsOpen;
      const active = mainCardsActive || isCardsMarketVisible();
      engine.setCardsActive?.(active);
      return active;
    }
    const state = () => engine.state;
    const owned = item => Number((item.type === 'pill' ? state().pills : state().bag)?.[item.id] || 0);
    const realmName = index => realms[index] ? realms[index].name : '未知境界';
    const priceText = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('zh-CN', {maximumFractionDigits:2});
    const timestamp = value => typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : new Date(value).getTime();
    const dateText = value => {
      const date = new Date(timestamp(value));
      return Number.isFinite(date.getTime()) ? timeFormatter.format(date) : '—';
    };
    const attr = (key, value) => ' data-' + key + '="' + E(value) + '"';
    const button = (action, label, extra, disabled, secondary) =>
      '<button type="button" class="button ' + (secondary ? 'button-secondary' : 'button-primary') + '" data-econ-action="' + action + '"' +
      (extra || '') + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    const note = (message, tone) => '<div class="econ-note' + (tone ? ' econ-note-' + tone : '') + '">' + message + '</div>';
    const pillArt = (pill, small) => '<span class="econ-pill-art' + (small ? ' is-small' : '') + '" data-grade="' + Math.min(4, pill.minRealm) + '" aria-hidden="true">' + (window.spiritPillArt ? window.spiritPillArt(pill.id, {size:small ? 64 : 120,className:'pill-portrait-image'}) : '<i></i><b>丹</b>') + '</span>';
    const plantArt = id => typeof window.spiritPlantArt === 'function'
      ? window.spiritPlantArt(id, 70, 'mature')
      : '<span class="econ-herb-glyph" aria-hidden="true">' + I('leaf') + '</span>';
    const modeLine = () => engine.online
      ? '<span class="econ-mode"><i></i>云端修行 · ' + E(engine.player?.alias || '修士') + '</span>'
      : '<span class="econ-mode is-local">离线练习 · 独立进度</span>';

    function alchemyInfo() {
      return engine.getAlchemyInfo();
    }

    function brewProblem(pill, info) {
      if (info.brew) return '丹炉正在使用，请先领取上一炉';
      if (state().realm < pill.minRealm) return realmName(pill.minRealm) + '境界解锁';
      if (Object.entries(pill.ingredients).some(([id, qty]) => (state().bag[id] || 0) < qty)) return '材料尚未集齐';
      if (state().stones < pill.cost) return '灵石不足，还差 ' + F(pill.cost - state().stones);
      return '';
    }

    function furnaceMarkup(info) {
      const brew = info.brew;
      if (!brew) return '<section class="econ-furnace"><div class="econ-furnace-emblem">' + I('fire') +
        '</div><div><span class="econ-kicker">一炉一丹 · 离线计时</span><h3>丹炉静候灵草</h3><p>选好丹方，按配比投入灵草与炉费。</p></div><span class="econ-status">空闲</span></section>';
      const pill = pillMap[brew.pillId];
      const total = pill?.brewTime || Math.max(1, brew.readyAt - brew.startedAt);
      return '<section class="econ-furnace' + (brew.ready ? ' is-ready' : '') + '"><div class="econ-furnace-emblem">' + I(brew.ready ? 'spark' : 'fire') +
        '</div><div class="econ-furnace-copy"><span class="econ-kicker">' + (brew.ready ? '炉火已足 · 可收入行囊' : '灵火温养 · 一炉产出 1 颗') +
        '</span><h3>' + E(brew.name) + '</h3><p>' + (brew.ready ? '领取后可服用或到坊市交易。' : '预计 ' + E(dateText(brew.readyAt)) + ' 炼成（北京时间）') +
        '</p><progress data-econ-brew-progress max="' + total + '" value="' + Math.max(0, total - brew.remainingMs) + '" aria-label="炼丹进度"></progress></div><div class="econ-furnace-action">' +
        (brew.ready ? button('claim-brew', I('bag') + '领取成丹', '', !!actionBusy) :
          '<span class="econ-countdown" data-econ-brew-countdown>' + E(clock(brew.remainingMs)) + '</span><small>距离成丹</small>') + '</div></section>';
    }

    function recipeMarkup(pill, info) {
      if (!pill) return note('丹方尚未加载，请刷新后重试。');
      const ingredients = Object.entries(pill.ingredients);
      const total = ingredients.reduce((sum, entry) => sum + entry[1], 0);
      const problem = brewProblem(pill, info);
      const rows = ingredients.map(([id, qty]) => {
        const crop = cropMap[id];
        const have = Number(state().bag[id] || 0);
        return '<div class="econ-ingredient' + (have < qty ? ' is-missing' : '') + '"><span class="econ-ingredient-art">' + plantArt(id) +
          '</span><div><strong>' + E(crop?.name || id) + '</strong><small>需 ' + F(qty) + ' 份 · 行囊 ' + F(have) +
          '</small></div><span class="econ-ingredient-status">' + (have < qty ? '差 ' + F(qty - have) + ' 份' : I('check') + '已备齐') + '</span></div>';
      }).join('');
      const confirmation = brewConfirmation === pill.id && !problem
        ? '<div class="econ-confirm" role="status"><strong>确认开炉 · ' + E(pill.name) + '</strong><p>立即投入 ' + F(total) + ' 份灵草和 ' + F(pill.cost) +
          ' 灵石；炼制 ' + E(duration(pill.brewTime)) + '，产出 1 颗。开炉后不可撤回材料。</p><div class="econ-actions">' +
          button('confirm-brew', '投入材料，开始炼制', attr('pill', pill.id), !!actionBusy) +
          button('dismiss-brew', '再想想', '', !!actionBusy, true) + '</div></div>'
        : '<div class="econ-recipe-bottom"><span>' + (problem ? E(problem) : '材料齐备，可炼制 1 颗') + '</span>' +
          button('prepare-brew', I('fire') + '开炉炼制', attr('pill', pill.id), !!problem || !!actionBusy) + '</div>';
      return '<section id="econ-recipe-panel" class="econ-recipe" role="tabpanel" aria-labelledby="econ-recipe-tab-' + E(pill.id) + '"><div class="econ-recipe-heading">' + pillArt(pill) +
        '<div><span class="econ-kicker">' + E(realmName(pill.minRealm)) + '可炼 · 每炉一颗</span><h3 id="econ-recipe-title">' + E(pill.name) +
        '</h3><p>服用可得 <strong>+' + F(pill.qi) + '</strong> 修为</p></div><span class="econ-recipe-rank">' + (pills.indexOf(pill) + 1) + ' / 8</span></div>' +
        (pill.qi === 30 ? note('<strong>化神珍丹</strong> · 五种灵草，共 95 份；温养整整 24 小时。服用一颗即用完当日 30 点服丹修为额度。', 'gold') : '') +
        '<div class="econ-ingredients">' + rows + '</div><div class="econ-ratio"><span>配比</span><strong>' + ingredients.map(entry => entry[1]).join(' : ') +
        '</strong><small>按上方灵草顺序 · 共 ' + F(total) + ' 份</small></div><div class="econ-recipe-facts"><span>' + I('clock') + E(duration(pill.brewTime)) +
        '</span><span>' + I('gem') + F(pill.cost) + ' 灵石炉费</span><span>现有 ' + F(state().stones) + ' 灵石</span></div>' + confirmation + '</section>';
    }

    function pillBagMarkup(info) {
      return '<section class="econ-pill-bag"><div class="econ-section-heading"><h3>' + I('bag') + '丹药行囊</h3><span>服用后才增加修为</span></div>' +
        '<div class="econ-pill-list">' + pills.map(pill => {
          const count = Number(state().pills?.[pill.id] || 0);
          const reason = !count ? '尚无丹药' : info.pillsLeft < 1 ? '今日颗数已用完' : info.qiLeft < pill.qi ? '今日修为额度不足' : '';
          return '<div class="econ-pill-row">' + pillArt(pill, true) + '<div class="econ-pill-copy"><strong>' + E(pill.name) + '</strong><span>行囊 ' + F(count) +
            ' 颗 · 每颗 +' + F(pill.qi) + ' 修为</span></div><div class="econ-pill-actions">' +
            button('consume-pill', reason || '服用 1 颗 · +' + pill.qi, attr('pill', pill.id), !!reason || !!actionBusy, true) +
            button('sell-item', '挂单', attr('item', 'pill:' + pill.id), !!actionBusy, true) + '</div></div>';
        }).join('') + '</div><p class="econ-fineprint">所有丹药合计每天最多服用 3 颗，且增加修为不超过 30。北京时间每日 00:00 重置，剩余额度不累积。今日修为额度不足以容纳整颗丹药时，不会消耗该丹药。</p></section>';
    }

    function alchemyMarkup(info) {
      const limits = info.limits || {pillsTaken:3, pillQi:30};
      return '<div class="econ-shell" data-econ-screen="alchemy"><div class="econ-topline">' + modeLine() +
        '</div><p class="econ-intro">灵草入炉，凝为修行之助。按丹方配比炼制，留一颗自用，也可把余丹带到坊市。</p>' +
        '<div class="econ-quota-grid"><div class="econ-quota"><span>今日还可服用</span><strong>' + F(info.pillsLeft) + '<small> / ' + F(limits.pillsTaken) +
        ' 颗</small></strong></div><div class="econ-quota"><span>今日服丹修为剩余</span><strong>' + F(info.qiLeft) + '<small> / ' + F(limits.pillQi) +
        '</small></strong></div></div>' + furnaceMarkup(info) +
        '<div class="econ-section-heading"><h3>' + I('book') + '八品丹方</h3><span>选择丹方查看配比</span></div><div class="econ-recipe-tabs" role="tablist" aria-label="丹药配方">' +
        pills.map(pill => '<button type="button" role="tab" class="econ-recipe-tab' + (selectedPill === pill.id ? ' is-selected' : '') +
          '" id="econ-recipe-tab-' + E(pill.id) + '" data-econ-action="recipe"' + attr('pill', pill.id) + ' aria-selected="' + (selectedPill === pill.id) + '" aria-controls="econ-recipe-panel">' +
          pillArt(pill, true) + '<strong>' + E(pill.name) + '</strong><span>+' + F(pill.qi) + ' 修为</span></button>').join('') + '</div>' +
        recipeMarkup(pillMap[selectedPill], info) + pillBagMarkup(info) + '</div>';
    }

    function renderAlchemy(force) {
      if (!visible('alchemy')) return;
      const info = alchemyInfo();
      const signature = JSON.stringify([state().bag, state().pills, state().stones, state().realm, info.daily, info.brew?.id, info.brew?.ready, actionBusy, selectedPill, brewConfirmation]);
      if (force || signature !== alchemySignature) {
        const host = content(), scrollTop = host.scrollTop;
        const oldTabs = host.querySelector('.econ-recipe-tabs');
        const scrollLeft = oldTabs?.scrollLeft || 0;
        const active = document.activeElement;
        const focusedAction = host.contains(active) ? active?.dataset?.econAction : null;
        const focusedPill = active?.dataset?.pill;
        host.innerHTML = alchemyMarkup(info);
        host.scrollTop = scrollTop;
        const tabs = host.querySelector('.econ-recipe-tabs');
        if (tabs) tabs.scrollLeft = scrollLeft;
        if (focusedAction) {
          const buttons = Array.from(host.querySelectorAll('[data-econ-action]'));
          buttons.find(node => node.dataset.econAction === focusedAction && node.dataset.pill === focusedPill && !node.disabled)?.focus({preventScroll:true});
        }
        alchemySignature = signature;
      }
      const countdown = root('alchemy')?.querySelector('[data-econ-brew-countdown]');
      if (countdown && info.brew) countdown.textContent = clock(info.brew.remainingMs);
      const progress = root('alchemy')?.querySelector('[data-econ-brew-progress]');
      if (progress && info.brew) progress.value = Math.max(0, Number(progress.max) - info.brew.remainingMs);
    }

    function openAlchemy(pillId) {
      if (typeof pillId === 'string' && Object.hasOwn(pillMap, pillId)) selectedPill = pillId;
      brewConfirmation = null;
      const info = alchemyInfo();
      options.openDialog('alchemy', '灵火丹房', alchemyMarkup(info));
      alchemySignature = '';
      renderAlchemy(true);
    }

    async function alchemyAction(action, pillId) {
      if (actionBusy) return;
      actionBusy = action;
      brewConfirmation = null;
      renderAlchemy(true);
      try {
        if (action === 'brew') await engine.startBrew(pillId);
        else if (action === 'claim') await engine.claimBrew();
        else await engine.consumePill(pillId);
      } catch (error) {
        options.toast(error.message || '丹房暂未响应，请稍后重试。', 'error');
      } finally {
        actionBusy = '';
        options.renderGame();
        renderAlchemy(true);
      }
    }

    function rulesMarkup() {
      return '<details class="econ-rules"><summary>' + I('book') + '坊市规则与经济学小课<span>展开阅读</span></summary><div class="econ-rules-body">' +
        '<h4>每一张订单怎样成交</h4><ol><li><strong>自主限价。</strong>单价为 1—1,000,000 整数灵石，数量 1—999；每人最多同时保留 10 张有效订单。每份灵草、每颗丹药分别计价。</li>' +
        '<li><strong>价格优先、时间优先。</strong>买价高者、卖价低者优先；同价按服务器受理先后。以已经挂在盘口中的对手方价格成交，禁止自己与自己成交。</li>' +
        '<li><strong>冻结与返还。</strong>买单冻结“限价 × 数量”的灵石，卖单冻结商品。若买入成交价低于限价，差额返还；成交部分归对手方，未成交部分继续排队。</li>' +
        '<li><strong>部分成交与撤单。</strong>可随时申请撤销未成交部分；订单 24 小时到期后退回余下冻结资产。已成交交易不能通过撤单撤回。</li>' +
        '<li><strong>卖方手续费。</strong>灵植为成交金额的 1%，丹药 2%，道藏卡牌 3%；向上取整，每笔最低 1 灵石，从卖方收入扣除。分多笔成交时逐笔计费，低价小单的手续费占比可能较高。</li>' +
        '<li><strong>价格来自真实成交。</strong>最新价是上一笔成交价；24 小时均价按成交量加权。没有成交就显示“暂无成交”，挂单价和统计均价都不代表必然能成交的价格。</li></ol>' +
        '<p class="econ-fineprint">本游戏借鉴真实市场的限价、撮合和撤单规则；24 小时有效期、数量单位、立即交收及手续费是课堂游戏参数，并非对证券市场全部制度的复刻。</p>' +
        '<div class="econ-knowledge-grid">' + ['listed','priority','partial','spread','use','production'].map(key =>
          '<article><h4>' + E(LESSONS[key][0]) + '</h4><p>' + E(LESSONS[key][1]) + '</p></article>').join('') +
        '</div><div class="econ-theory-note"><strong>把“价值”和“价格”分清</strong><p>马克思的政治经济学以社会必要劳动时间说明商品价值。供求变化影响市场价格及其波动，不能把某位修士投入的材料钱、炼制等待时间或 24 小时成交均价直接叫作商品价值。游戏可以帮助观察交换、供求与竞争，但它的倒计时并不是对社会劳动过程的完整模拟。</p></div>' +
        '<h4>延伸阅读 · 规则与原文</h4><ul class="econ-source-links">' + SOURCES.map(source =>
          '<li>' + (engine.online ? '<a href="' + E(source[1]) + '" target="_blank" rel="noopener noreferrer">' + E(source[0]) + ' ↗</a>' : E(source[0])) + '</li>').join('') + '</ul></div></details>';
    }

    function goodsMarketMarkup() {
      if (!engine.online) return '<div class="econ-offline"><div class="econ-furnace-emblem">' + I('gem') +
        '</div><span class="econ-kicker">离线练习 · 坊市课堂</span><h3>先读规则，了解交易</h3><p>这份离线文件不连接共享市场，也不会产生同学的交易。你可以继续种植、出售灵草给药铺和炼丹，在这里阅读坊市规则。练习存档与云端资产相互独立。</p></div>' +
        rulesMarkup();
      return '<div class="econ-topline">' + modeLine() + '<div class="econ-sync"><span data-econ-sync>正在连接坊市…</span>' +
        button('refresh-market', '刷新行情', '', false, true) + '</div></div><p class="econ-intro">' + (marketCategory === 'herb' ? '灵植收成，自由报价。查看买卖双方的出价，把多余的收成换成下一块灵田。' : '灵丹成药，互通有无。按每颗丹药自主报价，核对库存与限价后提交委托。') + '</p>' +
        '<div class="econ-market-picker"><label for="econ-market-item">交易商品</label><select id="econ-market-item" data-econ-field="item">' +
        items.filter(item => item.type === marketCategory).map(item => '<option value="' + E(item.key) + '"' + (selectedItem === item.key ? ' selected' : '') + '>' + E(item.name) + (item.type === 'pill' ? ' · +' + item.qi + ' 修为' : '') + '</option>').join('') +
        '</select><div class="econ-market-item-preview" data-econ-item-preview></div><div class="econ-market-wallet" data-econ-wallet></div></div>' +
        '<div data-econ-market-error role="status"></div><div class="econ-market-stats" data-econ-stats></div><div data-econ-chart></div>' +
        '<div class="econ-trading-grid"><section class="econ-order-panel"><div class="econ-section-heading"><h3>我的限价委托</h3><span>自主定价</span></div>' +
        '<div class="econ-side-switch" role="group" aria-label="交易方向"><button type="button" data-econ-action="side" data-side="buy" aria-pressed="' + (draft.side === 'buy') +
        '">买入</button><button type="button" data-econ-action="side" data-side="sell" aria-pressed="' + (draft.side === 'sell') + '">卖出</button></div>' +
        '<form data-econ-order-form novalidate><div class="econ-field-grid"><label for="econ-order-price">每份单价 · 灵石<input id="econ-order-price" data-econ-field="price" type="number" min="1" max="1000000" step="1" inputmode="numeric" autocomplete="off" placeholder="自主填写价格" value="' + E(draft.price) +
        '"></label><label for="econ-order-quantity">数量<input id="econ-order-quantity" data-econ-field="quantity" type="number" min="1" max="999" step="1" inputmode="numeric" autocomplete="off" value="' + E(draft.quantity) +
        '"></label></div><div class="econ-order-estimate" data-econ-estimate></div>' +
        button('review-order', '核对委托', '', false) + '<div data-econ-confirmation></div></form></section>' +
        '<section class="econ-book-panel"><div class="econ-section-heading"><h3>买卖盘口</h3><span>前五档</span></div><p class="econ-fineprint">轻点报价可填入委托表单，不会直接下单。</p><div data-econ-book></div></section></div>' +
        '<aside class="econ-lesson" data-econ-lesson aria-live="polite"></aside>' +
        '<section class="econ-orders"><div class="econ-section-heading"><h3>我的委托</h3><span>本类商品 · 灵植与丹药合计最多 10 单</span></div><div data-econ-orders></div></section>' +
        '<section class="econ-trades"><div class="econ-section-heading"><h3>最近成交</h3><span>当前商品 · 北京时间</span></div><div data-econ-trades></div></section>' +
        rulesMarkup();
    }

    function marketMarkup() {
      const cards = marketCategory === 'cards';
      return '<div class="econ-shell" data-econ-screen="market" data-market-category="' + marketCategory + '"><nav class="econ-market-tabs" role="tablist" aria-label="坊市商品分类">' +
        marketCategories.map(([id, label]) => '<button type="button" role="tab" id="econ-market-tab-' + id + '" data-econ-action="market-category" data-category="' + id + '" aria-selected="' + (marketCategory === id) + '" aria-controls="econ-market-panel" tabindex="' + (marketCategory === id ? '0' : '-1') + '">' + label + '</button>').join('') +
        '</nav><section id="econ-market-panel" data-econ-market-panel role="tabpanel" aria-labelledby="econ-market-tab-' + marketCategory + '"><div data-econ-goods-market' + (cards ? ' hidden' : '') + '>' + (cards ? '' : goodsMarketMarkup()) +
        '</div><div class="econ-card-market" data-econ-card-market' + (cards ? '' : ' hidden') + '></div></section></div>';
    }

    function updateMarketTabs() {
      const host = root('market');
      if (!host) return;
      host.dataset.marketCategory = marketCategory;
      host.querySelector('[data-econ-market-panel]')?.setAttribute('aria-labelledby', 'econ-market-tab-' + marketCategory);
      host.querySelectorAll('[data-econ-action="market-category"]').forEach(node => {
        const selected = node.dataset.category === marketCategory;
        node.setAttribute('aria-selected', String(selected));
        node.setAttribute('tabindex', selected ? '0' : '-1');
        node.disabled = categoryBusy();
      });
    }

    function closeCardMarket(dispose = false) {
      if (!cardMarketUI) return;
      cardMarketClosing = true;
      try {
        if (dispose && typeof cardMarketUI.dispose === 'function') cardMarketUI.dispose();
        else cardMarketUI.close?.({silent:true});
      } finally {
        cardMarketClosing = false;
        if (dispose) { cardMarketUI = null; cardMarketSlot = null; }
      }
    }

    function openCardMarket(initialCardId = '') {
      if (!visible('market') || marketCategory !== 'cards') return;
      const slot = root('market')?.querySelector('[data-econ-card-market]');
      if (!slot) return;
      if (cardMarketUI && cardMarketSlot !== slot) closeCardMarket(true);
      cardMarketSlot = slot;
      slot.hidden = false;
      try {
        if (!cardMarketUI) {
          if (typeof window.createSpiritCardsUI !== 'function') throw new Error('cards unavailable');
          cardMarketUI = window.createSpiritCardsUI({host:slot, engine, esc:E, embeddedMarket:true, initialCardId,
            onInspectCard:options.onInspectCard,
            onClose:() => { if (!cardMarketClosing && marketCategory === 'cards' && visible('market')) switchMarketCategory('herb'); }});
          if (typeof cardMarketUI?.open !== 'function') throw new Error('cards unavailable');
        } else if (initialCardId) cardMarketUI.selectMarketCard?.(initialCardId);
        if (cardMarketUI.isOpen?.() !== true) cardMarketUI.open('market');
      } catch (_error) {
        try { closeCardMarket(true); } catch (_closeError) { cardMarketUI = null; }
        cardMarketSlot = slot;
        slot.hidden = false;
        slot.innerHTML = note('<strong>道藏坊市暂未加载</strong><br>请稍后重新选择“道藏”，或刷新页面后重试。');
      }
      updateMarketTabs();
      syncCardActivity(mainCardsActive);
    }

    function resetMarketData() {
      marketRequest++;
      marketLoading = false;
      marketData = null;
      marketSelectedTime = null;
      chartSignature = '';
      chartDispose?.(); chartDispose = null; chartHost = null;
      marketError = '';
      marketConfirmation = null;
      cancelConfirmation = null;
      lastMarketLoad = 0;
    }

    function switchMarketCategory(category, itemKey, initialCardId = '') {
      if (!visible('market') || !marketCategories.some(([id]) => id === category) || categoryBusy()) return false;
      if (category === marketCategory) {
        if (category === 'cards') openCardMarket(initialCardId);
        else if (itemKey && itemKey !== selectedItem) switchMarketItem(itemKey);
        return true;
      }
      readDraft();
      if (marketCategory === 'cards') closeCardMarket();
      marketCategory = category;
      resetMarketData();
      const host = root('market'), goods = host.querySelector('[data-econ-goods-market]');
      cardMarketSlot = host.querySelector('[data-econ-card-market]');
      goods.hidden = category === 'cards';
      cardMarketSlot.hidden = category !== 'cards';
      if (category === 'cards') openCardMarket(initialCardId);
      else {
        draft = marketDrafts[category];
        if (itemMap[itemKey]?.type === category) {
          if (selectedItems[category] !== itemKey) draft.price = '';
          selectedItems[category] = itemKey;
        }
        selectedItem = selectedItems[category];
        lesson = category === 'herb' ? 'production' : 'use';
        goods.innerHTML = goodsMarketMarkup();
        renderMarketData();
        void loadMarket();
      }
      updateMarketTabs();
      syncCardActivity(mainCardsActive);
      content().scrollTop = 0;
      return true;
    }

    function openMarket(itemKey) {
      const initialCardId = typeof itemKey === 'string' && itemKey.startsWith('card:') ? itemKey.slice(5) : '';
      const category = itemKey === 'cards' || initialCardId ? 'cards' : itemMap[itemKey]?.type || 'herb';
      if (categoryBusy()) return false;
      if (visible('market')) return switchMarketCategory(category, itemKey, initialCardId);
      readDraft();
      closeCardMarket(true);
      marketCategory = category;
      if (category !== 'cards') {
        draft = marketDrafts[category];
        if (itemMap[itemKey]?.type === category) {
          if (selectedItems[category] !== itemKey) draft.price = '';
          selectedItems[category] = itemKey;
        }
        selectedItem = selectedItems[category];
      }
      resetMarketData();
      lesson = category === 'herb' ? 'production' : 'empty';
      options.openDialog('market', '云间坊市', marketMarkup());
      const host = root('market');
      if (!host) return false;
      cardMarketSlot = host.querySelector('[data-econ-card-market]');
      host.addEventListener('input', event => {
        if (marketCategory === 'cards') return;
        if (event.target.matches('[data-econ-field="price"],[data-econ-field="quantity"]')) {
          readDraft();
          marketConfirmation = null;
          updateOrderForm();
        }
      });
      host.addEventListener('submit', event => {
        if (marketCategory === 'cards' || !event.target.matches('[data-econ-order-form]')) return;
        event.preventDefault();
        reviewOrder();
      });
      host.addEventListener('keydown', event => {
        const tab = event.target.closest?.('[data-econ-action="market-category"]');
        if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || categoryBusy()) return;
        event.preventDefault();
        const index = marketCategories.findIndex(([id]) => id === marketCategory);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? marketCategories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + marketCategories.length) % marketCategories.length;
        switchMarketCategory(marketCategories[next][0]);
        host.querySelector('[data-econ-action="market-category"][data-category="' + marketCategories[next][0] + '"]')?.focus({preventScroll:true});
      });
      updateMarketTabs();
      if (category === 'cards') openCardMarket(initialCardId);
      else { renderMarketData(); void loadMarket(); }
      syncCardActivity(mainCardsActive);
      return true;
    }

    function readDraft() {
      const host = root('market');
      if (!host) return;
      const price = host.querySelector('[data-econ-field="price"]');
      const quantity = host.querySelector('[data-econ-field="quantity"]');
      if (price) draft.price = price.value;
      if (quantity) draft.quantity = quantity.value;
    }

    function integerInput(value, max) {
      if (!/^\d+$/.test(String(value))) return null;
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 1 && number <= max ? number : null;
    }

    function orderDraft() {
      readDraft();
      return {itemKey:selectedItem, side:draft.side, price:integerInput(draft.price, 1000000), quantity:integerInput(draft.quantity, 999)};
    }

    function marketFeeRules(itemKey) {
      const rules = marketData?.itemKey === itemKey ? marketData.rules : null;
      return {
        feePercent: Number.isFinite(rules?.feePercent) && rules.feePercent > 0 && rules.feePercent <= 100
          ? rules.feePercent : itemMap[itemKey]?.type === 'pill' ? 2 : 1,
        minimumFee: Number.isSafeInteger(rules?.minimumFee) && rules.minimumFee >= 1 ? rules.minimumFee : 1
      };
    }

    const orderReview = order => Object.assign({}, order, marketFeeRules(order.itemKey));

    function orderProblem(order) {
      if (!engine.online) return '离线练习不参与共享交易。';
      if (marketCategory === 'cards' || itemMap[order.itemKey]?.type !== marketCategory) return '请先选择当前分类的商品。';
      if (!order.price) return '单价请填写 1—1,000,000 之间的整数灵石。';
      if (!order.quantity) return '数量请填写 1—999 之间的整数。';
      if (!marketData || marketData.itemKey !== selectedItem) return '请先连接坊市并加载当前商品行情。';
      if ((marketData.myOrders || []).filter(isActiveOrder).length >= 10) return '最多同时保留 10 张有效订单，请先撤回余单。';
      if (order.side === 'buy' && state().stones < order.price * order.quantity) return '可用灵石不足，买单需要冻结 ' + F(order.price * order.quantity) + ' 灵石。';
      if (order.side === 'sell' && owned(itemMap[order.itemKey]) < order.quantity) return '可用库存不足，请减少数量或先领取丹药、收割灵草。';
      return '';
    }

    function updateOrderForm() {
      const host = root('market');
      if (!host || !visible('market') || !engine.online || marketCategory === 'cards') return;
      updateMarketTabs();
      const order = orderDraft(), item = itemMap[selectedItem];
      const preview = host.querySelector('[data-econ-item-preview]');
      if (preview && preview.dataset.item !== item.key) {
        preview.dataset.item = item.key;
        preview.innerHTML = (item.type === 'pill' ? pillArt(item) : '<span class="econ-market-herb-art" aria-hidden="true">' + plantArt(item.id) + '</span>') + '<div><strong>' + E(item.name) + '</strong><span>' + (item.type === 'pill' ? '服用提升 ' + F(item.qi) + ' 修为 · ' + E(realmName(item.minRealm)) + '可炼' : '灵草材料 · 可种植、炼丹与交易') + '</span></div>';
      }
      const amount = (order.price || 0) * (order.quantity || 0);
      const feeRules = marketFeeRules(order.itemKey);
      const fee = Math.max(feeRules.minimumFee, Math.ceil(amount * feeRules.feePercent / 100));
      host.querySelector('[data-econ-wallet]').innerHTML = '<span>' + I('gem') + '<strong>' + F(state().stones) + '</strong> 可用灵石</span><span>' + I('bag') +
        E(item.name) + ' <strong>' + F(owned(item)) + '</strong> ' + item.unit + '可用</span>';
      host.querySelectorAll('[data-econ-action="side"]').forEach(node => {
        node.setAttribute('aria-pressed', String(node.dataset.side === draft.side));
        node.disabled = !!actionBusy;
      });
      host.querySelectorAll('[data-econ-field]').forEach(node => { node.disabled = !!actionBusy; });
      host.querySelector('[data-econ-estimate]').innerHTML = !order.price || !order.quantity
        ? '<span>填写单价和数量，核对冻结资产后再提交。</span>'
        : order.side === 'buy'
          ? '<span>预计冻结 <strong>' + F(amount) + '</strong> 灵石</span><small>买入不另收手续费；若以更低价格成交，退回差额。</small>'
          : '<span>预计冻结 <strong>' + F(order.quantity) + ' ' + item.unit + '</strong> ' + E(item.name) + '</span><small>按限价一次全部成交：成交额 ' + F(amount) + '，手续费 ' + F(fee) + '（' + feeRules.feePercent + '%），预计到账 ' + F(Math.max(0, amount - fee)) + ' 灵石。</small><small>分批成交逐笔计费；实际成交价与到账以交易记录为准。</small>';
      const review = host.querySelector('[data-econ-action="review-order"]');
      review.disabled = !!actionBusy || !marketData;
      review.textContent = actionBusy === 'order' ? '正在提交…' : '核对' + (draft.side === 'buy' ? '买入' : '卖出') + '委托';
      const confirmHost = host.querySelector('[data-econ-confirmation]');
      if (marketConfirmation && !actionBusy && JSON.stringify(orderReview(order)) !== JSON.stringify(marketConfirmation)) marketConfirmation = null;
      if (!marketConfirmation) { confirmHost.innerHTML = ''; return; }
      const confirmationKey = JSON.stringify([marketConfirmation, actionBusy]);
      if (confirmHost.dataset.signature === confirmationKey) return;
      confirmHost.dataset.signature = confirmationKey;
      confirmHost.innerHTML = '<div class="econ-confirm" role="status"><span class="econ-kicker">请核对后确认</span><h4>' + (order.side === 'buy' ? '买入 ' : '卖出 ') + E(item.name) +
        '</h4><dl><div><dt>限价 / 数量</dt><dd>' + F(order.price) + ' 灵石 × ' + F(order.quantity) + ' ' + item.unit + '</dd></div><div><dt>立即冻结</dt><dd>' +
        (order.side === 'buy' ? F(amount) + ' 灵石' : F(order.quantity) + ' ' + item.unit + E(item.name)) + '</dd></div><div><dt>有效期</dt><dd>24 小时；可撤未成交部分</dd></div></dl>' +
        '<p>' + (order.side === 'buy' ? '实际成交价不会高于此限价。' : '实际成交价不会低于此限价，卖方逐笔支付 ' + feeRules.feePercent + '% 手续费（向上取整，最低 ' + F(feeRules.minimumFee) + ' 灵石）。') +
        '提交后可能立即成交。</p><div class="econ-actions">' + button('confirm-order', actionBusy === 'order' ? '正在提交…' : '确认并提交委托', '', !!actionBusy) +
        button('dismiss-order', '修改', '', !!actionBusy, true) + '</div></div>';
    }

    function reviewOrder() {
      if (actionBusy || marketCategory === 'cards' || !visible('market')) return;
      const order = orderDraft(), problem = orderProblem(order);
      if (problem) { options.toast(problem, 'info'); return; }
      marketConfirmation = orderReview(order);
      const host = root('market')?.querySelector('[data-econ-confirmation]');
      if (host) delete host.dataset.signature;
      updateOrderForm();
      root('market')?.querySelector('[data-econ-action="confirm-order"]')?.focus({preventScroll:true});
    }

    function isActiveOrder(order) {
      return Number(order.remaining) > 0 && !['filled','cancelled','canceled','expired','rejected'].includes(order.status);
    }

    function bookMarkup() {
      if (!marketData) return '<div class="econ-empty"><p>尚未读取盘口</p><small>连接成功后显示真实买卖报价。</small></div>';
      const book = marketData?.book || {bids:[], asks:[]};
      const levels = (side, entries) => '<div class="econ-book-side ' + (side === 'sell' ? 'is-ask' : 'is-bid') + '"><div class="econ-book-heading"><strong>' +
        (side === 'sell' ? '卖方要价' : '买方出价') + '</strong><span>灵石 / 数量</span></div>' +
        (entries.length ? entries.slice(0, 5).map((entry, index) => '<button type="button" class="econ-book-level" data-econ-action="quote"' +
          attr('side', side === 'sell' ? 'buy' : 'sell') + attr('price', entry.price) + '><span>' + (side === 'sell' ? '卖' : '买') + (index + 1) +
          '</span><strong>' + F(entry.price) + '</strong><span>' + F(entry.quantity) + '</span></button>').join('') :
          '<p class="econ-empty-small">暂无' + (side === 'sell' ? '卖单' : '买单') + '</p>') + '</div>';
      return levels('sell', book.asks || []) + '<div class="econ-book-spread">买卖价差 <strong>' + priceText(marketData?.stats?.spread) + '</strong> 灵石</div>' + levels('buy', book.bids || []);
    }

    function ordersMarkup() {
      if (!marketData) return '<div class="econ-empty"><p>尚未读取委托</p><small>连接成功后显示云端委托。</small></div>';
      const orders = (marketData?.myOrders || []).filter(order => itemMap[order.itemKey]?.type === marketCategory), active = orders.filter(isActiveOrder), ended = orders.filter(order => !isActiveOrder(order));
      const row = order => {
        const item = itemMap[order.itemKey], open = isActiveOrder(order), total = Number(order.quantity), remaining = Number(order.remaining);
        const status = open && remaining < total ? '部分成交' : {filled:'已成交', cancelled:'已撤单', canceled:'已撤单', expired:'已到期', open:'等待成交', partial:'部分成交', partially_filled:'部分成交'}[order.status] || (open ? '等待成交' : '已结束');
        return '<article class="econ-order-row"><div class="econ-order-row-heading"><strong>' + E(item?.name || order.itemKey) + '</strong><span class="econ-side-badge ' + (order.side === 'buy' ? 'is-buy' : 'is-sell') + '">' +
          (order.side === 'buy' ? '买入' : '卖出') + '</span><span>' + E(status) + '</span></div><div class="econ-order-row-body"><div><strong>' + F(order.price) + ' <small>灵石 / ' + (item?.unit || '件') +
          '</small></strong><p>委托 ' + F(total) + ' · ' + (open ? '已成交 ' + F(total - remaining) + ' · 余 ' + F(remaining) : E(status)) +
          '</p><small>' + E(dateText(order.createdAt)) + (open ? ' · <span data-econ-expiry="' + E(order.expiresAt) + '"></span>' : '') + '</small></div>' +
          (open ? button('review-cancel', '撤回余单', attr('order', order.id), !!actionBusy, true) : '') + '</div>' +
          (cancelConfirmation === order.id && open ? '<div class="econ-confirm econ-cancel-confirm"><p>撤回尚未成交的 ' + F(remaining) + ' ' + (item?.unit || '件') +
            '；预计解冻 ' + (order.side === 'buy' ? F(order.price * remaining) + ' 灵石' : F(remaining) + ' ' + (item?.unit || '件') + E(item?.name || '商品')) +
            '。若期间发生新成交，以服务器最终剩余数量为准。</p><div class="econ-actions">' + button('confirm-cancel', '确认撤回余单', attr('order', order.id), !!actionBusy) +
            button('dismiss-cancel', '保留订单', '', !!actionBusy, true) + '</div></div>' : '') + '</article>';
      };
      return (active.length ? '<div class="econ-order-list">' + active.map(row).join('') + '</div>' : '<div class="econ-empty">' + I('book') + '<p>暂无有效委托</p><small>提交后，你的未成交订单会出现在这里。</small></div>') +
        (ended.length ? '<details class="econ-ended-orders"><summary>最近结束的委托 · ' + ended.length + ' 张</summary><div class="econ-order-list">' + ended.map(row).join('') + '</div></details>' : '');
    }

    function tradesMarkup() {
      if (!marketData) return '<div class="econ-empty"><p>尚未读取成交</p><small>连接成功后显示真实成交记录。</small></div>';
      const trades = marketData?.trades || [];
      if (!trades.length) return '<div class="econ-empty">' + I('gem') + '<p>暂无成交</p><small>价格由同学之间的真实交易产生。</small></div>';
      return '<div class="econ-trade-table"><table><thead><tr><th scope="col">成交时间</th><th scope="col">成交单价</th><th scope="col">数量</th><th scope="col">成交金额</th></tr></thead><tbody>' +
        trades.slice(0, 20).map(trade => '<tr><td>' + E(dateText(trade.createdAt)) + '</td><td>' + F(trade.price) + '</td><td>' + F(trade.quantity) +
          '</td><td>' + F(trade.price * trade.quantity) + '</td></tr>').join('') + '</tbody></table></div><p class="econ-fineprint">金额单位：灵石。此处是当前商品的公开成交记录，不包含其他同学的身份。</p>';
    }

    function renderLesson() {
      const slot = root('market')?.querySelector('[data-econ-lesson]');
      if (slot) slot.innerHTML = '<span class="econ-lesson-icon">' + I('book') + '</span><div><strong>' + E(LESSONS[lesson][0]) +
        '</strong><p>' + E(LESSONS[lesson][1]) + '</p></div>';
    }

    function renderOrders() {
      if (marketCategory === 'cards') return;
      const slot = root('market')?.querySelector('[data-econ-orders]');
      if (!slot) return;
      const wasOpen = slot.querySelector('.econ-ended-orders')?.open;
      slot.innerHTML = ordersMarkup();
      if (wasOpen && slot.querySelector('.econ-ended-orders')) slot.querySelector('.econ-ended-orders').open = true;
      updateMarketTimers();
    }

    function renderMarketChart() {
      if (marketCategory === 'cards') return;
      const slot = root('market')?.querySelector('[data-econ-chart]'), chart = window.SpiritMarketChart;
      if (!slot || !chart) return;
      const source = marketData?.history;
      const history = source?.itemKey === selectedItem && source?.interval === marketInterval ? source : null;
      const title = (itemMap[selectedItem]?.name || '当前商品') + ' · 成交走势';
      const signature = JSON.stringify([history, title, marketInterval, marketLoading, marketError]);
      if (slot === chartHost && signature === chartSignature) return;
      const focused = slot.querySelector('[data-mc-chart]') === document.activeElement;
      const explained = !!slot.querySelector('.mc-explainer[open]');
      chartDispose?.(); chartSignature = signature; chartHost = slot;
      const config = {title, interval:marketInterval, unit:itemMap[selectedItem]?.unit || '份', selectedTime:marketSelectedTime, loading:marketLoading,
        emptyTitle:marketError ? '成交走势暂未连通' : '尚未形成成交K线',
        emptyMessage:marketError ? '请刷新行情。已有成交以服务器账簿为准。' : '该商品的真实成交会汇入K线；挂出的报价不会生成走势。'};
      slot.innerHTML = chart.markup(history,config);
      chartDispose = chart.bind(slot,history,{...config,onSelect:value=>{marketSelectedTime=value;},onInterval:value=>{
        if(value===marketInterval||marketCategory==='cards'||!visible('market')||actionBusy)return;
        marketInterval=value;marketSelectedTime=null;marketRequest++;marketLoading=false;chartSignature='';
        renderMarketChart();void loadMarket();
      }});
      if(explained)slot.querySelector('.mc-explainer')?.setAttribute('open','');
      if(focused)slot.querySelector('[data-mc-chart]')?.focus({preventScroll:true});
    }

    function renderMarketData() {
      const host = root('market');
      if (!host || !visible('market') || !engine.online || marketCategory === 'cards') return;
      const stats = marketData?.stats || {};
      host.querySelector('[data-econ-stats]').innerHTML = [
        ['最新成交', priceText(stats.lastPrice), !marketData ? '等待行情' : stats.lastPrice == null ? '暂无成交' : '灵石 / 单位'],
        ['24 小时均价', priceText(stats.vwap24h), '按成交量加权'],
        ['24 小时成交量', marketData ? F(stats.volume24h || 0) : '—', itemMap[selectedItem]?.unit || '件'],
        ['买卖价差', priceText(stats.spread), stats.spread == null ? '等待双边报价' : '最低卖价 − 最高买价']
      ].map(([label, value, caption]) => '<div class="econ-market-stat"><span>' + label + '</span><strong>' + value + '</strong><small>' + caption + '</small></div>').join('');
      host.querySelector('[data-econ-book]').innerHTML = bookMarkup();
      host.querySelector('[data-econ-trades]').innerHTML = tradesMarkup();
      renderOrders();
      renderLesson();
      updateOrderForm();
      updateMarketTimers();
    }

    function updateMarketTimers() {
      const host = root('market');
      if (!host || !visible('market') || !engine.online || marketCategory === 'cards') return;
      const sync = host.querySelector('[data-econ-sync]');
      if (sync) sync.textContent = marketLoading ? '正在同步…' : marketError ? '连接暂不可用' : lastMarketLoad ? '行情已同步 · 每 10 秒更新' : '正在连接坊市…';
      const errorHost = host.querySelector('[data-econ-market-error]');
      if (errorHost) {
        const signature = marketError;
        if (errorHost.dataset.message !== signature) {
          errorHost.dataset.message = signature;
          errorHost.innerHTML = marketError ? note('<strong>坊市暂未连通</strong><br>' + E(marketError) + ' 请点击“刷新行情”重试。已有显示为上次同步的数据。', 'error') : '';
        }
      }
      host.querySelectorAll('[data-econ-expiry]').forEach(node => {
        const remaining = timestamp(node.dataset.econExpiry) - (Date.now() + serverOffset);
        node.textContent = remaining > 0 ? clock(remaining) + ' 后到期' : '已到期，等待同步返还';
      });
      const refreshButton = host.querySelector('[data-econ-action="refresh-market"]');
      if (refreshButton) refreshButton.disabled = marketLoading;
      renderMarketChart();
    }

    async function loadMarket() {
      if (!engine.online || !visible('market') || marketCategory === 'cards' || marketLoading) return;
      const request = ++marketRequest, itemKey = selectedItem, interval = marketInterval, category = marketCategory, host = root('market');
      marketLoading = true;
      updateMarketTimers();
      try {
        const result = await engine.getMarket(itemKey, {interval});
        if (request !== marketRequest || selectedItem !== itemKey || marketInterval !== interval || marketCategory !== category || !visible('market') || root('market') !== host) return;
        if (!result || result.ok === false) throw new Error(result?.message || '无法读取共享交易数据。');
        marketData = Object.assign({}, result, {itemKey});
        const serverTime = timestamp(result.serverTime);
        if (Number.isFinite(serverTime)) serverOffset = serverTime - Date.now();
        marketError = '';
        if (lesson === 'empty' && result.stats?.lastPrice != null) lesson = 'spread';
        renderMarketData();
      } catch (error) {
        if (request === marketRequest && selectedItem === itemKey && marketCategory === category && visible('market') && root('market') === host) {
          marketError = error.message || '共享交易服务暂时不可用。';
        }
      } finally {
        if (request === marketRequest) {
          marketLoading = false;
          lastMarketLoad = Date.now();
          updateMarketTimers();
        }
      }
    }

    async function submitOrder() {
      if (actionBusy || !marketConfirmation || !engine.online || marketCategory === 'cards' || !visible('market')) return;
      const order = orderDraft();
      if (JSON.stringify(orderReview(order)) !== JSON.stringify(marketConfirmation)) {
        marketConfirmation = null;
        updateOrderForm();
        options.toast('委托内容或手续费已变化，请重新核对。', 'info');
        return;
      }
      const problem = orderProblem(order);
      if (problem) { options.toast(problem, 'info'); return; }
      actionBusy = 'order';
      updateOrderForm();
      try {
        const result = await engine.placeOrder(order);
        if (result?.ok) {
          lesson = result.filledQuantity > 0 ? (result.remainingQuantity > 0 ? 'partial' : 'priority') : 'listed';
          marketConfirmation = null;
          marketError = '';
        }
      } catch (error) {
        marketError = error.message || '提交暂未得到确认，请同步云端后查看我的委托。';
      } finally {
        actionBusy = '';
        marketConfirmation = null;
        options.renderGame();
        updateOrderForm();
        renderLesson();
        marketRequest++;
        marketLoading = false;
        await loadMarket();
      }
    }

    async function cancelOrder(id) {
      if (actionBusy || cancelConfirmation !== id || !engine.online || marketCategory === 'cards' || !visible('market')) return;
      actionBusy = 'cancel';
      renderOrders();
      updateOrderForm();
      try {
        const result = await engine.cancelOrder(id);
        if (result?.ok) lesson = 'cancelled';
      } catch (error) {
        marketError = error.message || '撤单暂未得到确认，请同步云端后查看委托状态。';
      } finally {
        actionBusy = '';
        cancelConfirmation = null;
        options.renderGame();
        renderOrders();
        updateOrderForm();
        renderLesson();
        marketRequest++;
        marketLoading = false;
        await loadMarket();
      }
    }

    function switchMarketItem(itemKey) {
      if (itemMap[itemKey]?.type !== marketCategory || actionBusy) return;
      readDraft();
      selectedItem = itemKey;
      selectedItems[marketCategory] = itemKey;
      marketSelectedTime = null; chartSignature = '';
      marketRequest++;
      marketLoading = false;
      marketData = null;
      marketError = '';
      marketConfirmation = null;
      cancelConfirmation = null;
      draft.price = '';
      const input = root('market')?.querySelector('[data-econ-field="price"]');
      if (input) input.value = '';
      lesson = itemMap[itemKey].type === 'herb' ? 'production' : 'use';
      renderMarketData();
      loadMarket();
    }

    function handleClick(event) {
      const target = event.target.closest && event.target.closest('[data-econ-action]');
      if (!target || !content()?.contains(target)) return false;
      event.preventDefault();
      if (target.disabled) return true;
      const action = target.dataset.econAction;
      const pillId = target.dataset.pill;
      if (action === 'recipe' && pillMap[pillId]) {
        selectedPill = pillId; brewConfirmation = null; renderAlchemy(true);
        root('alchemy')?.querySelector('.econ-recipe-tab[aria-selected="true"]')?.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
      } else if (action === 'prepare-brew') { brewConfirmation = pillId; renderAlchemy(true); }
      else if (action === 'dismiss-brew') { brewConfirmation = null; renderAlchemy(true); }
      else if (action === 'confirm-brew') { if (brewConfirmation === pillId) alchemyAction('brew', pillId); }
      else if (action === 'claim-brew') alchemyAction('claim');
      else if (action === 'consume-pill') alchemyAction('consume', pillId);
      else if (action === 'open-market') openMarket();
      else if (action === 'market-category') switchMarketCategory(target.dataset.category);
      else if (action === 'sell-item') {
        const item = itemMap[target.dataset.item];
        if (item && !categoryBusy()) { marketDrafts[item.type].side = 'sell'; openMarket(item.key); }
      }
      else if (action === 'refresh-market') loadMarket();
      else if (action === 'side' && !actionBusy) {
        draft.side = target.dataset.side === 'buy' ? 'buy' : 'sell'; marketConfirmation = null; updateOrderForm();
      } else if (action === 'quote' && !actionBusy) {
        draft.side = target.dataset.side; draft.price = String(target.dataset.price);
        const input = root('market')?.querySelector('[data-econ-field="price"]');
        if (input) input.value = draft.price;
        marketConfirmation = null; lesson = 'spread'; updateOrderForm(); renderLesson();
        input?.focus({preventScroll:true});
      } else if (action === 'review-order') reviewOrder();
      else if (action === 'dismiss-order') { marketConfirmation = null; updateOrderForm(); }
      else if (action === 'confirm-order') submitOrder();
      else if (action === 'review-cancel') { cancelConfirmation = target.dataset.order; renderOrders(); }
      else if (action === 'dismiss-cancel') { cancelConfirmation = null; renderOrders(); }
      else if (action === 'confirm-cancel') cancelOrder(target.dataset.order);
      return true;
    }

    function handleChange(event) {
      const field = event.target?.dataset?.econField;
      if (!field || !visible('market') || marketCategory === 'cards' || !root('market')?.contains(event.target)) return false;
      if (field === 'item') switchMarketItem(event.target.value);
      else { readDraft(); marketConfirmation = null; updateOrderForm(); }
      return true;
    }

    function refresh(kind) {
      if (kind === 'alchemy') renderAlchemy(false);
      if (kind !== 'market' || !visible('market')) return;
      updateMarketTabs();
      if (marketCategory === 'cards') {
        if (isCardsMarketVisible()) cardMarketUI?.render?.();
        return;
      }
      if (!engine.online) return;
      updateOrderForm();
      updateMarketTimers();
      if (!actionBusy && !marketLoading && Date.now() - lastMarketLoad >= 10000) loadMarket();
    }

    return {openAlchemy, openMarket, refresh, handleClick, handleChange, isCardsMarketVisible, syncCardActivity};
  }

  window.SpiritEconomyUI = Object.freeze({create});
}());
