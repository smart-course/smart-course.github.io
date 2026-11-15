(function () {
  'use strict';

  // Distances are world units. The low root band stays completely still;
  // broad bends reach the crown early, so the default garden view has a clear
  // silhouette change while flowers and fruit keep their full, solid shapes.
  const PROFILES = Object.freeze({
    huangjing: { anchor: .16, amplitude: .200, speed: 1.12, flutter: .0030, lag: .38 },
    zihou:    { anchor: .15, amplitude: .330, speed: 1.43, flutter: .0090, lag: .68 },
    tianling: { anchor: .24, amplitude: .280, speed: 1.08, flutter: .0025, lag: .90 },
    yueyang:  { anchor: .24, amplitude: .320, speed: 1.27, flutter: .0090, lag: .62 },
    jiuqu:    { anchor: .38, amplitude: .280, speed: 1.32, flutter: .0050, lag: .54 }
  });

  const WIND_PARS = `
uniform vec3 uSpiritRoot;
uniform vec2 uSpiritHeight;
uniform vec4 uSpiritBend;
uniform vec2 uSpiritFine;

void spiritWindAt(vec3 p, out vec2 bend, out vec2 slopeX, out vec2 slopeY, out vec2 slopeZ) {
  float span = max(0.25, uSpiritHeight.y - uSpiritHeight.x);
  float h = clamp((p.y - uSpiritHeight.x) / span, 0.0, 1.0);
  // C1-continuous masks: the main bend is already complete at 70% of the
  // flexible stem, so most of the mature crown travels together. The later
  // mask gives the tips a softer, slightly delayed return after each gust.
  float crown = clamp(h / 0.70, 0.0, 1.0);
  float late = clamp((h - 0.18) / 0.72, 0.0, 1.0);
  float mainWeight = crown * crown * (3.0 - 2.0 * crown);
  float lateWeight = late * late * (3.0 - 2.0 * late);
  float mainSlope = 6.0 * crown * (1.0 - crown) / (0.70 * span);
  float lateSlope = 6.0 * late * (1.0 - late) / (0.72 * span);
  float phase = dot(p.xz, vec2(1.18, 0.86)) + uSpiritFine.y;
  float fine = sin(phase) * uSpiritFine.x;
  float gradient = cos(phase) * uSpiritFine.x * lateWeight;
  vec2 direction = vec2(0.844, -0.536);
  bend = uSpiritBend.xy * mainWeight + uSpiritBend.zw * lateWeight + direction * fine * lateWeight;
  slopeY = uSpiritBend.xy * mainSlope + uSpiritBend.zw * lateSlope + direction * fine * lateSlope;
  slopeX = direction * gradient * 1.18;
  slopeZ = direction * gradient * 0.86;
}

// modelMatrix supplies each mesh's existing rotation/scale. Converting the
// shared world offset back to local space keeps procedural stems, petals and
// fruit joined, even when those pieces have different local transforms.
vec3 spiritWorldToLocal(vec3 offset) {
  vec3 a = modelMatrix[0].xyz;
  vec3 b = modelMatrix[1].xyz;
  vec3 c = modelMatrix[2].xyz;
  vec3 r0 = cross(b, c);
  vec3 r1 = cross(c, a);
  vec3 r2 = cross(a, b);
  float determinant = dot(a, r0);
  return vec3(dot(r0, offset), dot(r1, offset), dot(r2, offset)) / determinant;
}
`;

  const WIND_BEGIN_NORMAL = `
#include <beginnormal_vertex>
vec3 spiritPosition = (modelMatrix * vec4(position, 1.0)).xyz - uSpiritRoot;
vec2 spiritBend, spiritSlopeX, spiritSlopeY, spiritSlopeZ;
spiritWindAt(spiritPosition, spiritBend, spiritSlopeX, spiritSlopeY, spiritSlopeZ);
`;

  const WIND_DEFAULT_NORMAL = `
#include <defaultnormal_vertex>
// Apply the inverse-transpose of the small bend's Jacobian in world space.
// Fruit highlights and the undersides of leaves therefore move with the plant.
vec3 spiritWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
vec3 spiritDX = vec3(1.0 + spiritSlopeX.x, 0.0, spiritSlopeX.y);
vec3 spiritDY = vec3(spiritSlopeY.x, 1.0, spiritSlopeY.y);
vec3 spiritDZ = vec3(spiritSlopeZ.x, 0.0, 1.0 + spiritSlopeZ.y);
spiritWorldNormal = normalize(
  cross(spiritDY, spiritDZ) * spiritWorldNormal.x
  + cross(spiritDZ, spiritDX) * spiritWorldNormal.y
  + cross(spiritDX, spiritDY) * spiritWorldNormal.z
);
transformedNormal = mat3(viewMatrix) * spiritWorldNormal;
`;

  const WIND_BEGIN_VERTEX = `
#include <begin_vertex>
transformed += spiritWorldToLocal(vec3(spiritBend.x, 0.0, spiritBend.y));
`;

  const MOTE_VERTEX = `
uniform float uSpiritTime;
uniform float uSpiritViewport;
uniform float uSpiritPixelRatio;
attribute vec3 spiritSeed;
varying float vSpiritAlpha;
void main() {
  float travel = fract(uSpiritTime * spiritSeed.y + spiritSeed.x);
  float phase = spiritSeed.x * 6.2831853;
  vec3 moved = position;
  moved.x += travel * 0.12 + sin(uSpiritTime * 0.62 + phase) * 0.055;
  moved.z += -travel * 0.075 + cos(uSpiritTime * 0.48 + phase) * 0.04;
  moved.y += travel * 0.40;
  vSpiritAlpha = smoothstep(0.0, 0.18, travel) * (1.0 - smoothstep(0.65, 1.0, travel));
  vSpiritAlpha *= 0.70 + 0.18 * sin(uSpiritTime * 1.6 + phase);
  vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Clip w is 1 for the garden's orthographic camera, and -viewZ for a
  // perspective camera. Both therefore retain the same small world size.
  gl_PointSize = clamp(0.5 * spiritSeed.z * uSpiritViewport * uSpiritPixelRatio
    * projectionMatrix[1][1] / max(0.1, abs(gl_Position.w)),
    1.1 * uSpiritPixelRatio, 5.0 * uSpiritPixelRatio);
}
`;

  const MOTE_FRAGMENT = `
uniform vec3 uSpiritTint;
varying float vSpiritAlpha;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float radius = length(p);
  float halo = 1.0 - smoothstep(0.07, 0.48, radius);
  float core = 1.0 - smoothstep(0.0, 0.17, radius);
  float rays = pow(max(0.0, 1.0 - abs(p.x) * 12.0), 3.0) * max(0.0, 1.0 - abs(p.y) * 2.2)
    + pow(max(0.0, 1.0 - abs(p.y) * 12.0), 3.0) * max(0.0, 1.0 - abs(p.x) * 2.2);
  float alpha = (halo * 0.26 + core * 0.62 + rays * 0.09) * vSpiritAlpha;
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(mix(uSpiritTint, vec3(1.0, 0.93, 0.71), core * 0.38), alpha);
  #include <colorspace_fragment>
}
`;

  window.createSpiritMatureWind = function createSpiritMatureWind(options) {
    const T = options.THREE;
    const enabled = !!T && !options.reducedMotion;
    const gpuEnabled = enabled && !options.software;
    const entries = new Map();
    const clock = { value: 0 };
    const viewport = { value: 600 };
    const pixelRatio = { value: 1 };
    let disposed = false;
    let lastTime = null;

    function updateBend(entry) {
      const p = entry.profile, t = clock.value, phase = entry.phase;
      // A wide gust crosses neighboring beds; the slightly asymmetric return
      // feels like springy stems, not a metronome. The main wind is transverse
      // to the approved default camera, so it remains legible on small screens.
      const gust = .88 + .12 * Math.sin(t * .40 - entry.fieldPhase * .38)
        + .06 * Math.sin(t * .21 + .7);
      const cycle = t * p.speed + phase;
      const swing = .88 * Math.sin(cycle) + .12 * Math.sin(cycle * 2 - .4);
      const cross = .13 * Math.sin(t * p.speed * .71 + phase * .81 + .9);
      const rebound = .18 * Math.sin(cycle - p.lag)
        + .055 * Math.sin(cycle * 1.73 - p.lag - .6);
      const tipCross = .045 * Math.sin(cycle * 1.31 + .3);
      // Phones use the same silhouette amplitude; only particle count/LOD
      // are reduced. A mobile-wide view must still show that crops are alive.
      const scale = p.amplitude * gust;
      const bend = entry.uniforms.uSpiritBend.value;
      bend.set(
        scale * (.844 * swing + .536 * cross),
        scale * (-.536 * swing + .844 * cross),
        scale * (.844 * rebound + .536 * tipCross),
        scale * (-.536 * rebound + .844 * tipCross)
      );
      entry.uniforms.uSpiritFine.value.set(p.flutter * gust, t * (p.speed * 2.1) + phase + .5);
      if (entry.software) {
        // Canvas cannot run vertex shaders. Tilt only this mature plant's
        // subgroup around its base, preserving its authored Y rotation.
        // No geometry or shared material is changed in the compatibility path.
        const fine = entry.uniforms.uSpiritFine.value;
        const extra = Math.sin(fine.y) * fine.x;
        const dx = bend.x + bend.z + .844 * extra;
        const dz = bend.y + bend.w - .536 * extra;
        const distance = Math.hypot(dx, dz);
        if (distance > 1e-7) {
          entry.tiltAxis.set(dz, 0, -dx).normalize().applyQuaternion(entry.parentInverse);
          entry.tilt.setFromAxisAngle(entry.tiltAxis, Math.min(.14, Math.atan2(distance, entry.height)));
          entry.parent.quaternion.copy(entry.tilt).multiply(entry.baseQuaternion);
        } else entry.parent.quaternion.copy(entry.baseQuaternion);
        entry.parent.updateMatrix();
      }
    }

    function windMaterial(original, entry) {
      if (!original || !(original.isMeshStandardMaterial || original.isMeshPhysicalMaterial)) return original;
      let copy = entry.materials.get(original);
      if (copy) return copy;
      copy = original.clone();
      const originalHook = original.onBeforeCompile;
      const originalKey = original.customProgramCacheKey();
      copy.name = (original.name || original.type) + ' · mature breeze';
      copy.userData.spiritMatureWind = true;
      copy.customProgramCacheKey = () => originalKey + '|spirit-mature-wind-v2';
      copy.onBeforeCompile = function (shader, renderer) {
        originalHook.call(this, shader, renderer);
        Object.assign(shader.uniforms, entry.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + WIND_PARS)
          .replace('#include <beginnormal_vertex>', WIND_BEGIN_NORMAL)
          .replace('#include <defaultnormal_vertex>', WIND_DEFAULT_NORMAL)
          .replace('#include <begin_vertex>', WIND_BEGIN_VERTEX);
      };
      entry.materials.set(original, copy);
      return copy;
    }

    function createMotes(entry) {
      const count = entry.mobile ? 3 : 5;
      const positions = new Float32Array(count * 3);
      const seeds = new Float32Array(count * 3);
      const parentHeight = entry.height / Math.max(.1, entry.parentScale);
      for (let i = 0; i < count; i++) {
        const a = i * 2.399963 + entry.phase * .37;
        const radius = .50 + (i % 3) * .12;
        positions[i * 3] = Math.cos(a) * radius;
        positions[i * 3 + 1] = parentHeight * (.45 + (i % 3) * .18);
        positions[i * 3 + 2] = Math.sin(a) * radius;
        seeds[i * 3] = ((i * .618034 + entry.index * .137) % 1 + 1) % 1;
        seeds[i * 3 + 1] = .085 + (i % 3) * .013;
        seeds[i * 3 + 2] = .060 + (i % 2) * .015;
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
      geometry.setAttribute('spiritSeed', new T.BufferAttribute(seeds, 3));
      const material = new T.ShaderMaterial({
        uniforms: {
          uSpiritTime: clock, uSpiritViewport: viewport, uSpiritPixelRatio: pixelRatio,
          uSpiritTint: { value: new T.Color(0xffd78b) }
        },
        vertexShader: MOTE_VERTEX, fragmentShader: MOTE_FRAGMENT,
        transparent: true, depthWrite: false, depthTest: true,
        blending: T.AdditiveBlending, toneMapped: false
      });
      const motes = new T.Points(geometry, material);
      motes.name = '成熟灵草 · 暖金灵光';
      motes.userData.spiritMatureMotes = true;
      motes.frustumCulled = false;
      motes.renderOrder = 2;
      entry.parent.add(motes);
      entry.motes = motes;
    }

    function detach(index) {
      const entry = entries.get(index);
      if (!entry) return;
      entries.delete(index);
      if (entry.software) {
        entry.parent.quaternion.copy(entry.baseQuaternion);
        entry.parent.updateMatrix();
      }
      for (const saved of entry.meshes) {
        saved.mesh.material = saved.material;
        saved.mesh.frustumCulled = saved.frustumCulled;
        delete saved.mesh.userData.spiritMatureWind;
      }
      entry.materials.forEach(material => material.dispose());
      if (entry.motes) {
        entry.motes.removeFromParent();
        entry.motes.geometry.dispose();
        entry.motes.material.dispose();
      }
    }

    function attach(index, parent, settings) {
      detach(index);
      if (!enabled || disposed || !parent) return false;
      const profile = PROFILES[settings.cropId] || PROFILES.zihou;
      parent.updateWorldMatrix(true, true);
      const origin = new T.Vector3();
      parent.getWorldPosition(origin);
      const bounds = new T.Box3().setFromObject(parent);
      const height = Math.max(.55, bounds.max.y - origin.y);
      const scale = new T.Vector3(); parent.getWorldScale(scale);
      const fieldPhase = (Number(settings.plotX) || 0) * .35 - (Number(settings.plotZ) || 0) * .22;
      const entry = {
        index, parent, height, parentScale: scale.y, profile, fieldPhase,
        phase: fieldPhase + (index % 5) * .11, mobile: !!settings.mobile,
        software: !gpuEnabled,
        meshes: [], materials: new Map(), motes: null,
        uniforms: {
          uSpiritRoot: { value: origin },
          uSpiritHeight: { value: new T.Vector2(Math.min(profile.anchor, height * .45), height) },
          uSpiritBend: { value: new T.Vector4() },
          uSpiritFine: { value: new T.Vector2() }
        }
      };
      if (entry.software) {
        entry.baseQuaternion = parent.quaternion.clone();
        entry.parentInverse = new T.Quaternion();
        if (parent.parent) parent.parent.getWorldQuaternion(entry.parentInverse);
        entry.parentInverse.invert();
        entry.tilt = new T.Quaternion();
        entry.tiltAxis = new T.Vector3();
        entries.set(index, entry);
        updateBend(entry);
        return true;
      }
      parent.traverse(mesh => {
        if (!mesh.isMesh || !mesh.material) return;
        const original = mesh.material;
        const next = Array.isArray(original) ? original.map(material => windMaterial(material, entry)) : windMaterial(original, entry);
        if (next === original || Array.isArray(original) && next.every((material, i) => material === original[i])) return;
        entry.meshes.push({ mesh, material: original, frustumCulled: mesh.frustumCulled });
        mesh.material = next;
        // The unchanged shared bounding sphere must not clip moving tips
        // when a plot lies at the edge of the camera view.
        mesh.frustumCulled = false;
        mesh.userData.spiritMatureWind = true;
      });
      entries.set(index, entry);
      updateBend(entry);
      if (settings.ornaments !== false) createMotes(entry);
      return entry.meshes.length > 0;
    }

    // Surface details such as dew must follow the same vertex displacement as
    // the fruit. The caller refreshes parent.matrixWorld once per plant before
    // projecting its anchors; Canvas already carries the tilt in that matrix.
    function deformPoint(index, local, target) {
      const entry = entries.get(index);
      if (!entry || disposed) return null;
      const result = target || new T.Vector3();
      result.copy(local).applyMatrix4(entry.parent.matrixWorld);
      if (entry.software) return result;
      const u = entry.uniforms, root = u.uSpiritRoot.value;
      const height = u.uSpiritHeight.value, bend = u.uSpiritBend.value, fine = u.uSpiritFine.value;
      const span = Math.max(.25, height.y - height.x);
      const h = Math.max(0, Math.min(1, (result.y - root.y - height.x) / span));
      const crown = Math.max(0, Math.min(1, h / .70));
      const late = Math.max(0, Math.min(1, (h - .18) / .72));
      const mainWeight = crown * crown * (3 - 2 * crown);
      const lateWeight = late * late * (3 - 2 * late);
      const flutter = Math.sin((result.x - root.x) * 1.18 + (result.z - root.z) * .86 + fine.y) * fine.x;
      result.x += bend.x * mainWeight + bend.z * lateWeight + .844 * flutter * lateWeight;
      result.z += bend.y * mainWeight + bend.w * lateWeight - .536 * flutter * lateWeight;
      return result;
    }

    function update(seconds) {
      if (!enabled || disposed || !Number.isFinite(seconds)) return false;
      if (lastTime !== null) {
        const delta = seconds - lastTime;
        // Even very slow Canvas frames advance instead of freezing. The scene
        // calls resetTime() across visibility/modal pauses, so returning does
        // not catch up; an active slow frame advances at most 350 ms.
        if (delta > 0) clock.value += Math.min(delta, .35);
      }
      lastTime = seconds;
      viewport.value = Math.max(1, Number(options.getViewportHeight?.()) || 600);
      pixelRatio.value = Math.min(2, Math.max(1, Number(options.getPixelRatio?.()) || 1));
      entries.forEach(updateBend);
      return entries.size > 0;
    }

    return {
      enabled, gpuEnabled, attach, detach, update, deformPoint,
      resetTime() { lastTime = null; },
      dispose() {
        if (disposed) return;
        for (const index of entries.keys()) detach(index);
        disposed = true;
      }
    };
  };
})();
