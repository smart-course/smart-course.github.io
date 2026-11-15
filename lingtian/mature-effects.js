(function () {
  'use strict';

  // Each species has its own small effect. This layer never changes plant
  // materials, geometry, lighting or pose, and is driven by the scene's RAF.
  const COUNTS = Object.freeze({
    huangjing: { mobile: 16, desktop: 24 },
    zihou: { mobile: 16, desktop: 24 },
    tianling: { mobile: 6, desktop: 10 },
    jiuqu: { mobile: 8, desktop: 12 },
    yueyang: { mobile: 4, desktop: 6 }
  });
  const TAU = Math.PI * 2;
  // Keep the ginseng's small, wandering hops at the gentler playback speed.
  const JIUQU_TIME_SCALE = .60;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fract = v => v - Math.floor(v);
  const effectVariation = (seed, cycle, channel) => fract(Math.sin(seed * 91.7 + (cycle + 1) * 127.1 + channel * 311.7) * 43758.5453);
  const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
  function disabled() {
    return { enabled: false, attach() { return false; }, detach() {}, update() { return false; }, render() { return false; }, resize() {}, resetTime() {}, dispose() {} };
  }

  window.createSpiritMatureEffects = function createSpiritMatureEffects(options) {
    options = options || {};
    const T = options.THREE, container = options.container, camera = options.camera;
    const doc = container && (container.ownerDocument || window.document);
    if (!T || !container || !camera || !doc) return disabled();
    const canvas = doc.createElement('canvas');
    let ctx;
    try { ctx = canvas.getContext('2d', { alpha: true }); } catch (_) {}
    if (!ctx) return disabled();
    canvas.className = 'spirit-mature-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
    container.appendChild(canvas);

    const reduced = !!options.reducedMotion;
    const entries = new Map(), sprites = new Map(), visibleEntries = [];
    const viewProjection = new T.Matrix4(), clipPoint = new T.Vector4();
    const localMatrix = new T.Matrix4(), temporaryBox = new T.Box3();
    const cameraPosition = new T.Vector3(), orthoToCamera = new T.Vector3();
    const localPoint = new T.Vector3(), worldPoint = new T.Vector3(), normal = new T.Vector3(), viewDirection = new T.Vector3();
    const tipScreen = { x: 0, y: 0, z: 0, scale: 0 };
    let width = 1, height = 1, ratio = 1, clock = 0, lastTime = null;
    let disposed = false, painted = false, drawCount = 0;

    function mobileMode(entry) {
      return typeof options.isMobile === 'function' ? !!options.isMobile() : !!(entry && entry.mobile);
    }
    function screenPoint() { return { x: 0, y: 0, z: 0, scale: 0 }; }

    // These tiny sprites have no large halos or white star shapes. Gradients
    // are rasterized once, rather than recreated for every particle/frame.
    function sprite(kind) {
      if (sprites.has(kind)) return sprites.get(kind);
      const tile = doc.createElement('canvas'); tile.width = tile.height = 64;
      let c;
      try { c = tile.getContext('2d', { alpha: true }); } catch (_) {}
      if (!c) { sprites.set(kind, null); return null; }
      function radial(stops, radius) {
        const g = c.createRadialGradient(32, 32, 0, 32, 32, radius);
        for (const [at, color] of stops) g.addColorStop(at, color);
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      }
      c.save();
      if (kind === 'gold' || kind === 'gold-soft') {
        radial([[0, 'rgba(255,222,122,.78)'], [.48, 'rgba(246,195,79,.34)'], [1, 'rgba(222,151,36,0)']], 29);
        c.fillStyle = kind === 'gold' ? '#ffdb78' : '#eec05d';
        c.beginPath(); c.arc(32, 32, 13, 0, TAU); c.fill();
      } else if (kind === 'petal' || kind === 'petal-dark') {
        const g = c.createLinearGradient(19, 8, 42, 60);
        g.addColorStop(0, kind === 'petal' ? '#d09bdf' : '#b77dcc');
        g.addColorStop(.42, kind === 'petal' ? '#bd7acf' : '#a861bc');
        g.addColorStop(1, kind === 'petal' ? '#a85dbb' : '#9049a7');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(38, 5); c.bezierCurveTo(56, 23, 44, 47, 22, 59);
        c.bezierCurveTo(9, 42, 15, 19, 38, 5); c.fill();
        c.strokeStyle = 'rgba(211,158,226,.65)'; c.lineWidth = 1.7;
        c.beginPath(); c.moveTo(24, 53); c.quadraticCurveTo(36, 30, 37, 14); c.stroke();
      } else if (kind === 'dew' || kind === 'drip') {
        // Mostly transparent water, with a restrained rim and two tiny reflected
        // highlights. The fruit's original pigment remains visible through it.
        c.fillStyle = kind === 'drip' ? 'rgba(193,227,237,.55)' : 'rgba(237,248,251,.10)';
        c.strokeStyle = kind === 'drip' ? 'rgba(244,255,255,.98)' : 'rgba(255,255,247,.55)'; c.lineWidth = kind === 'drip' ? 4.8 : 3.8;
        c.beginPath(); c.moveTo(32, 7); c.bezierCurveTo(38, 20, 51, 30, 50, 43);
        c.bezierCurveTo(49, 61, 15, 62, 14, 43); c.bezierCurveTo(13, 30, 26, 20, 32, 7);
        c.closePath(); c.fill(); c.stroke();
        c.strokeStyle = kind === 'drip' ? 'rgba(89,150,169,.66)' : 'rgba(72,90,78,.16)'; c.lineWidth = kind === 'drip' ? 3.2 : 2.5;
        c.beginPath(); c.moveTo(21, 49); c.quadraticCurveTo(34, 59, 45, 47); c.stroke();
        c.strokeStyle = kind === 'drip' ? 'rgba(255,255,250,.98)' : 'rgba(255,255,250,.82)'; c.lineWidth = kind === 'drip' ? 5.0 : 4.0; c.lineCap = 'round';
        c.beginPath(); c.moveTo(25, 27); c.quadraticCurveTo(19, 34, 20, 39); c.stroke();
        c.fillStyle = 'rgba(255,255,248,.65)'; c.beginPath(); c.arc(39, 49, 2.3, 0, TAU); c.fill();
      } else if (kind === 'dew-glint') {
        radial([[0, 'rgba(255,255,244,1)'], [.28, 'rgba(255,255,246,.87)'], [.60, 'rgba(255,255,248,.18)'], [1, 'rgba(255,255,248,0)']], 29);
        c.fillStyle = '#fffef4'; c.beginPath(); c.arc(32, 32, 9, 0, TAU); c.fill();
      } else if (kind === 'rose' || kind === 'rose-dark') {
        radial([[0, 'rgba(199,64,107,.82)'], [.38, 'rgba(169,39,84,.39)'], [1, 'rgba(112,19,56,0)']], 28);
        c.fillStyle = kind === 'rose' ? '#ce5c88' : '#a43d62';
        c.beginPath(); c.arc(32, 32, 11, 0, TAU); c.fill();
      } else if (kind === 'silk-head') {
        radial([[0, 'rgba(207,246,207,.92)'], [.32, 'rgba(150,220,165,.55)'], [1, 'rgba(113,184,135,0)']], 28);
        c.fillStyle = '#c6efcc'; c.beginPath(); c.arc(32, 32, 10, 0, TAU); c.fill();
      }
      c.restore(); sprites.set(kind, tile); return tile;
    }

    function clear() {
      if (!painted || disposed) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
      painted = false;
    }
    function resize() {
      if (disposed) return false;
      const size = typeof options.getViewport === 'function' ? options.getViewport() : null;
      const w = Math.max(1, Math.round(Number(size && size.width) || container.clientWidth || 1));
      const h = Math.max(1, Math.round(Number(size && size.height) || container.clientHeight || 1));
      const requested = typeof options.getPixelRatio === 'function' ? options.getPixelRatio() : window.devicePixelRatio;
      const r = Math.min(clamp(Number(requested) || 1, 1, mobileMode() ? 1.5 : 2), Math.sqrt(6000000 / (w * h)));
      if (width === w && height === h && ratio === r && canvas.width === Math.round(w * r) && canvas.height === Math.round(h * r)) return false;
      width = w; height = h; ratio = r;
      canvas.width = Math.max(1, Math.round(w * r)); canvas.height = Math.max(1, Math.round(h * r)); painted = false;
      return true;
    }

    function readAnchors(source, needsNormal) {
      if (!Array.isArray(source)) return [];
      const anchors = [];
      const stride = Math.max(1, Math.ceil(source.length / 64));
      for (let i = 0; i < source.length && anchors.length < 64; i += stride) {
        const raw = source[i];
        if (!raw || !Array.isArray(raw.position) || raw.position.length !== 3 || !raw.position.every(Number.isFinite)) continue;
        if (needsNormal && (!Array.isArray(raw.normal) || raw.normal.length !== 3 || !raw.normal.every(Number.isFinite))) continue;
        const n = needsNormal ? new T.Vector3().fromArray(raw.normal) : new T.Vector3(0, 1, 0);
        if (n.lengthSq() < .0001) continue;
        n.normalize();
        const tangent = new T.Vector3(0, -1, 0).addScaledVector(n, n.y);
        if (tangent.lengthSq() < .01) tangent.set(0, 0, 1).addScaledVector(n, -n.z);
        tangent.normalize();
        const seed = fract(i * .618034 + .17);
        anchors.push({ position: new T.Vector3().fromArray(raw.position), normal: n, tangent,
          radius: clamp(Number(raw.radius) || (needsNormal ? .025 : .09), .004, needsNormal ? .10 : .35),
          seed, period: 3 + seed * 3, flashDuration: .30 + fract(i * .381966) * .20,
          world: new T.Vector3(), screen: screenPoint(), facing: 0, score: 0 });
        if (!needsNormal) {
          const bud = anchors[anchors.length - 1];
          const hasTip = Array.isArray(raw.tip) && raw.tip.length === 3 && raw.tip.every(Number.isFinite);
          bud.tip = hasTip ? new T.Vector3().fromArray(raw.tip) : bud.position.clone();
          if (!hasTip) bud.tip.y += bud.radius * 1.35;
        }
      }
      return anchors;
    }

    function attach(index, parent, settings) {
      if (disposed) return false;
      if (entries.has(index)) detach(index);
      if (!parent || !parent.isObject3D) return false;
      settings = settings || {};
      const cropId = Object.prototype.hasOwnProperty.call(COUNTS, settings.cropId) ? settings.cropId : 'huangjing';
      parent.updateWorldMatrix(true, true);
      const inverse = new T.Matrix4().copy(parent.matrixWorld).invert(), bounds = new T.Box3();
      parent.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry || mesh.userData.spiritMatureMotes) return;
        const geometry = mesh.geometry;
        if (geometry.boundingBox) temporaryBox.copy(geometry.boundingBox);
        else if (geometry.attributes && geometry.attributes.position) temporaryBox.setFromBufferAttribute(geometry.attributes.position);
        else return;
        if (temporaryBox.isEmpty()) return;
        localMatrix.multiplyMatrices(inverse, mesh.matrixWorld); temporaryBox.applyMatrix4(localMatrix); bounds.union(temporaryBox);
      });
      if (bounds.isEmpty()) bounds.set(new T.Vector3(-.65, 0, -.65), new T.Vector3(.65, 1.5, .65));
      const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
      const anchors = parent.userData.spiritMatureAnchors || {};
      const numericIndex = Number(index) || 0;
      const entry = { index, parent, cropId, mobile: !!settings.mobile,
        phase: fract(numericIndex * .381966 + Object.keys(COUNTS).indexOf(cropId) * .173) * TAU,
        height: Math.max(.55, bounds.max.y - Math.min(0, bounds.min.y)), centerX: center.x, centerZ: center.z,
        radiusX: clamp(size.x * .45, .25, 1.15), radiusZ: clamp(size.z * .45, .25, 1.15),
        matrix: new T.Matrix4(), normalMatrix: new T.Matrix3(), screen: screenPoint(), centerWorld: new T.Vector3(), toCamera: new T.Vector3(), worldScale: 1,
        particles: [], dew: readAnchors(anchors.dew, true), drips: readAnchors(anchors.drips, true), buds: readAnchors(anchors.buds, false), visibleDew: [], visibleDrips: [], trailSegments: [], activeSegments: [], trails: [] };
      for (let i = 0; i < COUNTS[cropId].desktop; i++) {
        const seed = fract(.21 + i * .618034 + numericIndex * .137);
        entry.particles.push({ seed, phase: seed * TAU, angle: i * 2.399963 + entry.phase * .41,
          radius: .25 + fract(i * .37 + .18) * .75, duration: (cropId === 'zihou' ? 5.0 : 3.5) + seed * 2.0, screen: screenPoint() });
      }
      if (cropId === 'tianling' && !reduced) {
        for (let i = 0; i < 3; i++) {
          const p = entry.particles[i];
          p.dripPeriod = 2.8 + p.seed * 1.4;
          p.dripGather = .60 + p.seed * .25;
          p.dripCycle = NaN; p.dripLaunched = false;
          p.dripOrigin = new T.Vector3(); p.dripWorld = new T.Vector3(); p.dripTailWorld = new T.Vector3();
          p.dripScreen = screenPoint(); p.dripTailScreen = screenPoint();
        }
      }
      if (cropId === 'jiuqu' && !entry.buds.length) {
        for (let i = 0; i < 6; i++) {
          const a = i * 2.399963;
          entry.buds.push({ position: new T.Vector3(center.x + Math.cos(a) * entry.radiusX * .42, entry.height * (.77 + (i % 3) * .08), center.z + Math.sin(a) * entry.radiusZ * .42), radius: .07 });
          const bud = entry.buds[entry.buds.length - 1];
          bud.tip = bud.position.clone(); bud.tip.y += bud.radius * 1.35;
        }
      }
      if (cropId === 'jiuqu') {
        // Sparse, staggered hops leave quiet gaps between short golden trails.
        const capacity = reduced ? 2 : COUNTS.jiuqu.desktop, steps = reduced ? 4 : 12;
        for (let strand = 0; strand < capacity; strand++) {
          const p = entry.particles[strand], points = [];
          p.origin = new T.Vector3(); p.launchCycle = NaN;
          p.gravity = 3.0;
          p.upSpeed = Math.sqrt(2 * p.gravity * .16);
          p.flight = 2 * p.upSpeed / p.gravity;
          p.tail = .22;
          p.period = 1.90 + p.seed * .75;
          p.outSpeed = .22;
          p.outAcceleration = .14;
          p.curl = 0;
          p.directionX = p.directionZ = 0;
          // One in four emitters opens into a tiny firework. Keep its reusable
          // points separate from the main trail so fading tails cannot hide it.
          p.burstSparks = [];
          if (!reduced && strand % 4 === 0) {
            p.burstOrigin = new T.Vector3();
            for (let spark = 0; spark < 6; spark++) p.burstSparks.push({
              velocity: new T.Vector3(), world: new T.Vector3(), tailWorld: new T.Vector3(),
              screen: screenPoint(), tailScreen: screenPoint()
            });
          }
          for (let k = 0; k <= steps; k++) points.push({ world: new T.Vector3(), screen: screenPoint(), valid: false });
          entry.trails.push(points);
          for (let k = 0; k < steps; k++) entry.trailSegments.push({ a: null, b: null, alpha: 0, width: 1, depth: 0, color: '#f6c85f' });
        }
      }
      if (cropId === 'yueyang') for (let s = 0; s < COUNTS.yueyang.desktop; s++) {
        const points = [];
        for (let k = 0; k <= 18; k++) points.push({ world: new T.Vector3(), screen: screenPoint(), front: 0, valid: false });
        entry.trails.push(points);
        for (let k = 0; k < 18; k++) entry.trailSegments.push({ a: null, b: null, alpha: 0, width: 1, depth: 0 });
      }
      entries.set(index, entry);
      return true;
    }
    function detach(index) {
      if (!entries.delete(index)) return;
      // Harvesting during a paused modal must not leave the old crop's effect.
      if (entries.size) render(); else clear();
    }

    function getWorld(entry, point, out) {
      if (typeof options.deformPoint === 'function') {
        const result = options.deformPoint(entry.index, point, out);
        if (result && Number.isFinite(result.x) && Number.isFinite(result.y) && Number.isFinite(result.z)) {
          if (result !== out) out.copy(result);
          return out;
        }
      }
      return out.copy(point).applyMatrix4(entry.parent.matrixWorld);
    }
    function projectWorld(entry, point, result) {
      clipPoint.set(point.x, point.y, point.z, 1).applyMatrix4(viewProjection);
      return finishProjection(entry, result);
    }
    function finishProjection(entry, result) {
      if (clipPoint.w <= 0 || clipPoint.z < -clipPoint.w || clipPoint.z > clipPoint.w) return false;
      const inv = 1 / clipPoint.w;
      result.x = (clipPoint.x * inv * .5 + .5) * width;
      result.y = (.5 - clipPoint.y * inv * .5) * height;
      result.z = clipPoint.z * inv;
      result.scale = Math.abs(camera.projectionMatrix.elements[5]) * height * .5 * inv * entry.worldScale;
      return Number.isFinite(result.x) && Number.isFinite(result.y) && Number.isFinite(result.scale);
    }
    function projectLocal(entry, x, y, z, result) {
      clipPoint.set(x, y, z, 1).applyMatrix4(entry.matrix);
      return finishProjection(entry, result);
    }
    function projectSurface(entry, point, result, outWorld) {
      return projectWorld(entry, getWorld(entry, point, outWorld || worldPoint), result);
    }
    function drawBitmap(bitmap, x, y, w, h, alpha, rotation) {
      if (!bitmap || alpha < .015 || x + w < 0 || x - w > width || y + h < 0 || y - h > height) return;
      ctx.save(); ctx.translate(x, y); if (rotation) ctx.rotate(rotation);
      ctx.globalAlpha = clamp(alpha, 0, 1); ctx.drawImage(bitmap, -w / 2, -h / 2, w, h); ctx.restore(); drawCount++;
    }

    function drawGoldDust(entry) {
      const count = reduced ? 2 : mobileMode(entry) ? 16 : 24;
      for (let i = 0; i < count; i++) {
        const p = entry.particles[i], travel = reduced ? .45 + i * .23 : fract(clock / p.duration + p.seed);
        const x = entry.centerX + Math.cos(p.angle) * entry.radiusX * p.radius + (travel - .3) * .10 + (reduced ? 0 : Math.sin(clock * .80 + p.phase) * .045);
        const z = entry.centerZ + Math.sin(p.angle) * entry.radiusZ * p.radius - travel * .055;
        const y = entry.height * (.42 + fract(i * .37) * .28 + travel * (.42 + p.seed * .16));
        if (!projectLocal(entry, x, y, z, p.screen)) continue;
        const fade = reduced ? .72 : smooth(0, .09, travel) * (1 - smooth(.78, 1, travel));
        const alpha = fade * (reduced ? 1 : .72 + .23 * Math.sin(clock * 1.05 + p.phase) ** 2);
        const size = clamp(p.screen.scale * .10, 2.8, 5.8);
        drawBitmap(sprite(i % 4 ? 'gold' : 'gold-soft'), p.screen.x, p.screen.y, size, size, alpha, 0);
      }
    }

    function drawPurplePetals(entry) {
      const count = reduced ? 2 : mobileMode(entry) ? 16 : 24;
      for (let i = 0; i < count; i++) {
        const p = entry.particles[i], travel = reduced ? .25 + i * .32 : fract(clock / p.duration + p.seed);
        const sway = reduced ? 0 : Math.sin(clock * .76 + p.phase);
        // Start beside the blossoms and gently drift outward as petals fall,
        // keeping their small purple silhouettes readable against the air.
        const ring = .91 + p.radius * .16 + travel * .18;
        const angle = p.angle + sway * .12;
        const x = entry.centerX + Math.cos(angle) * entry.radiusX * ring;
        const z = entry.centerZ + Math.sin(angle) * entry.radiusZ * ring;
        const y = entry.height * (1.04 + p.seed * .13 - travel * (.77 + fract(i * .27) * .12));
        if (!projectLocal(entry, x, y, z, p.screen)) continue;
        const fade = reduced ? .72 : smooth(0, .08, travel) * (1 - smooth(.84, 1, travel));
        const alpha = fade * (reduced ? 1 : .69 + .25 * Math.sin(clock * .88 + p.phase) ** 2);
        const size = clamp(p.screen.scale * .18, 5.2, 12);
        const flip = reduced ? .91 : .62 + .38 * Math.abs(Math.cos(clock * .83 + p.phase));
        const rotation = p.phase * .32 + (reduced ? 0 : sway * .53);
        drawBitmap(sprite(i % 3 ? 'petal' : 'petal-dark'), p.screen.x, p.screen.y, size * flip, size, alpha, rotation);
      }
    }

    function drawFruitDew(entry) {
      // No guessed floating fallback: droplets need real fruit-surface anchors.
      const visible = entry.visibleDew; visible.length = 0;
      for (const drop of entry.dew) {
        if (!projectSurface(entry, drop.position, drop.screen, drop.world)) continue;
        if (drop.screen.x < -10 || drop.screen.x > width + 10 || drop.screen.y < -10 || drop.screen.y > height + 10) continue;
        normal.copy(drop.normal).applyMatrix3(entry.normalMatrix).normalize();
        if (camera.isPerspectiveCamera) viewDirection.subVectors(cameraPosition, drop.world).normalize(); else viewDirection.copy(orthoToCamera);
        drop.facing = normal.dot(viewDirection);
        if (drop.facing <= .08) continue;
        drop.score = drop.facing + drop.seed * .12;
        visible.push(drop);
      }
      visible.sort((a, b) => b.score - a.score);
      const count = Math.min(visible.length, reduced ? 2 : mobileMode(entry) ? 6 : 10);
      for (let i = 0; i < count; i++) {
        const drop = visible[i], s = drop.screen;
        const facing = smooth(.08, .55, drop.facing);
        const size = clamp(drop.radius * 2 * s.scale / .78, 2.9, 8.8);
        let rotation = 0;
        localPoint.copy(drop.position).addScaledVector(drop.tangent, drop.radius);
        if (projectSurface(entry, localPoint, tipScreen)) rotation = Math.atan2(tipScreen.y - s.y, tipScreen.x - s.x) - Math.PI / 2;
        const flat = .54 + .46 * clamp(drop.facing, 0, 1);
        drawBitmap(sprite('dew'), s.x, s.y, size * flat, size, (.56 + .20 * drop.facing) * facing, rotation);
        if (!reduced) {
          const elapsed = fract(clock / drop.period + drop.seed + entry.phase / TAU) * drop.period;
          const flash = smooth(0, .075, elapsed) * (1 - smooth(drop.flashDuration * .64, drop.flashDuration, elapsed));
          if (flash > .015) {
            const glintSize = clamp(size * .88, 3.4, 7.0);
            drawBitmap(sprite('dew-glint'), s.x - size * .12, s.y - size * .15, glintSize, glintSize, flash * facing * .88, 0);
          }
        }
      }
    }

    function sampleFruitDrop(p, t, out) {
      return out.set(p.dripOrigin.x + p.dripDriftX * t,
        p.dripOrigin.y - .08 * t - .68 * t * t,
        p.dripOrigin.z + p.dripDriftZ * t);
    }

    function drawFruitDrips(entry) {
      if (reduced || !entry.drips.length) return;
      const visible = entry.visibleDrips; visible.length = 0;
      for (const anchor of entry.drips) {
        if (!projectSurface(entry, anchor.position, anchor.screen, anchor.world)) continue;
        if (anchor.screen.x < -12 || anchor.screen.x > width + 12 || anchor.screen.y < -12 || anchor.screen.y > height + 12) continue;
        visible.push(anchor);
      }
      // The camera looks down on fruit bottoms, so their downward normals must
      // not be culled like dew. Prefer the nearer half of the actual fruit tips.
      visible.sort((a, b) => a.screen.z - b.screen.z);
      const candidates = Math.ceil(visible.length * .5);
      const mobile = mobileMode(entry), count = mobile ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const p = entry.particles[i], phase = clock / p.dripPeriod + p.seed;
        const cycle = Math.floor(phase), age = (phase - cycle) * p.dripPeriod;
        if (p.dripCycle !== cycle) {
          if (!candidates) continue;
          p.dripSource = visible[Math.floor(effectVariation(p.seed, cycle, 24) * candidates)];
          p.dripDuration = .72 + effectVariation(p.seed, cycle, 25) * .14;
          const direction = effectVariation(p.seed, cycle, 26) * TAU;
          p.dripDriftX = Math.cos(direction) * .025; p.dripDriftZ = Math.sin(direction) * .025;
          p.dripLaunched = false; p.dripCycle = cycle;
        }
        if (age >= p.dripGather + p.dripDuration) continue;
        const falling = age >= p.dripGather, fallAge = Math.max(0, age - p.dripGather);
        // Condensation follows the swaying fruit; released water falls from a
        // fixed world-space point instead of continuing to sway with the tree.
        if (!p.dripLaunched) getWorld(entry, p.dripSource.position, p.dripOrigin);
        if (falling) p.dripLaunched = true;
        sampleFruitDrop(p, fallAge, p.dripWorld);
        if (!projectWorld(entry, p.dripWorld, p.dripScreen)) continue;
        // Larger drops disappear naturally just above the root/soil level.
        const groundFade = falling ? smooth(.025 * entry.worldScale, .13 * entry.worldScale,
          p.dripWorld.y - entry.parent.matrixWorld.elements[13]) : 1;
        const fade = (falling ? 1 - smooth(p.dripDuration * .74, p.dripDuration, fallAge) : smooth(0, .15, age)) * groundFade;
        if (fade < .015) continue;
        const growth = falling ? 1 : .52 + .48 * smooth(0, p.dripGather, age);
        const size = clamp(p.dripSource.radius * 2 * p.dripScreen.scale / .43, mobile ? 6.4 : 7, mobile ? 9.2 : 10.6) * growth;
        const dropHeight = size * (falling ? 1.42 + .25 * fallAge / p.dripDuration : 1.24);
        if (falling && fallAge > .02) {
          sampleFruitDrop(p, Math.max(0, fallAge - .095), p.dripTailWorld);
          if (projectWorld(entry, p.dripTailWorld, p.dripTailScreen)) {
            ctx.save(); ctx.strokeStyle = '#d3edf0'; ctx.lineWidth = .95; ctx.globalAlpha = fade * .38;
            ctx.beginPath(); ctx.moveTo(p.dripTailScreen.x, p.dripTailScreen.y + dropHeight * .34);
            ctx.lineTo(p.dripScreen.x, p.dripScreen.y + dropHeight * .34); ctx.stroke(); ctx.restore(); drawCount++;
          }
        }
        const y = p.dripScreen.y + dropHeight * .34;
        drawBitmap(sprite('drip'), p.dripScreen.x, y, size, dropHeight, fade * .97, 0);
        const glint = smooth(p.dripGather * .74, p.dripGather * .90, age) * (1 - smooth(p.dripGather, p.dripGather + .12, age));
        if (glint > .015) drawBitmap(sprite('dew-glint'), p.dripScreen.x - size * .10, y - dropHeight * .15, mobile ? 4.3 : 4.7, mobile ? 4.3 : 4.7, glint * .82 * groundFade, 0);
      }
    }

    function sampleBudHop(p, t, out) {
      const outward = p.outSpeed * t + .5 * p.outAcceleration * t * t;
      const sideways = Math.sin(Math.PI * t / p.flight) * p.curl;
      return out.set(p.origin.x + p.directionX * outward - p.directionZ * sideways,
        p.origin.y + p.upSpeed * t - .5 * p.gravity * t * t,
        p.origin.z + p.directionZ * outward + p.directionX * sideways);
    }

    function sampleBudEmber(p, spark, t, out) {
      // A small expanding bloom slows down before the last embers fall away.
      const travel = t * (1 - .30 * t / p.burstDuration);
      return out.copy(p.burstOrigin).addScaledVector(spark.velocity, travel)
        .addScaledVector(normal.set(0, -1, 0), .32 * t * t);
    }

    function drawBudFirework(entry, p, mobile) {
      if (!p.burstSparks.length) return;
      const age = p.age - p.burstAt;
      if (age <= 0 || age >= p.burstDuration) return;
      const alpha = .88 * smooth(0, .055, age) * (1 - smooth(.16, p.burstDuration, age));
      if (alpha < .015) return;
      const count = Math.min(p.sparkCount, mobile ? 4 : 6);
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#efbd57';
      for (let i = 0; i < count; i++) {
        const spark = p.burstSparks[i];
        sampleBudEmber(p, spark, age, spark.world);
        sampleBudEmber(p, spark, Math.max(0, age - .10), spark.tailWorld);
        if (!projectWorld(entry, spark.world, spark.screen) || !projectWorld(entry, spark.tailWorld, spark.tailScreen)) continue;
        ctx.globalAlpha = alpha * .72;
        ctx.lineWidth = clamp(spark.screen.scale * .025, .8, 1.15);
        ctx.beginPath(); ctx.moveTo(spark.tailScreen.x, spark.tailScreen.y); ctx.lineTo(spark.screen.x, spark.screen.y); ctx.stroke(); drawCount++;
        const size = clamp(spark.screen.scale * .075, 3.3, mobile ? 4.7 : 5.2);
        drawBitmap(sprite('gold'), spark.screen.x, spark.screen.y, size, size, alpha, 0);
      }
      ctx.restore();
    }

    function drawBudSparks(entry) {
      const mobile = mobileMode(entry), count = reduced ? 2 : mobile ? COUNTS.jiuqu.mobile : COUNTS.jiuqu.desktop;
      const steps = reduced ? 4 : mobile ? 8 : 12;
      const segments = entry.activeSegments; segments.length = 0;
      let segmentCount = 0;
      for (let strand = 0; strand < count; strand++) {
        const p = entry.particles[strand], points = entry.trails[strand];
        const phase = reduced ? 0 : clock * JIUQU_TIME_SCALE / p.period + p.seed;
        const cycle = Math.floor(phase);
        const age = reduced ? p.flight * (.34 + strand * .04) : (phase - cycle) * p.period;
        p.age = age; p.headAlpha = 0;
        if (p.launchCycle !== cycle) {
          const budIndex = reduced ? Math.floor(strand * entry.buds.length / count) : Math.floor(effectVariation(p.seed, cycle, 0) * entry.buds.length);
          const bud = entry.buds[budIndex];
          // Only the nozzle follows the swaying bud. Once emitted, its origin
          // stays in world space, so the golden tail does not rock with leaves.
          getWorld(entry, bud.tip, p.origin);
          // Sample once per hop, never once per frame: the direction can change
          // freely through 360 degrees while each individual trail stays smooth.
          const direction = reduced ? p.angle : effectVariation(p.seed, cycle, 1) * TAU;
          if (!reduced) {
            p.upSpeed = Math.sqrt(2 * p.gravity * (.14 + effectVariation(p.seed, cycle, 2) * .22));
            p.flight = 2 * p.upSpeed / p.gravity;
            p.outSpeed = .16 + effectVariation(p.seed, cycle, 3) * .20;
            p.outAcceleration = .08 + effectVariation(p.seed, cycle, 4) * .18;
            p.tail = .18 + effectVariation(p.seed, cycle, 5) * .12;
            p.curl = (effectVariation(p.seed, cycle, 6) - .5) * .13;
          }
          p.directionX = Math.cos(direction); p.directionZ = Math.sin(direction);
          if (p.burstSparks.length) {
            p.burstAt = p.flight * .5;
            p.burstDuration = .52 + effectVariation(p.seed, cycle, 7) * .14;
            p.sparkCount = mobile ? 4 : 6;
            sampleBudHop(p, p.burstAt, p.burstOrigin);
            const rotation = effectVariation(p.seed, cycle, 8) * TAU;
            for (let i = 0; i < p.sparkCount; i++) {
              const spark = p.burstSparks[i], y = 1 - 2 * (i + .5) / p.sparkCount;
              const radius = Math.sqrt(1 - y * y);
              const angle = rotation + i * 2.399963 + (effectVariation(p.seed, cycle, 9 + i) - .5) * .30;
              const speed = .36 + effectVariation(p.seed, cycle, 15 + i) * .16;
              spark.velocity.set(Math.cos(angle) * radius * speed, y * speed + .08, Math.sin(angle) * radius * speed);
            }
          }
          p.launchCycle = cycle;
        }
        const end = p.burstSparks.length ? p.burstAt : p.flight;
        const headTime = Math.min(age, end), tailTime = Math.max(0, age - p.tail);
        if (tailTime >= headTime) continue;
        const fade = reduced ? .62 : smooth(0, .07, age) * (1 - smooth(end * .83, end + p.tail, age));
        if (fade < .015) continue;
        for (let k = 0; k <= steps; k++) {
          const t = headTime + (tailTime - headTime) * k / steps;
          const point = points[k];
          sampleBudHop(p, t, point.world);
          point.valid = projectWorld(entry, point.world, point.screen);
        }
        p.headAlpha = reduced ? 0 : fade * (1 - smooth(end - .04, end + .06, age));
        for (let k = steps - 1; k >= 0; k--) {
          const a = points[k + 1], b = points[k];
          if (!a.valid || !b.valid) continue;
          if (Math.max(a.screen.x, b.screen.x) < -2 || Math.min(a.screen.x, b.screen.x) > width + 2 || Math.max(a.screen.y, b.screen.y) < -2 || Math.min(a.screen.y, b.screen.y) > height + 2) continue;
          const along = 1 - (k + .5) / steps, segment = entry.trailSegments[segmentCount++];
          segment.a = a.screen; segment.b = b.screen;
          segment.alpha = .90 * fade * Math.pow(along, .70);
          segment.width = clamp(b.screen.scale * .04, 1.05, 1.65) * (.18 + .82 * along);
          segment.depth = (a.screen.z + b.screen.z) * .5;
          segment.color = along > .55 ? '#ffe092' : '#edb344';
          segments.push(segment);
        }
      }
      // Brief golden wisps dart away in varied directions, with quiet gaps and
      // fine fading tails that leave the red buds clearly visible.
      segments.sort((a, b) => b.depth - a.depth);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const line of segments) {
        if (line.alpha < .018) continue;
        ctx.strokeStyle = line.color; ctx.globalAlpha = line.alpha; ctx.lineWidth = line.width;
        ctx.beginPath(); ctx.moveTo(line.a.x, line.a.y); ctx.lineTo(line.b.x, line.b.y); ctx.stroke(); drawCount++;
      }
      ctx.restore();
      for (let strand = 0; strand < count; strand++) {
        const p = entry.particles[strand], head = entry.trails[strand][0];
        if (head.valid && p.headAlpha > .015) {
          const size = clamp(head.screen.scale * .075, 3.1, mobile ? 4.6 : 5.0);
          drawBitmap(sprite('gold'), head.screen.x, head.screen.y, size, size, p.headAlpha * .86, 0);
        }
        // Analytic age keeps the bloom reliable even when a frame skips its apex.
        if (!reduced) drawBudFirework(entry, p, mobile);
      }
    }

    function drawSoulSilks(entry) {
      const mobile = mobileMode(entry), count = reduced ? 2 : mobile ? COUNTS.yueyang.mobile : COUNTS.yueyang.desktop;
      const steps = reduced ? 4 : mobile ? 12 : 18, span = reduced ? .30 : 1.55;
      const segments = entry.activeSegments; segments.length = 0;
      let segmentCount = 0;
      for (let strand = 0; strand < count; strand++) {
        const points = entry.trails[strand];
        const headAngle = (reduced ? 0 : clock * (.78 + strand * .045)) + entry.phase + strand * TAU / count;
        for (let k = 0; k <= steps; k++) {
          const age = k / steps, a = headAngle - age * span;
          const x = entry.centerX + Math.cos(a) * entry.radiusX * (1.05 + .045 * Math.sin(a * 1.3));
          const z = entry.centerZ + Math.sin(a) * entry.radiusZ * 1.04;
          const y = entry.height * (.57 + strand / Math.max(1, count - 1) * .34 + .09 * Math.sin(a * .92 + strand * 1.24));
          localPoint.set(x, y, z);
          const point = points[k]; point.valid = projectSurface(entry, localPoint, point.screen, point.world);
          normal.set(x - entry.centerX, 0, z - entry.centerZ).transformDirection(entry.parent.matrixWorld);
          point.front = .14 + .86 * smooth(-.20, .28, normal.dot(entry.toCamera));
        }
        for (let k = steps - 1; k >= 0; k--) {
          const a = points[k + 1], b = points[k];
          if (!a.valid || !b.valid) continue;
          const tail = smooth(0, 1, 1 - (k + .5) / steps), segment = entry.trailSegments[segmentCount++];
          segment.a = a.screen; segment.b = b.screen;
          segment.alpha = (reduced ? .48 : .90) * tail * (a.front + b.front) * .5;
          segment.width = clamp(b.screen.scale * .055, 1.4, mobile ? 2.45 : 3.0) * (.55 + .45 * tail);
          segment.depth = (a.screen.z + b.screen.z) * .5;
          segments.push(segment);
        }
      }
      // Layer the fuller threads around the crown, with dim far-side arcs and
      // tapering tails. Open strands preserve the plant's original colours.
      segments.sort((a, b) => b.depth - a.depth);
      ctx.save(); ctx.strokeStyle = '#a0dfaf'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const line of segments) {
        if (line.alpha < .018) continue;
        ctx.globalAlpha = line.alpha; ctx.lineWidth = line.width;
        ctx.beginPath(); ctx.moveTo(line.a.x, line.a.y); ctx.lineTo(line.b.x, line.b.y); ctx.stroke(); drawCount++;
      }
      ctx.restore();
      for (let strand = 0; strand < count; strand++) {
        const head = entry.trails[strand][0]; if (!head.valid) continue;
        const size = clamp(head.screen.scale * .14, 3.8, 6.2);
        drawBitmap(sprite('silk-head'), head.screen.x, head.screen.y, size, size, (reduced ? .42 : .82) * head.front, 0);
      }
    }

    function render() {
      if (disposed) return false;
      resize(); clear(); if (!entries.size) return false;
      camera.updateWorldMatrix(true, false);
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      const m = camera.matrixWorld.elements; orthoToCamera.set(m[8], m[9], m[10]).normalize();
      visibleEntries.length = 0;
      entries.forEach(entry => {
        let object = entry.parent;
        while (object) { if (!object.visible) return; object = object.parent; }
        entry.parent.updateWorldMatrix(true, false);
        entry.matrix.multiplyMatrices(viewProjection, entry.parent.matrixWorld);
        entry.normalMatrix.getNormalMatrix(entry.parent.matrixWorld);
        entry.worldScale = entry.parent.matrixWorld.getMaxScaleOnAxis();
        localPoint.set(entry.centerX, entry.height * .76, entry.centerZ);
        if (!projectSurface(entry, localPoint, entry.screen, entry.centerWorld)) return;
        if (camera.isPerspectiveCamera) entry.toCamera.subVectors(cameraPosition, entry.centerWorld).normalize(); else entry.toCamera.copy(orthoToCamera);
        const margin = clamp(entry.screen.scale * Math.max(entry.radiusX * 1.2, entry.radiusZ * 1.2, entry.height * .76) + 20, 30, 280);
        const fountainMargin = entry.cropId === 'jiuqu' ? entry.screen.scale * .80 / Math.max(.1, entry.worldScale) : 0;
        const s = entry.screen;
        if (s.x < -margin - fountainMargin || s.x > width + margin + fountainMargin || s.y < -margin - fountainMargin || s.y > height + margin + fountainMargin) return;
        visibleEntries.push(entry);
      });
      visibleEntries.sort((a, b) => b.screen.z - a.screen.z);
      drawCount = 0;
      ctx.save(); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
      ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
      for (const entry of visibleEntries) {
        if (entry.cropId === 'huangjing') drawGoldDust(entry);
        else if (entry.cropId === 'zihou') drawPurplePetals(entry);
        else if (entry.cropId === 'tianling') { drawFruitDew(entry); drawFruitDrips(entry); }
        else if (entry.cropId === 'jiuqu') drawBudSparks(entry);
        else if (entry.cropId === 'yueyang') drawSoulSilks(entry);
      }
      ctx.restore(); painted = drawCount > 0; return painted;
    }
    function update(seconds) {
      if (disposed || !Number.isFinite(seconds)) return false;
      if (!reduced && lastTime !== null) { const delta = seconds - lastTime; if (delta > 0) clock += Math.min(delta, .35); }
      lastTime = seconds;
      return !reduced && entries.size > 0;
    }

    resize();
    return {
      enabled: true, attach, detach, update, render, resize,
      resetTime() { lastTime = null; },
      dispose() {
        if (disposed) return;
        clear(); disposed = true; entries.clear(); visibleEntries.length = 0;
        sprites.forEach(tile => { if (tile) tile.width = tile.height = 1; }); sprites.clear();
        canvas.remove(); canvas.width = canvas.height = 1; lastTime = null;
      }
    };
  };
})();
