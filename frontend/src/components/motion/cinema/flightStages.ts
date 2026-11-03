import * as THREE from 'three';
import { clamp, range, smooth } from './types';
import type { CinemaRig, CinemaStage, StageInput } from './types';
import { createGolfCourseEnvironment } from './golfCourseEnvironment';

/** Studio swing → ball launch → outdoor tracking shot → UI arrival. */
export function createFlightStage(rig: CinemaRig): CinemaStage & { ready: Promise<void> } {
  const root = new THREE.Group(); root.visible = false; rig.scene.add(root);
  const studio = new THREE.Group(); root.add(studio);
  const course = createGolfCourseEnvironment(rig);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x0b110e, roughness: 1, metalness: 0,
    transparent: true, depthWrite: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 90, 1, 1), floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -.34, -15); floor.receiveShadow = true; studio.add(floor);
  // The curved studio wall provides a stable horizon and real parallax for the tracking shot.
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 18, 64, 1, true, Math.PI * .25, Math.PI * 1.5),
    new THREE.MeshStandardMaterial({ color: 0x0c1711, roughness: .9, side: THREE.BackSide }));
  wall.position.set(0, 8.4, -14); studio.add(wall);
  // The filmed golfer stays in the foreground while this studio backdrop
  // gradually reveals the shared 3D course behind the swing.
  const studioBackdropMaterial = new THREE.MeshBasicMaterial({ color: 0x09100c, transparent: true,
    opacity: 1, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const studioBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), studioBackdropMaterial);
  studioBackdrop.renderOrder = 0; studio.add(studioBackdrop);
  const pool = new THREE.SpotLight(0xc8e5ad, 35, 35, .7, 1, 1.8);
  pool.position.set(-3, 9, 2); pool.target.position.set(0, -.34, -3); studio.add(pool, pool.target);
  const strikeLight = new THREE.PointLight(0xe0eeb6, 0, 5, 2);
  studio.add(strikeLight);
  const trailMaterial = new THREE.MeshBasicMaterial({ color: 0xc5ec83, transparent: true, opacity: .64,
    depthWrite: false, vertexColors: true });
  let trailGeometry = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), 96, .009, 5, false);
  const trail = new THREE.Mesh(trailGeometry, trailMaterial); trail.frustumCulled = false; root.add(trail);
  let input: StageInput, curve: THREE.Curve<THREE.Vector3>, swing = false;
  let studioTexture: THREE.VideoTexture | null = null;
  let studioTextureSource: HTMLVideoElement | null = null;
  let studioFrame: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  let studioLayout: { x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number } | null = null;
  const studioFrameBaseScale = new THREE.Vector3();
  const launchScreen = new THREE.Vector2(), destinationScreen = new THREE.Vector2();
  const position = new THREE.Vector3(), target = new THREE.Vector3();
  const launch = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const color = new THREE.Color();
  function cameraAt(t: number) {
    const follow = smooth(range(t, swing ? .11 : .03, swing ? .86 : .90));
    const mobile = input.mobile;
    rig.camera.fov = mobile ? 46 : swing ? 35 : 39; rig.camera.updateProjectionMatrix();
    if (swing) {
      rig.camera.position.set(-.1 + 1.5 * follow, 1.15 + .6 * follow, 5.2 - 2.45 * follow);
      target.set(.2 + 2.6 * follow, 1.0 - .5 * follow, -1.0 - 3.0 * follow);
    } else {
      rig.camera.position.set(-.45 + 2.25 * follow, 1.30 + .43 * follow, 5.75 - 2.75 * follow);
      target.set(-.08 + 2.05 * follow, .38 + .19 * follow, -3.1 - 2.9 * follow);
    }
    rig.camera.lookAt(target); rig.camera.updateMatrixWorld();
  }
  function detachStudioFrame() {
    studioFrame?.removeFromParent(); studioLayout = null;
  }
  function disposeStudioFrame() {
    studioFrame?.removeFromParent(); studioFrame?.geometry.dispose(); studioFrame?.material.dispose();
    studioTexture?.dispose(); studioFrame = null; studioTexture = null; studioTextureSource = null; studioLayout = null;
  }
  function positionStudioFrame(updateVideo = true) {
    if (!studioLayout) return;
    const bounds = studioLayout, depth = 8;
    const h = 2 * depth * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov / 2));
    const w = h * rig.camera.aspect;
    rig.camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(rig.camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    studioBackdrop.position.copy(rig.camera.position).addScaledVector(forward, depth + .5);
    studioBackdrop.scale.set(w * 1.12, h * 1.12, 1);
    studioBackdrop.quaternion.copy(rig.camera.quaternion);
    if (!studioFrame || !updateVideo) return;
    const cx = 2 * (bounds.x + bounds.width / 2) / bounds.viewportWidth - 1;
    const cy = 1 - 2 * (bounds.y + bounds.height / 2) / bounds.viewportHeight;
    studioFrame.position.copy(rig.camera.position).addScaledVector(forward, depth)
      .addScaledVector(right, cx * w / 2).addScaledVector(up, cy * h / 2);
    studioFrame.scale.set(bounds.width / bounds.viewportWidth * w, bounds.height / bounds.viewportHeight * h, 1);
    studioFrame.quaternion.copy(rig.camera.quaternion);
  }
  function start(next: StageInput) {
    input = next; swing = next.family === 'swing-impact'; root.visible = true;
    studio.visible = swing;
    course.activate();
    floor.visible = !swing; wall.visible = !swing;
    studioBackdrop.visible = swing; studioBackdropMaterial.opacity = 1;
    detachStudioFrame();
    rig.ball.visible = true; rig.ball.scale.setScalar(1); rig.ball.material.opacity = 1;
    rig.ball.material.transparent = swing; rig.ball.renderOrder = swing ? 2 : 0;
    rig.ball.material.color.setHex(swing ? 0xe5e7df : 0xf9f9f1);
    rig.ball.material.roughness = swing ? .38 : .3;
    rig.ball.material.envMapIntensity = swing ? .35 : .55;
    trail.visible = !swing;
    rig.camera.aspect = next.width / next.height;
    cameraAt(0);
    launch.set(next.mobile ? -.45 : -1.4, .48, swing ? .2 : 1.2);
    if (swing && next.studioVideo) {
      const { element, bounds } = next.studioVideo;
      studioLayout = { ...bounds, viewportWidth: next.width, viewportHeight: next.height };
      positionStudioFrame();
      if (!studioFrame || studioTextureSource !== element) {
        disposeStudioFrame();
        studioLayout = { ...bounds, viewportWidth: next.width, viewportHeight: next.height };
        studioTexture = new THREE.VideoTexture(element);
        studioTextureSource = element;
        studioTexture.colorSpace = THREE.SRGBColorSpace;
        studioTexture.minFilter = THREE.LinearFilter;
        studioTexture.generateMipmaps = false;
        const material = new THREE.MeshBasicMaterial({ map: studioTexture, transparent: true,
          opacity: 1, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
        studioFrame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        studioFrame.renderOrder = 1;
      }
      studioFrame.material.opacity = 1;
      positionStudioFrame();
      studioFrameBaseScale.copy(studioFrame.scale);
      studio.add(studioFrame);
      const px = bounds.x + bounds.width * .73, py = bounds.y + bounds.height * .65;
      launchScreen.set(px, py);
      const distance = 5.6;
      launch.copy(rig.camera.position).addScaledVector(forward, distance)
        .addScaledVector(right, (2 * px / next.width - 1) * distance * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov / 2)) * rig.camera.aspect)
        .addScaledVector(up, (1 - 2 * py / next.height) * distance * Math.tan(THREE.MathUtils.degToRad(rig.camera.fov / 2)));
      strikeLight.position.copy(launch);
    }
    cameraAt(1);
    // The flight is directed into the incoming media panel, not an unrelated screen coordinate.
    const endPixel = { x: next.target.x + next.target.width * .75, y: next.target.y + Math.min(60, next.target.height * .2) };
    destinationScreen.set(endPixel.x, endPixel.y);
    const ray = new THREE.Vector3(endPixel.x / next.width * 2 - 1, 1 - endPixel.y / next.height * 2, .5)
      .unproject(rig.camera).sub(rig.camera.position).normalize();
    const end = rig.camera.position.clone().addScaledVector(ray, (-9 - rig.camera.position.z) / ray.z);
    curve = new THREE.CatmullRomCurve3([
      launch.clone(),
      new THREE.Vector3(next.mobile ? -.15 : swing ? .55 : -.42, swing ? .8 : 1.0, swing ? 3.3 : 2.5),
      new THREE.Vector3(swing ? 0 : 1.7, 2.1, -.7), end,
    ], false, 'centripetal');
    if (!swing) {
      trailGeometry.dispose(); trailGeometry = new THREE.TubeGeometry(curve, 128, .004, 5, false); trail.geometry = trailGeometry;
      trailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(trailGeometry.attributes.position.count * 3), 3));
    }
  }
  function frame(t: number) {
    const travel = smooth(range(t, swing ? .07 : .07, swing ? .89 : .82));
    cameraAt(swing ? t : travel);
    // Keep the filmed studio in world space as the camera follows the ball.
    // Only the dark backdrop follows the lens, so the golfer naturally falls behind.
    if (swing) {
      positionStudioFrame(false);
      const cameraFollow = smooth(range(t, .11, .86));
      if (studioFrame) studioFrame.scale.copy(studioFrameBaseScale)
        .multiplyScalar(rig.camera.position.distanceTo(studioFrame.position) / 8 * (1 - .6 * cameraFollow));
    }
    if (swing) {
      const x = THREE.MathUtils.lerp(launchScreen.x, destinationScreen.x, travel);
      const y = THREE.MathUtils.lerp(launchScreen.y, destinationScreen.y, travel) - 145 * Math.sin(Math.PI * travel);
      const ray = new THREE.Vector3(x / input.width * 2 - 1, 1 - y / input.height * 2, .5)
        .unproject(rig.camera).sub(rig.camera.position).normalize();
      position.copy(rig.camera.position).addScaledVector(ray, 5.6 + 22 * travel);
    } else position.copy(curve.getPoint(travel));
    rig.ball.position.copy(position);
    rig.ball.rotation.set(travel * 6.8, travel * 2.7, travel * 1.4);
    const reveal = smooth(range(t, swing ? .82 : .71, 1));
    rig.ball.scale.setScalar((swing ? .22 + .55 * travel : 1)
      * (1 - smooth(range(t, .84, 1)) * .88));
    if (swing) {
      if (studioFrame) studioFrame.material.opacity = 1 - smooth(range(travel, .22, .48));
      studioBackdropMaterial.opacity = 1 - smooth(range(travel, .38, .68));
      strikeLight.intensity = 5 * (1 - smooth(range(t, .08, .23)));
    }
    if (!swing) {
      const endSegment = Math.floor(travel * 128);
      const startSegment = Math.max(0, endSegment - 32);
      trailGeometry.setDrawRange(startSegment * 30, Math.max(0, endSegment - startSegment) * 30);
      const colors = trailGeometry.attributes.color;
      for (let segment = 0; segment <= 128; segment++) {
        const intensity = smooth(clamp((segment - startSegment) / Math.max(1, endSegment - startSegment)));
        color.setRGB(.44 + intensity * .37, .57 + intensity * .31, .29 + intensity * .36);
        for (let side = 0; side < 6; side++) colors.setXYZ(segment * 6 + side, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
      trailMaterial.opacity = .15 * (1 - smooth(range(t, .82, 1)));
    }
    return { reveal, diagnostics: { ballX: position.x, ballY: position.y, ballZ: position.z,
      cameraX: rig.camera.position.x, cameraY: rig.camera.position.y, cameraZ: rig.camera.position.z, travel } };
  }
  return { root, ready: course.ready, start, frame, stop() {
    root.visible = false; course.deactivate(); strikeLight.intensity = 0; detachStudioFrame();
    rig.ball.renderOrder = 0; rig.ball.material.transparent = false;
  }, dispose() {
    course.dispose();
    disposeStudioFrame();
    root.removeFromParent(); floor.geometry.dispose(); floorMaterial.dispose(); wall.geometry.dispose();
    studioBackdrop.geometry.dispose(); studioBackdropMaterial.dispose();
    (wall.material as THREE.Material).dispose(); trailGeometry.dispose(); trailMaterial.dispose();
  } };
}
