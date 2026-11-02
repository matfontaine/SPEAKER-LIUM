(function(){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const AUDIO_EXTS = ['wav','flac','mp3','ogg'];
  const audioResolveCache = new Map();

  function svgEl(tag, attrs={}, text=null){
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
    if(text !== null) el.textContent = text;
    return el;
  }
  function clear(el){ if(el) while(el.firstChild) el.removeChild(el.firstChild); }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function pct(x){ return (100*x).toFixed(1) + '%'; }
  function normalPdf(x, mu, sigma){
    return Math.exp(-0.5*Math.pow((x-mu)/sigma,2))/(sigma*Math.sqrt(2*Math.PI));
  }
  function erfApprox(x){
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1/(1+0.3275911*ax);
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429;
    const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax);
    return sign*y;
  }
  function normalCdf(x, mu, sigma){
    return 0.5*(1+erfApprox((x-mu)/(sigma*Math.sqrt(2))));
  }
  function pathFrom(points){
    return points.map((p,i)=>`${i===0?'M':'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  }
  function pointerXInSvg(svg, evt){
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
  }
  function attachThresholdDrag(svg, slider, x0, width, min, max){
    if(svg.dataset.thresholdDrag === '1') return;
    svg.dataset.thresholdDrag = '1';
    let dragging = false;
    const update = (evt) => {
      const x = clamp(pointerXInSvg(svg, evt), x0, x0+width);
      const value = min + (x-x0)/width*(max-min);
      slider.value = String(value);
      slider.dispatchEvent(new Event('input'));
    };
    svg.addEventListener('pointerdown', evt => {
      dragging = true;
      svg.setPointerCapture(evt.pointerId);
      update(evt);
    });
    svg.addEventListener('pointermove', evt => { if(dragging) update(evt); });
    svg.addEventListener('pointerup', ()=>{ dragging=false; });
    svg.addEventListener('pointercancel', ()=>{ dragging=false; });
  }

  async function resolveAudio(base){
    if(audioResolveCache.has(base)) return audioResolveCache.get(base);
    for(const ext of AUDIO_EXTS){
      const url = `${base}.${ext}`;
      try{
        const r = await fetch(url, {cache:'no-store'});
        if(r.ok){ audioResolveCache.set(base,url); return url; }
      }catch(_e){}
    }
    audioResolveCache.set(base,null);
    return null;
  }

  async function drawWaveform(source, canvas){
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#e4e7ec'; ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    if(!source){
      ctx.fillStyle='#667085'; ctx.font='17px Arial';
      ctx.fillText('Audio non fourni : déposer un fichier ou ajouter assets/audio/', 16, H/2-12);
      return;
    }
    try{
      const arr = source instanceof File ? await source.arrayBuffer() : await fetch(source).then(r=>{ if(!r.ok) throw new Error('audio'); return r.arrayBuffer(); });
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) throw new Error('AudioContext unavailable');
      const ac = new AC();
      const buf = await ac.decodeAudioData(arr.slice(0));
      const data = buf.getChannelData(0);
      const step = Math.max(1, Math.ceil(data.length/W));
      ctx.strokeStyle='#0369a1'; ctx.lineWidth=1.4; ctx.beginPath();
      for(let x=0;x<W;x++){
        let min=1,max=-1;
        const start=x*step, end=Math.min(data.length,start+step);
        for(let j=start;j<end;j++){ const v=data[j]; if(v<min)min=v; if(v>max)max=v; }
        const y1=(1+min)*H/2, y2=(1+max)*H/2;
        ctx.moveTo(x,y1); ctx.lineTo(x,y2);
      }
      ctx.stroke();
      await ac.close();
    }catch(_e){
      ctx.fillStyle='#667085'; ctx.font='17px Arial';
      ctx.fillText('Waveform indisponible pour ce fichier — la lecture audio peut rester possible.', 16, H/2-12);
    }
  }

  function initIdentification(){
    const root = document.getElementById('identification-demo');
    if(!root || root.dataset.built==='1') return;
    root.dataset.built='1';
    root.innerHTML = `
      <div class="demo-grid">
        <div class="demo-panel">
          <div class="inline-controls">
            <button class="demo-btn active" type="button" data-mode="closed">milieu fermé</button>
            <button class="demo-btn" type="button" data-mode="open">milieu ouvert</button>
            <select data-role="scenario" aria-label="scénario">
              <option value="clear">locuteur connu — cas clair</option>
              <option value="ambiguous">locuteur connu — cas ambigu</option>
              <option value="unknown">locuteur inconnu</option>
            </select>
          </div>
          <p class="metric-line">Seuil de rejet τ<sub>id</sub> : <strong data-role="tau-value">0.55</strong></p>
          <input type="range" min="0" max="1" step="0.01" value="0.55" data-role="tau-slider" aria-label="seuil identification">
          <p>Décision : <span class="decision-badge" data-role="decision"></span></p>
          <p class="click-hint" data-role="explanation"></p>
        </div>
        <div class="demo-panel" data-role="bars"></div>
      </div>`;

    const scenarios = {
      clear: {scores:[0.84,0.33,0.19], truth:'A'},
      ambiguous: {scores:[0.54,0.51,0.27], truth:'A'},
      unknown: {scores:[0.43,0.39,0.35], truth:'unknown'}
    };
    let mode='closed';
    const slider=root.querySelector('[data-role="tau-slider"]');
    const select=root.querySelector('[data-role="scenario"]');
    const bars=root.querySelector('[data-role="bars"]');
    const decision=root.querySelector('[data-role="decision"]');
    const explanation=root.querySelector('[data-role="explanation"]');
    const tauValue=root.querySelector('[data-role="tau-value"]');

    function draw(){
      const sc=scenarios[select.value];
      const tau=Number(slider.value);
      tauValue.textContent=tau.toFixed(2);
      const maxScore=Math.max(...sc.scores), winner=sc.scores.indexOf(maxScore);
      const names=['A','B','C'];
      const out = mode==='closed' ? names[winner] : (maxScore>=tau ? names[winner] : 'unknown');
      decision.textContent = out==='unknown' ? 'UNKNOWN' : `SPEAKER ${out}`;
      decision.className = `decision-badge ${out==='unknown'?'unknown':'accept'}`;
      explanation.textContent = mode==='closed'
        ? `En fermé, argmax force une identité : ${names[winner]}, même si le score maximal vaut seulement ${maxScore.toFixed(2)}.`
        : (out==='unknown'
            ? `Tous les scores sont sous τid=${tau.toFixed(2)} : le système rejette le test.`
            : `Le score maximal ${maxScore.toFixed(2)} dépasse τid=${tau.toFixed(2)} : identité ${out}.`);
      bars.innerHTML='<p class="metric-line"><strong>Scores Sₖ(t)</strong></p>';
      sc.scores.forEach((s,i)=>{
        const row=document.createElement('div'); row.className='score-row';
        row.innerHTML=`<span>Speaker ${names[i]}</span><div class="score-track"><div class="score-fill ${i===winner?'max':''}" style="width:${100*s}%"></div></div><strong>${s.toFixed(2)}</strong>`;
        bars.appendChild(row);
      });
      const truth=document.createElement('p'); truth.className='click-hint';
      truth.textContent=`Vérité terrain du scénario : ${sc.truth==='unknown'?'locuteur non enrôlé':`speaker ${sc.truth}`}.`;
      bars.appendChild(truth);
    }
    root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{
      mode=btn.dataset.mode;
      root.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===btn));
      draw();
    }));
    slider.addEventListener('input',draw); select.addEventListener('change',draw); draw();
  }

  function initAudioVerification(){
    const root = document.getElementById('audio-verification-demo');
    if(!root || root.dataset.built==='1') return;
    root.dataset.built='1';
    root.innerHTML = `
      <div class="demo-grid">
        <div class="demo-panel">
          <div class="inline-controls">
            <button class="demo-btn active" type="button" data-trial="0">même locuteur</button>
            <button class="demo-btn" type="button" data-trial="1">imposteur proche</button>
            <button class="demo-btn" type="button" data-trial="2">imposteur évident</button>
          </div>
          <p class="metric-line">Score fourni par la boîte noire : <strong data-role="score-value"></strong></p>
          <input type="range" min="0" max="1" step="0.01" value="0.78" data-role="score-slider" aria-label="score pédagogique">
          <p class="metric-line">Seuil τ : <strong data-role="tau-value"></strong></p>
          <input type="range" min="0" max="1" step="0.01" value="0.55" data-role="tau-slider" aria-label="seuil vérification">
          <p>Décision : <span class="decision-badge" data-role="decision"></span></p>
          <svg viewBox="0 0 650 150" width="100%" height="150" aria-label="score et seuil"></svg>
          <p class="click-hint"><strong>Important :</strong> le score est illustratif et modifiable ; aucun modèle de speaker recognition ne tourne dans le navigateur.</p>
        </div>
        <div class="demo-panel">
          <p class="metric-line"><strong>Enrollment</strong> <span data-role="enroll-name"></span></p>
          <audio controls data-role="enroll-audio" style="width:100%"></audio>
          <canvas class="waveform" width="720" height="120" data-role="enroll-wave"></canvas>
          <p class="metric-line"><strong>Test</strong> <span data-role="test-name"></span></p>
          <audio controls data-role="test-audio" style="width:100%"></audio>
          <canvas class="waveform" width="720" height="120" data-role="test-wave"></canvas>
          <div class="inline-controls">
            <label class="click-hint">Enrollment local <input type="file" accept="audio/*" data-role="enroll-file"></label>
            <label class="click-hint">Test local <input type="file" accept="audio/*" data-role="test-file"></label>
          </div>
        </div>
      </div>`;

    const trials=[
      {score:0.78,enroll:'Speaker A',test:'Speaker A — autre phrase',enrollBase:'../assets/audio/spk01_enroll',testBase:'../assets/audio/spk01_test_same'},
      {score:0.56,enroll:'Speaker A',test:'Speaker B',enrollBase:'../assets/audio/spk01_enroll',testBase:'../assets/audio/spk02_test_close'},
      {score:0.21,enroll:'Speaker A',test:'Speaker C',enrollBase:'../assets/audio/spk01_enroll',testBase:'../assets/audio/spk03_test_diff'}
    ];
    let current=0;
    const scoreSlider=root.querySelector('[data-role="score-slider"]');
    const tauSlider=root.querySelector('[data-role="tau-slider"]');
    const scoreValue=root.querySelector('[data-role="score-value"]');
    const tauValue=root.querySelector('[data-role="tau-value"]');
    const decision=root.querySelector('[data-role="decision"]');
    const svg=root.querySelector('svg');
    const enrollAudio=root.querySelector('[data-role="enroll-audio"]');
    const testAudio=root.querySelector('[data-role="test-audio"]');
    const enrollWave=root.querySelector('[data-role="enroll-wave"]');
    const testWave=root.querySelector('[data-role="test-wave"]');

    function gauge(score,tau){
      clear(svg); const x0=55,y=72,w=540;
      svg.appendChild(svgEl('line',{x1:x0,y1:y,x2:x0+w,y2:y,stroke:'#e4e7ec','stroke-width':18,'stroke-linecap':'round'}));
      svg.appendChild(svgEl('line',{x1:x0,y1:y,x2:x0+w*score,y2:y,stroke:'#2563eb','stroke-width':18,'stroke-linecap':'round'}));
      const tx=x0+w*tau;
      svg.appendChild(svgEl('line',{x1:tx,y1:y-46,x2:tx,y2:y+46,stroke:'#111827','stroke-width':4,'stroke-dasharray':'8 6'}));
      svg.appendChild(svgEl('circle',{cx:x0+w*score,cy:y,r:17,fill:'#2563eb',stroke:'#fff','stroke-width':4}));
      svg.appendChild(svgEl('text',{x:x0,y:y+55,'font-size':20,fill:'#667085'},'0'));
      svg.appendChild(svgEl('text',{x:x0+w,y:y+55,'font-size':20,fill:'#667085','text-anchor':'end'},'1'));
      svg.appendChild(svgEl('text',{x:tx+7,y:y-49,'font-size':19,fill:'#111827'},'τ'));
    }
    function updateDecision(){
      const score=Number(scoreSlider.value), tau=Number(tauSlider.value), accept=score>=tau;
      scoreValue.textContent=score.toFixed(2); tauValue.textContent=tau.toFixed(2);
      decision.textContent=accept?'TARGET / ACCEPT':'NON-TARGET / REJECT';
      decision.className='decision-badge '+(accept?'accept':'reject');
      gauge(score,tau);
    }
    async function loadPreset(){
      const t=trials[current];
      scoreSlider.value=String(t.score);
      root.querySelector('[data-role="enroll-name"]').textContent=t.enroll;
      root.querySelector('[data-role="test-name"]').textContent=t.test;
      const [eu,tu] = await Promise.all([resolveAudio(t.enrollBase), resolveAudio(t.testBase)]);
      enrollAudio.removeAttribute('src'); testAudio.removeAttribute('src');
      if(eu) enrollAudio.src=eu;
      if(tu) testAudio.src=tu;
      enrollAudio.load(); testAudio.load();
      drawWaveform(eu,enrollWave); drawWaveform(tu,testWave);
      updateDecision();
    }
    root.querySelectorAll('[data-trial]').forEach(btn=>btn.addEventListener('click',()=>{
      current=Number(btn.dataset.trial);
      root.querySelectorAll('[data-trial]').forEach(b=>b.classList.toggle('active',b===btn));
      loadPreset();
    }));
    scoreSlider.addEventListener('input',updateDecision); tauSlider.addEventListener('input',updateDecision);
    root.querySelector('[data-role="enroll-file"]').addEventListener('change',e=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      enrollAudio.src=URL.createObjectURL(f); drawWaveform(f,enrollWave);
      root.querySelector('[data-role="enroll-name"]').textContent='fichier local';
    });
    root.querySelector('[data-role="test-file"]').addEventListener('change',e=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      testAudio.src=URL.createObjectURL(f); drawWaveform(f,testWave);
      root.querySelector('[data-role="test-name"]').textContent='fichier local';
    });
    loadPreset();
  }

  const trialScores = [
    {id:1,y:1,s:0.80},{id:2,y:1,s:0.72},{id:3,y:1,s:0.55},{id:4,y:1,s:0.35},
    {id:5,y:1,s:0.67},{id:6,y:1,s:0.48},{id:7,y:1,s:0.91},{id:8,y:1,s:0.62},
    {id:9,y:0,s:0.76},{id:10,y:0,s:0.60},{id:11,y:0,s:0.42},{id:12,y:0,s:0.20},
    {id:13,y:0,s:0.31},{id:14,y:0,s:0.51},{id:15,y:0,s:0.12},{id:16,y:0,s:0.39}
  ];

  function empiricalRates(tau){
    const tar=trialScores.filter(d=>d.y===1), non=trialScores.filter(d=>d.y===0);
    const miss=tar.filter(d=>d.s<tau).length, fa=non.filter(d=>d.s>=tau).length;
    return {miss,fa,ntar:tar.length,nnon:non.length,pmiss:miss/tar.length,pfa:fa/non.length};
  }

  function initTrialThreshold(){
    const root=document.getElementById('trial-threshold-demo');
    if(!root || root.dataset.built==='1') return;
    root.dataset.built='1';
    root.innerHTML=`
      <div class="metric-line">τ = <strong data-role="tau-value">0.50</strong> — glisser la ligne verticale ou utiliser le curseur</div>
      <input type="range" min="0" max="1" step="0.01" value="0.50" data-role="tau-slider" aria-label="seuil trials">
      <svg viewBox="0 0 1120 430" width="100%" height="430" style="touch-action:none"></svg>
      <div class="error-stat-grid">
        <div class="stat-card">Targets<br><strong data-role="ntar"></strong></div>
        <div class="stat-card">Miss<br><strong data-role="miss"></strong></div>
        <div class="stat-card">Non-targets<br><strong data-role="nnon"></strong></div>
        <div class="stat-card">False alarms<br><strong data-role="fa"></strong></div>
      </div>`;
    const slider=root.querySelector('[data-role="tau-slider"]'), svg=root.querySelector('svg');
    const x0=100,w=900,yTar=120,yNon=270;
    attachThresholdDrag(svg,slider,x0,w,0,1);
    function xScale(s){ return x0+s*w; }
    function draw(){
      clear(svg); const tau=Number(slider.value), r=empiricalRates(tau);
      root.querySelector('[data-role="tau-value"]').textContent=tau.toFixed(2);
      root.querySelector('[data-role="ntar"]').textContent=r.ntar;
      root.querySelector('[data-role="miss"]').textContent=`${r.miss}  (${pct(r.pmiss)})`;
      root.querySelector('[data-role="nnon"]').textContent=r.nnon;
      root.querySelector('[data-role="fa"]').textContent=`${r.fa}  (${pct(r.pfa)})`;
      svg.appendChild(svgEl('text',{x:15,y:yTar+7,'font-size':23,fill:'#0369a1'},'target'));
      svg.appendChild(svgEl('text',{x:15,y:yNon+7,'font-size':23,fill:'#9d174d'},'non-target'));
      svg.appendChild(svgEl('line',{x1:x0,y1:350,x2:x0+w,y2:350,stroke:'#344054','stroke-width':2}));
      for(let k=0;k<=10;k++){
        const x=x0+k*w/10;
        svg.appendChild(svgEl('line',{x1:x,y1:350,x2:x,y2:360,stroke:'#344054'}));
        svg.appendChild(svgEl('text',{x,y:385,'text-anchor':'middle','font-size':17,fill:'#667085'},(k/10).toFixed(1)));
      }
      svg.appendChild(svgEl('text',{x:x0+w/2,y:420,'text-anchor':'middle','font-size':21,fill:'#344054'},'score sᵢ'));
      const tx=xScale(tau);
      svg.appendChild(svgEl('rect',{x:x0,y:55,width:Math.max(0,tx-x0),height:255,fill:'#fef2f2','fill-opacity':0.42}));
      svg.appendChild(svgEl('rect',{x:tx,y:55,width:Math.max(0,x0+w-tx),height:255,fill:'#eff6ff','fill-opacity':0.42}));
      svg.appendChild(svgEl('line',{x1:tx,y1:48,x2:tx,y2:330,stroke:'#111827','stroke-width':4,'stroke-dasharray':'9 7'}));
      svg.appendChild(svgEl('text',{x:tx+8,y:48,'font-size':22,fill:'#111827'},'τ'));
      svg.appendChild(svgEl('text',{x:x0+10,y:82,'font-size':18,fill:'#991b1b'},'décision non-target'));
      svg.appendChild(svgEl('text',{x:x0+w-10,y:82,'text-anchor':'end','font-size':18,fill:'#1d4ed8'},'décision target'));
      const offsets=[-18,18,-8,8,-28,28,-38,38];
      let ti=0,ni=0;
      trialScores.forEach(d=>{
        const yy=d.y===1 ? yTar+offsets[ti++%offsets.length] : yNon+offsets[ni++%offsets.length];
        const error=(d.y===1 && d.s<tau)||(d.y===0 && d.s>=tau);
        svg.appendChild(svgEl('circle',{cx:xScale(d.s),cy:yy,r:error?15:12,fill:d.y===1?'#7dd3fc':'#fda4af',stroke:error?'#111827':'#64748b','stroke-width':error?4:1.5}));
        svg.appendChild(svgEl('text',{x:xScale(d.s),y:yy+5,'text-anchor':'middle','font-size':11,fill:'#111827'},d.id));
      });
      svg.appendChild(svgEl('text',{x:1030,y:120,'font-size':17,fill:'#475467'},'contour épais'));
      svg.appendChild(svgEl('text',{x:1030,y:144,'font-size':17,fill:'#475467'},'= erreur'));
    }
    slider.addEventListener('input',draw); draw();
  }

  function initDistribution(){
    const root=document.getElementById('distribution-threshold-demo');
    if(!root || root.dataset.built==='1') return;
    root.dataset.built='1';
    root.innerHTML=`
      <div class="metric-line">τ = <strong data-role="tau-value">0.52</strong> — P<sub>miss</sub>(τ) ≈ <strong data-role="pmiss"></strong> — P<sub>fa</sub>(τ) ≈ <strong data-role="pfa"></strong></div>
      <input type="range" min="0" max="1" step="0.005" value="0.52" data-role="tau-slider" aria-label="seuil distributions">
      <svg viewBox="0 0 1120 480" width="100%" height="470" style="touch-action:none"></svg>
      <div class="legend-inline"><span><span class="dot" style="background:#0284c7"></span>target</span><span><span class="dot" style="background:#e11d48"></span>non-target</span><span>zones pâles = erreurs</span></div>`;
    const slider=root.querySelector('[data-role="tau-slider"]'), svg=root.querySelector('svg');
    const x0=90,y0=40,w=920,h=350, maxY=3.35;
    const muT=.69,sigT=.13,muN=.34,sigN=.14;
    const xs=x=>x0+x*w, ys=y=>y0+h-y/maxY*h;
    attachThresholdDrag(svg,slider,x0,w,0,1);

    function areaPath(mu,sigma,a,b){
      const points=[[xs(a),ys(0)]];
      const n=120;
      for(let i=0;i<=n;i++){
        const x=a+(b-a)*i/n;
        points.push([xs(x),ys(normalPdf(x,mu,sigma))]);
      }
      points.push([xs(b),ys(0)]);
      return pathFrom(points)+' Z';
    }
    function curve(mu,sigma){
      const p=[];
      for(let i=0;i<=240;i++){ const x=i/240; p.push([xs(x),ys(normalPdf(x,mu,sigma))]); }
      return pathFrom(p);
    }
    function draw(){
      clear(svg); const tau=Number(slider.value);
      const pm=normalCdf(tau,muT,sigT), pf=1-normalCdf(tau,muN,sigN);
      root.querySelector('[data-role="tau-value"]').textContent=tau.toFixed(2);
      root.querySelector('[data-role="pmiss"]').textContent=pct(pm);
      root.querySelector('[data-role="pfa"]').textContent=pct(pf);
      svg.appendChild(svgEl('line',{x1:x0,y1:y0+h,x2:x0+w,y2:y0+h,stroke:'#344054','stroke-width':2}));
      svg.appendChild(svgEl('line',{x1:x0,y1:y0,x2:x0,y2:y0+h,stroke:'#344054','stroke-width':2}));
      for(let k=0;k<=10;k++){
        const x=x0+k*w/10; svg.appendChild(svgEl('line',{x1:x,y1:y0+h,x2:x,y2:y0+h+8,stroke:'#344054'}));
        svg.appendChild(svgEl('text',{x,y:y0+h+32,'text-anchor':'middle','font-size':16,fill:'#667085'},(k/10).toFixed(1)));
      }
      svg.appendChild(svgEl('text',{x:x0+w/2,y:455,'text-anchor':'middle','font-size':21,fill:'#344054'},'score s'));
      if(tau>0) svg.appendChild(svgEl('path',{d:areaPath(muT,sigT,0,tau),fill:'#7dd3fc','fill-opacity':0.30,stroke:'none'}));
      if(tau<1) svg.appendChild(svgEl('path',{d:areaPath(muN,sigN,tau,1),fill:'#fda4af','fill-opacity':0.34,stroke:'none'}));
      svg.appendChild(svgEl('path',{d:curve(muT,sigT),fill:'none',stroke:'#0284c7','stroke-width':5}));
      svg.appendChild(svgEl('path',{d:curve(muN,sigN),fill:'none',stroke:'#e11d48','stroke-width':5}));
      const tx=xs(tau);
      svg.appendChild(svgEl('line',{x1:tx,y1:y0,x2:tx,y2:y0+h,stroke:'#111827','stroke-width':4,'stroke-dasharray':'9 7'}));
      svg.appendChild(svgEl('text',{x:tx+8,y:y0+24,'font-size':22,fill:'#111827'},'τ'));
      svg.appendChild(svgEl('text',{x:xs(.72),y:85,'font-size':22,fill:'#0284c7'},'p(s | Htar)'));
      svg.appendChild(svgEl('text',{x:xs(.13),y:85,'font-size':22,fill:'#e11d48'},'p(s | Hnon)'));
      svg.appendChild(svgEl('text',{x:xs(.16),y:285,'font-size':18,fill:'#0369a1'},'miss = aire target à gauche'));
      svg.appendChild(svgEl('text',{x:xs(.64),y:315,'font-size':18,fill:'#be123c'},'false alarm = aire non-target à droite'));
    }
    slider.addEventListener('input',draw); draw();
  }

  function initOperatingPoint(){
    const root=document.getElementById('operating-point-demo');
    if(!root || root.dataset.built==='1') return;
    root.dataset.built='1';
    root.innerHTML=`
      <div class="demo-grid">
        <div class="demo-panel">
          <p class="metric-line"><strong>Choisissez un objectif opérationnel</strong></p>
          <div class="inline-controls">
            <button class="demo-btn" type="button" data-scenario="strict">limiter les false alarms</button>
            <button class="demo-btn active" type="button" data-scenario="balanced">compromis</button>
            <button class="demo-btn" type="button" data-scenario="recall">limiter les miss</button>
          </div>
          <p class="metric-line">Seuil illustratif : <strong data-role="tau"></strong></p>
          <p data-role="text" class="scenario-card"></p>
        </div>
        <div class="demo-panel">
          <div class="error-stat-grid" style="grid-template-columns:1fr 1fr">
            <div class="stat-card">P<sub>miss</sub><br><strong data-role="pmiss"></strong></div>
            <div class="stat-card">P<sub>fa</sub><br><strong data-role="pfa"></strong></div>
          </div>
          <svg viewBox="0 0 600 220" width="100%" height="220"></svg>
        </div>
      </div>`;
    const settings={
      strict:{tau:.72,text:'Seuil élevé : on rejette davantage de trials. Les false alarms diminuent, mais les miss augmentent.'},
      balanced:{tau:.52,text:'Seuil intermédiaire : compromis illustratif entre les deux types d’erreurs.'},
      recall:{tau:.38,text:'Seuil bas : on accepte davantage de trials. Les miss diminuent, mais les false alarms augmentent.'}
    };
    const svg=root.querySelector('svg');
    function draw(key){
      const cfg=settings[key], r=empiricalRates(cfg.tau);
      root.querySelector('[data-role="tau"]').textContent=cfg.tau.toFixed(2);
      root.querySelector('[data-role="pmiss"]').textContent=pct(r.pmiss);
      root.querySelector('[data-role="pfa"]').textContent=pct(r.pfa);
      root.querySelector('[data-role="text"]').textContent=cfg.text;
      clear(svg);
      const x0=55,w=480,y=105,tx=x0+cfg.tau*w;
      svg.appendChild(svgEl('line',{x1:x0,y1:y,x2:x0+w,y2:y,stroke:'#d0d5dd','stroke-width':18,'stroke-linecap':'round'}));
      svg.appendChild(svgEl('line',{x1:x0,y1:y,x2:tx,y2:y,stroke:'#fecaca','stroke-width':18,'stroke-linecap':'round'}));
      svg.appendChild(svgEl('line',{x1:tx,y1:y,x2:x0+w,y2:y,stroke:'#bfdbfe','stroke-width':18,'stroke-linecap':'round'}));
      svg.appendChild(svgEl('line',{x1:tx,y1:55,x2:tx,y2:155,stroke:'#111827','stroke-width':4,'stroke-dasharray':'8 6'}));
      svg.appendChild(svgEl('text',{x:x0,y:180,'font-size':18,fill:'#991b1b'},'REJECT'));
      svg.appendChild(svgEl('text',{x:x0+w,y:180,'text-anchor':'end','font-size':18,fill:'#1d4ed8'},'ACCEPT'));
      svg.appendChild(svgEl('text',{x:tx+7,y:48,'font-size':19,fill:'#111827'},'τ'));
    }
    root.querySelectorAll('[data-scenario]').forEach(btn=>btn.addEventListener('click',()=>{
      root.querySelectorAll('[data-scenario]').forEach(b=>b.classList.toggle('active',b===btn));
      draw(btn.dataset.scenario);
    }));
    draw('balanced');
  }

  function initAll(){
    initIdentification();
    initAudioVerification();
    initTrialThreshold();
    initDistribution();
    initOperatingPoint();
  }
  function schedule(){ setTimeout(initAll,0); setTimeout(initAll,250); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule); else schedule();
  if(window.Reveal){ Reveal.on('ready',schedule); Reveal.on('slidechanged',schedule); }
})();
