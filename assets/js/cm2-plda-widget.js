(function () {
  'use strict';

  function el(tag, attrs = {}, children = []) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    for (const child of children) node.appendChild(child);
    return node;
  }

  function logGaussian2(x1, x2, cov) {
    const a = cov[0][0];
    const b = cov[0][1];
    const c = cov[1][1];
    const det = a * c - b * b;
    const q = (c * x1 * x1 - 2 * b * x1 * x2 + a * x2 * x2) / det;
    return -Math.log(2 * Math.PI) - 0.5 * Math.log(det) - 0.5 * q;
  }

  function format(x) {
    return Number(x).toFixed(2);
  }

  function setupWidget(root) {
    const inputs = Object.fromEntries(
      Array.from(root.querySelectorAll('input[data-plda]')).map((input) => [input.dataset.plda, input])
    );
    const outs = Object.fromEntries(
      Array.from(root.querySelectorAll('[data-plda-out]')).map((node) => [node.dataset.pldaOut, node])
    );
    const plot = root.querySelector('[data-plda-svg="plot"]');
    if (!plot || !inputs.z1) return;

    const W = 520;
    const H = 520;
    const pad = 58;
    const lim = 3.5;
    const xmap = (x) => pad + ((x + lim) / (2 * lim)) * (W - 2 * pad);
    const ymap = (y) => H - pad - ((y + lim) / (2 * lim)) * (H - 2 * pad);
    const scaleLen = (s) => (s / (2 * lim)) * (W - 2 * pad);

    function update() {
      const z1 = parseFloat(inputs.z1.value);
      const z2 = parseFloat(inputs.z2.value);
      const sb = parseFloat(inputs.sb.value);
      const sw = parseFloat(inputs.sw.value);
      const sb2 = sb * sb;
      const sw2 = sw * sw;
      const v = sb2 + sw2;
      const covTar = [[v, sb2], [sb2, v]];
      const covNon = [[v, 0], [0, v]];
      const logTar = logGaussian2(z1, z2, covTar);
      const logNon = logGaussian2(z1, z2, covNon);
      const score = logTar - logNon;

      outs.z1.textContent = format(z1);
      outs.z2.textContent = format(z2);
      outs.sb.textContent = format(sb);
      outs.sw.textContent = format(sw);
      outs.score.textContent = `${score >= 0 ? '+' : ''}${format(score)}`;
      outs.comment.textContent = score >= 0
        ? 'Le point est plus compatible avec H_tar : même locuteur.'
        : 'Le point est plus compatible avec H_non : locuteurs différents.';
      outs.comment.classList.toggle('negative', score < 0);

      plot.innerHTML = '';

      // Grid and axes
      for (let g = -3; g <= 3; g += 1) {
        plot.appendChild(el('line', {x1: xmap(g), y1: ymap(-lim), x2: xmap(g), y2: ymap(lim), class: 'plda-grid'}));
        plot.appendChild(el('line', {x1: xmap(-lim), y1: ymap(g), x2: xmap(lim), y2: ymap(g), class: 'plda-grid'}));
      }
      plot.appendChild(el('line', {x1: xmap(-lim), y1: ymap(0), x2: xmap(lim), y2: ymap(0), class: 'plda-axis'}));
      plot.appendChild(el('line', {x1: xmap(0), y1: ymap(-lim), x2: xmap(0), y2: ymap(lim), class: 'plda-axis'}));
      plot.appendChild(el('line', {x1: xmap(-lim), y1: ymap(-lim), x2: xmap(lim), y2: ymap(lim), class: 'plda-diag'}));

      // Non-target ellipse: independent variables, circular in this 1D symmetric toy model.
      const rNon = scaleLen(1.8 * Math.sqrt(v));
      plot.appendChild(el('ellipse', {cx: xmap(0), cy: ymap(0), rx: rNon, ry: rNon, class: 'plda-ellipse-non'}));

      // Target covariance ellipse: eigenvectors diagonal / anti-diagonal.
      const lamDiag = 2 * sb2 + sw2;
      const lamAnti = sw2;
      const rx = scaleLen(1.8 * Math.sqrt(lamDiag));
      const ry = scaleLen(1.8 * Math.sqrt(lamAnti));
      plot.appendChild(el('ellipse', {cx: xmap(0), cy: ymap(0), rx: rx, ry: ry, transform: `rotate(-45 ${xmap(0)} ${ymap(0)})`, class: 'plda-ellipse-tar'}));

      // Current point
      plot.appendChild(el('line', {x1: xmap(z1), y1: ymap(-lim), x2: xmap(z1), y2: ymap(z2), class: 'plda-helper'}));
      plot.appendChild(el('line', {x1: xmap(-lim), y1: ymap(z2), x2: xmap(z1), y2: ymap(z2), class: 'plda-helper'}));
      plot.appendChild(el('circle', {cx: xmap(z1), cy: ymap(z2), r: 9, class: score >= 0 ? 'plda-point pos' : 'plda-point neg'}));

      // Labels
      const labels = [
        ['z₁', xmap(lim) - 22, ymap(0) - 12, 'end'],
        ['z₂', xmap(0) + 18, ymap(lim) + 4, 'start'],
        ['H_tar : corrélé', xmap(2.35), ymap(1.85), 'start'],
        ['H_non : indépendant', xmap(1.3), ymap(-2.6), 'start'],
        ['z₁ ≈ z₂', xmap(-2.7), ymap(-2.42), 'start']
      ];
      for (const [txt, x, y, anchor] of labels) {
        const t = el('text', {x, y, 'text-anchor': anchor, class: 'plda-label'});
        t.textContent = txt;
        plot.appendChild(t);
      }
    }

    for (const input of Object.values(inputs)) input.addEventListener('input', update);
    update();
  }

  function init() {
    document.querySelectorAll('[data-widget="plda-score"]').forEach(setupWidget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
