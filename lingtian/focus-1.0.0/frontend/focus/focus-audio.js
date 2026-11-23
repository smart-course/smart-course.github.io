/* 静修环境音（智慧课堂 2026-11-23 改版）：真实感的环境声＋随机生成的疏弦清音；首次启用由用户操作解锁。
 * 用户：“你帮我把静修里面的环境音也优化升级一下吧，现在的感觉不太逼真，而且有杂音。或者可以加入一些类似于讲解视频中的比较舒缓的背景音。”
 * 原来是在浏览器里把白噪声、粉红噪声滤一滤，听起来像“沙沙”的杂音。现在的声音文件在 assets/audio/，由 lingtian/tools/focus-sounds/render.py
 * 用 numpy 一颗一颗合成（雨点、屋檐滴水、溪水气泡、松风、竹叶、炉火、翻书；没有外部录音素材）：
 *   amb-*.m4a  环境声循环。文件前后各包了 WRAP 秒“回卷”，用 loopStart = WRAP、loopEnd = WRAP + 周期 无缝循环，不怕解码器在头尾补静音；
 *   fx-*.m4a   零星声音（屋檐滴水、翻书、竹竿轻碰、木柴爆响），随机间隔、随机挑一声、随机音量和左右位置，听不出循环；
 *   mus-pad    和弦铺底循环；mus-notes 五声音阶拨弦（一格一个音），按讲解视频配乐的写法在这里随机排旋律，不会重复。
 * 文件读不到（网络不好）时退回本机合成的轻柔底声（只有低频，不再用白噪声）。对外接口不变：setScene、setSoundscape、setEnabled、setVolume、setActive、play、destroy。 */
(function (global) {
  'use strict';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  // 'music'（清音雅乐）为 2026-11-23 新增：只有疏弦清音，不随雅室变化
  const SOUNDSCAPES = Object.freeze(['scene', 'music', 'rain', 'stream', 'wind', 'bamboo', 'fire', 'pages', 'brown']);
  const FADE_SECONDS = 1.1;
  const WRAP = 0.5;
  const script = global.document?.currentScript;
  const BASE = script?.src && typeof URL !== 'undefined' ? new URL('assets/audio/', script.src).href : './focus/assets/audio/';
  // 文件与循环周期（与 render.py 的 manifest-v1.json 一致）
  const FILES = Object.freeze({
    rain: { file: 'amb-rain-v1.m4a', period: 30 },
    stream: { file: 'amb-stream-v1.m4a', period: 30 },
    wind: { file: 'amb-wind-v1.m4a', period: 48 },
    bamboo: { file: 'amb-bamboo-v1.m4a', period: 40 },
    fire: { file: 'amb-fire-v1.m4a', period: 30 },
    room: { file: 'amb-room-v1.m4a', period: 20 },
    brown: { file: 'amb-brown-v1.m4a', period: 24 },
    pad: { file: 'mus-pad-v1.m4a', period: 32 },
    drips: { file: 'fx-drips-v1.m4a', slot: 1.6, count: 8 },
    knocks: { file: 'fx-bamboo-v1.m4a', slot: 1.4, count: 6 },
    pops: { file: 'fx-fire-v1.m4a', slot: 1.2, count: 6 },
    pages: { file: 'fx-pages-v1.m4a', slot: 2.0, count: 6 },
    notes: { file: 'mus-notes-v1.m4a', slot: 4.2, count: 11 },
  });
  // 拨弦音在 mus-notes 里的位置：D3 A3 D4 E4 F#4 A4 B4 D5 E5 F#5 A5
  const LOW = [0, 1], MELODY = [2, 3, 4, 5, 6, 7, 8, 9, 10], CHIME = [7, 9, 10];
  // 每种环境声由哪些循环（名称、音量）、零星声音（间隔秒、音量、左右宽度、音高起伏）、清音（音量）组成
  const RECIPES = Object.freeze({
    'scene-library': { beds: [['room', 1.0], ['pad', 0.55]], music: 0.95, events: [{ id: 'pages', gap: [26, 64], gain: 0.42, width: 0.5, pitch: 0.04 }] },
    'scene-rain': { beds: [['rain', 0.5], ['pad', 0.42]], music: 0.78, events: [{ id: 'drips', gap: [1.4, 5.0], gain: 0.34, width: 0.75, pitch: 0.08 }] },
    music: { beds: [['pad', 0.62], ['room', 0.8]], music: 1.0 },
    rain: { beds: [['rain', 0.95]], events: [{ id: 'drips', gap: [0.9, 3.6], gain: 0.42, width: 0.8, pitch: 0.08 }] },
    stream: { beds: [['stream', 1.0]] },
    wind: { beds: [['wind', 1.0]] },
    bamboo: { beds: [['bamboo', 1.0]], events: [{ id: 'knocks', gap: [6, 17], gain: 0.4, width: 0.75, pitch: 0.06 }] },
    fire: { beds: [['fire', 0.95]], events: [{ id: 'pops', gap: [3.5, 12], gain: 0.4, width: 0.45, pitch: 0.06 }] },
    pages: { beds: [['room', 1.2]], events: [{ id: 'pages', gap: [7, 18], gain: 0.62, width: 0.5, pitch: 0.04 }] },
    brown: { beds: [['brown', 0.7]] },
  });

  function create() {
    let context = null, master = null, ambience = null, retiring = null;
    let enabled = false, active = false, disposed = false, volume = .3, scene = 'library', soundscape = 'scene';
    let fadeTimer = null, generation = 0, starting = null;
    const voices = new Set(), buffers = new Map(), noiseBuffers = new Map();
    const documentVisible = () => !global.document || global.document.visibilityState !== 'hidden';
    const canPlay = () => !disposed && enabled && active && documentVisible();
    const currentSound = () => soundscape === 'scene' ? 'scene-' + scene : soundscape;
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
    function clearGroupTimers(group) { if (!group) return; group.timers.forEach((id) => global.clearTimeout(id)); group.timers.clear(); }
    function later(group, fn, ms) {
      const id = global.setTimeout(() => { group.timers.delete(id); fn(); }, ms);
      group.timers.add(id); return id;
    }
    function disposeGroup(group) {
      if (!group || group.disposed) return;
      group.disposed = true; clearGroupTimers(group); Array.from(group.voices).forEach(stopVoice); group.nodes.forEach(disconnect);
      if (ambience === group) ambience = null;
      if (retiring === group) retiring = null;
    }
    function suspendContext() {
      try { context?.suspend?.()?.catch?.(() => {}); } catch (_) {}
    }
    function stopAmbient(fade = false) {
      generation++; clearFade(); disposeGroup(retiring);
      if (fade && ambience && context?.state === 'running' && canPlay()) {
        const group = ambience; ambience = null; retiring = group; clearGroupTimers(group);
        const now = context.currentTime;
        // 换环境声时旧的慢慢淡出（约一秒），新的同时淡入；只留一层尾音，快速切换不会叠出多组循环
        if (group.bus.gain.cancelAndHoldAtTime) group.bus.gain.cancelAndHoldAtTime(now);
        else {
          const held = group.bus.gain.value;
          group.bus.gain.cancelScheduledValues?.(now);
          group.bus.gain.setValueAtTime(Math.max(.0001, Number.isFinite(held) ? held : .0001), now);
        }
        group.bus.gain.setTargetAtTime(.0001, now, FADE_SECONDS / 4);
        for (const record of group.voices) { try { record.source.stop(now + FADE_SECONDS); } catch (_) {} }
        fadeTimer = global.setTimeout(() => { fadeTimer = null; disposeGroup(group); }, Math.ceil(FADE_SECONDS * 1000) + 40);
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
        context = master = null; buffers.clear(); noiseBuffers.clear(); return null;
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
    // ---------- 读声音文件（同一个文件只读一次；换环境声时把用不着的释放掉，省手机内存） ----------
    function decode(data) {
      return new Promise((resolve, reject) => {
        try {
          const promise = context.decodeAudioData(data, resolve, reject);
          if (promise && typeof promise.then === 'function') promise.then(resolve, reject);
        } catch (error) { reject(error); }
      });
    }
    function load(id) {
      if (!context || !FILES[id]) return Promise.resolve(null);
      if (buffers.has(id)) return buffers.get(id);
      const job = (typeof fetch === 'function' ? fetch(BASE + FILES[id].file, { credentials: 'same-origin' }) : Promise.reject(new Error('no fetch')))
        .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.arrayBuffer(); })
        .then(decode)
        .catch(() => { buffers.delete(id); return null; });
      buffers.set(id, job);
      return job;
    }
    function keepOnly(ids) {
      for (const id of Array.from(buffers.keys())) if (!ids.has(id) && id !== 'notes') buffers.delete(id);
    }
    function idsOf(recipe) {
      const ids = new Set(recipe.beds.map(([id]) => id));
      (recipe.events || []).forEach((event) => ids.add(event.id));
      if (recipe.music) ids.add('notes');
      return ids;
    }
    function recordVoice(source, nodes, group) {
      const record = { source, nodes, group }; voices.add(record); group?.voices.add(record);
      source.onended = () => releaseVoice(record); return record;
    }
    function panner(value) {
      if (!context.createStereoPanner) return null;
      const node = context.createStereoPanner(); node.pan.value = clamp(value, -1, 1); return node;
    }
    // 一格一个声音（零星声音、拨弦）：随机音量、左右位置、略微的音高起伏
    function playSlot(group, bus, id, index, when, gain, pan = 0, pitch = 0) {
      const buffer = group.buffers.get(id), spec = FILES[id];
      if (!buffer || !spec || !canPlay() || group.disposed) return;
      const source = context.createBufferSource(), level = context.createGain(), place = panner(pan);
      source.buffer = buffer;
      if (pitch) source.playbackRate.value = 1 + pitch;
      level.gain.value = gain;
      source.connect(level);
      if (place) { level.connect(place); place.connect(bus); } else level.connect(bus);
      recordVoice(source, place ? [source, level, place] : [source, level], group);
      const offset = Math.min(index, spec.count - 1) * spec.slot;
      source.start(Math.max(context.currentTime, when), offset, spec.slot - .02);
    }
    function startBed(group, id, gain) {
      const buffer = group.buffers.get(id), spec = FILES[id];
      if (!buffer || !spec) return false;
      const source = context.createBufferSource(), level = context.createGain();
      source.buffer = buffer; source.loop = true;
      source.loopStart = WRAP; source.loopEnd = Math.min(buffer.duration, WRAP + spec.period);
      level.gain.value = gain;
      source.connect(level); level.connect(group.bus);
      recordVoice(source, [source, level], group);
      // 每次从循环里随机的地方开始，听起来不会总是同一个开头
      source.start(context.currentTime + .02, WRAP + Math.random() * spec.period * .95);
      return true;
    }
    function scheduleEvents(group, event) {
      const spec = FILES[event.id];
      if (!spec || !group.buffers.get(event.id)) return;
      const next = (first) => {
        if (group.disposed || group !== ambience) return;
        later(group, () => {
          if (group.disposed || group !== ambience || !canPlay() || context.state !== 'running') { next(false); return; }
          playSlot(group, group.bus, event.id, Math.floor(Math.random() * spec.count), context.currentTime + .03,
            event.gain * rand(.55, 1), rand(-1, 1) * (event.width ?? .6), rand(-.5, .5) * (event.pitch || 0));
          next(false);
        }, 1000 * (first ? rand(.6, Math.min(event.gap[1], 6)) : rand(event.gap[0], event.gap[1])));
      };
      next(true);
    }
    // 疏弦清音（讲解视频配乐的写法）：每分钟 60 拍、半拍一格，重拍三成、弱拍一成的机会弹一个音，旋律在五声音阶里小步游走；
    // 每四小节空一小节留白；小节开头偶尔垫一个低音。页面里随机生成，不会重复
    function startMusic(group, gain) {
      if (!group.buffers.get('notes')) return;
      const bus = context.createGain(); bus.gain.value = gain; bus.connect(group.bus); group.nodes.push(bus);
      const STEP = .5, origin = context.currentTime + .4;
      let slot = 0, pos = 3 + Math.floor(Math.random() * 3);
      const tick = () => {
        if (group.disposed || group !== ambience || !canPlay()) return;
        const horizon = context.currentTime + 1.6;
        // 页面曾被浏览器暂停（计时器停了）：跳过已经过去的格子，不一下子补弹一串
        const behind = Math.floor((context.currentTime - origin) / STEP);
        if (behind > slot) slot = behind;
        while (origin + slot * STEP < horizon) {
          const when = origin + slot * STEP, beat = slot % 8, bar = Math.floor(slot / 8);
          if (bar % 4 !== 3) {
            if (Math.random() < (beat % 2 === 0 ? .30 : .10)) {
              pos = clamp(pos + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)], 0, MELODY.length - 1);
              playSlot(group, bus, 'notes', MELODY[pos], when + rand(-.01, .01), rand(.5, .85), rand(-.35, .35));
            }
            if (beat === 0 && Math.random() < .22) playSlot(group, bus, 'notes', LOW[Math.floor(Math.random() * LOW.length)], when, rand(.35, .55), rand(-.15, .15));
          }
          slot++;
        }
        later(group, tick, 400);
      };
      tick();
    }
    // ---------- 读不到文件时的退路：本机合成的轻柔底声（只有低频，不再用白噪声） ----------
    function noiseBuffer(color = 'brown') {
      if (!context) return null;
      if (noiseBuffers.has(color)) return noiseBuffers.get(color);
      const count = Math.max(32, Math.floor(context.sampleRate * 6));
      const overlap = Math.min(Math.floor(count / 4), Math.max(8, Math.floor(context.sampleRate * .2)));
      const raw = new Float32Array(count + overlap);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < raw.length; i++) {
        const white = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + white * .02) / 1.012; raw[i] = last * 3.2; }
        else { b0 = .99765 * b0 + white * .099046; b1 = .963 * b1 + white * .2965164; b2 = .57 * b2 + white * 1.0526913; raw[i] = (b0 + b1 + b2 + white * .1848) * .05; }
      }
      const buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
      let energy = 0;
      for (let i = 0; i < count; i++) {
        // 尾部接回开头，消除循环接缝的咔哒声
        const mix = Math.min(1, i / Math.max(1, overlap - 1));
        data[i] = i < overlap ? raw[count + i] * Math.sqrt(1 - mix) + raw[i] * Math.sqrt(mix) : raw[i]; energy += data[i] * data[i];
      }
      const scale = .2 / Math.max(.001, Math.sqrt(energy / count));
      for (let i = 0; i < count; i++) data[i] *= scale;
      noiseBuffers.set(color, buffer); return buffer;
    }
    function fallbackBed(group) {
      const key = group.key;
      const source = context.createBufferSource(), low = context.createBiquadFilter(), high = context.createBiquadFilter(), level = context.createGain();
      const warm = ['rain', 'scene-rain', 'stream', 'bamboo', 'wind'].includes(key);
      source.buffer = noiseBuffer(warm ? 'pink' : 'brown'); source.loop = true;
      low.type = 'lowpass'; low.frequency.value = warm ? 1800 : 700; low.Q.value = .5;
      high.type = 'highpass'; high.frequency.value = 60; high.Q.value = .5;
      level.gain.value = key === 'music' || key === 'scene-library' || key === 'pages' ? 0 : (warm ? .12 : .2);
      source.connect(low); low.connect(high); high.connect(level); level.connect(group.bus);
      recordVoice(source, [source, low, high, level], group); source.start();
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
    function pluckOsc(frequency, when, gain, group = null) {
      oscillator(frequency, when, 1.7, gain, 'sine', undefined, group);
      oscillator(frequency * 2, when, .8, gain * .19, 'sine', undefined, group);
      oscillator(frequency * 3.006, when, .4, gain * .07, 'sine', undefined, group);
    }
    async function startAmbient() {
      if (!context || !master || ambience || !canPlay()) return;
      const key = currentSound(), recipe = RECIPES[key] || RECIPES.brown, bus = context.createGain();
      bus.gain.setValueAtTime(.0001, context.currentTime); bus.connect(master);
      const group = { key, bus, voices: new Set(), nodes: [bus], timers: new Set(), buffers: new Map(), disposed: false };
      ambience = group;
      const ids = idsOf(recipe);
      keepOnly(ids);
      const loaded = await Promise.all(Array.from(ids).map((id) => load(id).then((buffer) => [id, buffer])));
      if (group.disposed || group !== ambience || !canPlay() || !context) return;
      loaded.forEach(([id, buffer]) => { if (buffer) group.buffers.set(id, buffer); });
      let beds = 0;
      recipe.beds.forEach(([id, gain]) => { if (startBed(group, id, gain)) beds++; });
      if (!beds) fallbackBed(group);
      (recipe.events || []).forEach((event) => scheduleEvents(group, event));
      if (recipe.music) {
        if (group.buffers.get('notes')) startMusic(group, recipe.music);
        else fallbackMusic(group);
      }
      const now = context.currentTime;
      bus.gain.cancelScheduledValues?.(now); bus.gain.setValueAtTime(.0001, now); bus.gain.setTargetAtTime(1, now, .45);
    }
    // 拨弦文件读不到时：原来的本机正弦拨弦，十来秒一句
    const TONES = [196, 220, 261.626, 293.665, 329.628];
    function fallbackMusic(group) {
      let phrase = 0;
      const tick = () => {
        if (group.disposed || group !== ambience || !canPlay() || context.state !== 'running') return;
        const t = context.currentTime + .04, index = phrase % TONES.length;
        pluckOsc(TONES[index], t, .03, group); pluckOsc(TONES[(index + 2) % TONES.length], t + 1.8, .018, group);
        phrase++; later(group, tick, 10500);
      };
      tick();
    }
    async function ensureAmbient() {
      if (!canPlay()) return false;
      const token = generation, ready = await resumeContext();
      if (!ready || token !== generation || !canPlay()) return false;
      void startAmbient(); return true;
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
    function changeAmbient() { stopAmbient(true); if (canPlay()) void ensureAmbient(); }
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
      if (kind === 'complete') {
        // 完成一段：三声拨弦（D5、F#5、A5）；拨弦文件还没读到时用原来的正弦拨弦
        const notes = await load('notes');
        if (notes && canPlay()) {
          const group = { voices: new Set(), nodes: [], timers: new Set(), buffers: new Map([['notes', notes]]), disposed: false };
          CHIME.forEach((index, i) => playSlot(group, master, 'notes', index, context.currentTime + .02 + i * .17, .9 - i * .12, (i - 1) * .25));
        } else [523.251, 659.255, 783.991].forEach((note, i) => pluckOsc(note, t + i * .16, .10 - i * .014));
      }
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
        const ctx = context; context = null; buffers.clear(); noiseBuffers.clear(); disconnect(master); master = null;
        try { return Promise.resolve(ctx?.close?.()).catch(() => {}); } catch (_) { return Promise.resolve(); }
      }
    };
  }
  global.SpiritFocusAudio = Object.freeze({ create, SOUNDSCAPES });
})(typeof window === 'undefined' ? globalThis : window);
