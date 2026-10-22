/* 课堂后台适配层
 * provider:
 *   cloudbase —— 腾讯云开发（上海）PostgreSQL 模式；学生匿名登录，教师账号密码登录
 *   mock      —— 本机测试用，数据存在浏览器 localStorage，只允许在 localhost 使用
 *   off       —— 不连接后台（页面照常可用，选择与作答只保存在本机）
 * 表：加入 ck_checkins、选择 ck_choices、作答 ck_answers（只增不改，教师端取每人最新一条）、课堂 ck_classrooms
 * 函数：ck_join（学生凭课堂码进入）、ck_publish / ck_set_current / ck_set_open（教师管理课堂）、
 *       ck_submit_answer（概念学习课程逐题“递交”，每题只收第一次）、ck_my_danmaku / ck_withdraw_my_danmaku（学生查看、撤回自己的弹幕，记录保留）、
 *       ck_submit_feedback（每个案例最后的匿名建议：不存提交者身份，只记日期）、ck_my_roster_no（本人在点名册里的编号）、
 *       ck_create_class / ck_rename_class / ck_set_class_units（班级上课范围）/ ck_save_roster / ck_move_classroom / ck_delete_class（教师管理班级与点名册）、
 *       ck_save_realms（教师结算修为境界）/ ck_my_realm（本人的境界）/ ck_realm_top（学生面板“修为榜”：本班前十与本人名次，带修为）/ ck_send_gift（按境界祭出弹幕法宝，每件一次）/ ck_my_gifts（本人已祭出的法宝）、
 *       ck_stop_item（教师在投屏页停止或恢复某道题的递交）/ ck_stopped_items（本课堂已停止递交的题号）
 *       ck_request_leave / ck_my_leaves / ck_cancel_leave（学生请假、查看、撤销；教师读 ck_leaves）
 *       ck_ping（学生页在前台时每 45 秒报一次在线；教师读 ck_presence，工作台加入名单显示小绿灯）
 *       ck_record_draws（教师在投屏页记下猜词游戏抽中的同学；教师读、删 ck_draws）
 *       ck_my_submissions（学生读本人在这个课堂已经递交到后台的题目，学生页最下方“本堂作业递交情况”）
 *       ck_puzzle_open / ck_puzzle_close（教师在投屏页“情境猜谜”开始、结束一轮抢答；教师读、删 ck_puzzle_rounds、ck_puzzle_guesses）
 *       ck_puzzle_live / ck_puzzle_guess（学生面板看正在进行的一轮、抢答；后台核对谜底，第一个猜中的自动加修为）
 *       ck_set_pk_winners（教师在 PK 大屏给今天各局的胜者加修为）
 * 修为境界：ClassLive.REALMS / GIFTS / realmOf，学生页、投屏弹幕、教师工作台共用（规则见工作台“修为境界”与学生面板“修为说明”）
 */
(function () {
  'use strict';
  const COLLECTIONS = { checkins: 'ck_checkins', choices: 'ck_choices', answers: 'ck_answers', classrooms: 'ck_classrooms', danmaku: 'ck_danmaku',
    homework: 'ck_homework', classes: 'ck_classes', feedback: 'ck_feedback', realms: 'ck_realms',
    requests: 'ck_join_requests', seclog: 'ck_security_log', bonus: 'ck_bonus', stops: 'ck_stops', giftuses: 'ck_gift_uses', leaves: 'ck_leaves', presence: 'ck_presence', draws: 'ck_draws',
    puzzles: 'ck_puzzle_rounds', puzzleguesses: 'ck_puzzle_guesses', practice: 'ck_practice_log' };

  // ---------- 修为境界（两门课共用） ----------
  // 满分＝每次课 100 修为 × 全部课次；境界按修为占满分的比例划分，每个境界再分初期、中期、后期。
  // 称号材质由低到高：素石 → 青玉 → 金丹 → 紫霄（发光、星芒）→ 神光（黑曜底、七彩流光），学生面板、投屏、工作台共用（样式类 is-r0—is-r4）
  const REALMS = [
    { level: 0, name: '炼气', look: '素石', min: 0 },
    { level: 1, name: '筑基', look: '青玉', min: 0.15 },
    { level: 2, name: '结丹', look: '金丹', min: 0.35 },
    { level: 3, name: '元婴', look: '紫霄', min: 0.80 },
    { level: 4, name: '化神', look: '神光', min: 0.90 },   // 2026-10-22 用户要求：元婴 80%、化神 90%
  ];
  const STAGES = ['初期', '中期', '后期'];
  // 弹幕法宝（取自《凡人修仙传》）：每升到一个境界获得该境界法宝的一次使用机会（每件只能祭出一次，记在 ck_gift_uses），
  //   且每次课（同一课堂同一天）最多祭出一件；不加修为，由后台函数 ck_send_gift 核对。学生经 ck_my_gifts 查本人已祭出的法宝。
  // 投屏画面见 live-danmaku.js 的 .dm-gift-<id>；名牌写“某某 verb / 法宝名 / tail”
  const GIFTS = [
    { id: 'zhujidan', name: '筑基丹', icon: '🌕', level: 1, verb: '炼成一枚', tail: '丹香满室' },
    { id: 'qingzhu', name: '青竹蜂云剑', icon: '🗡️', level: 2, verb: '祭出', tail: '剑阵破空' },
    { id: 'fenglei', name: '风雷翅', icon: '⚡', level: 3, verb: '展开', tail: '雷遁千里' },
    { id: 'zhangtian', name: '掌天瓶', icon: '🏺', level: 4, verb: '催动', tail: '月华凝液' },
  ];
  // 弹幕字色：每升一个境界多解锁两种——炼气霜白、月银，筑基青冥、翠竹，结丹金曦、大红，元婴樱粉、紫霄，化神两种流光色；
  // 投屏页按发送人的境界核对，境界不够的选择不算。没选过时：炼气至结丹白字，元婴默认紫霄，化神默认七彩。
  // （原“赤霞”已换成大红；数据库白名单仍保留 chixia，旧记录不受影响，选过赤霞的按本境界默认色）
  const COLORS = [
    { id: 'shuangbai', name: '霜白', value: '#ffffff', level: 0 },
    { id: 'yueyin', name: '月银', value: '#dfe6ef', level: 0 },
    { id: 'qingming', name: '青冥', value: '#a8e6ff', level: 1 },
    { id: 'cuizhu', name: '翠竹', value: '#a6f5c4', level: 1 },
    { id: 'jinxi', name: '金曦', value: '#ffe08a', level: 2 },
    { id: 'dahong', name: '大红', value: '#ff3b2f', level: 2 },
    { id: 'yingfen', name: '樱粉', value: '#ffc2df', level: 3 },
    { id: 'zixiao', name: '紫霄', value: '#e3cfff', level: 3 },
    { id: 'liujin', name: '流金', flow: 'linear-gradient(90deg,#ffe08a,#fffaf0,#ffc94a,#ffe08a)', level: 4 },
    { id: 'qicai', name: '七彩', flow: 'linear-gradient(90deg,#ffe08a,#ffb3d6,#d9c2ff,#a8e6ff,#ffe08a)', level: 4 },
  ];
  const DEFAULT_COLOR = { 3: 'zixiao', 4: 'qicai' };
  // 发送人境界 + 他选的字色 → 投屏实际用的字色（境界不够的选择不算）
  function colorFor(level, chosen) {
    const pick = COLORS.find((item) => item.id === chosen);
    if (pick && level >= pick.level) return pick;
    return COLORS.find((item) => item.id === DEFAULT_COLOR[level]) || null;
  }
  // 教师点赞：投屏上鼠标停在弹幕上可点赞；每堂课（同一课堂同一天）最多 limit 次（后台 ck_like_danmaku 核对）；
  // 被赞弹幕的发送人每个赞额外加 points 修为，每人每次课最多算 perStudent 个（额外奖励，不计入满分）
  const LIKE = { limit: 20, points: 5, perStudent: 2 };
  // 猜词游戏：每次课（同一课堂同一天）得分第一的一组（并列都算），老师在投屏页得分榜上给两人各加 points 修为（额外奖励，不计入满分）
  const WORDGAME = { points: 10 };
  // 情境猜谜抢答：老师在投屏页出题时开一轮，学生在面板里抢答，每题最多 tries 次；第一个猜中的自动加 points 修为
  // （同一课堂同一天每人最多累计 cap，额外奖励，不计入满分；后台 ck_puzzle_guess 核对）
  const PUZZLE = { points: 5, tries: 3, cap: 20 };
  // PK 对决（替换部分案例的圆桌会议）：老师在 PK 大屏结束后给今天各局的胜者每人加 points 修为（额外奖励，不计入满分）
  const PK = { points: 5 };
  // 修炼场（2026-10-22，两门课各一个）：本班开放过某单元的课堂就开放（当前课堂，或已有学生登录上过课；之前上过的也开放；
  // 提前发布、还没开放的课堂只能查看，不开放、不计修为）；客观题当天第一次作答就答对得分、每题最多得一次，
  // 题目是另写的新题（与课堂正文不重复）；分值按题型：易错判断 judge、情境辨析 scene、讲给别人听 feynman（费曼学习法专用题）；
  // 每人每门课每天最多 cap 修为（额外奖励，不计入满分；后台 ck_practice_answer / essay 核对，
  // 分值写在题库里〔practice_bank.py〕，上限写在 cloudbase-pg.sql 的 ck_practice_cap，三处要一致）。
  // 分值按“剩 9 次课、倒数第二次课时最好的同学练满能到化神（90%）”测算：政经每单元共 30、习经每个案例共 12（与只有情境辨析、易错判断时相同）。
  const PRACTICE = {
    delay: 0, essayMin: 200,
    courses: { 'political-economy': { cap: 10, judge: 2, scene: 4, feynman: 5 }, 'xjp-economy': { cap: 3, judge: 1, scene: 1, feynman: 3 } },
    of(course) { return this.courses[course] || { cap: 3, judge: 1, scene: 1, feynman: 3 }; },
    // “易错判断 +2、情境辨析 +4、讲给别人听 +5”（两种相同时合并）
    text(course) {
      const r = this.of(course);
      return r.judge === r.scene ? `易错判断、情境辨析每题 +${r.judge}，讲给别人听每题 +${r.feynman}` : `易错判断 +${r.judge}、情境辨析 +${r.scene}、讲给别人听 +${r.feynman}`;
    },
  };
  // 请假：请假的那次课计基础修为（相当于签到）；没登录也没请假的课不得修为（教师工作台结算，见 live-teacher.js）
  const LEAVE = { points: 20 };
  // 修为 → 境界：level 0—4，stage 0—2（初期／中期／后期），within 为本境界内的进度（0—1）
  function realmOf(points, max) {
    const ratio = max > 0 ? Math.max(0, Math.min(1, points / max)) : 0;
    let level = 0;
    REALMS.forEach((realm) => { if (ratio >= realm.min - 1e-9) level = realm.level; });
    const lo = REALMS[level].min;
    const hi = level < REALMS.length - 1 ? REALMS[level + 1].min : 1;
    const within = hi > lo ? Math.min(1, (ratio - lo) / (hi - lo)) : 1;
    const stage = Math.min(2, Math.floor(within * 3));
    return { level, stage, ratio, within, name: REALMS[level].name, title: REALMS[level].name + STAGES[stage] };
  }

  // 以北京时间的日期作为“这节课”的标识，例如 2026-09-30
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());

  const unwrap = (result) => {
    if (result && result.error) throw result.error;
    return result;
  };

  const errorText = (error) => String((error && [error.code, error.message, error.details].filter(Boolean).join(' ')) || error || '');
  // 同一题已经递交过（每题只收第一次）
  const isDuplicateError = (error) => /23505|duplicate key|already exists|已递交/i.test(errorText(error));
  // 课堂未开放或已结束提交时，数据库的行级安全会拒绝写入
  const isClosedError = (error) => !isDuplicateError(error) && /row-level security|42501|permission denied|violates|已结束提交/i.test(errorText(error));

  // 停止递交：教师在投屏页停止的题号（习经“案例号:题目”，政经为作业题目编号）；末尾 * 表示同一前缀的一组题（规则同 ck_item_stopped）
  const isStopped = (stops, key) => Array.from(stops || []).some((item) => item === key
    || (item.endsWith('*') && String(key || '').startsWith(item.slice(0, -1))));
  // ck_stopped_items / ck_stop_item 的返回值（text[]）整理成题号列表
  const stopList = (value) => {
    const out = [];
    const walk = (v) => {
      if (typeof v === 'string') {
        if (/^\{.*\}$/.test(v)) v.slice(1, -1).split(',').filter(Boolean).forEach((item) => out.push(item.replace(/^"|"$/g, '')));
        else out.push(v);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(value);
    return out;
  };

  // 课堂码：4 个字母＋4 位数字，不区分大小写
  const normalizeCode = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

  // 页面所属单位：章节页 chNN、案例页 caseNN
  const unitOf = (path) => ((path || location.pathname).match(/([a-z]+\d{2})\.html$/) || [])[1];

  // 腾讯云开发 PostgreSQL 模式（JS SDK v3）：三张表 ck_checkins / ck_choices / ck_answers，
  // 行级安全策略保证学生只能新增、教师账号才能读取和删除（见 tools/cloudbase-pg.sql）。
  function cloudbaseProvider(config) {
    if (!window.cloudbase) throw new Error('未加载 CloudBase SDK');
    const app = window.cloudbase.init({ env: config.env, region: config.region || 'ap-shanghai' });
    const auth = typeof app.auth === 'function' ? app.auth() : app.auth;
    const db = app.rdb();
    const PAGE = 500;
    const POLL_MS = 5000;
    // SQL 里 case 是保留字，列名用 case_no
    const column = (key) => (key === 'case' ? 'case_no' : key);
    const toRow = (doc) => {
      const row = {};
      Object.entries(doc).forEach(([key, value]) => { row[column(key)] = key === 'choice' ? String(value) : value; });
      return row;
    };
    const fromRow = (row) => ({ ...row, case: row.case_no, ts: Number(row.ts) || Date.parse(row.created_at) || 0 });
    const filtered = (query, where) => Object.entries(where).reduce((q, [key, value]) => q.eq(column(key), value), query);
    // 登录令牌约 2 小时过期，SDK 不会替数据请求自动续期：页面开久了，请求会被当成“未登录”而拒绝
    // （permission denied for table）。所以请求前每分钟最多检查一次会话（到期时由 SDK 续期），
    // 仍被当成未登录拒绝时，强制续期后再试一次；行级安全的拒绝（如课堂已结束提交）不在此列。
    let checkedAt = 0;
    const keepFresh = async (force) => {
      if (!force && Date.now() - checkedAt < 60000) return;
      checkedAt = Date.now();
      try {
        if (force && typeof auth.refreshSession === 'function') await auth.refreshSession();
        await auth.getSession();
      } catch (error) { /* 续期失败就照常请求，由页面显示错误 */ }
    };
    const isAuthError = (error) => {
      const text = errorText(error);
      return !/row-level security/i.test(text) && /permission denied for|PGRST30\d|jwt|token.{0,20}(expired|invalid)|unauthori[sz]ed|\b401\b/i.test(text);
    };
    const call = async (make) => {
      await keepFresh(false);
      try {
        return unwrap(await make());
      } catch (error) {
        if (!isAuthError(error)) throw error;
        await keepFresh(true);
        return unwrap(await make());
      }
    };
    const sessionInfo = async () => {
      const result = await auth.getSession();
      const session = result && result.data && result.data.session;
      if (!session || !session.user) return null;
      const user = session.user;
      return {
        uid: user.id || user.sub || user.uid,
        anonymous: Boolean(user.is_anonymous),
        name: (user.user_metadata && (user.user_metadata.username || user.user_metadata.name)) || user.username || user.email || '',
      };
    };

    return {
      name: 'cloudbase',
      session: sessionInfo,
      async ensureAnonymous() {
        const current = await sessionInfo();
        if (current) return current.uid;
        unwrap(await auth.signInAnonymously());
        const created = await sessionInfo();
        return created && created.uid;
      },
      async signInTeacher(username, password) {
        unwrap(await auth.signInWithPassword({ username, password }));
        return sessionInfo();
      },
      async signOut() { unwrap(await auth.signOut()); },
      // 学生换人：退出这次匿名登录（下次进课堂算新设备，要输口令）；教师账号不动
      async signOutStudent() {
        const current = await sessionInfo();
        if (current && current.anonymous) unwrap(await auth.signOut());
      },
      async add(kind, doc) {
        const row = toRow({ ...doc, ts: Date.now() });
        await call(() => db.from(COLLECTIONS[kind]).insert(row));
      },
      async addMany(kind, docs) {
        const ts = Date.now();
        const rows = docs.map((doc) => toRow({ ...doc, ts }));
        await call(() => db.from(COLLECTIONS[kind]).insert(rows));
      },
      async rpc(name, params) {
        return (await call(() => db.rpc(name, params || {}))).data;
      },
      // options.limit：只取最新的若干条（按 id 倒序）；options.since：[列名, 值]，只取该列大于此值的行（增量读取）
      async fetchAll(kind, where, options = {}) {
        const base = () => {
          const query = filtered(db.from(COLLECTIONS[kind]).select('*'), where);
          return options.since ? query.gt(options.since[0], options.since[1]) : query;
        };
        if (options.limit) {
          const result = await call(() => base().order('id', { ascending: false }).range(0, options.limit - 1));
          return (result.data || []).map(fromRow);
        }
        const rows = [];
        for (let from = 0; ; from += PAGE) {
          const result = await call(() => base().order('id', { ascending: true }).range(from, from + PAGE - 1));
          const batch = result.data || [];
          rows.push(...batch.map(fromRow));
          if (batch.length < PAGE) return rows;
        }
      },
      // options.incremental：按 updated_at 只取有变化的行（作业快照较大，不必每次全部重读），不使用实时推送
      watch(kind, where, onChange, onError, onStatus, options = {}) {
        let closed = false;
        let live = false;
        let pending = null;
        let channel = null;
        let realtime = null;
        const known = new Map();
        let cursor = null;
        const millis = (value) => Date.parse(String(value || '').replace(/(\.\d{3})\d+/, '$1'));
        const refresh = async () => {
          try {
            if (!options.incremental) {
              const rows = await this.fetchAll(kind, where);
              if (!closed) onChange(rows);
              return;
            }
            const rows = await this.fetchAll(kind, where, cursor ? { since: ['updated_at', cursor] } : {});
            rows.forEach((row) => known.set(String(row.id), row));
            // 回退 60 秒再读，避免并发提交时提交顺序与时间戳顺序不一致而漏掉
            const latest = Math.max(0, ...Array.from(known.values()).map((row) => millis(row.updated_at)).filter(Number.isFinite));
            cursor = latest ? new Date(latest - 60000).toISOString() : null;
            if (!closed) onChange(Array.from(known.values()));
          } catch (error) {
            if (onError) onError(error);
          }
        };
        const soon = () => { clearTimeout(pending); pending = setTimeout(refresh, 400); };
        // 实时推送连不上时关闭频道，不让 SDK 反复重连，改由定时刷新兜底
        const dropChannel = () => {
          if (channel && realtime) { try { realtime.removeChannel(channel); } catch (error) { /* 已关闭 */ } }
          channel = null;
        };
        refresh();
        if (options.incremental) {
          if (onStatus) onStatus('polling');
          const timer = setInterval(refresh, options.interval || POLL_MS);
          return () => { closed = true; clearInterval(timer); };
        }
        try {
          realtime = app.realtime();
          channel = realtime
            .channel(`${COLLECTIONS[kind]}-${Math.random().toString(36).slice(2, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: COLLECTIONS[kind], filter: `course=eq.${where.course}` }, soon)
            .subscribe((status) => {
              live = status === 'SUBSCRIBED';
              if (onStatus) onStatus(live ? 'live' : 'polling');
              if (live) soon();
              else if (status !== 'CLOSED') dropChannel();
            });
        } catch (error) {
          console.warn('[课堂后台] 实时推送不可用，改为定时刷新：', error);
          if (onStatus) onStatus('polling');
        }
        // 实时推送不可用时，每 5 秒自动刷新一次
        const timer = setInterval(() => { if (!live) refresh(); }, POLL_MS);
        return () => {
          closed = true;
          clearInterval(timer);
          clearTimeout(pending);
          dropChannel();
        };
      },
      async removeAll(kind, where) {
        await call(() => filtered(db.from(COLLECTIONS[kind]).delete(), where));
      },
    };
  }

  function mockProvider() {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      throw new Error('本机测试后台（mock）只能在 localhost 使用，不能发布');
    }
    const prefix = 'classlive-mock:';
    const read = (kind) => { try { return JSON.parse(localStorage.getItem(prefix + kind) || '[]'); } catch (error) { return []; } };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('classlive-mock') : null;
    const listeners = new Set();
    const notify = (kind) => listeners.forEach((listener) => { if (listener.kind === kind) listener.fire(); });
    const write = (kind, rows) => {
      localStorage.setItem(prefix + kind, JSON.stringify(rows));
      notify(kind);
      if (channel) channel.postMessage(kind);
    };
    if (channel) channel.onmessage = (event) => notify(event.data);
    window.addEventListener('storage', (event) => {
      if (event.key && event.key.startsWith(prefix)) notify(event.key.slice(prefix.length));
    });
    const matches = (doc, where) => Object.entries(where).every(([key, value]) => doc[key] === value);
    // 模拟数据库的课堂规则：加入需是当前课堂，选择与作答还需未结束提交
    const classroomState = (id) => {
      const room = read('classrooms').find((row) => row.id === id && row.is_current);
      return room ? (room.submissions_open ? 'open' : 'closed') : null;
    };
    const sidKey = (sid) => String(sid == null ? '' : sid).replace(/\s+/g, '').toUpperCase();
    const plain = (value) => String(value == null ? '' : value).replace(/\s+/g, '');
    const nextId = (rows) => Math.max(Date.now(), ...rows.map((row) => Number(row.id) + 1 || 0));
    const sha256 = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const weakPin = (pin, sid) => /^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin) || pin === sidKey(sid).slice(-4);
    // 本人（这台设备）在某课堂最近一条核对通过、且设备仍绑定的加入记录
    const myCheckin = (uid, classroom) => {
      const room = read('classrooms').find((row) => String(row.id) === String(classroom));
      if (!room) return null;
      const devices = read('devices');
      const mine = read('checkins').filter((row) => row.owner === uid && String(row.classroom) === String(classroom) && row.verified
        && devices.some((d) => String(d.class_id) === String(room.class_id) && d.sid === sidKey(row.sid) && d.owner === uid));
      return mine[mine.length - 1] || null;
    };
    const memberOk = (uid, classroom, sid, name) => {
      const me = myCheckin(uid, classroom);
      return Boolean(me) && sidKey(me.sid) === sidKey(sid) && plain(me.name) === plain(name);
    };
    const secLog = (kind, fields) => {
      const rows = read('seclog');
      rows.push({ id: nextId(rows), at: new Date().toISOString(), kind, ...fields });
      write('seclog', rows);
    };
    const stopsOf = (classroom) => read('stops').filter((row) => String(row.classroom) === String(classroom)).map((row) => row.item).sort();
    const guard = (kind, doc, uid) => {
      const state = classroomState(doc.classroom);
      // 加入记录只能经 ck_join 写入；选择、作答、弹幕须与本人这次登录的加入记录一致
      if (kind === 'checkins' || !memberOk(uid, doc.classroom, doc.sid, doc.name)) throw new Error('new row violates row-level security policy (mock)');
      if (!state || state !== 'open') throw new Error('new row violates row-level security policy (mock)');
      if ((kind === 'choices' || kind === 'answers') && isStopped(stopsOf(doc.classroom), `${doc.case}:${doc.item}`)) {
        throw new Error('new row violates row-level security policy (mock)');
      }
      if (kind === 'danmaku') {
        const room = read('classrooms').find((row) => row.id === doc.classroom);
        const recent = read('danmaku').some((row) => row.owner === uid && Date.now() - row.ts < 5000);
        if (!room || room.danmaku === 'off' || recent) throw new Error('new row violates row-level security policy (mock)');
      }
    };
    const isoDay = (ts) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(Number(ts) || 0));
    const teacherOnly = () => { if (!localStorage.getItem(prefix + 'teacher')) throw new Error('只有教师账号可以管理课堂'); };
    const newCode = () => {
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 4; i += 1) code += letters[Math.floor(Math.random() * letters.length)];
      return code + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    };
    const updateRoom = (id, change) => {
      const rows = read('classrooms');
      const room = rows.find((row) => row.id === id);
      if (!room) throw new Error('课堂不存在');
      change(room, rows);
      room.updated_at = new Date().toISOString();
      write('classrooms', rows);
      return { ...room };
    };
    return {
      name: 'mock',
      async session() {
        const teacher = localStorage.getItem(prefix + 'teacher');
        if (teacher) return { uid: 'teacher-' + teacher, anonymous: false, name: teacher };
        const uid = localStorage.getItem(prefix + 'uid');
        return uid ? { uid, anonymous: true, name: '' } : null;
      },
      async ensureAnonymous() {
        let uid = localStorage.getItem(prefix + 'uid');
        if (!uid) { uid = 'anon-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(prefix + 'uid', uid); }
        return uid;
      },
      async signInTeacher(username, password) {
        if (!username || !password) throw new Error('请输入账号和密码');
        localStorage.setItem(prefix + 'teacher', username);
        return this.session();
      },
      async signOut() { localStorage.removeItem(prefix + 'teacher'); },
      async signOutStudent() { localStorage.removeItem(prefix + 'uid'); },
      async add(kind, doc) { return this.addMany(kind, [doc]); },
      async addMany(kind, docs) {
        const uid = await this.ensureAnonymous();
        docs.forEach((doc) => guard(kind, doc, uid));
        const rows = read(kind);
        if (kind === 'choices' || kind === 'answers') {
          const taken = new Set(rows.map((row) => `${row.classroom}|${row.sid}|${row.case}|${row.item}`));
          if (docs.some((doc) => taken.has(`${doc.classroom}|${doc.sid}|${doc.case}|${doc.item}`))) {
            throw Object.assign(new Error('duplicate key value violates unique constraint (mock)'), { code: '23505' });
          }
        }
        const ts = Date.now();
        docs.forEach((doc) => rows.push({ id: Math.random().toString(36).slice(2), owner: uid, ...(kind === 'danmaku' ? { status: 'new' } : {}), ...doc, ts }));
        write(kind, rows);
      },
      async rpc(name, params = {}) {
        // 学生登录：课堂码＋点名册＋4 位口令（规则同 cloudbase-pg.sql 的 ck_join）
        if (name === 'ck_join') {
          const uid = await this.ensureAnonymous();
          const now = Date.now();
          const at = new Date().toISOString();
          const fails = read('seclog').filter((row) => row.owner === uid && now - Date.parse(row.at) < 600000
            && ['bad_code', 'bad_name', 'bad_pin', 'request'].includes(row.kind)).length;
          if (fails >= 20) return { status: 'too_many' };
          const code = normalizeCode(params.p_code).replace(/[^A-Z0-9]/g, '');
          const room = read('classrooms').find((row) => row.code === code && row.is_current);
          if (!room) { secLog('bad_code', { owner: uid, detail: code.slice(0, 12) }); return { status: 'bad_code' }; }
          const sid = sidKey(params.p_sid);
          const nm = plain(params.p_name);
          if (!/^[A-Z0-9]{4,20}$/.test(sid) || nm.length < 2 || nm.length > 20) return { status: 'invalid' };
          const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = klass && Array.isArray(klass.roster) ? klass.roster : [];
          if (!roster.length) return { status: 'no_roster' };
          const person = roster.find((item) => sidKey(item.sid) === sid);
          const ctx = { owner: uid, course: room.course, class_id: room.class_id, classroom: room.id, sid, name: nm };
          if (!person) {
            const reqs = read('requests');
            const req = reqs.find((row) => String(row.class_id) === String(room.class_id) && row.sid === sid);
            if (req && req.status === 'rejected') return { status: 'rejected' };
            if (req && req.status === 'pending') return { status: 'pending' };
            if (reqs.filter((row) => String(row.class_id) === String(room.class_id) && row.status === 'pending').length >= 100) return { status: 'too_many' };
            const fields = { name: nm, class_name: String(params.p_class || '').trim().slice(0, 40) || null, owner: uid, status: 'pending', created_at: at, decided_at: null };
            if (req) Object.assign(req, fields);
            else reqs.push({ id: nextId(reqs), class_id: room.class_id, course: room.course, sid, ...fields });
            write('requests', reqs);
            secLog('request', ctx);
            return { status: 'pending' };
          }
          if (plain(person.name) !== nm) { secLog('bad_name', ctx); return { status: 'bad_name' }; }
          const devices = read('devices');
          const bound = devices.find((d) => String(d.class_id) === String(room.class_id) && d.sid === sid && d.owner === uid);
          if (bound) {
            bound.last_at = at;
            write('devices', devices);
          } else {
            const pins = read('pins');
            let pin = pins.find((row) => String(row.class_id) === String(room.class_id) && row.sid === sid);
            if (pin && pin.locked_until && Date.parse(pin.locked_until) > now) return { status: 'locked', until: pin.locked_until, teacher: (pin.locks || 0) >= 3 };
            if (!pin || !pin.pin_hash) {
              const fresh = String(params.p_new_pin || '');
              if (!/^\d{4}$/.test(fresh)) return { status: 'set_pin' };
              if (weakPin(fresh, sid)) return { status: 'weak_pin' };
              const salt = Math.random().toString(36).slice(2);
              if (!pin) { pin = { class_id: room.class_id, sid }; pins.push(pin); }
              Object.assign(pin, { pin_hash: await sha256(`${salt}:${fresh}`), salt, fails: 0, locks: 0, locked_until: null, set_at: at, updated_at: at });
              write('pins', pins);
              secLog('pin_set', ctx);
            } else {
              const typed = String(params.p_pin || '');
              if (!/^\d{4}$/.test(typed)) return { status: 'need_pin' };
              if (await sha256(`${pin.salt}:${typed}`) !== pin.pin_hash) {
                // 连续输错 10 次锁定：第一次 15 分钟、第二次 1 小时、第三次起须教师解锁
                const count = (pin.fails || 0) + 1;
                const locks = pin.locks || 0;
                const minutes = count < 10 ? 0 : locks === 0 ? 15 : locks === 1 ? 60 : 10 * 365 * 24 * 60;
                const until = minutes ? new Date(now + minutes * 60000).toISOString() : null;
                Object.assign(pin, { fails: until ? 0 : count, locks: locks + (until ? 1 : 0), locked_until: until, updated_at: at });
                write('pins', pins);
                secLog(until ? 'locked' : 'bad_pin', { ...ctx, detail: !until ? null : locks === 0 ? '15 分钟' : locks === 1 ? '1 小时' : '须教师解锁' });
                return until ? { status: 'locked', until, teacher: locks >= 2 } : { status: 'bad_pin', left: 10 - count };
              }
              Object.assign(pin, { fails: 0, locks: 0, updated_at: at });
              write('pins', pins);
              secLog('new_device', ctx);
            }
            const fresh = read('devices');
            fresh.push({ class_id: room.class_id, sid, owner: uid, first_at: at, last_at: at });
            write('devices', fresh);
          }
          const rows = read('checkins');
          rows.push({ id: nextId(rows), owner: uid, course: room.course, session: today(), name: person.name, sid: person.sid, page: room.chapter, path: '/',
            ts: now, classroom: room.id, class_name: String(params.p_class || '').trim().slice(0, 40) || null,
            group_name: String(params.p_group || '').trim().slice(0, 20) || null, verified: true });
          write('checkins', rows);
          return { status: 'ok', classroom: room.id, course: room.course, chapter: room.chapter, room_name: room.name,
            submissions_open: room.submissions_open, danmaku: room.danmaku, pwd_hash: '', name: person.name, sid: person.sid };
        }
        // 章节页核对本人是否已登录本课堂；每天第一次打开补记一次加入
        if (name === 'ck_checkin_today') {
          const uid = await this.ensureAnonymous();
          const open = classroomState(params.p_classroom) !== null;
          const me = myCheckin(uid, params.p_classroom);
          if (!me || sidKey(me.sid) !== sidKey(params.p_sid)) return open ? 'login' : 'past';
          if (open && me.session !== today()) {
            const rows = read('checkins');
            rows.push({ ...me, id: nextId(rows), session: today(), ts: Date.now() });
            write('checkins', rows);
          }
          return 'ok';
        }
        // 本人递交情况（规则同 cloudbase-pg.sql 的 ck_my_submissions）
        if (name === 'ck_my_submissions') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          const mine = (doc) => String(doc.classroom) === String(params.p_classroom) && sidKey(doc.sid) === sid;
          const first = new Map();
          const add = (key, ts) => { if (!first.has(key) || ts < first.get(key)) first.set(key, ts); };
          read('choices').filter(mine).forEach((doc) => add(`${doc.case}:${/^match-/.test(doc.item) ? 'match' : doc.item}`, Number(doc.ts) || 0));
          read('answers').filter(mine).forEach((doc) => add(`${doc.case}:${doc.item}`, Number(doc.ts) || 0));
          read('homework').filter(mine).forEach((doc) => Object.keys(doc.payload || {}).forEach((key) => add(key, Number(doc.ts) || 0)));
          return { status: 'ok', items: Array.from(first.entries()).map(([key, ts]) => ({ key, ts })).sort((a, b) => a.ts - b.ts) };
        }
        // 情境猜谜抢答（规则同 cloudbase-pg.sql 的 ck_puzzle_open / close / live / guess）
        const puzzleNorm = (text) => String(text == null ? '' : text).replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase().slice(0, 40);
        if (name === 'ck_puzzle_open') {
          teacherOnly();
          const points = Number(params.p_points);
          if (!(points >= 1 && points <= 10)) throw new Error('每题加分应为 1—10');
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) throw new Error('课堂不存在');
          const answers = Array.from(new Set([params.p_answer, ...(params.p_accept || [])].map(puzzleNorm).filter(Boolean)));
          if (!puzzleNorm(params.p_answer)) throw new Error('谜底不正确');
          const day = today();
          const rows = read('puzzles');
          rows.forEach((row) => { if (String(row.classroom) === String(room.id) && row.is_open && !(row.day === day && row.pkey === params.p_key)) row.is_open = false; });
          let row = rows.find((item) => String(item.classroom) === String(room.id) && item.day === day && item.pkey === params.p_key);
          const fields = { is_open: true, label: String(params.p_label || '').slice(0, 40), surface: String(params.p_surface || '').slice(0, 240), answer: String(params.p_answer).slice(0, 40), answers };
          if (row) Object.assign(row, fields, row.winner_sid ? {} : { points });
          else rows.push(row = { id: Date.now(), course: room.course, classroom: room.id, day, pkey: params.p_key, points, opened_at: new Date().toISOString(), winner_sid: null, winner_name: null, won_at: null, ...fields });
          write('puzzles', rows);
          return { id: row.id, points: row.points, winner_sid: row.winner_sid, winner_name: row.winner_name, won_at: row.won_at };
        }
        if (name === 'ck_puzzle_close') {
          teacherOnly();
          const rows = read('puzzles');
          let n = 0;
          rows.forEach((row) => { if (String(row.classroom) === String(params.p_classroom) && row.is_open) { row.is_open = false; n += 1; } });
          write('puzzles', rows);
          return n;
        }
        if (name === 'ck_puzzle_live' || name === 'ck_puzzle_guess') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          const rows = read('puzzles');
          const guesses = read('puzzleguesses');
          const mineOf = (row) => guesses.filter((g) => String(g.round_id) === String(row.id) && g.sid === sid);
          if (name === 'ck_puzzle_live') {
            const row = rows.filter((item) => String(item.classroom) === String(params.p_classroom) && item.is_open && item.day === today()).pop();
            if (!row) return { status: 'none' };
            const mine = mineOf(row);
            return { status: 'open', round: row.id, label: row.label, surface: row.surface, points: row.points, tries: PUZZLE.tries, used: mine.length,
              won: Boolean(row.winner_sid), mine: row.winner_sid === sid ? 'won' : mine.some((g) => g.ok) ? 'right' : null };
          }
          const guess = puzzleNorm(params.p_text);
          if (!guess) return { status: 'empty' };
          const row = rows.find((item) => String(item.id) === String(params.p_round) && String(item.classroom) === String(params.p_classroom));
          if (!row || !row.is_open || row.day !== today()) return { status: 'closed' };
          const mine = mineOf(row);
          if (mine.some((g) => g.ok)) return { status: row.winner_sid === sid ? 'won' : 'right', points: row.points };
          if (mine.length >= PUZZLE.tries) return { status: 'used', used: mine.length, tries: PUZZLE.tries };
          const ok = row.answers.includes(guess);
          guesses.push({ id: `${Date.now()}-${guesses.length}`, round_id: row.id, classroom: row.classroom, sid, name: me.name, text: String(params.p_text || '').trim().slice(0, 40), ok, created_at: new Date().toISOString() });
          write('puzzleguesses', guesses);
          if (ok && !row.winner_sid) {
            Object.assign(row, { winner_sid: sid, winner_name: me.name, won_at: new Date().toISOString() });
            write('puzzles', rows);
            const bonus = read('bonus');
            const have = bonus.find((b) => String(b.classroom) === String(row.classroom) && b.day === row.day && b.kind === 'puzzle' && b.sid === sid);
            if (have) have.points = Math.min(have.points + row.points, PUZZLE.cap);
            else bonus.push({ id: `${Date.now()}-p`, course: row.course, classroom: row.classroom, day: row.day, kind: 'puzzle', sid, name: me.name, points: row.points, created_at: new Date().toISOString() });
            write('bonus', bonus);
            return { status: 'won', points: row.points };
          }
          return { status: ok ? 'right' : 'wrong', used: mine.length + 1, tries: PUZZLE.tries };
        }
        // 在线报到（规则同 cloudbase-pg.sql 的 ck_ping：本设备登录过这个课堂才记，20 秒内不重复写）
        if (name === 'ck_ping') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return false;
          const rows = read('presence');
          const sid = sidKey(me.sid);
          const row = rows.find((item) => String(item.classroom) === String(params.p_classroom) && item.sid === sid);
          const now = new Date().toISOString();
          if (!row) rows.push({ classroom: Number(params.p_classroom), sid, name: me.name, owner: uid, last_seen: now });
          else if (Date.now() - Date.parse(row.last_seen) > 20000) Object.assign(row, { name: me.name, owner: uid, last_seen: now });
          write('presence', rows);
          return true;
        }
        // 请假（规则同 cloudbase-pg.sql 的 ck_request_leave / ck_my_leaves / ck_cancel_leave）
        if (name === 'ck_request_leave' || name === 'ck_my_leaves' || name === 'ck_cancel_leave') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!me || !room || !room.class_id) return name === 'ck_my_leaves' ? [] : name === 'ck_cancel_leave' ? false : { status: 'login' };
          const sid = sidKey(me.sid);
          const rows = read('leaves');
          const mine = rows.filter((row) => String(row.class_id) === String(room.class_id) && row.sid === sid);
          const todayStr = today();
          if (name === 'ck_my_leaves') return mine.sort((a, b) => b.start_day.localeCompare(a.start_day) || b.id - a.id).slice(0, 30);
          if (name === 'ck_cancel_leave') {
            const target = mine.find((row) => String(row.id) === String(params.p_id) && row.end_day >= todayStr);
            if (!target) return false;
            write('leaves', rows.filter((row) => row !== target));
            return true;
          }
          const day = (text) => (/^\d{4}-\d{2}-\d{2}$/.test(String(text)) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? String(text) : null);
          const start = day(params.p_start), end = day(params.p_end);
          const offset = (text) => Math.round((Date.parse(`${text}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / 86400000);
          if (!start || !end || end < start || offset(start) < -7 || offset(end) > 60 || offset(end) - offset(start) > 30) return { status: 'bad_date' };
          const reason = String(params.p_reason || '').replace(/\s+/g, ' ').trim();
          if (reason.length < 2 || reason.length > 200) return { status: 'bad_reason' };
          if (mine.filter((row) => Date.now() - Date.parse(row.created_at) < 86400000).length >= 10) return { status: 'too_many' };
          const row = { id: nextId(rows), course: room.course, class_id: room.class_id, sid, name: me.name, start_day: start, end_day: end, reason, owner: uid, created_at: new Date().toISOString() };
          rows.push(row);
          write('leaves', rows);
          return { status: 'ok', id: row.id, start_day: start, end_day: end, reason };
        }
        if (name === 'ck_submit_answer') {
          const uid = await this.ensureAnonymous();
          const room = read('classrooms').find((row) => row.id === params.p_classroom && row.is_current && row.submissions_open);
          if (!room || room.chapter !== params.p_unit) throw new Error('new row violates row-level security policy (mock)');
          if (!memberOk(uid, params.p_classroom, params.p_sid, params.p_name)) throw Object.assign(new Error('请回首页重新登录（本课堂需核对身份）'), { code: '42501' });
          if (isStopped(stopsOf(params.p_classroom), params.p_key)) throw Object.assign(new Error('老师已停止递交这道题'), { code: '42501' });
          const rows = read('homework');
          const now = new Date().toISOString();
          let row = rows.filter((item) => item.classroom === params.p_classroom && item.sid === params.p_sid).sort((a, b) => a.id - b.id)[0];
          if (!row) {
            row = { id: Math.max(Date.now(), ...rows.map((item) => Number(item.id) + 1 || 0)), owner: uid, course: room.course, classroom: params.p_classroom,
              unit: params.p_unit, name: params.p_name, sid: params.p_sid, class_name: params.p_class, group_name: params.p_group,
              payload: {}, submitted: false, created_at: now };
            rows.push(row);
          }
          let accepted = false;
          if (!Object.prototype.hasOwnProperty.call(row.payload, params.p_key)) {
            row.payload[params.p_key] = { v: params.p_value, at: now };
            accepted = true;
            row.progress = Object.keys(row.payload).length;
            row.total = params.p_total;
            if (row.progress >= row.total && !row.submitted) { row.submitted = true; row.submitted_at = now; row.first_submitted_at = row.first_submitted_at || now; }
            row.ts = Date.now();
            row.updated_at = now;
          }
          write('homework', rows);
          return [{ accepted, progress: row.progress, keys: Object.keys(row.payload).sort() }];
        }
        if (name === 'ck_stopped_items') {
          await this.ensureAnonymous();
          return stopsOf(params.p_classroom);
        }
        // 修为榜（规则同 cloudbase-pg.sql 的 ck_realm_top：修为相同名次并列，并列第十的都列出、最多 15 行，修为 0 的不上榜，带修为值）
        if (name === 'ck_realm_top') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) return { status: 'login' };
          let sid = null;
          if (!localStorage.getItem(prefix + 'teacher')) {
            const me = myCheckin(await this.ensureAnonymous(), params.p_classroom);
            if (!me) return { status: 'login' };
            sid = sidKey(me.sid);
          }
          const rows = read('realms').filter((row) => row.course === room.course && Number(row.class_id) === (Number(room.class_id) || 0) && Number(row.points) > 0)
            .sort((a, b) => Number(b.points) - Number(a.points) || String(a.sid).localeCompare(String(b.sid)));
          const ranked = rows.map((row) => ({ ...row, rank: 1 + rows.filter((other) => Number(other.points) > Number(row.points)).length }));
          const mine = ranked.find((row) => row.sid === sid);
          return { status: 'ok', total: ranked.length, updated_at: ranked.reduce((at, row) => (row.updated_at > at ? row.updated_at : at), '') || null,
            top: ranked.filter((row, i) => row.rank <= 10 && i < 15).map((row) => ({ rank: row.rank, name: row.name, realm: row.realm, stage: row.stage, points: Number(row.points), me: sid !== null && row.sid === sid })),
            mine: mine ? { rank: mine.rank, realm: mine.realm, stage: mine.stage, points: Number(mine.points) } : null };
        }
        // 本人境界、祭出法宝（学生调用，须放在 teacherOnly 之前）
        if (name === 'ck_my_realm' || name === 'ck_send_gift' || name === 'ck_my_gifts') {
          const uid = await this.ensureAnonymous();
          const key = (sid) => String(sid == null ? '' : sid).replace(/\s+/g, '').toUpperCase();
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const me = myCheckin(uid, params.p_classroom);
          const realm = room && me && read('realms').find((row) => row.course === room.course && Number(row.class_id) === (Number(room.class_id) || 0)
            && row.sid === key(me.sid));
          if (name === 'ck_my_realm') {
            return realm ? [{ realm: realm.realm, stage: realm.stage, ratio: realm.max_points ? realm.points / realm.max_points : 0, updated_at: realm.updated_at }] : [];
          }
          const uses = read('giftuses');
          const mine = (row) => room && me && row.course === room.course && Number(row.class_id) === (Number(room.class_id) || 0) && row.sid === key(me.sid);
          if (name === 'ck_my_gifts') return uses.filter(mine).map((row) => row.gift).sort();
          const gift = GIFTS.find((item) => item.id === params.p_gift);
          if (!gift) throw new Error('没有这件法宝');
          if (!room || !room.is_current || !room.submissions_open || room.danmaku === 'off') throw Object.assign(new Error('老师未开放弹幕'), { code: '42501' });
          if (!me) throw Object.assign(new Error('请回首页重新登录'), { code: '42501' });
          if (!realm || realm.realm < gift.level) throw Object.assign(new Error('境界不够，还不能祭出这件法宝'), { code: '42501' });
          if (uses.some((row) => mine(row) && row.gift === gift.id)) throw Object.assign(new Error('这件法宝已经祭出过了，每件只能祭出一次'), { code: '42501' });
          const rows = read('danmaku');
          if (rows.some((row) => String(row.classroom) === String(room.id) && row.gift && key(row.sid) === key(me.sid) && isoDay(row.ts) === today())) {
            throw Object.assign(new Error('每次课只能祭出一件法宝'), { code: '42501' });
          }
          rows.push({ id: Math.random().toString(36).slice(2), owner: uid, course: room.course, classroom: room.id, name: me.name, sid: me.sid,
            text: gift.name, status: 'shown', gift: gift.id, ts: Date.now() });
          write('danmaku', rows);
          uses.push({ course: room.course, class_id: Number(room.class_id) || 0, sid: key(me.sid), gift: gift.id, classroom: room.id, used_at: new Date().toISOString() });
          write('giftuses', uses);
          return true;
        }
        // 题目解答（规则同 cloudbase-pg.sql 的 ck_my_explain：境界达到筑基、本人已在这个课堂递交这道题）
        if (name === 'ck_my_explain') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: 'login' };
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const sid = sidKey(me.sid);
          const realm = read('realms').find((row) => row.course === room.course && Number(row.class_id) === (Number(room.class_id) || 0) && row.sid === sid);
          if (!realm || Number(realm.realm) < 1) return { status: 'locked', realm: realm ? Number(realm.realm) : 0, need: 1 };
          const row = read('explainbank').find((e) => e.course === room.course && e.unit === room.chapter && e.key === params.p_key);
          if (!row) return { status: 'none' };
          const [no, item = ''] = String(params.p_key).split(':');
          const mine = (doc) => String(doc.classroom) === String(params.p_classroom) && sidKey(doc.sid) === sid;
          const done = read('homework').some((h) => mine(h) && Object.prototype.hasOwnProperty.call(h.payload || {}, params.p_key))
            || (item && read('choices').some((c) => mine(c) && c.case === no && (c.item === item || (item === 'match' && /^match-/.test(c.item)))))
            || (item && read('answers').some((a) => mine(a) && a.case === no && a.item === item));
          return done ? { status: 'ok', body: row.body } : { status: 'todo' };
        }
        // 修炼场（规则同 cloudbase-pg.sql 的 ck_practice_home / items / answer / essay）
        if (/^ck_practice_(home|items|answer|essay)$/.test(name)) {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: 'login' };
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const sid = sidKey(me.sid);
          const day = today();
          const bank = read('practicebank').filter((row) => row.course === room.course);
          const TEXT = ['essay', 'recall', 'feynman'];   // 写作类（申论、课后自修的主动回忆和讲给别人听）
          const SELF = ['recall', 'feynman', 'review'];   // 课后自修：在案例页作答，不进修炼场的列表
          const isFeyn = (b) => (b.body || {}).method === 'feynman';   // 费曼学习法专用题：只在 p_mode 'feynman' 里出
          const log = read('practice').filter((row) => row.course === room.course && row.sid === sid);
          const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
          const checked = new Set(read('checkins').map((row) => String(row.classroom)));
          const opensOf = (unit, delay = PRACTICE.delay) => {
            const days = read('classrooms').filter((row) => row.course === room.course && String(row.class_id || 0) === String(room.class_id || 0) && row.chapter === unit
              && (row.is_current || checked.has(String(row.id))))
              .map((row) => isoDay(Date.parse(row.created_at))).sort();
            return days.length ? addDays(days[0], delay) : null;
          };
          const isOpen = (unit, delay) => { const opens = opensOf(unit, delay); return Boolean(opens) && opens <= day; };
          const stat = (unit, item) => {
            const rows = log.filter((l) => l.unit === unit && l.item === item);
            return { earned: rows.some((l) => l.points > 0), today: rows.some((l) => l.day === day), tried: rows.length > 0, last: rows.reduce((m, l) => (l.day > m ? l.day : m), '') };
          };
          const have = log.filter((l) => l.day === day).reduce((sum, l) => sum + l.points, 0);
          if (name === 'ck_practice_home') {
            const units = [...new Set(bank.map((b) => b.unit))].map((unit) => {
              const rows = bank.filter((b) => b.unit === unit && !SELF.includes(b.kind));
              const tried = rows.map((b) => ({ b, s: stat(unit, b.item) })).filter((x) => x.s.tried);
              const opens = opensOf(unit);
              const plain = rows.filter((b) => !isFeyn(b));
              return { unit, title: rows[0].title, order: rows[0].ord, n: plain.length, fn: rows.length - plain.length, essays: rows.filter((b) => b.kind === 'essay').length, opens, open: Boolean(opens) && opens <= day,
                earned: tried.filter((x) => x.s.earned && !isFeyn(x.b)).length, fe: tried.filter((x) => x.s.earned && isFeyn(x.b)).length,
                tried: tried.filter((x) => !isFeyn(x.b)).length, due: tried.filter((x) => !x.s.earned && x.s.last < day && x.b.kind !== 'essay').length };
            }).sort((a, b) => a.order - b.order);
            return { status: 'ok', course: room.course, cap: PRACTICE.of(room.course).cap, delay: PRACTICE.delay, date: day, today: have, total: log.reduce((sum, l) => sum + l.points, 0), units };
          }
          if (name === 'ck_practice_items') {
            const mode = params.p_mode;
            const open = new Set(bank.map((b) => b.unit).filter((unit) => isOpen(unit)));
            if (!mode || (!['review', 'mix', 'feynman', 'write'].includes(mode) && !open.has(mode))) return { status: 'closed' };
            let rows = bank.filter((b) => open.has(b.unit) && !SELF.includes(b.kind)).map((b) => ({ b, s: stat(b.unit, b.item) }));
            if (mode === 'review') rows = rows.filter((x) => x.b.kind !== 'essay' && !x.s.earned && x.s.tried && x.s.last < day).slice(0, 40);
            else if (mode === 'mix' || mode === 'feynman') rows = rows.filter((x) => x.b.kind !== 'essay' && isFeyn(x.b) === (mode === 'feynman'))
              .map((x) => ({ ...x, r: Math.random() })).sort((a, b) => (a.s.earned - b.s.earned) || (a.r - b.r)).slice(0, 12);
            else if (mode === 'write') rows = rows.filter((x) => x.b.kind === 'essay' || x.b.kind === 'transfer');
            else rows = rows.filter((x) => x.b.unit === mode && !isFeyn(x.b));
            return { status: 'ok', mode, items: rows.map(({ b, s }) => ({ unit: b.unit, item: b.item, title: b.title, kind: b.kind, body: b.body, points: b.points, earned: s.earned, today: s.today, tried: s.tried })) };
          }
          const essay = name === 'ck_practice_essay';
          const row = bank.find((b) => b.unit === params.p_unit && b.item === params.p_item);
          if (!row || TEXT.includes(row.kind) !== essay) return { status: 'missing' };
          if (!isOpen(row.unit, row.delay == null ? PRACTICE.delay : row.delay)) return { status: 'closed' };
          if (essay) {
            const length = String(params.p_text || '').replace(/\s/g, '').length;
            const min = Number(row.answer.min) || PRACTICE.essayMin;
            if (length < min) return { status: 'short', min, length };
          }
          if (log.filter((l) => l.day === day).length >= 400) return { status: 'busy' };
          const s = stat(row.unit, row.item);
          const correct = essay || row.answer.ok.some((value) => JSON.stringify(value) === JSON.stringify(params.p_answer));
          let points = 0;
          let reason = null;
          if (correct && s.earned) reason = 'earned';
          else if (correct && !essay && s.today) reason = 'today';
          else if (correct) { points = Math.max(0, Math.min(row.points, PRACTICE.of(room.course).cap - have)); if (!points) reason = 'cap'; }
          const all = read('practice');
          all.push({ id: nextId(all), course: room.course, class_id: room.class_id, sid, name: me.name, unit: row.unit, item: row.item, day,
            answer: essay ? { text: String(params.p_text).slice(0, 6000) } : params.p_answer, correct, points, created_at: new Date().toISOString() });
          write('practice', all);
          return essay ? { status: 'ok', reveal: row.reveal, points, reason, today: have + points, cap: PRACTICE.of(room.course).cap }
            : { status: 'ok', correct, answer: row.answer.ok, reveal: row.reveal, points, reason, today: have + points, cap: PRACTICE.of(room.course).cap };
        }
        teacherOnly();
        // 学生版测试页：教师以“韩天尊”的名义发弹幕、祭出法宝（规则同 cloudbase-pg.sql 的 ck_test_danmaku；owner 用本机匿名身份，便于“我发过的弹幕”）
        if (name === 'ck_test_danmaku') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom) && row.is_current && row.submissions_open && row.danmaku !== 'off');
          if (!room) throw Object.assign(new Error('老师未开放弹幕'), { code: '42501' });
          const rows = read('danmaku');
          const base = { id: Math.random().toString(36).slice(2), owner: await this.ensureAnonymous(), course: room.course, classroom: room.id, name: '韩天尊', sid: 'HTZ0001', ts: Date.now() };
          if (params.p_gift) {
            const gift = GIFTS.find((item) => item.id === params.p_gift);
            if (!gift) throw new Error('没有这件法宝');
            rows.push({ ...base, text: gift.name, status: 'shown', gift: gift.id });
          } else {
            const text = String(params.p_text || '').trim();
            if (!text || text.length > 80) throw new Error('弹幕应为 1—80 字');
            rows.push({ ...base, text, status: 'new', ...(params.p_color ? { color: params.p_color } : {}) });
          }
          write('danmaku', rows);
          return true;
        }
        if (name === 'ck_stop_item') {
          const item = String(params.p_item || '');
          if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,46}[*]?$/.test(item)) throw new Error('题目编号不正确');
          if (!read('classrooms').some((row) => String(row.id) === String(params.p_classroom))) throw new Error('课堂不存在');
          const rows = read('stops').filter((row) => !(String(row.classroom) === String(params.p_classroom) && row.item === item));
          if (params.p_stop) rows.push({ classroom: params.p_classroom, item, created_at: new Date().toISOString() });
          write('stops', rows);
          return stopsOf(params.p_classroom);
        }
        const sameGroup = (row, course, classId) => row.course === course && String(row.class_id || '') === String(classId || '');
        if (name === 'ck_publish') {
          const rows = read('classrooms');
          rows.forEach((row) => { if (sameGroup(row, params.p_course, params.p_class)) row.is_current = false; });
          const now = new Date().toISOString();
          const room = { id: Math.max(Date.now(), ...rows.map((row) => Number(row.id) + 1 || 0)), course: params.p_course, code: newCode(), name: String(params.p_name).trim(),
            chapter: params.p_chapter, is_current: true, submissions_open: true, danmaku: 'off', class_id: params.p_class || null, created_at: now, updated_at: now };
          rows.push(room);
          write('classrooms', rows);
          return { ...room };
        }
        if (name === 'ck_set_current') {
          return updateRoom(params.p_classroom, (room, rows) => {
            if (params.p_current) {
              rows.forEach((row) => { if (sameGroup(row, room.course, room.class_id)) row.is_current = false; });
              room.submissions_open = true;
            }
            room.is_current = Boolean(params.p_current);
          });
        }
        if (name === 'ck_create_class') {
          const rows = read('classes');
          const nameText = String(params.p_name || '').trim();
          if (!nameText) throw new Error('请填写班级名称');
          if (rows.some((row) => row.course === params.p_course && row.name === nameText)) throw new Error('duplicate key value violates unique constraint (mock)');
          const now = new Date().toISOString();
          const row = { id: Math.max(Date.now(), ...rows.map((item) => Number(item.id) + 1 || 0)), course: params.p_course, name: nameText, roster: [], created_at: now, updated_at: now };
          rows.push(row);
          write('classes', rows);
          return { ...row };
        }
        const updateClass = (id, change) => {
          const rows = read('classes');
          const row = rows.find((item) => String(item.id) === String(id));
          if (!row) throw new Error('班级不存在');
          change(row);
          row.updated_at = new Date().toISOString();
          write('classes', rows);
          return { ...row };
        };
        if (name === 'ck_rename_class') return updateClass(params.p_class, (row) => { row.name = String(params.p_name || '').trim(); });
        // 班级上课范围（规则同 cloudbase-pg.sql 的 ck_set_class_units：空＝全部）
        if (name === 'ck_set_class_units') {
          const list = Array.from(new Set(params.p_units || [])).sort();
          if (list.length > 60 || list.some((u) => !/^(ch|case)\d{2}$/.test(u))) throw new Error('上课范围不正确');
          return updateClass(params.p_class, (row) => { row.units = list.length ? list : null; });
        }
        if (name === 'ck_save_roster') {
          return updateClass(params.p_class, (row) => {
            const fresh = new Set((params.p_roster || []).map((person) => sidKey(person.sid)));
            const extras = (row.roster || []).filter((person) => person.extra && !fresh.has(sidKey(person.sid)));
            row.roster = (params.p_roster || []).concat(extras);
            row.roster_updated_at = new Date().toISOString();
          });
        }
        if (name === 'ck_move_classroom') {
          return updateRoom(params.p_classroom, (room, rows) => {
            if (room.is_current && rows.some((row) => row.id !== room.id && row.is_current && sameGroup(row, room.course, params.p_class))) {
              throw new Error('目标班级已有当前课堂，请先停止其中一个');
            }
            room.class_id = params.p_class;
          });
        }
        if (name === 'ck_delete_class') {
          const ids = read('classrooms').filter((row) => String(row.class_id || '') === String(params.p_class)).map((row) => row.id);
          ['checkins', 'choices', 'answers', 'danmaku', 'homework', 'bonus', 'stops', 'presence', 'puzzles', 'puzzleguesses'].forEach((kind) => write(kind, read(kind).filter((row) => !ids.includes(row.classroom))));
          write('classrooms', read('classrooms').filter((row) => !ids.includes(row.id)));
          write('classes', read('classes').filter((row) => String(row.id) !== String(params.p_class)));
          ['pins', 'devices', 'requests', 'seclog', 'giftuses'].forEach((kind) => write(kind, read(kind).filter((row) => String(row.class_id) !== String(params.p_class))));
          return ids.length;
        }
        if (name === 'ck_set_open') return updateRoom(params.p_classroom, (room) => { room.submissions_open = Boolean(params.p_open); });
        if (name === 'ck_set_danmaku') return updateRoom(params.p_classroom, (room) => { room.danmaku = params.p_mode; });
        if (name === 'ck_set_danmaku_anon') return updateRoom(params.p_classroom, (room) => { room.danmaku_anon = Boolean(params.p_anon); });
        // 学生查看、撤回自己发过的弹幕：只限本人（owner）；撤回只记下时间，记录保留
        if (name === 'ck_my_danmaku') {
          const uid = await this.ensureAnonymous();
          return read('danmaku').filter((row) => row.owner === uid && String(row.classroom) === String(params.p_classroom) && !row.withdrawn_at)
            .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60)
            .map((row) => ({ id: row.id, text: row.text, status: row.status, ts: row.ts, liked: Boolean(row.liked_at) }));
        }
        // 点名册编号：本人这次登录在本课堂的学号，在班级点名册里排第几（从 1 起）；不在点名册里返回 null
        if (name === 'ck_my_roster_no') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const klass = room && read('classes').find((row) => String(row.id) === String(room.class_id));
          if (!me || !klass) return null;
          const index = (klass.roster || []).findIndex((person) => sidKey(person.sid) === sidKey(me.sid));
          return index >= 0 ? index + 1 : null;
        }
        // 匿名建议：只核对进过这个课堂，存下的行里没有提交者
        if (name === 'ck_submit_feedback') {
          const uid = await this.ensureAnonymous();
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room || !myCheckin(uid, params.p_classroom)) {
            throw Object.assign(new Error('进入课堂后才能提交建议'), { code: '42501' });
          }
          const text = String(params.p_text || '').trim();
          if (!/^\d{2}$/.test(String(params.p_case || '')) || text.length < 2 || text.length > 500) throw new Error('建议请写 2—500 字');
          const rows = read('feedback');
          rows.push({ id: Math.max(0, ...rows.map((row) => Number(row.id) || 0)) + 1, course: room.course, classroom: room.id, unit: room.chapter,
            case_no: params.p_case, text, created_on: today() });
          write('feedback', rows);
          return true;
        }
        // 修为境界：教师结算后整班替换；学生只能查本人（按本人这次登录在本课堂的学号）；法宝按境界和“每次课一件”核对
        if (name === 'ck_save_realms') {
          teacherOnly();
          const key = (sid) => String(sid == null ? '' : sid).replace(/\s+/g, '').toUpperCase();
          const classId = Number(params.p_class) || 0;
          const keep = read('realms').filter((row) => !(row.course === params.p_course && Number(row.class_id) === classId));
          const at = new Date().toISOString();
          const fresh = (params.p_rows || []).map((row, i) => ({ id: `${Date.now()}-${i}`, course: params.p_course, class_id: classId, sid: key(row.sid),
            name: row.name, points: row.points, max_points: row.max, realm: row.realm, stage: row.stage, detail: row.detail || {}, updated_at: at }));
          write('realms', keep.concat(fresh));
          return fresh.length;
        }
        // 登录安全（教师）：重置口令（连同已登录设备）、解锁、处理班外加入申请、更换课堂码、口令状态、教师登录记录
        if (name === 'ck_reset_pin' || name === 'ck_unlock_pin') {
          teacherOnly();
          const sid = sidKey(params.p_sid);
          const klass = read('classes').find((row) => String(row.id) === String(params.p_class));
          if (!klass) throw new Error('班级不存在');
          const same = (row) => String(row.class_id) === String(params.p_class) && row.sid === sid;
          if (name === 'ck_reset_pin') {
            write('pins', read('pins').filter((row) => !same(row)));
            write('devices', read('devices').filter((row) => !same(row)));
          } else {
            write('pins', read('pins').map((row) => (same(row) ? { ...row, fails: 0, locks: 0, locked_until: null } : row)));
          }
          secLog(name === 'ck_reset_pin' ? 'pin_reset' : 'unlock', { course: klass.course, class_id: klass.id, sid, owner: 'teacher' });
          return true;
        }
        if (name === 'ck_decide_request') {
          teacherOnly();
          const reqs = read('requests');
          const req = reqs.find((row) => String(row.id) === String(params.p_id));
          if (!req) throw new Error('申请不存在');
          const classes = read('classes');
          const klass = classes.find((row) => String(row.id) === String(req.class_id));
          if (klass) {
            const roster = klass.roster || [];
            if (params.p_allow) {
              if (!roster.some((person) => sidKey(person.sid) === req.sid)) roster.push({ sid: req.sid, name: req.name, class: req.class_name || '', extra: true });
              klass.roster = roster;
            } else {
              klass.roster = roster.filter((person) => !(sidKey(person.sid) === req.sid && person.extra));
              write('devices', read('devices').filter((row) => !(String(row.class_id) === String(req.class_id) && row.sid === req.sid)));
            }
            write('classes', classes);
          }
          Object.assign(req, { status: params.p_allow ? 'approved' : 'rejected', decided_at: new Date().toISOString() });
          write('requests', reqs);
          secLog(params.p_allow ? 'approve' : 'reject', { course: req.course, class_id: req.class_id, sid: req.sid, name: req.name, owner: 'teacher' });
          return params.p_allow ? 'approved' : 'rejected';
        }
        if (name === 'ck_rotate_code') {
          teacherOnly();
          const room = updateRoom(params.p_classroom, (row) => { row.code = newCode(); });
          secLog('rotate', { course: room.course, class_id: room.class_id, classroom: room.id, owner: 'teacher' });
          return room;
        }
        if (name === 'ck_pin_status') {
          teacherOnly();
          const devices = read('devices');
          return read('pins').filter((row) => String(row.class_id) === String(params.p_class)).map((row) => {
            const mine = devices.filter((d) => String(d.class_id) === String(row.class_id) && d.sid === row.sid);
            return { sid: row.sid, has_pin: Boolean(row.pin_hash), set_at: row.set_at, fails: row.fails || 0, locks: row.locks || 0, locked_until: row.locked_until,
              devices: mine.length, last_at: mine.map((d) => d.last_at).sort().pop() || null };
          });
        }
        if (name === 'ck_log_teacher_login') {
          teacherOnly();
          secLog('teacher_login', { owner: 'teacher', detail: String(params.p_agent || '').slice(0, 200) });
          return true;
        }
        // 猜词游戏第一名加修为：整份替换本课堂今天的名单（空名单＝撤销），只收本班点名册上的学号
        // 猜词游戏抽人记录（规则同 cloudbase-pg.sql 的 ck_record_draws）
        if (name === 'ck_record_draws') {
          teacherOnly();
          const people = params.p_people || [];
          if (!Array.isArray(people) || people.length > 10) throw new Error('一次最多记录 10 人');
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room || !room.class_id) throw new Error('课堂不存在或不属于任何班级');
          const rows = read('draws');
          const fresh = people.filter((person) => person && person.sid).map((person, i) => ({ id: `${Date.now()}-${i}`, course: room.course, class_id: room.class_id,
            classroom: room.id, sid: sidKey(person.sid), name: String(person.name || '').slice(0, 40), kind: 'wordgame', drawn_at: new Date().toISOString() }));
          write('draws', rows.concat(fresh));
          return fresh.length;
        }
        // 题目解答同步（规则同 cloudbase-pg.sql 的 ck_explain_load / versions）
        if (name === 'ck_explain_load') {
          const rows = read('explainbank').filter((e) => !(e.course === params.p_course && e.unit === params.p_unit));
          (params.p_items || []).forEach((it) => rows.push({ course: params.p_course, unit: params.p_unit, key: it.key, body: it.body, version: params.p_version }));
          write('explainbank', rows);
          return (params.p_items || []).length;
        }
        if (name === 'ck_explain_versions') {
          const out = {};
          read('explainbank').filter((e) => e.course === params.p_course).forEach((e) => { out[e.unit] = e.version; });
          return out;
        }
        // 修炼场题库同步与汇总（规则同 cloudbase-pg.sql 的 ck_practice_load / versions / totals）
        if (name === 'ck_practice_load') {
          const rows = read('practicebank').filter((b) => !(b.course === params.p_course && b.unit === params.p_unit));
          (params.p_items || []).forEach((it, i) => rows.push({ course: params.p_course, unit: params.p_unit, item: it.id, title: params.p_title, ord: params.p_order, seq: i + 1,
            kind: it.kind, body: it.body, answer: it.answer, reveal: it.reveal, points: it.points, version: params.p_version, delay: it.delay == null ? PRACTICE.delay : it.delay }));
          write('practicebank', rows);
          return (params.p_items || []).length;
        }
        if (name === 'ck_practice_versions') {
          const out = {};
          read('practicebank').filter((b) => b.course === params.p_course).forEach((b) => { out[b.unit] = b.version; });
          return out;
        }
        if (name === 'ck_practice_totals') {
          const by = new Map();
          read('practice').filter((l) => l.course === params.p_course && String(l.class_id || 0) === String(params.p_class || 0)).forEach((l) => {
            const t = by.get(l.sid) || { sid: l.sid, name: l.name, points: 0, answered: 0, correct: 0, days: new Set(), last: '' };
            t.points += l.points; t.answered += 1; t.correct += l.correct ? 1 : 0; t.days.add(l.day); if (l.day > t.last) t.last = l.day;
            by.set(l.sid, t);
          });
          return [...by.values()].map((t) => ({ ...t, days: t.days.size })).sort((a, b) => b.points - a.points || a.sid.localeCompare(b.sid));
        }
        // PK 对决胜者加修为（规则同 cloudbase-pg.sql 的 ck_set_pk_winners：整份替换今天的名单，只收本班点名册上的学号）
        if (name === 'ck_set_pk_winners') {
          teacherOnly();
          const points = Number(params.p_points);
          if (!(points >= 1 && points <= 10)) throw new Error('每人加分应为 1—10');
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) throw new Error('课堂不存在');
          const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = new Map(((klass && klass.roster) || []).map((person) => [sidKey(person.sid), person]));
          const day = today();
          const keep = read('bonus').filter((row) => !(String(row.classroom) === String(room.id) && row.day === day && row.kind === 'pk'));
          const seen = new Set();
          const fresh = (params.p_people || []).map((person) => roster.get(sidKey(person.sid))).filter((person) => person && !seen.has(sidKey(person.sid)) && seen.add(sidKey(person.sid)))
            .map((person, i) => ({ id: `${Date.now()}-pk${i}`, course: room.course, classroom: room.id, day, kind: 'pk', sid: sidKey(person.sid), name: person.name, points, created_at: new Date().toISOString() }));
          write('bonus', keep.concat(fresh));
          return fresh.length;
        }
        if (name === 'ck_set_wordgame_winners') {
          teacherOnly();
          const points = Number(params.p_points);
          if (!(points >= 1 && points <= 20)) throw new Error('每人加分应为 1—20');
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) throw new Error('课堂不存在');
          const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = new Map(((klass && klass.roster) || []).map((person) => [sidKey(person.sid), person]));
          const day = today();
          const keep = read('bonus').filter((row) => !(String(row.classroom) === String(room.id) && row.day === day && row.kind === 'wordgame'));
          const seen = new Set();
          const fresh = (params.p_people || []).map((person) => roster.get(sidKey(person.sid))).filter((person) => person && !seen.has(sidKey(person.sid)) && seen.add(sidKey(person.sid)))
            .map((person, i) => ({ id: `${Date.now()}-${i}`, course: room.course, classroom: room.id, day, kind: 'wordgame', sid: sidKey(person.sid), name: person.name, points, created_at: new Date().toISOString() }));
          write('bonus', keep.concat(fresh));
          return fresh.length;
        }
        if (name === 'ck_like_danmaku') {
          teacherOnly();
          const rows = read('danmaku');
          const row = rows.find((item) => String(item.id) === String(params.p_id));
          if (!row) throw new Error('这条弹幕已经不在了');
          if (row.gift) throw new Error('法宝不能点赞');
          const used = () => rows.filter((item) => String(item.classroom) === String(row.classroom) && item.liked_at && isoDay(Date.parse(item.liked_at)) === today()).length;
          if (params.p_like && !row.liked_at) {
            if (used() >= LIKE.limit) throw Object.assign(new Error(`本堂课的点赞已达上限（${LIKE.limit} 次）`), { code: '42501' });
            row.liked_at = new Date().toISOString();
          } else if (!params.p_like) {
            row.liked_at = null;
          }
          write('danmaku', rows);
          return [{ liked: Boolean(row.liked_at), used: used(), lim: LIKE.limit }];
        }
        if (name === 'ck_withdraw_my_danmaku') {
          const uid = await this.ensureAnonymous();
          const rows = read('danmaku');
          const row = rows.find((item) => String(item.id) === String(params.p_id) && item.owner === uid && !item.withdrawn_at);
          if (row) { row.withdrawn_at = new Date().toISOString(); write('danmaku', rows); }
          return Boolean(row);
        }
        if (name === 'ck_danmaku_status') {
          const rows = read('danmaku');
          const row = rows.find((item) => String(item.id) === String(params.p_id));
          if (row) { row.status = params.p_status; write('danmaku', rows); }
          return row ? { ...row } : null;
        }
        throw new Error('未知的后台函数：' + name);
      },
      watch(kind, where, onChange) {
        const listener = { kind, fire: () => onChange(read(kind).filter((doc) => matches(doc, where))) };
        listeners.add(listener);
        listener.fire();
        return () => listeners.delete(listener);
      },
      async fetchAll(kind, where, options = {}) {
        let rows = read(kind).filter((doc) => matches(doc, where));
        if (options.since) rows = rows.filter((doc) => String(doc[options.since[0]] || '') > String(options.since[1]));
        return options.limit ? rows.slice(-options.limit).reverse() : rows;
      },
      async removeAll(kind, where) { write(kind, read(kind).filter((doc) => !matches(doc, where))); },
    };
  }

  window.ClassLive = window.ClassLive || {};
  Object.assign(window.ClassLive, {
    attached: false,
    today,
    COLLECTIONS,
    REALMS,
    STAGES,
    GIFTS,
    COLORS,
    colorFor,
    LIKE,
    WORDGAME,
    PUZZLE,
    PK,
    PRACTICE,
    LEAVE,
    realmOf,
    isClosedError,
    isDuplicateError,
    isStopped,
    stopList,
    normalizeCode,
    unitOf,
    create(config) {
      if (!config || config.provider === 'off') return null;
      if (config.provider === 'cloudbase') return cloudbaseProvider(config);
      if (config.provider === 'mock') return mockProvider(config);
      throw new Error('未知的课堂后台：' + config.provider);
    },
    // 投屏页选当前课堂：一门课的几个班级可能同时有当前课堂。优先老师在工作台选的班级（地址 ?class= 或本机记住的），
    // 再优先与本页章节（案例）相同的；都对不上时取第一个（页面会提示“不是本章”）
    pickRoom(rooms, course, unit) {
      const current = rooms.filter((row) => row.is_current);
      if (!current.length) return null;
      let wanted = new URLSearchParams(location.search).get('class');
      if (!wanted) { try { wanted = localStorage.getItem(`teacher:class:${course}`); } catch (error) { wanted = null; } }
      const mine = wanted ? current.filter((row) => String(row.class_id || '') === String(wanted)) : [];
      const pool = mine.length ? mine : current;
      return pool.find((row) => row.chapter === unit) || pool[0];
    },
    // 每人每项只保留最新一条（按时间）
    latest(docs, keyOf) {
      const map = new Map();
      docs.forEach((doc) => {
        const key = keyOf(doc);
        const current = map.get(key);
        if (!current || (doc.ts || 0) >= (current.ts || 0)) map.set(key, doc);
      });
      return Array.from(map.values());
    },
  });
})();
