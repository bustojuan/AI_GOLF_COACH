import * as THREE from 'three';
import { clamp, range, smooth } from './types';
import type { CinemaRig, CinemaStage, FrameCapture, ScreenTarget, StageInput } from './types';

type CapturedMoment = FrameCapture & { target?: ScreenTarget };
type Panel = {
  root: THREE.Group;
  photo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  scan?: THREE.ShaderMaterial;
  echoes?: THREE.MeshBasicMaterial[];
  trim: THREE.MeshBasicMaterial;
  label: THREE.MeshBasicMaterial;
  source: CapturedMoment;
  width: number;
  height: number;
};
type Decoration = { material: THREE.Material & { opacity: number }; opacity: number };

const unitPlane = () => new THREE.PlaneGeometry(1, 1);

/**
 * Radar / 1.75 s: open dimensional gantry → sideways camera + physical scan plane
 * → illuminate the real user/reference frames → frontal camera + real panel edges.
 * Replay / 1.95 s: real freeze → four chronological planes separate in depth
 * → camera tracks through the temporal gallery → planes settle into their actual thumbnails.
 * All images are DOM captures supplied by the controller. The rails and scanner are
 * decorative spatial composition, never simulated body tracking or invented measurements.
 */
export function createTechnicalStage(rig: CinemaRig): CinemaStage {
  const root = new THREE.Group();
  root.name = 'cinema-technical-stage';
  root.visible = false;
  rig.scene.add(root);
  const radar = new THREE.Group();
  const gallery = new THREE.Group();
  const media = new THREE.Group();
  root.add(radar, gallery, media);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const transientTextures = new Set<THREE.Texture>();
  const transientMaterials = new Set<THREE.Material>();
  const radarDecor: Decoration[] = [];
  const galleryDecor: Decoration[] = [];
  const ownGeometry = <T extends THREE.BufferGeometry>(value: T) => { geometries.add(value); return value; };
  const ownMaterial = <T extends THREE.Material>(value: T) => { materials.add(value); return value; };
  const plane = ownGeometry(unitPlane());
  const frameShape = ownGeometry(new THREE.BoxGeometry(1, 1, .035));

  // Light, shadow and actual media define the analysis chamber. The three
  // translucent fields recede in depth and feather to black at their edges.
  const atmosphere = ownMaterial(new THREE.ShaderMaterial({
    uniforms: { strength: { value: 0 } }, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float strength;
      void main(){vec2 p=(vUv-.5)*vec2(1.05,1.75);float halo=exp(-dot(p,p)*4.2);
      gl_FragColor=vec4(.10,.21,.16,halo*strength);}`,
  }));
  for (const depth of [-.7, -2.15, -3.6]) {
    const curtain = new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(9.2, 6.2)), atmosphere);
    curtain.position.set(0, .15, depth); radar.add(curtain);
  }
  const floorGlow = ownMaterial(new THREE.ShaderMaterial({
    uniforms: { strength: { value: 0 } }, transparent: true, depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float strength;
      void main(){vec2 p=(vUv-.5)*vec2(1.1,1.5);float glow=exp(-dot(p,p)*8.0);
      gl_FragColor=vec4(.08,.19,.12,glow*strength);}`,
  }));
  const radarFloor = new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(10, 8)), floorGlow);
  radarFloor.rotation.x = -Math.PI / 2; radarFloor.position.set(0, -2.22, -1.35); radar.add(radarFloor);
  const technicalKey = new THREE.PointLight(0xc8efc1, 2.1, 12, 2);
  technicalKey.position.set(-3.3, 2.7, 2.3); radar.add(technicalKey);
  const technicalRim = new THREE.PointLight(0x84a9a0, 1.3, 11, 2);
  technicalRim.position.set(3.5, .6, -2.8); radar.add(technicalRim);

  let scanX = -3.5;

  // One continuous curved timeline carries the four observed instants. The
  // camera tracks sideways along it; it never flies through a loose stack of
  // image cards or enlarges a frame beyond the viewport.
  const galleryMetal = ownMaterial(new THREE.MeshStandardMaterial({
    color: '#324a3b', metalness: .48, roughness: .58, transparent: true,
  }));
  const galleryLime = ownMaterial(new THREE.MeshBasicMaterial({
    color: '#badf82', transparent: true, opacity: .45, toneMapped: false,
  }));
  galleryDecor.push({ material: galleryMetal, opacity: .25 }, { material: galleryLime, opacity: .24 });
  const timeline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.1, 0, -.62), new THREE.Vector3(-2.6, 0, -.20),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.6, 0, -.20),
    new THREE.Vector3(5.1, 0, -.62),
  ]);
  for (const y of [-1.88, 1.76]) {
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, index) => {
      const point = timeline.getPoint(index / 32);
      return new THREE.Vector3(point.x, y, point.z - .13);
    }));
    const track = new THREE.Mesh(ownGeometry(new THREE.TubeGeometry(curve, 64, .018, 5, false)), galleryMetal);
    gallery.add(track);
  }
  for (let index = 0; index < 5; index++) {
    const point = timeline.getPoint(index / 4);
    const rib = new THREE.Mesh(ownGeometry(new THREE.BoxGeometry(.026, 3.64, .025)), galleryMetal);
    rib.position.set(point.x, -.06, point.z - .12); gallery.add(rib);
    const tick = new THREE.Mesh(ownGeometry(new THREE.BoxGeometry(.25, .012, .018)), galleryLime);
    tick.position.set(point.x, -1.89, point.z + .025); gallery.add(tick);
  }
  const playheadMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: '#ddf5a5', transparent: true, opacity: 0, toneMapped: false,
  }));
  const playhead = new THREE.Mesh(ownGeometry(new THREE.CylinderGeometry(.012, .012, 3.45, 6)), playheadMaterial);
  gallery.add(playhead);

  let input: StageInput | null = null;
  let panels: Panel[] = [];
  let replayRibbon: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  let panelCount = 0;
  const cameraTarget = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const targetSize = new THREE.Vector2();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const baseQuaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();

  function clearPanels() {
    media.clear();
    replayRibbon?.removeFromParent(); replayRibbon?.geometry.dispose(); replayRibbon = null;
    panels = [];
    for (const texture of transientTextures) texture.dispose();
    for (const material of transientMaterials) material.dispose();
    transientTextures.clear();
    transientMaterials.clear();
  }

  function makeReplayRibbon(sources: CapturedMoment[]) {
    if (sources.length < 2) return;
    const canvas = document.createElement('canvas');
    const cellWidth = 384, height = 640;
    canvas.width = cellWidth * sources.length; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#09140e'; context.fillRect(0, 0, canvas.width, height);
    sources.forEach((source, index) => {
      const { width, height: sourceHeight } = source.canvas;
      // Cover-crop preserves proportions; every pixel still comes from the
      // actual observed frame, with no generated player or inferred pose.
      const scale = Math.max(cellWidth / width, height / sourceHeight);
      const drawnWidth = width * scale, drawnHeight = sourceHeight * scale;
      context.drawImage(source.canvas, index * cellWidth + (cellWidth - drawnWidth) / 2,
        (height - drawnHeight) / 2, drawnWidth, drawnHeight);
      const fade = context.createLinearGradient(0, height * .72, 0, height);
      fade.addColorStop(0, 'rgba(4,18,10,0)'); fade.addColorStop(1, 'rgba(4,18,10,.88)');
      context.fillStyle = fade; context.fillRect(index * cellWidth, height * .72, cellWidth, height * .28);
      context.fillStyle = '#d9edc4'; context.font = '500 25px system-ui, sans-serif';
      context.fillText(`${String(index + 1).padStart(2, '0')}  ${source.label}`, index * cellWidth + 25, height - 34, cellWidth - 45);
      if (index) { context.fillStyle = 'rgba(8,22,14,.82)'; context.fillRect(index * cellWidth - 4, 0, 8, height); }
    });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false; transientTextures.add(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0,
      side: THREE.DoubleSide, toneMapped: false, fog: false, depthWrite: false });
    transientMaterials.add(material);
    const geometry = new THREE.PlaneGeometry(8.9, 3.6, 80, 1);
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index) / 4.45;
      positions.setZ(index, -.52 * x * x);
    }
    geometry.computeVertexNormals();
    replayRibbon = new THREE.Mesh(geometry, material);
    replayRibbon.position.set(0, -.08, .12);
    gallery.add(replayRibbon);
  }

  function captionTexture(text: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      context.font = '500 33px system-ui, sans-serif';
      context.fillStyle = '#d9e4d7';
      context.textBaseline = 'middle';
      context.fillText(text.slice(0, 56), 12, 47, 744);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    transientTextures.add(texture);
    return texture;
  }

  function makePanel(source: CapturedMoment, index: number): Panel {
    const isRadar = input?.family === 'radar-scan';
    const texture = new THREE.CanvasTexture(source.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    transientTextures.add(texture);
    const imageMaterial = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    const trimMaterial = new THREE.MeshBasicMaterial({
      color: index === 0 ? '#8aab6d' : '#5d7865', transparent: true, toneMapped: false,
    });
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: captionTexture(source.label), transparent: true, toneMapped: false, fog: false, depthWrite: false,
    });
    transientMaterials.add(imageMaterial);
    transientMaterials.add(trimMaterial);
    transientMaterials.add(labelMaterial);
    const group = new THREE.Group();
    group.name = `real-frame-${index}`;
    const trim = new THREE.Mesh(frameShape, trimMaterial);
    trim.scale.set(1.012, 1.016, 1);
    trim.position.z = -.02;
    const photo = new THREE.Mesh(plane, imageMaterial);
    const label = new THREE.Mesh(plane, labelMaterial);
    label.scale.set(1, .125, 1);
    label.position.set(0, -.60, .002);
    group.add(trim, photo, label);
    let scanOverlay: THREE.ShaderMaterial | undefined;
    let echoes: THREE.MeshBasicMaterial[] | undefined;
    if (isRadar) {
      // These translucent offsets are derived from the same captured video
      // frame. They communicate layer separation, not extra observations.
      echoes = [-.34, -.67].map((depth, layer) => {
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
          opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false });
        transientMaterials.add(material);
        const echo = new THREE.Mesh(plane, material);
        echo.position.set((index === 0 ? -1 : 1) * (layer + 1) * .055, .015, depth);
        group.add(echo);
        return material;
      });
      scanOverlay = new THREE.ShaderMaterial({
        uniforms: { position: { value: -1 }, strength: { value: 0 } },
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec2 vUv; uniform float position; uniform float strength;
          void main(){float band=exp(-pow((vUv.x-position)*7.0,2.0));
          float vertical=.56+.44*exp(-pow((vUv.y-.5)*2.0,2.0));
          gl_FragColor=vec4(.42,.72,.33,band*vertical*strength);}`,
      });
      transientMaterials.add(scanOverlay);
      const overlay = new THREE.Mesh(plane, scanOverlay);
      overlay.position.z = .014; overlay.renderOrder = 2; group.add(overlay);
    }
    media.add(group);
    const isMobile = input?.mobile ?? false;
    const maxWidth = isMobile ? (isRadar ? 2 : 1.45) : isRadar ? 3.8 : 1.94;
    const maxHeight = isRadar ? (isMobile ? (panelCount > 1 ? 1.8 : 2.6) : 3.85)
      : isMobile ? 2.1 : 2.68;
    const aspect = Math.max(.25, Math.min(4, source.aspect || 1));
    const width = Math.min(maxWidth, maxHeight * aspect);
    return { root: group, photo, scan: scanOverlay, echoes, trim: trimMaterial, label: labelMaterial,
      source, width, height: width / aspect };
  }

  function visibleTarget(target: ScreenTarget | undefined) {
    return !!input && !!target && target.width > 1 && target.height > 1
      && target.x < input.width && target.x + target.width > 0
      && target.y < input.height - 10 && target.y + target.height > 0;
  }

  // Convert actual CSS-pixel destinations into camera-facing world planes. Keeping
  // aspect ratio and the capture's own target prevents a false user/reference hand-off.
  function projectTarget(panel: Panel) {
    const target = panel.source.target;
    if (!input || !target || !visibleTarget(target)) return false;
    const depth = 7;
    const worldHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov / 2));
    const worldWidth = worldHeight * rig.camera.aspect;
    const aspect = panel.source.aspect || 1;
    let width = target.width;
    let height = width / aspect;
    if (height > target.height) { height = target.height; width = height * aspect; }
    const ndcX = 2 * (target.x + target.width / 2) / input.width - 1;
    const ndcY = 1 - 2 * (target.y + target.height / 2) / input.height;
    rig.camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(rig.camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    targetPosition.copy(rig.camera.position).addScaledVector(forward, depth)
      .addScaledVector(right, ndcX * worldWidth / 2).addScaledVector(up, ndcY * worldHeight / 2);
    targetSize.set(worldWidth * width / input.width, worldHeight * height / input.height);
    return true;
  }

  function drawPanel(panel: Panel, index: number, t: number, isRadar: boolean) {
    if (!input) return false;
    const mobile = input.mobile;
    const arrive = smooth(range(t, .70, .96));
    const travel = smooth(range(t, .10, .76));
    const side = index % 2 === 0 ? -1 : 1;
    let opacity: number;
    if (isRadar) {
      const count = panels.length;
      const x = count === 1 ? 0 : mobile ? side * .25 : side * 1.63;
      const y = mobile && count > 1 ? (index === 0 ? .96 : -1.14) : .04;
      panel.root.position.set(x, y, index === 0 ? .28 : -1.38);
      euler.set(0, side * -.22 * (1 - arrive), 0);
      // Activate only when the physical sweep reaches this panel's location.
      const sweepProgress = range(t, .14, .70);
      const hit = mobile ? .28 + index * .12 : count === 1 ? .5 : index === 0 ? .24 : .76;
      opacity = .38 + .62 * smooth(clamp((sweepProgress - hit + .12) / .24));
    } else {
      const point = timeline.getPoint((index + .5) / 4);
      panel.root.position.set(point.x, -.04, point.z + .055);
      euler.set(0, (index - 1.5) * -.055, 0);
      opacity = smooth(range(t, .73, .84));
    }
    panel.root.scale.set(panel.width, panel.height, 1);
    baseQuaternion.setFromEuler(euler);
    panel.root.quaternion.copy(baseQuaternion);
    const bridged = projectTarget(panel);
    if (bridged) {
      panel.root.position.lerp(targetPosition, arrive);
      panel.root.scale.x = THREE.MathUtils.lerp(panel.width, targetSize.x, arrive);
      panel.root.scale.y = THREE.MathUtils.lerp(panel.height, targetSize.y, arrive);
      panel.root.quaternion.slerp(rig.camera.quaternion, arrive);
      opacity = THREE.MathUtils.lerp(opacity, 1, smooth(range(t, .78, .94)));
    } else {
      opacity *= 1 - smooth(range(t, .76, .96));
    }
    panel.photo.material.opacity = opacity;
    if (isRadar && panel.scan) {
      const sweepX = -3.5 + 7 * smooth(range(t, .14, .70));
      panel.scan.uniforms.position.value = (sweepX - panel.root.position.x) / Math.max(.1, panel.width) + .5;
      panel.scan.uniforms.strength.value = .64 * smooth(range(t, .12, .24))
        * (1 - smooth(range(t, .70, .82))) * opacity;
      panel.echoes?.forEach((echo, layer) => { echo.opacity = opacity * (.15 - layer * .05)
        * (1 - smooth(range(t, .64, .86))); });
    }
    panel.trim.opacity = opacity * (isRadar ? .06 : .24) * (1 - smooth(range(t, .78, .96)));
    panel.label.opacity = opacity * (1 - smooth(range(t, .68, .84)));
    panel.root.visible = opacity > .002;
    return bridged;
  }

  return {
    root,
    start(next) {
      clearPanels();
      input = next;
      root.visible = true;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.scale.set(1, 1, 1);
      const isRadar = next.family === 'radar-scan';
      radar.visible = isRadar;
      gallery.visible = !isRadar;
      radar.scale.x = next.mobile ? .50 : 1;
      gallery.scale.x = next.mobile ? .57 : 1;
      rig.ball.visible = false;
      const unique = new Map<string, CapturedMoment>();
      for (const capture of next.frames) {
        // The two sides may legitimately use the same source file (as in the
        // visual regression fixture); they still occupy distinct destinations.
        const key = isRadar ? `${capture.label}:${capture.source}` : capture.source;
        if (capture.canvas.width > 0 && capture.canvas.height > 0 && !unique.has(key)) {
          unique.set(key, capture);
        }
      }
      const available = [...unique.values()];
      const limit = isRadar ? 2 : 4;
      const selected = available.length <= limit ? available
        : Array.from({ length: limit }, (_, index) => available[Math.round(index * (available.length - 1) / (limit - 1))]);
      panelCount = selected.length;
      panels = selected.map(makePanel);
      if (!isRadar) makeReplayRibbon(selected);
    },
    frame(progress) {
      if (!input) return { reveal: 1 };
      const t = clamp(progress);
      const isRadar = input.family === 'radar-scan';
      const mobile = input.mobile;
      const settle = smooth(range(t, .67, .95));
      const environmentOpacity = smooth(range(t, 0, .12)) * (1 - smooth(range(t, .71, .97)));
      rig.ball.visible = false;
      rig.camera.fov = mobile ? 49 : 43;
      rig.camera.aspect = input.width / Math.max(1, input.height);
      if (isRadar) {
        const orbit = smooth(range(t, .04, .65));
        const angle = THREE.MathUtils.lerp(-.62, .46, orbit) * (1 - settle);
        const distance = mobile ? 7.9 : 8.8;
        rig.camera.position.set(Math.sin(angle) * distance * (mobile ? .7 : 1), .5 * (1 - settle), Math.cos(angle) * distance);
        cameraTarget.set(0, 0, -.9 * (1 - settle));
        const sweep = smooth(range(t, .14, .70));
        scanX = -3.5 + 7 * sweep;
        atmosphere.uniforms.strength.value = .32 * environmentOpacity;
        floorGlow.uniforms.strength.value = .56 * environmentOpacity;
      } else {
        const travel = smooth(range(t, .08, .76));
        rig.camera.position.set((mobile ? -.25 : -1.65 + 3.3 * travel) * (1 - settle),
          .42 * (1 - settle), mobile ? 8.5 : 7.35 - .34 * Math.sin(Math.PI * travel));
        cameraTarget.set((mobile ? 0 : -1.4 + 2.8 * travel) * (1 - settle), -.04 * (1 - settle), -.12);
        const point = timeline.getPoint(travel);
        playhead.position.set(point.x, -.06, point.z + .13);
        playheadMaterial.opacity = .45 * smooth(range(t, .08, .22)) * (1 - smooth(range(t, .70, .84)));
        if (replayRibbon) replayRibbon.material.opacity = smooth(range(t, .03, .19))
          * (1 - smooth(range(t, .68, .78)));
      }
      rig.camera.lookAt(cameraTarget);
      rig.camera.updateProjectionMatrix();
      rig.camera.updateMatrixWorld();
      for (const decoration of isRadar ? radarDecor : galleryDecor) {
        decoration.material.opacity = decoration.opacity * (isRadar ? environmentOpacity
          : smooth(range(t, 0, .12)) * (1 - smooth(range(t, .66, .82))));
      }
      let bridges = 0;
      for (const [index, panel] of panels.entries()) {
        if (drawPanel(panel, index, t, isRadar)) bridges++;
      }
      return {
        reveal: smooth(range(t, .79, 1)),
        mediaBridge: bridges > 0 && t >= .96,
        diagnostics: {
          scene: isRadar ? 'dimensional-sports-scan' : 'real-temporal-gallery',
          realFrames: panels.length,
          targetBridges: bridges,
          frameLabels: panels.map(panel => panel.source.label).join(' / '),
          cameraX: rig.camera.position.x,
          cameraZ: rig.camera.position.z,
          scanX: isRadar ? scanX : 0,
          noSyntheticBody: true,
        },
      };
    },
    stop() {
      root.visible = false;
      input = null;
      clearPanels();
    },
    dispose() {
      root.visible = false;
      clearPanels();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      root.removeFromParent();
    },
  };
}
