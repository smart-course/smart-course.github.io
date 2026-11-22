/* 静修场景、衣装与番茄钟的统一目录。 */
(function (global) {
  'use strict';
  const SCENES = [
    { id: 'library', name: '藏经阁', description: '灯火照卷，静读一章。', ambience: '翻书 · 落笔', color: '#b99862', seats: 8 },
    { id: 'rain', name: '听雨轩', description: '檐下听雨，案前修习。', ambience: '细雨 · 茶声', color: '#769b91', seats: 8 }
  ];
  // 环境声独立于雅室选择；没有设置的旧存档继续使用随景清音。
  const SOUNDS = [
    { id: 'scene', name: '随景清音', description: '随雅室配以疏弦、翻书或轻雨。' },
    { id: 'rain', name: '檐下听雨', description: '绵密柔和的雨声，没有旋律。' },
    { id: 'stream', name: '山涧清溪', description: '细水流过山石，轻轻起伏。' },
    { id: 'wind', name: '松间清风', description: '缓缓吹过林间的低柔风声。' },
    { id: 'bamboo', name: '竹叶轻响', description: '微风拂过竹叶，细碎而轻盈。' },
    { id: 'fire', name: '围炉微火', description: '温暖炉火与轻微木柴声。' },
    { id: 'pages', name: '书卷轻翻', description: '间隔留白的轻柔翻书声。' },
    { id: 'brown', name: '云海沉声', description: '平稳柔和的低频底噪，没有旋律。' }
  ];
  const SLOTS = [
    { id: 'head', name: '发冠' }, { id: 'robe', name: '衣袍' },
    { id: 'bottom', name: '下裳' }, { id: 'accessory', name: '配饰' }
  ];
  const ITEMS = [
    { id: 'head_basic', slot: 'head', name: '素木发簪', price: 0, description: '一枝木簪，收拢心绪。', color: '#5e4435', accent: '#b8a185', shape: 'pin' },
    { id: 'head_bamboo', slot: 'head', name: '青竹冠', price: 50, description: '青竹束冠，自有清气。', color: '#5e8971', accent: '#d4c893', shape: 'bamboo' },
    { id: 'head_cloud', slot: 'head', name: '流云冠', price: 150, description: '云纹玉冠，温润如初。', color: '#d9e5df', accent: '#81aaa0', shape: 'cloud' },
    { id: 'head_star', slot: 'head', name: '星河冠', price: 500, description: '一簇星光，映照求知之心。', color: '#63718f', accent: '#e2c780', shape: 'star' },
    { id: 'robe_basic', slot: 'robe', name: '素青道袍', price: 0, description: '素青窄袖，最宜提笔。', color: '#527b6b', accent: '#e5e3cd', shape: 'plain' },
    { id: 'robe_bamboo', slot: 'robe', name: '听雨衫', price: 80, description: '雨青宽袖，缀以细竹纹。', color: '#6a9d9b', accent: '#b8d1c1', shape: 'rain' },
    { id: 'robe_cloud', slot: 'robe', name: '鹤纹袍', price: 200, description: '米白鹤纹，衣摆如云。', color: '#e5ddc4', accent: '#567d72', shape: 'crane' },
    { id: 'robe_star', slot: 'robe', name: '太清羽衣', price: 500, description: '浅金羽边，映着长夜灯火。', color: '#7984aa', accent: '#e0c690', shape: 'celestial' },
    { id: 'bottom_basic', slot: 'bottom', name: '素麻下裳', price: 0, description: '清简耐看，伴你从容入席。', color: '#d8d4b5', accent: '#9a946c', shape: 'plain' },
    { id: 'bottom_bamboo', slot: 'bottom', name: '竹影下裳', price: 50, description: '深竹绿裳，层层垂落。', color: '#5e7e68', accent: '#a9bc8e', shape: 'bamboo' },
    { id: 'bottom_cloud', slot: 'bottom', name: '云纹下裳', price: 150, description: '浅色云纹，随步微漾。', color: '#bfccce', accent: '#809eac', shape: 'cloud' },
    { id: 'bottom_star', slot: 'bottom', name: '月华下裳', price: 300, description: '月白与紫灰相映，静夜生辉。', color: '#aba7bf', accent: '#e4d8bd', shape: 'moon' },
    { id: 'accessory_basic', slot: 'accessory', name: '布结佩', price: 0, description: '一枚素结，记住初入静修。', color: '#ac925e', accent: '#c9b77d', shape: 'knot' },
    { id: 'accessory_bamboo', slot: 'accessory', name: '书卷佩', price: 50, description: '一卷随身，时时有新知。', color: '#e3d4ac', accent: '#8d6945', shape: 'scroll' },
    { id: 'accessory_cloud', slot: 'accessory', name: '青玉佩', price: 150, description: '温润青玉，轻悬腰间。', color: '#7db5a1', accent: '#d5dfbf', shape: 'jade' },
    { id: 'accessory_star', slot: 'accessory', name: '流萤灵灯', price: 300, description: '一盏流萤，照亮案前方寸。', color: '#d9b66d', accent: '#fff0bb', shape: 'lantern' },
    { id: 'accessory_inkjade', slot: 'accessory', name: '凝墨玉佩', price: 0, achievementId: 'hours_10', description: '累计静修十小时，墨香凝为随身玉。', color: '#477e7b', accent: '#d3eee1', shape: 'jade' },
    { id: 'robe_cloudink', slot: 'robe', name: '云笺鹤袍', price: 0, achievementId: 'hours_50', description: '累计静修五十小时，云笺化作鹤纹衣。', color: '#b8d3d1', accent: '#527a88', shape: 'crane' },
    { id: 'head_stargaze', slot: 'head', name: '观星玉冠', price: 0, achievementId: 'hours_100', description: '累计静修一百小时，长夜求知自有星光。', color: '#7a6ba5', accent: '#f0dba3', shape: 'star' },
    { id: 'robe_eternal', slot: 'robe', name: '太初玄衣', price: 0, achievementId: 'hours_500', description: '累计静修五百小时，千卷积成太初之境。', color: '#465a72', accent: '#f1ce88', shape: 'celestial' },
    { id: 'head_dew', slot: 'head', name: '晨露竹冠', price: 0, achievementId: 'streak_7', description: '连续七日达标，晨露伴竹青。', color: '#91b89a', accent: '#f2e7b3', shape: 'bamboo' },
    { id: 'bottom_dawn', slot: 'bottom', name: '望舒流霞裳', price: 0, achievementId: 'streak_30', description: '连续三十日达标，月华与朝霞同在。', color: '#be9ba8', accent: '#f3dba7', shape: 'moon' },
    { id: 'accessory_everlight', slot: 'accessory', name: '长明琉璃灯', price: 0, achievementId: 'streak_100', description: '连续一百日达标，一盏长明照百日。', color: '#9aafce', accent: '#fff0bc', shape: 'lantern' }
  ];
  const ACHIEVEMENTS = [
    { id: 'hours_10', name: '初窥门径', description: '累计有效专注达到 10 小时。', kind: 'hours', threshold: 10, rewardItemId: 'accessory_inkjade' },
    { id: 'hours_50', name: '云笺有成', description: '累计有效专注达到 50 小时。', kind: 'hours', threshold: 50, rewardItemId: 'robe_cloudink' },
    { id: 'hours_100', name: '百时观星', description: '累计有效专注达到 100 小时。', kind: 'hours', threshold: 100, rewardItemId: 'head_stargaze' },
    { id: 'hours_500', name: '太初问道', description: '累计有效专注达到 500 小时。', kind: 'hours', threshold: 500, rewardItemId: 'robe_eternal' },
    { id: 'streak_7', name: '七日持心', description: '曾连续 7 日，每日有效专注至少 25 分钟。', kind: 'streak', threshold: 7, rewardItemId: 'head_dew' },
    { id: 'streak_30', name: '月满不辍', description: '曾连续 30 日，每日有效专注至少 25 分钟。', kind: 'streak', threshold: 30, rewardItemId: 'bottom_dawn' },
    { id: 'streak_100', name: '百日长明', description: '曾连续 100 日，每日有效专注至少 25 分钟。', kind: 'streak', threshold: 100, rewardItemId: 'accessory_everlight' }
  ];
  // 目录只认显式衣装编号，不能把 Object 原型属性误当成零价商品。
  const ITEM_MAP = Object.assign(Object.create(null), Object.fromEntries(ITEMS.map(item => [item.id, Object.freeze(item)])));
  const DEFAULT_EQUIPPED = Object.fromEntries(SLOTS.map(slot => [slot.id, slot.id + '_basic']));
  const DEFAULT_SETTINGS = {
    muted: true, volume: 0.3, soundscape: 'scene', keepAwake: true,
    pomodoroFocusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, roundsPerCycle: 4
  };
  const PAUSE_REASONS = {
    manual: '已暂歇，准备好后继续。', hidden: '已离开静修，计时暂停。',
    blur: '静修窗口已失去焦点，计时暂停。', leave: '已离开静修，进度已保留。',
    panel: '正在浏览面板，计时暂停。', scene: '切换场景后，请继续静修。',
    seat: '更换座位后，请继续静修。', restore: '已恢复上次进度，请点击继续静修。',
    other_tab: '另一页面正在静修，本页已暂停。', suspended: '检测到页面中断，已保留最近进度。',
    storage: '记录暂未保存，计时已暂停。'
  };
  global.SpiritFocusCatalog = Object.freeze({
    SCENES: Object.freeze(SCENES.map(Object.freeze)), SOUNDS: Object.freeze(SOUNDS.map(Object.freeze)), SLOTS: Object.freeze(SLOTS.map(Object.freeze)),
    ITEMS: Object.freeze(ITEMS), ITEM_MAP: Object.freeze(ITEM_MAP), ACHIEVEMENTS: Object.freeze(ACHIEVEMENTS.map(Object.freeze)),
    DEFAULT_EQUIPPED: Object.freeze(DEFAULT_EQUIPPED), DEFAULT_SETTINGS: Object.freeze(DEFAULT_SETTINGS),
    PAUSE_REASONS: Object.freeze(PAUSE_REASONS), getItem: id => ITEM_MAP[id] || null
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
