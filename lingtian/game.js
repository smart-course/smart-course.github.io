/* 云间灵田 — deterministic rules, local persistence and simulated NPC gardens. */
(function (global) {
  'use strict';
  function createSpiritGameRuntime(runtime = global) {
  // Each server request supplies an isolated clock, randomness source and storage.
  // Never attach a request's engine or account state to a shared global object.
  const Date = runtime.Date || global.Date;
  const Math = runtime.Math || global.Math;
  // Online browsers hydrate an already-settled server snapshot. They may render
  // its clocks, but must never apply rain or frost a second time on the client.
  const weatherEnabled = runtime.disableWeather !== true;
  const environment = () => runtime.SpiritEnvironment || global.SpiritEnvironment;
  // Shared immutable catalog. An older offline build without it still reads
  // legacy generic decorations; new sect themes require this catalog to load.
  const sectCatalog = global.SpiritSects || null;
  const homesteadCatalog = global.SpiritHomestead || null;
  let localStorage;
  try { localStorage = runtime.localStorage; } catch (_) { /* Browser storage may be denied. */ }
  const VERSION = 6;
  // Balance revisions are independent of the save schema: changing a wait
  // must not erase the v6 journey, inventory or already-earned crop stages.
  const GROWTH_RULES_VERSION = 2;
  const GROWTH_SPEEDUP = 3;
  const ALCHEMY_VERSION = 5;
  const BALANCED_VERSION = 4;
  const STAGED_VERSION = 3;
  const PREVIOUS_VERSION = 2;
  const LEGACY_VERSION = 1;
  const SUPPORTED_VERSIONS = Object.freeze([LEGACY_VERSION, PREVIOUS_VERSION, STAGED_VERSION, BALANCED_VERSION, ALCHEMY_VERSION, VERSION]);
  const PLOT_COUNT = 25;
  const STARTER_PLOTS = 5;
  const LEGACY_PLOT_COUNT = 9;
  const LEGACY_STARTER_PLOTS = 6;
  const LEGACY_REALM_MAP = [0, 0, 0, 1, 2, 3];
  // Keep this key so existing browser saves are found and upgraded in place.
  const STORAGE_KEY = 'yunjian-lingtian-save-v1';
  const DEW_MAX = 8;
  const DEW_INTERVAL = 120000;
  const NEIGHBOR_INTERVAL = 180000;
  const MAX_VALUE = 100000000;
  const MAX_INVENTORY = 2000000;
  const PLOT_UNLOCK_COSTS = Object.freeze([0, 160, 240, 360, 520]);
  const WATERINGS_REQUIRED = 4;
  const GROWTH_STAGES = Object.freeze(['灵种', '萌芽', '舒叶', '蕴灵', '成熟']);
  const MAX_WEATHER_SEGMENTS = 512;
  const DAILY_LIMITS = Object.freeze({ pillsTaken: 3, pillQi: 30, stealAttempts: 10 });
  const BATCH_STEAL_MIN_REALM = 3;
  const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  function dayKey(now = Date.now()) {
    const parts = Object.fromEntries(DAY_FORMAT.formatToParts(now).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const newDaily = now => ({ day: dayKey(now), pillsTaken: 0, pillQi: 0, stealAttempts: 0 });
  function validDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [year, month, date] = day.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1970 && month >= 1 && month <= 12 && date >= 1 && date <= monthDays[month - 1];
  }
  const TOOL_CAPACITIES = Object.freeze([1, 3, 5]);
  const TOOL_DEFS = Object.freeze({
    hoe: Object.freeze({ name: '锄头', costs: Object.freeze([1200, 4800]) }),
    wateringCan: Object.freeze({ name: '浇水壶', costs: Object.freeze([1600, 6400]) })
  });
  // Only v3 saves can contain retired tool tiers. Refund their original prices once.
  const RETIRED_TOOL_COSTS = Object.freeze({
    hoe: Object.freeze([120, 360, 900, 2200]),
    wateringCan: Object.freeze([160, 480, 1200, 3000])
  });
  const MIGRATION_MESSAGE = '旧存档已升级为分阶段耕作：灵石、库存、境界和已开垦灵田均已保留。成熟灵植可直接采收；原在种灵植到时再浇一次水即可成熟。';
  const BALANCE_MIGRATION_MESSAGE = '农具已调整为最高三级。已有生长阶段已保留；后续浇水按当前间隔进行。';
  const GROWTH_MIGRATION_MESSAGE = '灵植成熟时间已缩短三分之二，按时照料需 40 分钟至 4 小时。已有生长阶段、成熟灵植和修行记录均已保留；正在等待的阶段，剩余时间已一次性缩至原来的三分之一。';
  const ALCHEMY_MIGRATION_MESSAGE = '丹炉已开启：灵草可炼成丹药或出售。每日最多服用 3 颗丹药，服丹增加修为合计不超过 30；每日最多偷采 10 次。原有资产和修为已保留，收割、偷采与直接炼化灵草不再增加修为。';
  const JOURNEY_MIGRATION_MESSAGE = '宗门委托与修行图鉴已开启，原有资产、丹炉和每日额度均已保留。各灵草的亲手采收、丹药的炼成记录从本次更新起积累，不补记无法确认的旧记录。';
  const CROPS = Object.freeze([
    { id: 'huangjing', name: '黄精芝', rarity: '凡品', grade: 1, color: '#d8ad52', price: 18, growTime: 2400000, sellPrice: 12, qi: 0, minRealm: 0, yield: 5, harvestQi: 0, short: '温养灵根', description: '芝盖如金，成簇而生。炼气修士最适合栽种的一味灵药，成熟后满圃生香。' },
    { id: 'zihou', name: '紫猴花', rarity: '灵品', grade: 2, color: '#aa88bd', price: 36, growTime: 4800000, sellPrice: 28, qi: 0, minRealm: 1, yield: 4, harvestQi: 0, short: '紫气初生', description: '筑基之后，方能养出这簇紫色灵花。灵气凝于花心，晨露映出点点金光。' },
    { id: 'tianling', name: '天灵果', rarity: '宝品', grade: 3, color: '#dd916b', price: 64, growTime: 7200000, sellPrice: 52, qi: 0, minRealm: 2, yield: 4, harvestQi: 0, short: '聚天地灵气', description: '结丹修士以灵力温养的果木。枝间灵果丰盈透亮，果香满园。' },
    { id: 'yueyang', name: '养魂木', rarity: '玄品', grade: 4, color: '#78a696', price: 100, growTime: 9600000, sellPrice: 90, qi: 0, minRealm: 3, yield: 5, harvestQi: 0, short: '凝神养魂', description: '元婴修士方能照料的养魂灵木。青枝成林，木心灵息悠长。' },
    { id: 'jiuqu', name: '九曲灵参', rarity: '仙品', grade: 5, color: '#d1ad6a', price: 240, growTime: 14400000, sellPrice: 210, qi: 0, minRealm: 4, yield: 6, harvestQi: 0, short: '九曲通灵', description: '化神之境可种植的珍稀灵参。根似游龙，参叶含光，成熟时仙气盈圃。' }
  ].map(c => Object.freeze(Object.assign(c, { waterIntervals: Object.freeze(Array(3).fill(c.growTime / 3)) }))));
  const PILLS = Object.freeze([
    { id: 'yangyuan', name: '养元丹', qi: 3, ingredients: { huangjing: 3 }, brewTime: 180000, cost: 8, minRealm: 0 },
    { id: 'qingling', name: '清灵丹', qi: 5, ingredients: { huangjing: 2, zihou: 1 }, brewTime: 600000, cost: 15, minRealm: 0 },
    { id: 'juqi', name: '聚气丹', qi: 8, ingredients: { huangjing: 3, zihou: 2 }, brewTime: 1200000, cost: 30, minRealm: 1 },
    { id: 'ningshen', name: '凝神丹', qi: 12, ingredients: { zihou: 3, tianling: 2 }, brewTime: 2700000, cost: 60, minRealm: 1 },
    { id: 'peiyuan', name: '培元丹', qi: 16, ingredients: { huangjing: 5, tianling: 3, yueyang: 1 }, brewTime: 5400000, cost: 120, minRealm: 2 },
    { id: 'yusui', name: '玉髓丹', qi: 20, ingredients: { zihou: 4, tianling: 2, yueyang: 3 }, brewTime: 10800000, cost: 240, minRealm: 2 },
    { id: 'guizhen', name: '归真丹', qi: 25, ingredients: { tianling: 4, yueyang: 5, jiuqu: 3 }, brewTime: 21600000, cost: 600, minRealm: 3 },
    { id: 'jiuzhuan', name: '九转玄元丹', qi: 30, ingredients: { huangjing: 30, zihou: 20, tianling: 15, yueyang: 12, jiuqu: 18 }, brewTime: 86400000, cost: 2000, minRealm: 4 }
  ].map(p => Object.freeze(Object.assign(p, { ingredients: Object.freeze(p.ingredients) }))));
  const PILL_MAP = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(PILLS.map(p => [p.id, p]))));
  // qiNeeded is the cost paid to advance FROM this realm TO the next one.
  const REALMS = Object.freeze([
    { name: '炼气', short: '炼气', qiNeeded: 120, color: '#9a793f' },
    { name: '筑基', short: '筑基', qiNeeded: 300, color: '#aa88bd' },
    { name: '结丹', short: '结丹', qiNeeded: 650, color: '#bc8954' },
    { name: '元婴', short: '元婴', qiNeeded: 1200, color: '#78955f' },
    { name: '化神', short: '化神', qiNeeded: 0, color: '#b08a3b' }
  ].map(Object.freeze));
  const CROP_MAP = Object.assign(Object.create(null), Object.fromEntries(CROPS.map(c => [c.id, c])));
  const NEIGHBOR_DEFS = Object.freeze([
    { id: 'qingyao', name: '青瑶仙子', title: '青竹居 · 筑基', realm: 1, unlockedCount: 10, avatar: '瑶', color: '#ac90b6', guard: 5, penalty: 8, sentence: '山中无事，来尝一盏新茶。' },
    { id: 'yunzhou', name: '云舟散人', title: '听雨轩 · 结丹', realm: 2, unlockedCount: 15, avatar: '舟', color: '#82a8aa', guard: 18, penalty: 15, sentence: '今日云淡，正宜论道。' },
    { id: 'moli', name: '墨离真人', title: '落霞峰 · 化神', realm: 4, unlockedCount: PLOT_COUNT, avatar: '离', color: '#ba9d72', guard: 30, penalty: 22, sentence: '灵田有阵，采草留心。' }
  ].map(Object.freeze));
  const QUEST_DEFS = Object.freeze([
    { id: 'plant', name: '初耕灵田', desc: '亲手种下 2 圃灵植', stat: 'plantCount', target: 2, reward: { stones: 50, qi: 10 } },
    { id: 'harvest', name: '满园灵香', desc: '收获 3 块成熟灵田', stat: 'harvestCount', target: 3, reward: { stones: 80, qi: 20 } },
    { id: 'steal', name: '仙友来往', desc: '成功偷采 2 次仙草', stat: 'stealCount', target: 2, reward: { stones: 60, qi: 20 } },
    { id: 'breakthrough', name: '仙途初进', desc: '完成 1 次境界突破', stat: 'breakthroughCount', target: 1, reward: { stones: 120, qi: 30 } }
  ]);
  const STAT_KEYS = ['plantCount', 'waterCount', 'clearCount', 'toolUpgradeCount', 'harvestCount', 'harvestUnits', 'stealCount', 'stealAttempts', 'stealFailCount', 'sellCount', 'sellEarnings', 'refineCount', 'breakthroughCount', 'unlockCount', 'brewCount', 'brewClaims', 'pillsTaken', 'pillQi'];
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const integer = (x, min, max, fallback) => finite(x) ? Math.max(min, Math.min(max, Math.floor(x))) : fallback;
  const validIndex = index => Number.isInteger(index) && index >= 0 && index < PLOT_COUNT;
  const plotRealm = index => Math.floor(index / STARTER_PLOTS);
  const emptyPlot = unlocked => ({ cropId: null, plantedAt: 0, duration: 0, watered: false, unlocked, stage: 0, nextWaterAt: 0, withered: false });
  const isMature = (p, now = Date.now()) => getGrowthInfo(p, now).mature;
  const isRecord = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const JOURNEY_DAY = 86400000;
  const JOURNEY_ZONE = 8 * 3600000;
  // Only used to read the preceding calendar's unfinished seasonal commission.
  // New seasonal periods use the account's original createdAt. A transition
  // preserves old progress and claim receipts until the next personal season.
  const JOURNEY_SEASON_EPOCH = 1793980800000;
  const COMMISSION_PERIODS = Object.freeze(['daily', 'weekly', 'seasonal']);
  const JOURNEY_ACTIONS = Object.freeze(['plant', 'water', 'clear', 'harvest', 'brew']);
  const JOURNEY_SEASONS = Object.freeze([
    { id: 'spring', name: '春', festival: '百草会', metric: 'harvest', target: 12, decorationId: 'springBanner', title: '春山药友', description: '本季亲手收获 12 块成熟灵田，让新芽的故事留在春山。' },
    { id: 'summer', name: '夏', festival: '灵泉会', metric: 'water', target: 36, decorationId: 'summerBanner', title: '听泉守夏', description: '本季完成 36 块次有效浇水，以灵泉照料满山草木。' },
    { id: 'autumn', name: '秋', festival: '丰收集', metric: 'harvest', target: 16, decorationId: 'autumnBanner', title: '秋山拾穗', description: '本季亲手收获 16 块成熟灵田，记下属于自己的丰收。' },
    { id: 'winter', name: '冬', festival: '围炉会', metric: 'brew', target: 5, decorationId: 'winterBanner', title: '雪夜丹心', description: '本季从丹炉领取 5 颗亲手炼成的丹药，在雪夜守候炉火。' }
  ].map(Object.freeze));
  const DECORATIONS = Object.freeze([
    { id: 'bambooFence', name: '青竹篱', description: '一圈青竹守着药圃，风过时，山居更有生气。', cost: 360, source: '灵石置办', requirement: '花费 360 灵石置办。' },
    { id: 'stoneLantern', name: '暖玉石灯', description: '夜里留一盏温暖的灯，照亮回到灵田的小径。', cost: 680, source: '灵石置办', requirement: '花费 680 灵石置办。' },
    { id: 'spiritPond', name: '照影灵池', description: '池畔浮光映着灵植，为山中添一处清闲。', cost: 1280, source: '灵石置办', requirement: '花费 1,280 灵石置办。' },
    { id: 'masterStele', name: '百草精通碑', description: '刻下长期照料灵草的心得，见证园主的熟练。', cost: 0, source: '图鉴成就', requirement: '任一灵草亲手收获 40 块田，并领取「灵植宗匠」成就。' },
    { id: 'springBanner', name: '春山百草旗', description: '新绿与桃色相映，纪念春季百草会。', cost: 0, source: '春季活动', requirement: '完成并领取春季「百草会」纪念。' },
    { id: 'summerBanner', name: '夏夜听泉旗', description: '青碧的旗面随风舒展，纪念夏季灵泉会。', cost: 0, source: '夏季活动', requirement: '完成并领取夏季「灵泉会」纪念。' },
    { id: 'autumnBanner', name: '秋山丰收旗', description: '暖橙染上旗角，纪念秋季丰收集。', cost: 0, source: '秋季活动', requirement: '完成并领取秋季「丰收集」纪念。' },
    { id: 'winterBanner', name: '雪夜丹心旗', description: '雪色与朱红交织，纪念冬季围炉会。', cost: 0, source: '冬季活动', requirement: '完成并领取冬季「围炉会」纪念。' },
    { id: 'sectGate', name: '同心山门', description: '共同筑起的山门，记着每位道友的一份心意。', cost: 0, source: '宗门共建', requirement: '宗门山门建成，满足个人贡献条件后领取。' },
    { id: 'sectSpring', name: '共济灵泉', description: '大家引来的泉水，在自己的洞天中留下一处纪念。', cost: 0, source: '宗门共建', requirement: '宗门灵泉建成，满足个人贡献条件后领取。' },
    { id: 'sectLibrary', name: '藏书小阁', description: '一方书阁收藏草木与丹道的见闻。', cost: 0, source: '宗门共建', requirement: '宗门藏书阁建成，满足个人贡献条件后领取。' },
    ...(homesteadCatalog?.scenery || [])
  ].map(Object.freeze));
  const DECORATION_MAP = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(DECORATIONS.map(item => [item.id, item]))));
  const decorationLabel = item => item.repeatable ? `${item.name} · 第 ${item.copyIndex} 棵` : item.name;
  // The protocol accepts every known decoration; the owner-specific limit is
  // checked again against the saved realm when loading, equipping and saving.
  // weeklyClaims 3→4（2026-11-26）：每周多一张“坊市采购单”，四张都能领。
  const JOURNEY_LIMITS = Object.freeze({ dailyClaims: 2, weeklyClaims: 4, seasonalClaims: 1, equippedDecorations: DECORATIONS.length });
  const DECOR_REALM_LIMITS = Object.freeze(REALMS.map((_, index) => Math.min(DECORATIONS.length, [6, 8, 10, 12][index] ?? DECORATIONS.length)));
  function decorationLimitForRealm(realm) {
    return DECOR_REALM_LIMITS[Number.isInteger(realm) && realm >= 0 && realm < REALMS.length ? realm : 0];
  }
  const RESIDENCES = Object.freeze((homesteadCatalog?.residences || []).slice());
  const RESIDENCE_MAP = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(RESIDENCES.map(item => [item.id, item]))));
  // Courtyard coordinates are shared by the renderer, editor and authoritative
  // server. Footprints include eaves/base overhang, not just the model's origin.
  // 2026-11-22 放宽摆放范围（用户：“布置洞天里面小景可以摆放的范围再大一些……除了种田那块地方以外都可以摆放，如果是碰到石头之类的，
  // 直接覆盖掉”）：可摆到草地边上（radius 11.5 → 12.6，仙山草地最窄处约 12.86）；原有的松树、灵石不再挡位置，被小景压住的自动收起
  // （coveredDecorObstacles，渲染层据此隐藏）；小景之间可以挨着、略有交叠，只要各自中间的六成（overlapCore）不相叠；灵田和水渠照旧不能占。
  // 新买、重新摆出的小景自动找空位时，仍先按原来的规矩（tidy：半径 11.5、留 0.12 的缝、避开松树灵石）找，找不到才用放宽后的规则。
  const DECOR_LAYOUT_RULES = Object.freeze({
    grid: .25, rotationStep: 45, groundY: .24, radius: 12.6, terrainRadius: 13.2, clearance: 0, overlapCore: .6,
    tidy: Object.freeze({ radius: 11.5, clearance: .12 }),
    fieldBounds: Object.freeze({ minX: -6.85, maxX: 6.85, minZ: -6.85, maxZ: 6.85 }),
    footprints: Object.freeze(Object.fromEntries([
      ['bambooFence', 2.9, .45], ['stoneLantern', 2, 1.15], ['spiritPond', 2, 2], ['masterStele', 1.6, 1.1],
      ['springBanner', 1.9, 1], ['summerBanner', 1.9, 1], ['autumnBanner', 1.9, 1], ['winterBanner', 1.9, 1],
      ['sectGate', 3.2, 1.45], ['sectSpring', 2.5, 2.5], ['sectLibrary', 2.45, 1.75],
      ...(homesteadCatalog?.scenery || []).map(item => [item.id, item.footprint.width, item.footprint.depth])
    ].map(([id, width, depth]) => [id, Object.freeze({ width, depth })]))),
    defaultSpots: Object.freeze([
      Object.freeze({ x: 3.5, z: -8.25, rotation: 0 }),
      Object.freeze({ x: -3.5, z: 8.25, rotation: 0 }),
      Object.freeze({ x: 8.25, z: -1.75, rotation: 315 }),
      Object.freeze({ x: -8, z: 3.25, rotation: 0 }),
      Object.freeze({ x: -8, z: -3.25, rotation: 0 }),
      Object.freeze({ x: 8, z: -3.5, rotation: 0 }),
      Object.freeze({ x: 2, z: 8.5, rotation: 90 }),
      Object.freeze({ x: -2, z: 8.5, rotation: 90 }),
      Object.freeze({ x: 3.5, z: -8.5, rotation: 0 }),
      Object.freeze({ x: -8.5, z: -.5, rotation: 90 })
    ]),
    obstacles: Object.freeze([
      // The renderer uses these same objects. Solid scenery belongs to the
      // outer verge, so clearing it never leaves an invisible old collider.
      // cover：小景的占地压到这件原有景物中间多大一块（占它 width/depth 的比例）时，把它收起
      { name: '松树', kind: 'pine', x: -12.5, z: -.9, width: 1.9, depth: 1.5, scale: .65, rotation: 0, cover: .6 },
      { name: '松树', kind: 'pine', x: -10.4, z: 7.2, width: 1.9, depth: 1.5, scale: .62, rotation: 0, cover: .6 },
      { name: '松树', kind: 'pine', x: 12.35, z: 2.6, width: 1.9, depth: 1.5, scale: .62, rotation: 0, cover: .6 },
      { name: '灵石', kind: 'crystal', x: -9.5, z: -8.5, width: 1.1, depth: 1.1, height: 1.35, rotation: 0, cover: .9 },
      { name: '灵石', kind: 'crystal', x: 7.4, z: 10.3, width: 1.1, depth: 1.1, height: 1.20, rotation: 0, cover: .9 }
    ].map(Object.freeze))
  });
  const validDecorIds = ids => Array.isArray(ids) && ids.length <= JOURNEY_LIMITS.equippedDecorations
    && new Set(ids).size === ids.length && Array.from(ids).every(id => typeof id === 'string' && !!DECORATION_MAP[id]);
  function validDecorPlacement(entry) {
    return isRecord(entry) && Object.keys(entry).length === 4 && ['id', 'x', 'z', 'rotation'].every(key => Object.hasOwn(entry, key))
      && typeof entry.id === 'string' && !!DECORATION_MAP[entry.id]
      && ['x', 'z'].every(key => finite(entry[key]) && Math.abs(entry[key]) <= DECOR_LAYOUT_RULES.radius && Number.isInteger(entry[key] / DECOR_LAYOUT_RULES.grid))
      && Number.isInteger(entry.rotation) && entry.rotation >= 0 && entry.rotation < 360 && entry.rotation % DECOR_LAYOUT_RULES.rotationStep === 0;
  }
  function decorBox(entry, footprint) {
    const angle = entry.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    // THREE's positive Y rotation sends local +X toward world -Z.
    const axes = [{ x: c, z: -s }, { x: s, z: c }], half = [footprint.width / 2, footprint.depth / 2];
    const corners = [];
    for (const side of [-1, 1]) for (const end of [-1, 1]) corners.push({
      x: entry.x + axes[0].x * half[0] * side + axes[1].x * half[1] * end,
      z: entry.z + axes[0].z * half[0] * side + axes[1].z * half[1] * end
    });
    return { x: entry.x, z: entry.z, axes, half, corners };
  }
  function decorBoxesOverlap(a, b, clearance = DECOR_LAYOUT_RULES.clearance) {
    const dot = (u, v) => u.x * v.x + u.z * v.z, offset = { x: b.x - a.x, z: b.z - a.z };
    return [...a.axes, ...b.axes].every(axis => {
      const reach = box => Math.abs(dot(box.axes[0], axis)) * box.half[0] + Math.abs(dot(box.axes[1], axis)) * box.half[1];
      return Math.abs(dot(offset, axis)) < reach(a) + reach(b) + clearance - 1e-8;
    });
  }
  const DECOR_FIELD_BOX = decorBox({ x: 0, z: 0, rotation: 0 }, { width: 13.7, depth: 13.7 });
  const DECOR_OBSTACLE_BOXES = DECOR_LAYOUT_RULES.obstacles.map(item => ({ name: item.name, box: decorBox(item, item),
    cover: decorBox(item, { width: item.width * (item.cover || 1), depth: item.depth * (item.cover || 1) }) }));
  // 小景之间只比中间这一块：两件可以挨着、檐角树冠略有交叠，但不能叠在同一处
  const decorCoreBox = entry => {
    const size = DECOR_LAYOUT_RULES.footprints[entry.id], scale = DECOR_LAYOUT_RULES.overlapCore;
    return decorBox(entry, { width: size.width * scale, depth: size.depth * scale });
  };
  // 原有的松树、灵石里，哪几件被这份布置压住了（按 DECOR_LAYOUT_RULES.obstacles 的次序返回 true/false）；渲染层据此把它们收起
  function coveredDecorObstacles(layout) {
    const boxes = (Array.isArray(layout) ? layout : []).filter(entry => isRecord(entry) && DECOR_LAYOUT_RULES.footprints[entry.id]
      && ['x', 'z', 'rotation'].every(key => finite(entry[key]))).map(entry => decorBox(entry, DECOR_LAYOUT_RULES.footprints[entry.id]));
    return DECOR_OBSTACLE_BOXES.map(item => boxes.some(box => decorBoxesOverlap(box, item.cover, 0)));
  }
  // 自动找空位用的“整齐”位置：照原来的规矩，不贴边、留缝、不压松树灵石、不和别的小景相叠
  function decorSpotIsTidy(entry, others) {
    const tidy = DECOR_LAYOUT_RULES.tidy, box = decorBox(entry, DECOR_LAYOUT_RULES.footprints[entry.id]);
    if (box.corners.some(point => point.x * point.x + point.z * point.z > tidy.radius ** 2 + 1e-8)) return false;
    if (decorBoxesOverlap(box, DECOR_FIELD_BOX, tidy.clearance)) return false;
    if (DECOR_OBSTACLE_BOXES.some(item => decorBoxesOverlap(box, item.box, tidy.clearance))) return false;
    return !others.some(item => decorBoxesOverlap(box, decorBox(item, DECOR_LAYOUT_RULES.footprints[item.id]), tidy.clearance));
  }
  function validateDecorLayout(layout, equipped) {
    const reject = (code, message) => ({ ok: false, code, message });
    if (!validDecorIds(equipped) || !Array.isArray(layout) || layout.length !== equipped.length || layout.length > JOURNEY_LIMITS.equippedDecorations)
      return reject('decor_layout_changed', '已布置的装饰发生变化，请重新打开布置界面。');
    if (!Array.from(layout).every(validDecorPlacement) || new Set(layout.map(item => item.id)).size !== layout.length)
      return reject('decor_layout_invalid', '摆放资料无效，请使用格点移动和旋转按钮调整装饰。');
    if (layout.some(item => !equipped.includes(item.id)))
      return reject('decor_layout_changed', '只能调整当前已经布置的装饰，请重新打开布置界面。');
    const boxes = [];
    for (const entry of layout) {
      const name = decorationLabel(DECORATION_MAP[entry.id]), box = decorBox(entry, DECOR_LAYOUT_RULES.footprints[entry.id]);
      if (box.corners.some(point => point.x * point.x + point.z * point.z > DECOR_LAYOUT_RULES.radius ** 2 + 1e-8))
        return reject('decor_layout_edge', `「${name}」太靠近仙山边缘，请往草地内侧移一点。`);
      if (decorBoxesOverlap(box, DECOR_FIELD_BOX))
        return reject('decor_layout_field', `「${name}」遮占灵田或引水渠，请放在田园周围的草地上。`);
      const core = decorCoreBox(entry), occupied = boxes.find(item => decorBoxesOverlap(core, item.box));
      if (occupied) return reject('decor_layout_overlap', `「${name}」与「${decorationLabel(DECORATION_MAP[occupied.id])}」叠在一处了，请稍微拉开一点（可以挨着）。`);
      boxes.push({ id: entry.id, box: core });
    }
    const byId = new Map(layout.map(item => [item.id, item]));
    return { ok: true, message: '这处布置可以保存。', layout: equipped.map(id => {
      const entry = byId.get(id); return { id, x: entry.x || 0, z: entry.z || 0, rotation: entry.rotation || 0 };
    }) };
  }
  function findDecorPlacement(id, current, preferred) {
    const ids = [...current.map(item => item.id), id];
    const fits = entry => validateDecorLayout([...current, entry], ids).ok;
    // 以前亲手摆过的位置只要现在还合规就原样放回；其余先找整齐的空位，实在没有再按放宽后的规则找
    if (preferred && validDecorPlacement(preferred)) { const existing = { ...preferred, id }; if (fits(existing)) return existing; }
    return searchDecorPlacement(id, current, entry => decorSpotIsTidy(entry, current) && fits(entry) ? entry : null)
      || searchDecorPlacement(id, current, entry => fits(entry) ? entry : null);
  }
  function searchDecorPlacement(id, current, tryPlacement) {
    const shopSpot = homesteadCatalog?.getScenery(id)?.preferredSpot;
    if (shopSpot) {
      for (let turn = 0; turn < 360; turn += DECOR_LAYOUT_RULES.rotationStep) {
        const candidate = { id, x: shopSpot.x, z: shopSpot.z, rotation: (shopSpot.rotation + turn) % 360 };
        if (tryPlacement(candidate)) return candidate;
      }
    }
    const slots = DECOR_LAYOUT_RULES.defaultSpots;
    for (let offset = 0; offset < slots.length; offset++) {
      const slot = slots[(current.length + offset) % slots.length];
      for (let turn = 0; turn < 360; turn += DECOR_LAYOUT_RULES.rotationStep) {
        const candidate = { id, x: slot.x, z: slot.z, rotation: (slot.rotation + turn) % 360 };
        if (tryPlacement(candidate)) return candidate;
      }
    }
    // Ornaments can fill the old fixed slots while leaving usable ground
    // between them. Search only legal grid points, never move saved items or
    // weaken field/obstacle checks to make a new purchase fit.
    const span = Math.floor(DECOR_LAYOUT_RULES.radius / DECOR_LAYOUT_RULES.grid);
    const candidates = [];
    for (let gx = -span; gx <= span; gx++) for (let gz = -span; gz <= span; gz++) {
      const x = gx * DECOR_LAYOUT_RULES.grid, z = gz * DECOR_LAYOUT_RULES.grid;
      if ((Math.abs(x) < 7 && Math.abs(z) < 7) || x * x + z * z > DECOR_LAYOUT_RULES.radius ** 2) continue;
      candidates.push({ x, z });
    }
    const anchor = shopSpot || slots[current.length % slots.length];
    candidates.sort((a, b) => (a.x - anchor.x) ** 2 + (a.z - anchor.z) ** 2 - (b.x - anchor.x) ** 2 - (b.z - anchor.z) ** 2 || a.x - b.x || a.z - b.z);
    for (const point of candidates) for (let rotation = 0; rotation < 180; rotation += DECOR_LAYOUT_RULES.rotationStep) {
      const candidate = { id, ...point, rotation };
      if (tryPlacement(candidate)) return candidate;
    }
    return null;
  }
  function getDefaultDecorLayout(ids) {
    if (!validDecorIds(ids)) return [];
    const layout = [];
    for (const id of ids) { const entry = findDecorPlacement(id, layout); if (!entry) return []; layout.push(entry); }
    return layout;
  }
  const SECT_DECORATIONS = Object.freeze(Object.assign(Object.create(null), { gate: 'sectGate', spring: 'sectSpring', library: 'sectLibrary' }));
  const cosmeticReward = (title, decorationId = null) => Object.freeze({ stones: 0, decorationId, title });
  const ACHIEVEMENTS = Object.freeze([
    { id: 'firstHarvest', name: '初入药圃', description: '亲手收获 1 块成熟灵田。', metric: 'harvest', target: 1, reward: cosmeticReward('初入药圃') },
    { id: 'herbScholar', name: '百草识者', description: '亲手收获过 3 种不同灵草。', metric: 'herbKinds', target: 3, reward: cosmeticReward('百草识者') },
    { id: 'herbMaster', name: '灵植宗匠', description: '任意一种灵草累计亲手收获 40 块田。', metric: 'herbMastery', target: 40, reward: cosmeticReward('灵植宗匠', 'masterStele') },
    { id: 'firstBrew', name: '丹火初明', description: '从丹炉领取 1 颗亲手炼成的丹药。', metric: 'brew', target: 1, reward: cosmeticReward('丹火初明') },
    { id: 'pillScholar', name: '丹道游学', description: '亲手炼成并领取 4 种不同丹药。', metric: 'pillKinds', target: 4, reward: cosmeticReward('丹道游学') },
    { id: 'pillMaster', name: '炉火纯青', description: '任意一种丹药累计亲手炼成并领取 20 颗。', metric: 'pillMastery', target: 20, reward: cosmeticReward('炉火纯青') },
    { id: 'patientKeeper', name: '春风化雨', description: '累计完成 100 块次有效浇水。', metric: 'water', target: 100, reward: cosmeticReward('春风化雨') },
    { id: 'commissionKeeper', name: '守诺之人', description: '累计完成并领取 12 项宗门委托或四时活动。', metric: 'commissions', target: 12, reward: cosmeticReward('守诺之人') },
    { id: 'realmPeak', name: '云上问道', description: '达到化神境界。', metric: 'realm', target: 4, reward: cosmeticReward('云上问道') }
  ].map(Object.freeze));
  const STORY_CHAPTERS = Object.freeze([
    { id: 'realm_0', realm: 0, title: '第一章 · 一粒灵种的代价', text: '初到青云峰，药师递来一粒灵种：“灵石买来种子，照料要花时间，土地也只能种一株。选下一炉丹药时，记得想想放弃了哪一种收获。”你在田埂上记下第一笔账：种子、炉费、收成与等待。药铺有固定的收购价；坊市里，道友是否愿意成交，还要看供给与需要。' },
    { id: 'realm_1', realm: 1, title: '第二章 · 一口价与一张委托', text: '筑基之后，你在坊市挂出第一张委托。掌柜提醒：“标出的价格只是意愿，真正成交才算交换。更有竞争力的报价先成交，同价时先来的委托在前；尚未成交的部分可以撤回。”于是你开始比较买卖报价，也学会了把手续费和等待算进成本。' },
    { id: 'realm_2', realm: 2, title: '第三章 · 低阶灵草也有用处', text: '结丹那日，一位道友提来满筐黄精芝，换走你新炼的丹药。高阶丹方仍要用到低阶灵草，每人擅长的照料节奏也各不相同。有人专心种植，有人守着丹炉，有人补齐材料：分工让彼此的长处相接，合作的价值来自真实的产出。' },
    { id: 'realm_3', realm: 3, title: '第四章 · 山门是大家的', text: '元婴出游时，你见到道友们一同修缮山门。有人捐出灵草，有人只贡献少量收成，每一份都留在共建记录里。共有的山门由众人使用，付出与受益并不总是同时发生。宗门用清楚的目标、贡献上限和阶段规则，让合作可以被看见，也让新来的道友有参与的机会。' },
    { id: 'realm_4', realm: 4, title: '第五章 · 仙途也有取舍', text: '化神之后，灵田依旧有晨昏，最珍贵的灵参也仍要耐心照料。你不再只问今日多得几枚灵石，而是选择要精通的丹方、要收藏的四时纪念，以及愿意和谁共建山门。修为、时间与灵石各有用处；把有限的资源放到自己珍视的目标上，也是一种修行。' }
  ].map(Object.freeze));
  const JOURNEY_TITLES = Object.freeze([...ACHIEVEMENTS.map(item => item.reward.title), ...JOURNEY_SEASONS.map(item => item.title)]);
  const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const emptyJourneyCounts = () => Object.fromEntries(JOURNEY_ACTIONS.map(key => [key, 0]));
  function journeyWindowFromIndex(period, index, origin = null) {
    if (period === 'daily') {
      const startsAt = index * JOURNEY_DAY - JOURNEY_ZONE;
      return { index, key: dayKey(startsAt), startsAt, endsAt: startsAt + JOURNEY_DAY };
    }
    if (period === 'weekly') {
      const startsAt = (index * 7 - 3) * JOURNEY_DAY - JOURNEY_ZONE;
      return { index, key: dayKey(startsAt), startsAt, endsAt: startsAt + 7 * JOURNEY_DAY };
    }
    const startsAt = (origin === null ? JOURNEY_SEASON_EPOCH : origin) + index * 7 * JOURNEY_DAY;
    return { index, key: origin === null ? String(index) : `p${origin}_${index}`, startsAt, endsAt: startsAt + 7 * JOURNEY_DAY };
  }
  function journeyWindow(period, now, origin = null) {
    const day = Math.floor((now + JOURNEY_ZONE) / JOURNEY_DAY);
    const seasonElapsed = origin === null ? now - JOURNEY_SEASON_EPOCH : Math.max(0, now - origin);
    const index = period === 'daily' ? day : period === 'weekly' ? Math.floor((day + 3) / 7) : Math.floor(seasonElapsed / (7 * JOURNEY_DAY));
    return journeyWindowFromIndex(period, index, origin);
  }
  function newJourneyPeriod(period, now, realm, origin = null) {
    return { index: journeyWindow(period, now, origin).index, realm, counts: emptyJourneyCounts(), claimed: [] };
  }
  function newJourney(now, realm, origin = now) {
    return {
      version: 1, since: now, calendarVersion: 2, seasonTransition: null,
      herbs: Object.fromEntries(CROPS.map(crop => [crop.id, { planted: 0, watered: 0, harvests: 0, units: 0, firstPlantedAt: null, firstHarvestAt: null }])),
      pills: Object.fromEntries(PILLS.map(pill => [pill.id, { brews: 0, firstBrewAt: null }])),
      totals: Object.assign(emptyJourneyCounts(), { commissions: 0 }),
      daily: newJourneyPeriod('daily', now, realm, origin), weekly: newJourneyPeriod('weekly', now, realm, origin), seasonal: newJourneyPeriod('seasonal', now, realm, origin),
      achievements: Object.fromEntries(ACHIEVEMENTS.map(item => [item.id, false])),
      decorations: { owned: [], equipped: [], placements: [], themes: {} },
      residence: { owned: [], equipped: null }, titles: [], activeTitle: '', stories: [],
      seasonRecords: Object.fromEntries(JOURNEY_SEASONS.map(season => [season.id, 0])),
      sectRewards: { gate: false, spring: false, library: false }
    };
  }
  // 每周“坊市采购单”（2026-11-26）：按本期冻结的境界（record.realm）取一档。
  // 炼气—结丹要高一阶、自己种不了的灵植；元婴、化神坊市上没有更高阶的货，
  // 改成大批量黄精芝，向低境界道友收更合算。数量、奖励只在这里调。
  const MARKET_ORDERS = Object.freeze([
    { cropId: 'zihou', quantity: 3, stones: 260, reason: '你的境界还种不了它，要去坊市向道友买' },
    { cropId: 'tianling', quantity: 2, stones: 320, reason: '你的境界还种不了它，要去坊市向道友买' },
    { cropId: 'yueyang', quantity: 2, stones: 360, reason: '你的境界还种不了它，要去坊市向道友买' },
    { cropId: 'huangjing', quantity: 30, stones: 600, reason: '自己种要占好几块田，去坊市向道友收更划算' },
    { cropId: 'huangjing', quantity: 30, stones: 600, reason: '自己种要占好几块田，去坊市向道友收更划算' }
  ].map(Object.freeze));
  function commissionDefinitions(period, record, origin = null) {
    const window = journeyWindowFromIndex(period, record.index, origin), realm = record.realm;
    let definitions;
    if (period === 'daily') {
      const water = positiveMod(record.index, 2) === 0, harvest = positiveMod(record.index, 3) !== 0;
      const careTarget = water ? 3 + Math.min(realm, 2) : 2 + Math.floor(realm / 2);
      const gardenTarget = 2 + Math.floor(realm / 2);
      // Fivefold daily stone rewards. Keep task IDs and saved claim markers so
      // unclaimed tasks use these amounts without replaying earlier payouts.
      definitions = [
        { id: 'tend', name: water ? '晨露润田' : '整畦待春', description: water ? `完成 ${careTarget} 块次有效浇水。` : `用锄头清理 ${careTarget} 块已采收的枯田。`, metric: water ? 'water' : 'clear', target: careTarget, stones: 125 },
        { id: 'garden', name: harvest ? '药圃采香' : '灵种入畦', description: harvest ? `亲手收获 ${gardenTarget} 块成熟灵田。` : `在空田中成功播种 ${gardenTarget} 次。`, metric: harvest ? 'harvest' : 'plant', target: gardenTarget, stones: harvest ? 150 : 125 },
        { id: 'furnace', name: '丹火小成', description: '从丹炉领取 1 颗亲手炼成的丹药。购买、服用不计入。', metric: 'brew', target: 1, stones: 150 }
      ];
    } else if (period === 'weekly') {
      const deliveries = [{ cropId: 'huangjing', quantity: 10 }, { cropId: 'zihou', quantity: 4 }, { cropId: 'tianling', quantity: 2 }, { cropId: 'yueyang', quantity: 1 }];
      const chosen = deliveries[positiveMod(record.index, Math.min(realm, 3) + 1)], crop = CROP_MAP[chosen.cropId];
      const delivery = { cropId: chosen.cropId, name: crop.name, quantity: chosen.quantity };
      const harvestTarget = 8 + 2 * realm, brewTarget = 3 + Math.floor(realm / 2);
      const order = MARKET_ORDERS[Math.max(0, Math.min(realm, MARKET_ORDERS.length - 1))], orderCrop = CROP_MAP[order.cropId];
      const marketDelivery = { cropId: order.cropId, name: orderCrop.name, quantity: order.quantity };
      definitions = [
        { id: 'harvest', name: '一周药圃记', description: `本周亲手收获 ${harvestTarget} 块成熟灵田。`, metric: 'harvest', target: harvestTarget, stones: 70 },
        { id: 'brew', name: '炉火有常', description: `本周从丹炉领取 ${brewTarget} 颗亲手炼成的丹药。`, metric: 'brew', target: brewTarget, stones: 90 },
        { id: 'supply', name: '宗门药材单', description: `交付${crop.name} ×${delivery.quantity}，领取时从可用库存扣除。可种植，也可在坊市购买。`, metric: 'delivery', target: delivery.quantity, stones: 120, delivery },
        // 新增于原三张之后：原有编号与顺序不变，旧存档的 claimed 照常有效。
        { id: 'market', name: '坊市采购单', description: `交付${orderCrop.name} ×${order.quantity}。${order.reason}；领取时从乾坤袋扣除。`, metric: 'delivery', target: order.quantity, stones: order.stones, delivery: marketDelivery }
      ];
    } else {
      const season = JOURNEY_SEASONS[positiveMod(record.index, JOURNEY_SEASONS.length)];
      definitions = [{ id: 'festival', name: `${season.name} · ${season.festival}`, description: season.description, metric: season.metric, target: season.target, stones: 0, decorationId: season.decorationId, title: season.title }];
    }
    return definitions.map(definition => Object.assign({}, definition, {
      id: `${period}:${window.key}:${definition.id}`,
      delivery: definition.delivery || null,
      reward: { stones: definition.stones, decorationId: definition.decorationId || null, title: definition.title || null }
    }));
  }
  function achievementProgress(state, achievement) {
    const journey = state.journey;
    if (achievement.metric === 'herbKinds') return CROPS.filter(item => journey.herbs[item.id].harvests > 0).length;
    if (achievement.metric === 'herbMastery') return Math.max(...CROPS.map(item => journey.herbs[item.id].harvests));
    if (achievement.metric === 'pillKinds') return PILLS.filter(item => journey.pills[item.id].brews > 0).length;
    if (achievement.metric === 'pillMastery') return Math.max(...PILLS.map(item => journey.pills[item.id].brews));
    if (achievement.metric === 'realm') return state.realm;
    return journey.totals[achievement.metric];
  }
  function rewardLabel(reward) {
    return [reward.stones ? `${reward.stones} 灵石` : '', reward.decorationId ? DECORATION_MAP[reward.decorationId].name : '', reward.title ? `称号「${reward.title}」` : ''].filter(Boolean).join(' · ');
  }
  function masteryInfo(count, kind) {
    const thresholds = kind === 'herb' ? [1, 10, 40] : [1, 5, 20];
    const names = kind === 'herb' ? ['未入谱', '初识草木', '熟习药性', '灵植精通'] : ['尚未炼制', '初试丹火', '熟习丹方', '炉火纯青'];
    const level = thresholds.filter(value => count >= value).length, maxed = level === thresholds.length;
    const target = maxed ? thresholds[thresholds.length - 1] : thresholds[level];
    return { level, name: names[level], progress: Math.min(count, target), target, nextTarget: maxed ? null : target, maxed };
  }
  function validateJourney(input, state, now) {
    const bad = () => { throw new Error('修行小记、委托或庭院收藏资料无效，原进度已保留。'); };
    const count = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_VALUE;
    const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= now;
    const list = (value, allowed, limit = allowed.length) => Array.isArray(value) && value.length <= limit && new Set(value).size === value.length && value.every(item => typeof item === 'string' && allowed.includes(item));
    if (!isRecord(input) || input.version !== 1 || !timestamp(input.since) || !isRecord(input.herbs) || !isRecord(input.pills) || !isRecord(input.totals)) bad();
    const legacyCalendar = input.calendarVersion === undefined;
    if (!legacyCalendar && input.calendarVersion !== 2) bad();
    let transition = null;
    if (!legacyCalendar && input.seasonTransition !== null) {
      const candidate = input.seasonTransition;
      if (!isRecord(candidate) || Object.keys(candidate).length !== 3 ||
          !timestamp(candidate.migratedAt) || candidate.migratedAt < state.createdAt ||
          candidate.switchAt !== journeyWindow('seasonal', candidate.migratedAt, state.createdAt).endsAt ||
          !Number.isSafeInteger(candidate.legacyIndex) || candidate.legacyIndex !== input.seasonal?.index) bad();
      transition = { migratedAt: candidate.migratedAt, switchAt: candidate.switchAt, legacyIndex: candidate.legacyIndex };
    }
    const journey = newJourney(input.since, state.realm, state.createdAt);
    journey.seasonTransition = transition;
    journey.since = input.since;
    for (const crop of CROPS) {
      const record = input.herbs[crop.id];
      if (!isRecord(record) || !['planted', 'watered', 'harvests', 'units'].every(key => count(record[key]))) bad();
      if ((record.planted === 0 ? record.firstPlantedAt !== null : !timestamp(record.firstPlantedAt)) || (record.harvests === 0 ? record.firstHarvestAt !== null : !timestamp(record.firstHarvestAt))) bad();
      if ((record.harvests === 0 && record.units !== 0) || record.units < record.harvests || record.units > record.harvests * crop.yield) bad();
      journey.herbs[crop.id] = { planted: record.planted, watered: record.watered, harvests: record.harvests, units: record.units, firstPlantedAt: record.firstPlantedAt, firstHarvestAt: record.firstHarvestAt };
    }
    for (const pill of PILLS) {
      const record = input.pills[pill.id];
      if (!isRecord(record) || !count(record.brews) || (record.brews === 0 ? record.firstBrewAt !== null : !timestamp(record.firstBrewAt))) bad();
      journey.pills[pill.id] = { brews: record.brews, firstBrewAt: record.firstBrewAt };
    }
    for (const key of [...JOURNEY_ACTIONS, 'commissions']) { if (!count(input.totals[key])) bad(); journey.totals[key] = input.totals[key]; }
    const sum = (items, key) => Math.min(MAX_VALUE, items.reduce((total, item) => total + item[key], 0));
    if (journey.totals.plant !== sum(Object.values(journey.herbs), 'planted') || journey.totals.water !== sum(Object.values(journey.herbs), 'watered') || journey.totals.harvest !== sum(Object.values(journey.herbs), 'harvests') || journey.totals.brew !== sum(Object.values(journey.pills), 'brews')) bad();
    for (const period of COMMISSION_PERIODS) {
      const record = input[period];
      if (!isRecord(record) || !Number.isSafeInteger(record.index) || Math.abs(record.index) > 4000000 || !Number.isInteger(record.realm) || record.realm < 0 || record.realm > state.realm || !isRecord(record.counts)) bad();
      const clean = { index: record.index, realm: record.realm, counts: emptyJourneyCounts(), claimed: [] };
      for (const key of JOURNEY_ACTIONS) { if (!count(record.counts[key]) || record.counts[key] > journey.totals[key]) bad(); clean.counts[key] = record.counts[key]; }
      const origin = period === 'seasonal' && (legacyCalendar || transition) ? null : state.createdAt;
      const definitions = commissionDefinitions(period, clean, origin), limit = period === 'daily' ? JOURNEY_LIMITS.dailyClaims : period === 'weekly' ? JOURNEY_LIMITS.weeklyClaims : JOURNEY_LIMITS.seasonalClaims;
      if (!list(record.claimed, definitions.map(item => item.id), limit)) bad();
      if (record.claimed.some(id => { const definition = definitions.find(item => item.id === id); return definition.metric !== 'delivery' && clean.counts[definition.metric] < definition.target; })) bad();
      clean.claimed = record.claimed.slice(); journey[period] = clean;
    }
    if (!isRecord(input.achievements) || !isRecord(input.decorations) || !isRecord(input.sectRewards) || !isRecord(input.seasonRecords)) bad();
    for (const item of ACHIEVEMENTS) { if (typeof input.achievements[item.id] !== 'boolean') bad(); journey.achievements[item.id] = input.achievements[item.id]; }
    for (const season of JOURNEY_SEASONS) { if (!count(input.seasonRecords[season.id])) bad(); journey.seasonRecords[season.id] = input.seasonRecords[season.id]; }
    for (const key of Object.keys(SECT_DECORATIONS)) { if (typeof input.sectRewards[key] !== 'boolean') bad(); journey.sectRewards[key] = input.sectRewards[key]; }
    const decorationIds = DECORATIONS.map(item => item.id);
    if (!list(input.decorations.owned, decorationIds) || !list(input.decorations.equipped, input.decorations.owned, decorationLimitForRealm(state.realm))) bad();
    const owned = input.decorations.owned.slice(), equipped = input.decorations.equipped.slice();
    // Additive v6 extension: earlier v6 saves have no placement field. Their
    // entire account survives; only previously fixed cosmetic slots gain data.
    let placements = input.decorations.placements;
    if (placements === undefined) placements = getDefaultDecorLayout(equipped);
    if (!Array.isArray(placements) || placements.length > owned.length || new Set(placements.map(item => item?.id)).size !== placements.length) bad();
    if (placements.some(item => !validDecorPlacement(item) || !owned.includes(item.id) || !validateDecorLayout([item], [item.id]).ok)) bad();
    const active = equipped.map(id => placements.find(item => item.id === id));
    if (!validateDecorLayout(active, equipped).ok) bad();
    // Optional v6 extension: a reward keeps the school it came from for life.
    // Earlier rewards stay generic. Themes cannot authorise an unowned item.
    const themes = input.decorations.themes === undefined ? {} : input.decorations.themes;
    if (!isRecord(themes) || Object.keys(themes).length > Object.keys(SECT_DECORATIONS).length) bad();
    for (const [id, sectId] of Object.entries(themes)) {
      if (!Object.values(SECT_DECORATIONS).includes(id) || !owned.includes(id) || !sectCatalog?.get(sectId)) bad();
    }
    journey.decorations = { owned, equipped, themes: Object.fromEntries(Object.entries(themes)), placements: placements.map(item => ({ id: item.id, x: item.x || 0, z: item.z || 0, rotation: item.rotation || 0 })) };
    // Additive v6 extension. Old accounts receive an empty residence ledger,
    // never free ownership or a charge for previously decorative background art.
    const residence = input.residence === undefined ? { owned: [], equipped: null } : input.residence;
    if (!isRecord(residence) || Object.keys(residence).length !== 2 || !Object.hasOwn(residence, 'owned') || !Object.hasOwn(residence, 'equipped')
      || !list(residence.owned, RESIDENCES.map(item => item.id))
      || (residence.equipped !== null && (typeof residence.equipped !== 'string' || !residence.owned.includes(residence.equipped)))) bad();
    journey.residence = { owned: residence.owned.slice(), equipped: residence.equipped };
    if (!list(input.titles, JOURNEY_TITLES) || typeof input.activeTitle !== 'string' || (input.activeTitle !== '' && !input.titles.includes(input.activeTitle))) bad();
    if (!list(input.stories, STORY_CHAPTERS.filter(item => item.realm <= state.realm).map(item => item.id))) bad();
    journey.titles = input.titles.slice(); journey.activeTitle = input.activeTitle; journey.stories = input.stories.slice();
    state.journey = journey;
    for (const item of ACHIEVEMENTS) if (journey.achievements[item.id] && achievementProgress(state, item) < item.target) bad();
    if (journey.decorations.owned.includes('masterStele') !== journey.achievements.herbMaster) bad();
    for (const season of JOURNEY_SEASONS) if (journey.decorations.owned.includes(season.decorationId) !== (journey.seasonRecords[season.id] > 0)) bad();
    for (const key of Object.keys(SECT_DECORATIONS)) if (journey.decorations.owned.includes(SECT_DECORATIONS[key]) !== journey.sectRewards[key]) bad();
    const earnedTitles = [...ACHIEVEMENTS.filter(item => journey.achievements[item.id]).map(item => item.reward.title), ...JOURNEY_SEASONS.filter(season => journey.seasonRecords[season.id] > 0).map(item => item.title)];
    if (journey.titles.length !== earnedTitles.length || !journey.titles.every(title => earnedTitles.includes(title))) bad();
    if (legacyCalendar) {
      // Do not relabel or clear an old claimed commission. Keep its original
      // identifier, counters and claim marker for this one transition period.
      // Reading/reloading the migrated save must never extend this deadline.
      journey.seasonTransition = {
        migratedAt: now,
        switchAt: journeyWindow('seasonal', now, state.createdAt).endsAt,
        legacyIndex: journey.seasonal.index
      };
    }
    return journey;
  }
  // NPC gardens retain their autonomous clocks; the player's garden uses stages.
  const makePlant = (cropId, now, progress) => ({ cropId, plantedAt: now - CROP_MAP[cropId].growTime * progress, duration: CROP_MAP[cropId].growTime, watered: false, unlocked: true });
  const makeCultivatedPlant = (cropId, now, stage = 0, nextWaterAt = 0) => ({ cropId, plantedAt: stage === WATERINGS_REQUIRED ? now - CROP_MAP[cropId].growTime : now, duration: CROP_MAP[cropId].growTime, watered: stage > 0, unlocked: true, stage, nextWaterAt, withered: false });
  // 铲除（2026-11-26）：能不能铲掉这块田里的灵植——还没成熟、没枯，并且是刚种下的：还是“灵种”，
  // 或者只被雨水自动浇过一遍（“萌芽”）、自己还没动手浇过。界面（app.js）和引擎的 uproot 都用它
  function canUproot(p) {
    if (!p || !p.unlocked || !CROP_MAP[p.cropId] || p.withered === true || !Number.isInteger(p.stage)) return false;
    const rain = Number.isInteger(p.rainWaterings) ? p.rainWaterings : 0;
    return p.stage === 0 || (p.stage === 1 && rain >= 1);
  }
  function getGrowthInfo(p, now = Date.now()) {
    const info = { stage: 0, stageName: p && p.unlocked === false ? '待开垦' : '空田', waterings: 0, wateringsNeeded: WATERINGS_REQUIRED, withered: false, witheredReason: null, frostAt: null, ready: false, mature: false, canWater: false, remainingMs: 0, nextWaterAt: 0, progress: 0 };
    if (!p || !p.unlocked || !CROP_MAP[p.cropId]) return info;
    if (p.withered === true) return Object.assign(info, { stage: WATERINGS_REQUIRED, stageName: p.witheredReason === 'frost' ? '冻枯' : '枯草', waterings: WATERINGS_REQUIRED, withered: true, witheredReason: p.witheredReason === 'frost' ? 'frost' : 'harvest', frostAt: p.witheredReason === 'frost' ? p.frostAt : null, progress: 1 });
    if (p.stage === undefined) {
      // Old-format clocks remain valid for simulated NPC plots only after import.
      if (!finite(p.plantedAt) || !finite(p.duration) || p.duration <= 0) return info;
      const progress = Math.max(0, Math.min(1, (now - p.plantedAt) / p.duration));
      const stage = Math.min(WATERINGS_REQUIRED, Math.floor(progress * WATERINGS_REQUIRED));
      const mature = progress >= 1;
      return Object.assign(info, { stage, stageName: GROWTH_STAGES[stage], waterings: stage, ready: mature, mature, remainingMs: Math.max(0, p.plantedAt + p.duration - now), progress });
    }
    if (!Number.isInteger(p.stage) || p.stage < 0 || p.stage > WATERINGS_REQUIRED) return info;
    const stage = p.stage, mature = stage === WATERINGS_REQUIRED;
    const nextWaterAt = stage > 0 && !mature && finite(p.nextWaterAt) ? Math.max(0, p.nextWaterAt) : 0;
    const remainingMs = Math.max(0, nextWaterAt - now);
    return Object.assign(info, { stage, stageName: GROWTH_STAGES[stage], waterings: stage, ready: mature, mature, canWater: !mature && remainingMs === 0, remainingMs, nextWaterAt, progress: stage / WATERINGS_REQUIRED });
  }
  const neighborEmptyPlot = () => Object.assign(emptyPlot(false), { stolen: false, attempted: false, stolenSuccess: false });
  function makeNeighbor(def, now, initial, ordinal) {
    const candidates = CROPS.filter(c => c.minRealm <= def.realm).map(c => c.id);
    const ripeCount = Math.ceil(def.unlockedCount * 0.6);
    const plots = Array.from({ length: PLOT_COUNT }, (_, index) => {
      if (index >= def.unlockedCount) return neighborEmptyPlot();
      const cropId = candidates[(index + ordinal) % candidates.length];
      // Ripe clusters invite a visit; younger plants preserve a visible growth contrast.
      const progress = index < ripeCount ? 1.12 : 0.24 + ((index - ripeCount) % STARTER_PLOTS) * 0.12;
      return Object.assign(makePlant(cropId, now, progress), { stolen: false, attempted: false, stolenSuccess: false });
    });
    return Object.assign({}, def, { plots, nextRefresh: now + NEIGHBOR_INTERVAL, cycle: now });
  }
  function makeInitial(now) {
    const plots = Array.from({ length: PLOT_COUNT }, (_, index) => index < 3 ? makeCultivatedPlant('huangjing', now, WATERINGS_REQUIRED) : index === 3 ? makeCultivatedPlant('huangjing', now, 2, now + CROP_MAP.huangjing.waterIntervals[1]) : emptyPlot(index < STARTER_PLOTS));
    return {
      schema: 'yunjian-lingtian', version: VERSION, growthRulesVersion: GROWTH_RULES_VERSION,
      stones: 520, qi: 35, realm: 0, dew: 5, dewUpdatedAt: now,
      tools: { hoe: 1, wateringCan: 1 },
      plots, bag: Object.fromEntries(CROPS.map(c => [c.id, 0])),
      pills: Object.fromEntries(PILLS.map(p => [p.id, 0])), brew: null, daily: newDaily(now),
      stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])),
      quests: Object.fromEntries(QUEST_DEFS.map(q => [q.id, false])),
      journey: newJourney(now, 0),
      neighbors: NEIGHBOR_DEFS.map((d, i) => makeNeighbor(d, now, true, i)),
      migration: null,
      createdAt: now, lastSaved: now,
      weatherEffects: { version: 1, activatedAt: now, settledAt: now },
      events: [{ id: `${now}-welcome`, type: 'info', text: '青云峰赐下一方洞天。三圃黄精芝已成熟，二十块灵田静待开垦。', time: now }]
    };
  }
  function validateSave(input, now) {
    if (!isRecord(input) || input.schema !== 'yunjian-lingtian' || !SUPPORTED_VERSIONS.includes(input.version)) throw new Error('这不是云间灵田支持的存档。');
    if (input.growthRulesVersion !== undefined && input.growthRulesVersion !== 1 && input.growthRulesVersion !== GROWTH_RULES_VERSION) throw new Error('存档中的灵植生长规则版本无效。');
    const growthMigration = input.growthRulesVersion !== GROWTH_RULES_VERSION;
    const legacy = input.version === LEGACY_VERSION;
    const staged = input.version >= STAGED_VERSION;
    const expectedPlots = legacy ? LEGACY_PLOT_COUNT : PLOT_COUNT;
    if (!Array.isArray(input.plots) || input.plots.length !== expectedPlots || !isRecord(input.bag) || !isRecord(input.stats)) throw new Error('存档中的灵田或行囊资料不完整。');
    for (const k of ['stones', 'qi', 'realm', 'dew', 'createdAt']) if (!finite(input[k])) throw new Error('存档数值无效，请选择完整的存档文件。');
    const realmLimit = legacy ? LEGACY_REALM_MAP.length : REALMS.length;
    if (!Number.isInteger(input.realm) || input.realm < 0 || input.realm >= realmLimit) throw new Error('存档中的境界无效。');
    const state = makeInitial(now);
    state.stones = integer(input.stones, 0, MAX_VALUE, 0);
    state.qi = integer(input.qi, 0, MAX_VALUE, 0);
    state.realm = legacy ? LEGACY_REALM_MAP[input.realm] : input.realm;
    state.dew = integer(input.dew, 0, DEW_MAX, 0);
    state.dewUpdatedAt = integer(input.dewUpdatedAt, now - 86400000 * 30, now, now);
    state.createdAt = integer(input.createdAt, 0, now, now);
    state.lastSaved = now;
    // v6 saves without weather metadata start now. Never replay a winter (or
    // rain) that happened before this rules update first reached this garden.
    if (input.weatherEffects !== undefined) {
      const effects = input.weatherEffects;
      if (!isRecord(effects) || effects.version !== 1 ||
          !Number.isSafeInteger(effects.activatedAt) || effects.activatedAt < state.createdAt ||
          !Number.isSafeInteger(effects.settledAt) || effects.settledAt < effects.activatedAt ||
          effects.settledAt > 8640000000000000 - 32 * 86400000) throw new Error('存档中的天气照料记录无效。');
      state.weatherEffects = { version: 1, activatedAt: effects.activatedAt, settledAt: effects.settledAt };
    }
    let retiredTierRefund = 0;
    if (staged) {
      if (!isRecord(input.tools)) throw new Error('存档中的农具资料不完整。');
      for (const kind of Object.keys(TOOL_DEFS)) {
        const level = input.tools[kind];
        const oldTiers = input.version === STAGED_VERSION;
        const maxLevel = oldTiers ? RETIRED_TOOL_COSTS[kind].length + 1 : TOOL_CAPACITIES.length;
        if (!Number.isInteger(level) || level < 1 || level > maxLevel) throw new Error('存档中的农具等级无效。');
        state.tools[kind] = Math.min(level, TOOL_CAPACITIES.length);
        if (oldTiers && level > TOOL_CAPACITIES.length) {
          retiredTierRefund += RETIRED_TOOL_COSTS[kind].slice(TOOL_CAPACITIES.length - 1, level - 1).reduce((sum, cost) => sum + cost, 0);
        }
      }
    }
    retiredTierRefund = Math.min(retiredTierRefund, MAX_VALUE - state.stones);
    state.stones += retiredTierRefund;
    if (input.version >= ALCHEMY_VERSION) {
      if (!isRecord(input.pills) || !isRecord(input.daily)) throw new Error('存档中的丹药或每日额度资料不完整。');
      for (const pill of PILLS) {
        const count = input.pills[pill.id];
        if (!Number.isInteger(count) || count < 0 || count > MAX_INVENTORY) throw new Error('存档中的丹药数量无效。');
        state.pills[pill.id] = count;
      }
      if (!validDay(input.daily.day)) throw new Error('存档中的每日额度日期无效。');
      for (const key of Object.keys(DAILY_LIMITS)) {
        const value = input.daily[key];
        if (!Number.isInteger(value) || value < 0 || value > DAILY_LIMITS[key]) throw new Error('存档中的每日额度数值无效。');
      }
      if ((input.daily.pillsTaken === 0) !== (input.daily.pillQi === 0) || input.daily.pillQi < input.daily.pillsTaken * 3) throw new Error('存档中的服丹次数与修为不符。');
      state.daily = { day: input.daily.day, pillsTaken: input.daily.pillsTaken, pillQi: input.daily.pillQi, stealAttempts: input.daily.stealAttempts };
      if (input.brew !== null) {
        const brew = input.brew, pill = isRecord(brew) && PILL_MAP[brew.pillId];
        if (!pill || typeof brew.pillId !== 'string' || typeof brew.id !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(brew.id)
          || !Number.isSafeInteger(brew.startedAt) || brew.startedAt < 0 || brew.startedAt > now
          || !Number.isSafeInteger(brew.readyAt) || brew.readyAt !== brew.startedAt + pill.brewTime
          || state.realm < pill.minRealm) throw new Error('存档中的炼丹任务或炼制时间无效。');
        state.brew = { id: brew.id, pillId: pill.id, startedAt: brew.startedAt, readyAt: brew.readyAt };
      }
    }
    // Only the original nine positions may retain pre-upgrade cultivation rights.
    if (legacy) {
      state.migration = { fromVersion: LEGACY_VERSION, at: now, legacyUnlocked: input.plots.map((p, index) => p && p.unlocked === true && index >= STARTER_PLOTS ? index : -1).filter(index => index >= STARTER_PLOTS) };
    } else if (isRecord(input.migration) && input.migration.fromVersion === LEGACY_VERSION) {
      const inherited = Array.isArray(input.migration.legacyUnlocked) ? input.migration.legacyUnlocked : [];
      state.migration = { fromVersion: LEGACY_VERSION, at: integer(input.migration.at, 0, now, now), legacyUnlocked: Array.from(new Set(inherited.filter(index => Number.isInteger(index) && index >= STARTER_PLOTS && index < LEGACY_PLOT_COUNT))) };
    }
    const cleanPlot = (p, neighbor, index) => {
      if (!isRecord(p) || typeof p.unlocked !== 'boolean') throw new Error('存档中的田块格式有误。');
      const cropId = legacy && p.cropId === 'ningcui' ? 'jiuqu' : p.cropId;
      if (cropId !== null && (typeof cropId !== 'string' || !Object.prototype.hasOwnProperty.call(CROP_MAP, cropId))) throw new Error('存档包含未知灵植。');
      if (!p.unlocked && cropId !== null) throw new Error('待开垦灵田中不应有在种灵植。');
      const inheritance = !!(state.migration && state.migration.legacyUnlocked.includes(index));
      if (!neighbor && p.unlocked && plotRealm(index) > state.realm && !inheritance) throw new Error('这块灵田尚未达到对应开垦境界。');
      if (!neighbor && staged) {
        if (!Number.isInteger(p.stage) || p.stage < 0 || p.stage > WATERINGS_REQUIRED || typeof p.withered !== 'boolean' || !finite(p.nextWaterAt) || p.nextWaterAt < 0) throw new Error('存档中的生长阶段或浇水时间无效。');
        if ((!p.unlocked || cropId === null) && (p.stage !== 0 || p.withered || p.nextWaterAt !== 0)) throw new Error('空田或待开垦灵田中不应有生长状态。');
        if ((p.stage === 0 || p.stage === WATERINGS_REQUIRED) && p.nextWaterAt !== 0) throw new Error('灵种或成熟灵植的浇水时间有误。');
        if (p.withered && p.stage !== WATERINGS_REQUIRED) throw new Error('枯草的生长状态无效。');
      }
      if (!p.unlocked || cropId === null) return Object.assign(emptyPlot(p.unlocked), neighbor ? { stolen: false, attempted: false, stolenSuccess: false } : {});
      if (!finite(p.plantedAt) || !finite(p.duration) || p.duration <= 0) throw new Error('灵植生长时间无效。');
      const crop = CROP_MAP[cropId];
      const inheritedCrop = !neighbor && index < LEGACY_PLOT_COUNT && !!state.migration && (legacy || p.legacyCrop === true);
      if (!neighbor && crop.minRealm > state.realm && !inheritedCrop) throw new Error('存档中的在种灵植与当前境界不符。');
      const weatherRecorded = !neighbor && (p.weatherSeed !== undefined || p.rainWaterings !== undefined || p.frostAt !== undefined);
      const result = {
        cropId, unlocked: true,
        // A weather outcome can remain in a field for years. Keep its original
        // plant instant so old frost/rain receipts remain valid on reopening.
        plantedAt: Math.max(weatherRecorded ? 0 : now - 86400000 * 365, Math.min(now, p.plantedAt)),
        // Old plants keep their already-earned progress when first upgraded.
        duration: Math.max(1000, Math.min(crop.growTime, p.duration)),
        watered: p.watered === true
      };
      if (inheritedCrop && crop.minRealm > state.realm) result.legacyCrop = true;
      // Server-issued crop batches survive hydration. Optional fields keep all
      // earlier v5 saves readable; cloud requests never accept imported state.
      if (!neighbor && p.cycleId !== undefined) {
        if (typeof p.cycleId !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(p.cycleId)) throw new Error('灵田批次资料无效。');
        result.cycleId = p.cycleId;
      }
      if (!neighbor && p.stolenUnits !== undefined) {
        if (!Number.isInteger(p.stolenUnits) || p.stolenUnits < 0 || p.stolenUnits > 1 || (p.stolenUnits > 0 && (!p.cycleId || p.stage !== WATERINGS_REQUIRED))) throw new Error('灵田偷采数量无效。');
        result.stolenUnits = p.stolenUnits;
      }
      if (!neighbor) {
        if (p.weatherSeed !== undefined) {
          if (!Number.isSafeInteger(p.weatherSeed) || p.weatherSeed < 0 || p.weatherSeed > 4294967295) throw new Error('灵植的天气记录无效。');
          result.weatherSeed = p.weatherSeed;
        }
        if (p.frostCheckedWinter !== undefined) {
          if (!Number.isSafeInteger(p.frostCheckedWinter) || p.frostCheckedWinter < 0) throw new Error('灵植的冬季检查记录无效。');
          result.frostCheckedWinter = p.frostCheckedWinter;
        }
        if (p.witheredReason !== undefined) {
          if (!p.withered || !['harvest', 'frost'].includes(p.witheredReason)) throw new Error('灵植的枯萎原因无效。');
          result.witheredReason = p.witheredReason;
        }
        if (p.frostAt !== undefined || p.witheredReason === 'frost') {
          if (p.witheredReason !== 'frost' || !p.withered || !Number.isSafeInteger(p.frostAt) || p.frostAt < state.weatherEffects.activatedAt ||
              p.frostAt < result.plantedAt || p.frostAt > state.weatherEffects.settledAt || p.weatherSeed === undefined || p.frostCheckedWinter === undefined || (p.stolenUnits || 0) > 0) throw new Error('灵植的冻害记录无效。');
          result.frostAt = p.frostAt;
        }
        if (p.rainWaterings !== undefined || p.lastRainAt !== undefined) {
          if (!Number.isSafeInteger(p.rainWaterings) || p.rainWaterings < 1 || p.rainWaterings > WATERINGS_REQUIRED || p.rainWaterings > p.stage ||
              !Number.isSafeInteger(p.lastRainAt) || p.lastRainAt < state.weatherEffects.activatedAt || p.lastRainAt < result.plantedAt || p.lastRainAt > state.weatherEffects.settledAt) throw new Error('灵植的雨水照料记录无效。');
          result.rainWaterings = p.rainWaterings; result.lastRainAt = p.lastRainAt;
        }
      }
      if (neighbor) {
        if (growthMigration) {
          // NPC clocks are automatic. Preserve their current progress while
          // shortening the remaining wait, rather than turning every crop ripe.
          const progress = Math.max(0, Math.min(1, (now - p.plantedAt) / p.duration));
          result.duration = Math.max(1000, Math.min(crop.growTime, p.duration / GROWTH_SPEEDUP));
          result.plantedAt = now - result.duration * progress;
        }
        Object.assign(result, { stolen: p.stolen === true || p.attempted === true, attempted: p.stolen === true || p.attempted === true, stolenSuccess: p.stolenSuccess === true });
      } else if (staged) {
        // A balance upgrade scales only a pending wait, once. Due stages stay
        // due; mature and withered plots never lose their earned status.
        const pendingAt = growthMigration && p.nextWaterAt > now ? now + Math.ceil((p.nextWaterAt - now) / GROWTH_SPEEDUP) : p.nextWaterAt;
        const nextWaterAt = p.stage > 0 && p.stage < WATERINGS_REQUIRED ? Math.min(pendingAt, now + crop.waterIntervals[p.stage - 1]) : 0;
        Object.assign(result, { stage: p.stage, nextWaterAt, withered: p.withered, watered: p.stage > 0 && !p.withered });
      } else {
        const oldFinish = p.plantedAt + p.duration;
        const finishesAt = growthMigration && oldFinish > now ? now + Math.ceil((oldFinish - now) / GROWTH_SPEEDUP) : Math.min(oldFinish, result.plantedAt + result.duration);
        const ready = now >= finishesAt;
        // The old automatic crop needs at most one final watering; no timer restarts.
        Object.assign(result, { stage: ready ? WATERINGS_REQUIRED : WATERINGS_REQUIRED - 1, nextWaterAt: ready ? 0 : finishesAt, withered: false });
      }
      return result;
    };
    state.plots = input.plots.map((p, index) => cleanPlot(p, false, index));
    const requiredStarter = legacy ? LEGACY_STARTER_PLOTS : STARTER_PLOTS;
    if (!state.plots.slice(0, requiredStarter).every(p => p.unlocked)) throw new Error('基础灵田资料有误。');
    while (state.plots.length < PLOT_COUNT) state.plots.push(emptyPlot(false));
    CROPS.forEach(c => { state.bag[c.id] = integer(input.bag[c.id], 0, MAX_INVENTORY, 0); });
    if (legacy) state.bag.jiuqu = Math.min(MAX_INVENTORY, state.bag.jiuqu + integer(input.bag.ningcui, 0, MAX_INVENTORY, 0));
    STAT_KEYS.forEach(k => { state.stats[k] = integer(input.stats[k], 0, MAX_VALUE, 0); });
    QUEST_DEFS.forEach(q => { state.quests[q.id] = !!(isRecord(input.quests) && input.quests[q.id] === true); });
    // The earlier schema has no reliable species-by-species history. Begin a
    // precise record now, without guessing from current inventory or old totals.
    state.journey = input.version === VERSION ? validateJourney(input.journey, state, now) : newJourney(now, state.realm, state.createdAt);
    if (Array.isArray(input.neighbors) && input.neighbors.length === NEIGHBOR_DEFS.length) {
      state.neighbors = NEIGHBOR_DEFS.map((def, ordinal) => {
        const n = input.neighbors.find(x => isRecord(x) && x.id === def.id);
        if (!n || !Array.isArray(n.plots) || n.plots.length !== expectedPlots) return makeNeighbor(def, now, false, ordinal);
        // Names, odds, realm and open-land count come from the game, never imported text.
        const fresh = makeNeighbor(def, now, false, ordinal);
        n.plots.forEach((p, index) => {
          if (index >= def.unlockedCount) return;
          const cleaned = cleanPlot(p, true, index);
          if (cleaned.unlocked && cleaned.cropId && CROP_MAP[cleaned.cropId].minRealm <= def.realm) fresh.plots[index] = cleaned;
          else if (!legacy) throw new Error('道友灵田资料与对应境界不符。');
          else if (cleaned.attempted || cleaned.stolen) Object.assign(fresh.plots[index], { stolen: true, attempted: true, stolenSuccess: cleaned.stolenSuccess });
        });
        fresh.nextRefresh = integer(n.nextRefresh, now - NEIGHBOR_INTERVAL, now + NEIGHBOR_INTERVAL, now);
        fresh.cycle = integer(n.cycle, 0, now, now);
        return fresh;
      });
    }
    // Untrusted imported text never enters the event stream.
    const migrationMessage = (input.version < STAGED_VERSION ? MIGRATION_MESSAGE : input.version === STAGED_VERSION
      ? BALANCE_MIGRATION_MESSAGE + (retiredTierRefund ? `原四、五级农具调整为三级，已退回取消等级的 ${retiredTierRefund} 灵石。` : '') : '')
      + (input.version < ALCHEMY_VERSION ? ALCHEMY_MIGRATION_MESSAGE : '') + (input.version < VERSION ? JOURNEY_MIGRATION_MESSAGE : '')
      + (growthMigration ? GROWTH_MIGRATION_MESSAGE : '');
    const migrated = input.version < VERSION || growthMigration;
    state.events = [{ id: `${now}-${migrated ? 'migration' : 'import'}`, type: 'info', text: migrated ? migrationMessage : '灵田存档已恢复。继续你的云间修行。', time: now }];
    return state;
  }
  function create(options = {}) {
    let state;
    let storageWarning = false;
    let protectedSave = false;
    let migratedOnLoad = false;
    let migrationNotice = '';
    let loadNotice = '';
    let weatherCatchupPending = false;
    const listeners = new Set();
    if (typeof options.onChange === 'function') listeners.add(options.onChange);
    const now = Date.now();
    let rawSave = null;
    try {
      rawSave = localStorage && localStorage.getItem(STORAGE_KEY);
      const previous = rawSave ? JSON.parse(rawSave) : null;
      state = rawSave ? validateSave(previous, now) : makeInitial(now);
      migratedOnLoad = !!(previous && (previous.version < VERSION || previous.growthRulesVersion !== GROWTH_RULES_VERSION));
      if (migratedOnLoad) migrationNotice = state.events[0].text;
      // Local event text is length-limited and must be rendered as escaped text by the UI.
      if (previous && Array.isArray(previous.events)) {
        const history = previous.events.slice(0, 30).filter(e => isRecord(e) && typeof e.text === 'string' && e.text.length <= 200 && finite(e.time)).map(e => ({ id: String(e.id).slice(0, 80), type: ['success', 'error', 'info'].includes(e.type) ? e.type : 'info', text: e.text, time: e.time }));
        state.events = migratedOnLoad ? state.events.concat(history).slice(0, 30) : history;
      }
    } catch (error) {
      state = makeInitial(now);
      if (rawSave) {
        // A broken pre-existing save must never be silently overwritten by a new game.
        protectedSave = true;
        storageWarning = true;
        loadNotice = '原存档暂时无法读取，原数据已保留。当前是临时灵田；请导入有效存档，或在设置中确认重新开始。';
      } else loadNotice = '暂时无法读取浏览器存档，已准备一方新灵田；可使用设置中的导出存档保存进度。';
      state.events.unshift({ id: `${now}-recovery`, type: 'info', text: loadNotice, time: now });
    }
    function notify(message, type) {
      if (typeof options.onMessage === 'function') {
        try { options.onMessage(message, type); } catch (_) { /* UI callbacks cannot damage state. */ }
      }
    }
    function emit() { listeners.forEach(fn => { try { fn(state); } catch (_) {} }); }
    function save() {
      state.lastSaved = Date.now();
      if (protectedSave) { storageWarning = true; return; }
      try {
        if (!localStorage) throw new Error('unavailable');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        storageWarning = false;
      } catch (_) {
        if (!storageWarning) notify('当前浏览器无法自动保存，可在设置中导出存档。', 'info');
        storageWarning = true;
      }
    }
    function event(message, type = 'success') {
      const time = Date.now();
      state.events.unshift({ id: `${time}-${Math.random().toString(36).slice(2, 7)}`, type, text: message, time });
      state.events.length = Math.min(state.events.length, 30);
    }
    function fail(message, data) {
      notify(message, 'error');
      return Object.assign({ ok: false, message }, data);
    }
    function complete(message, data, type = 'success') {
      event(message, type); save(); emit(); notify(message, type);
      return Object.assign({ ok: true, message }, data);
    }
    function getPlot(index) {
      if (!validIndex(index)) return null;
      return state.plots[index];
    }
    function plantWeatherSeed(plot, index) {
      const text = `${state.createdAt}:${plot.plantedAt}:${plot.cropId}:${index}`;
      let seed = 2166136261;
      for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
      return seed >>> 0;
    }
    function settleWeather(current) {
      weatherCatchupPending = false;
      const sky = environment();
      if (!weatherEnabled || !sky || typeof sky.getNaturalSegment !== 'function') return false;
      const effects = state.weatherEffects;
      if (current < effects.settledAt) return false;
      let cursor = Math.max(effects.activatedAt, effects.settledAt), changed = false, frozen = 0, segments = 0;
      const alive = () => state.plots.map((plot, index) => ({ plot, index })).filter(({ plot }) => plot.unlocked && CROP_MAP[plot.cropId] && !plot.withered && plot.stage < WATERINGS_REQUIRED);
      while (cursor <= current && segments < MAX_WEATHER_SEGMENTS) {
        const active = alive();
        if (!active.length) { cursor = current; break; }
        const weather = sky.getNaturalSegment(cursor, state.createdAt);
        // Winter has no rain in the natural schedule. Jump to its end after
        // the one per-plant winter check instead of visiting 56 dry slots.
        const end = weather.seasonId === 'winter' ? weather.seasonEndsAt : weather.weatherEndsAt;
        for (const { plot, index } of active) {
          if (plot.weatherSeed === undefined) { plot.weatherSeed = plantWeatherSeed(plot, index); changed = true; }
          const exposedAt = Math.max(plot.plantedAt, effects.activatedAt);
          if (weather.seasonId === 'winter' && (plot.frostCheckedWinter === undefined || plot.frostCheckedWinter < weather.winterIndex)) {
            const nextBoundary = state.createdAt + (Math.floor(Math.max(0, exposedAt - state.createdAt) / sky.CONFIG.weatherSlotMs) + 1) * sky.CONFIG.weatherSlotMs;
            // A seed planted in the final winter slot reaches its next natural
            // boundary in spring and therefore receives no late winter check.
            const checkAt = Math.max(cursor, Math.max(weather.seasonStartsAt, nextBoundary));
            if (checkAt <= current && checkAt < end) {
              plot.frostCheckedWinter = weather.winterIndex; changed = true;
              if (sky.frostRoll(plot.weatherSeed, weather.winterIndex) < sky.CONFIG.frostChance) {
                plot.stage = WATERINGS_REQUIRED; plot.nextWaterAt = 0; plot.watered = false;
                plot.withered = true; plot.witheredReason = 'frost'; plot.frostAt = checkAt; frozen++;
                continue;
              }
            }
          }
          if (weather.weatherId === 'rain') {
            const crop = CROP_MAP[plot.cropId];
            // At most the four remaining waterings are processed. Every next
            // node keeps its normal interval measured from the actual watering.
            while (plot.stage < WATERINGS_REQUIRED) {
              const due = plot.stage === 0 ? exposedAt : plot.nextWaterAt;
              const at = Math.max(cursor, exposedAt, due);
              if (at > current || at >= end) break;
              plot.stage++; plot.watered = true;
              plot.nextWaterAt = plot.stage < WATERINGS_REQUIRED ? at + crop.waterIntervals[plot.stage - 1] : 0;
              plot.rainWaterings = (plot.rainWaterings || 0) + 1; plot.lastRainAt = at;
              changed = true;
            }
          }
        }
        segments++;
        if (end > current) { cursor = current; break; }
        cursor = end;
      }
      // Keep a bounded checkpoint instead of skipping unexamined history. In
      // ordinary weather a plant matures after at most four rain events, so
      // even years away stop as soon as those finite stages have settled.
      weatherCatchupPending = cursor < current && alive().length > 0 && segments >= MAX_WEATHER_SEGMENTS;
      effects.settledAt = weatherCatchupPending ? cursor : current;
      if (frozen) event(`冬季寒气袭来，${frozen} 株未成熟灵植冻枯。可用锄头清理后重新栽种。`, 'info');
      return changed || weatherCatchupPending;
    }
    function weatherPending() {
      return weatherCatchupPending ? fail('正在按真实天气结算离线照料，请稍后再试。', { code: 'weather_catchup_pending' }) : null;
    }
    function refreshWeather(current = Date.now()) {
      if (settleWeather(current)) { save(); emit(); }
    }
    function refreshDaily(current = Date.now()) {
      const today = dayKey(current);
      // Moving a device clock backwards must never open another daily allowance.
      if (state.daily.day >= today) return false;
      state.daily = newDaily(current);
      return true;
    }
    function refreshJourney(current = Date.now()) {
      let changed = false;
      for (const period of COMMISSION_PERIODS) {
        if (period === 'seasonal' && state.journey.seasonTransition) {
          if (current < state.journey.seasonTransition.switchAt) continue;
          state.journey.seasonal = newJourneyPeriod(period, current, state.realm, state.createdAt);
          state.journey.seasonTransition = null;
          changed = true;
          continue;
        }
        // A realm is frozen for the whole period; neither breakthroughs nor
        // reloading can replace its tasks or open another reward allowance.
        if (journeyWindow(period, current, state.createdAt).index > state.journey[period].index) {
          state.journey[period] = newJourneyPeriod(period, current, state.realm, state.createdAt);
          changed = true;
        }
      }
      return changed;
    }
    function journeyCalendarOrigin(period) {
      return period === 'seasonal' && state.journey.seasonTransition ? null : state.createdAt;
    }
    function recordJourney(action, itemId, count = 1, units = 0) {
      const current = Date.now();
      refreshJourney(current);
      const journey = state.journey;
      journey.totals[action] = Math.min(MAX_VALUE, journey.totals[action] + count);
      for (const period of COMMISSION_PERIODS) {
        const record = journey[period], startsAt = journeyWindowFromIndex(period, record.index, journeyCalendarOrigin(period)).startsAt;
        // A local clock rollback cannot add actions to a future period.
        if (current >= startsAt) record.counts[action] = Math.min(MAX_VALUE, record.counts[action] + count);
      }
      if (action === 'brew') {
        const record = journey.pills[itemId];
        if (record.firstBrewAt === null) record.firstBrewAt = current;
        record.brews = Math.min(MAX_VALUE, record.brews + count);
      } else if (action === 'plant' || action === 'water' || action === 'harvest') {
        const record = journey.herbs[itemId];
        if (action === 'plant') {
          if (record.firstPlantedAt === null) record.firstPlantedAt = current;
          record.planted = Math.min(MAX_VALUE, record.planted + count);
        } else if (action === 'water') record.watered = Math.min(MAX_VALUE, record.watered + count);
        else {
          if (record.firstHarvestAt === null) record.firstHarvestAt = current;
          record.harvests = Math.min(MAX_VALUE, record.harvests + count);
          record.units = Math.min(MAX_VALUE, record.units + units);
        }
      }
    }
    function giveJourneyReward(reward) {
      // All callers use immutable rule definitions, never a request's rewards.
      state.stones += reward.stones;
      if (reward.decorationId && !state.journey.decorations.owned.includes(reward.decorationId)) state.journey.decorations.owned.push(reward.decorationId);
      if (reward.title) {
        if (!state.journey.titles.includes(reward.title)) state.journey.titles.push(reward.title);
        state.journey.activeTitle = reward.title;
      }
    }
    function periodInfo(period) {
      const record = state.journey[period], origin = journeyCalendarOrigin(period), window = journeyWindowFromIndex(period, record.index, origin);
      if (period === 'seasonal' && state.journey.seasonTransition) window.endsAt = state.journey.seasonTransition.switchAt;
      const claimLimit = period === 'daily' ? JOURNEY_LIMITS.dailyClaims : period === 'weekly' ? JOURNEY_LIMITS.weeklyClaims : JOURNEY_LIMITS.seasonalClaims;
      const remainingClaims = Math.max(0, claimLimit - record.claimed.length);
      const quests = commissionDefinitions(period, record, origin).map(definition => {
        const progress = Math.min(definition.target, definition.delivery ? state.bag[definition.delivery.cropId] : record.counts[definition.metric]);
        const claimed = record.claimed.includes(definition.id), ready = progress >= definition.target;
        const room = state.stones + definition.reward.stones <= MAX_VALUE;
        const reason = claimed ? '本期已领取' : !remainingClaims ? '本期领取额度已用完' : !ready ? definition.delivery ? '请备齐交付所需的可用灵草' : '继续照料灵田，进度会自动记录' : !room ? '灵石已接近存放上限，请先使用一部分' : '';
        return {
          id: definition.id, name: definition.name, description: definition.description,
          progress, target: definition.target, ready, claimed, canClaim: ready && !claimed && remainingClaims > 0 && room,
          reward: Object.assign({}, definition.reward), rewardLabel: rewardLabel(definition.reward), delivery: definition.delivery && Object.assign({}, definition.delivery), reason
        };
      });
      const result = {
        period, key: window.key, label: period === 'daily' ? '今日委托' : period === 'weekly' ? '本周委托' : '四时雅集',
        startsAt: window.startsAt, endsAt: window.endsAt, realm: record.realm,
        claimLimit, claimedCount: record.claimed.length, remainingClaims, quests
      };
      if (period === 'seasonal') {
        const season = JOURNEY_SEASONS[positiveMod(record.index, JOURNEY_SEASONS.length)];
        Object.assign(result, { seasonId: season.id, seasonName: season.name, festival: season.festival, completedSeasons: state.journey.seasonRecords[season.id], calendarTransition: !!state.journey.seasonTransition });
      }
      return result;
    }
    function getJourneyInfo() {
      tick();
      const achievements = ACHIEVEMENTS.map(achievement => {
        const progress = Math.min(achievement.target, achievementProgress(state, achievement));
        const ready = progress >= achievement.target, claimed = state.journey.achievements[achievement.id];
        return {
          id: achievement.id, name: achievement.name, description: achievement.description, progress, target: achievement.target,
          ready, claimed, canClaim: ready && !claimed, reward: Object.assign({}, achievement.reward), rewardLabel: rewardLabel(achievement.reward),
          reason: claimed ? '已收入修行小记' : ready ? '' : '持续积累，达成后可领取'
        };
      });
      return { since: state.journey.since, title: state.journey.activeTitle, titles: state.journey.titles.slice(), totals: Object.assign({}, state.journey.totals), daily: periodInfo('daily'), weekly: periodInfo('weekly'), seasonal: periodInfo('seasonal'), achievements };
    }
    function getCodexInfo() {
      const journey = state.journey;
      return {
        since: journey.since,
        herbs: CROPS.map(crop => Object.assign({ id: crop.id, name: crop.name, description: crop.description, color: crop.color, minRealm: crop.minRealm, unlocked: state.realm >= crop.minRealm }, journey.herbs[crop.id], { mastery: masteryInfo(journey.herbs[crop.id].harvests, 'herb') })),
        pills: PILLS.map(pill => Object.assign({ id: pill.id, name: pill.name, qi: pill.qi, brewTime: pill.brewTime, minRealm: pill.minRealm, unlocked: state.realm >= pill.minRealm }, journey.pills[pill.id], { mastery: masteryInfo(journey.pills[pill.id].brews, 'pill') }))
      };
    }
    function getDecorInfo() {
      const { owned, equipped, placements } = state.journey.decorations;
      const realmLimits = REALMS.map((realm, index) => ({ realm: index, name: realm.name, limit: decorationLimitForRealm(index) }));
      const themes = Object.fromEntries(Object.entries(state.journey.decorations.themes || {})
        .filter(([id, sectId]) => owned.includes(id) && Object.values(SECT_DECORATIONS).includes(id) && sectCatalog?.get(sectId)));
      const treeGroups = (homesteadCatalog?.treeSpecies || []).map(species => {
        const instanceIds = DECORATIONS.filter(item => item.repeatable && item.speciesId === species.id).map(item => item.id);
        const ownedIds = instanceIds.filter(id => owned.includes(id)), equippedIds = instanceIds.filter(id => equipped.includes(id));
        const nextInstanceId = instanceIds.find(id => !owned.includes(id)) || null, remaining = instanceIds.length - ownedIds.length;
        return { ...species, speciesId: species.id, speciesName: species.name, instanceIds, ownedIds, equippedIds,
          ownedCount: ownedIds.length, equippedCount: equippedIds.length, remaining, nextInstanceId,
          canBuy: remaining > 0 && state.stones >= species.cost,
          reason: !remaining ? `已拥有 ${species.maxCopies} 棵，已达此树种的收藏上限` : state.stones < species.cost ? `再置办 1 棵还需 ${species.cost - state.stones} 灵石` : `每棵 ${species.cost} 灵石，还可置办 ${remaining} 棵` };
      });
      return {
        maxEquipped: decorationLimitForRealm(state.realm), realmLimits, nextLimit: realmLimits[state.realm + 1] || null, equipped: equipped.slice(), themes, treeGroups,
        layout: equipped.map(id => Object.assign({}, placements.find(item => item.id === id))),
        items: DECORATIONS.map(item => {
          const has = owned.includes(item.id), placed = equipped.includes(item.id);
          const theme = sectCatalog?.get(themes[item.id]), design = theme?.stages.find(stage => stage.rewardDecoration.id === item.id);
          const canBuy = item.repeatable ? item.copyIndex === 1 && treeGroups.some(group => group.id === item.speciesId && group.canBuy) : !has && item.cost > 0 && state.stones >= item.cost;
          return Object.assign({}, item, design ? { name: design.rewardDecoration.name, description: design.description, themeSectId: theme.id, themeSectName: theme.name } : { themeSectId: null }, { owned: has, equipped: placed, canBuy,
            reason: has ? placed ? '已布置在洞天中' : '已拥有，可布置' : item.cost > 0 && state.stones < item.cost ? `还需 ${item.cost - state.stones} 灵石` : item.requirement });
        })
      };
    }
    function getStoryInfo() {
      return {
        chapters: STORY_CHAPTERS.map(chapter => ({ id: chapter.id, realm: chapter.realm, title: chapter.title, text: state.realm >= chapter.realm ? chapter.text : '', unlocked: state.realm >= chapter.realm, read: state.journey.stories.includes(chapter.id), reason: state.realm >= chapter.realm ? '' : `达到${REALMS[chapter.realm].name}后解锁` })),
        readCount: state.journey.stories.length, total: STORY_CHAPTERS.length
      };
    }
    function getResidenceInfo() {
      const { owned, equipped } = state.journey.residence;
      return {
        maxEquipped: 1, owned: owned.slice(), equipped,
        items: RESIDENCES.map(item => {
          const has = owned.includes(item.id), placed = equipped === item.id;
          return Object.assign({}, item, { owned: has, equipped: placed, canBuy: !has && state.stones >= item.cost,
            reason: has ? placed ? '已安放在右上方宅地' : '已置办，可免费入住' : state.stones < item.cost ? `还需 ${item.cost - state.stones} 灵石` : '置办后可安放在右上方宅地' });
        })
      };
    }
    function claimCommission(period, id) {
      if (typeof period !== 'string' || !COMMISSION_PERIODS.includes(period) || typeof id !== 'string') return fail('请选择当前有效的宗门委托。');
      tick();
      const record = state.journey[period], definition = commissionDefinitions(period, record, journeyCalendarOrigin(period)).find(item => item.id === id);
      if (!definition) return fail('这张委托已到期或不存在，请查看本期委托。');
      const view = periodInfo(period).quests.find(item => item.id === id);
      if (!view.canClaim) return fail(view.reason || '委托尚未完成。');
      // Payment, consumed herbs and the claim marker form one engine mutation;
      // the server then commits them in its existing atomic economy transaction.
      if (definition.delivery) state.bag[definition.delivery.cropId] -= definition.delivery.quantity;
      record.claimed.push(id);
      giveJourneyReward(definition.reward);
      state.journey.totals.commissions = Math.min(MAX_VALUE, state.journey.totals.commissions + 1);
      if (period === 'seasonal') {
        const season = JOURNEY_SEASONS[positiveMod(record.index, JOURNEY_SEASONS.length)];
        state.journey.seasonRecords[season.id] = Math.min(MAX_VALUE, state.journey.seasonRecords[season.id] + 1);
      }
      return complete(`完成「${definition.name}」，${definition.delivery ? `交付${definition.delivery.name} ×${definition.delivery.quantity}，` : ''}获得${rewardLabel(definition.reward)}。`, { period, id, reward: Object.assign({}, definition.reward), delivery: definition.delivery && Object.assign({}, definition.delivery) });
    }
    function claimAchievement(id) {
      const achievement = typeof id === 'string' && ACHIEVEMENTS.find(item => item.id === id);
      if (!achievement) return fail('尚无这项成就。');
      if (state.journey.achievements[id]) return fail('这份成就已经领取。');
      if (achievementProgress(state, achievement) < achievement.target) return fail('这项成就尚未达成，继续积累吧。');
      state.journey.achievements[id] = true;
      giveJourneyReward(achievement.reward);
      return complete(`达成「${achievement.name}」，获得${rewardLabel(achievement.reward)}。`, { id, reward: Object.assign({}, achievement.reward) });
    }
    function buyDecoration(id) {
      const requested = typeof id === 'string' && DECORATION_MAP[id];
      if (!requested) return fail('请选择一种有效的庭院装饰。');
      const owned = state.journey.decorations.owned;
      let decoration = requested;
      if (requested.repeatable) {
        // Purchases use the species id, while equipment/layout use the exact
        // copy id. The server chooses the next copy from its own finite catalog.
        if (id !== requested.speciesId) return fail('请从对应树种卡片逐棵置办，不能指定购买编号。', { code: 'decor_purchase_species' });
        decoration = DECORATIONS.find(item => item.repeatable && item.speciesId === id && !owned.includes(item.id));
        if (!decoration) return fail(`${requested.name}最多收藏 ${requested.maxCopies} 棵，已达上限。`, { code: 'decor_copy_limit' });
      } else if (owned.includes(id)) return fail('已经拥有这件装饰，无需重复购买。');
      if (!decoration.cost) return fail(decoration.requirement);
      if (state.stones < decoration.cost) return fail(`置办${decoration.name}需要 ${decoration.cost} 灵石。`);
      state.stones -= decoration.cost;
      owned.push(decoration.id);
      return complete(`已置办${decorationLabel(decoration)}，可在庭院中布置。装饰仅改变外观。`, { decorationId: decoration.id, cost: decoration.cost,
        ...(decoration.repeatable ? { speciesId: decoration.speciesId, copyIndex: decoration.copyIndex } : {}) });
    }
    function buyResidence(id) {
      const residence = typeof id === 'string' && RESIDENCE_MAP[id];
      if (!residence) return fail('请选择一种有效的山居宅邸。');
      if (state.journey.residence.owned.includes(id)) return fail('已经置办这座宅邸，无需重复购买。');
      if (state.stones < residence.cost) return fail(`置办${residence.name}需要 ${residence.cost} 灵石。`);
      state.stones -= residence.cost;
      state.journey.residence.owned.push(id);
      return complete(`已置办${residence.name}，可免费安放到右上方宅地。宅邸仅改变外观。`, { residenceId: id, cost: residence.cost });
    }
    function equipResidence(id) {
      const residence = typeof id === 'string' && RESIDENCE_MAP[id];
      if (!residence || !state.journey.residence.owned.includes(id)) return fail('请先置办这座宅邸。');
      const placed = state.journey.residence.equipped !== id;
      state.journey.residence.equipped = placed ? id : null;
      return complete(placed ? `已入住${residence.name}，其他宅邸仍保留在收藏中。` : `已收起${residence.name}，可随时免费重新入住。`, { residenceId: id, equipped: placed });
    }
    function equipDecoration(id) {
      const decoration = typeof id === 'string' && DECORATION_MAP[id];
      if (!decoration || !state.journey.decorations.owned.includes(id)) return fail('请先获得这件庭院装饰。');
      const equipped = state.journey.decorations.equipped, index = equipped.indexOf(id);
      if (index >= 0) {
        equipped.splice(index, 1);
        return complete(`已收起${decorationLabel(decoration)}，仍保留在庭院收藏中。`, { decorationId: id, equipped: false });
      }
      const limit = decorationLimitForRealm(state.realm);
      if (equipped.length >= limit) return fail(`${REALMS[state.realm].name}境界同时最多布置 ${limit} 件小景${state.realm < REALMS.length - 1 ? `，晋入${REALMS[state.realm + 1].name}后可布置 ${decorationLimitForRealm(state.realm + 1)} 件` : ''}；也可先收起一件。`, { code: 'decor_realm_limit' });
      const placements = state.journey.decorations.placements, remembered = placements.find(item => item.id === id);
      const placement = findDecorPlacement(id, getDecorInfo().layout, remembered);
      if (!placement) return fail('暂时没有合适的空位，请先调整现有装饰的位置。');
      const previousIndex = placements.findIndex(item => item.id === id);
      if (previousIndex < 0) placements.push(placement); else placements[previousIndex] = placement;
      equipped.push(id);
      const repositioned = !!remembered && (remembered.x !== placement.x || remembered.z !== placement.z || remembered.rotation !== placement.rotation);
      return complete(`已在洞天中布置${decorationLabel(decoration)}。${repositioned ? '原位置已有装饰，已为它安排一处空位。' : ''}`, { decorationId: id, equipped: true, repositioned });
    }
    function saveDecorLayout(layout) {
      const decorations = state.journey.decorations;
      if (decorations.equipped.length > decorationLimitForRealm(state.realm)) return fail('当前布置超过境界允许的小景数量，请先收起部分小景。', { code: 'decor_realm_limit' });
      const result = validateDecorLayout(layout, decorations.equipped);
      if (!result.ok) return fail(result.message, { code: result.code });
      // Never accept a layout as a way to equip or acquire an unowned object.
      if (result.layout.some(item => !decorations.owned.includes(item.id))) return fail('请先获得这件庭院装饰。', { code: 'decor_not_owned' });
      if (JSON.stringify(result.layout) === JSON.stringify(getDecorInfo().layout))
        return { ok: true, alreadySaved: true, message: '当前装饰位置已经保存。', layout: result.layout };
      const remembered = decorations.placements.filter(item => !decorations.equipped.includes(item.id));
      decorations.placements = remembered.concat(result.layout.map(item => ({ ...item })));
      return complete('已保存装饰的位置与朝向。', { layout: result.layout });
    }
    function readStory(id) {
      const chapter = typeof id === 'string' && STORY_CHAPTERS.find(item => item.id === id);
      if (!chapter) return fail('尚无这一章修行故事。');
      if (state.realm < chapter.realm) return fail(`达到${REALMS[chapter.realm].name}后可阅读此章。`);
      if (state.journey.stories.includes(id)) return { ok: true, alreadyRead: true, message: '这一章已读，可随时重温。', id };
      state.journey.stories.push(id);
      return complete(`读过「${chapter.title}」，见闻已留在修行小记。`, { id }, 'info');
    }
    function grantSectDecoration(stageId, sectId) {
      // TRUSTED SERVER EXTENSION ONLY. The cloud action whitelist must never
      // expose this method: sect-service checks membership and contributions.
      const decorationId = typeof stageId === 'string' && SECT_DECORATIONS[stageId];
      if (!decorationId) return fail('宗门共建阶段无效。');
      const theme = sectId === undefined ? null : sectCatalog?.get(sectId);
      if (sectId !== undefined && !theme) return fail('宗门纪念样式无效。');
      if (state.journey.sectRewards[stageId]) return fail('这份共建纪念已领取，每个账号终身一次。', { alreadyClaimed: true });
      state.journey.sectRewards[stageId] = true;
      giveJourneyReward({ stones: 0, decorationId, title: null });
      if (theme) state.journey.decorations.themes[decorationId] = theme.id;
      const name = theme?.stages.find(stage => stage.id === stageId)?.rewardDecoration.name || DECORATION_MAP[decorationId].name;
      return complete(`获得宗门共建纪念「${name}」，可在自己的庭院中布置。`, { decorationId, stageId, themeSectId: theme?.id || null });
    }
    function tick() {
      const current = Date.now();
      let changed = refreshDaily(current);
      if (settleWeather(current)) changed = true;
      if (refreshJourney(current)) changed = true;
      const intervals = Math.floor(Math.max(0, current - state.dewUpdatedAt) / DEW_INTERVAL);
      if (intervals > 0) {
        state.dew = Math.min(DEW_MAX, state.dew + intervals);
        state.dewUpdatedAt += intervals * DEW_INTERVAL;
        changed = true;
      }
      state.neighbors.forEach((n, i) => {
        if (current >= n.nextRefresh) {
          state.neighbors[i] = makeNeighbor(NEIGHBOR_DEFS[i], current, false, i);
          changed = true;
        }
      });
      if (changed) { save(); emit(); }
      return changed;
    }
    function harvestOne(index) {
      const p = getPlot(index);
      if (!isMature(p)) return null;
      const crop = CROP_MAP[p.cropId];
      const qty = crop.yield - (p.stolenUnits || 0);
      // A full bag must leave the crop untouched, not consume it and credit a
      // commission/mastery entry for produce that could not be received.
      if (state.bag[crop.id] + qty > MAX_INVENTORY) return null;
      state.bag[crop.id] += qty;
      state.stats.harvestCount++;
      state.stats.harvestUnits += qty;
      recordJourney('harvest', crop.id, 1, qty);
      // Stubble remains visible and blocks planting until the hoe clears it.
      p.stage = WATERINGS_REQUIRED;
      p.nextWaterAt = 0;
      p.withered = true;
      p.witheredReason = 'harvest';
      p.watered = false;
      return { index, cropId: crop.id, name: crop.name, qty, qi: 0 };
    }
    function getUnlockInfo(index) {
      if (!validIndex(index)) return { cost: 0, requiredRealm: 0, available: false };
      const requiredRealm = plotRealm(index);
      return { cost: PLOT_UNLOCK_COSTS[requiredRealm], requiredRealm, available: index >= STARTER_PLOTS && !state.plots[index].unlocked };
    }
    function getToolInfo(kind) {
      if (!Object.prototype.hasOwnProperty.call(TOOL_DEFS, kind)) return null;
      const definition = TOOL_DEFS[kind], level = state.tools[kind];
      const maxed = level === TOOL_CAPACITIES.length;
      return { kind, name: definition.name, level, capacity: TOOL_CAPACITIES[level - 1], maxLevel: TOOL_CAPACITIES.length, nextCapacity: TOOL_CAPACITIES[maxed ? level - 1 : level], nextCost: maxed ? 0 : definition.costs[level - 1], maxed };
    }
    function getToolTargets(kind, index, now = Date.now()) {
      const tool = getToolInfo(kind);
      if (!tool || !validIndex(index)) return [];
      const eligible = p => !!(p && p.unlocked && (kind === 'hoe' ? p.withered === true : getGrowthInfo(p, now).canWater));
      // A click on a live plant, a locked field, or a cooling-down plant is inert.
      if (!eligible(getPlot(index))) return [];
      const position = i => i < STARTER_PLOTS ? { row: 4, column: [2, 3, 1, 4, 0][i] } : { row: 4 - Math.floor(i / STARTER_PLOTS), column: i % STARTER_PLOTS };
      const origin = position(index);
      const distance = i => { const p = position(i); return Math.abs(p.row - origin.row) + Math.abs(p.column - origin.column); };
      return state.plots.map((p, i) => eligible(p) ? i : -1).filter(i => i >= 0).sort((a, b) => distance(a) - distance(b) || a - b).slice(0, tool.capacity);
    }
    function resolveQty(qty, owned) {
      if (qty === 'all') return owned;
      if (qty === undefined) return Math.min(1, owned);
      return Number.isInteger(qty) && qty > 0 ? Math.min(qty, owned) : 0;
    }
    function getNeighbor(id) {
      tick();
      return state.neighbors.find(n => n.id === id);
    }
    function stealOne(neighbor, index) {
      const p = neighbor.plots[index];
      if (!isMature(p) || p.stolen || p.attempted || state.daily.stealAttempts >= DAILY_LIMITS.stealAttempts) return null;
      p.stolen = true;
      p.attempted = true;
      state.daily.stealAttempts++;
      state.stats.stealAttempts++;
      if (Math.random() < neighbor.guard / 100) {
        const penalty = Math.min(state.stones, neighbor.penalty);
        state.stones -= penalty;
        state.stats.stealFailCount++;
        return { index, success: false, penalty, cropId: p.cropId, name: CROP_MAP[p.cropId].name, qty: 0 };
      }
      p.stolenSuccess = true;
      state.bag[p.cropId] = Math.min(MAX_INVENTORY, state.bag[p.cropId] + 1);
      state.stats.stealCount++;
      return { index, success: true, penalty: 0, cropId: p.cropId, name: CROP_MAP[p.cropId].name, qty: 1, qi: 0 };
    }
    const api = {
      get state() { return state; },
      get storageAvailable() { return !storageWarning; },
      subscribe(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
      tick,
      getUnlockInfo,
      getToolInfo,
      getToolTargets,
      getGrowthInfo: (index, now = Date.now()) => getGrowthInfo(getPlot(index), now),
      getJourneyInfo,
      getCodexInfo,
      getDecorInfo,
      getResidenceInfo,
      getStoryInfo,
      claimCommission,
      claimAchievement,
      buyDecoration,
      buyResidence,
      equipResidence,
      equipDecoration,
      saveDecorLayout,
      readStory,
      grantSectDecoration,
      getAlchemyInfo() {
        tick();
        const brew = state.brew, pill = brew && PILL_MAP[brew.pillId];
        return {
          daily: Object.assign({}, state.daily), limits: DAILY_LIMITS,
          pillsLeft: Math.max(0, DAILY_LIMITS.pillsTaken - state.daily.pillsTaken),
          qiLeft: Math.max(0, DAILY_LIMITS.pillQi - state.daily.pillQi),
          stealAttemptsLeft: Math.max(0, DAILY_LIMITS.stealAttempts - state.daily.stealAttempts),
          brew: brew ? Object.assign({}, brew, { name: pill.name, qi: pill.qi, remainingMs: Math.max(0, brew.readyAt - Date.now()), ready: Date.now() >= brew.readyAt }) : null
        };
      },
      startBrew(pillId) {
        const pill = typeof pillId === 'string' && PILL_MAP[pillId];
        if (!pill) return fail('请选择一种有效丹方。');
        if (state.brew) return fail('丹炉中已有一炉丹药，请先等待并领取成丹。');
        if (state.realm < pill.minRealm) return fail(`达到${REALMS[pill.minRealm].name}后，可炼制${pill.name}。`);
        if (state.pills[pill.id] >= MAX_INVENTORY) return fail('此种丹药的存放空间已满。');
        if (state.stones < pill.cost) return fail(`炼制${pill.name}需要 ${pill.cost} 灵石炉费。`);
        const missing = Object.entries(pill.ingredients).filter(([id, count]) => state.bag[id] < count);
        if (missing.length) return fail(`材料不足：${missing.map(([id, count]) => `${CROP_MAP[id].name}还差 ${count - state.bag[id]} 份`).join('、')}。`);
        const startedAt = Date.now();
        state.stones -= pill.cost;
        Object.entries(pill.ingredients).forEach(([id, count]) => { state.bag[id] -= count; });
        state.brew = { id: `${startedAt}-${Math.random().toString(36).slice(2, 12) || '0'}`, pillId: pill.id, startedAt, readyAt: startedAt + pill.brewTime };
        state.stats.brewCount++;
        return complete(`已按丹方投入材料，开始炼制${pill.name}。每炉成丹 1 颗，到时领取。`, { pillId: pill.id, cost: pill.cost, qty: 1, brew: Object.assign({}, state.brew) });
      },
      claimBrew() {
        const brew = state.brew;
        if (!brew) return fail('丹炉中暂无可领取的丹药。');
        const now = Date.now(), pill = PILL_MAP[brew.pillId];
        if (now < brew.readyAt) return fail('丹药尚未炼成，请等待炉火养足。', { remainingMs: brew.readyAt - now });
        if (state.pills[pill.id] >= MAX_INVENTORY) return fail('此种丹药的存放空间已满，请先服用或交易。');
        state.brew = null;
        state.pills[pill.id]++;
        state.stats.brewClaims++;
        recordJourney('brew', pill.id);
        return complete(`炼成${pill.name} ×1，已收入丹药库存。服用后才会增加修为。`, { pillId: pill.id, qty: 1, qi: 0, brewId: brew.id });
      },
      consumePill(pillId) {
        tick();
        const pill = typeof pillId === 'string' && PILL_MAP[pillId];
        if (!pill) return fail('请选择一种有效丹药。');
        if (state.pills[pill.id] < 1) return fail(`暂无${pill.name}，可自行炼制或前往市场购买。`);
        if (state.daily.pillsTaken >= DAILY_LIMITS.pillsTaken) return fail(`今日已服用 ${DAILY_LIMITS.pillsTaken} 颗丹药，请于北京时间次日再来。`);
        const qiLeft = DAILY_LIMITS.pillQi - state.daily.pillQi;
        if (pill.qi > qiLeft) return fail(`今日服丹修为额度还剩 ${qiLeft}，不足以服用增加 ${pill.qi} 修为的${pill.name}。`);
        if (state.qi + pill.qi > MAX_VALUE) return fail('当前修为已达存放上限，请先突破。');
        state.pills[pill.id]--;
        state.qi += pill.qi;
        state.daily.pillsTaken++;
        state.daily.pillQi += pill.qi;
        state.stats.pillsTaken++;
        state.stats.pillQi += pill.qi;
        return complete(`服用${pill.name}，修为 +${pill.qi}。今日已服 ${state.daily.pillsTaken}/${DAILY_LIMITS.pillsTaken} 颗，服丹修为 ${state.daily.pillQi}/${DAILY_LIMITS.pillQi}。`, { pillId: pill.id, qty: 1, qi: pill.qi, daily: Object.assign({}, state.daily) });
      },
      upgradeTool(kind) {
        const tool = getToolInfo(kind);
        if (!tool) return fail('请选择锄头或浇水壶。');
        if (tool.maxed) return fail(`${tool.name}已达到最高等级。`);
        if (state.stones < tool.nextCost) return fail(`灵石不足，升级${tool.name}需要 ${tool.nextCost} 灵石。`);
        state.stones -= tool.nextCost;
        state.tools[kind]++;
        state.stats.toolUpgradeCount++;
        const upgraded = getToolInfo(kind);
        return complete(`${tool.name}升至 ${upgraded.level} 级，一次可${kind === 'hoe' ? '清理' : '浇灌'}最多 ${upgraded.capacity} 块灵田。`, Object.assign({ cost: tool.nextCost }, upgraded));
      },
      plant(index, cropId) {
        tick();
        if (weatherCatchupPending) return weatherPending();
        const p = getPlot(index), crop = CROP_MAP[cropId];
        if (!p || !crop) return fail('请选择一块灵田和一种灵植。');
        if (!p.unlocked) return fail('这块灵田尚未开垦。');
        if (p.withered) return fail('先用锄头清理枯草，才能重新播种。');
        if (p.cropId) return fail('田里已有灵植，请成熟收获后再种。');
        if (state.realm < crop.minRealm) return fail(`达到${REALMS[crop.minRealm].name}后，可种植${crop.name}。`);
        if (state.stones < crop.price) return fail(`灵石不足，种植${crop.name}需要 ${crop.price} 灵石。`);
        state.stones -= crop.price;
        state.plots[index] = makeCultivatedPlant(crop.id, Date.now());
        state.stats.plantCount++;
        recordJourney('plant', crop.id);
        settleWeather(Date.now());
        return complete(`种下${crop.name}，${state.plots[index].rainWaterings ? '细雨已浇下第一遍水，灵植开始按时生长。' : '请用浇水壶浇下第一遍水。'}`, { index, cropId, cost: crop.price });
      },
      water(index) {
        refreshWeather();
        if (weatherCatchupPending) return weatherPending();
        const now = Date.now(), p = getPlot(index), growth = getGrowthInfo(p, now);
        if (!p || !p.cropId || !p.unlocked) return fail('先播下灵种，再用浇水壶浇灌。');
        if (growth.withered) return fail('这里留下了枯草，请先用锄头清理。');
        if (growth.mature) return fail('灵植已经成熟，可以收获了。');
        if (!growth.canWater) return fail('本阶段正在吸收水分，请在倒计时结束后再浇水。', { remainingMs: growth.remainingMs });
        const indices = getToolTargets('wateringCan', index, now);
        const items = indices.map(i => {
          const plot = state.plots[i], crop = CROP_MAP[plot.cropId];
          plot.stage++;
          plot.watered = true;
          plot.nextWaterAt = plot.stage < WATERINGS_REQUIRED ? now + crop.waterIntervals[plot.stage - 1] : 0;
          recordJourney('water', crop.id);
          return { index: i, cropId: plot.cropId, stage: plot.stage, nextWaterAt: plot.nextWaterAt };
        });
        state.stats.waterCount += items.length;
        const message = items.length === 1
          ? `浇灌${CROP_MAP[p.cropId].name}，已进入${GROWTH_STAGES[p.stage]}形态${p.stage === WATERINGS_REQUIRED ? '，可以收获了' : '，到时再来浇水'}。`
          : `浇灌 ${items.length} 块灵田，每株灵植各推进一个生长形态。`;
        return complete(message, { index, cropId: p.cropId, stage: p.stage, indices, items, count: items.length });
      },
      clear(index) {
        refreshWeather();
        const p = getPlot(index);
        if (!p || !p.unlocked || !p.withered) return fail('这块田没有待清理的枯草。');
        const indices = getToolTargets('hoe', index);
        const items = indices.map(i => {
          const cropId = state.plots[i].cropId;
          state.plots[i] = emptyPlot(true);
          return { index: i, cropId, stage: 0 };
        });
        state.stats.clearCount += items.length;
        recordJourney('clear', null, items.length);
        return complete(`锄头清理了 ${items.length} 块枯草，灵田可以重新播种。`, { index, indices, items, count: items.length });
      },
      // 2026-11-26 铲除刚种下的灵植（种错了可以重种）：只铲这一块，种子钱不退；浇过水（进入第二阶段“萌芽”）就不能铲了；
      // 不计统计、不计委托／任务／历练进度（否则可以种便宜种子再铲掉来刷任务），结果里不带 cost/earned/reward（老师端收支分析按这几个键归类）
      uproot(index) {
        refreshWeather();
        if (weatherCatchupPending) return weatherPending();
        const p = getPlot(index), growth = getGrowthInfo(p);
        if (!p || !p.unlocked) return fail('这块灵田尚未开垦。');
        if (!p.cropId || !CROP_MAP[p.cropId]) return fail('这块田是空的，没有可铲的灵植。');
        if (growth.withered) return fail('这里是枯草，请用锄头清理。');
        if (growth.mature) return fail('灵植已经成熟，可以直接采收。');
        // 2026-11-26 用户：“灵植在第二阶段就不能铲了，以防误铲”——只有刚种下、还是“灵种”（第一阶段，没浇过水）的能铲。
        // 下雨天例外一步：雨水会在种下的同时自动浇第一遍，灵植一落地就是“萌芽”，那样就完全没有改正的机会了；
        // 所以“只被雨水浇过一遍、自己还没动手浇”的也算刚种下。再往后（自己浇过，或长到第三阶段“舒叶”）一律不能铲。
        if (!canUproot(p)) return fail(`灵植已经长到“${GROWTH_STAGES[growth.stage]}”，不能再铲了：只有刚种下、自己还没浇过水的能铲。`);
        const cropId = p.cropId;
        state.plots[index] = emptyPlot(true);
        return complete('已铲掉，这块田可以重新播种了。', { index, cropId, removed: true });
      },
      harvest(index) {
        refreshWeather();
        if (weatherCatchupPending) return weatherPending();
        const p = getPlot(index);
        if (!p || !p.cropId) return fail('这块灵田还没有可收获的灵植。');
        if (p.withered) return fail(p.witheredReason === 'frost' ? '这株灵植已因冻害枯萎，无法采收，请用锄头清理。' : '此田已经采收，请用锄头清理留下的枯草。');
        if (!isMature(p)) return fail('灵植尚未成熟，请按阶段浇水照料。');
        const result = harvestOne(index);
        if (!result) return fail('这味灵草的库存已满，请先出售、炼丹或交易后再收获。');
        return complete(`收获${result.name} ×${result.qty}，可用于炼丹或出售。田中的枯草需用锄头清理。`, result);
      },
      harvestAll() {
        refreshWeather();
        if (weatherCatchupPending) return weatherPending();
        const items = [];
        for (let i = 0; i < PLOT_COUNT; i++) { const item = harvestOne(i); if (item) items.push(item); }
        if (!items.length) return fail(state.plots.some(p => isMature(p)) ? '成熟灵草的库存已满，请先出售、炼丹或交易后再收获。' : '暂时没有成熟的灵植。');
        const qty = items.reduce((sum, x) => sum + x.qty, 0), qi = items.reduce((sum, x) => sum + x.qi, 0);
        return complete(`收获 ${items.length} 块灵田，共 ${qty} 份灵草，可炼丹或出售。请用锄头清理枯草。`, { items, qty, qi, count: items.length });
      },
      sell(cropId, qty = 1) {
        const crop = CROP_MAP[cropId];
        if (!crop) return fail('请选择行囊中的灵植。');
        const count = resolveQty(qty, state.bag[cropId]);
        if (!count) return fail(`行囊中没有足够的${crop.name}。`);
        const earned = count * crop.sellPrice;
        state.bag[cropId] -= count;
        state.stones = Math.min(MAX_VALUE, state.stones + earned);
        state.stats.sellCount += count;
        state.stats.sellEarnings += earned;
        return complete(`售出${crop.name} ×${count}，获得 ${earned} 灵石。`, { cropId, qty: count, earned });
      },
      sellAll() {
        let qty = 0, earned = 0;
        CROPS.forEach(c => { qty += state.bag[c.id]; earned += state.bag[c.id] * c.sellPrice; state.bag[c.id] = 0; });
        if (!qty) return fail('行囊还是空的，先去收获或拜访仙友吧。');
        state.stones = Math.min(MAX_VALUE, state.stones + earned);
        state.stats.sellCount += qty;
        state.stats.sellEarnings += earned;
        return complete(`售出 ${qty} 份灵植，获得 ${earned} 灵石。`, { qty, earned });
      },
      refine(cropId, qty = 1) {
        return fail('灵草不再直接炼化为修为，请按丹方炼制丹药后服用；所有丹药共用每日额度。');
      },
      breakthrough() {
        if (state.realm >= REALMS.length - 1) return fail('已至化神之境，且享山中清欢。');
        const cost = REALMS[state.realm].qiNeeded;
        if (state.qi < cost) return fail(`修为尚差 ${cost - state.qi}，按每日额度服用丹药可助突破。`);
        state.qi -= cost;
        state.realm++;
        state.stats.breakthroughCount++;
        return complete(`灵台清明！你已突破至${REALMS[state.realm].name}。${state.realm === BATCH_STEAL_MIN_REALM ? '已解锁一键偷采。' : ''}`, { realm: state.realm, cost });
      },
      unlock(index) {
        const p = getPlot(index);
        if (!p) return fail('请选择一块待开垦的灵田。');
        if (p.unlocked) return fail('这块灵田已经开垦。');
        const info = getUnlockInfo(index);
        if (state.realm < info.requiredRealm) return fail(`达到${REALMS[info.requiredRealm].name}后可开垦此田。`);
        if (state.stones < info.cost) return fail(`开垦此田需要 ${info.cost} 灵石。`);
        state.stones -= info.cost;
        p.unlocked = true;
        state.stats.unlockCount++;
        return complete(`开垦了一块新灵田，仙山又添一抹生机。`, { index, cost: info.cost });
      },
      steal(neighborId, index) {
        const n = getNeighbor(neighborId);
        if (!n || !validIndex(index)) return fail('尚未寻到这块仙友灵田。');
        const p = n.plots[index];
        if (p.stolen || p.attempted) return fail('此田本轮已探访，待仙友重新栽种再来。');
        if (!isMature(p)) return fail('这株灵植尚未成熟，先看看别的灵田。');
        if (state.daily.stealAttempts >= DAILY_LIMITS.stealAttempts) return fail(`今日已用完 ${DAILY_LIMITS.stealAttempts} 次偷采机会，请于北京时间次日再来。`);
        const result = stealOne(n, index);
        if (!result.success) {
          const message = `触动${n.name}的护田灵阵，留下 ${result.penalty} 灵石赔礼。本轮不可再试此田。`;
          event(message, 'info'); save(); emit(); notify(message, 'info');
          return Object.assign({ ok: false, message, attempted: true }, result);
        }
        return complete(`悄悄采得${result.name} ×1，${n.name}尚未察觉。`, result);
      },
      stealAll(neighborId) {
        if (state.realm < BATCH_STEAL_MIN_REALM) return fail('一键偷采于元婴期解锁，请逐块偷采。');
        const n = getNeighbor(neighborId);
        if (!n) return fail('请先拜访一位仙友。');
        if (state.daily.stealAttempts >= DAILY_LIMITS.stealAttempts) return fail(`今日已用完 ${DAILY_LIMITS.stealAttempts} 次偷采机会，请于北京时间次日再来。`);
        const items = [];
        for (let i = 0; i < PLOT_COUNT && state.daily.stealAttempts < DAILY_LIMITS.stealAttempts; i++) { const result = stealOne(n, i); if (result) items.push(result); }
        if (!items.length) return fail('暂无可偷采的成熟灵植，稍后再来吧。');
        const successes = items.filter(x => x.success).length;
        const failed = items.length - successes;
        const penalty = items.reduce((sum, x) => sum + x.penalty, 0);
        const message = `探访 ${items.length} 块灵田，采得 ${successes} 份灵草${failed ? `；被发现 ${failed} 次，赔礼 ${penalty} 灵石` : '，踏云而归'}。`;
        return complete(message, { items, qty: successes, successes, failed, penalty, stealAttemptsLeft: DAILY_LIMITS.stealAttempts - state.daily.stealAttempts }, successes ? 'success' : 'info');
      },
      getNeighbors() { tick(); return state.neighbors; },
      getQuests() {
        return QUEST_DEFS.map(q => ({ id: q.id, name: q.name, desc: q.desc, progress: Math.min(q.target, state.stats[q.stat]), target: q.target, claimed: state.quests[q.id], reward: Object.assign({}, q.reward) }));
      },
      claimQuest(id) {
        const q = QUEST_DEFS.find(x => x.id === id);
        if (!q) return fail('尚无这项修行任务。');
        if (state.quests[id]) return fail('这份修行奖励已经领取。');
        if (state.stats[q.stat] < q.target) return fail('修行尚未完成，再接再厉。');
        state.quests[id] = true;
        state.stones = Math.min(MAX_VALUE, state.stones + q.reward.stones);
        state.qi = Math.min(MAX_VALUE, state.qi + q.reward.qi);
        return complete(`完成「${q.name}」，获得 ${q.reward.stones} 灵石、${q.reward.qi} 修为。`, { id, reward: Object.assign({}, q.reward) });
      },
      getStats() {
        const unlockedCount = state.plots.filter(p => p.unlocked).length;
        const matureCount = state.plots.filter(p => isMature(p)).length;
        const growingCount = state.plots.filter(p => p.unlocked && p.cropId && !p.withered && !isMature(p)).length;
        const emptyCount = state.plots.filter(p => p.unlocked && !p.cropId && !p.withered).length;
        const witheredCount = state.plots.filter(p => p.unlocked && p.withered).length;
        const needsWaterCount = state.plots.filter(p => getGrowthInfo(p).canWater).length;
        const bagCount = CROPS.reduce((total, c) => total + state.bag[c.id], 0);
        const bagValue = CROPS.reduce((total, c) => total + state.bag[c.id] * c.sellPrice, 0);
        const pillCount = PILLS.reduce((total, p) => total + state.pills[p.id], 0);
        const nextDewIn = Math.max(0, DEW_INTERVAL - (Date.now() - state.dewUpdatedAt));
        return Object.assign({}, state.stats, { unlockedCount, matureCount, growingCount, emptyCount, witheredCount, needsWaterCount, bagCount, bagValue, pillCount, gardenValue: bagValue, nextDewIn, dewMax: DEW_MAX, totalPlots: PLOT_COUNT, lockedCount: PLOT_COUNT - unlockedCount });
      },
      exportSave() { tick(); save(); return JSON.stringify(state, null, 2); },
      importSave(json) {
        try {
          if (typeof json !== 'string' || json.length > 256000) return fail('存档过大或格式无效，请选择游戏导出的 JSON 文件。');
          const parsed = JSON.parse(json);
          const imported = validateSave(parsed, Date.now());
          const migrationMessage = imported.events[0].text;
          state = imported;
          protectedSave = false;
          tick();
          const migrated = parsed.version < VERSION || parsed.growthRulesVersion !== GROWTH_RULES_VERSION;
          return complete(migrated ? migrationMessage : '存档导入成功，云间灵田已恢复。', { migrated });
        } catch (error) { return fail(error instanceof SyntaxError ? '无法读取此文件，请选择有效的 JSON 存档。' : error.message || '存档格式有误。'); }
      },
      reset() { protectedSave = false; state = makeInitial(Date.now()); return complete('已重新启程，青云峰的灵田静候你的耕耘。'); },
      isMature: index => isMature(getPlot(index))
    };
    tick();
    save();
    if (migratedOnLoad) notify(migrationNotice, 'info');
    if (loadNotice) notify(loadNotice, 'info');
    return api;
  }
  return Object.freeze({ create, CROPS, REALMS, NEIGHBORS: NEIGHBOR_DEFS, STORAGE_KEY, DEW_MAX, DEW_INTERVAL, NEIGHBOR_INTERVAL, isMature, getGrowthInfo, canUproot, VERSION, GROWTH_RULES_VERSION, SUPPORTED_VERSIONS, PLOT_COUNT, STARTER_PLOTS, PLOT_UNLOCK_COSTS, WATERINGS_REQUIRED, GROWTH_STAGES, TOOL_CAPACITIES, TOOL_DEFS, PILLS, PILL_MAP, DAILY_LIMITS, BATCH_STEAL_MIN_REALM, dayKey, COMMISSION_PERIODS, JOURNEY_LIMITS, JOURNEY_SEASONS, DECORATIONS, DECOR_REALM_LIMITS, decorationLimitForRealm, RESIDENCES, DECOR_LAYOUT_RULES, getDefaultDecorLayout, validateDecorLayout, coveredDecorObstacles, ACHIEVEMENTS, STORY_CHAPTERS });
  }
  global.createSpiritGameRuntime = createSpiritGameRuntime;
  if (typeof window !== 'undefined' && global === window) global.SpiritGame = createSpiritGameRuntime(window);
})(typeof window !== 'undefined' ? window : globalThis);
