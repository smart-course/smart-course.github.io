(function () {
  'use strict';

  // Atmosphere is cosmetic. The existing scene loop supplies its time; this
  // module has no timers, game-state writes, network access or event handlers.
  const TAU = Math.PI * 2;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const fract = value => value - Math.floor(value);
  const variation = (index, channel = 0) => fract(Math.sin(index * 127.1 + channel * 311.7 + 23.6) * 43758.5453);
  const blend = (from, to, amount) => {
    const a = parseInt(from.slice(1), 16), b = parseInt(to.slice(1), 16);
    const rgb = [16, 8, 0].map(shift => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount));
    return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');
  };
  const SKIES = {
    spring: ['#f4e4c6', '#e7eedc', '#bfd3c0'],
    summer: ['#d6e6df', '#e8eed7', '#b6d0be'],
    autumn: ['#edcfa3', '#efdfbd', '#c9cdb4'],
    winter: ['#dce5e8', '#eef0e7', '#c8d7d2']
  };

  function disabled() {
    return { setEnvironment() {}, setEnabled() {}, update() {}, render() {}, resize() {}, resetTime() {}, dispose() {} };
  }

  window.createSpiritWeatherEffects = function createSpiritWeatherEffects(options) {
    options = options || {};
    const container = options.container, T = options.THREE, camera = options.camera;
    const doc = container && (container.ownerDocument || window.document);
    if (!doc || !container) return disabled();
    const reduced = !!options.reducedMotion;
    const distance = options.distance, mist = options.nearMist;
    const canvas = doc.createElement('canvas');
    let ctx;
    try { ctx = canvas.getContext('2d', { alpha: true }); } catch (_) {}
    if (!ctx) return disabled();
    canvas.className = 'spirit-weather-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
    container.appendChild(canvas);

    const skyLayer = doc.createElement('div');
    skyLayer.className = 'spirit-weather-sky';
    skyLayer.setAttribute('aria-hidden', 'true');
    skyLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    const stars = Array.from({ length: 43 }, (_, i) => {
      const x = 35 + variation(i, 1) * 930, y = 20 + variation(i, 2) * 305;
      const radius = i % 7 === 0 ? 1.6 : .65 + variation(i, 3) * .75;
      const cross = i % 11 === 0 ? `<path d="M${x - 3} ${y}h6M${x} ${y - 3}v6" stroke="#fff4cd" stroke-width=".7" opacity=".55"/>` : '';
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fff6db" opacity="${.36 + variation(i, 4) * .48}"/>${cross}`;
    }).join('');
    skyLayer.innerHTML = `<svg class="spirit-weather-stars" viewBox="0 0 1000 400" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:48%;opacity:0" xmlns="http://www.w3.org/2000/svg">${stars}</svg><div class="spirit-weather-celestial" style="position:absolute;right:12%;top:12%;width:48px;height:48px;border-radius:50%;opacity:.82"><svg class="spirit-weather-sun" viewBox="0 0 60 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="17" fill="#fff4cb"/><circle cx="30" cy="30" r="23" fill="none" stroke="#fff2c5" stroke-width=".7" opacity=".4"/></svg><svg class="spirit-weather-moon" viewBox="0 0 60 60" width="100%" height="100%" style="display:none" xmlns="http://www.w3.org/2000/svg"><path d="M40 9a22 22 0 1 0 11 32A23 23 0 0 1 40 9Z" fill="#f7efd0"/><circle cx="17" cy="31" r="2.7" fill="#d8d6bf" opacity=".42"/><circle cx="27" cy="45" r="1.8" fill="#d8d6bf" opacity=".34"/></svg></div>`;
    distance?.appendChild(skyLayer);
    const starfield = skyLayer.querySelector('.spirit-weather-stars');
    const celestial = skyLayer.querySelector('.spirit-weather-celestial');
    const sunIcon = skyLayer.querySelector('.spirit-weather-sun');
    const moonIcon = skyLayer.querySelector('.spirit-weather-moon');
    const skyStops = distance ? Array.from(distance.querySelectorAll('#spirit-sky stop')) : [];
    const jadeStops = distance ? Array.from(distance.querySelectorAll('#spirit-jade-distance stop')) : [];
    const forestStops = distance ? Array.from(distance.querySelectorAll('#spirit-forest-distance stop')) : [];
    const cloudStops = distance ? Array.from(distance.querySelectorAll('#spirit-cloud stop')) : [];
    const distantHaze = distance?.querySelector('[data-distant-haze]');
    const cloudBands = distance?.querySelector('[data-cloud-bands]');
    const birds = distance?.querySelector('[data-sky-birds]');
    // The responsive celestial stays inside the visible sky on narrow phones.
    distance?.querySelector('[data-sky-sun]')?.setAttribute('opacity', '0');
    distance?.querySelector('[data-sky-halo]')?.setAttribute('opacity', '0');
    if (!reduced) {
      for (const stop of [...skyStops, ...jadeStops, ...forestStops, ...cloudStops]) stop.style.transition = 'stop-color 1.4s ease';
      starfield.style.transition = celestial.style.transition = 'opacity 1.4s ease';
    }

    let width = 1, height = 1, pixelRatio = 1, elapsed = 0, lastTime = null;
    let disposed = false, enabled = true, painted = false, dirty = true, signature = '';
    let state = { seasonId: 'spring', phaseId: 'day', daylight: 1, weatherId: 'clear' };
    const seeds = Array.from({ length: 112 }, (_, i) => ({
      x: variation(i, 5), y: variation(i, 6), speed: .65 + variation(i, 7) * .7,
      phase: variation(i, 8) * TAU, size: variation(i, 9), drift: variation(i, 10)
    }));
    const projected = T ? new T.Vector3() : null;
    const rippleWorld = T ? [[-7.25, .25, -1.9], [-7.1, .25, 1.8], [-6.7, .25, 5.7], [-4.1, .25, 7.6], [.3, .25, 7.6], [4.9, .25, 7.4], [7.3, .25, 4.6], [7.4, .25, -1.0], [-8.15, .41, 4.3], [-8.6, .41, 4.5]].map(p => new T.Vector3(...p)) : [];
    const flyWorld = T ? Array.from({ length: 12 }, (_, i) => new T.Vector3(-8.8 + variation(i, 11) * 17.6, .75 + variation(i, 12) * 1.7, -6.8 + variation(i, 13) * 14.1)) : [];
    const flySprite = doc.createElement('canvas'); flySprite.width = flySprite.height = 32;
    const flyContext = flySprite.getContext('2d');
    if (flyContext) {
      const halo = flyContext.createRadialGradient(16, 16, 0, 16, 16, 16);
      halo.addColorStop(0, 'rgba(255,239,164,.9)'); halo.addColorStop(.15, 'rgba(242,219,120,.72)'); halo.addColorStop(.5, 'rgba(210,204,104,.15)'); halo.addColorStop(1, 'rgba(210,204,104,0)');
      flyContext.fillStyle = halo; flyContext.fillRect(0, 0, 32, 32);
    }
    const lampSprite = doc.createElement('canvas'); lampSprite.width = lampSprite.height = 64;
    const lampContext = lampSprite.getContext('2d');
    if (lampContext) {
      const halo = lampContext.createRadialGradient(32, 32, 0, 32, 32, 32);
      halo.addColorStop(0, 'rgba(255,225,160,.75)'); halo.addColorStop(.16, 'rgba(255,206,119,.42)'); halo.addColorStop(.5, 'rgba(242,174,78,.11)'); halo.addColorStop(1, 'rgba(242,174,78,0)');
      lampContext.fillStyle = halo; lampContext.fillRect(0, 0, 64, 64);
    }
    const mobile = () => typeof options.isMobile === 'function' ? !!options.isMobile() : false;

    function clear() {
      if (!painted) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); painted = false;
    }
    function resize() {
      if (disposed) return;
      const view = options.getViewport?.();
      width = Math.max(1, Math.round(view?.width || container.clientWidth || 1));
      height = Math.max(1, Math.round(view?.height || container.clientHeight || 1));
      pixelRatio = Math.min(Number(options.getPixelRatio?.()) || window.devicePixelRatio || 1, mobile() ? 1.25 : 1.5, Math.sqrt(3000000 / (width * height)));
      canvas.width = Math.max(1, Math.round(width * pixelRatio)); canvas.height = Math.max(1, Math.round(height * pixelRatio));
      celestial.style.width = celestial.style.height = mobile() ? '39px' : '48px';
      painted = false; dirty = true;
    }
    function setEnvironment(snapshot) {
      if (disposed || !snapshot) return;
      const season = Object.hasOwn(SKIES, snapshot.seasonId) ? snapshot.seasonId : 'spring';
      const weather = ['clear', 'cloudy', 'rain', 'snow', 'mist'].includes(snapshot.weatherId) ? snapshot.weatherId : 'clear';
      const phase = ['dawn', 'day', 'dusk', 'night'].includes(snapshot.phaseId) ? snapshot.phaseId : 'day';
      const daylight = clamp(Number.isFinite(snapshot.daylight) ? snapshot.daylight : phase === 'night' ? 0 : 1, 0, 1);
      const key = [season, weather, phase, Math.round(daylight * 24)].join(':');
      if (key === signature) return;
      signature = key; state = { seasonId: season, weatherId: weather, phaseId: phase, daylight }; dirty = true;
      const night = 1 - daylight, cloudy = weather === 'rain' ? .65 : weather === 'snow' ? .42 : weather === 'cloudy' ? .46 : weather === 'mist' ? .33 : 0;
      let sky = SKIES[season].slice();
      if (phase === 'dusk') sky = ['#dbab94', '#ebc9ac', '#b9beb0'];
      if (phase === 'dawn') sky = ['#d9b9bd', '#f1d6bb', '#bbcdbb'];
      const skyNight = phase === 'dusk' || phase === 'dawn' ? night * night : night;
      sky = sky.map((color, i) => blend(blend(color, ['#aebfbe', '#c5d2ca', '#a9c0b4'][i], cloudy), ['#25374a', '#405568', '#7b9293'][i], skyNight));
      skyStops.forEach((stop, i) => { stop.style.stopColor = sky[i]; });
      jadeStops.forEach((stop, i) => { stop.style.stopColor = blend(i ? '#b2c9b5' : '#88aa97', i ? '#6d858a' : '#5c7b83', night); });
      forestStops.forEach((stop, i) => { stop.style.stopColor = blend(i ? '#8fac96' : '#547f70', i ? '#677f85' : '#365763', night); });
      cloudStops.forEach((stop, i) => { stop.style.stopColor = blend(i ? '#e9efdc' : '#edf2df', '#647e86', night * .85); });
      if (distantHaze) distantHaze.setAttribute('fill', blend('#b4c7ad', '#6f8892', night));
      if (cloudBands) { cloudBands.setAttribute('stroke', blend('#f3f3e2', '#8a9ea1', night)); cloudBands.style.opacity = String(weather === 'mist' ? 1 : .84); }
      if (birds) birds.style.opacity = night > .65 || weather === 'rain' || weather === 'snow' ? '0' : '.65';
      starfield.style.opacity = String(night * (weather === 'clear' ? .86 : weather === 'snow' ? .27 : .15));
      const isMoon = phase === 'night' || daylight < .25;
      sunIcon.style.display = isMoon ? 'none' : 'block'; moonIcon.style.display = isMoon ? 'block' : 'none';
      celestial.style.opacity = String(weather === 'clear' ? .86 : weather === 'cloudy' ? .4 : weather === 'mist' ? .26 : .25);
      celestial.style.boxShadow = isMoon ? '0 0 37px 8px rgba(247,236,198,.10)' : phase === 'dusk' ? '0 0 50px 18px rgba(238,182,116,.18)' : '0 0 50px 15px rgba(255,240,195,.18)';
      if (mist) {
        const fog = weather === 'mist', rgb = night > .5 ? '117,145,150' : season === 'winter' ? '228,237,231' : '232,239,222';
        mist.style.height = fog ? '34%' : '18%';
        mist.style.background = `linear-gradient(0deg,rgba(${rgb},${fog ? '.50' : '.28'}),rgba(${rgb},${fog ? '.18' : '.05'}) 65%,transparent)`;
      }
    }
    function setEnabled(value) { enabled = !!value; dirty = true; if (!enabled) clear(); }
    function update(time) {
      if (disposed || !Number.isFinite(time)) return;
      if (lastTime !== null && !reduced && enabled) elapsed += clamp(time - lastTime, 0, .22);
      lastTime = time;
    }
    function rain() {
      const count = mobile() ? 48 : 88, t = elapsed;
      const alpha = state.phaseId === 'night' ? .57 : .48;
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        const p = seeds[i], depth = .7 + p.size * .6, x = fract(p.x - t * .032 * depth) * (width + 50) - 25;
        const y = fract(p.y + t * .74 * p.speed) * (height + 50) - 25;
        const length = (10 + p.size * 12) * (mobile() ? .8 : 1);
        ctx.strokeStyle = `rgba(220,241,242,${alpha * (.45 + p.size * .5)})`; ctx.lineWidth = .6 + p.size * .6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - length * .24, y + length); ctx.stroke();
      }
      if (!projected || !camera) return;
      camera.updateMatrixWorld();
      for (let i = 0; i < (mobile() ? 6 : rippleWorld.length); i++) {
        const life = fract(t * .72 + seeds[i].phase), opacity = Math.sin(life * Math.PI) * .28;
        projected.copy(rippleWorld[i]).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const x = (projected.x * .5 + .5) * width, y = (-projected.y * .5 + .5) * height;
        const radius = (2 + life * 5) * (mobile() ? .8 : 1);
        ctx.strokeStyle = `rgba(218,242,234,${opacity})`; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .34, -.12, 0, TAU); ctx.stroke();
      }
    }
    function snow() {
      const count = mobile() ? 38 : 72, t = elapsed;
      for (let i = 0; i < count; i++) {
        const p = seeds[i], depth = .45 + p.size * .65;
        const x = fract(p.x + t * .008 * depth + Math.sin(t * .47 + p.phase) * .018) * (width + 20) - 10;
        const y = fract(p.y + t * .048 * p.speed) * (height + 20) - 10;
        const radius = .75 + p.size * (mobile() ? 1.5 : 1.85);
        ctx.fillStyle = `rgba(250,252,246,${.48 + p.size * .43})`; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
        if (i % 9 === 0) {
          ctx.strokeStyle = 'rgba(244,250,246,.56)'; ctx.lineWidth = .6; ctx.beginPath();
          ctx.moveTo(x - radius * 1.8, y); ctx.lineTo(x + radius * 1.8, y); ctx.moveTo(x, y - radius * 1.8); ctx.lineTo(x, y + radius * 1.8); ctx.stroke();
        }
      }
    }
    function leaves() {
      const count = mobile() ? 5 : 9, t = elapsed;
      for (let i = 0; i < count; i++) {
        const p = seeds[i], progress = fract(p.y + t * .035 * p.speed);
        const x = fract(p.x + t * .012 + Math.sin(t * .48 + p.phase) * .028) * width, y = progress * height;
        const scale = (2.1 + p.size * 1.7) * Math.sin(Math.PI * progress);
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * .7 + p.phase);
        ctx.scale(Math.max(.25, Math.abs(Math.sin(t * .6 + p.phase))), 1);
        ctx.fillStyle = i % 2 ? 'rgba(201,142,65,.73)' : 'rgba(176,100,48,.65)';
        ctx.beginPath(); ctx.ellipse(0, 0, scale, scale * .52, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    function fireflies() {
      if (!projected || !camera || !flyContext) return;
      const t = elapsed; camera.updateMatrixWorld();
      for (let i = 0; i < (mobile() ? 6 : 11); i++) {
        const p = seeds[i], fade = Math.max(0, Math.sin(t * .82 + p.phase));
        projected.copy(flyWorld[i]); projected.x += Math.sin(t * .31 + p.phase) * .34; projected.y += Math.sin(t * .55 + p.phase) * .23; projected.z += Math.cos(t * .38 + p.phase) * .23;
        projected.project(camera); if (projected.z < -1 || projected.z > 1 || fade < .03) continue;
        const x = (projected.x * .5 + .5) * width, y = (-projected.y * .5 + .5) * height, size = 6 + p.size * 5;
        ctx.globalAlpha = fade * .72; ctx.drawImage(flySprite, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
    function lanterns() {
      if (!projected || !camera || !lampContext || !Array.isArray(options.lanterns)) return;
      const night = 1 - state.daylight; if (night < .05) return;
      camera.updateMatrixWorld();
      for (const lamp of options.lanterns) {
        if (!lamp.parent || !lamp.point) continue;
        lamp.parent.updateWorldMatrix(true, false);
        projected.copy(lamp.point).applyMatrix4(lamp.parent.matrixWorld).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const x = (projected.x * .5 + .5) * width, y = (-projected.y * .5 + .5) * height;
        const size = clamp(height * camera.projectionMatrix.elements[5] * .45, 14, 54);
        ctx.globalAlpha = night * .72; ctx.drawImage(lampSprite, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
    function render() {
      if (disposed) return;
      const dynamic = enabled && !reduced;
      const active = state.daylight < .95 || dynamic && (state.weatherId === 'rain' || state.weatherId === 'snow' || state.seasonId === 'autumn' || state.seasonId === 'summer' && state.phaseId === 'night');
      if (!active) { if (dirty || painted) clear(); dirty = false; return; }
      clear(); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); ctx.globalAlpha = 1;
      lanterns();
      if (dynamic) {
        if (state.weatherId === 'rain') rain();
        else if (state.weatherId === 'snow') snow();
        else if (state.seasonId === 'autumn') leaves();
        if (state.seasonId === 'summer' && state.phaseId === 'night' && state.weatherId !== 'rain' && state.weatherId !== 'snow') fireflies();
      }
      painted = true; dirty = false;
    }
    resize(); setEnvironment(state);
    return {
      setEnvironment, setEnabled, update, render, resize,
      resetTime() { lastTime = null; },
      dispose() { if (disposed) return; clear(); disposed = true; canvas.remove(); skyLayer.remove(); canvas.width = canvas.height = flySprite.width = flySprite.height = lampSprite.width = lampSprite.height = 1; }
    };
  };
})();
