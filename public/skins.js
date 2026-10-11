// Player appearances, shared by the browser (drawing) and the server (which colours are valid).
// Every appearance is the same round token plus a few hand-drawn parts, and is identified by its own colour.
// Layers: back = behind the body, mid = on the body under the eyes (clipped to it), eyes = replaces the default
// eyes, front = on top. The token looks to the right: eyes sit around (59,43) and (85,45) in a 100x100 box.
(function (root) {
  'use strict';
  const INK = '#1d1a26';

  // ---- reusable parts ----
  const circles = (c, pts) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
  const earsRound = (c, inner, r = 15) => circles(c, [[20, 16, r], [80, 16, r]]) + (inner ? circles(inner, [[20, 16, r * 0.55], [80, 16, r * 0.55]]) : '');
  const earsPointy = (c, inner) => `<path d="M14 32L8-6 42 12z" fill="${c}"/><path d="M86 32L94-6 58 12z" fill="${c}"/>`
    + (inner ? `<path d="M17 20l-3-16 15 8z" fill="${inner}"/><path d="M84 20l4-16-16 8z" fill="${inner}"/>` : '');
  const earsLong = (c, inner) => `<ellipse cx="30" cy="-10" rx="11" ry="28" fill="${c}" transform="rotate(-10 30 -10)"/><ellipse cx="68" cy="-10" rx="11" ry="28" fill="${c}" transform="rotate(10 68 -10)"/>`
    + `<ellipse cx="30" cy="-10" rx="5" ry="19" fill="${inner}" transform="rotate(-10 30 -10)"/><ellipse cx="68" cy="-10" rx="5" ry="19" fill="${inner}" transform="rotate(10 68 -10)"/>`;
  const earsSide = (c, inner) => circles(c, [[4, 44, 13]]) + circles(inner, [[4, 44, 7]]);
  const horns = (c) => `<path d="M24 18C8 8 8-10 20-18c-1 12 6 20 16 26z" fill="${c}"/><path d="M76 18c16-10 16-28 4-36 1 12-6 20-16 26z" fill="${c}"/>`;
  const antlers = (c) => `<path d="M30 14V-16M30-2l-13-10M30-8l11-9M70 14v-30M70-2l13-10M70-8L59-17" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  const antennae = (c, tip) => `<path d="M38 12L30-10M62 10l8-20" stroke="${c}" stroke-width="4" stroke-linecap="round"/>` + circles(tip, [[30, -12, 5], [70, -12, 5]]);
  const nose = (c = INK, x = 75, y = 60) => `<path d="M${x - 6} ${y}h12l-6 7z" fill="${c}"/>`;
  const smile = (c = INK, w = 3) => `<path d="M64 70q11 9 22 0" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const whiskers = (c) => `<path d="M83 64l17-4M83 68l17 3M67 64l-18-3M67 68l-18 4" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
  const fangs = '<path d="M66 67l4 10 4-10zM78 67l4 10 4-10z" fill="#fff"/>';
  const belly = (c) => `<ellipse cx="68" cy="68" rx="30" ry="26" fill="${c}"/>`;
  const blush = circles('rgba(255,105,140,.45)', [[46, 62, 6], [95, 62, 5]]);
  const brows = (c = INK) => `<path d="M44 26l22 7M98 30l-17 5" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
  const snout = (c, dark) => `<ellipse cx="76" cy="65" rx="15" ry="11" fill="${c}"/>` + circles(dark, [[71, 65, 3], [81, 65, 3]]);
  const muzzle = (c) => `<ellipse cx="75" cy="67" rx="15" ry="11" fill="${c}"/>`;
  const stripes = (c) => `<path d="M26 6l10 22M46 2l4 22M8 30l20 10M4 52l20 4M10 76l18-8M30 92l8-16" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`;
  const beak = (c, y = 56) => `<path d="M82 ${y}l20 7-20 7z" fill="${c}"/>`;
  const tuft = (c) => `<path d="M40 10c-6-12 0-20 8-22 0 8 2 12 6 14 0-8 6-12 12-12-2 8 0 14 2 20z" fill="${c}"/>`;
  const moustache = (c) => `<path d="M58 68q8-9 16 0 8-9 16 0-8 7-16 2-8 5-16-2z" fill="${c}"/>`;
  const beard = (c) => `<path d="M42 72q28 34 54 0-27 12-54 0z" fill="${c}"/>`;
  const star = (c, x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-9l2.6 6.2 6.8.6-5.200 4.400 1.600 6.600L0 5.200l-5.800 3.600 1.600-6.600-5.200-4.400 6.800-.6z" fill="${c}"/>`;
  const ring = (n, r0, r1, half, fill) => Array.from({ length: n }, (_, k) => {
    const a = (k * 2 * Math.PI) / n, p = (r, d) => `${(50 + r * Math.cos(a + d)).toFixed(1)} ${(50 + r * Math.sin(a + d)).toFixed(1)}`;
    return `<path d="M${p(r0, -half)}L${p(r1, 0)}L${p(r0, half)}z" fill="${fill}"/>`;
  }).join('');
  const MANE = Array.from({ length: 12 }, (_, k) => `<circle cx="${(50 + 48 * Math.cos((k * Math.PI) / 6)).toFixed(1)}" cy="${(50 + 48 * Math.sin((k * Math.PI) / 6)).toFixed(1)}" r="15" fill="#a8581a"/>`).join('');
  const wings = (c) => `<path d="M10 52C-24 34-20 6 4 20q6 16 6 32zM90 52c34-18 30-46 6-32q-6 16-6 32z" fill="${c}"/>`;
  const batWings = (c) => `<path d="M12 48L-26 18l8 24-18 2 16 12-10 18 34-10zM88 48l38-30-8 24 18 2-16 12 10 18-34-10z" fill="${c}"/>`;

  // hats (drawn on top)
  const topHat = `<g transform="rotate(-8 48 8)"><rect x="24" y="-22" width="48" height="32" rx="4" fill="${INK}"/><rect x="24" y="0" width="48" height="8" fill="#e8c14a"/><rect x="10" y="6" width="76" height="9" rx="4.500" fill="${INK}"/></g>`;
  const crown = '<path d="M20 14l6-28 14 18 10-24 10 24 14-18 6 28z" fill="#ffd23f" stroke="#c9972a" stroke-width="2" stroke-linejoin="round"/>' + circles('#e53935', [[50, 4, 4]]) + circles('#4dd0e1', [[32, 6, 3], [68, 6, 3]]);
  const wizardHat = '<path d="M16 14L54-46 84 14z" fill="#3b2a7a"/><ellipse cx="50" cy="14" rx="46" ry="9" fill="#4a3696"/>' + star('#ffd23f', 54, -10, 0.9);
  const cowboyHat = '<path d="M2 16c16-6 26-8 30-26 4-12 32-12 36 0 4 18 14 20 30 26-32 12-64 12-96 0z" fill="#8b5a2b"/><path d="M33-2h34v6H33z" fill="#5a3516"/>';
  const chefHat = '<path d="M26 14V-4a15 15 0 0 1 2-28 17 17 0 0 1 30-6 15 15 0 0 1 16 34v18z" fill="#fff"/><path d="M26 6h48v8H26z" fill="#dfe3ec"/>';
  const partyHat = (c) => `<path d="M30 12L52-36 72 12z" fill="${c}"/><path d="M38-4l22 6M34 6l30 6" stroke="#fff" stroke-width="3" opacity=".7"/>` + circles('#fff', [[52, -38, 6]]);
  const fedora = '<path d="M0 16q50-14 100 0-50 14-100 0z" fill="#5d4433"/><path d="M24 12C20-12 36-20 50-14c14-6 30 2 26 26z" fill="#7d5d45"/><path d="M24 4h52v6H24z" fill="#2c1f16"/>';
  const vikingHelmet = '<path d="M12 30C14 8 32-2 50-2s36 10 38 32z" fill="#8d99a8"/><rect x="10" y="24" width="80" height="8" rx="2" fill="#5c6875"/><rect x="46" y="-2" width="8" height="30" fill="#5c6875"/>';
  const mortarboard = `<path d="M50-24L104-6 50 14-4-6z" fill="${INK}"/><path d="M26 6v12q24 12 48 0V6" fill="#2b2735"/><path d="M96-4v22" stroke="#ffd23f" stroke-width="3"/>` + circles('#ffd23f', [[96, 20, 4]]);
  const jesterHat = '<path d="M12 22C-4-4 12-30 26-32c2 16 14 26 24 32z" fill="#e53935"/><path d="M88 22c16-26 0-52-14-54-2 16-14 26-24 32z" fill="#2f6fe4"/><path d="M12 22q38-12 76 0v8q-38-10-76 0z" fill="#ffd23f"/>' + circles('#ffd23f', [[26, -34, 5], [74, -34, 5]]);
  const halo = '<ellipse cx="50" cy="-8" rx="27" ry="7" fill="none" stroke="#ffd23f" stroke-width="5"/>';
  const leaves = (c) => `<path d="M28 14l10-16 12 12 12-12 10 16-22 8z" fill="${c}"/>`;

  // eye sets that replace the default pair
  const shades = `<path d="M40 34h60v12a12 12 0 0 1-24 0v-3h-8v5a14 14 0 0 1-28 0z" fill="${INK}"/><path d="M46 38l10-1" stroke="#fff" stroke-width="2.500" opacity=".6" stroke-linecap="round"/>`;
  const oneEye = `<ellipse cx="72" cy="44" rx="20" ry="22" fill="#fff"/><circle cx="78" cy="47" r="10" fill="${INK}"/><circle cx="82" cy="43" r="3" fill="#fff"/>`;

  const SKINS = [
    // ---- the original ten ----
    { name: 'Tycoon', color: '#2e8b57', front: topHat + '<path d="M40 80l12 6-12 6zM64 80l-12 6 12 6z" fill="#e8c14a"/><circle cx="52" cy="86" r="3" fill="#b8912a"/>' },
    { name: 'Lion', color: '#f0a92b', back: MANE, front: '<path d="M68 60h14l-7 8z" fill="#5a2d0c"/><path d="M75 68v6M75 74q-6 6-11 1M75 74q6 6 11 1" stroke="#5a2d0c" stroke-width="2.500" fill="none" stroke-linecap="round"/>' },
    { name: 'King', color: '#4b3fb5', front: crown },
    { name: 'Pirate', color: '#8c3b2e', back: '<circle cx="6" cy="40" r="7" fill="#d7332f"/><path d="M2 44l-8 14 12-6z" fill="#d7332f"/>', mid: '<path d="M0 38C10 12 30 5 50 5s40 7 50 33z" fill="#d7332f"/>',
      eyes: `<ellipse cx="85" cy="50" rx="11" ry="13" fill="#fff"/><circle cx="89" cy="53" r="5.500" fill="${INK}"/><ellipse cx="59" cy="50" rx="13" ry="12" fill="${INK}"/><path d="M34 40l62 6" stroke="${INK}" stroke-width="4"/>` },
    { name: 'Robot', color: '#9aa7b5', back: '<path d="M50 6V-10" stroke="#6b7785" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="-14" r="7" fill="#ff5252"/>',
      eyes: '<rect x="47" y="31" width="24" height="24" rx="5" fill="#12202b"/><rect x="75" y="33" width="20" height="22" rx="5" fill="#12202b"/><circle cx="60" cy="43" r="5.500" fill="#4dd0e1"/><circle cx="86" cy="44" r="5" fill="#4dd0e1"/>',
      front: '<path d="M52 72h32M60 67v10M68 67v10M76 67v10" stroke="#5c6875" stroke-width="3" stroke-linecap="round"/>' },
    { name: 'Cat', color: '#e9cfa6', back: earsPointy('#e9cfa6', '#f2a0a0'), front: nose('#e57373') + whiskers('#8a6a45') },
    { name: 'Alien', color: '#39d98a', back: antennae('#39d98a', '#b9ffd9'),
      eyes: '<ellipse cx="57" cy="46" rx="13" ry="19" fill="#12202b" transform="rotate(-18 57 46)"/><ellipse cx="86" cy="48" rx="10" ry="16" fill="#12202b" transform="rotate(14 86 48)"/><circle cx="60" cy="38" r="3.500" fill="#fff"/><circle cx="88" cy="41" r="3" fill="#fff"/>' },
    { name: 'Ninja', color: '#3a3f58', back: '<path d="M8 28l-22-10 4 16z" fill="#e53935"/><path d="M8 32l-20 4 8 10z" fill="#c62828"/>',
      mid: '<rect x="20" y="28" width="90" height="34" rx="16" fill="#f0d9b5"/><path d="M0 24q50-14 100 0" stroke="#e53935" stroke-width="8" fill="none"/>' },
    { name: 'Wizard', color: '#2274a5', front: wizardHat + beard('#f4f4f6') },
    { name: 'Panda', color: '#f4f4f6', back: circles(INK, [[18, 14, 16], [82, 14, 16]]),
      mid: `<ellipse cx="58" cy="46" rx="18" ry="21" fill="${INK}" transform="rotate(-15 58 46)"/><ellipse cx="87" cy="48" rx="13" ry="18" fill="${INK}"/>`,
      eyes: `<ellipse cx="60" cy="45" rx="9" ry="10" fill="#fff"/><ellipse cx="87" cy="47" rx="7" ry="9" fill="#fff"/><circle cx="63" cy="47" r="5" fill="${INK}"/><circle cx="89" cy="49" r="4" fill="${INK}"/>`,
      front: `<ellipse cx="75" cy="68" rx="6" ry="4" fill="${INK}"/>` },

    // ---- animals ----
    { name: 'Fox', color: '#f07b2e', back: earsPointy('#f07b2e', '#3a2618'), mid: belly('#fff4e6'), front: nose() },
    { name: 'Wolf', color: '#7f8a9e', back: earsPointy('#7f8a9e', '#d5dae3'), mid: belly('#dfe3ea'), front: nose() + fangs },
    { name: 'Dog', color: '#c98b4a', back: '<ellipse cx="6" cy="38" rx="13" ry="26" fill="#7a4a22" transform="rotate(14 6 38)"/><ellipse cx="44" cy="2" rx="16" ry="10" fill="#7a4a22"/>',
      mid: '<ellipse cx="56" cy="42" rx="20" ry="22" fill="#a86d32"/>', front: `<ellipse cx="76" cy="62" rx="8" ry="6" fill="${INK}"/><path d="M70 70h12v7a6 6 0 0 1-12 0z" fill="#ff6f91"/>` },
    { name: 'Bunny', color: '#f7dfe6', back: earsLong('#f7dfe6', '#f8b6c8'), front: nose('#ff7fa0') + '<rect x="70" y="68" width="10" height="9" rx="2" fill="#fff" stroke="#d9c3cb" stroke-width="1"/>' + blush },
    { name: 'Bear', color: '#8b5e3c', back: earsRound('#8b5e3c', '#c99b74'), mid: muzzle('#d9b48f'), front: nose(INK, 75, 61) },
    { name: 'Koala', color: '#a3adb8', back: earsRound('#a3adb8', '#f1f3f6', 19), front: `<ellipse cx="75" cy="63" rx="8" ry="11" fill="${INK}"/>` },
    { name: 'Mouse', color: '#c3c8d4', back: earsRound('#c3c8d4', '#f6b6c6', 20), front: nose('#ff7fa0') + whiskers('#6b7280') },
    { name: 'Pig', color: '#f6a5b8', back: earsPointy('#f6a5b8', '#e77f98'), front: snout('#e77f98', '#b24d68') },
    { name: 'Cow', color: '#efe6d8', back: horns('#d8c9ae'), mid: circles('#3a2f2a', [[24, 26, 16], [18, 70, 14], [52, 90, 12]]), front: snout('#f4b3c0', '#b56b7c') },
    { name: 'Tiger', color: '#f59a23', back: earsRound('#f59a23', '#3a2618', 13), mid: stripes('#3a2618') + muzzle('#fff4e6'), front: nose('#e57373', 75, 61) + whiskers('#3a2618') },
    { name: 'Zebra', color: '#dcdde3', back: `<path d="M22 8Q36-14 62 0L54 14z" fill="${INK}"/>` + earsPointy('#dcdde3', '#b6b8c2'), mid: stripes(INK), front: `<ellipse cx="78" cy="68" rx="13" ry="9" fill="#3a3a44"/>` },
    { name: 'Giraffe', color: '#f2c14e', back: '<path d="M34 12V-12M66 10v-22" stroke="#f2c14e" stroke-width="7" stroke-linecap="round"/>' + circles('#8b5a2b', [[34, -14, 6], [66, -14, 6]]),
      mid: circles('#b9772f', [[22, 24, 10], [14, 54, 9], [30, 78, 11], [44, 14, 7], [56, 88, 8]]), front: smile('#7a4a22') },
    { name: 'Monkey', color: '#9a6641', back: circles('#9a6641', [[4, 46, 14]]) + circles('#e8c39e', [[4, 46, 8]]), mid: '<ellipse cx="72" cy="56" rx="30" ry="30" fill="#e8c39e"/>', front: smile('#5a3516') },
    { name: 'Frog', color: '#58c44d', back: circles('#58c44d', [[52, 14, 17], [85, 19, 15]]),
      eyes: `<circle cx="52" cy="14" r="12" fill="#fff"/><circle cx="85" cy="19" r="10.500" fill="#fff"/><circle cx="56" cy="16" r="6" fill="${INK}"/><circle cx="88" cy="21" r="5.500" fill="${INK}"/>`,
      front: '<path d="M46 60q26 18 50 0" stroke="#1f6b1a" stroke-width="3.500" fill="none" stroke-linecap="round"/>' + blush },
    { name: 'Penguin', color: '#2f3545', mid: '<ellipse cx="70" cy="62" rx="32" ry="36" fill="#f7f9fc"/>', front: beak('#f5a623', 58) },
    { name: 'Owl', color: '#8a6a4b', back: earsPointy('#8a6a4b'), mid: circles('#e8d2b0', [[59, 44, 20], [86, 46, 17]]), front: '<path d="M68 58l6 11 6-11z" fill="#f5a623"/>' },
    { name: 'Chick', color: '#ffe14d', back: tuft('#ffc400'), front: beak('#f5861f') + blush },
    { name: 'Bee', color: '#ffd033', back: '<ellipse cx="26" cy="2" rx="16" ry="22" fill="rgba(200,235,255,.85)" transform="rotate(-24 26 2)"/><ellipse cx="50" cy="-4" rx="14" ry="20" fill="rgba(200,235,255,.7)"/>' + antennae(INK, INK),
      mid: `<path d="M0 62q50-12 100 0v12q-50-12-100 0zM10 84q40-10 80 0v12q-40-8-80 0z" fill="${INK}"/><path d="M0 20q24-10 40-8v12q-20 0-40 8z" fill="${INK}"/>`, front: smile() },
    { name: 'Ladybug', color: '#e53935', back: antennae(INK, INK), mid: circles(INK, [[20, 28, 9], [14, 58, 8], [32, 80, 9], [40, 10, 6], [54, 92, 6]]), front: smile('#5a0e0e') },
    { name: 'Shark', color: '#5b8fb0', back: '<path d="M30 14L46-28 68 10z" fill="#5b8fb0"/>', mid: belly('#eef5fa'), front: '<path d="M58 68l5 8 5-8 5 8 5-8 5 8 5-8 5 8" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>' },
    { name: 'Dino', color: '#4fae62', back: '<path d="M10 44L-6 34 8 26-4 12 14 14 12-4 28 8 34-8 44 8z" fill="#2f7d42"/>', mid: belly('#cdeeb0'), front: fangs + circles('#2f7d42', [[94, 56, 2]]) },
    { name: 'Unicorn', color: '#dcc3ff', back: circles('#ff8fc7', [[14, 18, 14], [6, 42, 12]]) + circles('#7fd6ff', [[26, 4, 12], [4, 64, 10]]),
      front: '<path d="M46 12L58-36 68 12z" fill="#ffd23f"/><path d="M50 0l14 3M53-14l9 2" stroke="#e0a800" stroke-width="2.500"/>' + blush },
    { name: 'Dragon', color: '#a23bd6', back: batWings('#7a22a8') + horns('#ffd23f'), mid: belly('#ffe08a'), front: fangs + circles('#5c1785', [[92, 58, 2], [86, 60, 2]]) },
    { name: 'Bat', color: '#57456e', back: batWings('#3c2f4f') + earsPointy('#57456e', '#8d77a8'), front: fangs },
    { name: 'Deer', color: '#b9814f', back: antlers('#7a5230') + earsSide('#b9814f', '#e9c9a6'), mid: circles('#f3e3cf', [[20, 30, 5], [30, 20, 4], [16, 50, 4], [28, 66, 5]]), front: nose(INK, 76, 61) },

    // ---- characters ----
    { name: 'Astronaut', color: '#dfe7f1', back: circles('#f6f9fc', [[50, 50, 53]]) + '<path d="M12 14L4-6" stroke="#9aa7b5" stroke-width="4" stroke-linecap="round"/>' + circles('#ff5252', [[3, -8, 5]]),
      mid: '<path d="M32 24h70v32a18 18 0 0 1-18 18H50a18 18 0 0 1-18-18z" fill="#1c2b4a"/>', front: '<path d="M40 31l12-2" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>' },
    { name: 'Cowboy', color: '#d98d3a', front: cowboyHat + moustache('#5a3516') },
    { name: 'Chef', color: '#ff9e7a', front: chefHat + moustache('#3a2618') },
    { name: 'Knight', color: '#8fa0b3', back: '<path d="M46 8C34-22 58-36 80-26 62-22 58-6 60 8z" fill="#e53935"/>', mid: `<rect x="34" y="30" width="80" height="28" rx="6" fill="${INK}"/><path d="M0 64h100M50 64v40" stroke="#6b7c8f" stroke-width="3"/>` },
    { name: 'Viking', color: '#c2703d', back: horns('#f4f0e6'), front: vikingHelmet + beard('#e0a030') },
    { name: 'Detective', color: '#a58f6f', front: fedora + '<circle cx="86" cy="46" r="15" fill="rgba(200,235,255,.25)" stroke="#c9972a" stroke-width="4"/><path d="M96 58l9 12" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/>' },
    { name: 'Clown', color: '#fff0c9', back: circles('#ff5a3c', [[8, 30, 16], [22, 8, 15], [88, 12, 14]]),
      front: partyHat('#2f6fe4') + circles('#e53935', [[76, 62, 8]]) + '<path d="M58 74q16 14 32 0" stroke="#e53935" stroke-width="5" fill="none" stroke-linecap="round"/>' },
    { name: 'Vampire', color: '#b9a7d6', back: '<path d="M-2 98L12 40 50 72 88 40l14 58z" fill="#7a1020"/>', mid: `<path d="M0 40C8 12 30 5 50 5s42 7 50 35C84 26 70 26 60 36 46 24 22 26 0 40z" fill="${INK}"/>`, front: fangs + smile('#5a1030', 2.5) },
    { name: 'Zombie', color: '#8fbf5a',
      eyes: `<ellipse cx="59" cy="43" rx="14" ry="16" fill="#f5f5c8"/><ellipse cx="86" cy="48" rx="9" ry="10" fill="#f5f5c8"/><circle cx="62" cy="46" r="5" fill="${INK}"/><circle cx="87" cy="49" r="3" fill="${INK}"/>`,
      mid: '<path d="M14 24l22 12M18 20l-5 10M26 24l-5 10M34 28l-5 10" stroke="#3f6b22" stroke-width="3" stroke-linecap="round"/>', front: '<path d="M60 70l5 5 5-5 5 5 5-5 5 5" fill="none" stroke="#2f4f1a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' },
    { name: 'Ghost', color: '#eef1f7', front: `<ellipse cx="75" cy="70" rx="6" ry="8" fill="${INK}"/>` + blush },
    { name: 'Devil', color: '#d3302f', back: horns('#7a1414'), front: brows() + '<path d="M62 70q12 8 24-2" stroke="#3a0a0a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M66 84l8 14 8-14z" fill="#3a0a0a"/>' },
    { name: 'Angel', color: '#fff6d6', back: wings('#ffffff'), front: halo + smile('#b08a2e') + blush },
    { name: 'Hero', color: '#2f6fe4', back: '<path d="M14 36L-14 98h46z" fill="#e53935"/>', mid: `<path d="M30 28h80v30H38q-14-14-8-30z" fill="${INK}"/>`, front: star('#ffd23f', 28, 76, 1.3) + smile('#0f2c66') },
    { name: 'Mummy', color: '#d9cfae', mid: '<rect x="34" y="28" width="80" height="30" rx="6" fill="#3a3024"/><path d="M0 22l100-10M0 66l100-8M0 82l100-6M10 96l80-8" stroke="#b9ad88" stroke-width="3"/>' },
    { name: 'Cyclops', color: '#3fc1c9', back: '<path d="M40 12L52-22 64 12z" fill="#f4f0e6"/>', eyes: oneEye, front: '<path d="M62 74q12 8 24 0" stroke="#0f5a60" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M70 76h7v6h-7z" fill="#fff"/>' },
    { name: 'Punk', color: '#ff5fa2', back: '<path d="M26 14L32-24 42 4 50-30 58 4 68-24 74 14z" fill="#7c4dff"/>', front: brows() + '<circle cx="97" cy="62" r="4" fill="none" stroke="#ffd23f" stroke-width="2.500"/>' + smile('#7a1040') },
    { name: 'Nerd', color: '#7bd389', front: `<circle cx="59" cy="44" r="17" fill="none" stroke="${INK}" stroke-width="4"/><circle cx="87" cy="46" r="14" fill="none" stroke="${INK}" stroke-width="4"/><path d="M42 42L22 36" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` + smile('#1f5a2c') + '<path d="M72 72h8v6h-8z" fill="#fff"/>' },
    { name: 'Cool', color: '#ffb84d', eyes: shades, front: '<path d="M64 70q12 6 22-4" stroke="#7a4a00" stroke-width="3" fill="none" stroke-linecap="round"/>' },
    { name: 'Graduate', color: '#6c8cff', front: mortarboard + smile('#1f2f7a') },
    { name: 'Jester', color: '#9b5de5', front: jesterHat + smile('#3d1a78', 3.5) + blush },

    // ---- things ----
    { name: 'Pumpkin', color: '#ff7a1a', back: '<path d="M44 10c-4-12 2-22 12-24l5 7c-7 2-8 9-5 17z" fill="#3e7d32"/>', mid: '<path d="M28 8q-16 42 0 84M50 4v92M72 8q16 42 0 84" stroke="rgba(120,50,0,.28)" stroke-width="4" fill="none"/>',
      front: '<path d="M58 68l6 7 6-7 6 7 6-7 6 7" fill="none" stroke="#5a2400" stroke-width="3.500" stroke-linejoin="round" stroke-linecap="round"/>' },
    { name: 'Cactus', color: '#3f9d54', mid: '<path d="M18 22l6 4M12 44l7 2M16 66l7-2M30 84l5-5M34 10l3 6M44 92l2-6" stroke="#eaf7df" stroke-width="2.500" stroke-linecap="round"/>',
      front: circles('#ff6fa5', [[58, 2, 6], [70, 2, 6], [64, -6, 6], [64, 8, 6]]) + circles('#ffd23f', [[64, 2, 4]]) + smile('#17481f') },
    { name: 'Strawberry', color: '#ef3b5d', mid: circles('#ffe08a', [[20, 34, 2.5], [14, 54, 2.5], [28, 68, 2.5], [22, 84, 2.5], [40, 88, 2.5], [34, 46, 2.5], [44, 22, 2.5]]), front: leaves('#3e9b3a') + smile('#7a0f25') },
    { name: 'Snowman', color: '#f7fbff', mid: '<path d="M0 80q50 20 100 0v20H0z" fill="#e53935"/>',
      front: `<rect x="30" y="-18" width="36" height="26" rx="3" fill="${INK}"/><rect x="20" y="6" width="56" height="7" rx="3.500" fill="${INK}"/><path d="M72 58l30 6-30 6z" fill="#ff8a3c"/>` + circles(INK, [[62, 74, 2.2], [69, 77, 2.2], [76, 78, 2.2], [83, 77, 2.2]]) },
    { name: 'Sun', color: '#ffd60a', back: ring(12, 44, 66, 0.2, '#ffb300'), front: smile('#a86400') + blush },
  ];

  const api = { SKINS, INK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this);
