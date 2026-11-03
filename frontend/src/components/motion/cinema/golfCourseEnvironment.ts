import * as THREE from 'three';
import type { CinemaRig } from './types';

const asset = '/motion/golf-course/';

function randomSeed(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

function terrainHeight(x: number, z: number) {
  return -.67 + .075 * Math.sin(x * .18 + z * .055) + .055 * Math.sin(z * .31 - x * .09)
    + .13 * Math.sin(x * .062 + z * .13) * Math.min(1, Math.abs(x) / 13);
}

/** One reusable outdoor set. The photographed horizon is distant; all foreground parallax is 3D. */
export function createGolfCourseEnvironment(rig: CinemaRig, options: { showTerrain?: boolean } = {}) {
  const root = new THREE.Group(); root.visible = false; rig.scene.add(root);
  const loader = new THREE.TextureLoader();
  const pending: Promise<void>[] = [];
  function loadTexture(name: string) {
    let complete!: () => void;
    pending.push(new Promise<void>(resolve => { complete = resolve; }));
    return loader.load(`${asset}${name}`, complete, undefined, complete);
  }
  const panorama = loadTexture('limpopo_golf_course_4k.jpg');
  panorama.mapping = THREE.EquirectangularReflectionMapping;
  panorama.colorSpace = THREE.SRGBColorSpace;
  const diffuse = loadTexture('grass_ground_diff_1k.jpg');
  diffuse.colorSpace = THREE.SRGBColorSpace;
  const normal = loadTexture('grass_ground_nor_gl_1k.jpg');
  const rough = loadTexture('grass_ground_rough_1k.jpg');
  const ready = Promise.all(pending).then(() => undefined);
  for (const texture of [diffuse, normal, rough]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 17);
    texture.anisotropy = 4;
  }

  const geometry = new THREE.PlaneGeometry(90, 115, 76, 98);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -38);
  const vertices = geometry.getAttribute('position');
  const colors = new Float32Array(vertices.count * 4);
  const fairway = new THREE.Color(0xa3c777), roughGrass = new THREE.Color(0x789d62);
  const patch = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    vertices.setY(i, terrainHeight(x, z));
    const ribbon = x - 1.5 * Math.sin(z * .09), width = 5.5 + Math.abs(z) * .09;
    const edge = THREE.MathUtils.smoothstep(Math.abs(ribbon), width, width + 3.7);
    patch.copy(fairway).lerp(roughGrass, edge);
    const variation = .94 + .045 * Math.sin(x * .5 + z * .13) + .025 * Math.sin(z * .62);
    colors[i * 4] = patch.r * variation;
    colors[i * 4 + 1] = patch.g * variation;
    colors[i * 4 + 2] = patch.b * variation;
    colors[i * 4 + 3] = 1 - THREE.MathUtils.smoothstep(-z, 8, 34);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  const groundMaterial = new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, roughnessMap: rough,
    color: 0xb9d99b, vertexColors: true, roughness: .98, metalness: 0, side: THREE.DoubleSide,
    transparent: true, depthWrite: false });
  groundMaterial.normalScale.set(.24, .24);
  const ground = new THREE.Mesh(geometry, groundMaterial);
  ground.receiveShadow = true; ground.visible = options.showTerrain !== false; root.add(ground);

  // Instanced near-field blades give the tracking camera actual foreground parallax.
  const bladeGeometry = new THREE.PlaneGeometry(.005, .034);
  bladeGeometry.translate(0, .017, 0);
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x759a5e, roughness: .98, side: THREE.DoubleSide });
  const count = 3800, blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, count);
  const random = randomSeed(47473), dummy = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = (random() - .5) * 20, z = random() * 13 - 7;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.set((random() - .5) * .35, random() * Math.PI, (random() - .5) * .26);
    dummy.scale.setScalar(.65 + random() * .85);
    dummy.updateMatrix(); blades.setMatrixAt(i, dummy.matrix);
    tint.setHSL(.23 + random() * .055, .25 + random() * .12, .19 + random() * .12);
    blades.setColorAt(i, tint);
  }
  blades.instanceMatrix.needsUpdate = true;
  blades.frustumCulled = false; blades.receiveShadow = true;
  blades.visible = options.showTerrain !== false; root.add(blades);

  const sun = new THREE.DirectionalLight(0xfff4dc, 2.55);
  sun.position.set(8, 12, -5); sun.target.position.set(0, -.6, -6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 16, bottom: -16, near: .1, far: 55 });
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .025;
  const skyFill = new THREE.HemisphereLight(0xddeeff, 0x49693b, 1.15);
  root.add(sun, sun.target, skyFill);

  const previous = { background: rig.scene.background, fog: rig.scene.fog,
    rotation: rig.scene.backgroundRotation.clone(), keyIntensity: rig.key.intensity };
  function activate() {
    root.visible = true;
    rig.scene.background = panorama;
    rig.scene.backgroundRotation.set(0, .55, 0);
    rig.scene.fog = new THREE.Fog(0xcbd9c1, 46, 120);
    rig.key.intensity = 0; // The outdoor sun is the sole shadow-casting key.
  }
  function deactivate() {
    root.visible = false;
    rig.scene.background = previous.background;
    rig.scene.backgroundRotation.copy(previous.rotation);
    rig.scene.fog = previous.fog;
    rig.key.intensity = previous.keyIntensity;
  }
  function dispose() {
    deactivate(); root.removeFromParent();
    geometry.dispose(); groundMaterial.dispose(); bladeGeometry.dispose(); bladeMaterial.dispose();
    for (const texture of [panorama, diffuse, normal, rough]) texture.dispose();
    sun.shadow.map?.dispose();
  }
  return { root, activate, deactivate, dispose, ready };
}
