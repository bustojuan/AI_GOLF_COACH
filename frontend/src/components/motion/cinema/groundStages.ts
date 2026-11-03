import * as THREE from 'three';
import { clamp, range, smooth, type CinemaRig, type CinemaStage, type StageInput, type StageSignal } from './types';
import { contactTexture, groundGeometry, turfBlades } from './proceduralTurf';
import { createGolfCourseEnvironment } from './golfCourseEnvironment';

const HOLE_X = 1.5;
const HOLE_RADIUS = .54;

/**
 * Landing (1.90s): .00–.76s descending / .76–1.27s restrained bounce /
 * then a short roll. A grounded shadow precedes the score reveal.
 * Putt (2.40s): .00–.14s establish / .14–1.51s roll / 1.51–1.92s fall /
 * 1.66–2.40s camera approaches the actual opening. No ball opacity animation.
 * All positions are functions of absolute progress, including rotation, for reliable scrubbing.
 */
export function createGroundStage(rig: CinemaRig): CinemaStage {
  const root = new THREE.Group(); root.name = 'cinema-ground'; root.visible = false; rig.scene.add(root);
  const course = createGolfCourseEnvironment(rig, { showTerrain: false });
  const loader = new THREE.TextureLoader(), shadowTexture = contactTexture();
  const diffuse = loader.load('/motion/golf-course/grass_ground_diff_1k.jpg');
  const normal = loader.load('/motion/golf-course/grass_ground_nor_gl_1k.jpg');
  const rough = loader.load('/motion/golf-course/grass_ground_rough_1k.jpg');
  diffuse.colorSpace = THREE.SRGBColorSpace;
  for (const map of [diffuse, normal, rough]) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  }
  const groundMaterial = new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, roughnessMap: rough,
    normalScale: new THREE.Vector2(.19, .19), color: 0x9cce82, roughness: .96, metalness: 0,
    transparent: true });
  // Fade the 3D green into the photographed fairway instead of drawing a distant straight edge.
  groundMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGreenDepth;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGreenDepth = -position.z;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGreenDepth;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(10.0, 42.0, vGreenDepth);');
  };
  const bladesMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide,
    color: 0xffffff, roughness: 1 });
  const solidGround = new THREE.Mesh(groundGeometry(false, HOLE_X, HOLE_RADIUS), groundMaterial);
  const holedGround = new THREE.Mesh(groundGeometry(true, HOLE_X, HOLE_RADIUS), groundMaterial);
  for (const ground of [solidGround, holedGround]) { ground.receiveShadow = true; root.add(ground); }
  const grass = new THREE.Mesh(turfBlades(HOLE_X, HOLE_RADIUS), bladesMaterial);
  const holeFillGrass = new THREE.Mesh(turfBlades(HOLE_X, HOLE_RADIUS, true), bladesMaterial);
  grass.receiveShadow = holeFillGrass.receiveShadow = true;
  root.add(grass, holeFillGrass);

  const cup = new THREE.Group(); cup.position.x = HOLE_X; root.add(cup);
  // A real opening in the turf, open cylinder walls and a recessed floor.
  const earthMaterial = new THREE.MeshStandardMaterial({ color: '#584b36', roughness: 1,
    side: THREE.BackSide, envMapIntensity: .12, emissive: '#211b13', emissiveIntensity: .22 });
  const linerMaterial = new THREE.MeshStandardMaterial({ color: '#bdc4b4', roughness: .88,
    side: THREE.BackSide, vertexColors: true, envMapIntensity: .12, emissive: '#263027', emissiveIntensity: .20 });
  const earth = new THREE.Mesh(new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS * .98, 1.12, 96, 1, true), earthMaterial);
  earth.position.y = -.56; earth.receiveShadow = true;
  const linerGeometry = new THREE.CylinderGeometry(HOLE_RADIUS - .007, HOLE_RADIUS - .007, .65, 96, 12, true);
  const linerPositions = linerGeometry.getAttribute('position');
  const linerColors: number[] = [];
  for (let i = 0; i < linerPositions.count; i++) {
    const depth = (linerPositions.getY(i) + .325) / .65;
    const ambientOcclusion = .15 + Math.pow(depth, 1.3) * .53;
    linerColors.push(ambientOcclusion, ambientOcclusion, ambientOcclusion);
  }
  linerGeometry.setAttribute('color', new THREE.Float32BufferAttribute(linerColors, 3));
  const liner = new THREE.Mesh(linerGeometry, linerMaterial);
  liner.position.y = -.49; liner.receiveShadow = true;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(HOLE_RADIUS, 96), new THREE.MeshStandardMaterial({ color: '#303a31', roughness: 1 }));
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = -1.115; bottom.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(HOLE_RADIUS + .003, .006, 6, 96), new THREE.MeshStandardMaterial({ color: '#3c4b35', roughness: 1 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = -.001;
  const lip = new THREE.Mesh(new THREE.RingGeometry(HOLE_RADIUS + .002, HOLE_RADIUS + .032, 96, 2),
    new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, roughnessMap: rough,
      color: '#71935b', roughness: 1, side: THREE.DoubleSide }));
  lip.rotation.x = -Math.PI / 2; lip.position.y = .004; lip.receiveShadow = true;
  const fringePositions: number[] = [], fringeColors: number[] = [];
  let edgeSeed = 71723;
  const edgeRandom = () => { edgeSeed = (Math.imul(edgeSeed, 1664525) + 1013904223) | 0;
    return (edgeSeed >>> 0) / 4294967296; };
  for (let index = 0; index < 220; index++) {
    const angle = edgeRandom() * Math.PI * 2;
    const radius = HOLE_RADIUS + .006 + edgeRandom() * .031;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const side = .001 + edgeRandom() * .002, lean = .003 + edgeRandom() * .006;
    fringePositions.push(x - side, .005, z, x + side, .005, z,
      x - Math.cos(angle) * lean, .009 + edgeRandom() * .006, z - Math.sin(angle) * lean);
    const shade = .75 + edgeRandom() * .35;
    for (let vertex = 0; vertex < 3; vertex++) fringeColors.push(.12 * shade, .24 * shade, .08 * shade);
  }
  const fringeGeometry = new THREE.BufferGeometry();
  fringeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fringePositions, 3));
  fringeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fringeColors, 3));
  fringeGeometry.computeVertexNormals();
  const fringe = new THREE.Mesh(fringeGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
  cup.add(earth, liner, bottom, rim, lip, fringe);

  const contactMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .48, depthWrite: false });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMaterial);
  contact.rotation.x = -Math.PI / 2; contact.position.y = .006; root.add(contact);
  let input: StageInput;
  const initial = new THREE.Vector3(), middle = new THREE.Vector3(), final = new THREE.Vector3(), aim = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, -1);
  const configureCamera = (position: THREE.Vector3, target: THREE.Vector3, fov: number) => {
    rig.camera.position.copy(position); rig.camera.fov = fov; rig.camera.near = .025;
    rig.camera.lookAt(target); rig.camera.updateProjectionMatrix(); rig.camera.updateMatrixWorld();
  };
  const updateContact = (height: number, x: number, z: number) => {
    contact.position.set(x - height * .20, .006, z + height * .09);
    const size = .65 + Math.max(0, height) * .15; contact.scale.set(size, size, 1);
    contactMaterial.opacity = .50 * Math.exp(-Math.max(0, height) * 1.8);
  };

  return {
    root,
    start(next) {
      input = next; root.visible = true; course.activate();
      const putting = input.family === 'final-putt';
      holedGround.visible = cup.visible = putting;
      solidGround.visible = holeFillGrass.visible = !putting;
      rig.ball.visible = true; rig.ball.scale.setScalar(1); rig.ball.rotation.set(0, 0, 0);
      rig.ball.castShadow = true; rig.ball.receiveShadow = true;
      rig.ball.material.transparent = false; rig.ball.material.opacity = 1;
      rig.ball.material.color.setHex(0xf9f9f1);
      rig.ball.material.roughness = .31;
      rig.ball.material.envMapIntensity = .55;
      contact.visible = true; contactMaterial.opacity = .5;
    },
    frame(progress): StageSignal {
      const t = clamp(progress), mobile = input.mobile, r = rig.ballRadius;
      if (input.family === 'final-putt') {
        // The centre becomes unsupported once it is fully inside the near rim.
        const startX = -2.15, entryX = HOLE_X - HOLE_RADIUS + r + .025;
        const u = range(t, .06, .65);
        const travel = 1 - Math.pow(1 - u, 1.72);
        const falling = range(t, .65, .86);
        const x = startX + (entryX - startX) * travel + (HOLE_X + .06 - entryX) * falling;
        const y = r - 1.12 * falling * falling;
        rig.ball.position.set(x, y, 0);
        rig.ball.quaternion.setFromAxisAngle(axis, (x - startX) / r);
        // During the fall the floor and cup wall occlude the mesh; opacity stays 1.
        contact.visible = t < .65;
        updateContact(0, x, 0);
        if (mobile) {
          initial.set(-8.0, 3.0, 9.0); middle.set(-3.5, 1.65, 4.1);
        } else {
          initial.set(-.45, .90, 5.1); middle.set(.12, .68, 3.5);
        }
        const follow = smooth(range(t, .08, .69));
        initial.lerp(middle, follow);
        final.set(HOLE_X, .24, .35);
        const push = smooth(range(t, .69, 1));
        initial.lerp(final, push);
        aim.set(-.30 + 1.1 * follow, .065, -.18).lerp(new THREE.Vector3(HOLE_X, -.17, 0), push);
        configureCamera(initial, aim, mobile ? 43 : 35);
        const reveal = smooth(range(t, .90, 1));
        return {
          reveal,
          diagnostics: { physicalGround: true, ballBelowGround: y < -r, ballY: y, holeRadius: HOLE_RADIUS, holeDistance: Math.abs(x - HOLE_X), rollingDistance: x - startX, fall: falling, entry: .65 },
        };
      }

      const impact = .40;
      let x: number, height: number;
      if (t <= impact) {
        const descent = t / impact;
        x = -.90 + .90 * descent;
        height = 2.45 * (1 - descent * descent);
      } else if (t < .67) {
        const bounce = range(t, impact, .67);
        x = .55 * bounce;
        // Grass absorbs most of the incoming energy: a visible but low rebound.
        height = .075 * 4 * bounce * (1 - bounce);
      } else {
        const roll = range(t, .67, .96);
        x = .55 + .26 * (1 - (1 - roll) * (1 - roll)); height = 0;
      }
      rig.ball.position.set(x, r + height, 0);
      rig.ball.quaternion.setFromAxisAngle(axis, (x + .9) / r);
      updateContact(height, x, 0);
      const follow = smooth(range(t, 0, .84));
      initial.set(mobile ? 3.7 : 3.3, mobile ? 3.3 : 2.5, mobile ? 7.2 : 5.4);
      final.set(mobile ? 2.5 : 2.2, mobile ? 1.6 : 1.1, mobile ? 5.8 : 3.8);
      initial.lerp(final, follow);
      aim.set(.05 + .24 * follow, .95 * (1 - follow) + .12, 0);
      configureCamera(initial, aim, mobile ? 39 : 37);
      return {
        reveal: smooth(range(t, .64, 1)),
        diagnostics: { physicalGround: true, contact: impact, height, ballY: r + height },
      };
    },
    stop() { root.visible = false; course.deactivate(); },
    dispose() {
      course.dispose();
      root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
      diffuse.dispose(); normal.dispose(); rough.dispose(); shadowTexture.dispose();
    },
  };
}
