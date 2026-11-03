import assert from 'node:assert/strict';
import test from 'node:test';
import { createStageIllustration, ILLUSTRATION_FRAME_COUNT } from '../src/services/reportIllustration.ts';

test('las cuatro ilustraciones de momentos conservan las posturas aprobadas', () => {
  for (const [key, wrist] of [['address', { x: 0, y: .1 }], ['top', { x: .87, y: -1.94 }],
    ['impact', { x: -.1, y: .1 }], ['finish', { x: -.88, y: -1.9 }]]) {
    const poses = createStageIllustration(key);
    assert.equal(poses.length, 1);
    assert.deepEqual(poses[0].points[15], wrist);
    assert.deepEqual(poses[0].ball, { x: .41, y: 1.35 });
  }
});

test('cada fase conecta sus dos momentos en orden, con pausas en ambos extremos', () => {
  for (const [key, start, end] of [['backswing', 'address', 'top'], ['downswing', 'top', 'impact'],
    ['follow_through', 'impact', 'finish']]) {
    const poses = createStageIllustration(key);
    assert.equal(poses.length, ILLUSTRATION_FRAME_COUNT);
    for (const [frame, moment] of [[poses[0], start], [poses.at(-1), end]]) {
      const expected = createStageIllustration(moment)[0];
      for (let joint = 0; joint < expected.points.length; joint++) {
        if (!expected.points[joint]) { assert.equal(frame.points[joint], null); continue; }
        assert(Math.abs(frame.points[joint].x - expected.points[joint].x) < 1e-12);
        assert(Math.abs(frame.points[joint].y - expected.points[joint].y) < 1e-12);
      }
      assert(Math.hypot(frame.club.end.x - expected.club.end.x, frame.club.end.y - expected.club.end.y) < 1e-12);
    }
    assert.deepEqual(poses[0], poses[1]);
    assert.deepEqual(poses.at(-1), poses.at(-2));
  }
});

test('el palo permanece unido a las manos y no se encoge durante las fases', () => {
  for (const key of ['backswing', 'downswing', 'follow_through']) {
    for (const frame of createStageIllustration(key)) {
      const length = Math.hypot(frame.club.end.x - frame.club.start.x, frame.club.end.y - frame.club.start.y);
      assert(length > 1.1 && length < 1.3, `${key}: longitud ${length}`);
      assert.deepEqual(frame.club.start, frame.points[15]);
      assert(frame.points.filter(Boolean).every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    }
  }
});

test('las fases dibujan arcos a ambos lados del cuerpo en lugar de atajos rectos', () => {
  const back = createStageIllustration('backswing');
  const down = createStageIllustration('downswing');
  const through = createStageIllustration('follow_through');
  assert(Math.max(...back.map(frame => frame.club.end.x)) > 1.5);
  assert(Math.max(...down.map(frame => frame.club.end.x)) > 1.5);
  assert(Math.min(...through.map(frame => frame.club.end.x)) < -1.5);
  assert(back.some(frame => frame.points[15].x > 1));
  assert(through.some(frame => frame.points[15].x < -1));
});

test('la perspectiva frontal se conserva y la vista desde atrás tiene su propia postura y plano de bola', () => {
  for (const key of ['address', 'backswing', 'top', 'downswing', 'impact', 'follow_through', 'finish']) {
    assert.deepEqual(createStageIllustration(key, 'face_on'), createStageIllustration(key));
    assert.notDeepEqual(createStageIllustration(key, 'down_the_line'), createStageIllustration(key, 'face_on'));
  }
  const rear = createStageIllustration('address', 'down_the_line')[0];
  const front = createStageIllustration('address', 'face_on')[0];
  assert(rear.points[0].x > rear.points[23].x, 'el torso se inclina hacia la bola');
  assert(rear.points[31].x > rear.points[27].x && rear.points[32].x > rear.points[28].x, 'los pies se ven en profundidad');
  assert(rear.ball.x > rear.points[15].x && rear.ball.x > front.ball.x, 'la bola aparece por delante del jugador');
  assert(Math.abs(rear.points[12].x - rear.points[11].x) < Math.abs(front.points[12].x - front.points[11].x));
});

test('las fases desde atrás conservan sus extremos, la unión del palo y trayectorias válidas', () => {
  for (const [key, start, end] of [['backswing', 'address', 'top'], ['downswing', 'top', 'impact'],
    ['follow_through', 'impact', 'finish']]) {
    const poses = createStageIllustration(key, 'down_the_line');
    assert.equal(poses.length, ILLUSTRATION_FRAME_COUNT);
    for (const [frame, moment] of [[poses[0], start], [poses.at(-1), end]]) {
      const expected = createStageIllustration(moment, 'down_the_line')[0];
      for (let joint = 0; joint < expected.points.length; joint++) {
        if (!expected.points[joint]) { assert.equal(frame.points[joint], null); continue; }
        assert(Math.hypot(frame.points[joint].x - expected.points[joint].x, frame.points[joint].y - expected.points[joint].y) < 1e-12);
      }
      assert(Math.hypot(frame.club.end.x - expected.club.end.x, frame.club.end.y - expected.club.end.y) < 1e-12);
    }
    for (const frame of poses) {
      assert.deepEqual(frame.club.start, frame.points[15]);
      const length = Math.hypot(frame.club.end.x - frame.club.start.x, frame.club.end.y - frame.club.start.y);
      assert(length > 1.1 && length < 1.3);
      assert(frame.points.filter(Boolean).every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    }
  }
});
