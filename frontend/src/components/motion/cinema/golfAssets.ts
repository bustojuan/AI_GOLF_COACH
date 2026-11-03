import * as THREE from 'three';

export function createGolfBallGeometry(mobile: boolean, radius = .21) {
  const geometry = new THREE.SphereGeometry(radius, mobile ? 128 : 192, mobile ? 96 : 144);
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < 360; i++) {
    const y = 1 - 2 * (i + .5) / 360, angle = i * Math.PI * (3 - Math.sqrt(5));
    centers.push(new THREE.Vector3(Math.cos(angle) * Math.sqrt(1 - y * y), y, Math.sin(angle) * Math.sqrt(1 - y * y)));
  }
  const p = geometry.attributes.position, direction = new THREE.Vector3(), rim = Math.cos(.078);
  for (let i = 0; i < p.count; i++) {
    direction.fromBufferAttribute(p, i).normalize();
    let nearest = -1;
    for (const c of centers) nearest = Math.max(nearest, direction.dot(c));
    const bowl = Math.max(0, (nearest - rim) / (1 - rim));
    const r = radius - radius * .014 * Math.sin(bowl * Math.PI / 2) ** 2;
    p.setXYZ(i, direction.x * r, direction.y * r, direction.z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createBallMaterial() {
  // Subtle polymer grain, not grey dots standing in for the recessed dimples.
  const data = new Uint8Array(128 * 128 * 4);
  let seed = 1391;
  for (let i = 0; i < 128 * 128; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 229 + seed % 23;
    data.set([grain, grain, grain, 255], i * 4);
  }
  const grain = new THREE.DataTexture(data, 128, 128);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(5, 3); grain.needsUpdate = true;
  const material = new THREE.MeshPhysicalMaterial({ color: 0xe5e7df, roughness: .38, roughnessMap: grain,
    metalness: 0, clearcoat: .1, clearcoatRoughness: .4, envMapIntensity: .35 });
  return { material, dispose() { grain.dispose(); material.dispose(); } };
}
