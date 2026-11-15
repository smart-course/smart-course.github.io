/* Persistent commissions, personal collections, and real shared sect projects. */
(function (global) {
  'use strict';

  const TABS = [
    { id: 'commissions', label: '委托', full: '宗门委托', icon: 'book' },
    { id: 'codex', label: '图鉴', full: '百草与丹道图鉴', icon: 'leaf' },
    { id: 'decor', label: '洞天', full: '洞天装饰', icon: 'mountain' },
    { id: 'sect', label: '宗门', full: '宗门共建', icon: 'users' },
    { id: 'stories', label: '仙途', full: '五境故事', icon: 'spark' }
  ];
  const SCROLL_TABS = TABS.filter(item => !['decor', 'sect'].includes(item.id));
  const PERIODS = ['daily', 'weekly', 'seasonal'];
  const SEASON_GLYPHS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  // Scenic weather is independent of cultivation. A steady breeze keeps the
  // sects' cloud seas, falling leaves and lake ripples visible in every season.
  const SECT_SCENIC_WEATHER = Object.freeze({ weatherId: 'clear', weatherName: '轻风', windStrength: .22, windDirection: .65, cloudAmount: .38, weatherStartsAt: 0, weatherEndsAt: 0 });
  const DECOR_NAMES = {
    bambooFence: '青竹篱', stoneLantern: '暖玉石灯', spiritPond: '照影灵池', masterStele: '百草精通碑',
    springBanner: '春山百草旗', summerBanner: '夏夜听泉旗', autumnBanner: '秋山丰收旗', winterBanner: '雪夜丹心旗',
    sectGate: '同心山门', sectSpring: '共济灵泉', sectLibrary: '藏书小阁'
  };
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const integer = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const percent = (value, max) => max > 0 ? Math.max(0, Math.min(100, Number(value) / Number(max) * 100)) : 0;
  const remaining = ms => {
    const minutes = Math.max(0, Math.ceil(ms / 60000));
    if (!minutes) return '正在换新';
    const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
    return days ? `${days}天${hours}小时` : hours ? `${hours}小时${rest}分` : `${rest}分钟`;
  };
  const duration = ms => {
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
    return `${hours ? hours + '小时' : ''}${minutes ? minutes + '分钟' : ''}${seconds ? seconds + '秒' : ''}` || '0秒';
  };

  function decorArt(id, themeId) {
    if (typeof global.spiritHomesteadArt === 'function') {
      const illustration = global.spiritHomesteadArt(id, {
        className: 'journey-decor-art journey-homestead-art', themeId
      });
      if (illustration) return illustration;
    }
    // A saved school keeps its own commemorative name and palette. This fallback
    // also supports older script bundles while every current portrait is shared.
    const stage = { sectGate: 'gate', sectSpring: 'spring', sectLibrary: 'library' }[id];
    return stage && themeId && typeof global.spiritSectArt === 'function'
      ? global.spiritSectArt(themeId, { stage, className: 'journey-decor-art' }) : '';
  }

  global.createSpiritJourneyUI = function (options) {
    const engine = options.engine, E = options.esc || escapeText;
    const I = options.icon || (name => `<svg class="icon" aria-hidden="true"><use href="#i-${E(name)}"/></svg>`);
    const F = options.fmt || (value => integer(value).toLocaleString('zh-CN'));
    const definitions = global.SpiritGame || {};
    const crops = definitions.CROPS || [], pills = definitions.PILLS || [], realms = definitions.REALMS || [];
    const cropMap = Object.fromEntries(crops.map(c => [c.id, c]));
    const pillMap = Object.fromEntries(pills.map(p => [p.id, p]));
    const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    const pageMode = typeof options.openPage === 'function';
    let tab = 'commissions', codexKind = 'herbs', decorKind = 'scenery', expandedStory = null, actionBusy = '', signature = '', disposed = false, pageOpened = false;
    let feedback = null, confirmation = null, sectRefreshing = false, sectLoadError = '', sectFallback = null, sectRefreshQueued = null;
    let previousDecor = '', previousSectActive = null, selectedSectId = '', sectSelectionManual = false, sectInfoOpen = false, sectInfoScroll = 0;
    let sectScene = null, sectSceneHost = null, sectSceneError = '', sectViewFocus = 'overview', sectRevealFrame = 0;
    let sectDaylightMode = 'live';
    let courtDraft = null, courtSelectedSlot = 'westFront', courtConflict = '', courtPreview = false;
    const draft = { donationCrop: '', donationQuantity: '1' };
    const detailState = new Map();
    const gameNow = () => typeof engine.now === 'function' ? engine.now() : global.SpiritClock?.now?.() ?? Date.now();
    const now = () => typeof options.now === 'function' ? options.now() : gameNow();
    const root = () => document.getElementById('journey-root');
    const content = () => root()?.querySelector('.game-window-body') || (typeof options.getContent === 'function' ? options.getContent() : pageMode ? document.scrollingElement : document.getElementById('dialog-content'));
    const sectContent = () => root()?.querySelector('.game-sect-info-content');
    const getWindow = () => disposed || !(pageMode ? pageOpened : options.getDialogKind?.() === 'journey') ? '' : tab === 'sect' ? sectInfoOpen ? 'sect-info' : '' : tab === 'decor' ? 'decor' : 'journey';
    const isVisible = () => !disposed && !!root() && (pageMode
      ? pageOpened && (typeof options.isPageVisible !== 'function' || options.isPageVisible())
      : options.getDialogKind() === 'journey' && !!document.getElementById('game-dialog')?.open);
    const busy = () => !!(actionBusy || engine.busy || engine.pending);
    const date = value => Number.isFinite(value) && value > 0 ? dateFormatter.format(value) : '尚未记录';
    const termDate = value => Number.isFinite(value) && value > 0 ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value) : '待周日结算';
    const realmName = index => realms[index]?.name || '炼气';
    const art = id => typeof options.art === 'function' ? options.art(id, true) : typeof global.spiritPlantArt === 'function' ? global.spiritPlantArt(id, 120, 'mature') : I('leaf');
    const attr = (name, value) => ` data-journey-${name}="${E(value)}"`;
    const button = (action, label, extra = '', disabled = false, style = 'primary') => `<button type="button" class="button button-${style} journey-button" data-journey-action="${action}"${extra}${disabled || busy() ? ' disabled' : ''}>${label}</button>`;
    const key = value => attr('focus', value);
    const note = text => `<div class="journey-note">${I('leaf')}<p>${text}</p></div>`;

    function getData() {
      return {
        journey: engine.getJourneyInfo?.() || { since: now(), title: '山中初客', totals: {}, achievements: [] },
        codex: engine.getCodexInfo?.() || { since: now(), herbs: [], pills: [] },
        decor: engine.getDecorInfo?.() || { maxEquipped: 6, equipped: [], items: [] },
        residence: engine.getResidenceInfo?.() || { maxEquipped: 1, owned: [], equipped: null, items: [] },
        stories: engine.getStoryInfo?.() || { chapters: [], readCount: 0, total: 5 },
        sect: engine.sect || sectFallback,
        starter: engine.getQuests?.() || []
      };
    }
    function getSummary() {
      const j = engine.getJourneyInfo?.();
      if (!j) return { claimable: 0, dailyClaimed: 0, dailyLimit: 2, title: '山中初客' };
      const claimable = PERIODS.reduce((sum, p) => sum + Math.min(integer(j[p]?.remainingClaims), (j[p]?.quests || []).filter(q => q.canClaim).length), 0)
        + (j.achievements || []).filter(q => q.canClaim).length;
      return { claimable, dailyClaimed: integer(j.daily?.claimedCount), dailyLimit: integer(j.daily?.claimLimit) || 2, title: j.title || '山中初客' };
    }
    function progressMarkup(value, target, label) {
      return `<div class="journey-progress" role="progressbar" aria-label="${E(label)}" aria-valuemin="0" aria-valuemax="${integer(target)}" aria-valuenow="${Math.min(integer(value), integer(target))}"><span style="width:${percent(value, target).toFixed(2)}%"></span></div>`;
    }
    function rewardLabel(reward, supplied, decor) {
      if (supplied) return E(supplied);
      const parts = [];
      if (reward?.stones) parts.push(`${F(reward.stones)} 灵石`);
      if (reward?.qi) parts.push(`${F(reward.qi)} 修为`);
      if (reward?.decorationId) parts.push(decor?.items?.find(d => d.id === reward.decorationId)?.name || DECOR_NAMES[reward.decorationId] || '洞天装饰');
      if (reward?.title) parts.push(`称号「${reward.title}」`);
      return E(parts.join(' · ') || '留一份修行纪念');
    }
    function confirmMarkup(kind, text, label) {
      return `<div class="journey-confirm" role="group" aria-label="${E(label)}"><p>${text}</p><div>${button('confirm', E(label), key(`confirm-${kind}`))}${button('cancel-confirm', '再想一想', key(`cancel-${kind}`), false, 'quiet')}</div></div>`;
    }
    function questCard(q, period, ordinal, data) {
      const capped = !q.claimed && q.ready && !period.remainingClaims;
      let label = q.claimed ? '已领取' : capped ? '今日名额已用完' : q.delivery ? '交付并领奖' : '领取奖励';
      if (!q.claimed && !q.canClaim && !capped) label = '尚待完成';
      const actionKey = `commission-${period.period}-${q.id}`;
      const confirm = confirmation?.kind === 'delivery' && confirmation.id === q.id && confirmation.period === period.period;
      const material = q.delivery;
      return `<article class="journey-quest${q.claimed ? ' is-claimed' : q.canClaim ? ' is-ready' : ''}">
        <div class="journey-quest-top"><span class="journey-small-label">${period.period === 'daily' ? '日课' : period.period === 'weekly' ? '周令' : '雅集'} ${String(ordinal + 1).padStart(2, '0')}</span><span class="journey-state-tag${q.canClaim ? ' is-ready' : ''}">${q.claimed ? I('check') + '已收好' : q.canClaim ? '可领取' : capped ? '已完成' : '进行中'}</span></div>
        <h4>${E(q.name)}</h4><p class="journey-card-description">${E(q.description)}</p>
        <div class="journey-progress-caption"><span>${material ? '现有材料' : '修行进度'}</span><b>${F(Math.min(integer(q.progress), integer(q.target)))}<small> / ${F(q.target)}</small></b></div>
        ${progressMarkup(q.progress, q.target, q.name)}
        <div class="journey-reward">${I(q.reward?.stones ? 'gem' : 'spark')}<span>${rewardLabel(q.reward, q.rewardLabel, data.decor)}</span></div>
        ${material ? `<p class="journey-delivery-note">领奖时交付 ${F(material.quantity)} 份${E(material.name)}。</p>` : ''}
        ${button('claim-commission', label, attr('period', period.period) + attr('id', q.id) + key(actionKey), !q.canClaim || !!confirmation, q.canClaim ? 'primary' : 'secondary')}
        ${q.reason && !q.canClaim && !q.claimed && !capped ? `<small class="journey-card-reason">${E(q.reason)}</small>` : ''}
        ${confirm ? confirmMarkup('delivery', `交付 <strong>${F(material.quantity)} 份${E(material.name)}</strong>，领取${rewardLabel(q.reward, q.rewardLabel, data.decor)}。交付后材料从乾坤袋扣除。`, '确认交付') : ''}
      </article>`;
    }
    function periodMarkup(period, data) {
      if (!period) return '';
      const p = period.period, seasonal = p === 'seasonal';
      const intro = p === 'daily' ? '今日三件小事，任选两项领取奖励。照自己的节奏来。' : p === 'weekly' ? '种田、炼丹，也为宗门备一些药材。每周一换新。' : period.calendarTransition ? '旧历的进度与领奖记录为你保留到下一次换季。之后，雅集将随你初次入境起算的四季轮转。' : '四时有雅集，随初次入境起算的七日季节轮转，完成目标即可收藏应季庭幡。';
      const heading = seasonal && period.festival ? `${period.calendarTransition?'旧历雅集 · ':''}${period.seasonName} · ${period.festival}` : period.label || (p === 'daily' ? '今日委托' : p === 'weekly' ? '本周委托' : '四时雅集');
      return `<section class="journey-period${seasonal ? ' journey-season-period' : ''}"${seasonal ? ` data-season="${E(period.seasonId || 'spring')}"` : ''}>
        <div class="journey-section-heading"><div>${seasonal ? `<span class="journey-season-seal" aria-hidden="true">${SEASON_GLYPHS[period.seasonId] || '季'}</span>` : ''}<div><span class="journey-eyebrow">${p === 'daily' ? '每日 · 一点积累' : p === 'weekly' ? '每周 · 一步长进' : '七日一季 · 山中雅事'}</span><h3>${E(heading)}</h3></div></div><span class="journey-quota">已领 <b>${F(period.claimedCount)}</b> / ${F(period.claimLimit)}</span></div>
        <p class="journey-section-intro">${intro}</p>
        <div class="journey-quest-grid${(period.quests || []).length === 1 ? ' has-one' : ''}">${(period.quests || []).map((q, i) => questCard(q, period, i, data)).join('')}</div>
        <div class="journey-period-footer"><span>${I('clock')}<time data-journey-until="${integer(period.endsAt)}"></time>后换新</span><span>北京时间 · ${p === 'daily' ? '每日 00:00' : p === 'weekly' ? '每周一 00:00' : '随洞天四季'}</span></div>
      </section>`;
    }
    function achievementsMarkup(data) {
      const achievements = data.journey.achievements || [];
      if (!achievements.length) return '';
      const claimed = achievements.filter(a => a.claimed).length;
      return `<section class="journey-achievements"><div class="journey-section-heading"><div><div><span class="journey-eyebrow">把修行留作纪念</span><h3>山中成就</h3></div></div><span class="journey-quota">已藏 <b>${claimed}</b> / ${achievements.length}</span></div><div class="journey-achievement-grid">${achievements.map(a => `<article class="journey-achievement${a.claimed ? ' is-claimed' : a.canClaim ? ' is-ready' : ''}"><div class="journey-achievement-seal" aria-hidden="true">${I(a.claimed ? 'check' : a.canClaim ? 'spark' : 'leaf')}</div><div class="journey-achievement-copy"><h4>${E(a.name)}</h4><p>${E(a.description)}</p><small>${rewardLabel(a.reward, a.rewardLabel, data.decor)}</small>${progressMarkup(a.progress, a.target, a.name)}<span class="journey-achievement-count">${F(Math.min(integer(a.progress), integer(a.target)))} / ${F(a.target)}</span></div>${button('claim-achievement', a.claimed ? '已收藏' : a.canClaim ? '收下纪念' : '未达成', attr('id', a.id) + key(`achievement-${a.id}`), !a.canClaim, a.canClaim ? 'primary' : 'secondary')}</article>`).join('')}</div></section>`;
    }
    function commissionsMarkup(data) {
      const starter = data.starter || [];
      return PERIODS.map(p => periodMarkup(data.journey[p], data)).join('') + achievementsMarkup(data) +
        `<details class="journey-details journey-starter" data-journey-detail="starter"${detailState.get('starter') ? ' open' : ''}><summary><span>入门小记</span><small>每项仅领一次 · ${starter.filter(q => q.claimed).length} / ${starter.length}</small>${I('arrow')}</summary><div class="journey-starter-list">${starter.map(q => `<article><div><h4>${E(q.name)}</h4><p>${E(q.desc)}</p><small>${F(q.progress)} / ${F(q.target)} · ${rewardLabel(q.reward)}</small></div>${button('claim-starter', q.claimed ? '已领取' : q.progress >= q.target ? '领取' : '未完成', attr('id', q.id) + key(`starter-${q.id}`), q.claimed || q.progress < q.target, 'secondary')}</article>`).join('')}</div></details>` +
        note('日常与周委托只奖励灵石，雅集与成就用于收藏装饰和称号。服丹仍受每日 3 颗、合计 30 修为的额度约束。');
    }
    function masteryMarkup(record, type) {
      const mastery = record.mastery || {}, count = type === 'herbs' ? integer(record.harvests) : integer(record.brews), unit = type === 'herbs' ? '田' : '炉';
      return `<div class="journey-mastery"><span class="journey-mastery-rank" data-level="${integer(mastery.level)}">${I(integer(mastery.level) ? 'spark' : 'leaf')}${E(mastery.name || '初识草木')}</span><span>${mastery.maxed ? '此道已熟稔' : `下一阶 ${F(mastery.nextTarget || mastery.target)} ${unit}`}</span></div>${progressMarkup(count, mastery.maxed ? Math.max(1, count) : integer(mastery.nextTarget || mastery.target) || 1, `${record.name}熟练度`)}<div class="journey-mastery-total"><b>${F(count)}</b><span>${type === 'herbs' ? '田亲手采收' : '炉亲手炼成'}</span>${type === 'herbs' ? `<small>累计 ${F(record.units)} 份</small>` : ''}</div>`;
    }
    function herbCodex(record) {
      const crop = { ...cropMap[record.id], ...record }, detailId = `herb-${crop.id}`;
      const first = record.firstHarvestAt ? `初获 · ${date(record.firstHarvestAt)}` : '等一场亲手照料的丰收';
      return `<article class="journey-codex-card${record.unlocked ? '' : ' is-locked'}"><div class="journey-codex-heading"><span class="journey-small-label">${E(crop.rarity || '灵植')} · ${E(realmName(crop.minRealm))}</span><span class="journey-codex-unlock">${record.unlocked ? '已可栽种' : I('lock') + realmName(crop.minRealm) + '可种'}</span></div><div class="journey-herb-intro"><div class="journey-herb-art">${art(crop.id)}</div><div><h3>${E(crop.name)}</h3><p>${E(crop.short || '草木有灵，耕有所成')}</p><small>${E(first)}</small></div></div><p class="journey-codex-description">${E(crop.description)}</p>${masteryMarkup(record, 'herbs')}<details class="journey-details journey-crop-details" data-journey-detail="${E(detailId)}"${detailState.get(detailId) ? ' open' : ''}><summary><span>栽培与收成</span>${I('arrow')}</summary><dl class="journey-codex-facts"><div><dt>播种费用</dt><dd>${F(crop.price)} 灵石</dd></div><div><dt>最快成熟</dt><dd>${duration(crop.growTime)}</dd></div><div><dt>浇水间隔</dt><dd>${duration(crop.waterIntervals?.[0] || crop.growTime / 3)}</dd></div><div><dt>浇水工序</dt><dd>共 4 次</dd></div><div><dt>每田产量</dt><dd>${F(crop.yield)} 份</dd></div><div><dt>药铺回收</dt><dd>${F(crop.sellPrice)} 灵石 / 份</dd></div><div><dt>完整收成售价</dt><dd>${F(crop.yield * crop.sellPrice)} 灵石</dd></div><div><dt>首次播种</dt><dd>${date(record.firstPlantedAt)}</dd></div></dl><p class="journey-codex-record">已播 ${F(record.planted)} 田 · 已浇 ${F(record.watered)} 次</p></details></article>`;
    }
    function pillCodex(record) {
      const pill = { ...pillMap[record.id], ...record }, detailId = `pill-${pill.id}`;
      return `<article class="journey-codex-card journey-pill-card${record.unlocked ? '' : ' is-locked'}"><div class="journey-codex-heading"><span class="journey-small-label">${E(realmName(pill.minRealm))}丹方</span><span class="journey-codex-unlock">${record.unlocked ? '已可炼制' : I('lock') + realmName(pill.minRealm) + '可炼'}</span></div><div class="journey-herb-intro"><span class="journey-pill-art" data-grade="${integer(pill.minRealm)}" aria-hidden="true">${window.spiritPillArt ? window.spiritPillArt(pill.id,{size:120,className:'pill-portrait-image'}) : '<i></i><b>丹</b>'}</span><div><h3>${E(pill.name)}</h3><p>服用提升 ${F(pill.qi)} 修为</p><small>${record.firstBrewAt ? `初成 · ${date(record.firstBrewAt)}` : '等一炉药香入匣'}</small></div></div>${masteryMarkup(record, 'pills')}<details class="journey-details journey-crop-details" data-journey-detail="${E(detailId)}"${detailState.get(detailId) ? ' open' : ''}><summary><span>丹方与炉火</span><small>${duration(pill.brewTime)}</small>${I('arrow')}</summary><div class="journey-recipe">${Object.entries(pill.ingredients || {}).map(([id, quantity]) => `<span>${E(cropMap[id]?.name || id)}<b>×${F(quantity)}</b></span>`).join('')}</div><p class="journey-codex-record">每炉 ${F(pill.cost)} 灵石 · 成丹 1 颗</p>${options.onAlchemy ? button('alchemy', '前往炼丹阁', attr('id', pill.id) + key(`alchemy-${pill.id}`), false, 'secondary') : ''}</details></article>`;
    }
    function codexMarkup(data) {
      const collection = data.codex, herbs = collection.herbs || [], pillRecords = collection.pills || [];
      return `<section class="journey-codex"><div class="journey-section-heading"><div><div><span class="journey-eyebrow">草木有记 · 丹道有成</span><h3>${codexKind === 'herbs' ? '百草生香' : '炉火知味'}</h3></div></div><span class="journey-quota">已留名 <b>${codexKind === 'herbs' ? herbs.filter(c => c.harvests > 0).length : pillRecords.filter(p => p.brews > 0).length}</b> / ${codexKind === 'herbs' ? herbs.length : pillRecords.length}</span></div><div class="journey-subtabs" role="group" aria-label="图鉴分类"><button type="button" data-journey-action="codex-kind" data-journey-id="herbs" data-journey-focus="codex-herbs" aria-pressed="${codexKind === 'herbs'}">${I('leaf')}草木谱 <small>${herbs.length}</small></button><button type="button" data-journey-action="codex-kind" data-journey-id="pills" data-journey-focus="codex-pills" aria-pressed="${codexKind === 'pills'}">${I('fire')}丹道谱 <small>${pillRecords.length}</small></button></div><p class="journey-section-intro">${codexKind === 'herbs' ? '亲手采收 1、10、40 田，逐渐熟悉每一味灵植。' : '亲手炼成并领取 1、5、20 炉，留下不同丹方的熟练印记。'}</p><div class="journey-codex-grid">${(codexKind === 'herbs' ? herbs : pillRecords).map(c => codexKind === 'herbs' ? herbCodex(c) : pillCodex(c)).join('')}</div><p class="journey-caption">分品种记录始于 ${date(collection.since)}。买入或偷采的灵草、买入的丹药不计入亲手培育记录。</p>${note(codexKind === 'herbs' ? '播种后立即浇第 1 次水，之后每养足一段再浇水，第 4 次成熟。晚浇会顺延；离线期间继续计算当前等待，不会跳过工序。' : '图鉴熟练度用于记录与纪念。每日服丹上限适用于所有丹药，购买的丹药也计入当天额度。')}</section>`;
    }
    function purchaseConfirmation(kind, item) {
      if (confirmation?.kind !== kind || confirmation.id !== item.id) return '';
      if(kind==='tree-purchase'){
        const copy=global.SpiritHomestead?.getScenery(item.nextInstanceId)?.copyIndex||item.ownedCount+1;
        return confirmMarkup(`${kind}-${item.id}`,`花费 <strong>${F(item.cost)} 灵石</strong>置办「${E(item.name)} · 第 ${F(copy)} 棵」？<br>这棵树会独立收藏，可单独布置、移动与收起。每棵占 1 个小景位。`,`确认置办 · ${F(item.cost)} 灵石`);
      }
      const after = kind === 'residence-purchase' ? '置办后永久收藏，可免费入住或切换宅邸。' : '置办后永久收藏，再选择布置到洞天。';
      return confirmMarkup(`${kind}-${item.id}`, `花费 <strong>${F(item.cost)} 灵石</strong>置办「${E(item.name)}」？<br>${after}`, `确认置办 · ${F(item.cost)} 灵石`);
    }
    function sceneryCard(item, d) {
      const full = !item.equipped && d.equipped.length >= d.maxEquipped;
      const label = item.equipped ? '收起装饰' : item.owned ? full ? '先收起一件' : '布置到洞天' : item.cost > 0 ? `${F(item.cost)} 灵石 · 置办` : '等待解锁';
      return `<article class="journey-decor-card${item.equipped ? ' is-equipped' : ''}${!item.owned && !item.cost ? ' is-locked' : ''}" data-scenery-card="${E(item.id)}"><div class="journey-decor-picture">${decorArt(item.id, item.themeSectId || d.themes?.[item.id])}${item.equipped ? `<span class="journey-equipped-badge">${I('check')}已布置</span>` : item.owned ? '<span class="journey-owned-badge">已收藏</span>' : ''}</div><div class="journey-decor-copy"><h4>${E(item.name)}</h4><p>${E(item.description)}</p><small>${E(item.source || (item.cost ? '灵石置办' : '修行解锁'))}</small>${button(item.owned ? 'equip-decoration' : 'buy-decoration', label, attr('id', item.id) + key(`decoration-${item.id}`), item.owned ? full : !item.canBuy, item.equipped ? 'secondary' : item.owned || item.canBuy ? 'primary' : 'secondary')}${item.equipped && options.onEditDecor ? button('edit-layout', '调整位置', attr('id', item.id) + key(`position-${item.id}`), false, 'quiet') : ''}${item.reason && !item.owned && !item.canBuy ? `<span class="journey-card-reason">${E(item.reason)}</span>` : ''}${purchaseConfirmation('decor-purchase', item)}</div></article>`;
    }
    function treeCard(group,d){
      const next=global.SpiritHomestead?.getScenery(group.nextInstanceId),detailId=`trees-${group.id}`;
      const owned=d.items.filter(item=>item.repeatable&&item.speciesId===group.id&&item.owned).sort((a,b)=>a.copyIndex-b.copyIndex);
      const remaining=integer(group.remaining),full=d.equipped.length>=d.maxEquipped;
      const label=remaining?`${F(group.cost)} 灵石 · 置办第 ${F(next?.copyIndex||group.ownedCount+1)} 棵`:`已集齐 ${F(group.maxCopies)} 棵`;
      const rows=owned.map(item=>{
        const name=`${group.name} · 第 ${item.copyIndex} 棵`,placed=d.equipped.includes(item.id);
        return `<li data-tree-instance="${E(item.id)}" class="${placed?'is-equipped':''}"><div class="journey-tree-instance-heading"><strong>第 ${F(item.copyIndex)} 棵</strong><span>${placed?'已布置':'待布置'}</span></div><div class="journey-tree-instance-actions">${button('equip-decoration',placed?'收起这棵':full?'小景位已满':'布置这棵',attr('id',item.id)+key(`decoration-${item.id}`)+` aria-label="${E(placed?'收起':'布置')}${E(name)}"`,!placed&&full,placed?'secondary':'primary')}${placed&&options.onEditDecor?button('edit-layout','调整位置',attr('id',item.id)+key(`position-${item.id}`)+` aria-label="调整${E(name)}的位置"`,false,'quiet'):''}</div></li>`;
      }).join('');
      return `<article class="journey-decor-card journey-tree-card${group.equippedCount?' is-equipped':''}" data-scenery-card="${E(group.id)}" data-tree-species="${E(group.id)}"><div class="journey-decor-picture">${decorArt(group.id)}<span class="journey-owned-badge">同种可布置多棵</span></div><div class="journey-decor-copy"><h4>${E(group.name)}</h4><p>${E(group.description)}</p><div class="journey-tree-counts"><span>拥有 <b>${F(group.ownedCount)}</b> / ${F(group.maxCopies)} 棵</span><span>已布置 <b>${F(group.equippedCount)}</b> 棵</span></div><small>每棵占 1 个小景位 · 分别移动与旋转</small>${button('buy-decoration',label,attr('id',group.id)+key(`purchase-${group.id}`),!group.canBuy,group.canBuy?'primary':'secondary')}${group.reason&&!group.canBuy?`<span class="journey-card-reason">${E(group.reason)}</span>`:''}${purchaseConfirmation('tree-purchase',group)}${owned.length?`<details class="journey-details journey-tree-instances" data-journey-detail="${E(detailId)}"${(detailState.get(detailId)??true)?' open':''}><summary><span>逐棵布置</span><small>${F(owned.length)} 棵</small>${I('arrow')}</summary><ul aria-label="${E(group.name)}的独立树木">${rows}</ul></details>`:''}</div></article>`;
    }
    function sceneryMarkup(data) {
      const d = data.decor, freshIds = new Set((global.SpiritHomestead?.scenery || []).map(item => item.id));
      const singles=d.items.filter(item=>!item.repeatable),trees=d.treeGroups||[];
      const cards=singles.filter(item=>freshIds.has(item.id)).map(item=>sceneryCard(item,d)).join('')+trees.map(group=>treeCard(group,d)).join('')+singles.filter(item=>!freshIds.has(item.id)).map(item=>sceneryCard(item,d)).join('');
      return `<div class="journey-decor-grid">${cards}</div>`;
    }
    function residenceMarkup(data) {
      const r = data.residence;
      const portraits = id => typeof global.spiritHomesteadArt === 'function' ? global.spiritHomesteadArt(id, { className: 'journey-residence-art' }) : I('mountain');
      return `<div class="journey-residence-grid">${r.items.map((item, index) => {
        const label = item.equipped ? '收起宅邸' : item.owned ? '入住此宅' : `${F(item.cost)} 灵石 · 置办`;
        const features = Array.isArray(item.features) ? item.features : [];
        return `<article class="journey-residence-card${item.equipped ? ' is-equipped' : ''}" data-residence-card="${E(item.id)}"><div class="journey-residence-picture">${portraits(item.id)}<span class="journey-residence-type">${E(item.title || '山中居所')}</span>${item.equipped ? `<span class="journey-equipped-badge">${I('check')}已入住</span>` : item.owned ? '<span class="journey-owned-badge">已置办</span>' : ''}</div><div class="journey-residence-copy"><div class="journey-residence-heading"><span class="journey-residence-number" aria-hidden="true">${['壹','贰','叁','肆'][index] || '居'}</span><h4>${E(item.name)}</h4></div><p>${E(item.description)}</p>${features.length ? `<ul class="journey-residence-features" aria-label="宅邸特色">${features.map(feature => `<li>${E(feature)}</li>`).join('')}</ul>` : ''}<div class="journey-residence-price"><span>${item.owned ? '永久收藏' : '置办所需'}</span><strong>${item.owned ? '免费切换入住' : `${F(item.cost)}<small>灵石</small>`}</strong></div>${button(item.owned ? 'equip-residence' : 'buy-residence', label, attr('id', item.id) + key(`residence-${item.id}`), !item.owned && !item.canBuy, item.equipped ? 'secondary' : item.owned || item.canBuy ? 'primary' : 'secondary')}${item.reason && !item.owned && !item.canBuy ? `<span class="journey-card-reason">${E(item.reason)}</span>` : ''}${item.owned && !item.equipped ? '<span class="journey-residence-place-note">入住后安放在洞天右上角。</span>' : ''}${purchaseConfirmation('residence-purchase', item)}</div></article>`;
      }).join('')}</div>`;
    }
    function decorMarkup(data) {
      const isResidence = decorKind === 'residences', d = data.decor, r = data.residence;
      const current = r.items.find(item => item.id === r.equipped && item.owned);
      const detailId = isResidence ? 'residence-help' : 'decor-help';
      const help = isResidence
        ? `<p>${current ? `「${E(current.name)}」已安放在洞天右上角。` : '尚未入住宅邸，可挑选一处喜欢的山中住所。'}同时展示一栋，不占庭院小景的 ${F(d.maxEquipped)} 个位置。</p><p>宅邸只用于展示，不增加收益或缩短等待。置办后永久收藏，入住、收起与更换已拥有的宅邸均不再花费灵石。</p>`
        : `<p>荷池、亭与花树之外，还可添置苍翠松、青冠榕和垂丝柳；每种最多 6 棵，每棵独立占 1 个小景位。${E(realmName(engine.state.realm))}可同时布置 ${F(d.maxEquipped)} 件，仙友来访时也能看见。化神可摆放全部小景。</p>${Array.isArray(d.realmLimits) ? `<div class="journey-decor-realm-limits" aria-label="境界与小景名额">${d.realmLimits.map(item => `<span class="${item.realm === engine.state.realm ? 'is-current' : ''}">${E(item.name)} <b>${F(item.limit)}</b></span>`).join('')}</div>` : ''}<p>先收藏并布置小景，再编辑位置。可在田园空地拖动或轻点摆放，也能旋转与微调。同种树木有各自编号，满意后再保存。</p><p>庭院小景与称号只用于展示，不增加产量、修为，也不缩短灵草等待时间。已收藏的小景可反复布置与收起。</p>`;
      const owned = isResidence ? `已置办 ${r.items.filter(item => item.owned).length} / ${r.items.length} 栋${current ? ` · 入住 ${E(current.name)}` : ' · 未入住'}` : `已收藏 ${d.items.filter(item => item.owned).length} / ${d.items.length} 件`;
      const edit = !isResidence && options.onEditDecor ? button('edit-layout', I('grid') + '编辑布置位置', key('edit-layout') + (!d.equipped.length ? ' title="先收藏并布置一件小景，再调整位置"' : ''), !d.equipped.length, 'primary') : '';
      return `<section class="journey-decor"><div class="game-decor-toolbar"><div class="journey-subtabs journey-home-subtabs" role="group" aria-label="洞天布置分类"><button type="button" data-journey-action="decor-kind" data-journey-id="scenery" data-journey-focus="decor-scenery" aria-pressed="${!isResidence}">${I('leaf')}庭院小景</button><button type="button" data-journey-action="decor-kind" data-journey-id="residences" data-journey-focus="decor-residences" aria-pressed="${isResidence}">${I('mountain')}山居宅邸</button></div>${edit}</div><div class="game-decor-status"><div class="journey-decor-wallet"><span>${I('gem')}可用灵石 <b>${F(engine.state.stones)}</b></span><span>${owned}</span></div><details class="game-window-help journey-details" data-journey-detail="${detailId}"${detailState.get(detailId) ? ' open' : ''}><summary><span>${isResidence ? '宅邸说明' : '布置说明'}</span>${I('arrow')}</summary><div class="game-decor-help-content">${help}</div></details></div>${isResidence ? residenceMarkup(data) : sceneryMarkup(data)}</section>`;
    }
    function sectMaterials(sect) {
      if (!ownSectReady(sect) || selectedSectId !== sect.group.sectId) return [];
      if (sect.group.maintenance) return [sect.group.maintenance];
      return sect.group.stages.find(s => s.id === sect.group.currentStageId)?.requirements.filter(r => r.remaining > 0) || [];
    }
    function donationInfo(sect) {
      const materials = sectMaterials(sect);
      if (!materials.length) return null;
      if (!materials.some(m => m.cropId === draft.donationCrop)) draft.donationCrop = materials.find(m => engine.state.bag[m.cropId] > 0)?.cropId || materials[0].cropId;
      const crop = materials.find(m => m.cropId === draft.donationCrop);
      const owned = integer(engine.state.bag[crop.cropId]), maximum = Math.min(integer(crop.remaining), integer(sect.daily.left), owned);
      const quantity = /^\d{1,3}$/.test(draft.donationQuantity) ? Number(draft.donationQuantity) : 0;
      return { crop, materials, owned, maximum, quantity, valid: Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= maximum };
    }
    function sectCatalog(sect) {
      return global.SpiritSects?.list || (Array.isArray(sect?.catalog) ? sect.catalog : []);
    }
    function assignedSect(sect) {
      if (!engine.online || sect?.membership?.mode !== 'external' || sect.membership.status !== 'assigned') return null;
      return sectCatalog(sect).find(school => school.id === sect.membership.sectId) || null;
    }
    function ownSectReady(sect) {
      const school = assignedSect(sect);
      return !!(school && sect?.group?.sectId === school.id && !sectLoadError && !engine.sectError);
    }
    function selectedVisit(sect) {
      if (!engine.online || sectLoadError || engine.sectError) return null;
      const visit = [engine.sectVisit, sect?.publicVisit].find(value => value?.sectId === selectedSectId);
      if (visit) return visit;
      // Older snapshots can still show one's own construction; another school's
      // canvas must never accidentally inherit the viewer's private group.
      if (ownSectReady(sect) && sect.group.sectId === selectedSectId) return sect.group;
      return null;
    }
    function mayManage(sect, visit = selectedVisit(sect)) {
      const governance = visit?.governance;
      return !!(ownSectReady(sect) && assignedSect(sect)?.id === selectedSectId && visit?.sectId === selectedSectId &&
        governance?.source?.kind === 'host_site' && governance.source.status === 'ready' && governance.leader?.source === 'host_site' &&
        governance?.permissions?.canManage === true && governance.status === 'active' && governance.leader?.isSelf === true &&
        Number(governance.termStart) <= now() && Number(governance.termEnd) > now());
    }
    const layoutCopy = list => (Array.isArray(list) ? list : []).map(entry => ({ slotId: entry.slotId, itemId: entry.itemId, rotation: entry.rotation }));
    const courtCatalog = () => global.SpiritSectGovernance;
    function startCourtDraft(sect) {
      const visit = selectedVisit(sect);
      if (!mayManage(sect, visit) || !courtCatalog() || !Number.isSafeInteger(visit.courtyard?.revision)) return;
      courtDraft = { sectId: selectedSectId, revision: visit.courtyard.revision, termStart: visit.governance.termStart,
        layout: layoutCopy(visit.courtyard.layout), initiativeId: visit.initiativeId || courtCatalog().defaultInitiativeId, greetingId: visit.greetingId || courtCatalog().defaultGreetingId,
        layoutDirty: false, initiativeDirty: false, greetingDirty: false };
      courtSelectedSlot = courtCatalog().slots[0].id; courtConflict = ''; courtPreview = false;
    }
    function validateCourtDraft(sect, visit) {
      if (!courtDraft || courtDraft.sectId !== selectedSectId) return;
      if (!visit || sectLoadError || engine.sectError) { courtConflict = '宗门近况尚未同步，暂不能保存。请同步后重新载入庭院。'; return; }
      if (visit.governance?.permissions?.canManage !== true || visit.governance.status !== 'active' || Number(visit.governance.termEnd) <= now()) {
        courtConflict = '宗主任期或归属已更新。草稿尚未发布，新的宗主将接续布置。'; return;
      }
      if (visit.courtyard?.revision !== courtDraft.revision || visit.governance.termStart !== courtDraft.termStart) courtConflict = '庭院版本或宗主任期已更新。请重新载入最新庭院，再开始布置。';
    }
    function courtEditing(sect) { return !!(courtDraft?.sectId === selectedSectId && mayManage(sect) && !courtConflict); }
    function courtState(sect, visit) {
      const editingHere = courtDraft?.sectId === selectedSectId;
      return { sectId: selectedSectId, authoritative: !!visit, stages: visit?.stages || [],
        layout: editingHere ? courtDraft.layout : visit?.courtyard?.layout || courtCatalog()?.defaultLayout || [],
        editing: editingHere && courtEditing(sect) && !courtPreview, selectedSlot: courtSelectedSlot };
    }
    function sectDaylight() {
      const actual = global.SpiritEnvironment?.getDaylight?.(now());
      if (!actual || sectDaylightMode === 'live') return actual || null;
      const day = sectDaylightMode === 'day';
      return { ...actual, phaseId: day ? 'day' : 'night', phaseName: day ? '白昼' : '夜晚', daylight: day ? 1 : 0 };
    }
    function sectWeather() {
      return { ...SECT_SCENIC_WEATHER };
    }
    const sectWeatherText = weather => `山景天气：${weather.weatherName}`;
    const sectClimateText = (school, sky) => [school?.displayClimate, sky?.phaseName].filter(Boolean).join(' · ');
    const sectAtmosphere = (school, sky) => school?.atmosphere?.phases?.[sky?.phaseId] || school?.atmosphere;
    function syncSectDaylight() {
      if (!isVisible() || tab !== 'sect' || document.hidden) return;
      const sky = sectDaylight(), school = global.SpiritSects?.get(selectedSectId);
      if (!sky || !school) return;
      // This runs even when the account/render signature has not changed. A
      // clock boundary never rebuilds the scene, clears drafts or writes state.
      sectScene?.setDaylight?.(sky);
      const host = root(), tour = host?.querySelector('.journey-sect-tour');
      if (tour) { tour.dataset.dayPhase = sky.phaseId; tour.dataset.skyPreview = sectDaylightMode; }
      const setText = (selector, text) => { const node = host?.querySelector(selector); if (node && node.textContent !== text) node.textContent = text; };
      const climate = sectClimateText(school, sky), atmosphere = sectAtmosphere(school, sky);
      setText('[data-sect-climate-text]', climate);
      host?.querySelector('.journey-sect-climate')?.setAttribute('aria-label', '宗门风景：' + climate);
      setText('[data-sect-clock]', '北京时间 ' + sky.clockText);
      setText('[data-sect-light-status]', sectDaylightMode === 'live' ? '昼夜随此刻' : '本次赏景预览');
      setText('[data-sect-atmosphere-title]', atmosphere?.name || '山间风物');
      setText('[data-sect-atmosphere-copy]', atmosphere?.description || '');
      host?.querySelectorAll('[data-journey-action="sect-daylight"]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.journeyId === sectDaylightMode)));
    }
    function syncSectWeather() {
      if (!isVisible() || tab !== 'sect' || document.hidden) return;
      const weather = sectWeather(), host = root(), tour = host?.querySelector('.journey-sect-tour');
      sectScene?.setWeather?.(weather);
      if (tour) { tour.dataset.weather = weather.weatherId; tour.dataset.weatherSource = 'fixed'; }
      const node = host?.querySelector('[data-sect-weather-summary]'), text = sectWeatherText(weather);
      if (node && node.textContent !== text) node.textContent = text;
    }
    function sceneMarkup(school, visit) {
      const drafting = courtDraft?.sectId === school.id, authoritative = !!visit;
      const sky = sectDaylight(), weather = sectWeather(), climate = sectClimateText(school, sky), atmosphere = sectAtmosphere(school, sky);
      return `<section class="journey-sect-tour" data-sect-tour="${E(school.id)}"${sky ? ` data-day-phase="${E(sky.phaseId)}"` : ''} data-sky-preview="${sectDaylightMode}" data-weather="${E(weather.weatherId)}" data-weather-source="fixed" aria-label="${E(school.name)}三维游览">
        <div class="journey-sect-tour-top"><span>${I('mountain')}${E(school.name)} · 山门游览</span><div class="journey-sect-tour-meta">${climate ? `<span class="journey-sect-climate" aria-label="宗门风景：${E(climate)}"><i aria-hidden="true"></i><span data-sect-climate-text>${E(climate)}</span></span>` : ''}<small>${drafting ? courtDraft.layoutDirty ? '庭院草稿 · 尚未发布' : '庭院布置中' : authoritative ? '云端共建景观' : '规划游览 · 等待云端进度'}</small></div></div>
        <div class="journey-sect-sky-controls"><div class="journey-sect-sky-choices" role="group" aria-label="宗门昼夜赏景">${[['live','随此刻'],['day','赏昼景'],['night','赏夜景']].map(([id,label]) => `<button type="button" data-journey-action="sect-daylight"${attr('id',id)+key('sect-daylight-'+id)} aria-pressed="${sectDaylightMode === id}"${sky ? '' : ' disabled'}>${label}</button>`).join('')}</div><div class="journey-sect-clock" aria-live="off"><span data-sect-clock>${sky ? '北京时间 ' + E(sky.clockText) : '昼夜载入中'}</span><small data-sect-light-status>${sectDaylightMode === 'live' ? '昼夜随此刻' : '本次赏景预览'}</small></div></div>
        <p class="journey-sect-weather" aria-live="off"><span>${I('wind')}<span data-sect-weather-summary>${E(sectWeatherText(weather))}</span></span><small>昼夜赏景只切换光线</small></p>
        <div class="journey-sect-scene" data-sect-scene-mount><p class="journey-sect-scene-loading">${I('wind')}山色正在眼前展开…</p></div>
        ${sectSceneError ? `<p class="journey-sect-scene-error" role="status">${E(sectSceneError)}</p>` : ''}
        <div class="journey-sect-camera" aria-label="三维山景视角"><div>${button('sect-camera','左转',attr('id','left')+key('camera-left'),false,'quiet')}${button('sect-camera','右转',attr('id','right')+key('camera-right'),false,'quiet')}</div><div>${button('sect-camera','拉近 ＋',attr('id','in')+key('camera-in'),false,'quiet')}${button('sect-camera','拉远 −',attr('id','out')+key('camera-out'),false,'quiet')}${button('sect-camera','全景',attr('id','reset')+key('camera-reset'),false,'secondary')}</div></div>
        <div class="journey-sect-waypoints" role="group" aria-label="前往宗门景观">${school.stages.map(stage => {
          const status=constructionInfo(visit?.stages?.find(s=>s.id===stage.id),authoritative);
          return `<button type="button" data-journey-action="sect-focus"${attr('id',stage.id)+key(`focus-${stage.id}`)} aria-pressed="${sectViewFocus===stage.id}"><span>${E(stage.name)}</span><small>${E(status.label)}${status.phase==='preview'?'':' · '+E(status.percent)+'%'}</small></button>`;
        }).join('')}</div>
        ${atmosphere ? `<p class="journey-sect-atmosphere" data-sect-atmosphere="${E(school.id)}"><b>${I('wind')}<span data-sect-atmosphere-title>${E(atmosphere.name)}</span></b><span data-sect-atmosphere-copy>${E(atmosphere.description)}</span></p>` : ''}
        <p class="journey-sect-gesture"><span class="sect-desktop-hint">拖动旋转 · 滚轮远近 · 点选景观</span><span class="sect-mobile-hint">单指滑动页面 · 双指旋转、缩放 · 也可使用上方按钮</span></p>
      </section>`;
    }
    // 智慧课堂：宗主按课程网站实时推选（本课程本宗、修为元婴以上、排名第一；每门课各一位），没有周任期和分数公示
    function siteGovernanceMarkup(sect, visit, school, governance) {
      const leaders=(Array.isArray(governance.leaders)?governance.leaders:[]).filter(item=>item&&item.name);
      const greeting=courtCatalog().getGreeting(visit?.greetingId), initiative=courtCatalog().getInitiative(visit?.initiativeId);
      const active=leaders.length>0;
      const names=leaders.map(item=>`<h4>${E(item.name)}${(item.courses||[]).map(course=>`<small>${E(course)}</small>`).join('')}${item.isSelf?'<small>我 · 宗主</small>':''}</h4>`).join('');
      return `<section class="journey-sect-governance" data-ranking-source="host_site" data-ranking-status="ready" aria-label="${E(school.name)}宗主"><div class="journey-governance-heading"><div><span class="journey-eyebrow">课程网站修为 · 实时推选</span><h3>山门掌事</h3></div><span class="journey-governance-rule">元婴以上 · 本宗第一</span></div>
        <div class="journey-leader-card${active?' is-active':''}"><span class="journey-leader-seal" aria-hidden="true">${active?'宗':'候'}</span><div><span class="journey-small-label">${active?'现任宗主':'宗主公示'}</span>${active?names:'<h4>宗主暂缺</h4>'}<p>${active?'课程网站上本宗修为达到元婴、且排名第一的同学担任宗主（每门课各一位），排名变化后随时更新。':'本宗暂时还没有修为达到元婴的同门；课程网站上本宗修为达到元婴、且排名第一的同学，就是宗主。'}</p></div></div>
        <div class="journey-sect-welcome"><span>${I('leaf')}${greeting?E(greeting.name):'山门迎客'}</span><p>${greeting?E(greeting.text):'山门常开，欢迎道友慢赏一山风物。'}</p></div>
        ${initiative?`<div class="journey-sect-initiative"><span>本宗倡议</span><div><h4>${E(initiative.name)}</h4><p>${E(initiative.description)}</p></div></div>`:''}
        <details class="journey-details journey-leader-rules" data-journey-detail="leader-rules"${detailState.get('leader-rules')?' open':''}><summary><span>如何推选 · 宗主能做什么</span>${I('arrow')}</summary><div><p>宗主由课程网站的修为境界决定：在本课程的本宗门里，修为达到元婴及以上、且修为排名第一的同学担任宗主。两门课各推选一位，所以一座山门可能有两位宗主。</p><p>排名以课程网站为准，名次变化后宗主随之更新；当选的同学在课程网站的境界标志旁会显示“宗主”标志。</p><ul><li>布置六处公共庭位，挑选已开放的小景。</li><li>选择一项本宗共修倡议，引导同门交流与共建。</li><li>选择山门欢迎语，迎接来访道友。</li></ul><p>宗主权力用于公共建设；不增加个人修为、灵石或材料，也不改变同门归属。</p></div></details>
        ${mayManage(sect,visit)&&courtDraft?.sectId!==school.id?button('court-start','以宗主身份布置山门',key('court-start'),false,'primary'):''}
        ${courtDraft?.sectId===school.id?courtEditorMarkup(sect,visit):''}
      </section>`;
    }
    function governanceMarkup(sect, visit, school) {
      const catalog=courtCatalog(); if(!catalog)return '';
      if(visit?.governance?.mode==='site') return siteGovernanceMarkup(sect, visit, school, visit.governance);
      const governance=visit?.governance, source=governance?.source;
      const trustedSource=source?.kind==='host_site', sourceStatus=trustedSource?source.status:'unconfigured';
      const candidate=governance?.leader, leader=trustedSource&&sourceStatus==='ready'&&candidate?.source==='host_site'?candidate:null;
      const own=assignedSect(sect)?.id===school.id, ranking=own&&ownSectReady(sect)?sect.group.governance?.ranking:null;
      const status=governance?.status, active=!!(engine.online&&status==='active'&&leader&&Number(governance.termStart)<=now()&&Number(governance.termEnd)>now());
      const score=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:6}):'—';
      const greeting=catalog.getGreeting(visit?.greetingId), initiative=catalog.getInitiative(visit?.initiativeId);
      let emptyTitle='等待主站排名接口', emptyCopy='宗主任命将读取主站已有的修为排行。接口接通并取得本周排名后，才会显示正式宗主。';
      if(!engine.online){emptyCopy='本机可游览四宗风物。宗主依据主站修为排行产生，接入主站账号和排名接口后同步任命。';}
      else if(sourceStatus==='awaiting'){emptyTitle='等待主站本周排名';emptyCopy='主站排名接口已接入，正在等待本周日的本宗第一名快照。取得可信排名后再任命。';}
      else if(sourceStatus==='ready'&&status==='vacant'){
        emptyTitle='本周宗主暂缺';emptyCopy=governance?.vacancyReason==='reassigned'?'主站本周任命的同学已调整宗门归属，等待下周日按主站新排名任命。':'主站本周快照暂无符合任命条件的同门，等待下一次周日排名。';
      }else if(sourceStatus==='ready'&&!active){emptyTitle='等待主站本周任命';emptyCopy='主站排名已同步，正式任命与任期确认后在这里公示。';}
      const trustedRanking=!!(engine.online&&trustedSource&&sourceStatus==='ready'&&ranking?.source==='host_site'&&ranking.status==='ready'&&ranking.scope==='weekly_winner'&&Number(ranking.cutoffAt)>0&&ranking.cutoffAt===source.cutoffAt&&ranking.cutoffAt<=now()&&now()<ranking.cutoffAt+catalog.termMs);
      const winner=trustedRanking?(ranking.top||[]).find(record=>record.rank===1):null;
      const rankingMarkup=trustedRanking?`<details class="journey-details journey-sect-ranking" data-journey-detail="sect-ranking"${detailState.get('sect-ranking')?' open':''}><summary><span>主站修为排行</span><small>本宗周日快照</small>${I('arrow')}</summary>${winner?`<ol class="journey-rank-list"><li${winner.isSelf?' class="is-self"':''}><span class="journey-rank-number">1</span><span class="journey-rank-name">${E(winner.name)}${winner.isSelf?'<small>我</small>':''}</span><b>${E(score(winner.score))}<small>主站修为</small></b><span>主站本宗第一名</span></li></ol>`:'<p class="journey-own-rank">本周主站快照暂无可任命的同门。</p>'}<p class="journey-ranking-note">这里只展示主站本周的本宗第一名快照，完整修为排行以主站为准。任期内榜单变化不改变本周宗主任期。</p>${Number(ranking.cutoffAt)>0?`<p class="journey-ranking-note">周日快照 ${termDate(ranking.cutoffAt)}${Number(ranking.importedAt)>0?` · 同步于 ${termDate(ranking.importedAt)}`:''}（北京时间）</p>`:''}</details>`:'';
      return `<section class="journey-sect-governance" data-ranking-source="host_site" data-ranking-status="${E(sourceStatus)}" aria-label="${E(school.name)}宗主与任期"><div class="journey-governance-heading"><div><span class="journey-eyebrow">主站修为排行 · 一周一任</span><h3>山门掌事</h3></div><span class="journey-governance-rule">${E(catalog.settlementLabel)}任命</span></div>
        <div class="journey-leader-card${active?' is-active':''}"><span class="journey-leader-seal" aria-hidden="true">${active?'宗':'候'}</span><div><span class="journey-small-label">${active?'本周宗主':'宗主公示'}</span><h4>${active?E(leader.name):E(emptyTitle)}${active&&leader.isSelf?'<small>我 · 本周宗主</small>':''}</h4><p>${active?`主站本宗第一名 · 主站修为 <strong>${E(score(leader.score))}</strong>`:E(emptyCopy)}</p>${active?`<p class="journey-leader-term">任期 ${termDate(governance.termStart)} — ${termDate(governance.termEnd)}</p>`:''}</div></div>
        ${governance?.nextSettlementAt?`<p class="journey-next-settlement">${I('clock')}下次周日快照 ${termDate(governance.nextSettlementAt)}（北京时间） · <time data-journey-until="${integer(governance.nextSettlementAt)}"></time>后</p>`:''}
        <div class="journey-sect-welcome"><span>${I('leaf')}${greeting?E(greeting.name):'山门迎客'}</span><p>${greeting?E(greeting.text):'山门常开，欢迎道友慢赏一山风物。'}</p></div>
        ${initiative?`<div class="journey-sect-initiative"><span>本周倡议</span><div><h4>${E(initiative.name)}</h4><p>${E(initiative.description)}</p></div></div>`:''}
        ${rankingMarkup}<details class="journey-details journey-leader-rules" data-journey-detail="leader-rules"${detailState.get('leader-rules')?' open':''}><summary><span>如何推选 · 宗主能做什么</span>${I('arrow')}</summary><div><p>每周日北京时间 00:00，依据主站已有修为排行的本宗第一名自动任命宗主，任期 7 天。</p><p>修为统计与排名顺序由主站提供。取得本周可信排名后完成任命，完整榜单以主站为准。</p><ul><li>布置六处公共庭位，挑选已开放的小景。</li><li>选择一项本周共修倡议，引导同门交流与共建。</li><li>选择山门欢迎语，迎接来访道友。</li></ul><p>宗主权力用于公共建设；不增加个人修为、灵石或材料，也不改变同门归属。</p></div></details>
        ${mayManage(sect,visit)&&courtDraft?.sectId!==school.id?button('court-start','以宗主身份布置山门',key('court-start'),false,'primary'):''}
        ${courtDraft?.sectId===school.id?courtEditorMarkup(sect,visit):''}
      </section>`;
    }
    function courtEditorMarkup(sect,visit) {
      const catalog=courtCatalog(),editable=courtEditing(sect),selected=catalog.getSlot(courtSelectedSlot)||catalog.slots[0];
      const entry=courtDraft.layout.find(item=>item.slotId===selected.id),completed=visit?.completedStageIds||visit?.stages?.filter(s=>s.completed).map(s=>s.id)||[];
      const unlocked=new Set(catalog.availableItems(completed).map(item=>item.id));
      if(!editable)return `<section class="journey-court-editor is-locked" aria-label="未发布的庭院草稿"><h4>庭院草稿尚未发布</h4><p role="status">${E(courtConflict||'宗主任期已更新，暂不能保存。')}</p><div class="journey-court-actions">${mayManage(sect,visit)?button('court-reload','放弃草稿，载入最新庭院',key('court-reload'),false,'secondary'):''}${button('court-cancel','关闭草稿',key('court-cancel'),false,'quiet')}</div></section>`;
      return `<section class="journey-court-editor" aria-label="宗主布置山门"><div class="journey-court-editor-heading"><div><span class="journey-eyebrow">公共景库 · 无需个人灵石</span><h4>${courtPreview?'正在预览庭院草稿':'亲手布置这一山'}</h4></div><span>${courtDraft.layout.length} / ${catalog.maxDecorations} 处</span></div><p>六处庭位避开山门与步道。选位置、选小景，再旋转朝向；点击保存后，同门和访客才会看到。</p>
        <div class="journey-court-slots" role="group" aria-label="选择公共庭位">${catalog.slots.map(slot=>{const placed=courtDraft.layout.find(i=>i.slotId===slot.id);return `<button type="button" data-journey-action="court-slot"${attr('id',slot.id)+key('court-slot-'+slot.id)} aria-pressed="${slot.id===selected.id}"${busy()?' disabled':''}><span>${E(slot.name)}</span><small>${E(catalog.getItem(placed?.itemId)?.name||'留白')}</small></button>`;}).join('')}</div>
        <div class="journey-court-selection"><span>正在布置</span><strong>${E(selected.name)}</strong><small>${entry?`${E(catalog.getItem(entry.itemId)?.name)} · ${entry.rotation}°`:'此处留白'}</small></div>
        <div class="journey-court-items" role="group" aria-label="公共小景">${catalog.items.map(item=>`<button type="button" data-journey-action="court-item"${attr('id',item.id)+key('court-item-'+item.id)} aria-pressed="${entry?.itemId===item.id}"${!unlocked.has(item.id)||busy()?' disabled':''}><span>${E(item.name)}</span><small>${unlocked.has(item.id)?'公共景库':`${E(global.SpiritSects.get(selectedSectId).stages.find(s=>s.id===item.unlockStageId)?.name||'共建')}完工开放`}</small></button>`).join('')}</div>
        <div class="journey-court-actions">${button('court-rotate','转向 90°',key('court-rotate'),!entry,'secondary')}${button('court-clear','此处留白',key('court-clear'),!entry,'quiet')}${button('court-preview',courtPreview?'继续布置':'预览草稿',key('court-preview'),false,'secondary')}</div>
        <div class="journey-court-save"><span>${courtDraft.layoutDirty?'庭院有未保存的改动':'庭院与已发布版本相同'}</span><div>${button('court-save','保存庭院布置',key('court-save'),!courtDraft.layoutDirty||sectRefreshing||engine.sectLoading)}${button('court-cancel',courtDraft.layoutDirty||courtDraft.initiativeDirty||courtDraft.greetingDirty?'放弃未保存改动':'结束布置',key('court-cancel'),false,'quiet')}</div></div>
        <div class="journey-court-message-controls"><label for="journey-court-initiative">本周共修倡议<select id="journey-court-initiative" data-journey-court-field="initiativeId" data-journey-focus="court-initiative"${busy()?' disabled':''}>${catalog.initiatives.map(item=>`<option value="${E(item.id)}"${courtDraft.initiativeId===item.id?' selected':''}>${E(item.name)}</option>`).join('')}</select><small>${E(catalog.getInitiative(courtDraft.initiativeId)?.description||'')}</small></label>${button('court-initiative-save','发布倡议',key('court-initiative-save'),!courtDraft.initiativeDirty,'secondary')}
        <label for="journey-court-greeting">山门欢迎语<select id="journey-court-greeting" data-journey-court-field="greetingId" data-journey-focus="court-greeting"${busy()?' disabled':''}>${catalog.greetings.map(item=>`<option value="${E(item.id)}"${courtDraft.greetingId===item.id?' selected':''}>${E(item.name)}</option>`).join('')}</select><small>${E(catalog.getGreeting(courtDraft.greetingId)?.text||'')}</small></label>${button('court-greeting-save','发布欢迎语',key('court-greeting-save'),!courtDraft.greetingDirty,'secondary')}</div>
      </section>`;
    }
    function sectTheme(school) {
      const color = (value, fallback) => /^#[a-f0-9]{6}$/i.test(value || '') ? value : fallback;
      return `--sect-ink:${color(school.palette?.primary, '#557249')};--sect-accent:${color(school.palette?.accent, '#b59a60')};--sect-soft:${color(school.palette?.soft, '#eef0df')}`;
    }
    function sectIllustration(school, stage = 'gate', className = 'journey-sect-art') {
      const id = { gate: 'sectGate', spring: 'sectSpring', library: 'sectLibrary' }[stage];
      const label = `${school.name} · ${school.stages.find(item => item.id === stage)?.name || '山中景观'}`;
      const illustration = id && typeof global.spiritHomesteadArt === 'function'
        ? global.spiritHomesteadArt(id, { themeId: school.id, label, className }) : '';
      return illustration || global.spiritSectArt?.(school.id, { stage, className, label }) || '';
    }
    function constructionInfo(stage, authoritative) {
      return global.SpiritSects?.constructionState?.(stage, authoritative) || { phase: 'preview', label: '规划预览', ratio: 0, percent: 0, donated: 0, target: 0 };
    }
    function publicProgress(sect, sectId) {
      if (!engine.online || sectLoadError || engine.sectError) return null;
      const progress = sect?.publicDirectory?.find(item => item.sectId === sectId)?.overallProgress;
      return progress && Number.isFinite(progress.targetUnits) && progress.targetUnits > 0 &&
        Number.isFinite(progress.donatedUnits) && progress.donatedUnits >= 0 &&
        Number.isFinite(progress.progressPercent) ? progress : null;
    }
    function sectCard(school, ownId, sect) {
      const selected = selectedSectId === school.id, mine = school.id === ownId, progress = publicProgress(sect, school.id);
      const progressText = progress ? `<div class="journey-school-progress"><div><span>共建进度</span><strong>${E(progress.progressPercent)}<small>%</small></strong></div>${progressMarkup(progress.donatedUnits, progress.targetUnits, school.name + '共建总进度')}<small>已竣工 ${F(progress.completedStages)} / ${F(progress.totalStages)} 景 · 材料 ${F(progress.donatedUnits)} / ${F(progress.targetUnits)}</small></div>` : '<p class="journey-school-progress-pending">规划可游览 · 共建近况待同步</p>';
      return `<article class="journey-school-card${selected ? ' is-selected' : ''}${mine ? ' is-mine' : ''}" style="${sectTheme(school)}"><div class="journey-school-picture">${sectIllustration(school)}${mine ? `<span class="journey-school-badge">${I('check')}我的宗门</span>` : ''}</div><div class="journey-school-copy"><div class="journey-school-title"><h4>${E(school.name)}</h4><span>${E(school.ethos)}</span></div><blockquote class="journey-school-motto"><p>“${E(school.motto)}”</p><cite>${E(school.source)}</cite></blockquote>${progressText}${button('browse-sect', `${selected ? '正在游览' : '游览宗门'}${I('arrow')}`, attr('id', school.id) + key(`browse-${school.id}`) + ` aria-pressed="${selected}" aria-controls="journey-sect-view"`, false, selected ? 'primary' : 'secondary')}</div></article>`;
    }
    function constructionOverview(school, visit) {
      if (!visit) return '';
      const stages = school.stages.map(plan => ({ plan, status: constructionInfo(visit.stages?.find(stage => stage.id === plan.id), true) }));
      if (stages.every(item => item.status.phase === 'preview')) return '';
      const cards = stages.map(({plan,status}) => {
        const hasMaterials = status.phase !== 'preview' && status.target > 0;
        const caption = status.phase === 'preview' ? '等待云端进度' : hasMaterials
          ? F(status.donated)+' / '+F(status.target)+' 份材料' : '已记录竣工 · 材料明细待同步';
        return `<button type="button" data-journey-action="sect-focus"${attr('id',plan.id)+key('construction-'+plan.id)} data-phase="${E(status.phase)}" aria-pressed="${sectViewFocus===plan.id}"><span>${E(plan.name)}</span><strong>${E(status.label)}<small>${status.phase==='preview'?'':E(status.percent)+'%'}</small></strong>${hasMaterials?progressMarkup(status.donated,status.target,plan.name+'施工进度'):''}<small>${caption}</small></button>`;
      }).join('');
      return `<section class="journey-construction-overview" aria-label="${E(school.name)}施工进度"><div class="journey-construction-title"><h4>这一山，正在长成</h4><span>材料投入推动实景变化</span></div><div class="journey-construction-grid">${cards}</div><p>地基施工 → 梁柱搭建 → 屋面成形 → 装饰收尾 → 竣工；点选工程可近看。</p></section>`;
    }
    function sectStage(stage, sect, ordinal, school, visit) {
      const plan = school.stages.find(item => item.id === stage.id) || stage;
      const shared = !!sect, actual = shared ? stage : visit?.stages?.find(item => item.id === stage.id);
      const status = constructionInfo(actual, shared || !!visit), authoritative = status.phase !== 'preview';
      const currentStageId = shared ? sect.group.currentStageId : visit?.currentStageId;
      const active = authoritative && stage.id === currentStageId;
      const title = shared && (stage.claimed ? '已收藏纪念' : stage.eligible ? '领取共建纪念' : stage.completed ? `参与满 ${sect.rules.minRewardContribution} 份可领` : '完工后领取纪念');
      const materials = authoritative && Array.isArray(actual?.requirements) ? `<div class="journey-materials">${actual.requirements.map(r => `<div><span>${E(r.name || cropMap[r.cropId]?.name || r.cropId)}</span><b>${F(r.donated)}<small> / ${F(r.target)}</small></b>${progressMarkup(r.donated, r.target, (r.name || cropMap[r.cropId]?.name || r.cropId) + '共建进度')}</div>`).join('')}</div>` : `<div class="journey-plan-materials"><span>共建所需</span><ul>${plan.requirements.map(r => `<li><span>${E(cropMap[r.cropId]?.name || r.cropId)}</span><b>${F(r.target)} 份</b></li>`).join('')}</ul><p>${authoritative?'工程已竣工':'材料目标 · 尚未展示共建进度'}</p></div>`;
      const state = status.phase === 'completed' ? I('check') + '已竣工' : !authoritative ? '规划预览' : status.phase === 'planned' && !active ? '待前序完工' : E(status.label);
      return `<article class="journey-sect-stage${status.phase==='completed' ? ' is-complete' : active ? ' is-current' : ''}${authoritative ? '' : ' is-plan'}" data-phase="${E(status.phase)}"><div class="journey-sect-stage-heading"><span class="journey-stage-number">${['壹', '贰', '叁'][ordinal] || ordinal + 1}</span><div><h4>${E(plan.name)}</h4></div><span class="journey-state-tag${active ? ' is-ready' : ''}">${state}${authoritative?' · '+E(status.percent)+'%':''}</span></div><div class="journey-sect-stage-body"><div class="journey-sect-stage-copy"><p>${E(plan.description)}</p>${plan.features?.length ? `<ul class="journey-sect-features" aria-label="景观特色">${plan.features.map(feature => `<li>${E(feature)}</li>`).join('')}</ul>` : ''}${materials}</div></div><div class="journey-sect-stage-footer"><span>${I('spark')}完工纪念 · ${E(plan.rewardDecoration.name)}</span>${button('sect-focus', '游览此景', attr('id',stage.id) + key(`visit-${stage.id}`),false,'quiet')}${shared ? button('claim-sect-reward', title, attr('id', stage.id) + key(`sect-reward-${stage.id}`), stage.claimed || !stage.eligible || sectRefreshing || engine.sectLoading, stage.eligible && !stage.claimed ? 'primary' : 'secondary') : '<small>本宗成员可参与共建与收藏</small>'}</div></article>`;
    }
    function donationMarkup(sect) {
      if (sect.group.maintenance && Number(sect.group.maintenance.remaining) === 0) return `<div class="journey-sect-finished">${I('check')}<div><h4>本宗工程已完成</h4><p>你的养护参与已达标，可在“工程与纪念”中查看收藏。</p></div></div>`;
      const info = donationInfo(sect);
      if (!info) return `<div class="journey-sect-finished">${I('check')}<div><h4>这一山，已由同门共修圆满</h4><p>三处宗门景观已落成，记得收下可领取的共建纪念。</p></div></div>`;
      const isMaintenance = !!sect.group.maintenance;
      const confirmationOpen = confirmation?.kind === 'donation';
      const donationLocked = confirmationOpen || sectRefreshing || engine.sectLoading;
      return `<section class="journey-donation"><div class="journey-section-heading"><div><div><span class="journey-eyebrow">从自己的乾坤袋取材</span><h3>${isMaintenance ? '竣工养护' : '添一份心意'}</h3></div></div><span class="journey-quota">今日余 <b>${F(sect.daily.left)}</b> / ${F(sect.rules.dailyUnits)} 份</span></div>${isMaintenance ? `<p class="journey-section-intro">新成员投入黄精芝，完成 ${F(sect.group.maintenance.remaining)} 份养护后即可参与完工纪念；同样计入今日捐献额度。</p>` : ''}<div class="journey-donation-fields"><label for="journey-donation-crop">共建所需灵草<select id="journey-donation-crop" data-journey-field="donationCrop" data-journey-focus="donation-crop"${busy() || donationLocked ? ' disabled' : ''}>${info.materials.map(m => `<option value="${E(m.cropId)}"${m.cropId === draft.donationCrop ? ' selected' : ''}>${E(m.name)} · 持有 ${F(engine.state.bag[m.cropId])} 份</option>`).join('')}</select></label><label for="journey-donation-quantity">捐献数量<input id="journey-donation-quantity" data-journey-field="donationQuantity" data-journey-focus="donation-quantity" type="number" inputmode="numeric" min="1" max="${Math.max(1, info.maximum)}" step="1" value="${E(draft.donationQuantity)}" aria-describedby="journey-donation-hint"${busy() || donationLocked ? ' disabled' : ''}></label></div><div class="journey-quantity-shortcuts">${[['1', '1 份'], ['5', '5 份'], ['max', '最多']].map(([value, label]) => button('donation-quantity', label, attr('id', value) + key(`donation-qty-${value}`), !info.maximum || (value !== 'max' && Number(value) > info.maximum) || donationLocked, 'quiet')).join('')}</div><p class="journey-donation-hint" id="journey-donation-hint">本次最多 ${F(info.maximum)} 份 · 工程还需 ${F(info.crop.remaining)} 份 · 捐献后材料会扣除。</p><div class="journey-donation-actions">${button('donate', `捐献 ${info.valid ? F(info.quantity) : '所选'} 份${E(info.crop.name)}`, key('donate') + ' id="journey-donate-button"', !info.valid || donationLocked)}${options.openMarket ? button('market', '去坊市寻找材料', key('sect-market'), false, 'secondary') : ''}</div>${confirmationOpen ? confirmMarkup('donation', `向「${E(sect.group.name)}」投入 <strong>${F(confirmation.quantity)} 份${E(cropMap[confirmation.cropId]?.name || confirmation.cropId)}</strong>。材料用于共建或养护，投入后不退回。`, '确认捐献') : ''}<p class="journey-caption">材料不足时可等下一次丰收，也可与同学在坊市交换。共建不要求每日签到。</p></section>`;
    }
    function rosterPager(sect) {
      const group = sect.group, page = integer(group.membersPage), size = integer(sect.rules.rosterPageSize) || 20;
      if (group.memberCount <= size && page === 0) return '<p class="journey-roster-caption">同门名册 · 宗门人数不限</p>';
      return `<div class="journey-roster-pager"><span>同门名册 · 第 ${page + 1} / ${Math.max(1, Math.ceil(group.memberCount / size))} 页</span><div>${button('sect-page', '上一页', attr('id', Math.max(0, page - 1)) + key('sect-previous-page'), page === 0 || sectRefreshing || engine.sectLoading, 'quiet')}${button('sect-page', '下一页', attr('id', group.nextMemberPage ?? page) + key('sect-next-page'), group.nextMemberPage == null || sectRefreshing || engine.sectLoading, 'secondary')}</div></div>`;
    }
    function sectMarkup(data) {
      const sect = data.sect, catalog = sectCatalog(sect), own = assignedSect(sect);
      const error = sectLoadError || engine.sectError, loading = sectRefreshing || engine.sectLoading;
      const ready = ownSectReady(sect);
      if (!catalog.some(school => school.id === selectedSectId) || (!sectSelectionManual && own)) selectedSectId = own?.id || catalog[0]?.id || '';
      const selected = catalog.find(school => school.id === selectedSectId);
      const visit = selectedVisit(sect);
      validateCourtDraft(sect, visit);
      const viewingOwn = !!(own && selected?.id === own.id), shared = viewingOwn && ready;
      let statusTitle, statusText, statusIcon = 'mountain';
      if (!engine.online) {
        statusTitle = '先游四宗，静候同门';
        statusText = '本机练习可游览四宗风物。宗门归属由师长安排，进入云端洞天后同步。';
      } else if (error) {
        statusTitle = '宗门近况尚未同步';
        statusText = own ? `上次登记的归属为${own.name}。本次同步尚未完成，先游览山中景观，稍后再查看共建近况。` : '暂时未能取得宗门归属与共建近况，可先游览四宗风物，稍后再次同步。';
        statusIcon = 'wind';
      } else if (own) {
        statusTitle = `我的宗门 · ${own.name}`;
        statusText = ready ? '归属已登记，与同门把每一份耕耘，积成一山风物。' : '归属已登记，共建近况尚未同步。可先游览本宗山门与景观。';
        statusIcon = 'users';
      } else if (sect?.membership?.status === 'unassigned') {
        statusTitle = '静候师长分配宗门';
        statusText = '尚未分配宗门，可先游览四宗风物。安排好后，便能与同门共同修建。';
      } else {
        statusTitle = loading ? '正在同步宗门归属' : '宗门归属尚未同步';
        statusText = '先看看四宗风物，宗门安排与共建近况稍后送达。';
      }
      const header = `<div class="journey-sect-refresh"><span>${I('users')}四宗同修 · 各有山色</span>${engine.online ? button('refresh-sect', loading ? '正在同步…' : '同步宗门', key('sect-refresh'), loading, 'quiet') : '<span class="journey-sect-mode">本机游览</span>'}</div><section class="journey-sect-status${error ? ' is-pending' : ''}" aria-label="我的宗门归属"><span class="journey-sect-status-icon">${I(statusIcon)}</span><div><h3>${E(statusTitle)}</h3><p>${E(statusText)}</p></div>${own && !viewingOwn ? button('browse-sect', '查看本宗', attr('id', own.id) + key('browse-own-sect'), false, 'secondary') : ''}</section><div class="journey-sect-intro"><span class="journey-eyebrow">一山一宗风 · 一景一心意</span><h3>四大宗门 · 共建近况</h3><p>四宗均不设人数限制；相同材料目标，一起看看哪座山先落成。</p></div><div class="journey-school-grid">${catalog.map(school => sectCard(school, own?.id, sect)).join('')}</div>`;
      if (!selected) return header + note('山中画卷正在整理，请稍后重新打开宗门页。');
      const group = shared ? sect.group : null;
      const roster = shared ? `<div class="journey-sect-contribution"><span>${I('users')}<b>${F(group.memberCount)}</b> 位同门 · 人数不限</span><span>我已投入 <b>${F(group.ownContributionUnits)}</b> 份灵草</span></div><details class="journey-details journey-sect-roster" data-journey-detail="sect-roster"${detailState.get('sect-roster') ? ' open' : ''}><summary><span>同门名册</span><small>共 ${F(group.memberCount)} 人</small>${I('arrow')}</summary><ul class="journey-members" aria-label="宗门成员">${(group.members || []).map(m => `<li><span class="journey-member-avatar" aria-hidden="true">${E(Array.from(m.name || '友')[0])}</span><span class="journey-member-name" title="${E(m.name)}">${E(m.name)}${m.isSelf ? '<small>我</small>' : ''}</span><span class="journey-member-contribution">${F(m.contributionUnits)} 份</span></li>`).join('')}</ul>${rosterPager(sect)}</details>` : '';
      const viewNote = shared ? '从山门到庭院，再到书阁，依次由同门合力修建。' : visit ? `正在游览${selected.name}，可查看真实材料进度与施工外观。${own ? '返回'+own.name+'即可参与本宗共建。' : '归属安排好后，即可参与本宗共建。'}` : viewingOwn ? '以下为本宗景观蓝图；共建进度将在同步完成后显示。' : own ? `正在游览${selected.name}。我的宗门是${own.name}，可返回本宗参与共建。` : '这是宗门景观蓝图。归属安排好后，可在本宗与同门合力修建。';
      const details = header + `<section class="journey-sect-view" id="journey-sect-view" style="${sectTheme(selected)}" aria-labelledby="journey-sect-view-title"><div class="journey-sect-view-heading"><div><span class="journey-eyebrow">${viewingOwn ? '我的宗门' : '山中游览'} · ${E(selected.ethos)}</span><h3 id="journey-sect-view-title" tabindex="-1">${E(selected.name)} · ${shared ? '同门共建' : '山中画卷'}</h3><p>${E(selected.summary)}</p></div><span class="journey-sect-seal" aria-hidden="true">${E(selected.emblem)}</span></div><p class="journey-sect-view-note">${E(viewNote)}</p>${constructionOverview(selected,visit)}${governanceMarkup(sect,visit,selected)}${roster}<details class="journey-details journey-sect-projects" data-journey-detail="sect-projects"${detailState.get('sect-projects')?' open':''}><summary><span>三景共建 · 工程与纪念</span><small>山门 → 庭院 → 书阁</small>${I('arrow')}</summary><div class="journey-sect-stages">${(shared ? group.stages : selected.stages).map((stage, index) => sectStage(stage, shared ? sect : null, index, selected,visit)).join('')}</div></details>${shared ? donationMarkup(sect) + note(`每人每日最多投入 ${F(sect.rules.dailyUnits)} 份灵草；在本宗累计投入 ${F(sect.rules.minRewardContribution)} 份后，可收藏已完成阶段的纪念。每个阶段的纪念每个账号限领一次。`) : '<p class="journey-caption">游览不会改变宗门归属，也不会消耗灵草。</p>'}</section>`;
      const selector = catalog.map(school => `<button type="button" data-journey-action="browse-sect"${attr('id',school.id)+key('quick-school-'+school.id)} aria-pressed="${school.id===selectedSectId}"><span aria-hidden="true">${E(school.emblem)}</span><strong>${E(school.name)}</strong></button>`).join('');
      return `<div class="game-sect-experience" style="${sectTheme(selected)}"><div class="game-sect-backdrop">${sceneMarkup(selected,visit)}</div><nav class="game-sect-selector" aria-label="游览四大宗门">${selector}</nav><button type="button" class="game-sect-info-toggle" data-journey-action="sect-info"${attr('id','open')+key('sect-info-open')} aria-expanded="${sectInfoOpen}" aria-controls="game-sect-info">${I('book')}<span>宗门事务</span></button><div class="game-sect-info-backdrop" data-journey-action="sect-info"${attr('id','close')} aria-hidden="true"${sectInfoOpen ? '' : ' hidden'}></div><aside class="game-sect-info" id="game-sect-info" role="dialog" aria-modal="true" aria-labelledby="game-sect-info-title" tabindex="-1"${sectInfoOpen ? '' : ' hidden'}><div class="fullscreen-panel-heading"><div><strong id="game-sect-info-title">${E(selected.name)} · 宗门事务</strong><small>归属、工程与同门往来</small></div><button type="button" class="fullscreen-panel-close" data-journey-action="sect-info"${attr('id','close')+key('sect-info-close')} aria-label="收起宗门事务">${I('close')}</button></div><div class="game-sect-info-content">${details}</div></aside></div>`;

    }
    function storiesMarkup(data) {
      const stories = data.stories, chapters = stories.chapters || [];
      if (expandedStory === null) expandedStory = chapters.find(c => c.unlocked && !c.read)?.id || chapters.find(c => c.unlocked)?.id || '';
      return `<section class="journey-stories"><div class="journey-section-heading"><div><div><span class="journey-eyebrow">一境一事 · 慢慢入山</span><h3>五境小札</h3></div></div><span class="journey-quota">已读 <b>${F(stories.readCount)}</b> / ${F(stories.total)}</span></div><p class="journey-section-intro">草木之外，也留一页山中故事。每到一个新境界，便展开新的篇章。</p><div class="journey-story-list">${chapters.map((c, index) => {
        const expanded = c.unlocked && expandedStory === c.id;
        const paragraphs = Array.isArray(c.text) ? c.text : String(c.text || '').split(/\n+/).filter(Boolean);
        return `<article class="journey-story${expanded ? ' is-expanded' : ''}${!c.unlocked ? ' is-locked' : ''}"><button class="journey-story-heading" type="button" data-journey-action="story-toggle"${attr('id', c.id) + key(`story-${c.id}`)} aria-expanded="${expanded}" aria-controls="journey-story-${E(c.id)}"${!c.unlocked ? ' disabled' : ''}><span class="journey-story-index">${String(index + 1).padStart(2, '0')}</span><span><small>${E(realmName(c.realm))}篇</small><strong>${E(c.title)}</strong></span><span class="journey-story-status">${!c.unlocked ? I('lock') + realmName(c.realm) + '展开' : c.read ? I('check') + '已阅' : '待启'}${c.unlocked ? I('arrow') : ''}</span></button><div class="journey-story-body" id="journey-story-${E(c.id)}"${expanded ? '' : ' hidden'}>${c.unlocked ? paragraphs.map(p => `<p>${E(p)}</p>`).join('') : ''}${c.unlocked ? button('read-story', c.read ? '这一页已收藏' : '读过，收好这一页', attr('id', c.id) + key(`read-${c.id}`), c.read, c.read ? 'secondary' : 'primary') : ''}</div></article>`;
      }).join('')}</div><p class="journey-caption">小札随境界解锁，可随时重读。阅读不消耗材料，也不发放修为。</p></section>`;
    }
    function markup(data) {
      const ready = getSummary().claimable;
      const panels = { commissions: commissionsMarkup, codex: codexMarkup, decor: decorMarkup, sect: sectMarkup, stories: storiesMarkup };
      const notices = `${actionBusy ? `<div class="journey-busy" role="status" aria-live="polite">${I('clock')}正在收好这份进度…</div>` : ''}${feedback ? `<div class="journey-feedback is-${feedback.type}" role="status" aria-live="polite">${I(feedback.type === 'success' ? 'check' : 'leaf')}<span>${E(feedback.message)}</span></div>` : ''}`;
      if (tab === 'sect') return `${notices}<div class="journey-panel" id="journey-panel" role="region" aria-label="宗门山景">${panels.sect(data)}</div>`;
      const decor = tab === 'decor', title = decor ? '洞天布置' : '仙途长卷';
      const tabs = decor ? '' : `<div class="journey-tabs" role="tablist" aria-label="仙途长卷分类">${SCROLL_TABS.map(t => `<button type="button" role="tab" id="journey-tab-${t.id}" data-journey-action="tab"${attr('id', t.id) + key(`tab-${t.id}`)} aria-controls="journey-panel" aria-selected="${tab === t.id}" tabindex="${tab === t.id ? '0' : '-1'}" aria-label="${t.full}">${I(t.icon)}<span>${t.label}</span>${t.id === 'commissions' && ready ? `<i class="journey-tab-dot" aria-label="${ready}项奖励可领取"></i>` : ''}</button>`).join('')}</div>`;
      const status = decor ? `${E(realmName(engine.state.realm))} · ${decorKind === 'residences' ? `${data.residence.equipped ? 1 : 0} / 1 宅邸` : `${F(data.decor.equipped.length)} / ${F(data.decor.maxEquipped)} 小景`}` : `${E(data.journey.title || '山中初客')} · 委托 ${F(data.journey.totals?.commissions)} 次`;
      return `<section class="game-journey-window" role="dialog" aria-modal="true" aria-labelledby="journey-window-title" tabindex="-1"><header class="game-window-header"><span class="game-window-emblem" aria-hidden="true">${I(decor ? 'mountain' : 'book')}</span><div class="game-window-heading"><h2 id="journey-window-title" tabindex="-1">${title}</h2></div><span class="game-window-status">${status}</span><button type="button" class="game-window-close fullscreen-panel-close" data-journey-action="close-window"${key('window-close')} aria-label="${decor ? '关闭洞天' : '关闭仙途长卷'}">${I('close')}</button></header>${tabs}<div class="game-window-body">${notices}<div class="journey-panel" id="journey-panel" role="${decor ? 'region' : 'tabpanel'}" aria-labelledby="${decor ? 'journey-window-title' : `journey-tab-${tab}`}" tabindex="0">${panels[tab](data)}</div></div></section>`;
    }
    function captureControls() {
      if (!root()) return null;
      root().querySelectorAll('[data-journey-field]').forEach(node => { if (Object.hasOwn(draft, node.dataset.journeyField)) draft[node.dataset.journeyField] = node.value; });
      root().querySelectorAll('[data-journey-detail]').forEach(node => detailState.set(node.dataset.journeyDetail, node.open));
      const active = document.activeElement;
      return active && root().contains(active) ? { key: active.dataset.journeyFocus, start: active.selectionStart, end: active.selectionEnd } : null;
    }
    function restoreControls(focus, scroll) {
      if (focus?.key) {
        const candidate = [...root().querySelectorAll('[data-journey-focus]')].find(node => node.dataset.journeyFocus === focus.key);
        if (candidate && !candidate.disabled) {
          candidate.focus({ preventScroll: true });
          if (Number.isInteger(focus.start) && typeof candidate.setSelectionRange === 'function') { try { candidate.setSelectionRange(focus.start, focus.end); } catch (_) {} }
        }
      }
      if (content()) content().scrollTop = scroll.content;
      const sectInfo = sectContent(); if (sectInfo) sectInfo.scrollTop = scroll.sectInfo || 0;
      const dialog = !pageMode && document.getElementById('game-dialog'); if (dialog) dialog.scrollTop = scroll.dialog;
    }
    function updateCountdowns() {
      if (!root()) return;
      root().querySelectorAll('[data-journey-until]').forEach(node => {
        const text = remaining(Number(node.dataset.journeyUntil) - now());
        if (node.textContent !== text) node.textContent = text;
      });
    }
    function disposeSectScene() {
      if(sectRevealFrame){global.cancelAnimationFrame?.(sectRevealFrame);sectRevealFrame=0;}
      sectScene?.destroy(); sectScene = null; sectSceneHost = null; sectSceneError = '';
    }
    function revealSectScene() {
      if(sectRevealFrame)global.cancelAnimationFrame?.(sectRevealFrame);
      const reveal=()=>{
        sectRevealFrame=0;if(!isVisible()||tab!=='sect')return;
        const selector=root()?.querySelector('.game-sect-selector [aria-pressed="true"]');
        if (selector) selector.focus({preventScroll:true});
        else document.getElementById('journey-sect-view-title')?.focus({preventScroll:true});
      };
      // Wait until the click's default focus and immediate loading render have
      // finished. Otherwise scroll anchoring can take the visitor back to cards.
      if(typeof global.requestAnimationFrame==='function')sectRevealFrame=global.requestAnimationFrame(reveal);else reveal();
    }
    function syncSectScene(data) {
      if (!isVisible() || tab !== 'sect') { disposeSectScene(); return; }
      const mount = root()?.querySelector('[data-sect-scene-mount]');
      if (!mount) return;
      if (sectSceneHost && sectSceneHost !== mount) mount.replaceWith(sectSceneHost);
      if (!sectSceneHost) sectSceneHost = mount;
      if (!sectScene && typeof global.createSpiritSectVisitScene === 'function') {
        sectSceneHost.textContent = '';
        sectScene = global.createSpiritSectVisitScene({ container: sectSceneHost,
          onSelectStage(id) { sectViewFocus = id; update(true); },
          onSelectSlot(id) { if (!courtEditing(engine.sect || sectFallback) || busy()) return; courtSelectedSlot = id; courtPreview = false; update(true); }
        });
        if (!sectScene?.supported) {
          sectSceneError = '当前设备暂时无法绘制三维山景，请更新浏览器后再来游览。';
          sectSceneHost.textContent = sectSceneError;
        }
      }
      if (sectScene?.supported) sectScene.update(courtState(data.sect, selectedVisit(data.sect)));
    }
    function update(force = false) {
      if (disposed) return;
      const sectActive = isVisible() && tab === 'sect' && !!engine.online;
      if (sectActive !== previousSectActive) { previousSectActive = sectActive; engine.setSectActive?.(sectActive); }
      const data = getData();
      const equipped = JSON.stringify(data.decor.equipped);
      if (equipped !== previousDecor) { previousDecor = equipped; options.onDecorChange?.(data.decor.equipped); }
      if (!isVisible()) { disposeSectScene(); return; }
      if (tab !== 'sect') disposeSectScene();
      root().setAttribute('aria-busy', String(busy()));
      if (confirmation?.kind === 'delivery' && !data.journey[confirmation.period]?.quests.some(q => q.id === confirmation.id && !q.claimed)) {
        confirmation = null;
        feedback = { type: 'info', message: '委托已换新，请查看当前这一期的目标。' };
      }
      if (confirmation?.kind === 'donation' && (!data.sect?.group || data.sect.group.id !== confirmation.groupId || data.sect.group.currentStageId !== confirmation.stageId || !!data.sect.group.maintenance !== confirmation.maintenance)) {
        confirmation = null;
        feedback = { type: 'info', message: '宗门工程已更新，请查看当前所需材料。' };
      }
      if (confirmation && ['decor-purchase', 'residence-purchase'].includes(confirmation.kind)) {
        const item = (confirmation.kind === 'decor-purchase' ? data.decor : data.residence).items.find(value => value.id === confirmation.id);
        if (!item || item.owned || item.cost !== confirmation.cost) {
          confirmation = null;
          feedback = { type: 'info', message: item?.owned ? '这件收藏已经置办，可直接选择布置。' : '置办清单已更新，请重新查看。' };
        }
      }
      if(confirmation?.kind==='tree-purchase'){
        const group=data.decor.treeGroups?.find(item=>item.id===confirmation.id);
        if(!group||group.cost!==confirmation.cost||group.nextInstanceId!==confirmation.nextInstanceId){
          confirmation=null;feedback={type:'info',message:'树木收藏或置办价格已更新，请确认下一棵树再置办。'};
        }
      }
      if (tab === 'sect') validateCourtDraft(data.sect, selectedVisit(data.sect));
      const current = JSON.stringify([tab, codexKind, decorKind, expandedStory, selectedSectId, sectViewFocus, sectInfoOpen, courtDraft, courtSelectedSlot, courtConflict, courtPreview, mayManage(data.sect), data, engine.state.stones, engine.state.realm, engine.state.bag, busy(), sectRefreshing, engine.sectLoading, engine.sectError, sectLoadError, feedback, confirmation]);
      let rendered = false;
      if (force || signature !== current || (tab === 'sect' && !sectSceneHost)) {
        if (root()?.querySelector('.game-sect-info')?.hidden === false) sectInfoScroll = sectContent()?.scrollTop || 0;
        const focus = captureControls(), scroll = { content: content()?.scrollTop || 0, sectInfo: sectInfoScroll, dialog: pageMode ? 0 : document.getElementById('game-dialog')?.scrollTop || 0 };
        signature = current;
        // The surrounding cards may refresh every second. Preserve the canvas,
        // camera and renderer instead of allocating another WebGL/Canvas scene.
        if (tab === 'sect' && sectSceneHost) sectSceneHost.remove();
        root().setAttribute('data-tab',tab);
        root().innerHTML = markup(data);
        syncSectScene(data);
        restoreControls(focus, scroll);
        rendered = true;
      }
      syncSectDaylight();
      syncSectWeather();
      updateCountdowns();
      // Publish the window state only after its new DOM, scene and preserved
      // form state are ready. The host coordinates background inertness.
      if (rendered) { options.onTabChange?.(tab); options.onWindowChange?.(getWindow()); }
    }
    async function refreshSect(page) {
      if (!engine.online || typeof engine.refreshSect !== 'function') return;
      if (sectRefreshing) { sectRefreshQueued = { page, visitSectId: selectedSectId }; return; }
      const visitSectId = selectedSectId;
      sectRefreshing = true; sectLoadError = ''; update(true);
      try {
        const result = await engine.refreshSect(page, visitSectId);
        if (result?.sect) sectFallback = result.sect;
        else if (result && Object.prototype.hasOwnProperty.call(result, 'group')) sectFallback = result;
        if (result === false || result?.ok === false) sectLoadError = result?.message || engine.sectError || '暂时无法同步宗门，请稍后再试。';
      } catch (error) { sectLoadError = error?.message || '暂时无法同步宗门，请稍后再试。'; }
      finally {
        sectRefreshing = false; update(true);
        const queued = sectRefreshQueued; sectRefreshQueued = null;
        if (queued && isVisible() && tab === 'sect') refreshSect(queued.page);
      }
    }
    function open(nextTab = 'commissions') {
      if (disposed) return false;
      const html = '<div id="journey-root" class="journey-root"></div>';
      if (pageMode && options.openPage(html, nextTab) === false) return false;
      disposeSectScene();
      tab = TABS.some(t => t.id === nextTab) ? nextTab : 'commissions';
      sectInfoOpen = false;
      feedback = null; confirmation = null; signature = '';
      if (pageMode) pageOpened = true;
      else options.openDialog('journey', '仙途长卷', html);
      update(true);
      if (tab !== 'sect') root()?.querySelector('.game-window-close')?.focus({preventScroll:true});
      if (tab === 'sect' && engine.online) refreshSect();
      return true;
    }
    function switchTab(id) {
      if (!TABS.some(t => t.id === id)) return;
      if (content()) content().scrollTop = 0;
      tab = id; sectInfoOpen = false; feedback = null; confirmation = null; update(true);
      if (tab === 'sect' && engine.online) refreshSect();
    }
    function dismissWindow() {
      if (!getWindow()) return false;
      if (tab === 'sect') {
        sectInfoOpen = false; update(true);
        root()?.querySelector('.game-sect-info-toggle')?.focus({preventScroll:true});
      } else if (typeof options.onCloseWindow === 'function') options.onCloseWindow();
      else if (pageMode) options.onReturnHome?.();
      else options.closeDialog?.();
      return true;
    }
    async function perform(name, work) {
      if (busy()) return;
      actionBusy = name; feedback = null; update(true);
      try {
        const result = await work();
        if (result?.sect) sectFallback = result.sect;
        const confirmed = result?.ok === true && !result?.pending;
        feedback = { type: confirmed ? 'success' : result?.pending || result?.ok === undefined ? 'info' : 'error', message: result?.message || (confirmed ? '这份进度已收好。' : result?.ok === false && !result?.pending ? '本次操作尚未完成，请重试。' : '操作尚待确认，恢复连接后会再核对。') };
        if (confirmed) confirmation = null;
      } catch (error) { feedback = { type: 'error', message: error?.message || '暂时未能完成，请稍后再试。' }; }
      finally { actionBusy = ''; update(true); }
    }
    function showConfirmation(value) {
      confirmation = value; feedback = null; update(true);
      const box = root()?.querySelector('.journey-confirm');
      box?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      box?.querySelector('[data-journey-action="confirm"]')?.focus({ preventScroll: true });
    }
    function syncDonationControls() {
      const info = donationInfo(engine.sect || sectFallback), button = document.getElementById('journey-donate-button');
      if (!info || !button) return;
      button.disabled = !info.valid || busy() || sectRefreshing || engine.sectLoading || confirmation?.kind === 'donation';
      button.textContent = `捐献 ${info.valid ? F(info.quantity) : '所选'} 份${info.crop.name}`;
    }
    function confirmAction() {
      const c = confirmation;
      if (!c) return;
      if(c.kind==='tree-purchase'){
        const group=engine.getDecorInfo?.().treeGroups?.find(item=>item.id===c.id);
        if(!group?.canBuy||group.cost!==c.cost||group.nextInstanceId!==c.nextInstanceId){
          confirmation=null;feedback={type:'info',message:group?.reason||'树木收藏已更新，请重新查看。'};update(true);return;
        }
        return perform('buy-decoration',()=>engine.buyDecoration(c.id));
      }
      if (c.kind === 'decor-purchase' || c.kind === 'residence-purchase') {
        const residence = c.kind === 'residence-purchase';
        const info = residence ? engine.getResidenceInfo?.() : engine.getDecorInfo?.();
        const item = info?.items.find(value => value.id === c.id);
        if (!item || item.owned || !item.canBuy || item.cost !== c.cost) {
          confirmation = null; feedback = { type: 'info', message: item?.reason || '置办条件已更新，请重新查看。' }; update(true); return;
        }
        return perform(residence ? 'buy-residence' : 'buy-decoration', () => residence ? engine.buyResidence(c.id) : engine.buyDecoration(c.id));
      }
      if (c.kind === 'delivery') return perform('claim-commission', () => engine.claimCommission(c.period, c.id));
      if (c.kind === 'donation') {
        const sect = engine.sect || sectFallback;
        if (!ownSectReady(sect) || selectedSectId !== sect.group.sectId || sect.group.id !== c.groupId || sect.group.currentStageId !== c.stageId || !!sect.group.maintenance !== c.maintenance) {
          confirmation = null; feedback = { type: 'info', message: '共建阶段已更新，请按当前需求重新选择材料。' }; update(true); return;
        }
        return perform('donate', () => engine.contributeSect(c.cropId, c.quantity));
      }
    }
    function updateCourtLayout(work) {
      const sect = engine.sect || sectFallback;
      if (busy() || !courtEditing(sect)) return;
      work(courtDraft);
      const original=selectedVisit(sect)?.courtyard?.layout||[];
      const order=list=>layoutCopy(list).sort((a,b)=>a.slotId.localeCompare(b.slotId));
      courtDraft.layoutDirty=JSON.stringify(order(courtDraft.layout))!==JSON.stringify(order(original));
      courtPreview=false;feedback=null;update(true);
    }
    function saveCourt(kind) {
      const sect=engine.sect||sectFallback,visit=selectedVisit(sect),submitted=courtDraft;
      validateCourtDraft(sect,visit);
      if(busy()||!courtEditing(sect)||sectRefreshing||engine.sectLoading)return;
      const method=kind==='layout'?'saveSectCourtyard':kind==='initiative'?'setSectInitiative':'setSectGreeting';
      if(typeof engine[method]!=='function')return;
      const dirty=kind==='layout'?'layoutDirty':kind==='initiative'?'initiativeDirty':'greetingDirty';
      if(!submitted[dirty])return;
      const args=kind==='layout'?[layoutCopy(submitted.layout),submitted.revision]:[kind==='initiative'?submitted.initiativeId:submitted.greetingId];
      return perform('court-'+kind,async()=>{
        const result=await engine[method](...args);
        if(result?.sect)sectFallback=result.sect;
        if(courtDraft!==submitted)return result;
        if(result?.ok===true&&!result.pending){
          const current=selectedVisit(engine.sect||sectFallback);
          submitted[dirty]=false;
          if(kind==='layout') {
            if(Number.isSafeInteger(current?.courtyard?.revision)&&current.governance?.termStart===submitted.termStart){submitted.layout=layoutCopy(current.courtyard.layout);submitted.revision=current.courtyard.revision;courtConflict='';courtPreview=false;}
            else courtConflict='保存已确认，最新庭院版本仍待同步。请同步后重新载入。';
          }
          if(kind==='initiative'&&current?.initiativeId)submitted.initiativeId=current.initiativeId;
          if(kind==='greeting'&&current?.greetingId)submitted.greetingId=current.greetingId;
        }else if(['sect_layout_conflict','sect_leader_required','sect_membership_required'].includes(result?.code)){
          courtConflict=result.message||'任期或庭院版本已更新，请重新载入最新庭院。';
        }
        return result;
      });
    }
    function click(event) {
      const target = event.target.closest('[data-journey-action]');
      if (!target || target.disabled || !root()?.contains(target)) return;
      const action = target.dataset.journeyAction, id = target.dataset.journeyId;
      if (action === 'close-window') return dismissWindow();
      if (action === 'tab') return switchTab(id);
      if (action === 'sect-info') {
        if (id !== 'open') return dismissWindow();
        sectInfoOpen = true; update(true);
        root()?.querySelector('.game-sect-info [data-journey-id="close"]')?.focus({preventScroll:true});
        return;
      }
      if (action === 'codex-kind') { if (content()) content().scrollTop = 0; codexKind = id === 'pills' ? 'pills' : 'herbs'; feedback = null; update(true); return; }
      if (action === 'decor-kind') { if (content()) content().scrollTop = 0; decorKind = id === 'residences' ? 'residences' : 'scenery'; feedback = null; confirmation = null; update(true); return; }
      if (action === 'story-toggle') { expandedStory = expandedStory === id ? '' : id; update(true); return; }
      if (action === 'cancel-confirm') { confirmation = null; update(true); return; }
      if (action === 'refresh-sect') return refreshSect();
      if (action === 'sect-page') return refreshSect(Number(id));
      if (action === 'browse-sect') {
        if (!sectCatalog(engine.sect || sectFallback).some(school => school.id === id)) return;
        if (id !== selectedSectId) { sectInfoScroll = 0; if (sectContent()) sectContent().scrollTop = 0; }
        selectedSectId = id; sectSelectionManual = true; sectInfoOpen = false; sectViewFocus='overview'; confirmation = null; feedback = null; update(true);
        if(engine.online)refreshSect();
        revealSectScene();
        return;
      }
      if(action==='sect-focus'){
        if(!global.SpiritSects?.get(selectedSectId)?.stages.some(stage=>stage.id===id))return;
        sectViewFocus=id;sectInfoOpen=false;update(true);sectScene?.focus?.(id);revealSectScene();return;
      }
      if(action==='sect-camera'){
        if(id==='reset'){sectViewFocus='overview';sectScene?.reset?.();update(true);}
        else if(id==='left'||id==='right')sectScene?.orbit?.(id==='left'?-1:1);
        else if(id==='in'||id==='out')sectScene?.zoom?.(id==='in'?1:-1);
        return;
      }
      if (action === 'sect-daylight') {
        if (tab !== 'sect' || !['live', 'day', 'night'].includes(id)) return;
        sectDaylightMode = id; syncSectDaylight(); return;
      }
      if (action === 'market') { engine.setSectActive?.(false); previousSectActive = false; disposeSectScene(); return options.openMarket?.(`herb:${draft.donationCrop || 'huangjing'}`); }
      if (action === 'alchemy') return options.onAlchemy?.(id);
      if (action === 'confirm') return confirmAction();
      if (busy()) return;
      if(action==='court-start'||action==='court-reload'){startCourtDraft(engine.sect||sectFallback);feedback=null;update(true);return;}
      if(action==='court-cancel'){courtDraft=null;courtConflict='';courtPreview=false;update(true);return;}
      if(action==='court-slot'){
        if(!courtEditing(engine.sect||sectFallback)||!courtCatalog()?.getSlot(id))return;
        courtSelectedSlot=id;courtPreview=false;update(true);sectScene?.focus?.(id);return;
      }
      if(action==='court-item'){
        const visit=selectedVisit(engine.sect||sectFallback),completed=visit?.completedStageIds||visit?.stages?.filter(s=>s.completed).map(s=>s.id)||[];
        if(!courtCatalog()?.availableItems(completed).some(item=>item.id===id))return;
        return updateCourtLayout(value=>{const existing=value.layout.find(item=>item.slotId===courtSelectedSlot);if(existing)existing.itemId=id;else value.layout.push({slotId:courtSelectedSlot,itemId:id,rotation:0});});
      }
      if(action==='court-rotate')return updateCourtLayout(value=>{const entry=value.layout.find(item=>item.slotId===courtSelectedSlot);if(entry)entry.rotation=(entry.rotation+90)%360;});
      if(action==='court-clear')return updateCourtLayout(value=>{value.layout=value.layout.filter(item=>item.slotId!==courtSelectedSlot);});
      if(action==='court-preview'){if(!courtEditing(engine.sect||sectFallback))return;courtPreview=!courtPreview;sectInfoOpen=false;update(true);sectScene?.reset?.();revealSectScene();return;}
      if(action==='court-save')return saveCourt('layout');
      if(action==='court-initiative-save')return saveCourt('initiative');
      if(action==='court-greeting-save')return saveCourt('greeting');
      if (action === 'claim-commission') {
        const period = target.dataset.journeyPeriod, q = engine.getJourneyInfo()?.[period]?.quests.find(item => item.id === id);
        if (!q?.canClaim) return;
        if (q.delivery) return showConfirmation({ kind: 'delivery', period, id });
        return perform(action, () => engine.claimCommission(period, id));
      }
      if (action === 'claim-achievement') return perform(action, () => engine.claimAchievement(id));
      if (action === 'claim-starter') return perform(action, () => engine.claimQuest(id));
      if (action === 'buy-decoration' || action === 'buy-residence') {
        const residence = action === 'buy-residence', info = residence ? engine.getResidenceInfo?.() : engine.getDecorInfo?.();
        const group=!residence&&info?.treeGroups?.find(value=>value.id===id);
        if(group){
          if(!group.canBuy||!group.nextInstanceId)return;
          return showConfirmation({kind:'tree-purchase',id,cost:group.cost,nextInstanceId:group.nextInstanceId});
        }
        const item = info?.items.find(value => value.id === id);
        if (!item?.canBuy || item.owned) return;
        return showConfirmation({ kind: residence ? 'residence-purchase' : 'decor-purchase', id, cost: item.cost });
      }
      if (action === 'equip-decoration') return perform(action, () => engine.equipDecoration(id));
      if (action === 'equip-residence') {
        if (!engine.getResidenceInfo?.().items.find(value => value.id === id)?.owned) return;
        return perform(action, () => engine.equipResidence(id));
      }
      if (action === 'edit-layout') return options.onEditDecor?.(id || undefined);
      if (action === 'read-story') return perform(action, () => engine.readStory(id));
      if (action === 'claim-sect-reward') {
        const sect = engine.sect || sectFallback;
        if (!ownSectReady(sect) || selectedSectId !== sect.group.sectId || sectRefreshing || engine.sectLoading) return;
        return perform(action, () => engine.claimSectReward(id));
      }
      if (action === 'donation-quantity') {
        const info = donationInfo(engine.sect || sectFallback);
        if (!info) return;
        draft.donationQuantity = String(Math.min(info.maximum, id === 'max' ? info.maximum : Number(id)));
        const field = document.getElementById('journey-donation-quantity'); if (field) field.value = draft.donationQuantity;
        syncDonationControls(); return;
      }
      if (action === 'donate') {
        const sect = engine.sect || sectFallback, info = donationInfo(sect);
        if (!info?.valid || sectRefreshing || engine.sectLoading) return;
        return showConfirmation({ kind: 'donation', cropId: info.crop.cropId, quantity: info.quantity, groupId: sect.group.id, stageId: sect.group.currentStageId, maintenance: !!sect.group.maintenance });
      }
    }
    function input(event) {
      const target = event.target;
      if (!root()?.contains(target) || !Object.hasOwn(draft, target.dataset.journeyField)) return;
      draft[target.dataset.journeyField] = target.value;
      if (target.dataset.journeyField === 'donationQuantity') syncDonationControls();
    }
    function change(event) {
      const courtField=event.target.dataset.journeyCourtField;
      if(root()?.contains(event.target)&&['initiativeId','greetingId'].includes(courtField)){
        if(!courtEditing(engine.sect||sectFallback)||busy())return;
        const value=event.target.value,catalog=courtCatalog(),valid=courtField==='initiativeId'?catalog.getInitiative(value):catalog.getGreeting(value);
        if(!valid)return;
        courtDraft[courtField]=value;
        courtDraft[courtField==='initiativeId'?'initiativeDirty':'greetingDirty']=value!==selectedVisit(engine.sect||sectFallback)?.[courtField];
        update(true);return;
      }
      if (!root()?.contains(event.target) || event.target.dataset.journeyField !== 'donationCrop') return;
      draft.donationCrop = event.target.value; draft.donationQuantity = '1';
      const field = document.getElementById('journey-donation-quantity'); if (field) field.value = '1';
      update(true);
    }
    function keydown(event) {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && isVisible() && getWindow()) {
        event.preventDefault(); event.stopPropagation?.(); dismissWindow();
        return;
      }
      const target = event.target;
      if (!root()?.contains(target) || target.dataset.journeyAction !== 'tab') return;
      const index = SCROLL_TABS.findIndex(t => t.id === target.dataset.journeyId);
      if (index < 0) return;
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % SCROLL_TABS.length;
      else if (event.key === 'ArrowLeft') next = (index + SCROLL_TABS.length - 1) % SCROLL_TABS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = SCROLL_TABS.length - 1;
      else return;
      event.preventDefault(); switchTab(SCROLL_TABS[next].id); document.getElementById(`journey-tab-${SCROLL_TABS[next].id}`)?.focus({preventScroll:true});
    }
    function deactivate() { pageOpened = false; sectInfoOpen = false; engine.setSectActive?.(false); previousSectActive = false; sectRefreshQueued=null;courtDraft=null;courtConflict='';courtPreview=false;sectDaylightMode='live';disposeSectScene();options.onWindowChange?.(''); }
    function onVisibility() { if (!document.hidden) { syncSectDaylight(); syncSectWeather(); } }
    document.addEventListener('click', click); document.addEventListener('input', input); document.addEventListener('change', change);
    document.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', onVisibility);
    if (!pageMode) document.getElementById('game-dialog')?.addEventListener('close', deactivate);
    return {
      open, openCodex() { return open('codex'); }, openResidences() { decorKind = 'residences'; return open('decor'); }, deactivate, close: deactivate, update, getSummary, getTab() { return tab; }, getWindow, dismissWindow,
      destroy() {
        disposed = true; deactivate();
        document.removeEventListener('click', click); document.removeEventListener('input', input); document.removeEventListener('change', change);
        document.removeEventListener('keydown', keydown);
        document.removeEventListener('visibilitychange', onVisibility);
        if (!pageMode) document.getElementById('game-dialog')?.removeEventListener('close', deactivate);
      }
    };
  };
})(window);
