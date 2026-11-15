/* Original, texture-free tools for the cloud garden.
 * Rounded silhouettes, rolled copper edges and celadon inlays are modelled
 * geometry. Nothing is fetched from a game, model service or image host.
 * Factory instances own their resources; returned groups share those resources
 * but have independent transforms. Call dispose() once when the scene ends.
 */
(function (global) {
  'use strict';

  global.createSpiritFarmToolAssets = function createSpiritFarmToolAssets(options = {}) {
    const T = options.THREE;
    if (!T?.BufferGeometry || !T?.MeshStandardMaterial) throw new TypeError('Three.js is required for the garden tools.');
    const lowDetail = !!options.lowDetail;
    const radial = lowDetail ? 10 : 20;
    const smallRadial = lowDetail ? 6 : 12;
    const tubeSides = lowDetail ? 3 : 5;
    const geometries = new Set(), materials = new Map(), templates = new Map();
    const identity = new T.Matrix4();
    const up = new T.Vector3(0, 1, 0);
    const roseAxis = new T.Vector3(.94, .34, 0).normalize();
    const roseBase = new T.Vector3(.79, .215, 0);
    const roseDepth = .17;
    const spoutPoint = roseBase.clone().addScaledVector(roseAxis, roseDepth + .002);
    let disposed = false;

    const palettes = [null,
      { jade: [0x416f60, 0x97b79b], metal: [0x93602f, 0xe6bd74], steel: [0x5b776c, 0xc7d2b3], wood: [0x68432c, 0xbd8c50], wrap: [0x526c50, 0xa8b68b] },
      { jade: [0x386c58, 0xa3c5a6], metal: [0x9d712f, 0xefd18c], steel: [0x4d8072, 0xd5dfbd], wood: [0x684029, 0xc99b59], wrap: [0x496c50, 0xb2c79d] },
      { jade: [0x447f67, 0xc6dab2], metal: [0xa97e33, 0xffe3a0], steel: [0x59907b, 0xe0e7c2], wood: [0x73492b, 0xd2a465], wrap: [0x547a59, 0xc7d5aa] },
    ];

    function getMaterial(kind) {
      if (!materials.has(kind)) {
        const properties = {
          enamel: { roughness: .32, metalness: .14 },
          metal: { roughness: .30, metalness: .66 },
          steel: { roughness: .28, metalness: .57 },
          wood: { roughness: .72, metalness: 0 },
          cloth: { roughness: .96, metalness: 0 },
          dark: { roughness: .83, metalness: .12 },
        }[kind];
        const material = new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, ...properties });
        material.name = '灵田农具 · ' + kind;
        materials.set(kind, material);
      }
      return materials.get(kind);
    }

    function transform(position, rotation, scale) {
      return new T.Matrix4().compose(
        position || new T.Vector3(),
        rotation instanceof T.Quaternion ? rotation : new T.Quaternion().setFromEuler(rotation || new T.Euler()),
        scale || new T.Vector3(1, 1, 1)
      );
    }

    function baker() {
      const batches = new Map();
      function add(geometry, kind, tones, matrix = identity, variation) {
        const data = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        if (!data.attributes.normal) data.computeVertexNormals();
        data.computeBoundingBox();
        const minimum = data.boundingBox.min.y;
        const height = Math.max(.0001, data.boundingBox.max.y - minimum);
        const colorA = new T.Color(tones[0]), colorB = new T.Color(tones[1]), mixed = new T.Color();
        const attribute = data.attributes.position, shades = [];
        for (let i = 0; i < attribute.count; i++) {
          const x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
          let t = .15 + .75 * (y - minimum) / height;
          if (variation) t += variation(x, y, z);
          mixed.copy(colorA).lerp(colorB, Math.max(0, Math.min(1, t)));
          shades.push(mixed.r, mixed.g, mixed.b);
        }
        data.applyMatrix4(matrix);
        let batch = batches.get(kind);
        if (!batch) { batch = { positions: [], normals: [], colors: [] }; batches.set(kind, batch); }
        batch.positions.push(...data.attributes.position.array);
        batch.normals.push(...data.attributes.normal.array);
        batch.colors.push(...shades);
        data.dispose(); geometry.dispose();
      }
      function finish(name) {
        const group = new T.Group(); group.name = name;
        for (const [kind, batch] of batches) {
          const geometry = new T.BufferGeometry();
          geometry.setAttribute('position', new T.Float32BufferAttribute(batch.positions, 3));
          geometry.setAttribute('normal', new T.Float32BufferAttribute(batch.normals, 3));
          geometry.setAttribute('color', new T.Float32BufferAttribute(batch.colors, 3));
          geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometries.add(geometry);
          const mesh = new T.Mesh(geometry, getMaterial(kind));
          mesh.name = name + ' · ' + kind;
          mesh.castShadow = false; mesh.receiveShadow = false;
          mesh.userData.farmTool = true;
          mesh.userData.softwareSmooth = true;
          group.add(mesh);
        }
        group.userData.farmTool = true;
        return group;
      }
      return { add, finish };
    }

    function lathe(profile, segments = radial) {
      return new T.LatheGeometry(profile.map(([radius, y]) => new T.Vector2(radius, y)), segments);
    }
    function tube(points, radius, steps = lowDetail ? 7 : 14, sides = tubeSides) {
      return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), steps, radius, sides, false);
    }
    function ring(radius, thickness, segments = radial) {
      const geometry = new T.TorusGeometry(radius, thickness, lowDetail ? 3 : 4, segments);
      geometry.rotateX(Math.PI / 2);
      return geometry;
    }
    function cylinderBetween(a, b, r0, r1 = r0, segments = smallRadial) {
      const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
      const geometry = new T.CylinderGeometry(r1, r0, delta.length(), segments, 1, false);
      geometry.applyMatrix4(transform(start.addScaledVector(delta, .5), new T.Quaternion().setFromUnitVectors(up, delta.normalize())));
      return geometry;
    }

    // A curved, tapering pipe keeps the spout compact and recognisable from the
    // overhead garden camera. The binormal is stable because this curve is XY.
    function taperedSpout() {
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(.32, -.12, 0), new T.Vector3(.50, -.045, 0),
        new T.Vector3(.65, .105, 0), new T.Vector3(.795, .217, 0),
      ]);
      const length = lowDetail ? 5 : 10, sides = lowDetail ? 6 : 10;
      const positions = [], indices = [];
      for (let row = 0; row <= length; row++) {
        const t = row / length, point = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
        const normal = new T.Vector3(-tangent.y, tangent.x, 0);
        const radius = .107 * (1 - t) + .061 * t;
        for (let column = 0; column <= sides; column++) {
          const angle = column * Math.PI * 2 / sides;
          positions.push(point.x + normal.x * Math.sin(angle) * radius, point.y + normal.y * Math.sin(angle) * radius, Math.cos(angle) * radius);
          if (row < length && column < sides) {
            const a = row * (sides + 1) + column, b = a + sides + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      return geometry;
    }

    function sealLeaf() {
      const shape = new T.Shape();
      shape.moveTo(0, -.092);
      shape.bezierCurveTo(-.103, -.020, -.075, .079, .071, .105);
      shape.bezierCurveTo(.082, .020, .058, -.045, 0, -.092);
      return new T.ExtrudeGeometry(shape, {
        depth: .008, bevelEnabled: true, bevelThickness: .004, bevelSize: .004,
        bevelSegments: 1, steps: 1, curveSegments: lowDetail ? 3 : 5,
      });
    }

    function makeWateringCan(level) {
      const palette = palettes[level], model = baker();
      const flatten = new T.Vector3(1, 1, .82);
      const bodyProfile = lowDetail ? [
        [0, -.335], [.30, -.335], [.405, -.23], [.438, -.045], [.415, .13], [.30, .275],
        [.215, .31], [.215, .26], [.36, .14], [.397, -.05], [.34, -.26], [0, -.275],
      ] : [
        [0, -.335], [.29, -.335], [.355, -.31], [.412, -.22], [.438, -.045], [.43, .075],
        [.395, .17], [.335, .245], [.27, .29], [.215, .31], [.215, .26], [.265, .245],
        [.35, .155], [.39, .055], [.402, -.055], [.377, -.21], [.31, -.275], [0, -.275],
      ];
      model.add(lathe(bodyProfile), 'enamel', palette.jade, transform(null, null, flatten));
      // The upper lip and base have rounded, rolled metal edges rather than
      // flat discs. The fill hole remains open, with a dark interior floor.
      model.add(ring(.219, .024), 'metal', palette.metal, transform(new T.Vector3(0, .306, 0), null, flatten));
      model.add(ring(.342, .024), 'metal', palette.metal, transform(new T.Vector3(0, -.314, 0), null, flatten));
      const interior = new T.CircleGeometry(.19, radial); interior.rotateX(-Math.PI / 2);
      model.add(interior, 'dark', [0x294e43, 0x3c6651], transform(new T.Vector3(0, .245, 0), null, flatten));

      model.add(tube([
        [-.31, -.19, 0], [-.57, -.115, 0], [-.655, .13, 0], [-.606, .397, 0],
        [-.44, .582, 0], [-.238, .625, 0], [-.045, .516, 0], [.29, .26, 0],
      ], .037, lowDetail ? 9 : 19), 'metal', palette.metal);
      model.add(tube([[-.485, .55, 0], [-.395, .606, 0], [-.273, .624, 0], [-.17, .604, 0]], .053, lowDetail ? 5 : 10), 'wood', palette.wood);
      if (!lowDetail) {
        model.add(cylinderBetween([-.503, .529, 0], [-.469, .557, 0], .058), 'metal', palette.metal);
        model.add(cylinderBetween([-.187, .612, 0], [-.153, .600, 0], .058), 'metal', palette.metal);
      }

      model.add(taperedSpout(), 'metal', palette.metal);
      model.add(cylinderBetween([.292, -.13, 0], [.387, -.092, 0], .124, .107), 'enamel', palette.jade);
      const roseTransform = transform(roseBase, new T.Quaternion().setFromUnitVectors(up, roseAxis));
      model.add(lathe([[0, 0], [.061, 0], [.071, .032], [.159, .108], [.178, .143], [.166, .17], [0, .17]], lowDetail ? 10 : 18), 'metal', palette.metal, roseTransform);
      model.add(ring(.166, .012, lowDetail ? 10 : 18), 'metal', [palette.metal[1], 0xffe9b1], roseTransform.clone().multiply(new T.Matrix4().makeTranslation(0, .165, 0)));
      // Recessed dark aperture discs sit just proud of the rose face. Tiny
      // rimmed openings read as perforations without expensive CSG meshes.
      const holeCount = lowDetail ? 7 : 13;
      for (let index = 0; index < holeCount; index++) {
        const inner = index === 0, angle = (index - 1) * Math.PI * 2 / (holeCount - 1);
        const radius = inner ? 0 : index % 2 === 0 && !lowDetail ? .064 : .117;
        const hole = new T.CircleGeometry(lowDetail ? .014 : .012, lowDetail ? 4 : 6);
        hole.rotateX(-Math.PI / 2);
        const position = new T.Vector3(Math.cos(angle) * radius, roseDepth + .0015, Math.sin(angle) * radius);
        model.add(hole, 'dark', [0x4c482d, 0x635a36], roseTransform.clone().multiply(new T.Matrix4().makeTranslation(position.x, position.y, position.z)));
      }

      // A little embossed leaf makes the can belong to this medicinal garden.
      // Both sides are decorated so orbiting the plot does not reveal a blank
      // rear side. On phones a single bright leaf carries the same silhouette.
      const sides = lowDetail ? [1] : [1, -1];
      for (const side of sides) {
        const seal = new T.CylinderGeometry(.119, .119, .012, lowDetail ? 10 : 16);
        seal.rotateX(Math.PI / 2);
        model.add(seal, 'metal', palette.metal, transform(new T.Vector3(-.025, -.043, .355 * side)));
        model.add(sealLeaf(), 'enamel', [0xadc59b, 0xe3e4bc], transform(new T.Vector3(-.036, -.04, .365 * side), new T.Euler(0, side < 0 ? Math.PI : 0, -.15)));
        if (!lowDetail) model.add(tube([[.001, -.103, .379 * side], [.004, -.05, .382 * side], [.034, .025, .379 * side]], .006, 4, 3), 'metal', palette.metal);
      }
      const group = model.finish('青玉灵泉壶 · ' + level);
      group.userData.toolKind = 'wateringCan'; group.userData.toolLevel = level;
      return group;
    }

    function bladeShape(inlay = false) {
      const shape = new T.Shape();
      if (inlay) {
        shape.moveTo(.10, .074);
        shape.bezierCurveTo(.23, .09, .34, .23, .455, .238);
        shape.quadraticCurveTo(.48, .12, .482, 0);
        shape.quadraticCurveTo(.48, -.12, .455, -.238);
        shape.bezierCurveTo(.34, -.23, .23, -.09, .10, -.074);
      } else {
        shape.moveTo(-.015, .077);
        shape.bezierCurveTo(.12, .074, .22, .235, .385, .30);
        shape.quadraticCurveTo(.445, .328, .505, .318);
        shape.quadraticCurveTo(.57, .16, .57, 0);
        shape.quadraticCurveTo(.57, -.16, .505, -.318);
        shape.quadraticCurveTo(.445, -.328, .385, -.30);
        shape.bezierCurveTo(.22, -.235, .12, -.074, -.015, -.077);
      }
      shape.closePath();
      return shape;
    }
    function curvedBlade(inlay = false) {
      const geometry = new T.ExtrudeGeometry(bladeShape(inlay), {
        depth: inlay ? .009 : .038, bevelEnabled: true,
        bevelThickness: inlay ? .004 : .009, bevelSize: inlay ? .006 : .013,
        bevelSegments: lowDetail ? 1 : 2, steps: 1, curveSegments: lowDetail ? 3 : 6,
      });
      const positions = geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), across = positions.getY(index), depth = positions.getZ(index);
        const curve = Math.pow(Math.max(0, x) / .57, 1.55);
        const centerRidge = (1 - Math.min(1, Math.abs(across) / .32)) * .018 * Math.min(1, Math.max(0, x) / .22);
        positions.setXYZ(index, x, -1.42 - .255 * curve + depth + centerRidge + (inlay ? .040 : 0), -across);
      }
      positions.needsUpdate = true; geometry.computeVertexNormals();
      return geometry;
    }

    function makeHoe(level) {
      const palette = palettes[level], model = baker();
      model.add(lathe([[0, .066], [.043, .064], [.061, .024], [.058, -.34], [.048, -.85], [.046, -1.28], [.053, -1.43], [0, -1.435]], lowDetail ? 8 : 14), 'wood', palette.wood, identity,
        (x, y, z) => .055 * Math.sin(y * 23 + Math.atan2(z, x) * 4));
      // A leather sleeve and a continuous pale braided wrap remain distinct
      // from the tapered wooden shaft even when the tool is small on screen.
      model.add(new T.CylinderGeometry(.063, .060, .35, smallRadial), 'cloth', palette.wrap, transform(new T.Vector3(0, -.15, 0)));
      const turns = lowDetail ? 5 : 7, wrapSteps = lowDetail ? 23 : 43, wrapPoints = [];
      for (let i = 0; i <= wrapSteps; i++) {
        const angle = i / wrapSteps * Math.PI * 2 * turns;
        wrapPoints.push([Math.cos(angle) * .062, .012 - i / wrapSteps * .328, Math.sin(angle) * .062]);
      }
      model.add(tube(wrapPoints, lowDetail ? .009 : .008, wrapSteps, 3), 'cloth', [0x9baf80, 0xd9d9b0]);
      model.add(lathe([[0, .062], [.047, .062], [.063, .041], [.066, .014], [.063, -.003], [0, -.003]], lowDetail ? 8 : 12), 'metal', palette.metal);
      model.add(ring(.060, .011, smallRadial), 'metal', palette.metal, transform(new T.Vector3(0, -.332, 0)));
      model.add(lathe([[0, -1.48], [.074, -1.48], [.085, -1.44], [.083, -1.30], [.067, -1.25], [0, -1.25]], smallRadial), 'metal', palette.metal);
      model.add(ring(.074, .010, smallRadial), 'metal', [palette.metal[1], 0xf5df9d], transform(new T.Vector3(0, -1.287, 0)));
      model.add(curvedBlade(false), 'steel', palette.steel);
      model.add(curvedBlade(true), 'enamel', palette.jade);

      if (!lowDetail) {
        // A restrained inset vein on the blade and three long wood-grain lines.
        model.add(tube([[.14, -1.387, 0], [.25, -1.429, 0], [.385, -1.503, 0]], .006, 5, 3), 'metal', palette.metal);
        for (let i = 0; i < 3; i++) {
          const angle = -.8 + i * .65;
          model.add(tube([
            [Math.sin(angle) * .054, -.42, Math.cos(angle) * .054],
            [Math.sin(angle + .04) * .050, -.77, Math.cos(angle + .04) * .050],
            [Math.sin(angle - .025) * .046, -1.16, Math.cos(angle - .025) * .046],
          ], .002, 5, 3), 'wood', [0x7d552f, 0xa57843]);
        }
      }
      // A tiny sage cord and two silk leaves add a quiet xianxia detail; these
      // move with the whole tool, so no secondary physics simulation is needed.
      model.add(tube([[.052, -.057, 0], [.14, -.10, .023], [.15, -.19, .033], [.13, -.23, .035]], .012, lowDetail ? 4 : 7, 3), 'cloth', palette.wrap);
      const charm = new T.TorusGeometry(.033, .008, 3, lowDetail ? 6 : 10);
      model.add(charm, 'metal', palette.metal, transform(new T.Vector3(.132, -.24, .038)));
      const ribbonVertices = [
        .115, -.266, .034, .140, -.265, .038, .128, -.375, .044, .101, -.399, .035,
        .140, -.265, .038, .157, -.267, .039, .191, -.344, .046, .165, -.371, .044,
      ];
      const ribbons = new T.BufferGeometry();
      ribbons.setAttribute('position', new T.Float32BufferAttribute(ribbonVertices, 3));
      ribbons.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0, 4, 5, 6, 4, 6, 7, 6, 5, 4, 7, 6, 4]);
      const silk = ribbons.toNonIndexed(); silk.computeVertexNormals(); ribbons.dispose();
      model.add(silk, 'cloth', palette.wrap);
      const group = model.finish('缠枝玉锄 · ' + level);
      group.userData.toolKind = 'hoe'; group.userData.toolLevel = level;
      // Snap the contact marker to a real centre-edge vertex. Bevel tessellation
      // differs slightly between detail levels, so the marker follows the mesh.
      const edge = new T.Vector3(.57, Infinity, 0);
      for (const mesh of group.children) {
        if (mesh.material !== getMaterial('steel')) continue;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          if (positions.getX(i) > .52 && Math.abs(positions.getZ(i)) < .005 && positions.getY(i) < edge.y) {
            edge.set(positions.getX(i), positions.getY(i), positions.getZ(i));
          }
        }
      }
      group.userData.bladeTip = edge.toArray();
      return group;
    }

    function get(kind, inputLevel) {
      if (disposed) throw new Error('The garden tool resources have been disposed.');
      const level = Number.isFinite(inputLevel) ? Math.max(1, Math.min(3, Math.round(inputLevel))) : 1;
      const key = kind + ':' + level;
      if (!templates.has(key)) templates.set(key, kind === 'wateringCan' ? makeWateringCan(level) : makeHoe(level));
      return templates.get(key).clone(true);
    }

    return {
      createWateringCan(level = 1) { return { group: get('wateringCan', level), spout: spoutPoint.clone(), spoutDirection: roseAxis.clone() }; },
      createHoe(level = 1) { const group = get('hoe', level); return { group, bladeTip: new T.Vector3().fromArray(group.userData.bladeTip) }; },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials.values()) material.dispose();
        geometries.clear(); materials.clear(); templates.clear();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
