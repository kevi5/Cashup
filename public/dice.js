// 3D dice drawn on a plain 2D canvas with a tiny renderer of our own.
// No CSS 3D transforms are involved, so the rest of the page cannot flicker, and each die is
// painted as one solid body (hull first, faces on top), so there are no gaps at the corners.
(function (root) {
  'use strict';

  // ---- 3x3 rotation helpers (row-major). Axes: x right, y up, z toward the viewer. ----
  const mul = (a, b) => {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  };
  const rotX = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const rotAxis = (ax, t) => {
    const [x, y, z] = ax, c = Math.cos(t), s = Math.sin(t), k = 1 - c;
    return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
  };
  const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  // ---- the die: opposite faces add up to 7. n = outward normal, u/v = axes within the face. ----
  const FACES = [
    { value: 1, n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { value: 6, n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { value: 3, n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { value: 4, n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { value: 2, n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { value: 5, n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  ];
  // Rotation that turns the face showing `value` toward the viewer.
  const FRONT = { 1: rotZ(0), 6: rotY(Math.PI), 3: rotY(-Math.PI / 2), 4: rotY(Math.PI / 2), 2: rotX(Math.PI / 2), 5: rotX(-Math.PI / 2) };
  const A = 0.44;
  const PIPS = {
    1: [[0, 0]],
    2: [[-A, -A], [A, A]],
    3: [[-A, -A], [0, 0], [A, A]],
    4: [[-A, -A], [A, -A], [-A, A], [A, A]],
    5: [[-A, -A], [A, -A], [0, 0], [-A, A], [A, A]],
    6: [[-A, -A], [A, -A], [-A, 0], [A, 0], [-A, A], [A, A]],
  };

  // ---- motion ----
  const outCubic = (t) => 1 - Math.pow(1 - t, 3);
  const outQuad = (t) => 1 - (1 - t) * (1 - t);
  const DURATION = 1000;
  // Height above the table over normalised time: a drop followed by three shrinking bounces.
  function height(t) {
    const H = 76;   // kept low enough that the dice never reach the top row of the board
    if (t < 0.34) return H * (1 - Math.pow(t / 0.34, 2));
    const hop = (a, b, peak) => { const u = (t - a) / (b - a); return 4 * peak * u * (1 - u); };
    if (t < 0.62) return hop(0.34, 0.62, 34);
    if (t < 0.8) return hop(0.62, 0.8, 12);
    if (t < 0.9) return hop(0.8, 0.9, 4);
    return 0;
  }
  // Resting pose: the rolled face toward the viewer, tipped slightly so the die reads as a solid cube.
  function restPose(value, yaw, twist) {
    return mul(mul(mul(rotX(0.3), rotY(yaw)), rotZ(twist)), FRONT[value]);
  }
  // Orientation at time t: two decaying spins that both reach zero at t = 1, so the die always lands on restPose.
  function poseAt(die, t) {
    const a = die.turns1 * (1 - outCubic(t)), b = die.turns2 * (1 - outQuad(t));
    return mul(mul(die.rest, rotAxis(die.axis1, a)), rotAxis(die.axis2, b));
  }

  // ---- drawing ----
  const W = 360, H = 270, FLOOR = 190, SIZE = 34, CAM = 7, EDGE = 0.3, LIGHT = unit([-0.35, 0.62, 0.7]);
  // `ctx` is the visible canvas; `buf` is a scratch canvas each die is painted on first, so its faces can be
  // limited to the die's own rounded outline before it is copied across.
  let canvas = null, ctx = null, buf = null, g = null, dice = [], raf = 0, fallback = 0, started = 0;

  function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  function poly(points) {
    g.beginPath();
    points.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
  }

  function drawDie(die, t) {
    const R = t >= 1 ? die.rest : poseAt(die, t);
    const h = height(t);
    const x = die.x + die.dir * die.slide * (1 - outCubic(Math.min(1, t / 0.82)));
    const y = FLOOR - h;
    const size = SIZE * (1 + h / 900);
    const project = (p) => { const k = CAM / (CAM - p[2]); return [x + p[0] * size * k, y - p[1] * size * k]; };
    const round = size * EDGE * 2;

    // shadow on the table: smaller and fainter while the die is in the air
    const lift = Math.min(1, h / 160);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.42 * (1 - lift * 0.75)})`;
    ctx.beginPath();
    ctx.ellipse(x + h * 0.12, FLOOR + size * 1.18, size * 1.25 * (1 - lift * 0.45), size * 0.3 * (1 - lift * 0.45), 0, 0, Math.PI * 2);
    ctx.fill();

    // solid body: convex outline of the cube, with rounded joins
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    const k = 1 - EDGE, corners = [];
    for (const sx of [-k, k]) for (const sy of [-k, k]) for (const sz of [-k, k]) corners.push(project(apply(R, [sx, sy, sz])));
    g.lineJoin = 'round';
    g.lineWidth = round;
    // The body shows through between the faces as a soft bevel, so it is only a shade darker than them.
    g.fillStyle = g.strokeStyle = '#e9e9ef';
    poly(hull(corners));
    g.fill();
    g.stroke();

    // visible faces, far to near; 'source-atop' keeps them inside the body's rounded outline
    g.globalCompositeOperation = 'source-atop';
    const visible = FACES.map((f) => ({ f, n: apply(R, f.n) })).filter((o) => o.n[2] > 1 / CAM).sort((a, b) => a.n[2] - b.n[2]);
    for (const { f, n } of visible) {
      const lit = 0.86 + 0.14 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const c = Math.round(255 * lit);
      const at = (a, b, d) => project(apply(R, [f.n[0] * d + f.u[0] * a + f.v[0] * b, f.n[1] * d + f.u[1] * a + f.v[1] * b, f.n[2] * d + f.u[2] * a + f.v[2] * b]));
      g.fillStyle = g.strokeStyle = `rgb(${c}, ${c}, ${Math.min(255, c + 4)})`;
      g.lineWidth = round * 0.74;
      poly([at(-k, -k, 1), at(k, -k, 1), at(k, k, 1), at(-k, k, 1)]);
      g.fill();
      g.stroke();
      g.fillStyle = '#1b1822';
      for (const [pu, pv] of PIPS[f.value]) {
        const ring = [];
        for (let s = 0; s < 18; s++) { const ang = (s / 18) * Math.PI * 2; ring.push(at(pu + Math.cos(ang) * 0.165, pv + Math.sin(ang) * 0.165, 1.002)); }
        poly(ring);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(buf, 0, 0, W, H);
  }

  function draw(t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    dice.forEach((die) => drawDie(die, Math.max(0, Math.min(1, t - die.delay))));
  }
  function stop() { cancelAnimationFrame(raf); clearTimeout(fallback); raf = 0; }
  // Every throw is different: the dice fly in from both sides or together from one side, land at varied spots
  // and angles, and spin about random axes. Only the faces they settle on come from the server.
  function makeDice(values) {
    const r = (a, b) => a + Math.random() * (b - a), sign = () => (Math.random() < 0.5 ? -1 : 1);
    const from = Math.random() < 0.4 ? 0 : sign();   // 0: each die from its own side
    const shift = r(-14, 14), gap = r(46, 62);
    return values.map((value, i) => {
      const side = i ? 1 : -1;
      return {
        value, x: W / 2 + shift + side * gap, dir: from || side, slide: r(60, 105), delay: r(0, 0.1),
        rest: restPose(value, side * r(0.12, 0.38), r(-0.35, 0.35)),
        axis1: unit([sign(), r(0.1, 0.9), r(-0.6, 0.6)]),
        axis2: unit([r(-0.4, 0.4), 1, r(-0.5, 0.5)]),
        turns1: Math.PI * 2 * r(2, 3.6),
        turns2: Math.PI * 2 * r(0.5, 1.3) * sign(),
      };
    });
  }

  const api = {
    init(el) {
      canvas = el;
      const scale = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = W * scale; canvas.height = H * scale;
      ctx = canvas.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      buf = document.createElement('canvas');
      buf.width = canvas.width; buf.height = canvas.height;
      g = buf.getContext('2d');
      g.setTransform(scale, 0, 0, scale, 0, 0);
    },
    // Show values at rest, without animation.
    set(values) { stop(); dice = makeDice(values); draw(2); },
    // Throw the dice; they always come to rest on `values`.
    roll(values) {
      stop();
      dice = makeDice(values);
      started = performance.now();
      const frame = () => {
        const t = (performance.now() - started) / DURATION;
        draw(t);
        raf = t < 1.1 ? requestAnimationFrame(frame) : 0;
      };
      raf = requestAnimationFrame(frame);
      // A hidden tab gets no animation frames: make sure the result is still on the canvas afterwards.
      fallback = setTimeout(() => draw(2), DURATION + 150);
    },
    _test: { FACES, FRONT, PIPS, apply, restPose, poseAt, makeDice, height },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dice = api;
})(typeof self !== 'undefined' ? self : this);
