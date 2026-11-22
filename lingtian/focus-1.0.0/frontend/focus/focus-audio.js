/* 静修环境音：本机合成清雨、溪流、风叶与书卷，首次启用由用户操作解锁。 */
(function (global) {
  'use strict';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const TONES = [196, 220, 261.626, 293.665, 329.628];
  const SOUNDSCAPES = Object.freeze(['scene', 'rain', 'stream', 'wind', 'bamboo', 'fire', 'pages', 'brown']);
  const FADE_SECONDS = .36;

  function create() {
    let context = null, master = null, ambience = null, retiring = null;
    let enabled = false, active = false, disposed = false, volume = .3, scene = 'library', soundscape = 'scene';
    let ambienceTimer = null, fadeTimer = null, generation = 0, phrase = 0, starting = null;
    const voices = new Set(), buffers = new Map();
    const documentVisible = () => !global.document || global.document.visibilityState !== 'hidden';
    const canPlay = () => !disposed && enabled && active && documentVisible();
    const currentSound = () => soundscape === 'scene' ? 'scene-' + scene : soundscape;
    function clearTimer() { if (ambienceTimer !== null) global.clearTimeout(ambienceTimer); ambienceTimer = null; }
    function clearFade() { if (fadeTimer !== null) global.clearTimeout(fadeTimer); fadeTimer = null; }
    function disconnect(node) { try { node?.disconnect?.(); } catch (_) {} }
    function releaseVoice(record) {
      voices.delete(record); record.group?.voices.delete(record); record.nodes.forEach(disconnect);
    }
    function stopVoice(record) {
      try { record.source.onended = null; record.source.stop(); } catch (_) {}
      releaseVoice(record);
    }
    function stopVoices() { Array.from(voices).forEach(stopVoice); }
    function disposeGroup(group) {
      if (!group || group.disposed) return;
      group.disposed = true; Array.from(group.voices).forEach(stopVoice); group.nodes.forEach(disconnect);
      if (ambience === group) ambience = null;
      if (retiring === group) retiring = null;
    }
    function suspendContext() {
      try { context?.suspend?.()?.catch?.(() => {}); } catch (_) {}
    }
    function stopAmbient(fade = false) {
      generation++; clearTimer(); clearFade(); disposeGroup(retiring);
      if (fade && ambience && context?.state === 'running' && canPlay()) {
        const group = ambience; ambience = null; retiring = group;
        const now = context.currentTime;
        // 只保留一层短尾音；快速切换会清理更早的声音，不叠出多组循环。
        if (group.bus.gain.cancelAndHoldAtTime) group.bus.gain.cancelAndHoldAtTime(now);
        else {
          const held = group.bus.gain.value;
          group.bus.gain.cancelScheduledValues?.(now);
          group.bus.gain.setValueAtTime(Math.max(.0001, Number.isFinite(held) ? held : .0001), now);
        }
        group.bus.gain.setTargetAtTime(.0001, now, .065);
        for (const record of group.voices) { try { record.source.stop(now + FADE_SECONDS); } catch (_) {} }
        fadeTimer = global.setTimeout(() => { fadeTimer = null; disposeGroup(group); }, Math.ceil(FADE_SECONDS * 1000) + 20);
      } else { disposeGroup(ambience); stopVoices(); }
    }
    function makeContext() {
      if (disposed) return null;
      if (context) return context;
      // 读取存档和自动渲染不能开启声音设备；首次启用必须来自真实用户操作。
      if (global.navigator?.userActivation && !global.navigator.userActivation.isActive) return null;
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (!AudioContext) return null;
      try {
        context = new AudioContext();
        master = context.createGain(); master.gain.value = volume; master.connect(context.destination);
        return context;
      } catch (_) {
        try { context?.close?.(); } catch (_) {}
        context = master = null; buffers.clear(); return null;
      }
    }
    function resumeContext() {
      const ctx = makeContext(); if (!ctx) return Promise.resolve(false);
      if (starting) return starting;
      try {
        starting = Promise.resolve(ctx.state === 'running' ? undefined : ctx.resume()).then(() => {
          // 移动浏览器的解锁可能晚于切后台或销毁；迟到结果不得重新占用声音设备。
          if (!canPlay()) { try { ctx.suspend?.()?.catch?.(() => {}); } catch (_) {} return false; }
          return ctx.state === 'running';
        }).catch(() => false).finally(() => { starting = null; });
        return starting;
      } catch (_) { return Promise.resolve(false); }
    }
    function noiseBuffer(color = 'pink') {
      if (!context) return null;
      if (buffers.has(color)) return buffers.get(color);
      const count = Math.max(32, Math.floor(context.sampleRate * 4));
      const overlap = Math.min(Math.floor(count / 4), Math.max(8, Math.floor(context.sampleRate * .08)));
      const raw = new Float32Array(count + overlap);
      let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < raw.length; i++) {
        const white = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + white * .025) / 1.015; raw[i] = last * 3.4; }
        else if (color === 'pink') {
          b0 = .99886 * b0 + white * .0555179; b1 = .99332 * b1 + white * .0750759;
          b2 = .969 * b2 + white * .153852; b3 = .8665 * b3 + white * .3104856;
          b4 = .55 * b4 + white * .5329522; b5 = -.7616 * b5 - white * .016898;
          raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11; b6 = white * .115926;
        } else raw[i] = white;
      }
      const buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
      let mean = 0;
      for (let i = 0; i < count; i++) {
        // 将尾部的连续延伸接回开头，消除短循环的接缝，避免周期性咔嗒声。
        const mix = Math.min(1, i / Math.max(1, overlap - 1));
        data[i] = i < overlap ? raw[count + i] * (1 - mix) + raw[i] * mix : raw[i]; mean += data[i];
      }
      mean /= count;
      let energy = 0, peak = 0;
      for (let i = 0; i < count; i++) { data[i] -= mean; energy += data[i] * data[i]; peak = Math.max(peak, Math.abs(data[i])); }
      const scale = Math.min(.2 / Math.max(.001, Math.sqrt(energy / count)), .8 / Math.max(.001, peak));
      for (let i = 0; i < count; i++) data[i] *= scale;
      buffers.set(color, buffer); return buffer;
    }
    function recordVoice(source, nodes, group) {
      const record = { source, nodes, group }; voices.add(record); group?.voices.add(record);
      source.onended = () => releaseVoice(record); return record;
    }
    function oscillator(frequency, when, duration, gain, type = 'sine', finishFrequency, group = null, attack = .012) {
      if (!context || !master || !canPlay() || group?.disposed) return;
      const source = context.createOscillator(), envelope = context.createGain();
      source.type = type; source.frequency.setValueAtTime(frequency, when);
      if (finishFrequency) source.frequency.exponentialRampToValueAtTime(finishFrequency, when + duration * .8);
      envelope.gain.setValueAtTime(.0001, when);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), when + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
      source.connect(envelope); envelope.connect(group?.bus || master);
      recordVoice(source, [source, envelope], group); source.start(when); source.stop(when + duration + .025);
    }
    function pluck(frequency, when, gain, group = null) {
      oscillator(frequency, when, 1.7, gain, 'sine', undefined, group);
      oscillator(frequency * 2, when, .8, gain * .19, 'sine', undefined, group);
      oscillator(frequency * 3.006, when, .4, gain * .07, 'sine', undefined, group);
    }
    function texture(when, duration, gain, frequency, group, attack = .09, color = 'pink') {
      if (!context || !master || !canPlay() || group?.disposed) return;
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
      source.buffer = noiseBuffer(color); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .5;
      envelope.gain.setValueAtTime(.0001, when);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), when + Math.min(attack, duration * .4));
      envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
      source.connect(filter); filter.connect(envelope); envelope.connect(group?.bus || master);
      recordVoice(source, [source, filter, envelope], group);
      source.start(when, Math.random() * 2); source.stop(when + duration + .025);
    }
    function rustle(when, group) { texture(when, .65, .07, 1750, group, .16); }
    function noiseLayer(group, color, gain, filters, modulation) {
      const source = context.createBufferSource(), envelope = context.createGain(), nodes = [source];
      source.buffer = noiseBuffer(color); source.loop = true;
      let tail = source;
      for (const [type, frequency, q] of filters) {
        const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = q ?? .5;
        tail.connect(filter); tail = filter; nodes.push(filter);
      }
      envelope.gain.value = gain; tail.connect(envelope); envelope.connect(group.bus); nodes.push(envelope);
      recordVoice(source, nodes, group); source.start();
      if (modulation) {
        // 慢幅度变化由音频线程处理，不依赖高频 JavaScript 计时器。
        const lfo = context.createOscillator(), depth = context.createGain(); lfo.type = 'sine'; lfo.frequency.value = modulation[0]; depth.gain.value = Math.min(gain * .75, modulation[1]);
        lfo.connect(depth); depth.connect(envelope.gain); recordVoice(lfo, [lfo, depth], group); lfo.start();
      }
    }
    function startAmbient() {
      if (!context || !master || ambience || !canPlay()) return;
      const key = currentSound(), bus = context.createGain();
      bus.gain.setValueAtTime(.0001, context.currentTime); bus.gain.setTargetAtTime(1, context.currentTime, .18); bus.connect(master);
      const group = { key, bus, voices: new Set(), nodes: [bus], disposed: false }; ambience = group;
      if (key === 'rain' || key === 'scene-rain') {
        noiseLayer(group, 'pink', .24, [['highpass', 210], ['lowpass', 3800]]);
        noiseLayer(group, 'white', .025, [['highpass', 1500], ['lowpass', 5800]]);
      } else if (key === 'stream') {
        noiseLayer(group, 'brown', .3, [['highpass', 90], ['lowpass', 1700]], [.16, .045]);
        noiseLayer(group, 'pink', .075, [['bandpass', 1800, .55], ['lowpass', 3200]], [.23, .025]);
      } else if (key === 'wind') {
        noiseLayer(group, 'brown', .34, [['highpass', 45], ['lowpass', 1050]], [.055, .16]);
        noiseLayer(group, 'pink', .035, [['lowpass', 1400]], [.08, .02]);
      } else if (key === 'bamboo') {
        noiseLayer(group, 'pink', .075, [['highpass', 550], ['lowpass', 2500]], [.11, .035]);
      } else if (key === 'fire') {
        noiseLayer(group, 'brown', .3, [['highpass', 40], ['lowpass', 550]], [.09, .045]);
        noiseLayer(group, 'pink', .035, [['lowpass', 1600]]);
      } else if (key === 'brown') noiseLayer(group, 'brown', .35, [['highpass', 35], ['lowpass', 900]]);
      if (['scene-library', 'scene-rain', 'stream', 'bamboo', 'fire', 'pages'].includes(key)) schedulePhrase(generation, group);
    }
    function schedulePhrase(token, group) {
      if (token !== generation || !canPlay() || !context || context.state !== 'running' || group !== ambience || group.disposed) return;
      const t = context.currentTime + .04, key = group.key;
      let delay = 10500;
      if (key.startsWith('scene-')) {
        const index = phrase % TONES.length;
        pluck(TONES[index], t, key === 'scene-rain' ? .023 : .032, group);
        pluck(TONES[(index + 2) % TONES.length], t + 1.8, .018, group);
        if (key === 'scene-library' && phrase % 3 === 2) rustle(t + 3.5, group);
      } else if (key === 'stream') {
        // 极轻的水泡下滑音，避开固定音阶和重复旋律。
        for (let i = 0; i < 3; i++) {
          const hz = 420 + Math.random() * 260;
          oscillator(hz, t + i * .8 + Math.random() * .4, .22 + Math.random() * .1, .0055, 'sine', hz * .6, group, .045);
        }
        delay = 5500 + Math.random() * 2500;
      } else if (key === 'bamboo') {
        texture(t, 1.8, .04, 1250 + Math.random() * 500, group, .5);
        texture(t + .8, 1.5, .018, 2300, group, .4); delay = 5500 + Math.random() * 4000;
      } else if (key === 'fire') {
        for (let i = 0; i < 3; i++) texture(t + i * .45 + Math.random() * .25, .12 + Math.random() * .08, .018, 750 + Math.random() * 800, group, .035);
        delay = 2200 + Math.random() * 1700;
      } else if (key === 'pages') {
        rustle(t, group); texture(t + .4, .7, .032, 2600, group, .17); delay = 12500 + Math.random() * 6000;
      }
      phrase++;
      ambienceTimer = global.setTimeout(() => { ambienceTimer = null; schedulePhrase(token, group); }, delay);
    }
    async function ensureAmbient() {
      if (!canPlay()) return false;
      const token = generation, ready = await resumeContext();
      if (!ready || token !== generation || !canPlay()) return false;
      startAmbient(); return true;
    }
    function setEnabled(value) {
      if (disposed) return false;
      enabled = !!value;
      if (!enabled) { stopAmbient(); suspendContext(); return false; }
      if (active) void ensureAmbient();
      else if (global.navigator?.userActivation?.isActive) void resumeContext();
      return true;
    }
    function setActive(value) {
      if (disposed) return;
      const next = !!value;
      if (active === next) { if (next && enabled && documentVisible() && !ambience) void ensureAmbient(); return; }
      active = next; if (!next) { stopAmbient(); suspendContext(); } else if (enabled) void ensureAmbient();
    }
    function changeAmbient() { stopAmbient(true); phrase = 0; if (canPlay()) void ensureAmbient(); }
    function setScene(value) {
      if (disposed) return;
      const next = value === 'rain' ? 'rain' : 'library';
      if (scene === next) return;
      scene = next; if (soundscape === 'scene') changeAmbient();
    }
    function setSoundscape(value) {
      if (disposed) return false;
      const next = SOUNDSCAPES.includes(value) ? value : 'scene';
      if (soundscape !== next) { soundscape = next; changeAmbient(); }
      return next;
    }
    function setVolume(value) {
      volume = clamp(Number.isFinite(Number(value)) ? Number(value) : .3, 0, 1);
      if (context && master) master.gain.setTargetAtTime(volume, context.currentTime, .04);
    }
    async function play(kind) {
      if (!canPlay()) return false;
      const token = generation, ready = await resumeContext();
      if (!ready || !canPlay() || token !== generation) return false;
      const t = context.currentTime + .01;
      if (kind === 'complete') [523.251, 659.255, 783.991].forEach((note, i) => pluck(note, t + i * .16, .10 - i * .014));
      else if (kind === 'purchase') { oscillator(1108.7, t, .14, .065); oscillator(1661.2, t + .075, .28, .04); }
      else if (kind === 'seat') { oscillator(165, t, .19, .1, 'sine', 90); oscillator(330, t, .075, .015); }
      else oscillator(587.33, t, .08, .035);
      if (!ambience) void ensureAmbient(); return true;
    }
    function visibility() {
      if (!documentVisible()) { stopAmbient(); suspendContext(); } else if (canPlay()) void ensureAmbient();
    }
    global.document?.addEventListener('visibilitychange', visibility);
    return {
      setScene, setSoundscape, setEnabled, setVolume, setActive, play,
      destroy() {
        if (disposed) return Promise.resolve();
        disposed = true; enabled = active = false; stopAmbient();
        global.document?.removeEventListener('visibilitychange', visibility);
        const ctx = context; context = null; buffers.clear(); disconnect(master); master = null;
        try { return Promise.resolve(ctx?.close?.()).catch(() => {}); } catch (_) { return Promise.resolve(); }
      }
    };
  }
  global.SpiritFocusAudio = Object.freeze({ create, SOUNDSCAPES });
})(typeof window === 'undefined' ? globalThis : window);
