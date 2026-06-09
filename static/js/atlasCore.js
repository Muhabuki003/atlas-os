// Atlas Core — backdrop particles + wireframe neural globe

let _globeRaf = 0;
let _globeRunning = false;
let _backdropRaf = 0;
let _backdropRunning = false;

function _initParticles(w, h, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.35 + 0.08,
    });
  }
  return pts;
}

function _spherePoints(nLat, nLon) {
  const pts = [];
  for (let lat = 0; lat <= nLat; lat++) {
    const phi = (lat / nLat) * Math.PI;
    for (let lon = 0; lon < nLon; lon++) {
      const theta = (lon / nLon) * Math.PI * 2;
      pts.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
      });
    }
  }
  return pts;
}

/** Persistent full-screen particle field for the Atlas OS shell. */
export function startAtlasBackdrop() {
  const pCanvas = document.getElementById('atlas-mc-particles');
  if (!pCanvas || _backdropRunning) return;

  const pCtx = pCanvas.getContext('2d');
  _backdropRunning = true;
  let particles = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = window.innerWidth;
    const ph = window.innerHeight;
    pCanvas.width = Math.floor(pw * dpr);
    pCanvas.height = Math.floor(ph * dpr);
    pCanvas.style.width = pw + 'px';
    pCanvas.style.height = ph + 'px';
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = _initParticles(pw, ph, 80);
  }

  function frame() {
    if (!_backdropRunning) return;
    const pw = window.innerWidth;
    const ph = window.innerHeight;
    pCtx.clearRect(0, 0, pw, ph);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = pw;
      if (p.x > pw) p.x = 0;
      if (p.y < 0) p.y = ph;
      if (p.y > ph) p.y = 0;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fillStyle = `rgba(100, 220, 255, ${p.a})`;
      pCtx.fill();
    }
    _backdropRaf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  pCanvas._atlasBackdropResize = resize;
  _backdropRaf = requestAnimationFrame(frame);
}

export function stopAtlasBackdrop() {
  _backdropRunning = false;
  if (_backdropRaf) cancelAnimationFrame(_backdropRaf);
  _backdropRaf = 0;
  const pCanvas = document.getElementById('atlas-mc-particles');
  if (pCanvas && pCanvas._atlasBackdropResize) {
    window.removeEventListener('resize', pCanvas._atlasBackdropResize);
    delete pCanvas._atlasBackdropResize;
  }
}

export function startAtlasCore() {
  const canvas = document.getElementById('atlas-core-canvas');
  if (!canvas) return;

  if (_globeRunning) {
    if (canvas._atlasCoreResize) canvas._atlasCoreResize();
    return;
  }

  const ctx = canvas.getContext('2d');
  _globeRunning = true;

  let w = 0;
  let h = 0;
  let sphere = _spherePoints(10, 18);
  let t0 = performance.now();
  let _retryTimer = 0;

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.floor(rect.width);
    h = Math.floor(rect.height);
    if (w < 8 || h < 8) {
      if (!_retryTimer) {
        _retryTimer = window.setTimeout(() => {
          _retryTimer = 0;
          resize();
        }, 120);
      }
      return;
    }
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function _themeRgb() {
    const raw = getComputedStyle(document.body).getPropertyValue('--atlas-rgb').trim() || '80, 200, 255';
    const parts = raw.split(',').map((n) => parseInt(n.trim(), 10));
    return [parts[0] || 80, parts[1] || 200, parts[2] || 255];
  }

  function drawGlobe(now) {
    if (w < 8 || h < 8) return;
    const isBgGlobe = canvas.parentElement?.classList.contains('atlas-mc-globe-bg');
    const [tr, tg, tb] = _themeRgb();
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * (isBgGlobe ? 0.44 : 0.38);
    const bgMul = isBgGlobe ? 0.95 : 1;
    const rotY = (now - t0) * 0.00035;
    const rotX = 0.35;

    ctx.clearRect(0, 0, w, h);

    const projected = sphere.map((p) => {
      let x = p.x;
      let y = p.y;
      let z = p.z;
      const cy2 = Math.cos(rotY);
      const sy2 = Math.sin(rotY);
      const x1 = x * cy2 + z * sy2;
      const z1 = -x * sy2 + z * cy2;
      const cx1 = Math.cos(rotX);
      const sx1 = Math.sin(rotX);
      const y2 = y * cx1 - z1 * sx1;
      const z2 = y * sx1 + z1 * cx1;
      return { sx: cx + x1 * radius, sy: cy + y2 * radius, z: z2 };
    });

    const lines = [];
    const nLon = 18;
    const nLat = 10;
    for (let lat = 0; lat <= nLat; lat++) {
      for (let lon = 0; lon < nLon; lon++) {
        const i = lat * nLon + lon;
        if (lon < nLon - 1) lines.push([i, lat * nLon + lon + 1]);
        if (lat < nLat) lines.push([i, (lat + 1) * nLon + lon]);
      }
    }

    ctx.lineWidth = 0.6;
    for (const [a, b] of lines) {
      const pa = projected[a];
      const pb = projected[b];
      if (!pa || !pb) continue;
      const depth = (pa.z + pb.z) / 2;
      const alpha = 0.12 + (depth + 1) * 0.22;
      ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, ${alpha * bgMul})`;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    const nodes = projected.filter((_, i) => i % 3 === 0);
    for (const n of nodes) {
      const pulse = 0.6 + Math.sin(now * 0.004 + n.sx * 0.02) * 0.4;
      const alpha = 0.25 + (n.z + 1) * 0.35;
      const r = 2 + pulse * 1.5 * (n.z + 1) * 0.5;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(255, tr + 40)}, ${Math.min(255, tg + 30)}, ${Math.min(255, tb + 15)}, ${alpha * pulse * bgMul})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${alpha * 0.15})`;
      ctx.fill();
    }

    for (let i = 0; i < nodes.length; i += 2) {
      for (let j = i + 1; j < nodes.length; j += 3) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.sx - b.sx;
        const dy = a.sy - b.sy;
        if (dx * dx + dy * dy > 120 * 120) continue;
        if (a.z < -0.2 || b.z < -0.2) continue;
        ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, 0.12)`;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.15);
    glow.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, 0.14)`);
    glow.addColorStop(0.5, `rgba(${Math.floor(tr * 0.5)}, ${Math.floor(tg * 0.6)}, ${Math.floor(tb * 0.78)}, 0.05)`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    if (!_globeRunning) return;
    resize();
    drawGlobe(now);
    _globeRaf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  canvas._atlasCoreResize = resize;
  _globeRaf = requestAnimationFrame(frame);
}

export function stopAtlasCore() {
  _globeRunning = false;
  if (_globeRaf) cancelAnimationFrame(_globeRaf);
  _globeRaf = 0;
  const canvas = document.getElementById('atlas-core-canvas');
  if (canvas && canvas._atlasCoreResize) {
    window.removeEventListener('resize', canvas._atlasCoreResize);
    delete canvas._atlasCoreResize;
  }
}
