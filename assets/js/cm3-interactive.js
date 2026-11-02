(() => {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const fmt = (x, n = 2) => Number.isFinite(x) ? x.toFixed(n) : '—';
  const softmax2 = (a, b) => {
    const m = Math.max(a, b);
    const ea = Math.exp(a - m), eb = Math.exp(b - m);
    const z = ea + eb;
    return [ea / z, eb / z];
  };

  function canvasCtx(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  function line(ctx, x1, y1, x2, y2, color, width = 4, dash = []) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function circle(ctx, x, y, r, fill, stroke = '#fff', width = 3) {
    ctx.save();
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function label(ctx, text, x, y, opts = {}) {
    ctx.save();
    ctx.fillStyle = opts.color || '#1f2937';
    ctx.font = opts.font || '700 18px system-ui, sans-serif';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function pointOnCircle(cx, cy, R, a) {
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  }

  function mountSoftmax(root) {
    root.innerHTML = `
      <div class="cm3-widget-grid">
        <div class="cm3-widget-controls">
          <label>Angle de l'embedding <input data-k="theta" type="range" min="0" max="180" value="72" step="1"><span data-v="theta"></span></label>
          <label>Norme de l'embedding <input data-k="norm" type="range" min="0.5" max="3" value="1.8" step="0.05"><span data-v="norm"></span></label>
          <label>Scale s <input data-k="scale" type="range" min="1" max="20" value="5" step="0.5"><span data-v="scale"></span></label>
          <label class="cm3-check"><input data-k="normalized" type="checkbox"> Normaliser poids + embedding, supprimer les biais</label>
          <div class="cm3-metrics" aria-live="polite">
            <div><b>logit g₁</b><span data-o="a1"></span></div>
            <div><b>logit g₂</b><span data-o="a2"></span></div>
            <div><b>P(classe 1)</b><span data-o="p1"></span></div>
            <div><b>décision</b><span data-o="dec"></span></div>
          </div>
        </div>
        <canvas class="cm3-widget-canvas" width="620" height="420" aria-label="Géométrie softmax"></canvas>
      </div>`;
    const q = sel => root.querySelector(sel);
    const inp = k => q(`[data-k="${k}"]`);
    const canvas = q('canvas');

    function update() {
      const theta = rad(+inp('theta').value), r = +inp('norm').value, s = +inp('scale').value;
      const normalized = inp('normalized').checked;
      const a1ang = rad(25), a2ang = rad(135);
      const w1n = normalized ? 1 : 1.35, w2n = normalized ? 1 : 0.92, xn = normalized ? 1 : r;
      const b1 = normalized ? 0 : 0.18, b2 = normalized ? 0 : -0.08;
      const c1 = Math.cos(theta - a1ang), c2 = Math.cos(theta - a2ang);
      const g1 = normalized ? s * c1 : w1n * xn * c1 + b1;
      const g2 = normalized ? s * c2 : w2n * xn * c2 + b2;
      const [p1, p2] = softmax2(g1, g2);
      q('[data-v="theta"]').textContent = `${Math.round(deg(theta))}°`;
      q('[data-v="norm"]').textContent = fmt(r, 2);
      q('[data-v="scale"]').textContent = fmt(s, 1);
      q('[data-o="a1"]').textContent = fmt(g1, 3);
      q('[data-o="a2"]').textContent = fmt(g2, 3);
      q('[data-o="p1"]').textContent = fmt(p1, 3);
      q('[data-o="dec"]').textContent = p1 >= p2 ? 'classe 1' : 'classe 2';

      const ctx = canvasCtx(canvas), cx = 310, cy = 240, R = 150;
      ctx.strokeStyle = '#cfd4dc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
      const pW1 = pointOnCircle(cx, cy, R * Math.min(w1n, 1.45) / 1.45, a1ang);
      const pW2 = pointOnCircle(cx, cy, R * Math.min(w2n, 1.45) / 1.45, a2ang);
      const pX = pointOnCircle(cx, cy, R * Math.min(xn, 1.45) / 1.45, theta);
      line(ctx, cx, cy, pW1[0], pW1[1], '#0f766e', 5);
      line(ctx, cx, cy, pW2[0], pW2[1], '#2563eb', 5);
      line(ctx, cx, cy, pX[0], pX[1], '#c8102e', 5);
      circle(ctx, pX[0], pX[1], 9, '#c8102e');
      label(ctx, 'w₁', pW1[0] + 8, pW1[1] - 8);
      label(ctx, 'w₂', pW2[0] - 8, pW2[1] - 8, {align:'right'});
      label(ctx, 'x', pX[0] + 10, pX[1] + 18);
      label(ctx, normalized ? 'logits = s cos(θ)' : 'normes + biais influencent les logits', 24, 34, {color:'#667085', font:'600 16px system-ui, sans-serif'});
    }
    root.querySelectorAll('input').forEach(el => el.addEventListener('input', update));
    update();
  }

  function mountScale(root) {
    root.innerHTML = `
      <div class="cm3-scale-layout">
        <div class="cm3-widget-controls">
          <label>Nombre de locuteurs K <input data-k="K" type="range" min="2" max="5000" value="1000" step="1"><span data-v="K"></span></label>
          <label>Scale s <input data-k="s" type="range" min="0.5" max="12" value="1" step="0.1"><span data-v="s"></span></label>
        </div>
        <div class="cm3-big-result"><span>P<sub>max</sub></span><b data-o="p"></b><small>cas idéal : target = +1, tous les concurrents = −1</small></div>
      </div>`;
    const K = root.querySelector('[data-k="K"]'), s = root.querySelector('[data-k="s"]');
    function update() {
      const kv = +K.value, sv = +s.value;
      const p = 1 / (1 + (kv - 1) * Math.exp(-2 * sv));
      root.querySelector('[data-v="K"]').textContent = String(kv);
      root.querySelector('[data-v="s"]').textContent = fmt(sv, 1);
      root.querySelector('[data-o="p"]').textContent = (100 * p).toFixed(2) + ' %';
    }
    [K, s].forEach(el => el.addEventListener('input', update)); update();
  }

  function mountAAM(root) {
    root.innerHTML = `
      <div class="cm3-widget-grid">
        <div class="cm3-widget-controls">
          <label>Angle de x <input data-k="theta" type="range" min="25" max="115" value="60" step="1"><span data-v="theta"></span></label>
          <label>Marge m <input data-k="m" type="range" min="0" max="0.6" value="0.2" step="0.01"><span data-v="m"></span></label>
          <label>Scale s <input data-k="s" type="range" min="1" max="64" value="30" step="1"><span data-v="s"></span></label>
          <div class="cm3-metrics" aria-live="polite">
            <div><b>θ₁</b><span data-o="t1"></span></div>
            <div><b>θ₂</b><span data-o="t2"></span></div>
            <div><b>θ₁+m</b><span data-o="tm"></span></div>
            <div><b>décision AAM</b><span data-o="dec"></span></div>
          </div>
          <div class="cm3-equation-line" data-o="eq"></div>
        </div>
        <canvas class="cm3-widget-canvas" width="620" height="420" aria-label="Marge AAM"></canvas>
      </div>`;
    const q = sel => root.querySelector(sel), inp = k => q(`[data-k="${k}"]`), canvas = q('canvas');
    function update() {
      const a1 = rad(25), a2 = rad(115), xang = rad(+inp('theta').value), m = +inp('m').value, s = +inp('s').value;
      const t1 = Math.abs(xang - a1), t2 = Math.abs(a2 - xang);
      const target = s * Math.cos(t1 + m), comp = s * Math.cos(t2), ok = target > comp;
      q('[data-v="theta"]').textContent = `${inp('theta').value}°`;
      q('[data-v="m"]').textContent = `${fmt(m,2)} rad (${fmt(deg(m),1)}°)`;
      q('[data-v="s"]').textContent = String(Math.round(s));
      q('[data-o="t1"]').textContent = `${fmt(deg(t1),1)}°`;
      q('[data-o="t2"]').textContent = `${fmt(deg(t2),1)}°`;
      q('[data-o="tm"]').textContent = `${fmt(deg(t1 + m),1)}°`;
      q('[data-o="dec"]').textContent = ok ? 'classe 1 correcte' : 'classe 1 rejetée';
      q('[data-o="dec"]').className = ok ? 'cm3-ok' : 'cm3-bad';
      q('[data-o="eq"]').textContent = `${fmt(target,2)} ${ok ? '>' : '≤'} ${fmt(comp,2)}   [s cos(θ₁+m) vs s cos θ₂]`;

      const ctx = canvasCtx(canvas), cx = 310, cy = 240, R = 150, delta = a2 - a1;
      ctx.strokeStyle = '#cfd4dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2*Math.PI); ctx.stroke();
      const p1 = pointOnCircle(cx, cy, R, a1), p2 = pointOnCircle(cx, cy, R, a2), px = pointOnCircle(cx, cy, R, xang);
      const boundary = a1 + Math.max(0, delta - m) / 2, pb = pointOnCircle(cx, cy, R * 1.08, boundary);
      line(ctx, cx, cy, p1[0], p1[1], '#0f766e', 5);
      line(ctx, cx, cy, p2[0], p2[1], '#2563eb', 5);
      line(ctx, cx, cy, px[0], px[1], '#c8102e', 5);
      line(ctx, cx, cy, pb[0], pb[1], '#7c3aed', 3, [8,7]);
      circle(ctx, px[0], px[1], 9, '#c8102e');
      label(ctx, 'w₁ (target)', p1[0]+8, p1[1]-8);
      label(ctx, 'w₂', p2[0]-8, p2[1]-8, {align:'right'});
      label(ctx, 'x', px[0]+10, px[1]+18);
      label(ctx, `frontière AAM : θ₁ = (Δ−m)/2`, 20, 34, {color:'#667085', font:'600 16px system-ui, sans-serif'});
      label(ctx, `Δ = ${fmt(deg(delta),1)}°, marge = ${fmt(deg(m),1)}°`, 20, 60, {color:'#667085', font:'600 16px system-ui, sans-serif'});
    }
    root.querySelectorAll('input').forEach(el => el.addEventListener('input', update)); update();
  }

  function mountAug(root) {
    root.innerHTML = `
      <div class="cm3-aug-controls">
        <label>Nuisance <select data-k="nuisance"><option value="noise">bruit</option><option value="reverb">réverbération</option><option value="babble">babble</option><option value="specaug">SpecAugment</option></select></label>
        <label>Stratégie <select data-k="mode"><option value="baseline">baseline</option><option value="extractor">extractor augmentation</option><option value="plda">PLDA augmentation</option></select></label>
      </div>
      <div class="cm3-widget-grid cm3-aug-grid">
        <div class="cm3-aug-text" data-o="text"></div>
        <canvas class="cm3-widget-canvas" width="620" height="420" aria-label="Augmentation et espace d'embeddings"></canvas>
      </div>`;
    const canvas = root.querySelector('canvas'), nuisance = root.querySelector('[data-k="nuisance"]'), mode = root.querySelector('[data-k="mode"]');
    const dirs = {noise:[105,-70], reverb:[65,100], babble:[145,40], specaug:[85,-110]};
    function update() {
      const n = nuisance.value, m = mode.value, d = dirs[n], clean = [190,235], speakerB = [465,200];
      const factor = m === 'extractor' ? 0.32 : 1.0;
      const aug = [clean[0] + factor*d[0], clean[1] + factor*d[1]];
      const pretty = {noise:'bruit',reverb:'réverbération',babble:'babble',specaug:'SpecAugment'}[n];
      root.querySelector('[data-o="text"]').innerHTML = m === 'baseline'
        ? `<h4>Baseline</h4><p>La nuisance (${pretty}) déplace l'embedding. Rien n'a explicitement appris que ce déplacement devait être ignoré.</p>`
        : m === 'extractor'
        ? `<h4>Extractor augmentation</h4><p>Le réseau voit clean + ${pretty} avec le même label.</p><p>Il apprend à <b>réduire le déplacement</b> associé à cette nuisance.</p>`
        : `<h4>PLDA augmentation</h4><p>L'extracteur reste fixe : le point augmenté peut rester éloigné.</p><p>PLDA voit les deux comme <b>même speaker</b> et apprend une variabilité intra-speaker plus large.</p>`;

      const ctx = canvasCtx(canvas);
      ctx.fillStyle='#fff'; ctx.fillRect(40,40,540,320); ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=2; ctx.strokeRect(40,40,540,320);
      if (m === 'plda') {
        ctx.save(); ctx.translate(clean[0]+d[0]*0.34, clean[1]+d[1]*0.34); ctx.rotate(Math.atan2(d[1],d[0]));
        ctx.fillStyle='rgba(200,16,46,0.10)'; ctx.strokeStyle='rgba(200,16,46,0.62)'; ctx.lineWidth=4; ctx.setLineDash([8,6]);
        ctx.beginPath(); ctx.ellipse(0,0,105,45,0,0,2*Math.PI); ctx.fill(); ctx.stroke(); ctx.restore();
        label(ctx,'PLDA : variabilité intra-speaker plus tolérante',80,385,{color:'#667085',font:'600 16px system-ui, sans-serif'});
      }
      circle(ctx, clean[0], clean[1], 22, '#0f766e');
      circle(ctx, aug[0], aug[1], 16, '#14b8a6');
      line(ctx, clean[0], clean[1], aug[0], aug[1], '#475467', 3, [7,6]);
      circle(ctx, speakerB[0], speakerB[1], 22, '#2563eb');
      label(ctx,'speaker A clean',clean[0]-34,clean[1]+48);
      label(ctx,`A + ${pretty}`,aug[0]+10,aug[1]-10);
      label(ctx,'speaker B',speakerB[0]-32,speakerB[1]+48);
    }
    [nuisance, mode].forEach(el => el.addEventListener('change', update)); update();
  }

  const mounters = {softmax:mountSoftmax, scale:mountScale, aam:mountAAM, augmentation:mountAug};
  function init() {
    document.querySelectorAll('[data-cm3-widget]').forEach(root => {
      if (root.dataset.cm3Ready === '1') return;
      const name = root.dataset.cm3Widget;
      const fn = mounters[name];
      if (!fn) return;
      try {
        fn(root);
        root.dataset.cm3Ready = '1';
      } catch (err) {
        console.error('CM3 widget error', name, err);
        root.innerHTML = `<div class="cm3-widget-error">Erreur JavaScript dans le widget ${name}. Ouvrir la console du navigateur pour le détail.</div>`;
      }
    });
  }

  init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  if (window.Reveal && typeof window.Reveal.on === 'function') {
    window.Reveal.on('ready', init);
    window.Reveal.on('slidechanged', init);
  }
})();
