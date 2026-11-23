/* Readable arrival, card artwork warm-up, and a once-a-day invitation.
 * The invitation is presentation only: it never opens a pack or grants cards. */
(function (global) {
  'use strict';
  const node = document.getElementById('game-boot-quote');
  if (!node) return;
  // 智慧课堂 2026-11-24：诗句用毛笔楷书显示（fonts/lingtian-verse.woff2 只含这些诗用到的字）。改了下面的诗句，要重跑 python3 tools/verse_font.py
  const verses = [
    '山中无甲子，草木有灵时。',
    '一畦藏四季，半卷养清心。',
    '风过千山静，云来一叶轻。',
    '种下今日愿，静候满庭芳。',
    '月照灵泉净，花随道心开。',
    '晨露凝新绿，山风送晚香。',
    '方寸有天地，草木亦知心。',
    '莫问仙途远，且惜眼前春。',
    '一念生青翠，四时有回声。',
    '云深不知处，灵田自有春。',
    '松风翻旧卷，竹露润新芽。',
    '心静闻花落，山空见月明。',
    '不负一场雨，自有满园青。',
    '掌中留山色，心上种清风。',
    '半窗邀明月，一圃养流年。',
    '草木循时长，修行在日常。',
    '春风催一叶，秋月照千峰。',
    '星河归长卷，万象入心田。',
    '每逢新叶展，便是好时光。',
    '山川皆可读，草木亦成章。',
    '携一缕清风，赴一场花开。',
    '灵泉浇旧梦，新绿到窗前。',
    '长路从容走，灵芽次第生。',
    '云外有知己，田间有清欢。',
  ];
  let last = -1;
  try { const saved = sessionStorage.getItem('spirit-boot-verse'); if (saved !== null) last = Number(saved); } catch (_) {}
  let value;
  try { value = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }
  catch (_) { value = Math.random(); }
  let index = Math.floor(value * verses.length);
  if (index === last) index = (index + 1 + Math.floor(value * (verses.length - 1))) % verses.length;
  node.textContent = verses[index];
  try { sessionStorage.setItem('spirit-boot-verse', String(index)); } catch (_) {}
  // 智慧课堂 2026-11-24：开场这句诗进灵田以后也留着——放在“我的灵田”天时卡的时间下面（#environment-verse），
  // 点开的“四时天象”里也有（environment-ui.js 读 SpiritBootVerse）。用户：“你把这句诗句还是放到我的灵田这块卡片里面，放在时间下方……
  // 打开的四时天象也要有这句话，不要出现‘今日语录’。”（之前放在“今日修行”卡片和面板里，已去掉）
  const verse = verses[index];
  global.SpiritBootVerse = verse;
  function showVerse() {
    const line = document.getElementById('environment-verse');
    if (line) { line.textContent = verse; line.title = verse; line.hidden = false; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showVerse); else showVerse();

  // 智慧课堂 2026-11-24（用户：“灵田登陆的时候就不要设置延迟了，之前为了让学生看清这行字专门设置了延迟”）：去掉读诗句的 3.2 秒和等道藏卡的最多 4.8 秒，
  // 云端进度一到就进灵田（只留进度条填满的 0.22 秒）；诗句进灵田后在“今日修行”里看
  const FILL_TIME = 220;
  const started = global.performance?.now?.() ?? Date.now();
  const clock = () => global.performance?.now?.() ?? Date.now();
  const delay = ms => new Promise(resolve => global.setTimeout(resolve, Math.max(0, ms)));
  const progress = document.querySelector('.game-boot-progress');
  const bar = progress?.querySelector('i');
  const stage = document.getElementById('game-boot-stage');
  const percent = document.getElementById('game-boot-percent');
  const steps = Array.from(document.querySelectorAll('[data-boot-step]'));
  let progressTimer = null, preparation = null, finishPromise = null, aborted = false, shownProgress = 0;
  let cardsPrepared = false, artPrepared = false, ready = false, promptArmed = false, invitation = null;
  const seen = new Map();
  function paintProgress(value, text, step) {
    shownProgress = Math.max(shownProgress, Math.min(100, Math.round(value)));
    if (bar) bar.style.width = shownProgress + '%';
    progress?.setAttribute('aria-valuenow', String(shownProgress));
    if (percent) percent.textContent = shownProgress + '%';
    if (stage && text && stage.textContent !== text) stage.textContent = text;
    if (Number.isInteger(step)) steps.forEach((node, index) => {
      node.classList.toggle('is-current', index === step);
      node.classList.toggle('is-complete', index < step);
    });
  }
  function tick() {
    if (aborted || ready) return;
    const age = clock() - started;
    // 智慧课堂（2026-11-24，同学反映“每次卡到87%就会停”）：网站版由加载器（tools/lingtian_loader.js）下载文件，
    // window.LingtianLoad 里有实际下载的字节数。下载时进度按字节走（5%—70%），写明下到第几个文件；文件到齐、正在连接云端时
    // 按时间走到 87% 为止，并写明在连云端（等久了说明“云端回应较慢”）。以前只按时间走，几秒就到 87% 停住，看不出在等什么
    const load = global.LingtianLoad;
    if (load && !preparation && load.phase !== 'done') {
      if (load.phase === 'error') { global.clearTimeout(progressTimer); return; }
      const share = load.bytesTotal > 0 ? Math.min(1, load.bytesDone / load.bytesTotal) : 0;
      const text = load.slow ? `网络较慢，还在下载灵田文件（${load.done}/${load.total}）…` : `正在下载灵田文件（${load.done}/${load.total}）…`;
      paintProgress(Math.round(5 + 65 * share), text, 0);
      progressTimer = global.setTimeout(tick, 120);
      return;
    }
    if (load && !preparation) {
      const waited = clock() - (load.doneAt || started);
      paintProgress(Math.round(70 + 17 * (1 - Math.exp(-waited / 2500))), waited > 12000 ? '云端回应较慢，再稍等一下…' : '正在连接云端，唤醒灵田…', 1);
      progressTimer = global.setTimeout(tick, 120);
      return;
    }
    const progressValue = Math.min(cardsPrepared && artPrepared ? 94 : 87, Math.round(5 + 89 * (1 - Math.exp(-age / 1650))));
    // This is the complete arrival sequence (including reading time), not a
    // measurement of downloaded bytes or a promise about network completion.
    const step = age < 900 && !preparation ? 0 : 1;
    const text = step === 0 ? '凝聚灵气，云间洞天渐醒…'
      : cardsPrepared && artPrepared ? '灵田渐显，静候片刻清风…'
      : cardsPrepared ? '道藏展卷，正在备好灵纹…' : '唤醒灵田，正在准备道藏…';
    paintProgress(progressValue, text, step);
    progressTimer = global.setTimeout(tick, 120);
  }
  tick();
  async function decodeArtwork(art) {
    const holder = document.createElement('div');
    holder.innerHTML = art.filter(Boolean).join('');
    await Promise.allSettled(Array.from(holder.querySelectorAll('img')).map(image => {
      image.loading = 'eager';
      return typeof image.decode === 'function' ? image.decode() : Promise.resolve();
    }));
  }
  async function warmArtwork(engine, cardsReady) {
    const shared = decodeArtwork([global.spiritCardPackArt?.(), global.spiritCardBackArt?.()]);
    // Wait for the assigned course before selecting covers. Passing the actual
    // catalogue card supports v3's ID lookup and the earlier motif renderer.
    // Never decode the entire 214-card collection during the arrival sequence.
    const coversReady = cardsReady.catch(() => {}).then(() => {
      if (aborted || ready) return;
      const course = global.SpiritCards?.getCourse?.(engine.cards?.courseId);
      const covers = Array.isArray(course?.cards) ? course.cards.slice(0, 3) : [];
      return decodeArtwork(covers.map(card => global.spiritCardArt?.(card)));
    });
    await Promise.allSettled([shared, coversReady]);
    artPrepared = true;
  }
  function prepareCards(engine) {
    if (preparation) return preparation;
    paintProgress(30, '唤醒灵田，正在准备道藏…', 1);
    const cardsReady = Promise.resolve().then(() => engine.loadCards?.({interval:'1h'}))
      .finally(() => { cardsPrepared = true; });
    preparation = Promise.allSettled([
      cardsReady,
      warmArtwork(engine, cardsReady),
    ]);
    return preparation;
  }
  function invitationKey(engine) {
    const cards = engine.cards;
    if (!cards?.available || cards.rules?.drawEnabled === false || !global.SpiritCards?.getCourse?.(cards.courseId) || engine.authRequired || engine.accountChanged || engine.cardsError) return null;
    // A server-side draw already made today also suppresses the invitation on
    // another device. Local dismissal never changes the server's draw quota.
    if (Number(cards.daily?.opened) > 0 || !Number.isSafeInteger(cards.daily?.remaining) || cards.daily.remaining <= 0) return null;
    const account = engine.online ? engine.accountKey : 'offline-practice';
    if (!account || (engine.online && !/^[a-f0-9]{64}$/.test(account))) return null;
    const time = engine.now?.() ?? Date.now();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(cards.daily?.day || '') ? cards.daily.day : new Date(time + 28800000).toISOString().slice(0, 10);
    return {key:'yunjian-daozang-arrival-v1:' + account + ':' + encodeURIComponent(cards.courseId), day};
  }
  function wasSeen(key, day) {
    if (seen.get(key) === day) return true;
    try { if (global.localStorage?.getItem(key) === day) return true; } catch (_) {}
    try { if (global.sessionStorage?.getItem(key) === day) return true; } catch (_) {}
    return false;
  }
  function remember(key, day) {
    seen.set(key, day);
    try { global.localStorage?.setItem(key, day); } catch (_) {}
    try { global.sessionStorage?.setItem(key, day); } catch (_) {}
  }
  function tryDaily() {
    if (!ready || !promptArmed || aborted || !invitation || document.hidden) return false;
    const {engine, canPrompt, openDaily} = invitation;
    const candidate = invitationKey(engine);
    if (!candidate || wasSeen(candidate.key, candidate.day)) { promptArmed = false; return false; }
    if (engine.busy || engine.pending || (canPrompt && !canPrompt())) return false;
    if (openDaily?.() !== true) return false;
    remember(candidate.key, candidate.day);
    promptArmed = false;
    return true;
  }
  function finish(options) {
    if (finishPromise) return finishPromise;
    invitation = options;
    finishPromise = (async () => {
      const work = prepareCards(options.engine);
      let completed = false;
      work.then(() => { completed = true; });
      await delay(0);   // 道藏卡已经备好的话（多数时候是），这一拍里 completed 就是 true
      if (aborted) return;
      global.clearTimeout(progressTimer);
      paintProgress(100, options.engine.cards?.available && completed ? '灵田已备，道藏静候启封' : '云雾已散，即将进入灵田', 2);
      await delay(FILL_TIME);
      if (aborted) return;
      ready = true;
      promptArmed = completed;
      options.reveal();
      tryDaily();
      // 道藏卡这时还没备好：备好以后再看要不要弹今日邀请（页面空闲、今天还没弹过才弹，规则同 tryDaily）
      if (!completed) work.then(() => { if (aborted) return; promptArmed = true; tryDaily(); });
    })();
    return finishPromise;
  }
  function abort() {
    aborted = true; promptArmed = false;
    global.clearTimeout(progressTimer);
  }
  global.SpiritGameBoot = Object.freeze({prepareCards, finish, tryDaily, abort});
})(typeof window === 'undefined' ? globalThis : window);
