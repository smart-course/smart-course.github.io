/* Shared, immutable courtyard choices. Authority and settlement live on the server. */
(function (global) {
  'use strict';
  const slots = [
    { id: 'westRear', name: '西侧后庭', x: -8.15, z: .4 },
    { id: 'eastRear', name: '东侧后庭', x: 8.15, z: .4 },
    { id: 'westCourt', name: '西侧中庭', x: -8.15, z: 4.6 },
    { id: 'eastCourt', name: '东侧中庭', x: 8.15, z: 4.6 },
    { id: 'westFront', name: '西侧前庭', x: -8.15, z: 8.8 },
    { id: 'eastFront', name: '东侧前庭', x: 8.15, z: 8.8 }
  ];
  const items = [
    { id: 'stoneLantern', name: '引路石灯', unlockStageId: null, description: '在步道旁留一盏灯，迎同门归山。' },
    { id: 'bambooFence', name: '青竹篱', unlockStageId: null, description: '以竹为篱，分出一方清静庭院。' },
    { id: 'sectBanner', name: '宗门庭幡', unlockStageId: null, description: '庭幡沿用本宗的色彩与徽记。' },
    { id: 'blossomTree', name: '绯桃花树', unlockStageId: 'gate', description: '山门共建完成后，为庭院添一树春色。' },
    { id: 'lotusPond', name: '听荷莲池', unlockStageId: 'spring', description: '庭院共建完成后，开放碧水浅荷小景。' },
    { id: 'jadePavilion', name: '栖云亭', unlockStageId: 'library', description: '书阁共建完成后，开放可共坐听风的双檐亭。' }
  ];
  const initiatives = [
    { id: 'steadyCultivation', name: '勤耕药圃', description: '按自己的节奏照料灵草，把日常耕耘积成一山丰实。' },
    { id: 'sharedConstruction', name: '同修山门', description: '留意当前工程需要的材料，量力参与宗门共建。' },
    { id: 'alchemyExchange', name: '交流丹道', description: '比较丹方配比与灵草需求，交流炼丹和交易心得。' },
    { id: 'mutualLearning', name: '同道切磋', description: '带着一个问题与同门讨论，分享一条自己的学习收获。' }
  ];
  const greetings = [
    { id: 'welcome', name: '迎客共游', text: '山门常开，欢迎道友来访，共赏一山草木。' },
    { id: 'study', name: '邀友问学', text: '携一卷书，带一个问题，与同道相会于此。' },
    { id: 'quiet', name: '静赏山色', text: '且听山风，慢看草木，在此歇一歇，再赴前程。' }
  ];
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function lookup(list) {
    const map = Object.assign(Object.create(null), Object.fromEntries(list.map(item => [item.id, item])));
    freeze(map);
    return id => typeof id === 'string' && Object.hasOwn(map, id) ? map[id] : null;
  }
  const getItem = lookup(items);
  global.SpiritSectGovernance = freeze({
    version: 1, timezone: 'Asia/Shanghai', termMs: 7 * 24 * 60 * 60 * 1000,
    settlementLabel: '北京时间每周日 00:00', scoreLabel: '主站修为', maxDecorations: 6,
    scoreDescription: '以主站已确认的本宗周日修为排行第一名为准；游戏接收可信排名接口。',
    tieBreakDescription: '同分时沿用主站排行榜的稳定顺序；游戏不另用贡献或境界决定名次。',
    slots, items, initiatives, greetings, rotations: [0, 90, 180, 270],
    defaultLayout: [
      { slotId: 'westFront', itemId: 'stoneLantern', rotation: 0 },
      { slotId: 'westRear', itemId: 'bambooFence', rotation: 90 },
      { slotId: 'eastFront', itemId: 'sectBanner', rotation: 0 }
    ],
    defaultInitiativeId: 'sharedConstruction', defaultGreetingId: 'welcome',
    getSlot: lookup(slots), getItem, getInitiative: lookup(initiatives), getGreeting: lookup(greetings),
    availableItems(completedStageIds) {
      const done = new Set(Array.isArray(completedStageIds) ? completedStageIds : []);
      return items.filter(item => item.unlockStageId === null || done.has(item.unlockStageId));
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
