import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGolfBallGeometry, createBallMaterial } from './golfAssets';
import { createFlightStage } from './flightStages';
import { createGroundStage } from './groundStages';
import { createTechnicalStage } from './technicalStages';
import { relativeTarget } from './capture';
import type { CinemaStage, StageInput, StageSignal } from './types';

export type CinemaEngine = ReturnType<typeof buildEngine>;
export function createCinemaEngine(layer: HTMLElement): CinemaEngine | null {
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, powerPreference: 'low-power' });
    return buildEngine(layer, renderer);
  } catch {
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); return null;
  }
}

function buildEngine(layer: HTMLElement, renderer: THREE.WebGLRenderer) {
  const mobile = layer.clientWidth < 700;
  const canvas = renderer.domElement;
  canvas.className = 'golf-cinema-canvas'; canvas.setAttribute('aria-hidden', 'true');
  canvas.style.visibility = 'hidden'; layer.append(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setClearColor(0x07110b, 1); renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07110b);
  scene.fog = new THREE.FogExp2(0x07110b, .035);
  const camera = new THREE.PerspectiveCamera(35, 1, .035, 110);
  const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, .04); room.dispose(); generator.dispose();
  scene.environment = environment.texture; scene.environmentIntensity = .38;
  scene.add(new THREE.HemisphereLight(0xdce8df, 0x152319, .65));
  const key = new THREE.DirectionalLight(0xfff1d8, 3.0); key.position.set(-3, 7, 4); key.castShadow = true;
  key.shadow.mapSize.setScalar(mobile ? 512 : 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 35 });
  key.shadow.bias = -.0002; key.shadow.normalBias = .012; key.shadow.radius = 3;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xc5e6a7, 1.8); rim.position.set(4, 3, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9caeaf, .45); fill.position.set(4, 2, 5); scene.add(fill);
  const ballAsset = createBallMaterial(), ballRadius = .21;
  const ball = new THREE.Mesh(createGolfBallGeometry(mobile, ballRadius), ballAsset.material);
  ball.castShadow = true; ball.receiveShadow = true; scene.add(ball);
  const rig = { scene, camera, ball, ballRadius, key };
  const flight = createFlightStage(rig), ground = createGroundStage(rig), technical = createTechnicalStage(rig);
  const stages = [flight, ground, technical];
  let current: CinemaStage | undefined, input: StageInput | undefined, usable = true;
  let swingPrimed = false, swingPriming: Promise<void> | null = null;
  const point = new THREE.Vector3();
  const lost = (event: Event) => { event.preventDefault(); usable = false; canvas.style.visibility = 'hidden'; };
  canvas.addEventListener('webglcontextlost', lost);
  function configure(next: StageInput) {
    current?.stop(); stages.forEach(stage => { stage.root.visible = false; });
    input = next;
    renderer.setPixelRatio(Math.min(devicePixelRatio, next.mobile ? 1.25 : 1.5)); renderer.setSize(next.width, next.height, false);
    camera.aspect = next.width / next.height;
    ball.position.set(0, ballRadius, 0); ball.rotation.set(0, 0, 0); ball.scale.setScalar(1); ball.visible = true;
    ball.material.opacity = 1; ball.material.transparent = false;
    current = next.family === 'swing-impact' || next.family === 'ball-flight' ? flight
      : next.family === 'landing-impact' || next.family === 'final-putt' ? ground : technical;
    current.start(next); camera.updateProjectionMatrix();
  }
  function project(vector: THREE.Vector3) {
    point.copy(vector).project(camera);
    return { x: (point.x + 1) * (input?.width ?? 1) / 2, y: (1 - point.y) * (input?.height ?? 1) / 2 };
  }
  function render(progress: number) {
    if (!usable || !current || !input) return null;
    const signal: StageSignal = current.frame(progress);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    let aperture: { x: number; y: number; rx: number; ry: number } | undefined;
    if (signal.aperture) {
      const center = project(signal.aperture.center), xs: number[] = [], ys: number[] = [];
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16;
        const p = project(new THREE.Vector3(signal.aperture.center.x + Math.cos(angle) * signal.aperture.radius,
          signal.aperture.center.y, signal.aperture.center.z + Math.sin(angle) * signal.aperture.radius));
        xs.push(p.x); ys.push(p.y);
      }
      aperture = { ...center, rx: Math.min(input.width * 3, Math.max(...xs) - center.x),
        ry: Math.min(input.height * 3, Math.max(...ys) - center.y) };
    }
    canvas.dataset.cinemaFrame = JSON.stringify({ family: input.family, t: progress, signal,
      camera: camera.position.toArray(), ball: ball.position.toArray(), calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, aperture });
    return { ...signal, aperture };
  }
  function primeSwing(video: HTMLVideoElement) {
    if (swingPrimed || swingPriming || !usable || !video.isConnected || video.readyState < 2) return swingPriming;
    swingPriming = (async () => {
      await flight.ready;
      if (!usable || !canvas.isConnected || canvas.style.visibility !== 'hidden') return;
      const width = layer.clientWidth, height = layer.clientHeight;
      if (!width || !height) return;
      const bounds = relativeTarget(video, layer);
      configure({ family: 'swing-impact', width, height, mobile: width < 700, frames: [],
        target: { x: width * .52, y: height * .2, width: width * .42, height: height * .62 },
        studioVideo: { element: video, bounds } });
      // Compile the actual Studio Dark video and the outdoor materials in the
      // hidden canvas, after their images have loaded and before the user clicks.
      flight.frame(.25);
      await renderer.compileAsync(scene, camera);
      if (!usable || canvas.style.visibility !== 'hidden') return;
      renderer.render(scene, camera);
      flight.frame(.7);
      renderer.render(scene, camera);
      current?.stop(); ball.visible = false; swingPrimed = true;
    })().catch(() => { if (canvas.style.visibility === 'hidden') { current?.stop(); ball.visible = false; } })
      .finally(() => { swingPriming = null; });
    return swingPriming;
  }
  // Warm all program variants at rest, before the user's click. No continuous render loop.
  const base: StageInput = { family: 'ball-flight', width: Math.max(1, layer.clientWidth), height: Math.max(1, layer.clientHeight),
    mobile, frames: [], target: { x: 100, y: 100, width: 400, height: 300 } };
  for (const family of ['ball-flight', 'landing-impact', 'final-putt', 'radar-scan'] as const) {
    configure({ ...base, family }); render(.35);
  }
  current?.stop(); ball.visible = false;
  return {
    canvas, configure, render, primeSwing,
    get usable() { return usable; },
    show() { canvas.style.visibility = 'visible'; },
    hide() { current?.stop(); canvas.style.visibility = 'hidden'; canvas.style.removeProperty('mask-image'); canvas.style.removeProperty('opacity'); },
    dispose() {
      usable = false; canvas.removeEventListener('webglcontextlost', lost); stages.forEach(stage => stage.dispose());
      ball.geometry.dispose(); ballAsset.dispose(); environment.dispose(); key.shadow.map?.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
