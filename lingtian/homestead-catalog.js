/* Shared cosmetic shop catalogue. Prices are resolved again on the server. */
(function (global) {
  'use strict';
  const scenery = [
    {
      id: 'lotusPond', name: '听荷莲池', cost: 1600, source: '灵石置办',
      description: '椭圆玉石池中，三朵浅荷浮在碧水上，细细涟漪映着一方闲景。',
      requirement: '花费 1,600 灵石置办后，可摆入庭院。',
      features: ['玉石池沿', '浅荷三朵', '碧水涟漪'],
      footprint: { width: 2.8, depth: 3.4 },
      preferredSpot: { x: 2, z: 8.5, rotation: 90 },
      palette: { primary: '#709c87', accent: '#d7bca5', soft: '#e7eddb' }
    },
    {
      id: 'moonArch', name: '照月景门', cost: 1800, source: '灵石置办',
      description: '温润白玉环起一轮圆月，细金嵌线与雕纹门座相映，留一道赏景的门。',
      requirement: '花费 1,800 灵石置办后，可摆入庭院。',
      features: ['玉环景门', '细金嵌线', '雕纹门座'],
      footprint: { width: 3.2, depth: 1.1 },
      preferredSpot: { x: -8.25, z: 0, rotation: 90 },
      palette: { primary: '#9da98b', accent: '#c5ac75', soft: '#f2eddb' }
    },
    {
      id: 'jadePavilion', name: '栖云亭', cost: 2400, source: '灵石置办',
      description: '双重青玉弧檐挑起暖金脊线，柱间围栏、石阶与茶案，等一位闲来听风的主人。',
      requirement: '花费 2,400 灵石置办后，可摆入庭院。',
      features: ['双重飞檐', '暖金脊线', '亭中茶案'],
      footprint: { width: 3, depth: 3.4 },
      preferredSpot: { x: -2, z: 8.5, rotation: 90 },
      palette: { primary: '#6c9480', accent: '#c5b985', soft: '#efe8d5' }
    },
    {
      id: 'blossomTree', name: '绯桃花树', cost: 900, source: '灵石置办',
      description: '粉桃与杏白花团压满枝头，树影轻柔，把一树春色留在自己的洞天。',
      requirement: '花费 900 灵石置办后，可摆入庭院。',
      features: ['粉桃花团', '错落枝干', '一树春色'],
      footprint: { width: 2.6, depth: 2.6 },
      preferredSpot: { x: 8.5, z: -3, rotation: 0 },
      palette: { primary: '#b77d72', accent: '#edc5b5', soft: '#f5e9df' }
    }
  ];
  // Every purchased tree has a permanent, whitelisted id. Existing v6 owned,
  // equipped and placement arrays can therefore keep each copy independently.
  const treeSpecies = [
    {
      id: 'verdantPine', name: '苍翠松', cost: 480, source: '灵石置办', repeatable: true, maxCopies: 6,
      description: '层层青针托起挺拔树冠，粗细错落的枝干，把四季常青的松意留在庭院。',
      requirement: '每棵 480 灵石，同一树种最多收藏 6 棵；每棵占 1 个小景位。',
      features: ['层叠松冠', '四季常青', '逐棵布置'],
      footprint: { width: 1.5, depth: 1.5 },
      palette: { primary: '#3d7752', accent: '#79a861', soft: '#c8dfab' }
    },
    {
      id: 'banyanTree', name: '青冠榕', cost: 640, source: '灵石置办', repeatable: true, maxCopies: 6,
      description: '圆润浓绿的树冠撑起一片清荫，分枝与短短气根相依，给洞天添一团蓬勃绿意。',
      requirement: '每棵 640 灵石，同一树种最多收藏 6 棵；每棵占 1 个小景位。',
      features: ['圆润榕冠', '分枝气根', '逐棵布置'],
      footprint: { width: 1.65, depth: 1.65 },
      palette: { primary: '#43864f', accent: '#84b869', soft: '#d2e4ad' }
    },
    {
      id: 'weepingWillow', name: '垂丝柳', cost: 560, source: '灵石置办', repeatable: true, maxCopies: 6,
      description: '细长柳丝从青碧枝头垂下，疏密有致的嫩叶，沿着田园小径留一抹轻柔树影。',
      requirement: '每棵 560 灵石，同一树种最多收藏 6 棵；每棵占 1 个小景位。',
      features: ['轻垂柳丝', '青碧嫩叶', '逐棵布置'],
      footprint: { width: 1.5, depth: 1.5 },
      palette: { primary: '#639c59', accent: '#9acb73', soft: '#dceab4' }
    }
  ];
  // These legal starting points fit beside the original fifteen decorations.
  // Saved positions always take priority; no previous object is moved to fit a tree.
  const treeSpots = {
    verdantPine: [[-10,-.25,0],[-10,-2,0],[-9.75,2.75,0],[-9.5,-4.5,45],[-9.25,4.75,0],[-7.75,-5.5,0]],
    banyanTree: [[9.25,.25,0],[10.25,-1.75,0],[9,-5,0],[8,6.5,0],[6.5,-8,0],[6,8,0]],
    weepingWillow: [[4.25,7.75,0],[4.25,9.5,0],[-2.75,9.75,0],[-5.5,7.75,0],[1,-10.5,0],[-7.5,7.5,45]]
  };
  for (const species of treeSpecies) for (let copyIndex = 1; copyIndex <= species.maxCopies; copyIndex++) {
    const [x, z, rotation] = treeSpots[species.id][copyIndex - 1];
    scenery.push({ ...species, id: species.id + (copyIndex === 1 ? '' : copyIndex),
      speciesId: species.id, speciesName: species.name, copyIndex, preferredSpot: { x, z, rotation } });
  }
  const residences = [
    {
      id: 'bambooResidence', name: '听雨竹舍', cost: 3800, title: '竹影山居',
      description: '低矮竹木坡顶、临风廊台与暖灯小窗，安放一处轻巧清幽的山中住所。',
      features: ['竹木坡顶', '开放廊台', '暖灯小窗'],
      palette: { primary: '#608269', accent: '#b4a173', soft: '#e8eddc' }
    },
    {
      id: 'mapleCourtyard', name: '枫庭雅院', cost: 6200, title: '枫庭合院',
      description: '朱木正屋与两侧厢房围出小院，暖瓦、枫影与回廊相连，藏一庭从容烟火。',
      features: ['三面合院', '朱木暖瓦', '枫影回廊'],
      palette: { primary: '#97634b', accent: '#cd9c62', soft: '#f1e5d3' }
    },
    {
      id: 'moonResidence', name: '望月水榭', cost: 8800, title: '临水望月',
      description: '水榭架在浅浅碧池之上，圆月窗与曲栏相对；倚廊看水，开窗见月。',
      features: ['临水高台', '圆月花窗', '曲栏长廊'],
      palette: { primary: '#648d8d', accent: '#beaf85', soft: '#e7eeea' }
    },
    {
      id: 'starResidence', name: '星河云邸', cost: 12800, title: '高阁观星',
      description: '高低相依的双层楼阁，青蓝屋檐缀着细金；顶层观星台把星河收进一方宅院。',
      features: ['错落双阁', '青蓝金檐', '楼顶星台'],
      palette: { primary: '#526f84', accent: '#bd9d5e', soft: '#e7ebe5' }
    }
  ];
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const sceneryMap = Object.assign(Object.create(null), Object.fromEntries(scenery.map(item => [item.id, item])));
  const residenceMap = Object.assign(Object.create(null), Object.fromEntries(residences.map(item => [item.id, item])));
  global.SpiritHomestead = freeze({
    version: 1, scenery, treeSpecies, residences, sceneryMap, residenceMap,
    residenceFootprint: { width: 4.4, depth: 4.4 },
    getScenery: id => typeof id === 'string' && Object.hasOwn(sceneryMap, id) ? sceneryMap[id] : null,
    getResidence: id => typeof id === 'string' && Object.hasOwn(residenceMap, id) ? residenceMap[id] : null
  });
})(typeof window !== 'undefined' ? window : globalThis);
