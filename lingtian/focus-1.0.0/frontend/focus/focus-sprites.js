/* 静修精绘人物：同一透明原画供三维场景与轻量画布使用，衣装只在外观改变时合成。 */
(function (global) {
  'use strict';

  // 离线构建只替换这一处常量；四格原图不依赖外部服务或旧版人物模型。
  const SPRITE_ATLAS = "assets/companions-seated-v87.webp";
  const SIZE = 512, TILE = 627, CACHE_LIMIT = 12, PICTURE_LIMIT = 24, PORTRAIT_SIZE = 256;
  const script = global.document?.currentScript;
  const atlasURL = SPRITE_ATLAS.startsWith('data:') ? SPRITE_ATLAS : script?.src && typeof URL !== 'undefined' ? new URL(SPRITE_ATLAS, script.src).href : './focus/' + SPRITE_ATLAS;
  const SLOTS = Object.freeze(['head', 'robe', 'bottom', 'accessory']);
  const DEFAULTS = Object.freeze({
    head: Object.freeze({ id: 'head_basic', shape: 'pin', color: '#5e4435', accent: '#b8a185' }),
    robe: Object.freeze({ id: 'robe_basic', shape: 'plain', color: '#527b6b', accent: '#e5e3cd' }),
    bottom: Object.freeze({ id: 'bottom_basic', shape: 'plain', color: '#d8d4b5', accent: '#9a946c' }),
    accessory: Object.freeze({ id: 'accessory_basic', shape: 'knot', color: '#ac925e', accent: '#c9b77d' })
  });
  const SHAPES = Object.freeze({ head: ['pin', 'bamboo', 'cloud', 'star'], robe: ['plain', 'rain', 'crane', 'celestial'], bottom: ['plain', 'bamboo', 'cloud', 'moon'], accessory: ['knot', 'scroll', 'jade', 'lantern'] });

  // 下列坐标均由正式四格原画逐一标定，单位为各 627 像素方格内的像素。
  // 衣料边界避开脸、手、颈部和垂发；手层与身体共用原坐标，场景只改变遮挡深度。
  const ART = {
    jade: {
      tile: [0, 0], anchor: [346, 604], penTip: [376, 555], head: [350, 91], accessory: [291, 423], native: '#a0ab8c', faceBottom: 368,
      robe: [[285,374],[320,379],[352,392],[387,375],[416,386],[444,414],[470,443],[499,475],[523,523],[524,567],[505,595],[462,611],[239,612],[188,600],[155,568],[166,520],[185,468],[218,417],[249,388]],
      bottom: [[286,543],[346,534],[406,544],[439,568],[449,604],[433,617],[278,617],[251,590]],
      protect: [[[310,354],[399,354],[405,380],[388,396],[365,417],[343,408],[323,385]]],
      hands: [
        [[284,476],[306,468],[334,472],[353,486],[360,503],[352,518],[324,526],[300,522],[278,510]],
        [[397,509],[416,501],[438,505],[459,518],[458,536],[435,545],[406,546],[387,536]]
      ], brush: [[309,416],[319,414],[384,558],[371,564]],
      skin: [[[288,478],[309,471],[333,475],[349,487],[355,502],[348,516],[326,523],[301,517]],[[398,510],[418,505],[437,508],[453,520],[452,533],[431,541],[402,541],[390,533]]]
    },
    peach: {
      tile: [1, 0], anchor: [366, 604], penTip: [362, 556], head: [297, 78], accessory: [359, 472], native: '#e6a69a', faceBottom: 377,
      robe: [[279,383],[320,385],[351,398],[390,381],[421,393],[444,417],[468,445],[493,478],[513,520],[510,566],[488,599],[442,614],[287,615],[216,601],[179,571],[166,531],[182,482],[210,440],[239,407]],
      bottom: [[286,544],[347,536],[411,546],[443,575],[455,605],[435,619],[294,618],[270,591]],
      protect: [[[328,362],[404,362],[410,389],[389,405],[365,423],[342,403]],[[81,296],[215,330],[237,375],[217,411],[193,450],[175,490],[179,524],[157,559],[75,555]],[[432,335],[541,338],[550,540],[504,542],[481,501],[459,465],[430,429],[405,384]]],
      hands: [
        [[286,478],[305,471],[328,476],[347,490],[353,506],[341,524],[316,527],[292,516],[276,503]],
        [[393,508],[415,501],[439,506],[460,520],[457,537],[436,546],[409,545],[389,536]]
      ], brush: [[301,416],[312,416],[369,558],[357,566]],
      skin: [[[291,480],[307,475],[328,478],[343,490],[348,504],[339,519],[318,523],[294,514]],[[397,510],[416,505],[437,508],[454,520],[451,533],[433,541],[408,541],[393,533]]]
    },
    cloud: {
      tile: [0, 1], anchor: [351, 609], penTip: [389, 522], head: [353, 82], accessory: [381, 414], native: '#b9a0c8', faceBottom: 346,
      robe: [[285,354],[317,351],[350,365],[382,353],[414,367],[441,397],[468,433],[500,476],[527,522],[537,564],[516,595],[472,616],[269,619],[211,606],[171,579],[158,550],[173,511],[201,465],[231,414],[260,376]],
      bottom: [[278,522],[341,512],[409,532],[443,572],[449,608],[426,624],[273,623],[247,589]],
      protect: [[[309,333],[390,333],[395,356],[378,374],[356,395],[332,376]],[[149,339],[225,346],[225,389],[208,431],[202,455],[181,458],[166,422]],[[458,340],[500,344],[512,429],[490,450],[473,414],[455,382]]],
      hands: [
        [[302,449],[322,440],[343,442],[364,455],[375,475],[367,491],[343,498],[317,491],[296,479]],
        [[405,480],[428,474],[448,480],[468,493],[470,510],[445,518],[419,517],[401,507]]
      ], brush: [[328,382],[339,380],[397,523],[383,531]],
      skin: [[[306,451],[324,445],[342,447],[360,458],[369,474],[362,487],[341,493],[318,487],[303,478]],[[410,483],[429,479],[447,483],[464,495],[463,506],[443,514],[420,513],[405,505]]]
    },
    ink: {
      tile: [1, 1], anchor: [400, 613], penTip: [381, 524], head: [299, 93], accessory: [380, 454], native: '#91a3b9', faceBottom: 366,
      robe: [[300,370],[339,372],[371,387],[408,374],[436,391],[463,421],[493,455],[520,495],[542,542],[547,578],[522,605],[476,623],[277,621],[223,611],[183,588],[162,561],[171,526],[198,477],[234,426],[270,393]],
      bottom: [[306,531],[368,527],[431,542],[465,580],[473,615],[452,627],[292,625],[267,590]],
      protect: [[[353,350],[428,350],[429,380],[409,400],[395,418],[373,394]],[[65,212],[282,264],[299,352],[281,388],[261,423],[238,459],[218,454],[212,423],[186,442],[129,445],[80,411]]],
      hands: [
        [[307,461],[328,453],[349,455],[370,470],[377,487],[366,501],[342,503],[317,494],[299,480]],
        [[408,480],[433,475],[456,482],[477,496],[477,512],[451,522],[427,518],[404,506]]
      ], brush: [[317,380],[328,378],[390,526],[376,533]],
      skin: [[[312,463],[330,457],[348,460],[365,472],[372,486],[362,497],[342,499],[320,491],[306,480]],[[413,484],[433,480],[454,485],[471,497],[470,509],[449,517],[428,514],[410,504]]]
    }
  };
  const IDS = Object.freeze(Object.keys(ART));
  // 半身头像保留完整冠饰与肩胸衣料；与进修室、完整试穿共用同一张着装后的原画。
  const PORTRAIT_CROPS = Object.freeze({ jade: [90, 0, 520, 520], peach: [65, 0, 540, 540], cloud: [80, 0, 520, 520], ink: [50, 0, 565, 565] });
  const frames = new Map(), pictures = new Map(), bases = new Map(), listeners = new Set();
  let atlasImage = null, loading = null, settled = false;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback;
  const rgb = value => [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16));
  const luminance = value => value[0] * .2126 + value[1] * .7152 + value[2] * .0722;
  const normalizedPoint = value => Object.freeze(value.map(n => n / TILE));
  const hue = channels => {
    const max = Math.max(...channels), min = Math.min(...channels), delta = max - min;
    if (!delta) return 0;
    const value = max === channels[0] ? (channels[1] - channels[2]) / delta : max === channels[1] ? (channels[2] - channels[0]) / delta + 2 : (channels[0] - channels[1]) / delta + 4;
    return (value * 60 + 360) % 360;
  };

  function resolve(value) {
    if (typeof value === 'string' && IDS.includes(value)) return value;
    const person = value && typeof value === 'object' ? value : { id: value };
    const selected = global.FocusCharacters?.getCharacter?.(person)?.id;
    if (IDS.includes(selected)) return selected;
    const direct = person.avatarId || person.profile?.avatarId || person.identity?.avatarId;
    if (IDS.includes(direct)) return direct;
    const nested = person.identity && typeof person.identity === 'object' ? person.identity : null;
    const id = String(person.id ?? person.participantId ?? person.userId ?? nested?.id ?? nested?.participantId ?? (nested ? '' : person.identity) ?? 'local:self') || 'local:self';
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    return IDS[(hash >>> 0) % IDS.length];
  }

  function wardrobe(person) {
    const catalog = global.SpiritFocusCatalog, input = person?.clothes || person?.equipped || {};
    return Object.fromEntries(SLOTS.map(slot => {
      const basic = DEFAULTS[slot], raw = input[slot];
      const candidate = typeof raw === 'string' ? catalog?.getItem?.(raw) || catalog?.ITEM_MAP?.[raw] : raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
      const entry = candidate?.slot && candidate.slot !== slot ? null : candidate;
      const known = typeof entry?.id === 'string' ? catalog?.getItem?.(entry.id) : null;
      const result = { variant: known?.slot === slot ? known.id : basic.id, shape: SHAPES[slot].includes(entry?.shape) ? entry.shape : basic.shape, color: color(entry?.color, basic.color), accent: color(entry?.accent, basic.accent) };
      result.changed = !!entry && (typeof entry.id === 'string' && entry.id !== basic.id || result.shape !== basic.shape || result.color !== basic.color || result.accent !== basic.accent);
      return [slot, Object.freeze(result)];
    }));
  }

  function canvas() {
    const image = global.document?.createElement?.('canvas');
    if (!image) return null;
    image.width = image.height = SIZE;
    return image;
  }
  function polygon(ctx, points) {
    if (!points?.length) return;
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
    ctx.closePath(); ctx.fill();
  }
  function mask(shape, exclusions = []) {
    const image = canvas(), ctx = image?.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    const scaled = points => points.map(point => point.map(value => value * SIZE / TILE));
    for (const points of shape) polygon(ctx, scaled(points));
    ctx.globalCompositeOperation = 'destination-out';
    for (const points of exclusions) polygon(ctx, scaled(points));
    ctx.globalCompositeOperation = 'source-over';
    return image;
  }
  function bytesOfMask(image) {
    const data = image.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const result = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < result.length; i++) result[i] = data[i * 4 + 3];
    return result;
  }
  function baseFor(id) {
    if (bases.has(id)) return bases.get(id);
    const art = ART[id], image = canvas(), ctx = image?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(atlasImage, art.tile[0] * TILE, art.tile[1] * TILE, TILE, TILE, 0, 0, SIZE, SIZE);
    const forbidden = [[[0,0],[TILE,0],[TILE,art.faceBottom],[0,art.faceBottom]], ...art.protect, ...art.skin, art.brush];
    const bottomMask = mask([art.bottom], forbidden), robeMask = mask([art.robe], [...forbidden, art.bottom]);
    const handMask = mask([...art.hands, art.brush]);
    const clothingArea = mask([[[0,0],[TILE,0],[TILE,TILE],[0,TILE]]], forbidden);
    // 新外袖只沿原人物轮廓延伸，长发遮住披肩后不会在身体外留下浮空衣角。
    const extensionMask = canvas(), extensionContext = extensionMask?.getContext('2d');
    if (extensionContext) {
      for (let i=0;i<12;i++) { const angle=i*Math.PI/6; extensionContext.drawImage(image,Math.cos(angle)*12,Math.sin(angle)*8); }
      extensionContext.drawImage(image,0,0); extensionContext.globalCompositeOperation='destination-in'; extensionContext.drawImage(clothingArea,0,0);
    }
    if (!bottomMask || !robeMask || !handMask || !clothingArea || !extensionContext) return null;
    const result = { image, pixels: ctx.getImageData(0, 0, SIZE, SIZE), robeMask, bottomMask, handMask, clothingArea, extensionMask, robe: bytesOfMask(robeMask), bottom: bytesOfMask(bottomMask) };
    bases.set(id, result); return result;
  }

  // 色调取自局部原画亮度，阴影与刺绣明暗保留；保护区的 RGBA 原字节不参与改色。
  function tint(data, weights, nativeColor, targetColor) {
    const source = rgb(nativeColor), target = rgb(targetColor), sourceLight = luminance(source), sourceHue = hue(source);
    for (let pixel = 0; pixel < weights.length; pixel++) {
      const maskWeight = weights[pixel]; if (!maskWeight) continue;
      const offset = pixel * 4, alpha = data[offset + 3]; if (alpha < 20) continue;
      const current = [data[offset], data[offset + 1], data[offset + 2]], light = luminance(current);
      // 深色发丝与毛笔不应被当成衣料；高亮米白镶边保留原来的清透质感。
      if (light < 66) continue;
      const saturation = (Math.max(...current) - Math.min(...current)) / Math.max(1, Math.max(...current));
      const hueGap = Math.abs(hue(current) - sourceHue);
      // 青、紫、蓝衣料中的暖肤色与金色刺绣另行保护；桃衣则以亮度区分同色系垂发。
      if (saturation > .06 && Math.min(hueGap, 360 - hueGap) > 50) continue;
      const whiteTrim = clamp((light - 211) / 28, 0, 1) * (1 - clamp(saturation / .19, 0, 1));
      const warmHair = nativeColor === ART.peach.native ? clamp((light - 82) / 65, 0, 1) : 1;
      const amount = maskWeight / 255 * .97 * (1 - whiteTrim * .44) * warmHair;
      const shading = clamp(light / sourceLight, .4, 1.55);
      for (let channel = 0; channel < 3; channel++) {
        const highlighted = target[channel] * shading + Math.max(0, light - 205) * .2;
        data[offset + channel] = Math.round(current[channel] * (1 - amount) + clamp(highlighted, 0, 255) * amount);
      }
    }
  }
  function line(ctx, points, stroke, width) {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 2) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function gradient(ctx, x, y, r, cloth) {
    const paint = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    paint.addColorStop(0, cloth.accent); paint.addColorStop(.43, cloth.color); paint.addColorStop(1, cloth.accent); return paint;
  }
  function star(ctx, x, y, radius, fill) {
    const points = Array.from({ length: 10 }, (_, i) => { const angle = -Math.PI / 2 + i * Math.PI / 5, length = i % 2 ? radius * .43 : radius; return [x + Math.cos(angle) * length, y + Math.sin(angle) * length]; });
    ctx.fillStyle = fill; polygon(ctx, points);
  }
  // 大块衣领、肩披和外袖构成轮廓，细线只负责材质。缩成席位人物后仍可辨认。
  const ATTACHMENTS = Object.freeze({ jade: [274, 432], peach: [278, 440], cloud: [421, 421], ink: [477, 431] });
  const mix = (a, b, amount) => '#' + rgb(a).map((v, i) => Math.round(v * (1 - amount) + rgb(b)[i] * amount).toString(16).padStart(2, '0')).join('');
  function paintedPath(ctx, draw, fill, stroke, width = 2) {
    ctx.beginPath(); draw(ctx);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function fabric(ctx, x, y, width, height, cloth, pale = false) {
    const paint = ctx.createLinearGradient(x, y, x + width, y + height);
    paint.addColorStop(0, mix(cloth.color, '#fff7e6', pale ? .74 : .24));
    paint.addColorStop(.26, mix(cloth.color, cloth.accent, pale ? .65 : .18));
    paint.addColorStop(.55, cloth.color); paint.addColorStop(.78, mix(cloth.color, '#24313b', .22));
    paint.addColorStop(1, mix(cloth.color, cloth.accent, .3)); return paint;
  }
  function safeLayer(ctx, clipping, draw, texture = null, opacity = 1) {
    const layer = canvas(), paint = layer?.getContext('2d'); if (!paint) return;
    paint.save(); paint.scale(SIZE / TILE, SIZE / TILE); draw(paint); paint.restore();
    if (texture) {
      const detail = canvas(), detailContext = detail?.getContext('2d');
      if (detailContext) {
        detailContext.drawImage(texture, 0, 0); detailContext.globalCompositeOperation = 'destination-in'; detailContext.drawImage(layer, 0, 0);
        paint.globalCompositeOperation = 'soft-light'; paint.globalAlpha = .72; paint.drawImage(detail, 0, 0); paint.globalAlpha = 1;
      }
    }
    paint.globalCompositeOperation = 'destination-in'; paint.drawImage(clipping, 0, 0);
    ctx.save(); ctx.globalAlpha = opacity; ctx.drawImage(layer, 0, 0); ctx.restore();
  }
  function garmentSilhouette(ctx, art, cloth, clipping) {
    if (!cloth.changed || cloth.shape === 'plain') return;
    safeLayer(ctx, clipping, paint => {
      const x = art.anchor[0], y = art.faceBottom + 25, ink = cloth.variant === 'robe_cloudink', eternal = cloth.variant === 'robe_eternal';
      const edge = mix(cloth.color, '#655442', .25);
      paint.shadowColor = 'rgba(43,35,32,.2)'; paint.shadowBlur = 5; paint.shadowOffsetY = 3;
      for (const side of [-1, 1]) {
        paint.save(); paint.translate(x, y); paint.scale(side * (art === ART.peach ? .77 : art === ART.ink ? .83 : .94), 1);
        const fill = fabric(paint, 40, 0, 180, 210, cloth, cloth.shape === 'crane');
        if (cloth.shape === 'rain') {
          paintedPath(paint, p => { p.moveTo(68, 0); p.bezierCurveTo(137, 17, 167, 97, 211, 155); p.quadraticCurveTo(222, 181, 185, 204); p.lineTo(133, 182); p.bezierCurveTo(143, 131, 117, 84, 58, 41); p.closePath(); }, fill, edge, 1.8);
          line(paint, [[81,28],[122,75],[158,138],[183,185]], cloth.accent, 8);
          line(paint, [[90,27],[130,75],[169,137],[194,181]], mix(cloth.color,'#ffffff',.3), 2);
        } else if (cloth.shape === 'crane') {
          paintedPath(paint, p => { p.moveTo(66, 0); p.bezierCurveTo(138, 8, 172, 72, 217, 142); p.quadraticCurveTo(231, 170, 197, 178); p.quadraticCurveTo(211, 198, 176, 203); p.quadraticCurveTo(174, 222, 141, 215); p.lineTo(104, 132); p.lineTo(37, 33); p.closePath(); }, fill, edge, 1.8);
          paintedPath(paint, p => { p.moveTo(76,22); p.bezierCurveTo(125,43,154,103,189,160); p.quadraticCurveTo(202,182,167,194); }, null, cloth.accent, ink ? 10 : 7);
          if (ink) line(paint, [[102,66],[137,134],[152,198]], mix(cloth.color, '#26485e', .55), 12);
        } else {
          const reach = eternal ? 227 : 214;
          paintedPath(paint, p => { p.moveTo(59, 0); p.bezierCurveTo(133, 7, 171, 86, reach, 167); p.lineTo(reach - 20, 160); p.lineTo(reach - 13, 188); p.lineTo(reach - 44, 180); p.lineTo(reach - 45, 211); p.lineTo(128, 195); p.bezierCurveTo(126, 129, 100, 75, 28, 27); p.closePath(); }, fill, edge, 1.8);
          for (let i = 0; i < 3; i++) paintedPath(paint, p => { p.moveTo(93+i*18,49+i*25); p.quadraticCurveTo(130+i*20,118+i*18,163+i*16,178+i*7); }, null, cloth.accent, eternal ? 9 : 7);
          if (eternal) { star(paint, 176, 155, 15, cloth.accent); star(paint, 148, 104, 10, cloth.accent); }
        }
        paint.restore();
      }
    });
  }
  function garmentConstruction(ctx, art, cloth, clipping, texture) {
    if (!cloth.changed || cloth.shape === 'plain') return;
    safeLayer(ctx, clipping, paint => {
      const x=art.anchor[0],y=art.faceBottom+24, ink=cloth.variant==='robe_cloudink', eternal=cloth.variant==='robe_eternal';
      const edge=mix(cloth.color,'#655442',.22);
      paint.shadowColor='rgba(45,34,27,.15)';paint.shadowBlur=4;paint.shadowOffsetY=3;
      if(cloth.shape==='rain') {
        for(const side of [-1,1]) {
          paint.save();paint.translate(x,y);paint.scale(side,1);
          const fill=fabric(paint,15,-5,135,105,cloth,cloth.shape==='crane');
          paintedPath(paint,p=>{p.moveTo(29,-4);p.quadraticCurveTo(68,-11,108,15);p.quadraticCurveTo(136,31,142,52);p.quadraticCurveTo(104,82,74,106);p.lineTo(45,81);p.quadraticCurveTo(78,45,82,27);p.lineTo(15,5);p.closePath();},fill,edge,1.8);
          line(paint,[[38,4],[80,24],[61,64],[43,85]],cloth.accent,9);
          line(paint,[[39,8],[74,26],[55,65]],mix(cloth.color,'#faf2d6',.6),2);
          paint.restore();
        }
      } else if(cloth.shape==='crane') {
        for(const side of [-1,1]) {
          paint.save();paint.translate(x,y);paint.scale(side,1);
          const fill=fabric(paint,15,-5,135,105,cloth,cloth.shape==='crane');
          paintedPath(paint,p=>{p.moveTo(29,-5);p.quadraticCurveTo(95,-9,143,48);p.quadraticCurveTo(129,76,104,69);p.quadraticCurveTo(90,94,66,80);p.quadraticCurveTo(48,98,30,80);p.quadraticCurveTo(47,47,68,28);p.lineTo(12,10);p.closePath();},fill,edge,1.8);
          paintedPath(paint,p=>{p.moveTo(27,6);p.quadraticCurveTo(60,20,68,28);p.quadraticCurveTo(45,52,33,78);},null,cloth.accent,ink?13:9);
          if(ink) {line(paint,[[91,24],[119,47],[98,65]],mix(cloth.accent,'#1d3f4e',.28),7);line(paint,[[85,35],[107,50]],'#eaf0e5',2);}
          paint.restore();
        }
      } else {
        for(const side of [-1,1]) {
          paint.save();paint.translate(x,y);paint.scale(side,1);
          const fill=fabric(paint,15,-5,135,105,cloth,cloth.shape==='crane');
          paintedPath(paint,p=>{p.moveTo(25,-8);p.quadraticCurveTo(70,-17,112,11);p.lineTo(153,58);p.lineTo(130,57);p.lineTo(126,79);p.lineTo(103,70);p.lineTo(91,91);p.lineTo(64,78);p.lineTo(42,96);p.quadraticCurveTo(55,55,58,28);p.lineTo(13,8);p.closePath();},fill,edge,1.8);
          for(let i=0;i<3;i++)paintedPath(paint,p=>{p.moveTo(45+i*20,10+i*5);p.quadraticCurveTo(75+i*21,17+i*18,105+i*17,55+i*7);p.quadraticCurveTo(76+i*17,46+i*12,58+i*18,68+i*3);},null,cloth.accent,eternal?7:5);
          if(eternal) {ellipse(paint,93,42,22,24,mix(cloth.color,'#182732',.38),cloth.accent,3);star(paint,93,42,16,cloth.accent);ellipse(paint,92,42,5,5,cloth.color);}
          paint.restore();
        }
      }
      paint.shadowBlur=0;
    },texture,.86);
  }
  function bottomConstruction(ctx, art, cloth, clipping, texture) {
    if (!cloth.changed || cloth.shape === 'plain') return;
    safeLayer(ctx,clipping,paint=>{
      const x=art.anchor[0], y=553, fill=fabric(paint,x-100,y,200,74,cloth), edge=mix(cloth.color,'#2e3940',.28);
      if(cloth.shape==='bamboo') {
        paintedPath(paint,p=>{p.moveTo(x-79,y-7);p.quadraticCurveTo(x,y-24,x+77,y-5);p.lineTo(x+103,y+62);p.quadraticCurveTo(x,y+48,x-102,y+61);p.closePath();},fill,edge,1.7);
        for(let i=-3;i<=3;i++)paintedPath(paint,p=>{p.moveTo(x+i*21,y);p.quadraticCurveTo(x+i*22,y+28,x+i*28,y+61);},null,i%2?cloth.accent:edge,5);
      } else if(cloth.shape==='cloud') {
        for(let tier=0;tier<2;tier++)paintedPath(paint,p=>{p.moveTo(x-87-tier*7,y+tier*25);p.quadraticCurveTo(x-10,y-18+tier*23,x+85+tier*6,y+7+tier*26);p.lineTo(x+96,y+34+tier*23);p.quadraticCurveTo(x+57,y+50+tier*14,x+31,y+35+tier*20);p.quadraticCurveTo(x,y+52+tier*13,x-35,y+36+tier*20);p.quadraticCurveTo(x-67,y+48+tier*12,x-98,y+35+tier*24);p.closePath();},fill,cloth.accent,3.2);
      } else {
        const dawn=cloth.variant==='bottom_dawn';
        paintedPath(paint,p=>{p.moveTo(x-83,y-5);p.quadraticCurveTo(x-4,y-21,x+89,y+1);p.lineTo(x+101,y+66);p.quadraticCurveTo(x+28,y+40,x-99,y+67);p.closePath();},fill,edge,1.8);
        paintedPath(paint,p=>{p.moveTo(x-89,y+4);p.quadraticCurveTo(x-18,y+1,x+76,y+56);p.lineTo(x+96,y+69);p.quadraticCurveTo(x-20,y+19,x-97,y+25);p.closePath();},mix(cloth.accent,cloth.color,dawn?.18:.42),null);
        if(dawn)paintedPath(paint,p=>{p.moveTo(x-91,y+22);p.quadraticCurveTo(x-12,y+16,x+87,y+67);},null,cloth.accent,4);
      }
    },texture,.8);
  }
  function craneMotif(ctx,x,y,size,color,ink) {
    ctx.save();ctx.translate(x,y);ctx.scale(size/48,size/48);
    paintedPath(ctx,p=>{p.moveTo(-3,7);p.bezierCurveTo(-14,-7,-31,-25,-43,-19);p.quadraticCurveTo(-27,-11,-19,10);p.quadraticCurveTo(-9,21,5,14);p.bezierCurveTo(20,12,31,-5,41,-21);p.quadraticCurveTo(21,-15,8,3);p.bezierCurveTo(8,-6,19,-10,20,-18);p.quadraticCurveTo(22,-25,16,-26);p.lineTo(11,-23);p.bezierCurveTo(18,-19,8,-13,4,-5);p.closePath();},color,ink?mix(color,'#17343e',.25):null,1.5);
    line(ctx,[[17,-25],[30,-26]],ink?'#cbb878':'#a5885c',2);ctx.restore();
  }
  function garmentPattern(ctx, art, cloth, kind, clipping) {
    if (!cloth.changed || cloth.shape === 'plain') return;
    safeLayer(ctx,clipping,paint=>{
      const center=art.anchor[0], top=kind==='robe'?art.faceBottom+109:566;
      const ink=cloth.variant==='robe_cloudink',eternal=cloth.variant==='robe_eternal',dawn=cloth.variant==='bottom_dawn';
      const motif=mix(cloth.accent,cloth.color,.05);paint.globalAlpha=.7;
      if(cloth.shape==='rain'||cloth.shape==='bamboo') {
        for(const side of [-1,1]) {
          const x=center+side*(kind==='robe'?125:52),y=top;
          line(paint,[[x-7,y-35],[x+5,y+51]],mix(cloth.color,'#1f423e',.3),kind==='robe'?7:5);
          for(let leaf=0;leaf<4;leaf++) {
            line(paint,[[x-10+leaf*3,y-25+leaf*18],[x+6+leaf*3,y-25+leaf*18]],motif,3);
            paintedPath(paint,p=>{p.moveTo(x+leaf*3,y-17+leaf*18);p.quadraticCurveTo(x-33,y-37+leaf*18,x-40,y-18+leaf*18);p.quadraticCurveTo(x-14,y-15+leaf*18,x+leaf*3,y-17+leaf*18);},motif);
            paintedPath(paint,p=>{p.moveTo(x+leaf*3,y-10+leaf*18);p.quadraticCurveTo(x+25,y-36+leaf*18,x+36,y-18+leaf*18);p.quadraticCurveTo(x+15,y-9+leaf*18,x+leaf*3,y-10+leaf*18);},motif);
          }
        }
      } else if(cloth.shape==='crane') {
        craneMotif(paint,center-119,top+12,ink?65:57,motif,ink);
        craneMotif(paint,center+112,top+43,ink?57:53,motif,ink);
      } else if(cloth.shape==='cloud') {
        for(const side of [-1,1]) {const x=center+side*52,y=top+10;paintedPath(paint,p=>{p.moveTo(x-39,y+9);p.bezierCurveTo(x-38,y-7,x-21,y-17,x-10,y-5);p.bezierCurveTo(x-7,y-30,x+30,y-30,x+30,y-4);p.bezierCurveTo(x+51,y-10,x+55,y+18,x+25,y+20);p.lineTo(x-19,y+20);},null,motif,7);}
      } else if(cloth.shape==='celestial') {
        for(const side of [-1,1]) {
          const x=center+side*118,y=top+17;
          line(paint,[[x-20,y-18],[x+18,y+4],[x-13,y+35]],motif,3);
          star(paint,x-20,y-18,eternal?19:14,motif);star(paint,x+18,y+4,eternal?12:9,motif);star(paint,x-13,y+35,eternal?9:6,motif);
          if(eternal)ellipse(paint,x-20,y-18,26,26,null,motif,2.6);
        }
      } else if(cloth.shape==='moon') {
        for(const side of [-1,1]) {
          const x=center+side*49,y=top+2;
          paintedPath(paint,p=>{p.arc(x,y,dawn?28:23,.1,Math.PI*1.82);p.bezierCurveTo(x-3,y+17,x-10,y-14,x+19,y-12);},motif);
          if(dawn){line(paint,[[x-31,y+29],[x-8,y+18],[x+17,y+29]],mix(cloth.color,'#743b69',.2),7);star(paint,x+28,y-18,9,motif);}
        }
      }
      if(kind==='bottom') {
        paint.globalAlpha=.45;const trim=cloth.shape==='bamboo'?mix(cloth.color,'#1e4235',.35):motif;
        paintedPath(paint,p=>{p.moveTo(center-100,603);p.quadraticCurveTo(center,566,center+104,609);},null,trim,dawn?12:8);

      }
    });
  }
  function ornamentMaterial(ctx,x,y,size,cloth) {
    const paint=ctx.createLinearGradient(x-size*.65,y-size*.72,x+size*.55,y+size*.65);
    paint.addColorStop(0,mix(cloth.color,'#fff8df',.32));paint.addColorStop(.22,mix(cloth.color,cloth.accent,.26));
    paint.addColorStop(.4,cloth.color);paint.addColorStop(.57,mix(cloth.color,'#26333e',.32));
    paint.addColorStop(.75,mix(cloth.color,cloth.accent,.2));paint.addColorStop(1,mix(cloth.color,'#1c3336',.2));return paint;
  }
  function adornment(ctx, art, cloth, slot, clipping) {
    if (!cloth.changed) return;
    const [x,y]=slot==='head'?art.head:ATTACHMENTS[IDS.find(id=>ART[id]===art)];
    const draw=paint=>{
      const raised=cloth.variant==='head_stargaze',dew=cloth.variant==='head_dew',inkjade=cloth.variant==='accessory_inkjade',ever=cloth.variant==='accessory_everlight';
      const size=slot==='head'?78:39,fill=ornamentMaterial(paint,x,y,size,cloth),edge=mix(cloth.color,'#44382e',.4),light=mix(cloth.accent,'#fff5dc',.28);
      paint.shadowColor='rgba(45,33,25,.28)';paint.shadowBlur=3.5;paint.shadowOffsetY=3;
      if(slot==='head') {
        if(cloth.shape==='pin') {
          line(paint,[[x-85,y+9],[x+86,y-9]],cloth.accent,11);ellipse(paint,x-87,y+9,13,13,fill,edge,2);ellipse(paint,x+89,y-9,17,15,fill,light,3);
        } else if(cloth.shape==='bamboo') {
          paintedPath(paint,p=>{p.moveTo(x-70,y+19);p.quadraticCurveTo(x,y+36,x+70,y+19);p.lineTo(x+62,y-15);p.quadraticCurveTo(x,y-28,x-62,y-15);p.closePath();},fill,edge,3.5);
          for(let i=0;i<5;i++) {const px=x-46+i*23,top=y-23-(i===2?26:i===1||i===3?13:0);line(paint,[[px,y+16],[px,top]],mix(cloth.color,'#21472e',.18),17);line(paint,[[px-7,y-3],[px+7,y-3]],light,4);line(paint,[[px-4,top+3],[px-4,y+13]],mix(cloth.color,'#e5f0cf',.5),3);}
          line(paint,[[x-64,y+17],[x-23,y+24],[x+30,y+23],[x+63,y+15]],mix(cloth.color,'#173c2a',.4),3);
          for(const side of [-1,1])paintedPath(paint,p=>{p.moveTo(x+side*44,y-17);p.quadraticCurveTo(x+side*102,y-43,x+side*90,y-61);p.quadraticCurveTo(x+side*57,y-59,x+side*44,y-17);},dew?light:cloth.color,edge,2);
          if(dew) {for(const [dx,dy] of [[-73,-48],[72,-48],[0,-58]])ellipse(paint,x+dx,y+dy,8,11,'#e0f6ee',mix(cloth.color,'#ffffff',.5),2);line(paint,[[x-68,y+20],[x-77,y+81]],cloth.accent,3);ellipse(paint,x-77,y+86,7,11,'#e7f2de',edge,2);}
        } else if(cloth.shape==='cloud') {
          paintedPath(paint,p=>{p.moveTo(x-82,y+20);p.quadraticCurveTo(x-92,y-8,x-65,y-12);p.bezierCurveTo(x-72,y-43,x-31,y-53,x-22,y-26);p.bezierCurveTo(x-21,y-63,x+30,y-65,x+32,y-26);p.bezierCurveTo(x+51,y-50,x+85,y-31,x+72,y-10);p.quadraticCurveTo(x+100,y+6,x+77,y+26);p.quadraticCurveTo(x,y+44,x-82,y+20);},fill,edge,3.5);
          paintedPath(paint,p=>{p.moveTo(x-63,y+8);p.quadraticCurveTo(x-20,y+28,x+65,y+8);},null,light,6);
          ellipse(paint,x+3,y-7,20,24,ornamentMaterial(paint,x+3,y-7,24,{color:cloth.accent,accent:'#f7f3d4'}),mix(cloth.color,'#234c46',.28),2.2);ellipse(paint,x-3,y-16,5,8,'rgba(255,255,246,.88)');
          for(const side of [-1,1]){line(paint,[[x+side*74,y+23],[x+side*80,y+61]],cloth.accent,3);ellipse(paint,x+side*80,y+69,8,12,fill,light,2);}
        } else {
          const high=raised?66:55;
          paintedPath(paint,p=>{p.moveTo(x-79,y+18);p.lineTo(x-88,y-21);p.lineTo(x-53,y-4);p.lineTo(x-42,y-43);p.lineTo(x-16,y-19);p.lineTo(x,y-high);p.lineTo(x+18,y-19);p.lineTo(x+46,y-43);p.lineTo(x+55,y-3);p.lineTo(x+87,y-22);p.lineTo(x+77,y+19);p.quadraticCurveTo(x,y+39,x-79,y+18);p.closePath();},fill,light,4);
          paintedPath(paint,p=>{p.moveTo(x-71,y+17);p.quadraticCurveTo(x,y+32,x+72,y+17);},null,cloth.accent,10);
          paintedPath(paint,p=>{p.moveTo(x-75,y+12);p.quadraticCurveTo(x,y+27,x+73,y+12);},null,mix(cloth.color,'#192539',.5),3);
          star(paint,x,y-15,raised?25:22,light);ellipse(paint,x,y-15,7,8,cloth.color,edge,1.5);
          for(const side of [-1,1]) {star(paint,x+side*51,y+2,11,cloth.accent);if(raised){line(paint,[[x+side*78,y+18],[x+side*92,y+71]],cloth.accent,3.5);star(paint,x+side*93,y+79,12,light);}}
          if(raised) {ellipse(paint,x,y-17,39,30,null,cloth.accent,2);ellipse(paint,x-3,y-19,3,5,'#fffbed');}
        }
      } else {
        // 侧胸挂件比原版约大一倍；主体在书桌上方，仍由保护蒙版让开手与毛笔。
        line(paint,[[x-3,y-46],[x,y-24]],edge,4.5);line(paint,[[x-3,y-46],[x,y-24]],cloth.accent,2.5);
        if(cloth.shape==='scroll') {
          paint.save();paint.translate(x,y);paint.rotate(-.14);
          const fill=fabric(paint,-25,-35,50,75,cloth,true);
          paintedPath(paint,p=>{p.moveTo(-22,-30);p.quadraticCurveTo(0,-36,22,-30);p.lineTo(22,35);p.quadraticCurveTo(0,42,-22,35);p.closePath();},fill,edge,2.6);
          for(const yy of [-31,36]){line(paint,[[-28,yy],[28,yy]],edge,11);line(paint,[[-27,yy-2],[27,yy-2]],cloth.accent,5);ellipse(paint,-28,yy,5,6,cloth.accent,edge,2);ellipse(paint,28,yy,5,6,cloth.accent,edge,2);}
          line(paint,[[-23,1],[23,1]],cloth.color,10);line(paint,[[-22,0],[22,0]],cloth.accent,4);
          for(let row=0;row<3;row++)line(paint,[[-12,-19+row*7],[11,-19+row*7]],mix(cloth.accent,'#6f5334',.25),1.8);
          line(paint,[[1,3],[9,47]],cloth.color,4);paint.restore();
        } else if(cloth.shape==='jade') {
          if(inkjade) {
            paintedPath(paint,p=>{p.moveTo(x,y-33);p.lineTo(x+29,y-13);p.lineTo(x+25,y+24);p.lineTo(x,y+40);p.lineTo(x-25,y+24);p.lineTo(x-29,y-13);p.closePath();},fill,light,4);
            paintedPath(paint,p=>{p.moveTo(x,y-21);p.lineTo(x+15,y-9);p.lineTo(x+13,y+17);p.lineTo(x,y+26);p.lineTo(x-13,y+17);p.lineTo(x-15,y-9);p.closePath();},mix(cloth.color,'#103734',.34),cloth.accent,2);
            line(paint,[[x-17,y-15],[x-14,y+8]],'rgba(232,255,244,.62)',4);
          } else {ellipse(paint,x,y+1,29,34,null,edge,16);ellipse(paint,x,y-1,29,34,null,fill,12);paintedPath(paint,p=>{p.ellipse(x,y-1,28,33,0,Math.PI*.94,Math.PI*1.73);},null,mix(cloth.accent,'#fff9e8',.35),3);paintedPath(paint,p=>{p.ellipse(x,y+1,21,26,0,-.3,Math.PI*.72);},null,mix(cloth.color,'#123b38',.4),2);ellipse(paint,x-10,y-17,4,7,'rgba(255,255,235,.86)');}
          for(const side of [-1,0,1])line(paint,[[x+side*4,y+35],[x+side*9,y+62]],side?cloth.color:cloth.accent,5);
          ellipse(paint,x,y+40,7,7,cloth.accent,edge,1.5);
        } else if(cloth.shape==='lantern') {
          if(ever) {
            paintedPath(paint,p=>{p.moveTo(x,y-42);p.lineTo(x+33,y-26);p.lineTo(x+29,y+28);p.lineTo(x,y+44);p.lineTo(x-29,y+28);p.lineTo(x-33,y-26);p.closePath();},fill,edge,3);
            paintedPath(paint,p=>{p.moveTo(x-19,y-23);p.lineTo(x,y-33);p.lineTo(x+19,y-23);p.lineTo(x+17,y+23);p.lineTo(x,y+32);p.lineTo(x-17,y+23);p.closePath();},mix(cloth.accent,'#fffef2',.55),cloth.accent,2.5);
            line(paint,[[x,y-37],[x,y+38]],cloth.color,3);line(paint,[[x-29,y-25],[x+29,y-25]],cloth.accent,7);line(paint,[[x-26,y+28],[x+26,y+28]],cloth.accent,7);
          } else {
            ellipse(paint,x,y+1,34,39,fill,edge,2.4);ellipse(paint,x,y+1,14,37,ornamentMaterial(paint,x,y,35,{color:cloth.accent,accent:'#fff9d9'}),cloth.accent,2.2);paintedPath(paint,p=>{p.ellipse(x,y+1,26,36,0,Math.PI*.7,Math.PI*1.55);},null,mix(cloth.accent,'#fff8db',.38),2.2);
            line(paint,[[x-26,y-35],[x+26,y-35]],edge,9);line(paint,[[x-24,y-37],[x+24,y-37]],cloth.accent,5);line(paint,[[x-25,y+39],[x+25,y+39]],edge,8);line(paint,[[x-22,y+37],[x+22,y+37]],cloth.accent,4);
          }
          line(paint,[[x,y+42],[x,y+66]],cloth.accent,5);ellipse(paint,x,y+67,7,10,fill,edge,2);ellipse(paint,x-12,y-11,4,7,'rgba(255,255,248,.82)');
        } else {
          ellipse(paint,x-11,y,15,13,null,edge,9);ellipse(paint,x+11,y,15,13,null,fill,9);line(paint,[[x-4,y+9],[x-15,y+43]],cloth.accent,7);line(paint,[[x+4,y+9],[x+15,y+43]],cloth.color,7);
        }
      }
    };
    if(slot==='head'){ctx.save();ctx.scale(SIZE/TILE,SIZE/TILE);draw(ctx);ctx.restore();}
    else safeLayer(ctx,clipping,draw);
  }

  function compose(id, clothes, key) {
    const art = ART[id], base = baseFor(id), body = canvas(), hands = canvas();
    const ctx = body?.getContext('2d'), handContext = hands?.getContext('2d');
    if (!base || !ctx || !handContext) return null;
    if (!clothes.robe.changed && !clothes.bottom.changed) ctx.drawImage(base.image, 0, 0);
    else {
      const result = ctx.createImageData(SIZE, SIZE); result.data.set(base.pixels.data);
      if (clothes.robe.changed) tint(result.data, base.robe, art.native, clothes.robe.color);
      if (clothes.bottom.changed) tint(result.data, base.bottom, art.native, clothes.bottom.color);
      ctx.putImageData(result, 0, 0);
    }
    // 外袖先置于原人像背后，肩披与衣领再在保护区外叠绘。
    const dressed = clothes.robe.changed ? canvas() : null, dressedContext = dressed?.getContext('2d');
    if (dressedContext) {
      dressedContext.drawImage(body, 0, 0); ctx.clearRect(0, 0, SIZE, SIZE);
      garmentSilhouette(ctx, art, clothes.robe, base.extensionMask); ctx.drawImage(dressed, 0, 0);
    }
    garmentConstruction(ctx, art, clothes.robe, base.clothingArea, base.image);
    garmentPattern(ctx, art, clothes.robe, 'robe', base.robeMask);
    bottomConstruction(ctx, art, clothes.bottom, base.bottomMask, base.image);
    garmentPattern(ctx, art, clothes.bottom, 'bottom', base.bottomMask);
    adornment(ctx, art, clothes.head, 'head'); adornment(ctx, art, clothes.accessory, 'accessory', base.clothingArea);
    // 身体保留同位置的原手，前景层覆盖其正上方；抗锯齿边缘不会出现透明接缝。
    handContext.drawImage(body, 0, 0); handContext.globalCompositeOperation = 'destination-in'; handContext.drawImage(base.handMask, 0, 0); handContext.globalCompositeOperation = 'source-over';
    return Object.freeze({ key, characterId: id, representation: 'illustrated', pose: 'seated', body, hands, width: SIZE, height: SIZE,
      anchor: normalizedPoint(art.anchor), worldHeight: 1.78, handAnchor: normalizedPoint(art.penTip), penTip: normalizedPoint(art.penTip),
      headAnchor: normalizedPoint(art.head), accessoryAnchor: normalizedPoint(art.accessory), clothes: Object.freeze(clothes) });
  }
  function appearanceKey(person) {
    const clothes = wardrobe(person);
    return 'v93:' + resolve(person) + ':' + JSON.stringify(SLOTS.map(slot => clothes[slot]));
  }
  function get(person) {
    if (!atlasImage) { void ready(); return null; }
    const id = resolve(person), clothes = wardrobe(person), key = 'v93:' + id + ':' + JSON.stringify(SLOTS.map(slot => clothes[slot]));
    if (frames.has(key)) { const frame = frames.get(key); frames.delete(key); frames.set(key, frame); return frame; }
    const frame = compose(id, clothes, key); if (!frame) return null;
    frames.set(key, frame);
    // 只释放缓存引用。场景正在使用的 Canvas / Texture 不会因 LRU 驱逐而突然失效。
    while (frames.size > CACHE_LIMIT) frames.delete(frames.keys().next().value);
    return frame;
  }

  function cachePicture(key, value) {
    pictures.set(key, value);
    // Data URL 不依赖可撤销对象地址，驱逐后已显示的头像与试穿仍然有效。
    while (pictures.size > PICTURE_LIMIT) pictures.delete(pictures.keys().next().value);
    return value;
  }
  function picture(person, options = {}) {
    const view = options.view === 'full' ? 'full' : 'portrait', key = appearanceKey(person), cacheKey = key + ':' + view;
    if (pictures.has(cacheKey)) { const value = pictures.get(cacheKey); pictures.delete(cacheKey); pictures.set(cacheKey, value); return value; }
    let frame;
    try { frame = get(person); } catch (_) { return cachePicture(cacheKey, null); }
    if (!frame) return atlasImage ? cachePicture(cacheKey, null) : null;
    const size = view === 'full' ? SIZE : PORTRAIT_SIZE;
    let source = frame.body;
    if (view === 'portrait') {
      source = global.document?.createElement?.('canvas'); if (!source) return cachePicture(cacheKey, null);
      source.width = source.height = size;
      const ctx = source.getContext('2d'); if (!ctx) return cachePicture(cacheKey, null);
      const crop = PORTRAIT_CROPS[frame.characterId].map(value => value * SIZE / TILE);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      // 给冠顶与发丝的抗锯齿边缘留白，圆形小头像也不会把顶端贴着外框。
      ctx.drawImage(frame.body, ...crop, 4, 4, size - 8, size - 8);
    }
    let url;
    try { url = source.toDataURL('image/webp', view === 'full' ? .92 : .9); }
    catch (_) { try { url = source.toDataURL('image/png'); } catch (_) { return cachePicture(cacheKey, null); } }
    if (!/^data:image\/(?:webp|png);base64,[a-z0-9+/=]+$/i.test(url)) return cachePicture(cacheKey, null);
    const value = Object.freeze({ key, characterId: frame.characterId, view, url, width: size, height: size });
    return cachePicture(cacheKey, value);
  }

  function status() { return atlasImage ? 'ready' : settled ? 'unavailable' : loading ? 'loading' : 'idle'; }
  function pictureStatus(person, options = {}) {
    const key = appearanceKey(person) + ':' + (options.view === 'full' ? 'full' : 'portrait');
    return pictures.has(key) ? pictures.get(key) ? 'ready' : 'unavailable' : status();
  }

  function notify(available) {
    const callbacks = [...listeners]; listeners.clear();
    for (const callback of callbacks) { try { callback(available); } catch (_) { /* 单个视图已关闭不影响其它视图。 */ } }
  }
  function ready() {
    if (loading) return loading;
    loading = new Promise(resolvePromise => {
      if (!global.Image || !global.document?.createElement) { settled = true; resolvePromise(false); return; }
      const image = new global.Image(); let finished = false;
      function finish(available) {
        if (finished) return; finished = true; image.onload = image.onerror = null;
        const valid = available && (image.naturalWidth || image.width) === TILE * 2 && (image.naturalHeight || image.height) === TILE * 2;
        if (valid) atlasImage = image;
        settled = true; resolvePromise(!!valid);
      }
      image.decoding = 'async';
      image.onload = () => {
        // 所有同修与两个渲染后端共享这一次解码，不为每个席位建立新 Image。
        if (typeof image.decode === 'function') image.decode().then(() => finish(true), () => finish(false));
        else finish(true);
      };
      image.onerror = () => finish(false);
      try { image.src = atlasURL; } catch (_) { finish(false); }
    }).then(available => { notify(available); return available; });
    return loading;
  }
  function onReady(callback) {
    if (typeof callback !== 'function') return () => {};
    let active = true;
    const listener = available => { if (active) callback(available); };
    if (settled) Promise.resolve().then(() => { if (active) { try { callback(!!atlasImage); } catch (_) {} } });
    else listeners.add(listener);
    return () => { active = false; listeners.delete(listener); };
  }
  const EFFECTS = Object.freeze({
    idle: Object.freeze({ writing: false, resting: false, paused: false, completed: false, mark: null }),
    focus: Object.freeze({ writing: true, resting: false, paused: false, completed: false, mark: null }),
    rest: Object.freeze({ writing: false, resting: true, paused: false, completed: false, mark: 'leaf' }),
    paused: Object.freeze({ writing: false, resting: false, paused: true, completed: false, mark: 'pause' }),
    completed: Object.freeze({ writing: false, resting: false, paused: false, completed: true, mark: 'spark' })
  });
  function effects(status) {
    const name = status === 'running' || status === 'studying' || status === 'focusing' ? 'focus' : status === 'break' || status === 'resting' ? 'rest' : status === 'cancelled' ? 'paused' : status;
    return Object.prototype.hasOwnProperty.call(EFFECTS, name) ? EFFECTS[name] : EFFECTS.idle;
  }
  global.FocusSprites = Object.freeze({ ready, get, onReady, resolve, effects, appearanceKey, picture, pictureStatus, status, VERSION: 93, LIMITS: Object.freeze({ frameSize: SIZE, frames: CACHE_LIMIT, pictures: PICTURE_LIMIT, portraitSize: PORTRAIT_SIZE, atlasWidth: TILE * 2, atlasHeight: TILE * 2 }) });
})(typeof globalThis !== 'undefined' ? globalThis : window);
