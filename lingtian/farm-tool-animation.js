/* Transient farming tools. This module draws decorative tool gestures; it never
   changes crops, inventory, tool levels, or the server's cultivation clock. */
(function (global) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const between = (value, from, to) => smooth((value - from) / (to - from));
  const fraction = value => value - Math.floor(value);

  global.createSpiritFarmToolAnimator = function createSpiritFarmToolAnimator(options = {}) {
    const T = options.THREE || global.THREE, parent = options.parent;
    if (!T || !parent) return { playBatch() { return false; }, update() { return false; }, clear() {}, dispose() {}, get active() { return false; } };
    const lowDetail = !!options.lowDetail, reduced = !!options.reducedMotion;
    const positions = options.plotPositions || [];
    const YAW = .38, CAN_SCALE = 1.28, HOE_SCALE = 1.10;
    const HOE_RAISED_ANGLE = -1.30, HOE_CONTACT_ANGLE = -.62, HOE_SCRAPE_ANGLE = -.49;
    const HOE_SURFACE_OFFSET = .02;
    const root = new T.Group();
    root.name = 'spirit-farm-tool-animation'; root.visible = false; parent.add(root);
    const models = new Map(), geometries = new Set(), materials = new Set();
    const drops = [], debris = [], rings = [];
    const point = new T.Vector3(), offset = new T.Vector3(), nozzle = new T.Vector3();
    const direction = new T.Vector3(), tangent = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    const tip = new T.Vector3(), target = new T.Vector3(), anchor = new T.Vector3();
    const yaw = new T.Euler(0, YAW, 0), contactRotation = new T.Euler(0, YAW, HOE_CONTACT_ANGLE);
    let assets = null, tuft = null, model = null, batch = null, disposed = false;
    let startedAt = null, previousElapsed = 0, stepIndex = -1, needsPaint = false;

    function geometry(value) { geometries.add(value); return value; }
    function material(value) { materials.add(value); return value; }
    function mesh(shape, surface, name) {
      const value = new T.Mesh(shape, surface);
      value.name = name; value.castShadow = false; value.receiveShadow = false;
      value.visible = false; root.add(value); return value;
    }
    function invoke(callback, ...args) {
      // A decorative acknowledgement must never interrupt the main render loop.
      try { if (typeof callback === 'function') callback(...args); } catch (_) {}
    }
    function ensureEffects() {
      if (tuft) return;
      const bead = geometry(new T.SphereGeometry(1, lowDetail ? 5 : 7, lowDetail ? 3 : 4));
      const water = material(new T.MeshStandardMaterial({ color: 0xb4e6df, roughness: .2, metalness: .08,
        emissive: 0x6cb8af, emissiveIntensity: .18, transparent: true, opacity: .88, depthWrite: false }));
      const pearl = material(new T.MeshBasicMaterial({ color: 0xe3faf0, transparent: true, opacity: .92, depthWrite: false }));
      const count = lowDetail ? 16 : 28;
      for (let i = 0; i < count; i++) drops.push({
        node: mesh(bead, i % 5 ? water : pearl, 'spring-droplet'),
        source: new T.Vector3(), control: new T.Vector3(), destination: new T.Vector3(),
        phase: i / count, cycle: -1, radius: .027 + (i % 4) * .005,
      });
      const clod = geometry(new T.IcosahedronGeometry(1, 0));
      const leafShape = new T.Shape();
      leafShape.moveTo(0, -.10); leafShape.quadraticCurveTo(-.065, -.012, -.025, .075);
      leafShape.quadraticCurveTo(.025, .13, .045, .015); leafShape.quadraticCurveTo(.045, -.05, 0, -.10);
      const leaf = geometry(new T.ShapeGeometry(leafShape, lowDetail ? 3 : 5));
      const earth = [0x876544, 0x9b7955, 0x6e573e].map(color => material(new T.MeshStandardMaterial({ color, roughness: 1 })));
      const dryGrass = material(new T.MeshStandardMaterial({ color: 0xb69b65, roughness: .96, side: T.DoubleSide }));
      for (let i = 0; i < (lowDetail ? 10 : 16); i++) {
        const grass = i % 3 === 0;
        debris.push({ node: mesh(grass ? leaf : clod, grass ? dryGrass : earth[i % 3], grass ? 'dry-grass-fleck' : 'earth-crumb'),
          grass, phase: fraction(i * .61803398875), lift: .26 + (i % 4) * .065, radius: .33 + (i % 5) * .10 });
      }
      const ring = geometry(new T.RingGeometry(.82, 1, lowDetail ? 16 : 24));
      for (let i = 0; i < 5; i++) {
        const surface = material(new T.MeshBasicMaterial({ color: 0xc5e9da, side: T.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
        const node = mesh(ring, surface, 'spring-surface-ring'); node.rotation.x = -Math.PI / 2; rings.push(node);
      }
      tuft = new T.Group(); tuft.name = 'transient-withered-tuft'; root.add(tuft); tuft.visible = false;
      const stalk = geometry(new T.CylinderGeometry(.010, .018, .32, 4));
      for (let i = 0; i < 5; i++) {
        const stem = new T.Mesh(stalk, earth[i % 3]);
        stem.position.set((i - 2) * .07, .13, Math.sin(i * 2.4) * .10);
        stem.rotation.set(.26 * Math.sin(i * 1.7), 0, (i - 2) * .19);
        stem.castShadow = false; tuft.add(stem);
        const curl = new T.Mesh(leaf, dryGrass);
        curl.position.set((i - 2) * .08 + .045, .19 + (i % 2) * .055, Math.sin(i * 2.4) * .10);
        curl.rotation.set(.2, i * .8, .8 + i * .29); curl.castShadow = false; tuft.add(curl);
      }
    }
    function obtainModel(kind, level) {
      if (!assets) {
        if (typeof global.createSpiritFarmToolAssets !== 'function') return null;
        assets = global.createSpiritFarmToolAssets({ THREE: T, lowDetail });
      }
      const key = `${kind}:${level}`;
      if (!models.has(key)) {
        const value = kind === 'water' ? assets.createWateringCan(level) : assets.createHoe(level);
        if (!value?.group || !(kind === 'water' ? value.spout : value.bladeTip)?.isVector3) return null;
        value.group.visible = false; root.add(value.group); models.set(key, value);
      }
      return models.get(key);
    }
    function hideEffects() {
      drops.forEach(drop => { drop.node.visible = false; drop.cycle = -1; });
      debris.forEach(piece => { piece.node.visible = false; });
      rings.forEach(ring => { ring.visible = false; });
      if (tuft) tuft.visible = false;
    }
    function clear() {
      const visible = root.visible;
      root.visible = false; models.forEach(value => { value.group.visible = false; }); hideEffects();
      batch = null; model = null; startedAt = null; previousElapsed = 0; stepIndex = -1;
      delete root.userData.kind; delete root.userData.plotIndex;
      needsPaint = needsPaint || visible;
    }
    function finish() {
      const kind = batch?.kind;
      clear(); invoke(options.onComplete, kind);
    }
    function playBatch(kind, indices, level = 1, timing = {}) {
      if (disposed || (kind !== 'water' && kind !== 'clear') || !Array.isArray(indices)) return false;
      const valid = [...new Set(indices)].filter(index => Number.isInteger(index) && positions[index]
        && [positions[index].x, positions[index].y, positions[index].z].every(Number.isFinite)).slice(0, 5);
      if (!valid.length) return false;
      const tier = Math.max(1, Math.min(3, Math.floor(Number(level)) || 1));
      const nextModel = obtainModel(kind, tier); if (!nextModel) return false;
      clear(); ensureEffects(); model = nextModel;
      let total = 0;
      // A request preview makes one readable stroke. All linked fields receive
      // its impact together, instead of queueing five long, blocking strokes.
      const preview = Number.isFinite(timing.duration), previewDuration = Math.max(200,Math.min(900,timing.duration || 0));
      const steps = (preview ? valid.slice(0,1) : valid).map((index, order) => {
        const duration = preview ? previewDuration : kind === 'water' ? order ? 780 : 1500 : order ? 660 : 1200;
        const step = { index, point: positions[index].clone(), start: total, duration, notified: false };
        step.point.y -= .08; total += duration; return step;
      });
      batch = { kind, level: tier, steps, linked:preview ? valid : [], total:preview ? total : reduced ? 650 : total };
      root.visible = true; model.group.visible = true;
      root.userData.kind = kind; root.userData.plotIndex = steps[0].index;
      needsPaint = true; return true;
    }
    function impact(step) {
      if (step.notified) return;
      step.notified = true;
      (batch.linked.length ? batch.linked : [step.index]).forEach(index => invoke(options.onImpact, batch.kind, index));
    }
    function localPoint(value, output) {
      return output.copy(value).multiply(model.group.scale).applyQuaternion(model.group.quaternion).add(model.group.position);
    }
    function modelScale(base, progress, order) {
      const enter = order === 0 ? .01 + .99 * between(progress, 0, .12) : 1;
      const exit = order === batch.steps.length - 1 ? 1 - .99 * between(progress, .89, 1) : 1;
      model.group.scale.setScalar(base * enter * exit);
    }
    function placeCan(step, progress, order) {
      const first = order === 0, last = order === batch.steps.length - 1;
      anchor.copy(step.point);
      if (!first) anchor.lerpVectors(batch.steps[order - 1].point, step.point, between(progress, 0, .24));
      const tilt = -.035 - .64 * between(progress, .11, .28) + .64 * between(progress, .72, .88);
      offset.set(-1.14, 1.79 + (first ? .30 * (1 - between(progress, 0, .18)) : 0) + (last ? .35 * between(progress, .87, 1) : 0), .18).applyEuler(yaw);
      model.group.position.copy(anchor).add(offset);
      model.group.rotation.set(0, YAW, tilt); modelScale(CAN_SCALE, progress, order);
      localPoint(model.spout, nozzle);
      direction.copy(model.spoutDirection || point.set(.94, .34, 0)).applyQuaternion(model.group.quaternion).normalize();
    }
    function spray(step, elapsed) {
      const start = step.duration * .27, end = step.duration * .68, flight = step.duration * .22;
      const since = elapsed - start;
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i], launch = drop.phase * flight;
        const available = Math.floor((end - start - launch) / flight);
        const cycle = Math.min(available, Math.floor((since - launch) / flight));
        const age = since - launch - cycle * flight;
        if (since < launch || cycle < 0 || age < 0 || age >= flight) { drop.node.visible = false; continue; }
        if (drop.cycle !== cycle) {
          drop.cycle = cycle; drop.source.copy(nozzle);
          drop.control.copy(nozzle).addScaledVector(direction, .58);
          const angle = (i * 2.39996323 + cycle * .74), radius = .12 + (i % 6) * .067;
          drop.destination.copy(step.point); drop.destination.x += Math.cos(angle) * radius;
          drop.destination.z += Math.sin(angle) * radius; drop.destination.y += .025;
        }
        const t = age / flight, a = 1 - t;
        drop.node.position.copy(drop.source).multiplyScalar(a * a)
          .addScaledVector(drop.control, 2 * a * t).addScaledVector(drop.destination, t * t);
        tangent.subVectors(drop.control, drop.source).multiplyScalar(a)
          .addScaledVector(point.subVectors(drop.destination, drop.control), t).normalize();
        drop.node.quaternion.setFromUnitVectors(up, tangent);
        const size = drop.radius * Math.min(1, t * 9 + .22) * Math.min(1, (1 - t) * 9 + .15);
        drop.node.scale.set(size, size * (1.55 + t * .7), size); drop.node.visible = true;
      }
      const splashStart = start + flight * .78;
      const waveLife = step.duration * .25, splashCount = lowDetail ? 2 : 3;
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i], age = elapsed - splashStart - i * waveLife / splashCount;
        if (i >= splashCount || age < 0 || elapsed > end + flight) { ring.visible = false; continue; }
        const t = fraction(age / waveLife), radius = .08 + t * .32;
        ring.position.copy(step.point); ring.position.x += Math.sin(i * 2.5) * .24; ring.position.z += Math.cos(i * 2.5) * .24;
        ring.position.y += .026; ring.scale.setScalar(radius);
        ring.material.color.setHex(0xc9ede1); ring.material.opacity = .36 * (1 - t);
        ring.visible = true;
      }
    }
    function placeHoe(step, progress, order) {
      const first = order === 0, last = order === batch.steps.length - 1;
      anchor.copy(step.point);
      if (!first) anchor.lerpVectors(batch.steps[order - 1].point, step.point, between(progress, 0, .25));
      const strike = between(progress, .22, .47), scrape = between(progress, .49, .70), lift = between(progress, .73, .94);
      // The cutting edge extends along local +X. Swing from a negative Z
      // angle so that edge moves forward/down, then pull it toward the grip.
      // A positive raised angle made the blade travel heel-first and lie flat.
      const angle = HOE_RAISED_ANGLE + (HOE_CONTACT_ANGLE - HOE_RAISED_ANGLE) * strike
        + (HOE_SCRAPE_ANGLE - HOE_CONTACT_ANGLE) * scrape + (HOE_RAISED_ANGLE - HOE_SCRAPE_ANGLE) * lift;
      model.group.rotation.set(0, YAW, angle); modelScale(HOE_SCALE, progress, order);
      if (progress < .47) {
        offset.copy(model.bladeTip).multiplyScalar(HOE_SCALE).applyEuler(contactRotation);
        model.group.position.copy(anchor).sub(offset);
        model.group.position.y += HOE_SURFACE_OFFSET + .12 * (1 - strike) + (first ? .16 * (1 - between(progress, 0, .15)) : 0);
      } else {
        target.copy(step.point);
        offset.set(.36 * scrape, HOE_SURFACE_OFFSET, 0).applyEuler(yaw); target.add(offset);
        offset.copy(model.bladeTip).multiply(model.group.scale).applyQuaternion(model.group.quaternion);
        model.group.position.copy(target).sub(offset);
        // Return to the same raised grip pose used at the next plot. That keeps
        // the hoe continuous across a three/five-field batch instead of popping.
        offset.copy(model.bladeTip).multiplyScalar(HOE_SCALE).applyEuler(contactRotation);
        target.copy(step.point).sub(offset); target.y += HOE_SURFACE_OFFSET + .12;
        model.group.position.lerp(target, lift);
        if (last) model.group.position.y += .18 * between(progress, .89, 1);
      }
      localPoint(model.bladeTip, tip);
      tuft.visible = progress < .67;
      tuft.position.copy(step.point); tuft.position.y += .005;
      tuft.scale.setScalar(Math.max(.015, 1 - between(progress, .47, .66)));
      tuft.rotation.set(0, YAW, -.38 * scrape);
    }
    function earthFlecks(step, elapsed) {
      const hit = step.duration * .47, life = step.duration * .47, t = (elapsed - hit) / life;
      for (let i = 0; i < debris.length; i++) {
        const piece = debris[i], node = piece.node;
        if (t < 0 || t >= 1) { node.visible = false; continue; }
        const angle = piece.phase * Math.PI * 2;
        node.position.copy(step.point);
        node.position.x += Math.cos(angle) * piece.radius * t;
        node.position.z += Math.sin(angle) * piece.radius * t;
        node.position.y += .04 + Math.max(0, 4 * piece.lift * t * (1 - t));
        node.rotation.set(t * (5 + i % 3), angle + t * 4, t * (i % 2 ? 5 : -5));
        const fade = Math.pow(1 - t, .55);
        if (piece.grass) node.scale.setScalar((.75 + i % 3 * .18) * fade);
        else { const size = (.038 + i % 4 * .010) * fade; node.scale.set(size, size * .64, size * .8); }
        node.visible = true;
      }
      const ring = rings[0];
      ring.visible = t >= 0 && t < .8;
      if (ring.visible) {
        ring.position.copy(step.point); ring.position.y += .018;
        ring.scale.setScalar(.15 + t * .70); ring.material.color.setHex(0xd6bc82);
        ring.material.opacity = .28 * (1 - t / .8);
      }
    }
    function stillAcknowledgement(elapsed) {
      const step = batch.steps[0];
      model.group.scale.setScalar(batch.kind === 'water' ? CAN_SCALE : HOE_SCALE);
      if (batch.kind === 'water') {
        offset.set(-1.08, 1.55, .18).applyEuler(yaw);
        model.group.position.copy(step.point).add(offset); model.group.rotation.set(0, YAW, -.18);
      } else {
        model.group.rotation.set(0, YAW, HOE_CONTACT_ANGLE);
        offset.copy(model.bladeTip).multiply(model.group.scale).applyQuaternion(model.group.quaternion);
        model.group.position.copy(step.point).sub(offset); model.group.position.y += .10;
      }
      for (let i = 0; i < batch.steps.length; i++) {
        const item = batch.steps[i], ring = rings[i];
        if (elapsed >= 120) impact(item);
        ring.visible = elapsed >= 120;
        ring.position.copy(item.point); ring.position.y += .025; ring.scale.setScalar(.54);
        ring.material.color.setHex(batch.kind === 'water' ? 0xc9ede1 : 0xd6bc82); ring.material.opacity = .20;
      }
    }
    function update(nowMs) {
      if (disposed) return false;
      const changed = needsPaint; needsPaint = false;
      if (!batch) return changed;
      if (!Number.isFinite(nowMs)) return changed;
      if (startedAt === null) startedAt = nowMs;
      const elapsed = Math.max(previousElapsed, nowMs - startedAt); previousElapsed = elapsed;
      if (elapsed >= batch.total) { finish(); needsPaint = false; return true; }
      if (reduced) { stillAcknowledgement(elapsed); return true; }
      let order = batch.steps.length - 1;
      for (let i = 0; i < batch.steps.length; i++) if (elapsed < batch.steps[i].start + batch.steps[i].duration) { order = i; break; }
      if (stepIndex !== order) { hideEffects(); stepIndex = order; root.userData.plotIndex = batch.steps[order].index; }
      const step = batch.steps[order], local = elapsed - step.start, progress = clamp(local / step.duration);
      // Catch a skipped render tick without repeating a plot's acknowledgement.
      const at = batch.kind === 'water' ? .27 : .47;
      for (let i = 0; i <= order; i++) if (elapsed >= batch.steps[i].start + batch.steps[i].duration * at) impact(batch.steps[i]);
      if (batch.kind === 'water') { placeCan(step, progress, order); spray(step, local); }
      else { placeHoe(step, progress, order); earthFlecks(step, local); }
      return true;
    }
    function dispose() {
      if (disposed) return;
      clear(); disposed = true; root.removeFromParent();
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
      assets?.dispose(); assets = null; geometries.clear(); materials.clear(); models.clear();
      drops.length = 0; debris.length = 0; rings.length = 0; tuft = null;
    }
    return { playBatch, update, clear, dispose, get active() { return !!batch && !disposed; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
