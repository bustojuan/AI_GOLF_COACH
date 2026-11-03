import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const FLIGHT_3D_DURATION = 1880;

/** Recessed geometry, not painted dots: dimples respond to actual light and rotation. */
function golfGeometry(mobile: boolean) {
  const geometry = new THREE.SphereGeometry(.42, mobile ? 96 : 144, mobile ? 64 : 96);
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < 360; i++) {
    const y = 1 - 2 * (i + .5) / 360, a = i * Math.PI * (3 - Math.sqrt(5));
    centers.push(new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y)));
  }
  const position = geometry.attributes.position, normal = new THREE.Vector3();
  const rim = Math.cos(.079);
  for (let i = 0; i < position.count; i++) {
    normal.fromBufferAttribute(position, i).normalize();
    let nearest = -1;
    for (const center of centers) nearest = Math.max(nearest, normal.dot(center));
    const bowl = clamp((nearest - rim) / (1 - rim));
    const radius = .42 - .006 * Math.sin(bowl * Math.PI / 2) ** 2;
    position.setXYZ(i, normal.x * radius, normal.y * radius, normal.z * radius);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export type FlightScene = ReturnType<typeof buildScene>;
export function createFlightScene(layer: HTMLElement): FlightScene | null {
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    return buildScene(layer, renderer);
  } catch {
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); return null;
  }
}

function buildScene(layer: HTMLElement, renderer: THREE.WebGLRenderer) {
  const mobile = layer.clientWidth < 700;
  const canvas = renderer.domElement;
  canvas.className = 'golf-flight-3d'; canvas.style.visibility = 'hidden';
  canvas.setAttribute('aria-hidden', 'true'); layer.append(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 46 : 40, 1, .1, 80);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .32;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xd6e5d7, 0x13241b, 1.5));
  const key = new THREE.DirectionalLight(0xfff3df, 3.2); key.position.set(-3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc5ec83, 1.4); rim.position.set(4, 2, -4); scene.add(rim);
  const material = new THREE.MeshPhysicalMaterial({ color: 0xedece3, roughness: .34, metalness: 0,
    clearcoat: .18, clearcoatRoughness: .32, transparent: true });
  const ball = new THREE.Mesh(golfGeometry(mobile), material); scene.add(ball);
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(97 * 3);
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xc5ec83, transparent: true, opacity: .7 });
  const trail = new THREE.Line(lineGeometry, lineMaterial); trail.frustumCulled = false; scene.add(trail);
  let width = 1, height = 1, usable = true;
  let curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  const projected = new THREE.Vector3(), radiusPoint = new THREE.Vector3();
  const onLost = (event: Event) => { event.preventDefault(); usable = false; canvas.style.visibility = 'hidden'; };
  canvas.addEventListener('webglcontextlost', onLost);
  function setCamera(t: number) {
    const follow = smooth((t - .12) / .72);
    camera.position.set(.7 * follow, .35 + .16 * follow, 8 - .85 * follow);
    camera.lookAt(.3 * follow, .2 + .2 * follow, -.65 * follow); camera.updateMatrixWorld();
  }
  function configure(w: number, h: number, end: { x: number; y: number }) {
    width = w; height = h; renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); setCamera(1);
    // Unproject the real destination panel rim onto a plane in the depth of the scene.
    const ray = new THREE.Vector3(end.x / w * 2 - 1, 1 - end.y / h * 2, .5).unproject(camera).sub(camera.position).normalize();
    const destination = camera.position.clone().addScaledVector(ray, (-9 - camera.position.z) / ray.z);
    curve = new THREE.CubicBezierCurve3(new THREE.Vector3(mobile ? -.43 : -1.8, -.45, 3.2),
      new THREE.Vector3(mobile ? -.05 : -.8, .1, 5.8), new THREE.Vector3(.6, 1.6, -2), destination);
  }
  function sample(ms: number) {
    const t = clamp((ms - 230) / 1100);
    const travel = smooth(t);
    setCamera(travel);
    ball.position.copy(curve.getPoint(travel));
    projected.copy(ball.position).project(camera);
    radiusPoint.copy(ball.position); radiusPoint.x += .42; radiusPoint.project(camera);
    return { t: travel, x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2,
      radius: Math.abs(radiusPoint.x - projected.x) * width / 2,
      scale: 1 - .98 * smooth((ms - 1330) / 210),
      opacity: smooth(ms / 170) * (1 - smooth((ms - 1390) / 150)) };
  }
  function render(ms: number) {
    if (!usable) return false;
    const state = sample(ms);
    ball.rotation.set(state.t * 4.2, state.t * 5.7, .2 + state.t * 1.5);
    ball.scale.setScalar(state.scale);
    material.opacity = state.opacity;
    const head = state.t;
    for (let i = 0; i < 97; i++) {
      const point = curve.getPoint(head * i / 96);
      linePositions.set([point.x, point.y, point.z], i * 3);
    }
    lineGeometry.attributes.position.needsUpdate = true;
    lineMaterial.opacity = .58 * smooth(ms / 300) * (1 - smooth((ms - 1330) / 170));
    renderer.render(scene, camera);
    canvas.dataset.projected = JSON.stringify({ ...state, z: ball.position.z, camera: camera.position.toArray(), triangles: renderer.info.render.triangles });
    return true;
  }
  configure(Math.max(1, layer.clientWidth), Math.max(1, layer.clientHeight), { x: layer.clientWidth * .8, y: 100 });
  render(0); // Compile before the click; no idle animation loop.
  return {
    canvas, sample, render, configure,
    projectedTrail() {
      setCamera(1);
      return Array.from({ length: 49 }, (_, i) => {
        const point = curve.getPoint(i / 48).project(camera);
        return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
      });
    },
    get usable() { return usable; },
    show() { canvas.style.visibility = 'visible'; },
    hide() { canvas.style.visibility = 'hidden'; },
    dispose() {
      usable = false; canvas.removeEventListener('webglcontextlost', onLost);
      ball.geometry.dispose(); material.dispose(); lineGeometry.dispose(); lineMaterial.dispose(); environment.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
