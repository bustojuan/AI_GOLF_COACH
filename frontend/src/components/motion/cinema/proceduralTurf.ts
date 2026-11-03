import * as THREE from 'three';

/** Authored locally: no downloaded textures or models. Seeded so replays never flicker. */
function randomSeed(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

export function turfTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const random = randomSeed(78419);
  const pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const grain = (random() - .5) * 15;
    const mowing = Math.sin(x / 512 * Math.PI * 4) * 2.7;
    pixels.data[i] = 22 + grain * .63 + mowing;
    pixels.data[i + 1] = 49 + grain + mowing;
    pixels.data[i + 2] = 27 + grain * .51;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  // Fine, overlapping leaf tips rather than a large noisy green checkerboard.
  for (let i = 0; i < 33000; i++) {
    const x = random() * 512, y = random() * 512, light = random();
    ctx.strokeStyle = `rgba(${25 + Math.round(light * 30)},${50 + Math.round(light * 35)},${25 + Math.round(light * 20)},${.15 + light * .25})`;
    ctx.lineWidth = .45 + random() * .45;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 2 - .6, y - 1 - random() * 4); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function groundGeometry(hole: boolean, holeX: number, radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-60, -60); shape.lineTo(60, -60); shape.lineTo(60, 60); shape.lineTo(-60, 60); shape.closePath();
  if (hole) {
    const cut = new THREE.Path();
    cut.absarc(holeX, 0, radius, 0, Math.PI * 2, true);
    shape.holes.push(cut);
  }
  const geometry = new THREE.ShapeGeometry(shape, 96);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / 2.1, positions.getZ(i) / 2.1);
  return geometry;
}

export function turfBlades(holeX: number, radius: number, fillHole = false): THREE.BufferGeometry {
  const random = randomSeed(fillHole ? 835 : 7431);
  const positions: number[] = [], colors: number[] = [];
  const count = fillHole ? 190 : 12000;
  for (let i = 0; i < count; i++) {
    const x = fillHole ? holeX + (random() * 2 - 1) * radius : random() * 12 - 6;
    const z = fillHole ? (random() * 2 - 1) * radius : random() * 9 - 4.5;
    const d = Math.hypot(x - holeX, z);
    if (fillHole ? d > radius + .015 : d < radius + .013) continue;
    const angle = random() * Math.PI * 2;
    const w = .0015 + random() * .002;
    const h = .003 + random() * .006;
    const dx = Math.cos(angle) * w, dz = Math.sin(angle) * w;
    positions.push(x - dx, .001, z - dz, x + dx, .001, z + dz, x + dx * .7, h, z + dz * .6);
    const color = new THREE.Color().setRGB(.11 + random() * .05, .21 + random() * .06, .075 + random() * .04);
    for (let v = 0; v < 3; v++) { const lift = v === 2 ? 1.26 : 1; colors.push(color.r * lift, color.g * lift, color.b * lift); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function contactTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.84)'); gradient.addColorStop(.32, 'rgba(0,0,0,.50)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
