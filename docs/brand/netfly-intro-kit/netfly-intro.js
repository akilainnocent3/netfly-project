/*! NETFLY intro ident engine — one source for web player, React and MP4 render.
 *  NetflyIntro.frame(t)  -> SVG string (1920x1080) for time t in seconds
 *  NetflyIntro.DURATION  -> total length (s)
 *  NetflyIntro.playSound(audioCtx, when) -> schedules the sound design
 */
(function (root) {
const GLYPHS=[[150.0, "M82.26744186046513 100.0 40.26162790697675 51.45348837209302V100.0H10.755813953488373V0.0H38.80813953488372L80.81395348837209 49.27325581395348V0.0H110.31976744186048V100.0Z"], [265.26162790697674, "M126.01744186046513 0.0H212.5V23.982558139534873H158.13953488372096V37.7906976744186H204.6511627906977V60.75581395348837H158.13953488372096V76.01744186046511H213.5174418604651V100.0H126.01744186046513Z"], [364.38953488372096, "M282.70348837209303 25.581395348837205V100.0H250.58139534883725V25.581395348837205H217.73255813953492V0.0H315.40697674418607V25.581395348837205Z"], [463.5174418604651, "M324.2732558139535 0.0H405.08720930232556V23.982558139534873H356.3953488372093V41.133720930232556H398.25581395348837V64.09883720930233H356.3953488372093V100.0H324.2732558139535Z"], [554.6511627906978, "M415.40697674418607 0.0H447.5290697674419V74.41860465116278H498.8372093023256V100.0H415.40697674418607Z"], [645.7848837209303, "M568.6046511627908 100.0H536.482558139535V61.19186046511628L496.8023255813954 0.0H533.7209302325582L552.9069767441861 33.284883720930225H553.4883720930233L572.6744186046512 0.0H607.703488372093L568.6046511627908 61.19186046511628Z"]];
const DURATION = 3.6, RED = [229, 9, 20], HOT = [255, 92, 92];
const S = 1.45, DCX = 65, DCY = 50, SIDE = 86, SW = 22, RX = 14;
const PERIM = 4 * SIDE - 8 * RX + 2 * Math.PI * RX;
const clamp = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeIn = (p) => p * p * p;
const rgb = (c) => `rgb(${c.map(Math.round).join(',')})`;
const f = (n) => +n.toFixed(3);

function frame(t) {
  // 1. diamond draws itself (0.15 - 1.0)
  const draw = easeInOut(seg(t, 0.15, 1.0));
  const intro = 1.18 - 0.18 * easeOut(seg(t, 0.15, 1.0));
  // 2. impact at 1.0: flash + glow pulse
  const flash = t >= 1.0 ? Math.exp(-(t - 1.0) * 7) : 0;
  const color = RED.map((c, i) => lerp(c, HOT[i], flash));
  // 3. camera: diamond-centred -> whole logo centred -> back to diamond
  const toLogo = easeInOut(seg(t, 1.0, 1.55));
  const back = easeInOut(seg(t, 2.35, 2.75));
  const cx = lerp(lerp(DCX, 381, toLogo), DCX, back);
  // 4. fly through the diamond (2.65 - 3.3)
  const fly = easeIn(seg(t, 2.65, 3.3));
  const k = intro * Math.exp(Math.log(70) * fly);
  // glow
  let glow = 0.35 * draw + 0.75 * flash;
  glow = glow * (1 - seg(t, 2.9, 3.3));
  const fadeOut = 1 - seg(t, 3.3, 3.6);
  const fadeIn = seg(t, 0, 0.15);

  let letters = '';
  const lettersOut = 1 - seg(t, 2.3, 2.55);
  GLYPHS.forEach(([x, d], i) => {
    const q = easeOutExpo(seg(t, 1.02 + (5 - i) * 0.035, 1.02 + (5 - i) * 0.035 + 0.6));
    const op = lettersOut;
    if (op <= 0 || q <= 0) return;
    const dx = -(1 - q) * 640;
    letters += `<path transform="translate(${f(150 + dx)} 0)" d="${d}" fill-opacity="${f(op)}"/>`;
  });
  // light sweep across the wordmark (1.75 - 2.3)
  const sp = seg(t, 1.75, 2.3);
  const sx = lerp(80, 860, easeInOut(sp));
  let sweep = '';
  if (sp > 0 && sp < 1) {
    sweep = `<linearGradient id="nf-sw" gradientUnits="userSpaceOnUse" x1="${f(sx - 70)}" y1="0" x2="${f(sx + 70)}" y2="0">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  }
  const sweepLayer = sweep
    ? `<g fill="url(#nf-sw)" opacity="${f(lettersOut)}">${GLYPHS.map(([x, d]) => `<path transform="translate(150 0)" d="${d}"/>`).join('')}</g>`
    : '';
  // dim the letters slightly so the sweep reads
  const letterFill = sweep ? '#e9e9ea' : '#ffffff';

  const dash = `stroke-dasharray="${f(PERIM)}" stroke-dashoffset="${f(PERIM * (1 - draw))}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="nf-glow"><stop offset="0" stop-color="${rgb(color)}" stop-opacity=".9"/><stop offset=".45" stop-color="${rgb(color)}" stop-opacity=".22"/><stop offset="1" stop-color="${rgb(color)}" stop-opacity="0"/></radialGradient>
${sweep}
</defs>
<rect width="1920" height="1080" fill="#000"/>
<g opacity="${f(fadeIn * fadeOut)}">
<g transform="translate(960 540) scale(${S}) translate(${f(-cx)} ${-DCY})">
<circle cx="${DCX}" cy="${DCY}" r="${f(190 * (0.8 + 0.4 * flash) * Math.max(1, k * 0.6))}" fill="url(#nf-glow)" opacity="${f(glow)}"/>
<clipPath id="nf-clip"><rect x="118" y="-40" width="900" height="180"/></clipPath>
<g clip-path="url(#nf-clip)"><g fill="${letterFill}">${letters}</g>
${sweepLayer}</g>
<g transform="translate(${DCX} ${DCY}) scale(${f(k)}) rotate(45)">
<rect x="${-SIDE / 2}" y="${-SIDE / 2}" width="${SIDE}" height="${SIDE}" rx="${RX}" fill="none" stroke="${rgb(color)}" stroke-width="${SW}" ${dash} stroke-linecap="round"/>
</g>
</g>
</g>
</svg>`;
}

// Sound design: swell -> deep impact + tone -> whoosh on fly-through
function playSound(ctx, when) {
  const T = when ?? ctx.currentTime + 0.05;
  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = (start, dur, f0, f1, peak, q = 1.2) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, start); bp.frequency.exponentialRampToValueAtTime(f1, start + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp).connect(g).connect(out); src.start(start); src.stop(start + dur + 0.05);
  };
  const tone = (start, f0, f1, dur, peak, type = 'sine', attack = 0.008) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, start); o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out); o.start(start); o.stop(start + dur + 0.05);
  };
  noise(T + 0.15, 0.85, 300, 2400, 0.10);              // rising swell while the diamond draws
  tone(T + 0.15, 70, 140, 0.88, 0.10, 'sine', 0.8);
  tone(T + 1.0, 62, 34, 1.6, 0.95);                       // the impact ("dum")
  noise(T + 1.0, 0.18, 4000, 900, 0.35, 0.7);             // transient click
  tone(T + 1.0, 110, 108, 2.0, 0.16, 'triangle', 0.02);   // warm tone
  tone(T + 1.0, 164.8, 163, 2.0, 0.09, 'triangle', 0.03);
  tone(T + 1.0, 220, 219, 1.6, 0.05, 'sine', 0.04);
  noise(T + 2.6, 0.75, 400, 5200, 0.22, 0.9);             // whoosh into the film
}

const api = { frame, playSound, DURATION };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NetflyIntro = api;
})(typeof window !== 'undefined' ? window : globalThis);
