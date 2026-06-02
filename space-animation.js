/* ═══════════════════════════════════════════════════════
   ARENAS INMOBILIARIA · Space Animation Engine
   Cartas en órbita — efecto espacio profundo
═══════════════════════════════════════════════════════ */
'use strict';

(function () {

  /* ── Config ── */
  const CFG = {
    stars:         300,
    orbitCards:    6,
    cardW:         78,
    cardH:         100,
    heroDelay:     2800,   // ms antes de que aparezca la tarjeta central
    heroDuration:  4200,   // ms que dura la llegada (lenta para apreciarla)
    contentDelay:  900,    // ms después de que el héroe se asienta
  };

  /* ── Estado ── */
  let canvas, ctx, W, H, cx, cy;
  let stars = [];
  let cards = [];
  let ambientStars = [];   // estrellas fugaces ambientales
  let heroEl, contentEl;
  let raf = null;
  let t0 = 0;
  let onReadyCb = null;
  let heroState = 'waiting';
  let heroT0 = 0;

  /* ════════════════════════════
     INIT
  ════════════════════════════ */
  function init(onReady) {
    onReadyCb = onReady;

    canvas  = document.getElementById('spaceCanvas');
    heroEl  = document.getElementById('heroCard');
    contentEl = document.getElementById('landingContent');
    if (!canvas || !heroEl) return;

    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    buildStars();
    buildOrbitCards();
    resetHero();

    heroState = 'waiting';
    t0 = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    window.removeEventListener('resize', resize);
  }

  function resetHero() {
    if (!heroEl) return;
    heroEl.style.display  = 'none';
    heroEl.style.opacity  = '0';
    heroEl.style.transform = 'translate(-50%,-50%) scale(0.05) rotateY(0deg)';
    heroEl.classList.remove('hero-ready');
    heroState = 'waiting';
  }

  /* ── Resize ── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2;
    cy = H / 2;
  }

  /* ════════════════════════════
     ESTRELLAS FONDO
  ════════════════════════════ */
  function buildStars() {
    stars = [];
    for (let i = 0; i < CFG.stars; i++) {
      stars.push({
        x:      Math.random() * W,
        y:      Math.random() * H,
        r:      Math.pow(Math.random(), 2.5) * 2.2 + 0.15,
        base:   Math.random() * 0.85 + 0.1,
        spd:    Math.random() * 0.022 + 0.004,
        off:    Math.random() * Math.PI * 2,
        warm:   Math.random() > 0.88,  // algunas estrellas cálidas (doradas)
      });
    }
  }

  function drawBg(elapsed) {
    const grd = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy, Math.max(W, H) * 0.9);
    grd.addColorStop(0,   '#0D1F3C');
    grd.addColorStop(0.4, '#060E1C');
    grd.addColorStop(1,   '#020507');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    /* Nebulosa central — aparece progresivamente */
    const nb = Math.min(elapsed / 2500, 1);
    const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
    ng.addColorStop(0,   `rgba(25,75,200,${0.12 * nb})`);
    ng.addColorStop(0.55,`rgba(12,36,110,${0.06 * nb})`);
    ng.addColorStop(1,   'transparent');
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(elapsed, t) {
    const fade = Math.min(elapsed / 900, 1);
    stars.forEach(s => {
      const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.spd * 60 + s.off));
      const a  = fade * s.base * tw;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.warm
        ? `rgba(255,240,190,${a})`
        : `rgba(210,230,255,${a})`;
      ctx.fill();
    });
  }

  /* ════════════════════════════
     ESTRELLAS FUGACES AMBIENTALES
  ════════════════════════════ */
  function maybeSpawnStar(elapsed) {
    if (elapsed < 600 || Math.random() > 0.004) return;
    const x   = Math.random() * W;
    const y   = Math.random() * H * 0.6;
    const ang = Math.PI * 0.22 + (Math.random() - 0.5) * 0.4;
    ambientStars.push({ x, y, ang, len: 70 + Math.random() * 100, life: 1, spd: 0.035 + Math.random() * 0.04 });
  }

  function drawAmbientStars() {
    ambientStars = ambientStars.filter(s => s.life > 0);
    ambientStars.forEach(s => {
      const ex = s.x + Math.cos(s.ang) * s.len;
      const ey = s.y + Math.sin(s.ang) * s.len;
      const gr = ctx.createLinearGradient(s.x, s.y, ex, ey);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.45, `rgba(190,220,255,${s.life * 0.9})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = gr;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      s.x += Math.cos(s.ang) * s.len * s.spd;
      s.y += Math.sin(s.ang) * s.len * s.spd;
      s.life -= s.spd * 1.6;
    });
  }

  /* ════════════════════════════
     CARTAS EN ÓRBITA
  ════════════════════════════ */
  const ORBITS = [
    { a: 255, b: 90,  tilt:  0.20 },
    { a: 310, b: 115, tilt: -0.15 },
    { a: 225, b: 80,  tilt:  0.35 },
    { a: 345, b: 128, tilt: -0.10 },
    { a: 285, b: 100, tilt:  0.28 },
    { a: 210, b: 78,  tilt: -0.32 },
  ];

  /* Posiciones fuera de pantalla (como cometas que entran) */
  function edgeSpawn(i) {
    const margin = 160;
    const pos = [
      { x: -margin,   y: H * 0.15 + Math.random() * H * 0.2 },
      { x: W + margin, y: H * 0.10 + Math.random() * H * 0.25 },
      { x: W * 0.15 + Math.random() * W * 0.2, y: -margin },
      { x: W * 0.65 + Math.random() * W * 0.25, y: -margin },
      { x: -margin,   y: H * 0.55 + Math.random() * H * 0.2 },
      { x: W + margin, y: H * 0.50 + Math.random() * H * 0.3 },
    ];
    return { ...pos[i % pos.length] };
  }

  /* Escala de órbita según tamaño de pantalla */
  function orbitScale() {
    const w = window.innerWidth;
    if (w < 420)  return 0.38;
    if (w < 640)  return 0.52;
    if (w < 900)  return 0.72;
    return 1;
  }

  function buildOrbitCards() {
    const els = document.querySelectorAll('.orbit-card');
    cards = [];
    const total = els.length;
    const sc = orbitScale();

    els.forEach((el, i) => {
      const orb  = ORBITS[i % ORBITS.length];
      const ang0 = (i / total) * Math.PI * 2 + Math.random() * 0.6;
      const spawn = edgeSpawn(i);

      cards.push({
        el,
        x: spawn.x, y: spawn.y,
        spawnX: spawn.x, spawnY: spawn.y,
        orbitA: orb.a * sc, orbitB: orb.b * sc, orbitTilt: orb.tilt,
        angle: ang0,
        /* ← más lento: 0.0006–0.0011 rad/frame (antes 0.0016–0.003) */
        speed: (0.0006 + Math.random() * 0.0005) * (i % 2 === 0 ? 1 : -1),
        delay:   i * 380 + 350,
        /* ← entrada más lenta: 3–4 s (antes 1.7–2.2 s) */
        shotDur: 3000 + Math.random() * 1000,
        trail:      [],
        trailAlpha: 1,
        arrived:    false,
        opacity:    0,
        rotX: (Math.random() - 0.5) * 24,
        rotZ: (Math.random() - 0.5) * 16,
      });
    });
  }

  function drawTrails() {
    cards.forEach(c => {
      if (!c.trail.length || c.trailAlpha <= 0) return;
      for (let i = 1; i < c.trail.length; i++) {
        const p = i / c.trail.length;
        ctx.beginPath();
        ctx.moveTo(c.trail[i-1].x, c.trail[i-1].y);
        ctx.lineTo(c.trail[i].x,   c.trail[i].y);
        ctx.strokeStyle = `rgba(60,160,255,${p * 0.7 * c.trailAlpha})`;
        ctx.lineWidth   = p * 4.5;
        ctx.stroke();
      }
    });
  }

  function updateCards(elapsed) {
    cards.forEach((c, i) => {
      const local = elapsed - c.delay;
      if (local < 0) { c.el.style.opacity = '0'; return; }

      if (!c.arrived) {
        /* Fase cometa: viaja desde el borde hasta su posición orbital */
        const p  = Math.min(local / c.shotDur, 1);
        const ep = easeOutCubic(p);

        /* Posición objetivo en órbita */
        const tx = cx + c.orbitA * Math.cos(c.angle) - CFG.cardW / 2;
        const ty = cy + c.orbitB * Math.sin(c.angle) - CFG.cardH / 2;

        c.x = c.spawnX + (tx - c.spawnX) * ep;
        c.y = c.spawnY + (ty - c.spawnY) * ep;
        c.opacity = Math.min(p * 2.8, 0.85);

        /* Rastro comet */
        c.trail.push({ x: c.x + CFG.cardW / 2, y: c.y + CFG.cardH / 2 });
        if (c.trail.length > 24) c.trail.shift();

        if (p >= 1) c.arrived = true;
      } else {
        /* Fade del rastro */
        c.trailAlpha = Math.max(0, c.trailAlpha - 0.018);
        if (c.trailAlpha <= 0) c.trail = [];

        /* Movimiento orbital elíptico */
        c.angle += c.speed;
        c.x = cx + c.orbitA * Math.cos(c.angle) - CFG.cardW / 2;
        c.y = cy + c.orbitB * Math.sin(c.angle) - CFG.cardH / 2;

        /* Simula profundidad: más opaco al frente, más tenue atrás */
        const sinA = Math.sin(c.angle);
        c.opacity  = sinA > 0 ? 0.38 : 0.78;
        c.el.style.zIndex = sinA > 0 ? '1' : '12';
      }

      c.el.style.left      = c.x + 'px';
      c.el.style.top       = c.y + 'px';
      c.el.style.opacity   = c.opacity;
      c.el.style.transform = `rotateX(${c.rotX}deg) rotateZ(${c.rotZ}deg)`;
    });
  }

  /* ════════════════════════════
     TARJETA HÉROE (logo central)
  ════════════════════════════ */
  function updateHero(elapsed, t) {
    if (elapsed < CFG.heroDelay && heroState === 'waiting') return;

    if (heroState === 'waiting') {
      heroState = 'arriving';
      heroT0 = elapsed;
      heroEl.style.display = 'flex';
    }

    if (heroState === 'arriving') {
      const p  = Math.min((elapsed - heroT0) / CFG.heroDuration, 1);
      /* Dos fases: primera mitad entra girando, segunda mitad desacelera con spring */
      const pSpin   = Math.min(p * 2, 1);          // giro completa en la 1ª mitad
      const pSettle = Math.max((p - 0.5) * 2, 0);  // spring en la 2ª mitad

      const scale = 0.04 + easeOutCubic(p) * 0.96;
      /* Rotación: 720° al inicio → 0° al final, eased independientemente */
      const rotY  = (1 - easeOutCubic(pSpin)) * 720;
      /* Glow crece conforme llega */
      const glowAlpha = easeOutCubic(pSettle);

      heroEl.style.opacity   = '' + Math.min(p * 2.8, 1);
      heroEl.style.transform = `translate(-50%,-50%) scale(${scale}) rotateY(${rotY}deg)`;
      /* Glow dinámico durante la llegada */
      if (glowAlpha > 0) {
        const g = (glowAlpha * 50).toFixed(0);
        const g2 = (glowAlpha * 100).toFixed(0);
        heroEl.style.boxShadow = `0 0 ${g}px rgba(43,109,232,${(glowAlpha * 0.6).toFixed(2)}), 0 0 ${g2}px rgba(43,109,232,${(glowAlpha * 0.25).toFixed(2)}), inset 0 0 40px rgba(43,109,232,0.08)`;
      }

      if (p >= 1) {
        heroState = 'settled';
        heroEl.classList.add('hero-ready');
        heroEl.style.boxShadow = '';  /* el CSS toma el control */
        setTimeout(() => {
          if (contentEl) contentEl.classList.add('l-content-show');
          if (onReadyCb) onReadyCb();
        }, CFG.contentDelay);
      }
    }

    if (heroState === 'settled') {
      /* Respiración suave */
      const breathe = 1 + 0.018 * Math.sin(t * 0.001 * 60);
      heroEl.style.transform = `translate(-50%,-50%) scale(${breathe})`;
    }
  }

  /* ════════════════════════════
     LOOP PRINCIPAL
  ════════════════════════════ */
  function tick(ts) {
    const elapsed = ts - t0;
    drawBg(elapsed);
    drawStars(elapsed, elapsed);
    drawTrails();
    maybeSpawnStar(elapsed);
    drawAmbientStars();
    updateCards(elapsed);
    updateHero(elapsed, elapsed);
    raf = requestAnimationFrame(tick);
  }

  /* ════════════════════════════
     EASING
  ════════════════════════════ */
  function easeOutCubic(t) { return 1 - (1 - t) ** 3; }
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }

  /* ── API pública ── */
  window.SpaceAnim = { init, stop };

})();
