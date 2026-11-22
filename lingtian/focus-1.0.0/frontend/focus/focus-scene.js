/* 静修室：立体模型与轻量绘制共用近正面镜头、席位、衣装和状态。 */
(function (global) {
  'use strict';

  // 两排书案前后错开，低俯视时前排人物不会正好挡住后排的脸。
  const SEATS = Object.freeze(Array.from({ length: 8 }, (_, id) => Object.freeze({
    id, x: [-4.65, -1.55, 1.55, 4.65][id % 4] + (id < 4 ? .2 : -.55), z: id < 4 ? -1.2 : 4.4
  })));
  const VIEW = Object.freeze({ yaw: 4 * Math.PI / 180, elevation: 28 * Math.PI / 180 });
  const VIEW_COS = Math.cos(VIEW.yaw), VIEW_SIN = Math.sin(VIEW.yaw);
  const VIEW_UP = Math.cos(VIEW.elevation), VIEW_DOWN = Math.sin(VIEW.elevation);
  const portraitSeats = spacing => Object.freeze(Array.from({ length: 8 }, (_, id) => Object.freeze({
    id, x: (id % 2 ? 2.8 : -2.8) + (Math.floor(id / 2) % 2 ? .15 : -.15), z: -1.2 + Math.floor(id / 2) * spacing
  })));
  const PORTRAIT_SEATS = portraitSeats(6.8);
  const NARROW_PORTRAIT_SEATS = Object.freeze(portraitSeats(11).map(seat => Object.freeze({ ...seat, x: seat.x * 1.35 })));
  const COMPACT_SEATS = Object.freeze(SEATS.map(seat => Object.freeze({ ...seat, x: seat.x * 3, z: seat.id < 4 ? -1.2 : 12 })));
  const SHORT_PORTRAIT_SEATS = Object.freeze(portraitSeats(18).map(seat => Object.freeze({ ...seat, x: seat.x * 3.2 })));
  const sortedSeats = seats => Object.freeze([...seats].sort((a, b) => (a.x - b.x) * VIEW_SIN + (a.z - b.z) * VIEW_COS));
  const WIDE_LAYOUT = Object.freeze({ id: 'wide', seats: SEATS, sorted: sortedSeats(SEATS), roomX: 1, roomZ: 1, roomOffsetZ: 0 });
  const COMPACT_LAYOUT = Object.freeze({ id: 'wide', compact: true, seats: COMPACT_SEATS, sorted: sortedSeats(COMPACT_SEATS), roomX: 1, roomZ: 1.12, roomOffsetZ: .5712 });
  const PORTRAIT_LAYOUT = Object.freeze({ id: 'portrait', seats: PORTRAIT_SEATS, sorted: sortedSeats(PORTRAIT_SEATS), roomX: .68, roomZ: 2.2, roomOffsetZ: 5.712 });
  const NARROW_PORTRAIT_LAYOUT = Object.freeze({ id: 'portrait', seats: NARROW_PORTRAIT_SEATS, sorted: sortedSeats(NARROW_PORTRAIT_SEATS), roomX: .68, roomZ: 2.4, roomOffsetZ: 6.664 });
  const SHORT_PORTRAIT_LAYOUT = Object.freeze({ id: 'portrait', seats: SHORT_PORTRAIT_SEATS, sorted: sortedSeats(SHORT_PORTRAIT_SEATS), roomX: .85, roomZ: 3.2, roomOffsetZ: 9.5 });
  const layoutFor = (width, height) => width <= 600 ? height < 500 ? SHORT_PORTRAIT_LAYOUT : width <= 360 ? NARROW_PORTRAIT_LAYOUT : PORTRAIT_LAYOUT : width > 720 && height <= 560 ? COMPACT_LAYOUT : WIDE_LAYOUT;
  const COLORS = {
    // 与灵田宅院共用青瓦、苔石、宣纸和温金的明暗关系。
    library: { sky: '#e8e5cd', mist: '#f3edda', wood: '#76573c', dark: '#354b3e', light: '#c9b77d', paper: '#ebe2c7', green: '#7d9863', teal: '#6c9480', wall: '#e0d5ad', glow: '#f5d292', stone: '#a8b59b', roof: '#6c9480', edge: '#456e60', floor: '#b8a279' },
    rain: { sky: '#dce6da', mist: '#e9e9d8', wood: '#6c573d', dark: '#314e41', light: '#c5b681', paper: '#e5e3cd', green: '#7a986b', teal: '#668e7a', wall: '#d8d9bb', glow: '#f3d193', stone: '#a2b3a0', roof: '#628b7b', edge: '#3f665a', floor: '#ada184' }
  };
  function furnitureColors(id) {
    return { ...COLORS[id], wood: id === 'rain' ? '#c5ad86' : '#c9aa79', dark: '#a9b69b', light: '#ead9af',
      paper: '#fff4dd', edge: '#7fa38b', mat: id === 'rain' ? '#e9eee0' : '#f4ead2' };
  }
  const DEFAULTS = {
    head: { color: '#6c9480', accent: '#c9b77d', shape: 'pin' },
    robe: { color: '#527b6b', accent: '#e5e3cd', shape: 'plain' },
    bottom: { color: '#d8d4b5', accent: '#9a946c', shape: 'plain' },
    accessory: { color: '#ac925e', accent: '#c9b77d', shape: 'knot' }
  };
  const CHARACTERS = Object.freeze([
    { id: 'jade', name: '玉衣书生', gender: 'male', skin: '#ead0b0', color: '#ead0b0', cream: '#f4e5c8', hair: '#293830', ear: '#c4a68d', blush: '#dfbba5', hairstyle: 'bun' },
    { id: 'peach', name: '桃衣剑修', gender: 'female', skin: '#efd2b8', color: '#efd2b8', cream: '#f7e8d2', hair: '#382e2b', ear: '#cba28e', blush: '#dfb3a4', hairstyle: 'long' },
    { id: 'cloud', name: '云岚丹师', gender: 'female', skin: '#ecd3b9', color: '#ecd3b9', cream: '#f4e8d3', hair: '#30333d', ear: '#c8a38e', blush: '#dfbbaa', hairstyle: 'double-bun' },
    { id: 'ink', name: '墨衣游侠', gender: 'male', skin: '#e4c4a5', color: '#e4c4a5', cream: '#f1dfc4', hair: '#263334', ear: '#bc947c', blush: '#d5ad96', hairstyle: 'ponytail' }
  ]);
  // 与头像共用稳定身份：改名、换席和网络状态变化都不会改变修士形象。
  function character(person) {
    const identity = String(person?.id || 'local:self');
    const avatarId = person?.avatarId || person?.identity?.avatarId || '';
    if (global.FocusCharacters?.getCharacter) return global.FocusCharacters.getCharacter({ id: identity, avatarId, gender: person?.gender || person?.identity?.gender });
    const selected = CHARACTERS.find(entry => entry.id === avatarId);
    if (selected) return selected;
    let hash = 2166136261;
    for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
    return CHARACTERS[(hash >>> 0) % CHARACTERS.length];
  }
  const statusText = { idle: '入席，写下今日所学', focus: '静修中', paused: '已暂停 · 合卷待续', rest: '品茗小憩', completed: '此番修习已成', ended: '本段进修已结束' };
  const compactStatus = { idle: '已入席', focus: '静修中', paused: '已暂停', rest: '小憩中', completed: '已完成', ended: '已结束' };
  const awayReasons = new Set(['hidden', 'blur', 'leave', 'module', 'panel']);
  const connectionReasons = new Set(['network', 'disconnected', 'connection']);
  function presenceLabel(status, reason) {
    if (status === 'paused') return awayReasons.has(reason) ? '切出暂停' : connectionReasons.has(reason) ? '连接暂停' : '已暂停';
    return { focus: '进修中', rest: '小憩中', completed: '已完成', ended: '已结束', idle: '待进修' }[status] || '待进修';
  }
  const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const finite = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const sceneId = value => value === 'rain' ? 'rain' : 'library';
  const seatId = value => Number.isInteger(value) && value >= 0 && value < 8 ? value : null;

  function normalizeInsets(value) {
    return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, Math.max(0, finite(value?.[side], 0))]));
  }
  function safeViewport(width, height, insets) {
    // 极矮横屏仍保留可操作的室内高度；安全区只由视口变化决定。
    const horizontal = Math.min(1, Math.max(0, width - Math.min(width, 240)) / (insets.left + insets.right || 1));
    const vertical = Math.min(1, Math.max(0, height - Math.min(height, 180)) / (insets.top + insets.bottom || 1));
    const left = insets.left * horizontal, top = insets.top * vertical;
    const right = width - insets.right * horizontal, bottom = height - insets.bottom * vertical;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  function fitViewport(width, height, insets) {
    const safe = safeViewport(width, height, insets), layout = layoutFor(width, height), portrait = layout.id === 'portrait';
    const nameSpace = width < 500 || layout.compact ? 68 : 94;
    // 八席的书案、人物与头顶文字必须留在安全区；飞檐和地板可以延伸至画面外。
    // 使用同一正交基，保证 Canvas 与 WebGL 的点击位置、标签位置完全一致。
    const seatColumns = layout.seats.map(seat => VIEW_COS * seat.x - VIEW_SIN * seat.z);
    const centreX = (Math.min(...seatColumns) + Math.max(...seatColumns)) / 2;
    const horizontalSpan = portrait ? 9.4 : layout.compact ? 34.8 : 14.2, nearTop = portrait ? -3.3 : -3.8;
    // 纵向四排按最末排实际投影取景，不能固定旧两排边界而裁掉末排人物。
    const nearBottom = Math.max(...layout.seats.map(seat => scenePoint(seat.x, .7, seat.z).y)) + .05;
    const scale = Math.max(.01, Math.min(safe.width / horizontalSpan, height / 8.6, (safe.height - nameSpace) / (nearBottom - nearTop)));
    return { safe, scale,
      ox: safe.left + safe.width / 2 - centreX * scale,
      oy: safe.top + nameSpace + (safe.height - nameSpace - (nearBottom - nearTop) * scale) / 2 - nearTop * scale };
  }
  function scenePoint(x, y, z) {
    return { x: VIEW_COS * x - VIEW_SIN * z, y: VIEW_DOWN * (VIEW_SIN * x + VIEW_COS * z) - VIEW_UP * y };
  }
  function illustration(person) {
    return global.FocusSprites?.get?.({ ...person, avatarId: character(person).id, clothes: person.clothes }) || null;
  }
  function watchIllustrations(callback) {
    let stopped = false;
    const notify = () => { if (!stopped) callback(); };
    const unsubscribe = global.FocusSprites?.onReady?.(notify);
    try {
      Promise.resolve(global.FocusSprites?.ready?.()).then(ready => { if (ready && !unsubscribe) notify(); }).catch(() => {});
    } catch (_) { /* 素材不可用时保留席位与文字，不启动旧角色或重复下载。 */ }
    return () => { stopped = true; if (typeof unsubscribe === 'function') unsubscribe(); };
  }

  function normalizeStatus(value, kind) {
    if (value === 'paused') return 'paused';
    if (value === 'cancelled' || value === 'ended') return 'ended';
    if (value === 'completed') return 'completed';
    if (value === 'rest' || value === 'resting' || value === 'break' || kind === 'break' && value === 'running') return 'rest';
    if (value === 'focus' || value === 'focusing' || value === 'running' || value === 'studying') return 'focus';
    return 'idle';
  }
  function outfit(value, catalog) {
    const result = {};
    Object.keys(DEFAULTS).forEach(slot => {
      const entry = typeof value?.[slot] === 'object' ? value[slot] : catalog?.getItem?.(value?.[slot]) || catalog?.ITEM_MAP?.[value?.[slot]];
      result[slot] = { ...DEFAULTS[slot], ...(entry || {}) };
    });
    return result;
  }
  function colorNumber(value) {
    return parseInt(String(value).replace('#', ''), 16) || 0x718879;
  }
  function mix(hex, target, amount) {
    const a = colorNumber(hex), b = colorNumber(target);
    const r = Math.round((a >> 16) * (1 - amount) + (b >> 16) * amount);
    const g = Math.round((a >> 8 & 255) * (1 - amount) + (b >> 8 & 255) * amount);
    const c = Math.round((a & 255) * (1 - amount) + (b & 255) * amount);
    return '#' + ((1 << 24) | r << 16 | g << 8 | c).toString(16).slice(1);
  }

  /* 所有贴图在场景建立时绘制一次，不下载外部图片，也不随倒计时重建。 */
  function drawLandscape(ctx, width, height, rainy) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, rainy ? '#bdcec4' : '#e9dcbc');
    sky.addColorStop(.65, rainy ? '#dce3d2' : '#f1e7ce');
    sky.addColorStop(1, rainy ? '#a5bba6' : '#bac6a1');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    if (!rainy) {
      const halo = ctx.createRadialGradient(width * .77, height * .27, 2, width * .77, height * .27, height * .22);
      halo.addColorStop(0, '#fff9dd'); halo.addColorStop(.55, '#fff1bf'); halo.addColorStop(1, 'rgba(255,239,191,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
    }
    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath(); ctx.moveTo(0, height);
      for (let step = 0; step <= 24; step++) {
        const x = step / 24 * width;
        const y = height * (.36 + layer * .115) - Math.sin(step * .48 + layer * 1.2) * height * (.12 - layer * .015) - Math.cos(step * .93 - layer) * height * .04;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height); ctx.closePath();
      ctx.fillStyle = rainy ? ['#9ab4a8', '#7e9c8c', '#618578', '#426e5d'][layer] : ['#b2bf9b', '#96ad85', '#79966e', '#5d805c'][layer];
      ctx.fill();
    }
    ctx.fillStyle = rainy ? 'rgba(226,235,216,.35)' : 'rgba(255,246,216,.38)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.ellipse(width * (.12 + i * .22), height * (.57 + i % 2 * .12), width * .26, height * .025, -.08, 0, Math.PI * 2); ctx.fill();
    }
    if (rainy) {
      ctx.strokeStyle = 'rgba(238,250,235,.32)'; ctx.lineWidth = 1;
      for (let i = 0; i < 55; i++) {
        const x = (i * 97 % width), y = (i * 53 % height);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 26); ctx.stroke();
      }
    }
  }

  function createWebGL(options, canvas) {
    const T = global.THREE;
    if (!T?.WebGLRenderer) return null;
    let renderer;
    try {
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' }) || canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context) return null;
      renderer = new T.WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (_) { return null; }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
    const scene = new T.Scene(), camera = new T.OrthographicCamera(-10, 10, 6, -6, .1, 240);
    camera.position.set(VIEW_SIN * VIEW_UP * 80, VIEW_DOWN * 80, VIEW_COS * VIEW_UP * 80); camera.lookAt(0, 0, 0);
    const environment = new T.Group(), furniture = new T.Group(), dynamic = new T.Group();
    scene.add(environment, furniture, dynamic);
    scene.add(new T.HemisphereLight(0xfff4de, 0x294e3b, 1.35));
    const sunlight = new T.DirectionalLight(0xffe9bf, 2.5); sunlight.position.set(-5, 14, 9); scene.add(sunlight);
    const fill = new T.DirectionalLight(0xc3d9d1, .35); fill.position.set(8, 5, -6); scene.add(fill);
    const geometries = new Map(), materials = new Map(), textures = new Set(), merged = new Set(), furnitureGeometries = new Set();
    const picks = [], labels = [], rainDrops = [], fireflies = [];
    const raycaster = new T.Raycaster(), pointer = new T.Vector2();
    const particleTransform = new T.Object3D();
    let rainBatch = null, fireflyBatch = null;
    let currentScene = '', webglDisposed = false, stopIllustrations = null;
    const avatars = new Map();
    const spriteSurfaces = new Map();
    let surfaceUse = 0;
    let width = 0, height = 0, pixelRatio = 0;
    let layout = layoutFor(options.initialWidth, options.initialHeight);
    canvas.dataset.focusLayout = layout.id;
    const material = (color, opacity = 1, extra) => {
      const key = color + ':' + opacity + ':' + JSON.stringify(extra || {});
      if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color: colorNumber(color), roughness: .94, metalness: 0, transparent: opacity < 1, opacity, ...extra }));
      return materials.get(key);
    };
    const geometry = (key, make) => {
      if (!geometries.has(key)) geometries.set(key, make());
      return geometries.get(key);
    };
    function mesh(g, m, parent, x, y, z) {
      const node = new T.Mesh(g, m); node.position.set(x || 0, y || 0, z || 0); parent.add(node); return node;
    }
    // 边缘只做细小倒角，保留木作与石阶的结构，不做糖果般的膨胀体块。
    function roundedBox(w, h, d) {
      const radius = Math.min(.055, w * .14, h * .17, d * .14);
      if (radius < .009) return new T.BoxGeometry(w, h, d);
      const g = new T.BoxGeometry(w, h, d, 2, 2, 2), position = g.attributes.position, normal = g.attributes.normal;
      const core = [w / 2 - radius, h / 2 - radius, d / 2 - radius];
      for (let i = 0; i < position.count; i++) {
        const point = [position.getX(i), position.getY(i), position.getZ(i)];
        const centre = point.map((value, axis) => clamp(value, -core[axis], core[axis]));
        const delta = point.map((value, axis) => value - centre[axis]);
        const length = Math.hypot(...delta) || 1;
        position.setXYZ(i, ...centre.map((value, axis) => value + delta[axis] / length * radius));
        normal.setXYZ(i, delta[0] / length, delta[1] / length, delta[2] / length);
      }
      return g;
    }
    const box = (parent, x, y, z, w, h, d, color, opacity) => mesh(geometry('rb:' + [w, h, d], () => roundedBox(w, h, d)), material(color, opacity), parent, x, y, z);
    const cylinder = (parent, x, y, z, rt, rb, h, color, sides = 10, opacity = 1) => mesh(geometry('c:' + [rt, rb, h, sides], () => new T.CylinderGeometry(rt, rb, h, sides)), material(color, opacity), parent, x, y, z);
    const sphere = (parent, x, y, z, radius, color, scale) => {
      const detail = radius <= .095 ? [10, 6] : radius <= .28 ? [12, 8] : [16, 10];
      const node = mesh(geometry('s:' + radius, () => new T.SphereGeometry(radius, ...detail)), material(color), parent, x, y, z);
      if (scale) node.scale.set(...scale); return node;
    };
    const torus = (parent, x, y, z, radius, tube, color) => mesh(geometry('t:' + [radius, tube], () => new T.TorusGeometry(radius, tube, radius > .8 ? 8 : 6, radius > .8 ? 40 : radius > .2 ? 24 : 16)), material(color), parent, x, y, z);
    function curve(parent, points, radius, color, segments = 6) {
      return mesh(geometry('curve:' + [radius, segments, ...points.flat()], () => new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), segments, radius, 4, false)), material(color), parent);
    }
    function beam(parent, from, to, radius, color) {
      const a = new T.Vector3(...from), b = new T.Vector3(...to), direction = b.clone().sub(a);
      const node = cylinder(parent, 0, 0, 0, radius * .88, radius, direction.length(), color, 7);
      node.position.copy(a.add(b).multiplyScalar(.5)); node.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); return node;
    }
    // 屋瓦沿曲面收向细脊，飞檐仅占后沿和侧沿，不遮住八张书案。
    function tiledRoof(parent, x, z, width, depth, y, rise, theme, turn = 0) {
      const group = new T.Group(); group.position.set(x, 0, z); group.rotation.y = turn; parent.add(group);
      const rows = 5, cols = Math.max(8, Math.round(width / .38));
      const point = (side, t, u, lift = 0) => [u * width / 2, y + rise * Math.pow(1 - t, 1.7) + rise * .16 * Math.pow(t, 5) + .1 * u * u * t + lift, side * t * depth / 2];
      const ribPositions = [], ribIndices = [];
      for (const side of [-1, 1]) {
        const positions = [], indices = [];
        for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) positions.push(...point(side, row / rows, col / cols * 2 - 1));
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
          const a = row * (cols + 1) + col, b = a + cols + 1; indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
        const g = geometry('roof:' + [width, depth, y, rise, side], () => {
          const result = new T.BufferGeometry(); result.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); result.setIndex(indices); result.computeVertexNormals(); return result;
        });
        mesh(g, material(theme.roof, 1, { side: T.DoubleSide, roughness: .68 }), group);
        // 瓦垄直接写入一个缓冲，避免为每根细瓦生成 TubeGeometry 和独立物体。
        for (let col = 1; col < cols; col++) for (let row = 0; row < 5; row++) {
          const u = col / cols * 2 - 1, half = .019 / width, a = ribPositions.length / 3;
          ribPositions.push(...point(side, row / 5, u - half, .02), ...point(side, row / 5, u + half, .02), ...point(side, (row + 1) / 5, u - half, .02), ...point(side, (row + 1) / 5, u + half, .02));
          ribIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        for (const u of [-1, 1]) curve(group, Array.from({ length: 6 }, (_, row) => point(side, row / 5, u, .02)), .022, theme.light, 5);
        curve(group, [-1, -.5, 0, .5, 1].map(u => point(side, 1, u, -.012)), .042, theme.edge, 8);
        for (const u of [-1, 1]) curve(group, [point(side, .74, u, .03), point(side, 1, u, .035), [u * (width / 2 + .12), y + .34, side * (depth / 2 + .1)]], .027, theme.light, 4);
      }
      const ribs = geometry('roof-ribs:' + [width, depth, y, rise], () => {
        const result = new T.BufferGeometry(); result.setAttribute('position', new T.Float32BufferAttribute(ribPositions, 3)); result.setIndex(ribIndices); result.computeVertexNormals(); return result;
      });
      mesh(ribs, material(mix(theme.roof, theme.paper, .22), 1, { side: T.DoubleSide, roughness: .68 }), group);
      curve(group, [[-width / 2 - .1, y + rise + .13, 0], [-width / 2, y + rise + .04, 0], [0, y + rise + .025, 0], [width / 2, y + rise + .04, 0], [width / 2 + .1, y + rise + .13, 0]], .046, theme.light, 8);
      return group;
    }
    function column(parent, x, z, height, theme) {
      box(parent, x, .17, z, .49, .28, .49, theme.stone);
      box(parent, x, .34, z, .37, .09, .37, theme.paper);
      cylinder(parent, x, .37 + (height - .37) / 2, z, .105, .13, height - .37, theme.wood, 10);
      box(parent, x, height - .13, z, .55, .13, .36, theme.wood);
      box(parent, x, height + .01, z, .37, .13, .63, theme.wood);
      for (const side of [-1, 1]) { const bracket = box(parent, x + side * .26, height - .19, z, .27, .09, .14, theme.light); bracket.rotation.z = side * .23; }
    }
    function rock(parent, x, y, z, scale, theme) {
      const node = mesh(geometry('garden-rock', () => new T.IcosahedronGeometry(1, 0)), material(theme.stone), parent, x, y, z);
      node.scale.set(...scale); node.rotation.set(.16, x * .47, -.11); return node;
    }
    function pine(parent, x, z, size, theme) {
      const group = new T.Group(); group.position.set(x, -.22, z); group.scale.setScalar(size); parent.add(group);
      rock(group, .13, .16, .05, [.53, .22, .4], theme);
      beam(group, [0, .12, 0], [-.1, 1.25, 0], .08, theme.wood);
      beam(group, [-.06, .55, 0], [-.48, .94, .03], .038, theme.wood);
      beam(group, [-.08, .87, 0], [.4, 1.34, -.04], .035, theme.wood);
      [[-.43, 1.0, .03, .43], [.35, 1.37, -.03, .48], [-.12, 1.64, 0, .4]].forEach(([xx, yy, zz, r], i) => {
        sphere(group, xx, yy, zz, r, [theme.edge, theme.green, theme.teal][i], [1.18, .34, .82]);
        sphere(group, xx - .09, yy + .06, zz + .02, r * .71, mix(theme.green, theme.paper, .13), [1.08, .23, .82]);
      });
    }
    function texture(width, height, draw) {
      const c = global.document.createElement('canvas'); c.width = width; c.height = height;
      const ctx = c.getContext('2d'); if (!ctx) return null; draw(ctx, width, height);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; textures.add(t); return t;
    }
    function texturedPlane(parent, x, y, z, w, h, map, color = '#ffffff') {
      if (!map) return null;
      const m = new T.MeshStandardMaterial({ color: colorNumber(color), map, roughness: 1, side: T.DoubleSide });
      materials.set('texture:' + materials.size, m);
      return mesh(geometry('p:' + [w, h], () => new T.PlaneGeometry(w, h)), m, parent, x, y, z);
    }
    function plaque(parent, text, x, y, z, w, h) {
      box(parent, x, y, z, w + .12, h + .1, .12, '#4a5945');
      box(parent, x, y, z + .07, w + .025, h + .025, .03, '#c9b77d');
      const map = texture(768, 168, ctx => {
        ctx.fillStyle = '#425e4c'; ctx.fillRect(0, 0, 768, 168);
        ctx.strokeStyle = '#c9b77d'; ctx.lineWidth = 5; ctx.strokeRect(14, 14, 740, 140);
        ctx.font = '500 94px "Songti SC", "Noto Serif CJK SC", serif'; ctx.fillStyle = '#e9dbad';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 384, 89, 660);
      });
      texturedPlane(parent, x, y, z + .09, w, h, map);
    }
    function lantern(parent, x, y, z, scale) {
      const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); parent.add(g);
      cylinder(g, 0, .47, 0, .018, .018, .6, '#796346', 6);
      const body = sphere(g, 0, 0, 0, .27, '#f5d292', [.82, 1.12, .82]);
      body.material = material('#f5d292', 1, { emissive: 0xd99443, emissiveIntensity: .13 });
      cylinder(g, 0, .25, 0, .15, .15, .045, '#8b764d', 10);
      cylinder(g, 0, -.25, 0, .15, .15, .045, '#8b764d', 10);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        cylinder(g, Math.cos(a) * .2, 0, Math.sin(a) * .2, .008, .008, .38, '#c5a56a', 5);
      }
      cylinder(g, 0, -.4, 0, .012, .022, .24, '#b77a51', 6);
      sphere(g, 0, -.54, 0, .034, '#c9b77d');
    }
    function bonsai(parent, x, z, scale, rainy) {
      const g = new T.Group(); g.position.set(x, .05, z); g.scale.setScalar(scale); parent.add(g);
      cylinder(g, 0, .16, 0, .35, .3, .24, rainy ? '#6b8e7c' : '#9b916b', 10);
      torus(g, 0, .28, 0, .345, .025, '#b8b995').rotation.x = Math.PI / 2;
      cylinder(g, 0, .55, 0, .035, .06, .63, '#786449', 7);
      const a = cylinder(g, .16, .79, 0, .024, .035, .45, '#786449', 6); a.rotation.z = -.6;
      [[-.18, 1.06, 0, .28], [.2, 1.14, -.04, .32], [0, 1.32, .01, .26], [.4, 1.21, .05, .19]].forEach((p, i) =>
        sphere(g, p[0], p[1] - .13, p[2], p[3], ['#587c58', '#7d9863', '#93a776', '#668b69'][i], [1.25, .33, .92]));
    }
    function bamboo(parent, x, z) {
      for (let stalk = 0; stalk < 3; stalk++) {
        const sx = x + (stalk - 1) * .2, sy = 1.15 + stalk % 2 * .27;
        const stem = cylinder(parent, sx, sy, z - stalk * .03, .029, .035, sy * 2, '#819660', 7);
        stem.rotation.z = (stalk - 1) * -.08;
        for (let j = 0; j < 4; j++) {
          const y = .5 + j * .45;
          cylinder(parent, sx, y, z, .04, .04, .028, '#b8bd88', 8);
          for (let side = -1; side <= 1; side += 2) {
            const leaf = mesh(geometry('bamboo-leaf', () => new T.SphereGeometry(.18, 6, 4)), material(j % 2 ? '#71915b' : '#9bab73'), parent, sx + side * .17, y + .1, z);
            leaf.scale.set(1.8, .13, .34);
            leaf.rotation.z = side * .3;
          }
        }
      }
    }
    function shelf(parent, x, z, w, theme) {
      box(parent, x, 1.85, z - .23, w, 3.7, .22, '#443f2f');
      [-1, 1].forEach(sign => box(parent, x + sign * w * .5, 1.9, z, .14, 3.9, .65, theme.wood));
      for (let row = 0; row < 5; row++) {
        const y = .25 + row * .76; box(parent, x, y, z, w + .14, .12, .68, theme.wood);
        box(parent, x, y + .055, z + .345, w + .13, .025, .03, theme.light);
        if (row === 4) continue;
        const colors = ['#688169', '#aa8c57', '#456e60', '#9b7154', '#7a8264', '#bcb38b'];
        for (let i = 0; i < 12; i++) {
          const bx = x - w * .43 + i * w * .078;
          const h = .43 + (i * 7 + row * 3) % 5 * .038, bw = .22 + i % 3 * .025;
          const book = box(parent, bx, y + .06 + h * .5, z + .03, bw, h, .33, colors[(i + row * 2) % colors.length]);
          if (i % 7 === 1) book.rotation.z = .14;
          box(parent, bx, y + .27, z + .205, bw * .43, .18, .014, theme.paper);
        }
      }
      box(parent, x, 3.85, z, w + .35, .15, .81, theme.wood);
      box(parent, x, 3.95, z, w + .49, .045, .88, theme.light);
    }
    function desk(parent, seat, theme, rainy) {
      const { x, z, id } = seat;
      // 桌面下的浅影是固定几何，避免移动端实时阴影贴图。
      const shadow = cylinder(parent, x, .017, z, .94, .94, .01, '#6b5b40', 20, .11);
      shadow.scale.z = .64;
      [-1, 1].forEach(side => {
        for (const dz of [-.35, .35]) cylinder(parent, x + side * .64, .36, z + dz, .065, .075, .68, theme.wood, 10);
        box(parent, x + side * .64, .17, z, .08, .065, .7, theme.light);
      });
      box(parent, x, .69, z, 1.72, .08, 1.02, theme.wood);
      box(parent, x, .75, z, 1.88, .15, 1.12, theme.wood);
      box(parent, x, .834, z, 1.66, .012, .92, theme.mat);
      box(parent, x, .71, z + .565, 1.62, .025, .018, theme.edge);
      cylinder(parent, x, .15, z - .9, .39, .42, .17, theme.edge, 16);
      cylinder(parent, x, .245, z - .9, .34, .36, .035, '#9bab7f', 16);
      // 纸页、书签、砚台和杯盏让每席都有已经备好的学习材料。
      // 书页靠近席位前缘，与元婴修士短臂和真实持笔骨骼的位置一致。
      box(parent, x - .11, .845, z - .335, .59, .02, .43, theme.paper);
      box(parent, x - .115, .859, z - .335, .014, .009, .43, '#d9c7ae');
      for (let l = 0; l < 3; l++) box(parent, x - .21, .863, z - .425 + l * .07, .11, .008, .009, '#bebba9');
      box(parent, x + .36, .86, z - .18, .21, .055, .25, theme.edge);
      box(parent, x + .36, .896, z - .18, .17, .014, .21, theme.paper);
      cylinder(parent, x + .62, .9, z + .17, .09, .067, .13, '#7e9b7b', 12);
      cylinder(parent, x + .62, .971, z + .17, .067, .067, .008, '#b5a18e', 12);
      const ink = cylinder(parent, x - .64, .865, z - .2, .09, .1, .035, '#41534b', 10); ink.scale.z = .7;
      const brush = cylinder(parent, x - .58, .89, z, .009, .011, .34, '#b6a18d', 6); brush.rotation.x = Math.PI / 2; brush.rotation.z = -.5;
      // 手机旋转只重排家具；桌号贴图和材质继续复用，不随旋转累积。
      const badgeKey = 'badge:' + id;
      if (!materials.has(badgeKey)) {
        const badge = texture(96, 96, ctx => {
          ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(48, 48, 40, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#d4bea3'; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = '#658778'; ctx.font = '600 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id + 1), 48, 50);
        });
        if (badge) materials.set(badgeKey, new T.SpriteMaterial({ map: badge, depthTest: true, transparent: true }));
      }
      if (materials.has(badgeKey)) {
        const sprite = new T.Sprite(materials.get(badgeKey)); sprite.position.set(x, .63, z + .65); sprite.scale.set(.39, .39, 1); parent.add(sprite); labels.push(sprite);
      }
      const hit = box(dynamic, x, .7, z - .16, 2.06, 1.7, 2.03, '#ffffff', 0);
      hit.material = material('#ffffff', 0, { depthWrite: false }); hit.userData.focusSeatId = id; hit.visible = false; picks.push(hit);
    }
    function clearEnvironment() {
      avatars.forEach(entry => { entry.alive = false; releaseSurface(entry); });
      environment.clear(); furniture.clear(); dynamic.clear();
      environment.scale.set(1, 1, 1); environment.position.set(0, 0, 0);
      rainBatch?.dispose?.(); fireflyBatch?.dispose?.(); rainBatch = fireflyBatch = null;
      picks.length = labels.length = rainDrops.length = fireflies.length = 0;
      geometries.forEach(g => g.dispose()); geometries.clear(); merged.forEach(g => g.dispose()); merged.clear();
      furnitureGeometries.clear();
      materials.forEach(m => m.dispose()); materials.clear(); textures.forEach(t => t.dispose()); textures.clear();
      avatars.clear(); reportIllustrations();
    }
    /* 直接读取共享几何写入最终缓冲，避免先展开、克隆、再复制数百份临时几何。 */
    function mergeNodes(root, excluded, owned, opaqueOnly) {
      root.updateWorldMatrix(true, true);
      const inverse = root === environment ? null : root.matrixWorld.clone().invert();
      const batches = new Map(), remove = [];
      root.traverse(node => {
        if (!node.isMesh || node.isSkinnedMesh || Array.isArray(node.material) || node.material.map || opaqueOnly && node.material.opacity < 1) return;
        if (excluded) for (let parent = node; parent && parent !== root; parent = parent.parent) if (excluded.has(parent)) return;
        const transform = inverse ? inverse.clone().multiply(node.matrixWorld) : node.matrixWorld;
        if (!batches.has(node.material)) batches.set(node.material, []);
        batches.get(node.material).push({ source: node.geometry, transform }); remove.push(node);
      });
      remove.forEach(node => node.parent?.remove(node));
      const point = new T.Vector3(), normal = new T.Vector3(), normalMatrix = new T.Matrix3();
      batches.forEach((list, m) => {
        const count = list.reduce((total, item) => total + (item.source.index?.count || item.source.attributes.position.count), 0);
        const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
        let offset = 0;
        list.forEach(({ source, transform }) => {
          const position = source.attributes.position, surfaceNormal = source.attributes.normal, index = source.index;
          const count = index?.count || position.count;
          normalMatrix.getNormalMatrix(transform);
          for (let i = 0; i < count; i++) {
            const vertex = index ? index.getX(i) : i;
            point.fromBufferAttribute(position, vertex).applyMatrix4(transform);
            normal.fromBufferAttribute(surfaceNormal, vertex).applyNormalMatrix(normalMatrix);
            positions[offset] = point.x; normals[offset++] = normal.x;
            positions[offset] = point.y; normals[offset++] = normal.y;
            positions[offset] = point.z; normals[offset++] = normal.z;
          }
        });
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
        geometry.computeBoundingSphere(); merged.add(geometry); owned?.add(geometry); root.add(new T.Mesh(geometry, m));
      });
    }
    function mergeStatic() { mergeNodes(environment, null, null, true); }
    function buildFurniture() {
      // 家具保留真实尺寸，只有手机竖屏改成两列四排；换向不触碰人物或会话。
      furniture.clear(); picks.forEach(node => node.removeFromParent()); picks.length = labels.length = 0;
      furnitureGeometries.forEach(geometry => { geometry.dispose(); merged.delete(geometry); }); furnitureGeometries.clear();
      layout.seats.forEach(seat => desk(furniture, seat, furnitureColors(currentScene), currentScene === 'rain'));
      mergeNodes(furniture, null, furnitureGeometries, true);
    }
    function placeRoom() {
      environment.scale.set(layout.roomX, 1, layout.roomZ); environment.position.z = layout.roomOffsetZ;
    }
    function setLayout(next) {
      if (layout === next) return;
      layout = next; canvas.dataset.focusLayout = layout.id; placeRoom();
      if (currentScene) buildFurniture();
      avatars.forEach(entry => {
        const seat = layout.seats[entry.person.seatId]; entry.node.position.set(seat.x, .23, seat.z - .91);
      });
    }
    function build(id) {
      clearEnvironment(); currentScene = id;
      const rainy = id === 'rain', p = COLORS[id];
      sunlight.color.set(rainy ? '#e0e9da' : '#ffe9bf');
      sunlight.intensity = rainy ? 2.05 : 2.5;
      // 精绘环境在画布后方单独缓存；桌案、人物与拾取仍保留真实空间关系。
      if (options.illustratedRoom) { buildFurniture(); return; }
      // 把墙面与木地面接到视口边缘，不再让整个书院悬浮在透明背景上。
      box(environment, 0, -.09, 24, 80, .04, 58, p.floor);
      box(environment, 0, 15, -5.03, 80, 30, .18, p.wall);
      box(environment, 0, .55, -4.91, 80, .72, .08, mix(p.wood, p.wall, .14));
      for (let i = -27; i <= 27; i++) box(environment, i * .754, -.064, 24, .012, .006, 58, mix(p.floor, p.wood, .2));
      // 薄石台、木地板与庭园构成灵田宅院中的一处开放书院。
      box(environment, 0, -.38, 0, 14.65, .28, 10.05, p.edge);
      box(environment, 0, -.19, 0, 14.45, .22, 9.95, p.stone);
      box(environment, 0, -.065, 0, 14.22, .06, 9.72, p.paper);
      for (let i = 0; i < 19; i++) box(environment, -6.78 + i * .754, .04, 0, .738, .12, 9.64, [p.floor, mix(p.floor, p.paper, .1), mix(p.floor, p.wood, .1)][i % 3]);
      [-1, 1].forEach(side => {
        box(environment, side * 7, .11, 0, .17, .08, 9.8, p.wood);
        box(environment, 0, .11, side * 4.82, 14.1, .08, .17, p.wood);
        box(environment, 0, -.15, side * 4.97, 14.45, .035, .024, p.light);
      });
      box(environment, 0, 2.27, -4.76, 14.1, 4.45, .22, p.wall);
      box(environment, 0, .56, -4.58, 14, .7, .13, p.wood);
      box(environment, 0, 1.0, -4.51, 14, .07, .18, p.light);
      // 侧廊保留矮墙、格扇和通风的空隙，不用整片高墙围住席位。
      box(environment, -7, .57, -.1, .22, .95, 9.3, p.wall);
      box(environment, -6.99, 1.08, -.1, .28, .1, 9.45, p.wood);
      for (const z of [-2.92, .18, 3.27]) {
        box(environment, -7.04, 2.55, z, .055, 2.7, 2.13, mix(p.paper, p.green, .1));
        for (const dz of [-1.04, 0, 1.04]) box(environment, -6.96, 2.55, z + dz, .07, 2.78, .055, p.wood);
        for (const y of [1.2, 2.1, 3.0, 3.9]) box(environment, -6.94, y, z, .09, .045, 2.14, p.wood);
        for (const dz of [-.52, .52]) box(environment, -6.93, 3.43, z + dz, .08, .83, .025, p.light);
      }
      [-6.9, 0, 6.9].forEach(x => column(environment, x, -4.48, 4.45, p));
      [-.05, 4.38].forEach(z => column(environment, -6.9, z, 4.08, p));
      box(environment, 0, 4.49, -4.52, 14.45, .22, .42, p.wood);
      box(environment, 0, 4.61, -4.51, 14.6, .045, .49, p.light);
      box(environment, -7, 4.12, -.1, .42, .19, 9.5, p.wood);
      tiledRoof(environment, -7, -.1, 9.55, 1.04, 4.17, .34, p, Math.PI / 2);
      tiledRoof(environment, 0, -4.67, 14.9, 1.6, 4.63, .55, p);
      if (rainy) {
        const map = texture(1024, 512, (ctx, w, h) => drawLandscape(ctx, w, h, true));
        texturedPlane(environment, 2.7, 2.67, -4.61, 7.53, 2.65, map);
        [-1.15, 2.7, 6.55].forEach(x => box(environment, x, 2.67, -4.47, .11, 2.8, .13, p.wood));
        [1.3, 2.0, 3.4, 4.03].forEach(y => box(environment, 2.7, y, -4.47, 7.8, .075, .14, p.wood));
        for (let i = 0; i < 12; i++) box(environment, -.96 + i * .67, 3.71, -4.4, .026, .56, .035, p.light);
        box(environment, 2.7, 1.21, -4.39, 8, .16, .55, p.wood);
        plaque(environment, '听 雨 轩', 2.7, 4.25, -4.27, 2.0, .38);
        const cabinet = new T.Group(); environment.add(cabinet);
        box(cabinet, -4, 1.19, -4.1, 4.4, 2.12, .83, p.dark);
        [0, 1, 2].forEach(r => {
          box(cabinet, -4, .27 + r * .95, -3.85, 4.55, .12, 1.02, p.wood);
          box(cabinet, -4, .33 + r * .95, -3.33, 4.48, .026, .035, p.light);
          if (r < 2) for (let c = 0; c < 5; c++) {
            const x = -5.6 + c * .8, y = .57 + r * .95;
            cylinder(cabinet, x, y, -3.66, .14, .2, .4, c % 2 ? p.teal : '#b9aa7e', 12);
            cylinder(cabinet, x, y + .23, -3.66, .16, .16, .04, p.light, 12);
          }
        });
        plaque(environment, '一盏清茶 · 半卷闲书', -4, 3.11, -4.25, 3.35, .4);
        bamboo(environment, 6.04, -4.2); bamboo(environment, -.69, -4.2);
        // 雨丝仍然批量绘制，静态竹帘只构建一次。
        rainBatch = new T.InstancedMesh(geometry('rain-batch', () => new T.BoxGeometry(.012, 1, .009)), material('#e8f6df', .5), 30);
        rainBatch.frustumCulled = false; rainBatch.instanceMatrix.setUsage(T.DynamicDrawUsage); dynamic.add(rainBatch);
        for (let i = 0; i < 30; i++) rainDrops.push({ x: -.9 + i * .241, height: .14 + i % 3 * .035, seed: i * .173 % 2.7 });
        for (let i = 0; i < 7; i++) box(environment, -4, 3.85 + i * .047, -4.25, 4.5, .025, .08, i % 2 ? '#92966a' : '#b1ac79');
      } else {
        shelf(environment, -3.8, -4.17, 5.36, p);
        plaque(environment, '藏 经 阁', -3.8, 4.25, -3.95, 1.9, .38);
        const map = texture(512, 512, (ctx, w, h) => drawLandscape(ctx, w, h, false));
        const windowDisk = texturedPlane(environment, 3.38, 2.78, -4.61, 3.0, 3.0, map);
        if (windowDisk) windowDisk.geometry = geometry('window-circle', () => new T.CircleGeometry(1.5, 40));
        torus(environment, 3.38, 2.78, -4.46, 1.56, .085, p.wood);
        torus(environment, 3.38, 2.78, -4.33, 1.49, .021, p.light);
        box(environment, 3.38, 2.78, -4.28, .045, 2.87, .07, p.wood);
        box(environment, 3.38, 2.54, -4.28, 2.85, .045, .07, p.wood);
        box(environment, 3.38, 1.15, -4.2, 3.6, .13, .59, p.wood);
        for (let i = 0; i < 3; i++) {
          const roll = cylinder(environment, 2.3 + i * .28, 1.3, -4.12, .075, .075, .44, p.paper, 10);
          roll.rotation.z = Math.PI / 2; roll.rotation.y = .2;
        }
        bonsai(environment, 5.14, -4.02, .78, false);
      }
      [-4.8, 0, 4.8].forEach(x => lantern(environment, x, 3.52, -3.05, .82));
      buildFurniture();
      // 少量松石与竹景放在外缘，席位、人物及昵称前方始终留白。
      box(environment, -7.33, -.28, 3.49, 1.65, .13, 2.5, p.stone);
      box(environment, 7.33, -.28, 3.36, 1.65, .13, 2.65, p.stone);
      pine(environment, -7.46, 3.68, 1.12, p);
      rock(environment, -7.72, -.01, 2.58, [.38, .31, .42], p);
      rock(environment, 7.49, -.02, 3.65, [.55, .32, .38], p);
      const gardenBamboo = new T.Group(); gardenBamboo.position.set(7.45, -.22, 2.65); gardenBamboo.scale.setScalar(.72); environment.add(gardenBamboo); bamboo(gardenBamboo, 0, 0);
      box(environment, 0, -.17, 5.06, 3.65, .2, .7, p.paper);
      box(environment, 0, -.32, 5.51, 4.05, .12, .5, p.stone);
      box(environment, 0, -.42, 5.87, 4.38, .09, .31, p.edge);
      for (const x of [-1.25, 0, 1.25]) box(environment, x, -.06, 5.09, .014, .01, .61, p.stone);
      fireflyBatch = new T.InstancedMesh(geometry('s:' + .025, () => new T.SphereGeometry(.025, 10, 6)), material('#e8d39a'), 10);
      fireflyBatch.frustumCulled = false; fireflyBatch.instanceMatrix.setUsage(T.DynamicDrawUsage); dynamic.add(fireflyBatch);
      for (let i = 0; i < 10; i++) fireflies.push({ x: Math.sin(i * 2.5) * 6.2, y: .5 + i % 4 * .61, z: Math.cos(i * 1.7) * 3.5 });
      mergeStatic(); placeRoom();
    }
    function disposeSurface(surface) {
      surface.body.dispose(); surface.hands.dispose(); surface.bodyMap.dispose(); surface.handsMap.dispose();
    }
    function trimSurfaces() {
      // 最多保留十二套外观；在座八人的共享贴图始终受引用保护。
      while (spriteSurfaces.size > 12) {
        const candidate = [...spriteSurfaces.values()].filter(surface => surface.users === 0).sort((a, b) => a.used - b.used)[0];
        if (!candidate) break;
        spriteSurfaces.delete(candidate.key); disposeSurface(candidate);
      }
    }
    function releaseSurface(entry) {
      if (!entry.surface) return;
      entry.surface.users--; entry.surface.used = ++surfaceUse; entry.surface = null; trimSurfaces();
    }
    function retainSurface(frame) {
      let surface = spriteSurfaces.get(frame.key);
      if (!surface) {
        const makeMap = source => {
          const map = new T.CanvasTexture(source); map.colorSpace = T.SRGBColorSpace;
          map.minFilter = T.LinearFilter; map.magFilter = T.LinearFilter; map.generateMipmaps = false;
          return map;
        };
        const bodyMap = makeMap(frame.body), handsMap = makeMap(frame.hands);
        const makeMaterial = map => new T.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, alphaTest: .06,
          depthTest: true, depthWrite: true, toneMapped: false, side: T.DoubleSide });
        surface = { key: frame.key, bodyMap, handsMap, body: makeMaterial(bodyMap), hands: makeMaterial(handsMap), users: 0, used: 0 };
        spriteSurfaces.set(frame.key, surface);
      }
      surface.users++; surface.used = ++surfaceUse; trimSurfaces(); return surface;
    }
    function positionIllustration(entry, frame) {
      const height = finite(frame.worldHeight, 1.78), width = height * finite(frame.width, 512) / finite(frame.height, 512);
      const tip = frame.penTip || frame.handAnchor || [.59, .88];
      const right = new T.Vector3(VIEW_COS, 0, -VIEW_SIN), up = new T.Vector3(-VIEW_DOWN * VIEW_SIN, VIEW_UP, -VIEW_DOWN * VIEW_COS);
      const normal = new T.Vector3(VIEW_SIN * VIEW_UP, VIEW_DOWN, VIEW_COS * VIEW_UP);
      // 笔尖精确落在纸页上。两层屏幕坐标相同，只沿视线分开深度；桌前沿仍能遮住衣袖。
      const centre = new T.Vector3(-.11, .65, .575).addScaledVector(right, (.5 - tip[0]) * width).addScaledVector(up, (tip[1] - .5) * height);
      entry.parts.body.position.copy(centre).addScaledVector(normal, -.3);
      entry.parts.hands.position.copy(centre).addScaledVector(normal, .02);
      for (const node of [entry.parts.body, entry.parts.hands]) { node.scale.set(width, height, 1); node.quaternion.copy(camera.quaternion); }
    }
    function syncIllustration(entry) {
      const frame = illustration(entry.person); if (!frame || !frame.body || !frame.hands) return;
      if (entry.surface?.key === frame.key) return;
      releaseSurface(entry); entry.surface = retainSurface(frame); entry.frame = frame;
      const plane = geometry('illustrated-avatar-plane', () => new T.PlaneGeometry(1, 1));
      if (!entry.parts.body) {
        entry.parts.body = new T.Mesh(plane, entry.surface.body); entry.parts.hands = new T.Mesh(plane, entry.surface.hands);
        entry.parts.body.userData.focusSpriteLayer = 'body'; entry.parts.hands.userData.focusSpriteLayer = 'hands';
        entry.node.add(entry.parts.body, entry.parts.hands);
      } else { entry.parts.body.material = entry.surface.body; entry.parts.hands.material = entry.surface.hands; }
      positionIllustration(entry, frame); entry.node.userData.focusSpriteKey = frame.key;
      entry.node.userData.focusRepresentation = 'illustrated';
    }
    function removeAvatar(entry) {
      entry.alive = false; releaseSurface(entry); dynamic.remove(entry.node);
    }
    function reportIllustrations() {
      canvas.dataset.focusSpriteCount = String([...avatars.values()].filter(entry => entry.alive && entry.surface).length);
      canvas.dataset.focusAvatarCount = String(avatars.size); canvas.dataset.focusRepresentation = 'illustrated';
    }
    function onIllustrationsReady() {
      if (webglDisposed) return;
      avatars.forEach(syncIllustration); reportIllustrations(); options.onInvalidate?.();
    }
    function buildAvatar(person) {
      const seat = layout.seats[person.seatId], g = new T.Group();
      g.position.set(seat.x, .23, seat.z - .91); dynamic.add(g);
      g.userData.focusParticipantId = person.id; g.userData.focusCharacterId = character(person).id;
      g.userData.focusRepresentation = 'illustrated';
      const ring = torus(g, 0, -.18, 0, .49, .025, '#dfcaa0'); ring.rotation.x = -Math.PI / 2; ring.visible = person.isSelf;
      const closedBook = new T.Group(); closedBook.position.set(-.11, .65, .575); g.add(closedBook);
      box(closedBook, 0, 0, 0, .63, .065, .46, '#527b6b'); box(closedBook, -.23, .04, 0, .035, .015, .43, '#eddbb3'); closedBook.visible = false;
      const entry = { node: g, parts: { ring, closedBook, body: null, hands: null }, person, surface: null, frame: null, alive: true, appearance: JSON.stringify(person.clothes) };
      syncIllustration(entry); return entry;
    }
    function update(value) {
      if (value.sceneId !== currentScene) build(value.sceneId);
      const wanted = new Set(value.people.map(person => person.id));
      avatars.forEach((entry, id) => { if (!wanted.has(id)) { removeAvatar(entry); avatars.delete(id); } });
      value.people.forEach(person => {
        let entry = avatars.get(person.id);
        const appearance = JSON.stringify(person.clothes);
        // 选择新头像只替换这一位同修；其余人物、房间和镜头保留。
        if (entry && entry.node.userData.focusCharacterId !== character(person).id) {
          removeAvatar(entry); avatars.delete(person.id); entry = null;
        }
        if (!entry) {
          entry = buildAvatar(person); avatars.set(person.id, entry);
        }
        // 换席只移动现有角色；状态、昵称、倒计时均不重建角色或房间。
        const seat = layout.seats[person.seatId];
        entry.node.position.set(seat.x, .23, seat.z - .91); entry.person = person;
        entry.parts.ring.visible = person.isSelf;
        entry.appearance = appearance; syncIllustration(entry);
      });
      reportIllustrations();
    }
    function resize(w, h, ratio, insets) {
      setLayout(layoutFor(w, h));
      const nextRatio = Math.min(1.6, ratio);
      if (width !== w || height !== h || pixelRatio !== nextRatio) {
        width = w; height = h; pixelRatio = nextRatio; renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h, false);
      }
      const fit = fitViewport(w, h, insets);
      camera.left = -fit.ox / fit.scale; camera.right = (w - fit.ox) / fit.scale;
      camera.top = fit.oy / fit.scale; camera.bottom = (fit.oy - h) / fit.scale;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    }
    function animate(time, state, reduce) {
      const t = reduce ? 0 : time * .001;
      avatars.forEach(entry => {
        const avatar = entry.node, parts = entry.parts, status = entry.person.status;
        const phase = t + entry.person.seatId * .67;
        avatar.position.y = .23 + (reduce || status === 'paused' || status === 'completed' || status === 'ended' ? 0 : Math.sin(phase * (status === 'rest' ? .8 : 1.65)) * .009);
        parts.closedBook.visible = status === 'paused' || status === 'completed' || status === 'ended';
      });
      particleTransform.rotation.set(0, 0, -.13);
      rainDrops.forEach((drop, i) => {
        // 雨丝位于窗景与木格之间，完整落在窗洞内，不落到屋里的书案上。
        particleTransform.position.set(drop.x * layout.roomX, 1.49 + (drop.seed + 6 - t * (1.2 + i % 3 * .13) % 2.32) % 2.32, -4.54 * layout.roomZ + layout.roomOffsetZ);
        particleTransform.scale.set(1, drop.height, 1); particleTransform.updateMatrix(); rainBatch.setMatrixAt(i, particleTransform.matrix);
      });
      if (rainBatch) rainBatch.instanceMatrix.needsUpdate = true;
      particleTransform.rotation.set(0, 0, 0); particleTransform.scale.set(1, 1, 1);
      fireflies.forEach((base, i) => {
        particleTransform.position.set((base.x + Math.sin(t * .21 + i) * .12) * layout.roomX, base.y + Math.sin(t * .39 + i) * .11, base.z * layout.roomZ + layout.roomOffsetZ);
        particleTransform.updateMatrix(); fireflyBatch.setMatrixAt(i, particleTransform.matrix);
      });
      if (fireflyBatch) fireflyBatch.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    }
    function projectSeat(id, above = false) {
      const seat = layout.seats[id]; if (!seat) return null;
      const p = new T.Vector3(seat.x, above ? layout.id === 'portrait' || layout.compact ? 2.47 : 2.38 : .7, seat.z - (above ? .91 : 0)).project(camera);
      return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height };
    }
    function pick(x, y) {
      pointer.set(x / width * 2 - 1, -(y / height) * 2 + 1);
      scene.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(picks, false)[0];
      return hit ? hit.object.userData.focusSeatId : null;
    }
    reportIllustrations();
    return {
      type: 'webgl', update, resize, render: animate, projectSeat, pick,
      getIllustrationFrame(id) { return avatars.get(id)?.frame || null; },
      startAssets() { if (!stopIllustrations) stopIllustrations = watchIllustrations(onIllustrationsReady); },
      isAnimated() { return avatars.size > 0 || rainDrops.length > 0 || fireflies.length > 0; },
      destroy() {
        webglDisposed = true; stopIllustrations?.(); clearEnvironment();
        spriteSurfaces.forEach(disposeSurface); spriteSurfaces.clear();
        delete canvas.dataset.focusSpriteCount; delete canvas.dataset.focusAvatarCount; delete canvas.dataset.focusRepresentation;
        renderer.dispose(); renderer.forceContextLoss?.();
      }
    };
  }

  /* 兼容绘制保留层次、席位和换装，用离屏缓存承载静态景物。 */
  function createCanvas(options, canvas) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    const background = global.document.createElement('canvas'), bg = background.getContext('2d');
    if (!bg) return null;
    let width = 0, height = 0, ratio = 0, scale = 1, ox = 0, oy = 0, currentScene = '', cached = false;
    let layout = layoutFor(options.initialWidth, options.initialHeight), roomProjection = false;
    canvas.dataset.focusLayout = layout.id;
    let state = { sceneId: 'library', seatId: null, clothes: outfit(), people: [] };
    let occupants = new Map();
    let canvasDisposed = false, stopIllustrations = null;
    const illustrationFrames = new Map();
    const deskLayers = new Map();
    function clearDeskLayers() { deskLayers.forEach(layer => { layer.canvas.width = layer.canvas.height = 1; }); deskLayers.clear(); }
    const project = (x, y, z) => {
      const point = scenePoint(roomProjection ? x * layout.roomX : x, y, roomProjection ? z * layout.roomZ + layout.roomOffsetZ : z);
      return { x: ox + point.x * scale, y: oy + point.y * scale };
    };
    function polygon(c, points, color, stroke) {
      // 近正面投影仍保留微圆角与柔和明暗，兼容模式不退回尖锐积木。
      const corners = points.map((point, i) => {
        const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
        const before = Math.hypot(previous.x - point.x, previous.y - point.y), after = Math.hypot(next.x - point.x, next.y - point.y);
        const radius = Math.min(scale * .08, before * .18, after * .18);
        return { point, a: { x: point.x + (previous.x - point.x) * radius / (before || 1), y: point.y + (previous.y - point.y) * radius / (before || 1) }, b: { x: point.x + (next.x - point.x) * radius / (after || 1), y: point.y + (next.y - point.y) * radius / (after || 1) } };
      });
      c.beginPath();
      corners.forEach(({ point, a, b }, i) => { i ? c.lineTo(a.x, a.y) : c.moveTo(a.x, a.y); c.quadraticCurveTo(point.x, point.y, b.x, b.y); });
      c.closePath(); c.fillStyle = color; c.fill();
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = .6; c.stroke(); }
    }
    function box(c, x, y, z, w, h, d, color) {
      const a = project(x - w / 2, y + h / 2, z - d / 2), b = project(x + w / 2, y + h / 2, z - d / 2);
      const e = project(x + w / 2, y + h / 2, z + d / 2), f = project(x - w / 2, y + h / 2, z + d / 2);
      const bb = project(x + w / 2, y - h / 2, z - d / 2), ee = project(x + w / 2, y - h / 2, z + d / 2), ff = project(x - w / 2, y - h / 2, z + d / 2);
      polygon(c, [b, bb, ee, e], mix(color, '#2f4938', .23));
      polygon(c, [f, e, ee, ff], mix(color, '#4e5d43', .13));
      polygon(c, [a, b, e, f], mix(color, '#f3ead0', .1));
    }
    function ellipse(c, x, y, rx, ry, color, rotation = 0) {
      c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    }
    function ball(c, p, radius, color) {
      const g = c.createRadialGradient(p.x - radius * .3, p.y - radius * .45, radius * .05, p.x, p.y, radius);
      g.addColorStop(0, mix(color, '#f6e9d0', .16)); g.addColorStop(1, mix(color, '#445543', .15));
      ellipse(c, p.x, p.y, radius, radius, g);
    }
    function line(c, a, b, color, width) {
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.stroke();
    }
    function softEllipse(c, x, y, rx, ry, color, rotation = 0) {
      const radius = Math.max(rx, ry), gradient = c.createRadialGradient(x - rx * .32, y - ry * .4, radius * .03, x, y, radius);
      gradient.addColorStop(0, mix(color, '#f3ead0', .15)); gradient.addColorStop(.65, color); gradient.addColorStop(1, mix(color, '#395642', .17));
      ellipse(c, x, y, rx, ry, gradient, rotation);
    }
    function plant(c, x, z, size) {
      const pot = project(x, .28 * size, z);
      softEllipse(c, pot.x, pot.y, scale * .33 * size, scale * .16 * size, '#81906e');
      ellipse(c, pot.x, pot.y - scale * .12 * size, scale * .32 * size, scale * .07 * size, '#b1b28b');
      line(c, project(x, .36 * size, z), project(x + .05, 1.14 * size, z), '#796648', scale * .055 * size);
      for (let i = 0; i < 5; i++) {
        const q = project(x + Math.sin(i * 2) * .3 * size, (1.14 + Math.cos(i) * .17) * size, z + Math.cos(i * 2) * .16);
        softEllipse(c, q.x, q.y, scale * .29 * size, scale * .1 * size, ['#5a7d58', '#7d9863', '#95a875'][i % 3], -.13);
      }
    }
    function roof(c, x, z, width, depth, y, rise, theme, turn = 0) {
      const cols = Math.max(8, Math.round(width / .38));
      const point = (side, t, u, lift = 0) => {
        const xx = u * width / 2, zz = side * t * depth / 2;
        return project(x + xx * Math.cos(turn) + zz * Math.sin(turn), y + rise * Math.pow(1 - t, 1.7) + rise * .16 * Math.pow(t, 5) + .1 * u * u * t + lift, z - xx * Math.sin(turn) + zz * Math.cos(turn));
      };
      for (const side of [-1, 1]) {
        for (let row = 0; row < 5; row++) for (let col = 0; col < cols; col++) {
          const a = col / cols * 2 - 1, b = (col + 1) / cols * 2 - 1;
          const points = [point(side, row / 5, a), point(side, row / 5, b), point(side, (row + 1) / 5, b), point(side, (row + 1) / 5, a)];
          c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
          c.fillStyle = mix(theme.roof, side < 0 ? theme.edge : theme.paper, side < 0 ? .17 + col % 2 * .05 : .04 + col % 2 * .06); c.fill();
        }
        for (let col = 0; col <= cols; col++) {
          const u = col / cols * 2 - 1;
          for (let row = 0; row < 5; row++) line(c, point(side, row / 5, u, .015), point(side, (row + 1) / 5, u, .015), col === 0 || col === cols ? theme.light : mix(theme.roof, theme.paper, .27), scale * .025);
        }
        for (let i = 0; i < 8; i++) line(c, point(side, 1, -1 + i / 4), point(side, 1, -1 + (i + 1) / 4), theme.edge, scale * .08);
        for (const u of [-1, 1]) {
          const a = point(side, .72, u, .025), b = point(side, 1, u, .03), tip = { x: b.x + u * scale * .12, y: b.y - scale * .13 };
          c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(b.x, b.y + scale * .025, tip.x, tip.y); c.strokeStyle = theme.light; c.lineWidth = scale * .055; c.stroke();
        }
      }
      line(c, point(1, 0, -1), point(1, 0, 1), theme.light, scale * .075);
    }
    function pillar(c, x, z, height, theme) {
      box(c, x, .17, z, .49, .28, .49, theme.stone);
      box(c, x, .34, z, .37, .09, .37, theme.paper);
      box(c, x, .37 + (height - .37) / 2, z, .22, height - .37, .22, theme.wood);
      box(c, x, height - .13, z, .55, .13, .36, theme.wood);
      box(c, x, height + .01, z, .37, .13, .63, theme.wood);
      for (const sign of [-1, 1]) line(c, project(x + sign * .12, height - .32, z + .06), project(x + sign * .39, height - .19, z + .06), theme.light, scale * .06);
    }
    function gardenRock(c, x, z, size, theme) {
      const points = [[-.54, .03, -.14], [-.26, .4, -.18], [.22, .5, -.09], [.52, .13, .17], [.15, -.03, .3], [-.47, -.02, .22]].map(([xx, yy, zz]) => project(x + xx * size, -.16 + yy * size, z + zz * size));
      polygon(c, points, theme.stone);
      polygon(c, [points[1], points[2], points[3], project(x - .07 * size, .07 * size, z + .13 * size)], mix(theme.stone, theme.paper, .14));
      polygon(c, [points[0], points[1], project(x - .07 * size, .07 * size, z + .13 * size), points[5]], mix(theme.stone, theme.edge, .2));
    }
    function gardenPine(c, x, z, size, theme) {
      gardenRock(c, x + .08, z + .02, size, theme);
      const branch = (a, b, radius) => line(c, project(x + a[0] * size, -.22 + a[1] * size, z + a[2] * size), project(x + b[0] * size, -.22 + b[1] * size, z + b[2] * size), theme.wood, scale * radius * size);
      branch([0, .12, 0], [-.1, 1.54, 0], .11);
      branch([-.06, .55, 0], [-.48, .99, .03], .065); branch([-.08, .87, 0], [.4, 1.35, -.04], .055);
      [[-.43, 1.0, .03, .43], [.35, 1.37, -.03, .48], [-.12, 1.64, 0, .4]].forEach(([xx, yy, zz, r], i) => {
        const q = project(x + xx * size, -.22 + yy * size, z + zz * size);
        softEllipse(c, q.x, q.y, scale * r * size * 1.18, scale * r * size * .32, [theme.edge, theme.green, theme.teal][i]);
        ellipse(c, q.x - scale * r * .12, q.y - scale * r * .1, scale * r * size * .75, scale * r * size * .13, mix(theme.green, theme.paper, .17));
      });
    }
    function gardenBamboo(c, x, z, size, theme, base = -.22) {
      for (let stalk = 0; stalk < 3; stalk++) {
        const sx = x + (stalk - 1) * .18 * size, h = (2.2 + stalk % 2 * .5) * size;
        line(c, project(sx, base, z), project(sx + (stalk - 1) * .08, h + base, z), '#819660', scale * .045 * size);
        for (let j = 0; j < 4; j++) {
          const y = (.5 + j * .45) * size + base;
          line(c, project(sx - .035, y, z), project(sx + .035, y, z), '#bcc18e', scale * .025);
          for (const side of [-1, 1]) {
            const tip = project(sx + side * .24 * size, y + .16 * size, z);
            line(c, project(sx, y, z), tip, theme.edge, scale * .014);
            ellipse(c, tip.x, tip.y, scale * .23 * size, scale * .032 * size, j % 2 ? theme.green : '#9baa73', side * -.5);
          }
        }
      }
    }
    function drawWindow(c, x, y, z, w, h, rainy) {
      const a = project(x - w / 2, y + h / 2, z), b = project(x + w / 2, y + h / 2, z), d = project(x - w / 2, y - h / 2, z);
      const palette = COLORS[state.sceneId];
      c.save(); c.transform((b.x - a.x) / 512, (b.y - a.y) / 512, (d.x - a.x) / 256, (d.y - a.y) / 256, a.x, a.y);
      const outline = () => {
        c.beginPath();
        if (rainy) {
          c.moveTo(26, 5); c.lineTo(486, 5); c.quadraticCurveTo(507, 5, 507, 26); c.lineTo(507, 230); c.quadraticCurveTo(507, 251, 486, 251); c.lineTo(26, 251); c.quadraticCurveTo(5, 251, 5, 230); c.lineTo(5, 26); c.quadraticCurveTo(5, 5, 26, 5);
        } else c.ellipse(256, 128, 248, 120, 0, 0, Math.PI * 2);
        c.closePath();
      };
      c.save(); outline(); c.clip(); drawLandscape(c, 512, 256, rainy); c.restore();
      outline(); c.strokeStyle = palette.dark; c.lineWidth = 12; c.stroke();
      outline(); c.strokeStyle = palette.light; c.lineWidth = 4; c.stroke();
      c.strokeStyle = palette.wood; c.lineWidth = 7; c.lineCap = 'round';
      c.beginPath(); c.moveTo(256, 11); c.lineTo(256, 245); c.moveTo(15, 135); c.lineTo(497, 135); c.stroke();
      c.restore();
      box(c, x, y - h / 2 - .09, z + .12, w + .28, .15, .42, palette.light);
    }
    function drawStatic() {
      roomProjection = true;
      bg.setTransform(ratio, 0, 0, ratio, 0, 0); bg.clearRect(0, 0, width, height);
      if (options.illustratedRoom) { cached = true; roomProjection = false; return; }
      const p = COLORS[state.sceneId], rainy = state.sceneId === 'rain';
      // 延展背景也只绘制进静态缓存，宽屏和竖屏都能看到连续的室内空间。
      box(bg, 0, -.09, 24, 80, .04, 58, p.floor);
      box(bg, 0, 15, -5.03, 80, 30, .18, p.wall);
      box(bg, 0, .55, -4.91, 80, .72, .08, mix(p.wood, p.wall, .14));
      for (let i = -27; i <= 27; i++) line(bg, project(i * .754, -.06, -5), project(i * .754, -.06, 53), mix(p.floor, p.wood, .2), Math.max(.35, scale * .012));
      const shadow = project(0, -.6, .5);
      ellipse(bg, shadow.x, shadow.y + scale * .24, scale * 8.35, scale * 2.43, 'rgba(56,78,49,.13)', .02);
      box(bg, 0, -.38, 0, 14.65, .28, 10.05, p.edge);
      box(bg, 0, -.19, 0, 14.45, .22, 9.95, p.stone);
      box(bg, 0, -.065, 0, 14.22, .06, 9.72, p.paper);
      for (let i = 0; i < 19; i++) {
        const x = -6.78 + i * .754;
        box(bg, x, .04, 0, .738, .12, 9.64, [p.floor, mix(p.floor, p.paper, .1), mix(p.floor, p.wood, .1)][i % 3]);
        for (const z of [-2.6 + i % 3 * .19, 1.4 + i % 2 * .27]) line(bg, project(x - .18, .105, z - .66), project(x - .18, .105, z + .73), mix(p.floor, p.wood, .24), Math.max(.35, scale * .012));
      }
      for (const side of [-1, 1]) {
        box(bg, side * 7, .11, 0, .17, .08, 9.8, p.wood);
        box(bg, 0, .11, side * 4.82, 14.1, .08, .17, p.wood);
        line(bg, project(-7.1, -.15, side * 4.97), project(7.1, -.15, side * 4.97), p.light, scale * .025);
      }
      box(bg, 0, 2.27, -4.76, 14.1, 4.45, .22, p.wall);
      box(bg, 0, .56, -4.58, 14, .7, .13, p.wood);
      box(bg, 0, 1.0, -4.51, 14, .07, .18, p.light);
      box(bg, -7, .57, -.1, .22, .95, 9.3, p.wall);
      box(bg, -6.99, 1.08, -.1, .28, .1, 9.45, p.wood);
      for (const z of [-2.92, .18, 3.27]) {
        box(bg, -7.04, 2.55, z, .055, 2.7, 2.13, mix(p.paper, p.green, .1));
        for (const dz of [-1.04, 0, 1.04]) box(bg, -6.96, 2.55, z + dz, .07, 2.78, .055, p.wood);
        for (const y of [1.2, 2.1, 3.0, 3.9]) box(bg, -6.94, y, z, .09, .045, 2.14, p.wood);
        for (const dz of [-.52, .52]) box(bg, -6.93, 3.43, z + dz, .08, .83, .025, p.light);
      }
      [-6.9, 0, 6.9].forEach(x => pillar(bg, x, -4.48, 4.45, p));
      [-.05, 4.38].forEach(z => pillar(bg, -6.9, z, 4.08, p));
      if (rainy) {
        drawWindow(bg, 2.7, 2.67, -4.61, 7.53, 2.65, true);
        for (const x of [-1.15, 2.7, 6.55]) box(bg, x, 2.67, -4.42, .1, 2.8, .1, p.wood);
        for (let i = 0; i < 12; i++) box(bg, -.96 + i * .67, 3.71, -4.39, .025, .56, .035, p.light);
        box(bg, -4, 1.19, -4.1, 4.4, 2.12, .83, p.dark);
        for (let row = 0; row < 3; row++) {
          box(bg, -4, .27 + row * .95, -3.85, 4.55, .12, 1.02, p.wood);
          box(bg, -4, .33 + row * .95, -3.33, 4.48, .026, .035, p.light);
          if (row < 2) for (let i = 0; i < 5; i++) {
            const q = project(-5.6 + i * .8, .57 + row * .95, -3.66);
            softEllipse(bg, q.x, q.y, scale * .17, scale * .22, i % 2 ? p.teal : '#b9aa7e');
            ellipse(bg, q.x, q.y - scale * .21, scale * .155, scale * .035, p.light);
          }
        }
        gardenBamboo(bg, 6.04, -4.2, 1, p, .06); gardenBamboo(bg, -.69, -4.2, .9, p, .06);
        for (let i = 0; i < 7; i++) box(bg, -4, 3.85 + i * .047, -4.25, 4.5, .025, .08, i % 2 ? '#92966a' : '#b1ac79');
        const teaSign = project(-4, 3.11, -4.08);
        bg.save(); bg.translate(teaSign.x, teaSign.y); bg.rotate(Math.atan2(VIEW_DOWN * VIEW_SIN, VIEW_COS)); bg.fillStyle = p.dark; bg.fillRect(-scale * 1.67, -scale * .2, scale * 3.35, scale * .4);
        bg.fillStyle = p.paper; bg.font = '500 ' + Math.max(8, scale * .17) + 'px "Songti SC", "Noto Serif CJK SC", serif'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText('一盏清茶 · 半卷闲书', 0, 0); bg.restore();
      } else {
        box(bg, -3.8, 1.85, -4.4, 5.36, 3.7, .22, '#443f2f');
        for (const side of [-1, 1]) box(bg, -3.8 + side * 2.68, 1.9, -4.17, .14, 3.9, .65, p.wood);
        const books = ['#688169', '#aa8c57', '#456e60', '#9b7154', '#7a8264', '#bcb38b'];
        for (let row = 0; row < 5; row++) {
          const y = .25 + row * .76;
          box(bg, -3.8, y, -4.17, 5.5, .12, .68, p.wood);
          box(bg, -3.8, y + .055, -3.825, 5.49, .025, .03, p.light);
          if (row === 4) continue;
          for (let i = 0; i < 12; i++) {
            const x = -6.105 + i * .418, h = .43 + (i * 7 + row * 3) % 5 * .038, w = .22 + i % 3 * .025;
            box(bg, x, y + .06 + h * .5, -4.14, w, h, .33, books[(i + row * 2) % books.length]);
            box(bg, x, y + .27, -3.965, w * .43, .18, .014, p.paper);
          }
        }
        box(bg, -3.8, 3.85, -4.17, 5.71, .15, .81, p.wood);
        box(bg, -3.8, 3.95, -4.17, 5.85, .045, .88, p.light);
        drawWindow(bg, 3.38, 2.78, -4.59, 3.15, 3.15, false);
        plant(bg, 5.14, -4.02, .78);
        for (let i = 0; i < 3; i++) box(bg, 2.3 + i * .28, 1.3, -4.12, .44, .11, .14, p.paper);
      }
      const plaque = project(rainy ? 2.7 : -3.8, 4.25, -4.0);
      bg.save(); bg.translate(plaque.x, plaque.y); bg.rotate(Math.atan2(VIEW_DOWN * VIEW_SIN, VIEW_COS));
      bg.fillStyle = p.dark; bg.fillRect(-scale * 1.07, -scale * .25, scale * 2.14, scale * .5);
      bg.strokeStyle = p.light; bg.lineWidth = scale * .028; bg.strokeRect(-scale * .99, -scale * .19, scale * 1.98, scale * .38);
      bg.fillStyle = '#e9dbad'; bg.textAlign = 'center'; bg.textBaseline = 'middle';
      bg.font = '500 ' + Math.max(10, scale * .26) + 'px "Songti SC", "Noto Serif CJK SC", serif'; bg.fillText(rainy ? '听 雨 轩' : '藏 经 阁', 0, .5); bg.restore();
      box(bg, -7, 4.12, -.1, .42, .19, 9.5, p.wood);
      roof(bg, -7, -.1, 9.55, 1.04, 4.17, .34, p, Math.PI / 2);
      box(bg, 0, 4.49, -4.52, 14.45, .22, .42, p.wood);
      box(bg, 0, 4.61, -4.51, 14.6, .045, .49, p.light);
      roof(bg, 0, -4.67, 14.9, 1.6, 4.63, .55, p);
      [-4.8, 0, 4.8].forEach(x => {
        const q = project(x, 3.52, -3.05);
        line(bg, project(x, 4.2, -3.05), q, '#796346', scale * .014);
        const glow = bg.createRadialGradient(q.x, q.y, scale * .07, q.x, q.y, scale * .43);
        glow.addColorStop(0, 'rgba(244,205,123,.22)'); glow.addColorStop(1, 'rgba(244,205,123,0)');
        ellipse(bg, q.x, q.y, scale * .43, scale * .43, glow);
        softEllipse(bg, q.x, q.y, scale * .18, scale * .25, '#f5d292');
        for (const dy of [-.2, .2]) line(bg, { x: q.x - scale * .11, y: q.y + scale * dy }, { x: q.x + scale * .11, y: q.y + scale * dy }, '#8b764d', scale * .035);
        line(bg, { x: q.x, y: q.y + scale * .25 }, { x: q.x, y: q.y + scale * .41 }, '#b77a51', scale * .018);
      });
      box(bg, -7.33, -.28, 3.49, 1.65, .13, 2.5, p.stone);
      box(bg, 7.33, -.28, 3.36, 1.65, .13, 2.65, p.stone);
      gardenPine(bg, -7.46, 3.68, 1.12, p); gardenRock(bg, -7.72, 2.58, .8, p);
      gardenRock(bg, 7.49, 3.65, 1.06, p); gardenBamboo(bg, 7.45, 2.65, .72, p);
      box(bg, 0, -.17, 5.06, 3.65, .2, .7, p.paper);
      box(bg, 0, -.32, 5.51, 4.05, .12, .5, p.stone);
      box(bg, 0, -.42, 5.87, 4.38, .09, .31, p.edge);
      for (const x of [-1.25, 0, 1.25]) line(bg, project(x, -.06, 4.79), project(x, -.06, 5.39), p.stone, scale * .015);
      cached = true; roomProjection = false;
    }
    function drawAvatar(c, seat, person, time, reduce, front = false) {
      const frame = illustrationFrames.get(person.id); if (!frame) return;
      const phase = time * .001 + seat.id * .67;
      const breath = reduce || person.status === 'paused' || person.status === 'completed' || person.status === 'ended' ? 0 : Math.sin(phase * (person.status === 'rest' ? .8 : 1.65)) * .009;
      const tip = frame.penTip || frame.handAnchor || [.59, .88], p = project(seat.x - .11, .88 + breath, seat.z - .335);
      const h = finite(frame.worldHeight, 1.78) * scale, w = h * finite(frame.width, 512) / finite(frame.height, 512);
      c.save();
      if (front) {
        // 前层只覆盖桌面，不越过桌前沿；身体和手仍使用完全相同的像素位置。
        const a = project(seat.x - 2, .825, seat.z + .56), b = project(seat.x + 2, .825, seat.z + .56);
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b.x, -height); c.lineTo(a.x, -height); c.closePath(); c.clip();
      }
      c.drawImage(front ? frame.hands : frame.body, p.x - tip[0] * w, p.y - tip[1] * h, w, h);
      c.restore();
    }
    function drawDeskTop(c, seat, selected, closedBook) {
      const p = furnitureColors(state.sceneId);
      const shadow = project(seat.x, .02, seat.z);
      ellipse(c, shadow.x, shadow.y, scale * 1.0, scale * .29, 'rgba(107,91,64,.11)');
      [-1, 1].forEach(sign => {
        for (const dz of [-.35, .35]) box(c, seat.x + sign * .64, .36, seat.z + dz, .13, .68, .13, p.wood);
        box(c, seat.x + sign * .64, .17, seat.z, .08, .065, .7, p.light);
      });
      box(c, seat.x, .69, seat.z, 1.72, .08, 1.02, p.wood);
      box(c, seat.x, .75, seat.z, 1.88, .15, 1.12, p.wood);
      box(c, seat.x, .834, seat.z, 1.66, .012, .92, p.mat);
      box(c, seat.x, .71, seat.z + .565, 1.62, .025, .018, p.edge);
      box(c, seat.x - .11, .845, seat.z - .335, .59, .02, .43, closedBook ? p.edge : p.paper);
      if (!closedBook) {
        box(c, seat.x - .115, .859, seat.z - .335, .014, .009, .43, '#c5b990');
        for (let l = 0; l < 3; l++) line(c, project(seat.x - .265, .864, seat.z - .425 + l * .07), project(seat.x - .155, .864, seat.z - .425 + l * .07), '#8c9475', Math.max(.3, scale * .009));
      }
      box(c, seat.x + .36, .86, seat.z - .18, .21, .055, .25, p.edge);
      box(c, seat.x + .36, .896, seat.z - .18, .17, .014, .21, p.paper);
      const cup = project(seat.x + .65, 1.02, seat.z + .18);
      softEllipse(c, cup.x, cup.y, scale * .08, scale * .065, '#7e9b7b');
      ellipse(c, cup.x, cup.y - scale * .025, scale * .065, scale * .023, '#7d704f');
      const ink = project(seat.x - .64, .87, seat.z - .2); ellipse(c, ink.x, ink.y, scale * .08, scale * .04, '#41534b');
      const badge = project(seat.x, .61, seat.z + .65);
      ellipse(c, badge.x, badge.y, scale * .145, scale * .145, selected ? '#527b6b' : '#e5d8b4');
      c.fillStyle = selected ? '#f4ead1' : '#526649'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 ' + Math.max(9, scale * .19) + 'px sans-serif'; c.fillText(String(seat.id + 1), badge.x, badge.y + .5);
    }
    function drawDesk(c, seat, time, reduce) {
      const person = occupants.get(seat.id), selected = !!person?.isSelf;
      const q = project(seat.x, .04, seat.z - .91);
      const closedBook = !!person && (person.status === 'paused' || person.status === 'completed' || person.status === 'ended');
      ellipse(c, q.x, q.y, scale * .41, scale * .22, COLORS[state.sceneId].edge);
      ellipse(c, q.x, q.y - scale * .08, scale * .35, scale * .19, selected ? '#b3b586' : '#91a476');
      line(c, { x: q.x - scale * .26, y: q.y - scale * .08 }, { x: q.x + scale * .26, y: q.y - scale * .08 }, '#b9bb91', scale * .017);
      if (person) drawAvatar(c, seat, person, time, reduce);
      // 桌案始终盖在人物前方；单独缓存桌面，人物动画不再重画八套桌椅与文字。
      const key = state.sceneId + ':' + selected + ':' + closedBook;
      let layer = deskLayers.get(seat.id);
      if (!layer || layer.key !== key) {
        const center = project(seat.x, 0, seat.z), image = layer?.canvas || global.document.createElement('canvas');
        const left = Math.floor(center.x - scale * 1.45 - 2), top = Math.floor(center.y - scale * 1.55 - 2);
        const w = Math.ceil(scale * 2.9 + 4), h = Math.ceil(scale * 2.25 + 4);
        image.width = Math.ceil(w * ratio); image.height = Math.ceil(h * ratio);
        const paint = image.getContext('2d');
        if (!paint) { drawDeskTop(c, seat, selected, closedBook); if (person) drawAvatar(c, seat, person, time, reduce, true); return; }
        paint.setTransform(ratio, 0, 0, ratio, -left * ratio, -top * ratio);
        drawDeskTop(paint, seat, selected, closedBook);
        layer = { canvas: image, key, left, top, width: image.width / ratio, height: image.height / ratio }; deskLayers.set(seat.id, layer);
      }
      c.drawImage(layer.canvas, layer.left, layer.top, layer.width, layer.height);
      if (person) drawAvatar(c, seat, person, time, reduce, true);
    }
    function resize(w, h, pixelRatio, insets) {
      layout = layoutFor(w, h); canvas.dataset.focusLayout = layout.id;
      const nextRatio = Math.min(1.5, pixelRatio);
      if (width !== w || height !== h || ratio !== nextRatio) {
        width = w; height = h; ratio = nextRatio;
        canvas.width = background.width = Math.round(w * ratio); canvas.height = background.height = Math.round(h * ratio);
      }
      const fit = fitViewport(w, h, insets); scale = fit.scale; ox = fit.ox; oy = fit.oy;
      cached = false; clearDeskLayers();
    }
    function update(value) {
      state = value; occupants = new Map(value.people.map(person => [person.seatId, person]));
      syncIllustrations();
      if (currentScene !== value.sceneId) { currentScene = value.sceneId; cached = false; }
    }
    function syncIllustrations() {
      if (canvasDisposed) return;
      const wanted = new Set(state.people.map(person => person.id));
      for (const id of illustrationFrames.keys()) if (!wanted.has(id)) illustrationFrames.delete(id);
      for (const person of state.people) { const frame = illustration(person); if (frame) illustrationFrames.set(person.id, frame); }
      canvas.dataset.focusSpriteCount = String(illustrationFrames.size); canvas.dataset.focusAvatarCount = String(state.people.length); canvas.dataset.focusRepresentation = 'illustrated';
    }
    function render(time, value, reduce) {
      state = value; if (!cached) drawStatic();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.drawImage(background, 0, 0, background.width, background.height, 0, 0, width, height);
      if (state.sceneId === 'rain' && !reduce && !options.illustratedRoom) {
        roomProjection = true;
        ctx.save();
        // 只允许六块窗玻璃区域露出雨丝，木格、室内地板和前方席位都保持干燥。
        ctx.beginPath();
        for (const [left, right] of [[-.98, 2.61], [2.79, 6.37]]) for (const [bottom, top] of [[1.41, 1.94], [2.06, 3.34], [3.45, 3.93]]) {
          const points = [project(left, top, -4.54), project(right, top, -4.54), project(right, bottom, -4.54), project(left, bottom, -4.54)];
          points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
        }
        ctx.clip(); ctx.strokeStyle = 'rgba(234,247,220,.5)'; ctx.lineWidth = Math.max(.65, scale * .012);
        for (let i = 0; i < 24; i++) {
          const x = -.9 + i * .31, y = 1.49 + ((i * .29 - time * .001 * 1.1) % 2.32 + 2.32) % 2.32;
          const a = project(x, y, -4.54), b = project(x - .04, y - .14, -4.54);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.restore(); roomProjection = false;
      }
      layout.sorted.forEach(seat => drawDesk(ctx, seat, time, reduce));
    }
    function projectSeat(id, above = false) {
      const seat = layout.seats[id]; return seat ? project(seat.x, above ? layout.id === 'portrait' || layout.compact ? 2.47 : 2.38 : .7, seat.z - (above ? .91 : 0)) : null;
    }
    function pick(x, y) {
      let found = null, closest = Infinity;
      layout.seats.forEach(seat => {
        const p = projectSeat(seat.id), distance = Math.hypot((x - p.x) / 1.25, y - p.y);
        if (distance < scale * .95 && distance < closest) { found = seat.id; closest = distance; }
      });
      return found;
    }
    return { type: 'canvas', update, resize, render, projectSeat, pick,
      getIllustrationFrame(id) { return illustrationFrames.get(id) || null; },
      startAssets() { if (!stopIllustrations) stopIllustrations = watchIllustrations(() => { if (!canvasDisposed) { syncIllustrations(); options.onInvalidate?.(); } }); },
      isAnimated() { return !options.illustratedRoom && state.sceneId === 'rain' || state.people.length > 0; },
      destroy() { canvasDisposed = true; stopIllustrations?.(); illustrationFrames.clear(); clearDeskLayers(); background.width = background.height = 1; canvas.width = canvas.height = 1; }
    };
  }

  function create(options) {
    const container = options?.container;
    if (!container || !global.document) return { supported: false, renderingMode: 'unavailable', update() {}, updateClocks() {}, setViewportInsets() {}, setActive() {}, resize() {}, destroy() {}, getSeatPositions() { return []; } };
    // 首次就按真实视口选择两列或四列，避免手机入场连续建两次家具。
    const initialRect = container.getBoundingClientRect();
    const initialWidth = Math.max(1, Math.round(initialRect.width || container.clientWidth || 1)), initialHeight = Math.max(1, Math.round(initialRect.height || container.clientHeight || 1));
    const roomBackdrop = global.FocusRooms?.create?.({ container }) || null;
    const initialRatio = finite(global.devicePixelRatio, 1), backendOptions = { ...options, initialWidth, initialHeight, illustratedRoom: !!roomBackdrop, onInvalidate: invalidate };
    let canvas = global.document.createElement('canvas');
    let backend = createWebGL({ ...backendOptions, onInvalidate: invalidate }, canvas);
    if (!backend) { canvas = global.document.createElement('canvas'); backend = createCanvas(backendOptions, canvas); }
    if (!backend) { roomBackdrop?.destroy(); return { supported: false, renderingMode: 'unavailable', update() {}, updateClocks() {}, setViewportInsets() {}, setActive() {}, resize() {}, destroy() {}, getSeatPositions() { return []; } }; }
    canvas.className = 'fx-scene-canvas'; canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '静修室内场景，八个座位可点击入座。也可使用场景下方的座位按钮。');
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', position: 'relative', zIndex: '1', touchAction: 'pan-y', cursor: 'pointer' });
    container.append(canvas); container.dataset.focusRenderer = backend.type;
    const names = new Map();
    function createName(id) {
      const name = global.document.createElement('div'); name.className = 'fx-scene-name'; name.hidden = true;
      Object.assign(name.style, { position: 'absolute', pointerEvents: 'none', transform: 'translate(-50%,-100%)', maxWidth: '176px', padding: '5px 9px', boxSizing: 'border-box', borderRadius: '12px', border: '1.5px solid #9b9270', background: 'rgba(255,251,233,.98)', boxShadow: '0 4px 14px rgba(37,58,42,.24)', color: '#2c4937', textAlign: 'center', fontFamily: '"Noto Sans SC",system-ui,sans-serif', fontSize: '16px', zIndex: '2' });
      const nickname = global.document.createElement('strong'), sub = global.document.createElement('small');
      const prefix = global.document.createElement('span'), timer = global.document.createElement('b');
      const presence = global.document.createElement('span'), presenceIcon = global.document.createElement('span'), presenceText = global.document.createElement('span'), dots = global.document.createElement('span');
      presence.className = 'fx-scene-presence'; presenceIcon.className = 'fx-scene-presence-icon'; dots.className = 'fx-scene-focus-dots';
      presenceIcon.setAttribute('aria-hidden', 'true'); dots.setAttribute('aria-hidden', 'true');
      Object.assign(presence.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: 'max-content', maxWidth: '100%', margin: '2px auto 0', padding: '0 7px', borderRadius: '20px', fontSize: '13px', fontWeight: '800', lineHeight: '20px', whiteSpace: 'nowrap' });
      Object.assign(presenceIcon.style, { fontSize: '14px', fontWeight: '900', lineHeight: '1' });
      for (let i = 0; i < 3; i++) dots.append(global.document.createElement('span'));
      presence.append(presenceIcon, presenceText, dots);
      Object.assign(nickname.style, { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '750', lineHeight: '20px' });
      Object.assign(sub.style, { display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '3px', marginTop: '2px', color: '#234e3b', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', letterSpacing: '0', lineHeight: '26px' });
      Object.assign(prefix.style, { fontSize: '11px', fontWeight: '650', color: '#6c6549', flexShrink: '0' });
      Object.assign(timer.style, { fontSize: '24px', fontWeight: '800', letterSpacing: '-.025em', lineHeight: 'inherit' });
      sub.setAttribute('aria-live', 'off');
      sub.append(prefix, timer);
      name.append(nickname, sub, presence); name.dataset.focusParticipantId = id; container.append(name);
      const entry = { name, nickname, sub, prefix, timer, presence, presenceIcon, presenceText, dots }; names.set(id, entry); return entry;
    }
    // 保留单人气泡，使离线版与多人版共用同一生命周期。
    createName('local:self');
    const savedPosition = container.style.position;
    if (!savedPosition) container.style.position = 'relative';
    let current = { sceneId: sceneId(options.sceneId), seatId: null, nickname: '', avatarId: '', gender: '', status: 'idle', pauseReason: '', clothes: outfit(), participants: null, selfId: '', people: [] };
    let selfClock = null, participantClocks = new Map();
    let visualKey = '', namesDirty = true, backdropScene = '';
    let active = false, disposed = false, frame = 0, lastDraw = 0, dirty = true, lastWidth = initialWidth, lastHeight = initialHeight, lastRatio = initialRatio, pointerStart = null;
    let viewportInsets = normalizeInsets(options.viewportInsets);
    const motion = global.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = () => !!motion?.matches;
    const visible = () => global.document.visibilityState !== 'hidden';
    function syncMotion() {
      names.forEach(entry => { entry.name.dataset.studyMotion = entry.name.dataset.status === 'focus' && active && visible() && !reduced() ? 'on' : 'off'; });
    }
    const requestFrame = cb => global.requestAnimationFrame ? global.requestAnimationFrame(cb) : global.setTimeout(() => cb(Date.now()), 50);
    const cancelFrame = id => global.cancelAnimationFrame ? global.cancelAnimationFrame(id) : global.clearTimeout(id);
    function draw(time) {
      frame = 0; if (disposed || !active || !visible()) return;
      const fps = backend.type === 'canvas' ? 18 : Math.min(lastWidth, lastHeight) < 650 ? 24 : 30;
      if (dirty || time - lastDraw >= 1000 / fps) {
        backend.render(time, current, reduced()); lastDraw = time; dirty = false;
        if (namesDirty) positionNames();
      }
      if (!reduced() && (!backend.isAnimated || backend.isAnimated())) schedule();
    }
    function schedule() { if (!disposed && active && visible() && !frame) frame = requestFrame(draw); }
    function invalidate() { if (disposed) return; dirty = true; namesDirty = true; schedule(); }
    function stop() { if (frame) cancelFrame(frame); frame = 0; }
    function normalizeClock(value) {
      if (!value) return null;
      const status = value.status === undefined ? null : normalizeStatus(value.status, value.kind);
      // 结束是明确的状态快照，即使不再携带时长也必须覆盖旧暂停时钟。
      if (status === 'ended') return { status, pauseReason: '' };
      if (!Number.isFinite(value.elapsedMs) || !Number.isFinite(value.durationMs) || value.durationMs <= 0) return null;
      const duration = Math.min(value.durationMs, 7200000), elapsed = clamp(value.elapsedMs, 0, duration);
      return { seconds: Math.floor(elapsed / 1000), remainingSeconds: status === 'completed' ? 0 : Math.ceil((duration - elapsed) / 1000),
        kind: value.kind === 'break' ? 'break' : 'focus', status, pauseReason: value.pauseReason === undefined ? null : cleanText(value.pauseReason, 80) };
    }
    function clockFor(person) { return person.isSelf && selfClock ? selfClock : participantClocks.get(person.id) || null; }
    function syncPresence(person, status, reason) {
      const entry = names.get(person.id), paused = status === 'paused', neutral = status === 'idle' || status === 'ended';
      const text = presenceLabel(status, reason), icon = paused ? 'Ⅱ' : status === 'rest' ? '☾' : status === 'completed' ? '✓' : status === 'ended' ? '■' : status === 'idle' ? '○' : '';
      if (entry.presenceText.textContent !== text) entry.presenceText.textContent = text;
      if (entry.presenceIcon.textContent !== icon) entry.presenceIcon.textContent = icon;
      entry.presenceIcon.hidden = !icon; entry.dots.hidden = status !== 'focus';
      entry.name.dataset.status = status;
      entry.name.dataset.pauseKind = paused ? awayReasons.has(reason) ? 'away' : connectionReasons.has(reason) ? 'connection' : 'manual' : '';
      entry.name.dataset.studyMotion = status === 'focus' && active && visible() && !reduced() ? 'on' : 'off';
      entry.presence.style.background = paused ? '#b84732' : status === 'rest' ? '#e0ebed' : neutral ? '#eae6d7' : '#deebd2';
      entry.presence.style.color = paused ? '#fffaf0' : status === 'rest' ? '#355e6c' : neutral ? '#62654f' : '#28563b';
      entry.nickname.style.color = paused ? '#713a2b' : person.isFriend ? '#73521d' : '#2c4937';
      entry.name.style.borderColor = paused ? '#b84732' : person.isSelf ? '#4e7754' : person.isFriend ? '#ac813b' : '#9b9270';
      entry.name.style.background = paused ? 'rgba(255,239,224,.99)' : person.isSelf ? 'rgba(241,248,223,.99)' : 'rgba(255,251,233,.98)';
      entry.name.style.boxShadow = paused ? '0 0 0 2px rgba(184,71,50,.18),0 4px 14px rgba(97,50,35,.24)' : person.isSelf ? '0 0 0 2px rgba(226,237,197,.85),0 4px 14px rgba(37,58,42,.26)' : '0 4px 14px rgba(37,58,42,.24)';
      return text;
    }
    function syncClock(person) {
      const entry = names.get(person.id); if (!entry) return;
      const value = clockFor(person), status = value?.status || person.status, ended = status === 'ended';
      const presence = syncPresence(person, status, value?.pauseReason ?? person.pauseReason);
      let prefix = '', text = ended ? '' : compactStatus[status];
      if (value && !ended) {
        const remaining = status === 'completed' ? 0 : value.remainingSeconds, pad = n => String(n).padStart(2, '0');
        prefix = (status === 'paused' ? '暂停' : status === 'completed' ? '完成' : value.kind === 'break' || status === 'rest' ? '小憩' : '剩余') + ' ';
        text = remaining >= 3600 ? pad(Math.floor(remaining / 3600)) + ':' + pad(Math.floor(remaining % 3600 / 60)) + ':' + pad(remaining % 60) : pad(Math.floor(remaining / 60)) + ':' + pad(remaining % 60);
        entry.name.dataset.focusElapsedSeconds = String(value.seconds);
        entry.name.dataset.focusRemainingSeconds = String(remaining);
      } else { delete entry.name.dataset.focusElapsedSeconds; delete entry.name.dataset.focusRemainingSeconds; }
      // 秒级去重只修改已有文本，不触发场景更新、画布清空、角色建模或布局测量。
      if (entry.prefix.textContent !== prefix) entry.prefix.textContent = prefix;
      if (entry.timer.textContent !== text) entry.timer.textContent = text;
      entry.sub.hidden = ended; entry.sub.style.display = ended ? 'none' : 'flex';
      entry.sub.style.color = status === 'paused' ? '#713a2b' : status === 'rest' ? '#3f6874' : '#234e3b';
      const title = (person.nickname || '静修道友') + ' · ' + presence + (status === 'paused' ? '，计时已停止' : '') + (value && !ended ? ' · ' + prefix + text : '') +
        (person.target ? '\n修习：' + person.target : '') + (person.isFriend ? '\n已确认好友' : '');
      if (entry.name.title !== title) entry.name.title = title;
    }
    function updateClocks(value = {}) {
      if (disposed) return;
      selfClock = normalizeClock(value);
      participantClocks = new Map();
      if (Array.isArray(value.participants)) for (const row of value.participants.slice(0, 32)) {
        const id = cleanText(row?.id, 128), clock = normalizeClock(row);
        if (id && clock && !participantClocks.has(id)) participantClocks.set(id, clock);
      }
      current.people.forEach(syncClock);
    }
    function syncNames() {
      const wanted = new Set(current.people.map(person => person.id));
      names.forEach((entry, id) => {
        if (wanted.has(id)) return;
        if (id === 'local:self') entry.name.hidden = true;
        else { entry.name.remove(); names.delete(id); }
      });
      current.people.forEach(person => {
        const entry = names.get(person.id) || createName(person.id), name = entry.name;
        name.hidden = false; entry.nickname.textContent = (person.isFriend ? '★ ' : '') + (person.nickname || '静修道友') + (current.participants && person.isSelf ? ' · 我' : '');
        entry.nickname.title = person.nickname || '静修道友';
        syncClock(person);
        name.dataset.friend = String(person.isFriend); name.dataset.self = String(person.isSelf);
      });
      namesDirty = true;
    }
    function positionNames() {
      namesDirty = false;
      const multiple = current.participants !== null, safe = safeViewport(lastWidth, lastHeight, viewportInsets), layout = layoutFor(lastWidth, lastHeight), portrait = layout.id === 'portrait';
      // 文字只在固定安全区内排布，悬浮工具展开或倒计时变化不会挤动场景。
      const small = lastWidth < 500 || layout.compact;
      const labelWidth = multiple ? portrait ? clamp(Math.floor(safe.width / 2 - 24), 124, 148) : layout.compact ? 124 : clamp(Math.floor(safe.width / 5.8), 124, 166) : Math.min(176, Math.max(124, safe.width - 10));
      // 小屏用紧凑三行保留大号姓名/时间及完整状态，不让下一排标签压住上一排头像。
      const labelHeight = small ? 60 : 86, placed = [];
      const faceBounds = [];
      if (multiple) {
        const fit = fitViewport(lastWidth, lastHeight, viewportInsets);
        for (const person of current.people) {
          const seat = layout.seats[person.seatId], frame = backend.getIllustrationFrame?.(person.id);
          const tip = frame?.penTip || frame?.handAnchor || [.59, .83];
          const h = finite(frame?.worldHeight, 1.78) * fit.scale, w = h * finite(frame?.width, 512) / finite(frame?.height, 512);
          const paper = scenePoint(seat.x - .11, .88, seat.z - .335);
          const left = fit.ox + paper.x * fit.scale - tip[0] * w, top = fit.oy + paper.y * fit.scale - tip[1] * h;
          // 保护整张图上部（发髻、脸和肩胸），并为轻呼吸预留像素余量。
          faceBounds.push({ left: left - 2, right: left + w + 2, top: top - 2, bottom: top + h * .69 + 2 });
        }
      }
      const positions = current.people.map(person => ({ person, point: backend.projectSeat(person.seatId, true) })).filter(item => item.point);
      positions.sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
      positions.forEach(({ person, point }) => {
        const entry = names.get(person.id); if (!entry) return;
        const name = entry.name, half = labelWidth / 2;
        Object.assign(name.style, { width: labelWidth + 'px', maxWidth: labelWidth + 'px', height: labelHeight + 'px', padding: small ? '2px 7px' : '5px 9px', fontSize: small ? '14px' : '16px', borderRadius: '12px' });
        entry.nickname.style.lineHeight = small ? '16px' : '20px';
        entry.sub.style.lineHeight = small ? '22px' : '27px';
        entry.sub.style.marginTop = small ? '0' : '1px';
        entry.prefix.style.fontSize = small ? '10px' : '11px';
        entry.timer.style.fontSize = small ? '20px' : '24px';
        entry.presence.style.fontSize = small ? '12px' : '13px';
        entry.presence.style.lineHeight = small ? '14px' : '20px';
        entry.presence.style.marginTop = small ? '0' : '2px';
        const x = clamp(point.x, safe.left + half + 5, Math.max(safe.left + half + 5, safe.right - half - 5));
        const baseY = clamp(point.y - 5, safe.top + labelHeight + 5, Math.max(safe.top + labelHeight + 5, safe.bottom - 5));
        let y = baseY;
        // 多人昵称采用有限的上下错位，不因每帧动画反复测量 DOM。
        if (multiple) {
          for (let step = 0; step <= Math.min(360, Math.ceil(safe.height)); step++) {
            const offset = step === 0 ? 0 : Math.ceil(step / 2) * 2 * (step % 2 ? -1 : 1);
            const candidate = baseY + offset;
            if (candidate < safe.top + labelHeight + 5 || candidate > safe.bottom - 5) continue;
            const collides = placed.some(other => Math.abs(x - other.x) < labelWidth + 3 && candidate > other.y - labelHeight - 3 && candidate - labelHeight < other.y + 3) ||
              faceBounds.some(face => x + half > face.left && x - half < face.right && candidate > face.top && candidate - labelHeight < face.bottom);
            if (!collides) { y = candidate; break; }
          }
        }
        placed.push({ x, y }); name.style.left = x + 'px'; name.style.top = y + 'px';
      });
    }
    function projectViewport() {
      if (!lastWidth || !lastHeight) return;
      backend.resize(lastWidth, lastHeight, lastRatio, viewportInsets);
      dirty = true; namesDirty = true; positionNames(); schedule();
    }
    function setViewportInsets(value) {
      if (disposed) return;
      const next = normalizeInsets(value);
      if (Object.keys(next).every(side => next[side] === viewportInsets[side])) return;
      viewportInsets = next;
      // 使用上次已知尺寸，控制层只需在窗口变化时调用，不追加 DOM 布局读取。
      projectViewport();
    }
    function resize() {
      if (disposed) return;
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width || container.clientWidth || 1)), h = Math.max(1, Math.round(rect.height || container.clientHeight || 1));
      const ratio = finite(global.devicePixelRatio, 1);
      if (w === lastWidth && h === lastHeight && ratio === lastRatio) return;
      lastWidth = w; lastHeight = h; lastRatio = ratio; projectViewport();
    }
    function update(value = {}) {
      if (disposed) return;
      const equipped = value.equipped || {}, catalog = value.catalog || global.SpiritFocusCatalog;
      const previousPeople = new Map(current.people.map(person => [person.id, person]));
      current = {
        sceneId: sceneId(value.sceneId ?? current.sceneId), seatId: value.seatId === undefined ? current.seatId : seatId(value.seatId),
        nickname: cleanText(value.nickname ?? current.nickname, 60),
        avatarId: cleanText(value.avatarId ?? value.identity?.avatarId ?? current.avatarId, 40),
        gender: cleanText(value.gender ?? value.identity?.gender ?? current.gender, 20),
        status: normalizeStatus(value.status ?? current.status, value.kind),
        pauseReason: cleanText(value.pauseReason ?? current.pauseReason, 80),
        clothes: value.equipped === undefined && value.catalog === undefined ? current.clothes : outfit(equipped, catalog),
        selfId: cleanText(value.selfId ?? current.selfId, 128),
        participants: value.participants === null ? null : Array.isArray(value.participants) ? value.participants.slice(0, 32).map(person => person && typeof person === 'object' ? { ...person, equipped: { ...(person.equipped || {}) } } : null) : current.participants,
        people: []
      };
      if (current.participants !== null) {
        const ids = new Set(), seats = new Set();
        for (const person of current.participants) {
          if (!person || current.people.length >= 8) continue;
          const id = cleanText(person.id, 128), selected = seatId(person.seatId);
          // 无效、重复席位及重复身份不能在画面上创造额外的同修。
          if (!id || selected === null || ids.has(id) || seats.has(selected)) continue;
          ids.add(id); seats.add(selected);
          const isSelf = !!person.isSelf || !!current.selfId && id === current.selfId;
          current.people.push({ id, seatId: selected, nickname: cleanText(person.nickname, 60), target: cleanText(person.target, 100),
            avatarId: isSelf && (value.avatarId !== undefined || value.identity !== undefined) ? current.avatarId : cleanText(person.avatarId ?? person.identity?.avatarId, 40),
            gender: isSelf && (value.gender !== undefined || value.identity !== undefined) ? current.gender : cleanText(person.gender ?? person.identity?.gender, 20),
            status: isSelf && value.status !== undefined ? current.status : normalizeStatus(person.status, person.kind),
            pauseReason: isSelf && value.pauseReason !== undefined ? current.pauseReason : cleanText(person.pauseReason, 80),
            clothes: isSelf && value.equipped !== undefined ? current.clothes : outfit(person.equipped, catalog),
            isFriend: !!person.isFriend && !isSelf, isSelf });
        }
      } else if (current.seatId !== null) {
        current.people.push({ id: 'local:self', seatId: current.seatId, nickname: current.nickname, avatarId: current.avatarId, gender: current.gender, target: '', status: current.status, pauseReason: current.pauseReason, clothes: current.clothes, isSelf: true, isFriend: false });
      }
      // 状态与时钟由两个轻量入口同步。状态先到时不能让上一段缓存反盖新状态；
      // 时钟先到且已匹配新状态时则保留它，避免下一段倒计时闪回或清空。
      let clocksChanged = false;
      for (const person of current.people) {
        const previous = previousPeople.get(person.id);
        if (person.status !== 'ended' && (!previous || previous.status === person.status)) continue;
        if (person.isSelf && selfClock && selfClock.status !== person.status) { selfClock = null; clocksChanged = true; }
        const clock = participantClocks.get(person.id);
        if (clock && clock.status !== person.status) { participantClocks.delete(person.id); clocksChanged = true; }
      }
      const key = JSON.stringify([current.sceneId, current.participants !== null, current.people]);
      if (key === visualKey) { if (clocksChanged) current.people.forEach(syncClock); return; }
      if (roomBackdrop && backdropScene !== current.sceneId) { backdropScene = current.sceneId; void roomBackdrop.setScene(current.sceneId); }
      visualKey = key; backend.update(current); syncNames();
      const self = current.people.find(person => person.isSelf);
      canvas.setAttribute('aria-label', (current.sceneId === 'rain' ? '听雨轩' : '藏经阁') + '，八个座位，当前' + current.people.length + '位同修。' + (!self ? '选择空座位开始静修。' : '当前位于第' + (self.seatId + 1) + '席，' + statusText[self.status] + '。'));
      dirty = true; positionNames(); schedule();
    }
    // 连续收到同一激活状态时不触发布局测量或强制绘制，帧率上限才能真正生效。
    function setActive(value) {
      const next = !!value; if (disposed || next === active) return;
      active = next; syncMotion(); backend.setActive?.(active); if (!active) stop(); else { dirty = true; resize(); schedule(); }
    }
    function onVisibility() { syncMotion(); if (!visible()) stop(); else { dirty = true; schedule(); } }
    function onDown(event) { if (event.button !== undefined && event.button !== 0) return; pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; }
    function onUp(event) {
      if (!active || !pointerStart || pointerStart.id !== event.pointerId) return;
      const start = pointerStart; pointerStart = null;
      if (Math.hypot(start.x - event.clientX, start.y - event.clientY) > 9) return;
      const rect = canvas.getBoundingClientRect(), id = backend.pick(event.clientX - rect.left, event.clientY - rect.top);
      if (id !== null) options.onSeatSelect?.(id);
    }
    function onCancel() { pointerStart = null; }
    function onMotion() { syncMotion(); dirty = true; stop(); schedule(); }
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
    global.document.addEventListener('visibilitychange', onVisibility); global.addEventListener?.('resize', resize);
    motion?.addEventListener?.('change', onMotion);
    const observer = global.ResizeObserver ? new global.ResizeObserver(resize) : null; observer?.observe(container);
    if (roomBackdrop) { backdropScene = current.sceneId; void roomBackdrop.setScene(current.sceneId); }
    backend.update(current); projectViewport(); backend.startAssets?.();
    return {
      supported: true, renderingMode: backend.type, update, updateClocks, setViewportInsets, setActive, resize,
      getSeatPositions() { return SEATS.map(seat => ({ id: seat.id, ...backend.projectSeat(seat.id) })); },
      destroy() {
        if (disposed) return; disposed = true; active = false; stop(); observer?.disconnect();
        canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
        global.document.removeEventListener('visibilitychange', onVisibility); global.removeEventListener?.('resize', resize);
        motion?.removeEventListener?.('change', onMotion); backend.destroy(); roomBackdrop?.destroy(); canvas.remove(); names.forEach(entry => entry.name.remove()); names.clear();
        participantClocks.clear(); selfClock = null;
        delete container.dataset.focusRenderer; if (!savedPosition) container.style.position = '';
      }
    };
  }
  global.SpiritFocusScene = Object.freeze({ create, SEATS });
})(typeof window === 'undefined' ? globalThis : window);
