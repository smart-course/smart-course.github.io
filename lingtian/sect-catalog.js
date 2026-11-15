/* Four established schools. Shared by the browser, game engine and trusted server. */
(function (global) {
  'use strict';
  const requirements = {
    gate: [{ cropId: 'huangjing', target: 120 }, { cropId: 'zihou', target: 40 }],
    spring: [{ cropId: 'huangjing', target: 80 }, { cropId: 'tianling', target: 60 }],
    library: [{ cropId: 'zihou', target: 100 }, { cropId: 'yueyang', target: 80 }, { cropId: 'jiuqu', target: 30 }]
  };
  const decorationIds = { gate: 'sectGate', spring: 'sectSpring', library: 'sectLibrary' };
  function stage(id, name, description, features) {
    return { id, name, description, features, requirements: requirements[id].map(item => ({ ...item })), rewardDecoration: { id: decorationIds[id], name } };
  }
  const list = [
    {
      id: 'fengxia', name: '枫霞谷', emblem: '枫',
      motto: '不积跬步，无以至千里', source: '《荀子·劝学》', ethos: '勤修不辍',
      summary: '沿枫林石阶拾级而上，把每一次照料与修习，积成一山丰实。',
      displayClimate: '秋季 · 深谷枫林',
      atmosphere: { name: '枫叶流霞', description: '常驻深秋，层叠峭壁围出深谷，赤橙枫林沿崖铺展；晨昏与灯火随北京时间交替。', phases: {
        dawn: { name: '晓光映枫', description: '晨曦照亮高低错落的崖壁，枫林沿深谷伸向远山，朱木檐角接住一线暖光。' },
        day: { name: '枫叶流霞', description: '赤橙枫林铺在层叠崖壁之间，谷底与远岭分出深浅，枫叶随山风掠过朱木飞檐与石阶。' },
        dusk: { name: '晚枫归霞', description: '暮色渐入深谷，远近崖壁依次暗下，暖霞停在檐脊，石阶两侧的灯火陪枫叶归林。' },
        night: { name: '枫灯夜色', description: '深秋夜色笼住远山与谷底，暖灯照出朱木和石阶的轮廓，红叶随着山风旋落。' }
      } },
      palette: { primary: '#87503b', accent: '#ce8d50', soft: '#f5e8d4' },
      stages: [
        stage('gate', '积跬山门', '宽阔石阶托起三重朱木牌楼，金边飞檐与两侧低门层层呼应；枫叶随山风飘落，山路因坚持而渐远。', ['三重朱木牌楼', '叠檐斗拱', '枫叶流霞']),
        stage('spring', '勤耕梯圃', '同门依山修出三层药圃，以细渠逐层引水。每一方新绿，都是细心耕耘留下的痕迹。', ['阶梯药圃', '逐层水渠', '草木成行']),
        stage('library', '千里修业阁', '三重飞檐的修业主阁立在高台之上，格窗、书架与暖灯回廊层层展开，照见日积月累的成长。', ['三重修业主阁', '格窗藏卷', '暖灯长廊'])
      ]
    },
    {
      id: 'xuanyue', name: '玄月宗', emblem: '月',
      motto: '学而不思则罔，思而不学则殆', source: '《论语·为政》', ethos: '明辨深思',
      summary: '以月为镜，以书为引；在澄明与对照中，慢慢辨清事理。',
      displayClimate: '幽谷 · 前湖月门',
      atmosphere: { name: '月华映水', description: '山门立在略高的石台上，宽阔前湖连着青山与曲岸；风起时波光流动，小鱼偶尔跃水留下涟漪。', phases: {
        dawn: { name: '晓月清波', description: '晨光掠过前湖与曲岸，月色慢慢淡入天边，抬高的玉月门与层层青山倒映水中。' },
        day: { name: '清昼映水', description: '青山与月门映在宽阔前湖里，曲岸山石围出水湾；山风推起细浪，小鱼偶尔跃出水面。' },
        dusk: { name: '暮霭初灯', description: '天色沿前湖渐暗，山门高台的暖灯渐亮，水纹接着晚霞，细小萤光开始在岸边游走。' },
        night: { name: '月华流萤', description: '银色月光洒向前湖与庭院，流萤带着柔光轻舞，水光与偶起的涟漪映着玉月门。' }
      } },
      palette: { primary: '#506278', accent: '#b7aa80', soft: '#e9eceb' },
      stages: [
        stage('gate', '问思月门', '一轮高大的镂空玉月立在双座月楼之间，内外金边与缓行月华互相映照；温润灯火伴同门问学。', ['玉月高门', '双月门楼', '月华环流']),
        stage('spring', '澄心鉴池', '同心涟漪拂过如镜静水，半月石屏与倒影相照；池畔留出静坐思辨的位置。', ['月镜静池', '半月石屏', '同心涟漪']),
        stage('library', '明辨藏经阁', '两层环形书阁由十二根玉柱承托，中央月窗通明，两翼回廊的书架相对；读书与思考在高处相遇。', ['十二柱环廊', '双层月阁', '中央月窗'])
      ]
    },
    {
      id: 'lingxi', name: '灵犀山', emblem: '犀',
      motto: '独学而无友，则孤陋而寡闻', source: '《礼记·学记》', ethos: '同道切磋',
      summary: '两岸有桥，同门有伴；让不同的见闻在曲水与讲堂间相会。',
      displayClimate: '春季 · 层林青山',
      atmosphere: { name: '云鹤传书', description: '常驻春季，松、杉与阔叶春树层层环绕山门；嫩绿树冠之间露出曲水、花草与白鹤。', phases: {
        dawn: { name: '晨光新绿', description: '晨光依次照亮高低树冠，嫩叶与粉白花瓣显出春色，白鹤从层叠林木间轻掠曲水。' },
        day: { name: '春山和风', description: '松杉与阔叶春树围成疏密有致的山林，深檐和浅墙从绿意中露出，新叶与花瓣随山风轻扬。' },
        dusk: { name: '归鹤暮色', description: '晚霞轻染前后林冠，白鹤掠过渐暗的曲水，廊下灯火透过春树，为讲学堂添一份温暖。' },
        night: { name: '春山清梦', description: '春夜里远近树林层层相伴，山风携花瓣经过暖灯长廊，曲水从疏密树影之间流过。' }
      } },
      palette: { primary: '#446e59', accent: '#b59a60', soft: '#e8efdc' },
      stages: [
        stage('gate', '同道连桥门', '高低相望的双座竹木门亭由凌空连桥相接，台阶与回廊向两侧敞开，云鹤携卷穿过合抱飞檐。', ['高低双门亭', '凌空连桥', '云鹤传书']),
        stage('spring', '论道曲水庭', '弯曲水道穿过两岸竹石，围坐石凳与小桥相连，留一处可交流、可切磋的庭院。', ['曲水双岸', '围坐石凳', '竹间小桥']),
        stage('library', '会友讲学堂', '并列的双座大讲堂摆满共享书案，二层合抱屋檐与拱形金脊相连；开放的长廊让切磋与启发自然发生。', ['并列双讲堂', '二层共学廊', '共享书案'])
      ]
    },
      {
      id: 'xinglan', name: '星澜宫', emblem: '星',
      motto: '致广大而尽精微', source: '《礼记·中庸》', ethos: '博观约取',
      summary: '仰观星河，俯察毫末；在广阔视野中，把细微之处看得更清楚。',
      displayClimate: '云海 · 天上宫阙',
      atmosphere: { name: '星河环流', description: '清亮天空与柔白云海托起金檐玉台，远近宫阙随晨昏换色，入夜星河与流星映亮天际。', phases: {
        dawn: { name: '星退云开', description: '晨曦染亮柔白云沿，星光渐隐，金脊与玉阶在清亮天光中显出高低错落的宫阙。' },
        day: { name: '云海晴岚', description: '清亮天光铺过柔白云海，金檐与玉台浮在云层之间，远处宫阙沿天空层层展开。' },
        dusk: { name: '霞云初星', description: '晚霞从云海边缘缓缓退去，宫灯渐亮，星光与金色星轨开始映照高阁。' },
        night: { name: '星河环流', description: '深蓝夜空托起云海浮宫，点点星光交替闪烁，星轨缓缓流转，流星划过天际。' }
      } },
      palette: { primary: '#435f72', accent: '#b59c58', soft: '#e7ece8' },
      stages: [
        stage('gate', '星仪天门', '八角天门立于层叠星盘基座，两侧星碑高挑，檐顶浑天金环托起星辰；细密刻度让仰望也有尺度。', ['八角天门', '高挑星碑', '浑天金环']),
        stage('spring', '星河经纬台', '同心星盘与细密经纬铺在浅蓝台面，数道金环彼此交错，把辽阔星河缩成可细察的一方天地。', ['经纬刻度', '同心星盘', '交错金环']),
        stage('library', '精微观星阁', '高耸的八角观星主阁层层收束，顶端星仪与缓行金色星轨相伴；两侧观象台备有望筒与星图书案。', ['高耸八角主阁', '顶端星河环流', '两翼观象台'])
      ]
    }
  ];
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  const map = Object.assign(Object.create(null), Object.fromEntries(list.map(sect => [sect.id, sect])));
  // A catalogue is a plan, not a construction ledger. Only a server-backed
  // snapshot may turn its quantities into a real building phase. Clamp each
  // material separately so spare herbs can never stand in for missing ones.
  function constructionState(stage, authoritative = true) {
    const items = stage && Array.isArray(stage.requirements) ? stage.requirements : [];
    let target = items.reduce((sum, item) => sum + (item && Number.isFinite(item.target) && item.target > 0 ? item.target : 0), 0);
    let donated = 0, hasLedger = false;
    if (items.length) {
      hasLedger = items.every(item => item && Number.isFinite(item.target) && item.target >= 0 && Number.isFinite(item.donated));
      if (hasLedger) donated = items.reduce((sum, item) => sum + Math.max(0, Math.min(item.target, item.donated)), 0);
    } else if (stage && Number.isFinite(stage.targetUnits) && stage.targetUnits > 0 && Number.isFinite(stage.donatedUnits)) {
      target = stage.targetUnits;
      donated = Math.max(0, Math.min(target, stage.donatedUnits));
      hasLedger = true;
    }
    if (!authoritative || !stage) return { phase: 'preview', label: '规划预览', ratio: 0, percent: 0, donated: 0, target };
    // Preserve the older public DTO, which supplied an authoritative completed
    // flag before material quantities were included in public visits.
    if (stage.completed === true) return { phase: 'completed', label: '已竣工', ratio: 1, percent: 100, donated: target, target };
    if (!hasLedger || !(target > 0)) return { phase: 'preview', label: '规划预览', ratio: 0, percent: 0, donated: 0, target };
    const ratio = donated / target;
    const percent = ratio >= 1 ? 100 : Math.min(99.9, Math.round(ratio * 1000) / 10);
    const phase = ratio === 0 ? 'planned' : ratio < .25 ? 'foundation' : ratio < .6 ? 'framing' : ratio < .9 ? 'roofing' : 'finishing';
    const label = { planned: '待开工', foundation: '地基施工', framing: '梁柱搭建', roofing: '屋面成形', finishing: '装饰收尾' }[phase];
    return { phase, label, ratio, percent, donated, target };
  }
  global.SpiritSects = freeze({ version: 1, list, map, stageIds: ['gate', 'spring', 'library'], themeIds: list.map(sect => sect.id),
    constructionState,
    get(id) { return typeof id === 'string' && Object.hasOwn(map, id) ? map[id] : null; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
