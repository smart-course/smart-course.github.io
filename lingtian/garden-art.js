/* Original courtyard details for the medicinal garden.
 * Painted vertex gradients keep the same materials readable in WebGL and Canvas.
 * No external images, textures, geometry packages or asynchronous loads.
 */
(function () {
  'use strict';

  window.createSpiritGardenArt = function createSpiritGardenArt(options) {
    const T = options.THREE, parent = options.parent;
    if (!T || !parent) return { triangles: 0, meshes: 0, destroy() {} };
    const group = new T.Group();
    group.name = '药圃 · 石径与引灵渠';
    parent.add(group);
    const batches = new Map(), materials = new Map();
    const positions = options.plotPositions || [];
    let seed = 80417;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const range = (a, b) => a + random() * (b - a);
    const color = value => new T.Color(value);
    const matrix = new T.Matrix4(), rotation = new T.Quaternion(), scale = new T.Vector3(1, 1, 1);
    const axis = new T.Vector3(0, 1, 0);
    const stoneColors = [0x7d8771, 0x8e947e, 0x999c83, 0xaaa58b, 0x879078];

    function emit(geometry, low, high, x = 0, y = 0, z = 0, turn = 0, layer = 0, kind = 'stone') {
      const data = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      if (!data.attributes.normal) data.computeVertexNormals();
      data.computeBoundingBox();
      const min = data.boundingBox.min.y, span = Math.max(.0001, data.boundingBox.max.y - min);
      const shades = [], dark = color(low), light = color(high), mixed = new T.Color();
      const attr = data.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const gradient = Math.max(0, Math.min(1, (attr.getY(i) - min) / span));
        mixed.copy(dark).lerp(light, .12 + gradient * .88);
        shades.push(mixed.r, mixed.g, mixed.b);
      }
      data.setAttribute('color', new T.Float32BufferAttribute(shades, 3));
      rotation.setFromAxisAngle(axis, turn);
      matrix.compose(new T.Vector3(x, y, z), rotation, scale);
      data.applyMatrix4(matrix);
      const key = kind + ':' + layer;
      let batch = batches.get(key);
      if (!batch) {
        batch = { positions: [], normals: [], colors: [], layer, kind };
        batches.set(key, batch);
      }
      batch.positions.push(...data.attributes.position.array);
      batch.normals.push(...data.attributes.normal.array);
      batch.colors.push(...data.attributes.color.array);
      data.dispose(); geometry.dispose();
    }

    function raw(vertices, indices, colors) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      if (indices) geometry.setIndex(indices);
      if (colors) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      return geometry;
    }

    function colored(vertices, indices, shades, layer = 0, kind = 'foliage') {
      const geometry = raw(vertices, indices, shades);
      const data = geometry.index ? geometry.toNonIndexed() : geometry;
      const key = kind + ':' + layer;
      let batch = batches.get(key);
      if (!batch) {
        batch = { positions: [], normals: [], colors: [], layer, kind };
        batches.set(key, batch);
      }
      batch.positions.push(...data.attributes.position.array);
      batch.normals.push(...data.attributes.normal.array);
      batch.colors.push(...data.attributes.color.array);
      if (data !== geometry) data.dispose();
      geometry.dispose();
    }

    function groundPatch(x, z, rx, rz, centerColor, edgeColor, turn = 0, layer = -1.8) {
      const verts = [x, .192, z], indices = [], shades = [];
      const a = color(centerColor), b = color(edgeColor), n = 8;
      shades.push(a.r, a.g, a.b);
      for (let j = 0; j < n; j++) {
        const angle = j * Math.PI * 2 / n;
        const dx = Math.cos(angle) * rx * range(.88, 1.07), dz = Math.sin(angle) * rz * range(.88, 1.07);
        verts.push(x + dx * Math.cos(turn) - dz * Math.sin(turn), .193, z + dx * Math.sin(turn) + dz * Math.cos(turn));
        shades.push(b.r, b.g, b.b);
        indices.push(0, (j + 1) % n + 1, j + 1);
      }
      colored(verts, indices, shades, layer, 'ground');
    }

    // Low, bevelled irregular stone: dark buried edge, broad warm-grey top.
    function pebble(x, z, w, d, h, tint, turn = 0, detailed = false, y = .195) {
      const n = 6, verts = [], indices = [], radii = [];
      for (let i = 0; i < n; i++) radii.push(range(.85, 1.10));
      const rings = detailed ? [[.96, 0], [1, h * .50], [.80, h]] : [[1, 0], [.78, h]];
      for (const [r, high] of rings) for (let j = 0; j < n; j++) {
        const a = j * Math.PI * 2 / n;
        verts.push(Math.cos(a) * w * r * radii[j], high, Math.sin(a) * d * r * radii[j]);
      }
      for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < n; j++) {
        const a = r * n + j, b = r * n + (j + 1) % n, c = a + n, e = b + n;
        indices.push(a, c, b, b, c, e);
      }
      const center = verts.length / 3; verts.push(0, h * 1.025, 0);
      const top = (rings.length - 1) * n;
      for (let j = 0; j < n; j++) indices.push(center, top + (j + 1) % n, top + j);
      const topColor = color(tint), baseColor = topColor.clone().multiplyScalar(.55);
      emit(raw(verts, indices), baseColor, topColor, x, y, z, turn);
    }

    function board(x, y, z, w, h, d, turn = 0) {
      emit(new T.BoxGeometry(w, h, d), 0x4b382c, 0x9a7951, x, y, z, turn, 0, 'wood');
    }

    function stem(points, r, low = 0x395638, high = 0x6a8a4e) {
      const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
      emit(new T.TubeGeometry(curve, Math.max(2, points.length), r, 3, false), low, high, 0, 0, 0, 0, 0, 'foliage');
    }

    function leaf(x, y, z, turn, length, width, lift, tone = 0) {
      const c = [color(tone ? 0x294b37 : 0x355c3d), color(tone ? 0x63874d : 0x7b9b59), color(tone ? 0x486d40 : 0x547b46)];
      const points = [[0, 0, 0], [-width, lift * .48, length * .42], [0, lift, length * .50], [width, lift * .54, length * .42], [0, lift * .75, length]];
      const verts = [], shades = [];
      for (let j = 0; j < points.length; j++) {
        const [px, py, pz] = points[j];
        verts.push(x + px * Math.cos(turn) - pz * Math.sin(turn), y + py, z + px * Math.sin(turn) + pz * Math.cos(turn));
        const tint = c[j === 2 ? 1 : j === 3 || j === 4 ? 2 : 0];
        shades.push(tint.r, tint.g, tint.b);
      }
      colored(verts, [0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3], shades);
    }

    function grass(x, z, amount = 4, size = 1) {
      const verts = [], shades = [], indices = [], dark = color(0x3e633c), light = color(0x829752);
      for (let k = 0; k < amount; k++) {
        const a = range(0, Math.PI * 2), length = range(.15, .36) * size, w = .035 * size;
        const px = x + range(-.09, .09), pz = z + range(-.09, .09), start = verts.length / 3;
        verts.push(px - w, .195, pz, px + w, .195, pz, px + Math.sin(a) * .10 * size, .195 + length, pz + Math.cos(a) * .10 * size);
        shades.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b);
        indices.push(start, start + 1, start + 2);
      }
      colored(verts, indices, shades);
    }

    function fern(x, z, size = 1) {
      for (let branch = 0; branch < 4; branch++) {
        const a = branch * Math.PI / 2 + .3, forward = new T.Vector3(-Math.sin(a), 0, Math.cos(a));
        for (let j = 1; j <= 3; j++) {
          const t = j / 4, high = Math.sin(t * Math.PI) * .29 * size;
          for (const side of [-1, 1]) leaf(x + forward.x * t * .53 * size, .21 + high, z + forward.z * t * .53 * size, a + side * 1.02, (.25 - t * .12) * size, .05 * size, .04 * size, 1);
        }
        leaf(x + forward.x * .38 * size, .42 * size, z + forward.z * .38 * size, a, .21 * size, .055 * size, -.03 * size, 1);
      }
    }

    function meadowFlower(x, z, size = 1) {
      stem([[x, .19, z], [x - .02, .32 * size, z], [x + .03, .44 * size, z]], .011 * size);
      const center = new T.Vector3(x + .03, .44 * size, z);
      for (let petal = 0; petal < 5; petal++) {
        const a = petal * Math.PI * 2 / 5;
        const p = new T.Vector3(Math.cos(a) * .055 * size, 0, Math.sin(a) * .055 * size).add(center);
        emit(new T.SphereGeometry(.045 * size, 4, 2), 0xc4c59a, 0xebe5c8, p.x, p.y, p.z, a, 0, 'flowers');
      }
      emit(new T.SphereGeometry(.025 * size, 4, 2), 0xa97b35, 0xe3be69, center.x, center.y + .015, center.z, 0, 0, 'flowers');
    }

    function clearOfPlots(x, z, margin = 0) {
      return !positions.some(p => Math.abs(x - p.x) < 1.12 + margin && Math.abs(z - p.z) < 1.12 + margin);
    }

    // Channel water has a dark jade edge and a lighter middle. Opaque colored
    // triangles work in the software renderer without expensive transparency.
    const CHANNEL = 1.28;
    const waterVerts = [], waterIndices = [], waterColors = [];
    const waterShades = [0x254f49, 0x4c9280, 0x71ac91, 0x2f6e62].map(color);
    for (let i = 0; i <= 24; i++) {
      const z = -6.18 + i * 12.82 / 24;
      const drift = Math.sin(i * .71) * .017;
      for (let j = 0; j < 4; j++) {
        const x = CHANNEL - .31 + j * .62 / 3 + drift;
        waterVerts.push(x, .213 + (j === 1 || j === 2 ? .004 : 0), z);
        const tint = waterShades[j].clone().multiplyScalar(.94 + Math.sin(i * .77) * .06);
        waterColors.push(tint.r, tint.g, tint.b);
      }
      if (i < 24) for (let j = 0; j < 3; j++) {
        const a = i * 4 + j, b = a + 4;
        waterIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    colored(waterVerts, waterIndices, waterColors, -1.5, 'water');
    for (let i = 0; i < 20; i++) {
      const z = -6.18 + i * .65;
      if (Math.abs(z - CHANNEL) < .48) continue;
      for (const side of [-1, 1]) pebble(CHANNEL + side * .43, z, .14, .35, range(.075, .12), stoneColors[i % stoneColors.length], range(-.12, .12));
      if (i % 4 === 1) {
        const left = CHANNEL - .20, right = CHANNEL + .10, y = .221;
        const line = [left, y, z, right, y, z + .035, right + .025, y, z + .050, left + .03, y, z + .02];
        const tint = color(0x8ebfa8), c = [];
        for (let j = 0; j < 4; j++) c.push(tint.r, tint.g, tint.b);
        colored(line, [0, 2, 1, 0, 3, 2], c, -1.4, 'water');
      }
    }

    // A worn crossing connects all four planting quarters; it remains below
    // the leaves and leaves the crop picking rectangles completely clear.
    for (let i = 0; i < 22; i++) {
      const x = -6.55 + i * .62;
      if (Math.abs(x - CHANNEL) < .83 || !clearOfPlots(x, CHANNEL)) continue;
      if (i % 2 === 0) groundPatch(x, CHANNEL, .43, .40, 0x61754a, 0x78915b, .25, -1.8);
      pebble(x, CHANNEL + range(-.05, .05), .31, .33, range(.075, .12), stoneColors[i % 5], range(-.22, .22), true);
    }
    const path = [];
    // A short, nearly flush path hugs the protected field edge. Keep the wide
    // outer lawn genuinely empty for full-sized pavilions and other furniture.
    for (let i = 0; i < 11; i++) path.push([-6.78, -5.4 + i * 1.08]);
    for (let i = 0; i < 11; i++) path.push([-5.4 + i * 1.08, 6.78]);
    for (let i = 0; i < path.length; i++) {
      const [x, z] = path[i];
      if (i % 2 === 0) groundPatch(x, z, .42, .38, 0x63764d, 0x7b945f, range(0, 6), -1.8);
      pebble(x, z, .15, .15, .025, stoneColors[(i + 2) % 5], range(-.35, .35), true);
    }

    // Small timber footbridge, with bowed board heights and only low side rails.
    for (let i = 0; i < 7; i++) {
      const x = CHANNEL + (i - 3) * .19, y = .30 + Math.sin(i / 6 * Math.PI) * .09;
      board(x, y, CHANNEL, .18, .065, .88 + (i % 2) * .035);
    }
    board(CHANNEL, .265, CHANNEL - .32, 1.38, .08, .075);
    board(CHANNEL, .265, CHANNEL + .32, 1.38, .08, .075);
    for (const x of [CHANNEL - .58, CHANNEL + .58]) for (const z of [CHANNEL - .42, CHANNEL + .42]) {
      emit(new T.CylinderGeometry(.032, .043, .30, 5), 0x4f3c2d, 0x94734c, x, .43, z, 0, 0, 'wood');
    }
    board(CHANNEL, .55, CHANNEL - .42, 1.28, .045, .045);
    board(CHANNEL, .55, CHANNEL + .42, 1.28, .045, .045);

    // The spring basin has a visible hollow ring and a short carved stone spout.
    // It sits beyond the last row, where an actual garden would feed its channel.
    const wellX = CHANNEL, wellZ = -6.18;
    groundPatch(wellX, wellZ, .85, .72, 0x466c4d, 0x77915c, 0, -1.8);
    emit(new T.CylinderGeometry(.57, .64, .20, 12), 0x465e53, 0x7b8a72, wellX, .29, wellZ);
    const rim = new T.TorusGeometry(.49, .085, 4, 16);
    rim.rotateX(-Math.PI / 2);
    emit(rim, 0x5d7462, 0xabb394, wellX, .45, wellZ);
    const pool = new T.CircleGeometry(.45, 16); pool.rotateX(-Math.PI / 2);
    emit(pool, 0x255950, 0x4e9684, wellX, .405, wellZ, 0, -1.3, 'water');
    emit(new T.BoxGeometry(.24, .20, .49), 0x43594c, 0x899c7c, wellX, .46, wellZ + .50);
    emit(new T.BoxGeometry(.13, .04, .45), 0x25544d, 0x4b8c79, wellX, .565, wellZ + .51, 0, 0, 'water');
    for (let i = 0; i < 4; i++) {
      const z = wellZ + .73 + i * .055;
      emit(new T.BoxGeometry(.115, .055, .08), 0x4a8675, 0x7db89e, wellX, .52 - i * .07, z, 0, 0, 'water');
    }
    for (const [dx, dz, sz] of [[-.58, -.09, .24], [.56, -.19, .26], [-.40, .43, .20]]) pebble(wellX + dx, wellZ + dz, sz, sz * .75, sz * .65, 0x6e806b, .3);
    // Jade tablets are fitted into the basin wall, rather than floating effects.
    for (let i = -1; i <= 1; i++) {
      emit(new T.BoxGeometry(.035, .09 + (i === 0 ? .025 : 0), .018), 0x87a17b, 0xb8c69a, wellX + i * .09, .34, wellZ + .591, 0, 0, 'inlay');
    }

    // A few plants at the outer verge retain the mountain-garden character.
    // Their complete foliage sits beyond the editable 11.5-unit lawn.
    const clusters = [
      [-8.4, 9.4, .65], [9.8, -8.0, .65], [-7.3, -10.1, .6]
    ];
    for (let i = 0; i < clusters.length; i++) {
      const [x, z, s] = clusters[i];
      if (!clearOfPlots(x, z, .12)) continue;
      groundPatch(x, z, .60 * s, .43 * s, 0x3b6242, 0x6e8955, range(0, 6), -1.7);
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI * .4 + i * .5;
        leaf(x + range(-.06, .06), .20, z + range(-.06, .06), a, range(.35, .58) * s, range(.10, .16) * s, range(.16, .25) * s, i % 2);
      }
      grass(x + .30, z - .20, 3, .55);
    }
    for (const [x, z, size] of [[-11.8, 4.0, .65], [5.9, 10.95, .65]]) fern(x, z, size);
    for (const [x, z] of [[-11.1, -6.5], [10.0, 8.0], [7.5, -10.4]]) meadowFlower(x, z, .65);

    let triangleCount = 0;
    for (const [key, batch] of batches) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(batch.positions, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(batch.normals, 3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(batch.colors, 3));
      geometry.computeBoundingSphere();
      const mat = new T.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, flatShading: false,
        roughness: batch.kind === 'water' ? .24 : batch.kind === 'foliage' ? .82 : .9,
        metalness: 0, side: batch.kind === 'foliage' ? T.DoubleSide : T.FrontSide
      });
      materials.set(key, mat);
      const mesh = new T.Mesh(geometry, mat);
      mesh.name = '药圃细景 · ' + key;
      mesh.castShadow = batch.kind !== 'ground' && batch.kind !== 'water';
      mesh.receiveShadow = true;
      if (batch.layer) mesh.userData.softwareLayer = batch.layer;
      group.add(mesh);
      triangleCount += batch.positions.length / 9;
    }
    group.userData.triangles = triangleCount;
    let destroyed = false;
    return {
      group, triangles: triangleCount, meshes: group.children.length,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        parent.remove(group);
        for (const child of group.children) child.geometry.dispose();
        for (const mat of materials.values()) mat.dispose();
        group.clear();
      }
    };
  };
})();
