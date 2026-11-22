/* 课堂后台适配层
 * provider:
 *   cloudbase —— 腾讯云开发（上海）PostgreSQL 模式；学生匿名登录，教师账号密码登录
 *   mock      —— 本机测试用，数据存在浏览器 localStorage，只允许在 localhost 使用
 *   off       —— 不连接后台（页面照常可用，选择与作答只保存在本机）
 * 表：加入 ck_checkins、选择 ck_choices、作答 ck_answers（只增不改，教师端取每人最新一条）、课堂 ck_classrooms
 * 函数：ck_join（学生凭课堂码进入）、ck_publish / ck_set_current / ck_set_open（教师管理课堂）、
 *       ck_submit_answer（概念学习课程逐题“递交”，每题只收第一次）、ck_my_danmaku / ck_withdraw_my_danmaku（学生查看、撤回自己的弹幕，记录保留）、
 *       ck_submit_feedback（每个案例最后的匿名建议：建议本身不存提交者，只记日期；2026-11-05 起提交者另记，老师读不到，只供采纳加修为）、
 *       ck_adopt_feedback（教师点赞采纳建议，给作者加 5／10／20 修为）、ck_my_notices（作者下次打开页面时取“被采纳”通知）、
 *       ck_reply_feedback／ck_feedback_replies_for／ck_delete_feedback_reply（教师回复建议，2026-11-19）、ck_my_feedback_threads／ck_answer_feedback／ck_seen_feedback_replies（作者看回复、回复老师、点关闭）、ck_my_roster_no（本人在点名册里的编号）、
 *       ck_create_class / ck_rename_class / ck_set_class_units（班级上课范围）/ ck_save_roster / ck_move_classroom / ck_delete_class（教师管理班级与点名册）、
 *       ck_delete_danmaku（教师删除弹幕：撤回已结算的修为并记下提醒）/ ck_my_danmaku_removed（学生页取“无效弹幕被删除”的提醒）
 *       ck_save_realms（教师结算修为境界）/ ck_my_realm（本人的境界）/ ck_realm_top（学生面板“修为榜”：本班前十与本人名次，带修为）/ ck_my_lingen（学生面板“灵根八相”：本人八项与全班平均）/ ck_send_gift（按境界祭出弹幕法宝，每件一次）/ ck_my_gifts（本人已祭出的法宝）、
 *       ck_stop_item（教师在投屏页停止或恢复某道题的递交）/ ck_stopped_items（本课堂已停止递交的题号）
 *       ck_request_leave / ck_my_leaves / ck_cancel_leave（学生请假、查看、撤销；教师读 ck_leaves）
 *       ck_ping（学生页、云间灵田页在前台时每 30 秒报一次在线，切走时补报一次；教师读 ck_presence，工作台加入名单显示小绿灯）
 *       ck_record_draws（教师在投屏页记下猜词游戏抽中的同学；教师读、删 ck_draws）
 *       ck_my_submissions（学生读本人在这个课堂已经递交到后台的题目，学生页最下方“本堂作业递交情况”）
 *       ck_puzzle_open / ck_puzzle_close（教师在投屏页“情境猜谜”开始、结束一轮抢答；教师读、删 ck_puzzle_rounds、ck_puzzle_guesses）
 *       ck_puzzle_live / ck_puzzle_guess（学生面板看正在进行的一轮、抢答；后台核对谜底，第一个猜中的自动加修为）
 *       ck_set_pk_winners（教师在 PK 大屏给今天各局的胜者加修为）
 *       ck_tl_start / ck_tl_ask / ck_tl_board / ck_tl_reveal / ck_tl_finish / ck_tl_game（教师在 PK 大屏“时间轴排排站·全班分队”分组、出题、揭晓、结束）、
 *       ck_tl_live / ck_tl_answer（学生在自己页面的对话框里看题、选位置）
 *       ck_join_apply（不在点名册上的同学自己点“申请加入”）、ck_pin_forgot / ck_decide_pin_request（忘记口令申请、教师同意或拒绝；教师读 ck_pin_requests）
 *       ck_set_mood / ck_my_mood（学生选“这堂课感觉怎么样”：笑脸或不高兴的脸；点笑脸每天 +5 一次）、ck_mood_stats（教师只看人数）
 *       ck_set_deadline / ck_room_deadline（期中考查作业的递交截止时间：教师设置，学生页读取；过了截止时间 ck_submit_answer 不再收）
 *       ck_exam_progress（期中考查作业：本班已递交人数／点名册人数，学生页倒计时旁显示，2026-11-12）
 *       ck_poll_open / ck_poll_close（投屏页课堂工具“投票器”发起、结束投票；教师读 ck_polls、ck_poll_votes）、ck_poll_live / ck_poll_vote（学生页弹出投票、投票）
 *       ck_set_class_schedule（班级的上课时间、教室，工作台“课表”）、ck_save_teacher_setting（课表设置：学期、第 1 周、各节时间；校历 calendar）、ck_save_event（“日程”里的安排；教师读、删 ck_teacher_events）
 * 修为境界：ClassLive.REALMS / GIFTS / realmOf，学生页、投屏弹幕、教师工作台共用（规则见工作台“修为境界”与学生面板“修为说明”）
 */
(function () {
  'use strict';
  const COLLECTIONS = { checkins: 'ck_checkins', choices: 'ck_choices', answers: 'ck_answers', classrooms: 'ck_classrooms', danmaku: 'ck_danmaku',
    homework: 'ck_homework', classes: 'ck_classes', feedback: 'ck_feedback', realms: 'ck_realms',
    requests: 'ck_join_requests', seclog: 'ck_security_log', bonus: 'ck_bonus', stops: 'ck_stops', giftuses: 'ck_gift_uses', leaves: 'ck_leaves', presence: 'ck_presence', draws: 'ck_draws',
    puzzles: 'ck_puzzle_rounds', puzzleguesses: 'ck_puzzle_guesses', puzzlegames: 'ck_puzzle_games', practice: 'ck_practice_log', pinreqs: 'ck_pin_requests', examscores: 'ck_exam_scores',
    debatemembers: 'ck_debate_members', debateposts: 'ck_debate_posts', debatelikes: 'ck_debate_likes', debatematches: 'ck_debate_matches', debatesays: 'ck_debate_says', bizgames: 'ck_biz_games', bizvotes: 'ck_biz_votes',
    teachersettings: 'ck_teacher_settings', events: 'ck_teacher_events', polls: 'ck_polls', pollvotes: 'ck_poll_votes',
    sectmembers: 'ck_sect_members', visits: 'ck_visits', tlgames: 'ck_tl_games', tlanswers: 'ck_tl_answers' };
  // 没有 id 列的表（主键是几列合起来的）：分页读取时按这一列排序。2026-10-28 查出工作台读在线状态一直按 id 排序而报错，
  // 错误又被当成“表还没建”忽略，所以小绿灯和“现在在线”人数一直不显示
  const ORDER_BY = { presence: 'sid', stops: 'item', giftuses: 'sid', teachersettings: 'key', pollvotes: 'sid', debatematches: 'case_no' };

  // ---------- 修为境界（两门课共用） ----------
  // 满分＝每次课 100 修为 × 全部课次；境界按修为占满分的比例划分，每个境界再分初期、中期、后期；元婴在后期之后还有一档“巅峰”（称号“元后巅峰”，见 PEAK_MIN）。
  // 称号材质由低到高：素石 → 青玉 → 金丹 → 紫霄（发光、星芒）→ 神光（黑曜底、七彩流光），学生面板、投屏、工作台共用（样式类 is-r0—is-r4）
  const REALMS = [
    { level: 0, name: '炼气', look: '素石', min: 0 },
    { level: 1, name: '筑基', look: '青玉', min: 0.15 },
    { level: 2, name: '结丹', look: '金丹', min: 0.35 },
    { level: 3, name: '元婴', look: '紫霄', min: 0.65 },
    { level: 4, name: '化神', look: '神光', min: 0.90 },   // 2026-10-22 用户要求化神 90%；2026-10-28 用户：“修为分到65%可以进阶元婴吧”
  ];
  const STAGES = ['初期', '中期', '后期', '巅峰'];
  // 巅峰一档（2026-11-21）。用户：“按照现在的情况，元婴境界的进度条可能需要调整一下了，在化神之前再增加一档元后巅峰，没到化神就一直这个档位，
  //   同时不要改动现有学生的等级。”“巅峰从100% 起”——化神门槛提高以后（习经 135%、政经 155%），元婴的初期／中期／后期仍按 65%—90% 三等分，
  //   81.7% 以上直到化神原来一直是“后期”；现在修为到全学期满分的 100% 起单独算“巅峰”（stage 3，称号“元后巅峰”），一直到突破化神。
  //   初期／中期／后期的算法不动，所以现有同学的境界和小境界都不变（定这条规则时没有同学到 100%）。
  //   只有下一境界的门槛高于 PEAK_MIN 的课程才有这一档；与 cloudbase-pg.sql 的 ck_realm_level(points, max, course) 一致
  const PEAK = 3;
  const PEAK_MIN = { 3: 1 };              // 境界 level → 巅峰从占满分多少起
  const PEAK_TITLE = { 3: '元后巅峰' };    // 用户定的叫法（元婴后期巅峰）
  // 称号：元婴初期／中期／后期、元后巅峰
  const stageTitle = (level, stage) => {
    const realm = REALMS[level] || REALMS[0];
    const s = Math.max(0, Math.min(STAGES.length - 1, Math.floor(Number(stage) || 0)));
    return s === PEAK ? (PEAK_TITLE[realm.level] || `${realm.name}${STAGES[PEAK]}`) : `${realm.name}${STAGES[s]}`;
  };
  // 按课程改门槛（2026-11-11 习经用户：“按照现在两个班第一名的修为境界，达到化神好像有点容易了，你看下后面还有7周，是不是把化神需要的分数再往上调一调，
  //   尽量在倒数第二周的时候有1-2名同学达到化神境界。”——按线上数据外推（修炼场每天约 7—8、额外奖励），第 15 周末前几名约 1300—1450／满分 1000，
  //   化神定为 140%；政经不变）。比例可以超过 100%：修炼场和额外奖励不计入满分。与 cloudbase-pg.sql 的 ck_realm_level(points, max, course) 一致
  // 2026-11-15 用户：“现在还有6次课，你按照现在的进度，大概在倒数第2周能够有1-2位同学达到化神境界，你看下要升上化神的分数应该加到多少？”——
  //   按 11-15 线上数据重算（课堂每次约 70—80，修炼场按题库还能得的分、额外奖励按近两周、云间灵田服丹每周约 9）：第 15 周末（12-20）
  //   政经前三名约 153%—160%、习经前两名约 134%—136%（修炼场题库快做完了，11-11 按每天 7—8 外推偏高）。
  //   政经化神 90% → 155%，习经 140% → 135%；学期末大约各有 3 位同学到化神。
  const REALM_MIN = { 'xjp-economy': { 4: 1.35 }, 'political-economy': { 4: 1.55 } };
  function realmsFor(course) {
    const over = REALM_MIN[course] || {};
    return REALMS.map((realm) => (over[realm.level] != null ? { ...realm, min: over[realm.level] } : realm));
  }
  // 宗门（2026-11-05 用户：“设置四个不同的宗门，名称你来定，不要跟凡人里面的相同……达到筑基期的同学可以让他们选择加入不同的宗门，也可以选择做散修，
  // 然后宗门也有分数和排名，加总宗门弟子的修为值就是宗门的分值……宗门是打通每门课程不同年份的……一年一年一直传承下去，允许新同学的加入。”）：
  // 键名与后台 ck_sect_members.sect 一致（sanxiu＝散修，不计入任何宗门）；宗训取自典籍原文；每门课各自一张宗门榜，历届弟子的修为一直留在宗门里
  // intro 山门简介、mottoNote 宗训释义、wayNote 宗风说明：筑基后“山门大开”选择宗门时逐一介绍（live-sect.js）
  const SECTS = [
    { key: 'fengxia', name: '枫霞谷', mark: '枫', color: '#b8462a', glow: '#ffb48a', motto: '不积跬步，无以至千里', source: '《荀子·劝学》', way: '勤修不辍，日日有进',
      intro: '谷中枫林连绵，晨霞映着红叶。谷中弟子相信：再高的境界，也是一步一步走出来的。',
      mottoNote: '不把半步半步积累起来，就到不了千里之外。学问靠一天天积累，没有捷径可走。',
      wayNote: '每天都学一点：课前读材料，课后做修炼场，小步快走，积少成多。' },
    { key: 'xuanyue', name: '玄月宗', mark: '月', color: '#4b3f9e', glow: '#c2b4ff', motto: '学而不思则罔，思而不学则殆', source: '《论语·为政》', way: '明辨深思，追根究底',
      intro: '宗门建在月下高崖，夜深时弟子们围坐论道，一个问题常常要追问到天明。',
      mottoNote: '只学不想，就会迷惑而无所得；只想不学，就会陷入空想而疑惑。学习和思考要结合起来。',
      wayNote: '遇到结论多问一句“为什么”，把道理想透，把概念之间的联系理清。' },
    { key: 'lingxi', name: '灵犀山', mark: '犀', color: '#1f7a4c', glow: '#a3e8c8', motto: '独学而无友，则孤陋而寡闻', source: '《礼记·学记》', way: '同道切磋，互助共进',
      intro: '山中灵气相通，同门心有灵犀。这里的弟子最爱结伴修行，一人想不通的，大家一起想。',
      mottoNote: '一个人闷头学习，没有朋友切磋，就会见识狭窄、所知不多。',
      wayNote: '多讨论、多发言、多分享：在辩论、圆桌和弹幕里与同学碰撞观点，互相帮助。' },
    { key: 'xinglan', name: '星澜宫', mark: '星', color: '#1d5f9a', glow: '#a6d6ff', motto: '致广大而尽精微', source: '《礼记·中庸》', way: '博观约取，胸怀全局',
      intro: '宫殿悬于星河之畔，弟子们仰观星辰、俯察万物，既看全局，也不放过细节。',
      mottoNote: '既要达到广博宏大的境界，又要穷尽精细微妙之处，大处着眼、小处着手。',
      wayNote: '广泛阅读、开阔视野，再从中提炼要点；把每个知识点放进整门课的框架里理解。' },
  ];
  const SECT_MIN_REALM = 1;   // 达到「筑基」才能拜入宗门或做散修（后台 ck_sect_join 写死同样的数）
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
  const PUZZLE = { points: 5, tries: 3, cap: 20, delay: 10 };   // delay：出题后统一倒计时几秒才能抢答（2026-11-05，与 cloudbase-pg.sql 的 ck_puzzle_open 一致）
  // PK 对决（替换部分案例的圆桌会议）：老师在 PK 大屏结束后给今天各局的胜者每人加 points 修为（额外奖励，不计入满分）
  const PK = { points: 5 };
  // 时间轴排排站·全班分队（2026-11-11）：得分高的一队每人加 points 修为（额外奖励，与 cloudbase-pg.sql 的 ck_tl_finish 一致）；seconds＝每题默认作答秒数
  const TIMELINE = { points: 1, seconds: 10 };
  // 辩论赛（2026-10-28 起聊天室；2026-11-05 两门课简化、取消 3v3）：① 选立场、论据卡 → ② 进本方聊天室发言、点赞（2026-11-18 起实名，不再取昵称）→ ③ 辩后投票。
  // 昵称 2—nickMax 字，每条发言 2—textMax 字、每人 gap 毫秒一条、最多 perPerson 条；学生页每 poll 毫秒刷新。
  // 加修为（额外奖励，不计入满分；后台 ck_set_debate_winners 发放）：全场点赞最多的 top 位同学各加 likes。
  // 2026-11-21 用户：“辩论赛，只有全场点赞最多的三位同学加分，胜利方不加分。这样可以避免有的同学看哪方人数最多而选择那一方，从而获胜。”
  //   辩后投票票多的一方只公布为获胜方，不再加修为（win 由 5 改为 0）；以前课上已经加的留在 ck_bonus 里，结算照常算，不追改
  const DEBATE = { likes: 5, win: 0, top: 3, nickMax: 10, textMax: 100, gap: 5000, perPerson: 30, poll: 4000 };
  // 2026-11-20 辩论赛每一步的计时同步到学生页：沿用 3v3 辩论台留下的 ck_debate_control / ck_debate_live（表 ck_debate_matches，线上一直在，不用再执行 SQL），
  // 阶段名只能用旧的那几个，这里对照：选立场 · 论据卡＝pro_open，聊天室＝free，辩后投票＝vote，公布结果＝done
  // 2026-11-20 加“自由讨论”一步（用户：“在聊天室发言点赞前面，增加一个讨论环节，给5分钟时间让学生们讨论辩题，然后形成自己的观点”），借用阶段名 con_open
  const DEBATE_STAGE = { prep: 'pro_open', talk: 'con_open', chat: 'free', vote: 'vote', result: 'done' };
  // 经营沙盘（2026-11-03，习经案例 08 第二课时）：四个角色组聊天室沿用辩论聊天室（房间＝案例号＋b，side＝r1—r4）；
  // 经营合格时四位代表各 rep、本方指标最高的角色组里发过言的同学各 top（同一人相加，不超过 20；后台 ck_set_biz_awards 发放）；学生页每 poll 毫秒刷新
  const BIZ = { rep: 10, top: 5, poll: 3000, roles: ['r1', 'r2', 'r3', 'r4'] };
  // 分组讨论（2026-11-11，习经有圆桌会议的案例：代替弹幕表态和机制图弹幕接龙）：按四方角色分四组，各组聊天室沿用辩论聊天室（房间＝案例号＋d，side＝r1—r4）；
  // 每组点赞最多的一位（本组发言人）加 leader，本方提案被全班表决采纳的角色组里发过言的同学各加 win（同一人相加；后台 ck_set_disc_awards 发放）；学生页每 poll 毫秒刷新
  const DISCUSS = { leader: 5, win: 5, poll: 3000, roles: ['r1', 'r2', 'r3', 'r4'] };
  // 投票器（2026-10-29）：课堂工具的几组常用选项；学生页每 4 秒问一次有没有投票，投屏页每 2 秒刷新票数；结束后学生页显示 3 分钟
  // 匿名建议加修为（2026-10-29）：每个课堂第一次提交 min 字以上的建议加 points（后台 ck_submit_feedback 写死同样的数）
  const FEEDBACK = { points: 5, min: 10 };
  // 隐藏彩蛋（2026-11-05，学生页“更新说明”里不写，让学生自己发现）：老师点赞采纳匿名建议可选的修为 adopt、点笑脸 mood（每人每天一次）、
  // 一周（周一至周日）登录满 days 天 week（每周一次）。后台 ck_adopt_feedback / ck_set_mood / ck_checkin_today 写死同样的数
  // 2026-11-20 点赞上限（用户：“同一位同学，上一次被点赞后，一个礼拜的时间内，最多获得20修为值……因为老师不知道是谁评论，又要防止刷分”）：
  // 同一位同学 adoptDays 天内靠点赞实际得到的修为合计不超过 adoptCap（后台 ck_adopt_recount 写死同样的数）
  const EGG = { adopt: [5, 10, 20], adoptCap: 20, adoptDays: 7, mood: 5, week: 10, days: 3 };
  // 匿名建议箱的文字、样式和卡片（2026-11-05 起学生页与投屏页共用。用户：“教师版的匿名建议箱要跟学生版的一样，只是无法递交。”）：
  // texts(worksheet) 政经（概念学习页）叫“匿名建议和提问箱”；html(FB, teacher) teacher＝投屏页：同样的笑脸、输入框和“匿名提交”，一律不能用
  const FEEDBACK_BOX = {
    texts(worksheet) {
      return worksheet ? {
        tag: '匿名建议和提问箱',
        title: '还有哪里没想通？对这堂课有什么意见或建议？',
        hint: '学完这一课还有哪里没想通、想问老师什么，都写下来，老师看到后在下一堂课统一解答；老师的讲授、案例的呈现、课堂互动和网页用起来怎么样，希望以后增加哪些内容或互动方式，也可以写。',
        placeholder: '写下你的疑问，或对这堂课的意见和建议（500 字内）',
        aria: '本堂课的匿名建议和提问',
        thanks: '老师看到后会在下一堂课解答疑问。',
        what: '建议或提问',
      } : {
        tag: '匿名建议箱',
        title: '对这堂课，你有什么意见或建议？',
        hint: '老师的讲授、案例的呈现、课堂互动和网页用起来怎么样？希望以后的课上增加哪些内容或互动方式？都可以写下来。',
        placeholder: '写下你对这堂课的意见或建议（500 字内）',
        aria: '本堂课的匿名建议',
        thanks: '谢谢你的建议！',
        what: '建议',
      };
    },
    css: `
  .clp-fb { margin: 28px 0 8px; padding: 16px 18px; border: 1.5px solid rgba(35,101,95,.35); border-radius: 12px; background: #f4f8f6; color: #201c18; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .clp-fb-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .clp-fb-tag { padding: 2px 10px; border-radius: 999px; color: #fff; background: #23655f; font-weight: 800; font-size: 13px; }
  .clp-fb-label { color: #6d6259; font-size: 13px; font-weight: 700; }
  .clp-fb h4 { margin: 8px 0 4px; font-size: 18px; line-height: 1.6; }
  .clp-fb-hint { margin: 0 0 8px; color: #4d443c; font-size: 14px; }
  .clp-fb-hint b { color: #23655f; }
  .clp-fb textarea { display: block; box-sizing: border-box; width: 100%; min-height: 96px; padding: 9px 11px; border: 1.5px solid rgba(70,51,34,.22); border-radius: 8px; background: #fff; color: #201c18; font: inherit; resize: vertical; }
  .clp-fb textarea:focus { outline: none; border-color: #23655f; }
  .clp-fb-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .clp-fb-count { color: #6d6259; font-size: 13px; }
  .clp-fb-row button { padding: 9px 16px; border: 0; border-radius: 8px; color: #fff; background: #23655f; font-family: inherit; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
  .clp-fb-row button[disabled], .clp-fb textarea[disabled] { opacity: .55; cursor: default; }
  .clp-fb-state { margin: 6px 0 0; color: #6d6259; font-size: 13px; }
  .clp-fb-state[data-state="ok"] { color: #23655f; font-weight: 700; }
  .clp-fb-state[data-state="error"] { color: #a4492d; font-weight: 700; }
  .clp-mood { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 4px 0 12px; padding: 10px 12px; border-radius: 10px; background: #fff; border: 1px dashed rgba(35,101,95,.35); }
  .clp-mood-q { font-weight: 800; color: #23655f; }
  .clp-mood button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px 6px 10px; border: 1.5px solid rgba(70,51,34,.22); border-radius: 999px; background: #fff; color: #201c18; font-family: inherit; font-weight: 700; font-size: 14px; line-height: 1.2; cursor: pointer; transition: transform .12s, background .12s, border-color .12s; }
  .clp-mood button i { font-style: normal; font-size: 22px; line-height: 1; }
  .clp-mood button:hover:not([disabled]) { transform: translateY(-1px); border-color: #23655f; }
  .clp-mood button[aria-pressed="true"][data-mood="1"] { border-color: #2f9e62; background: #e8f7ee; color: #1d6a40; }
  .clp-mood button[aria-pressed="true"][data-mood="-1"] { border-color: #c0703f; background: #fbeee4; color: #8a3f17; }
  .clp-mood button[disabled] { opacity: .55; cursor: default; }
  .clp-mood-state { flex: 1 1 100%; color: #6d6259; font-size: 12.5px; }
  .clp-mood[hidden] { display: none; }
  `,
    // 2026-11-05 起后台另记提交者（只用于老师采纳后给作者加修为、通知作者），老师在工作台和导出里仍看不到是谁写的，所以说明改为“老师看不到是谁写的”
    html(FB, teacher) {
      return `<div class="clp-fb-head"><span class="clp-fb-tag">${FB.tag}</span><span class="clp-fb-label">本堂课</span></div>
        <h4>${FB.title}</h4>
        <div class="clp-mood" role="group" aria-label="上完这堂课的感觉"><span class="clp-mood-q">上完这堂课，你感觉怎么样？</span>
          <button type="button" data-mood="1" aria-pressed="false" disabled><i aria-hidden="true">😊</i>开心</button>
          <button type="button" data-mood="-1" aria-pressed="false" disabled><i aria-hidden="true">☹️</i>不开心</button>
          <small class="clp-mood-state" role="status">点一下就行，每天可以改；老师只看到各有多少人，看不到是谁选的。</small></div>
        <p class="clp-fb-hint">${FB.hint}<b>匿名</b>：老师只看到内容和提交日期，看不到是谁写的。</p>
        <form class="clp-fb-form"><textarea maxlength="500" rows="4" placeholder="${FB.placeholder}" aria-label="${FB.aria}" disabled></textarea>
        <div class="clp-fb-row"><span class="clp-fb-count">0/500</span><button type="submit" disabled${teacher ? ' title="教师版只能看，不能递交"' : ''}>匿名提交</button></div></form>
        <p class="clp-fb-state" role="status"></p>`;
    },
  };
  const POLL = { presets: [['是', '否'], ['对', '错'], ['赞同', '反对'], ['一', '二'], ['A', 'B', 'C', 'D']], check: 4000, refresh: 2000, keep: 180000 };
  // 修炼场（2026-10-22，两门课各一个）：本班开放过某单元的课堂就开放（当前课堂，或已有学生登录上过课；之前上过的也开放；
  // 提前发布、还没开放的课堂只能查看，不开放、不计修为）；客观题当天第一次作答就答对得分，
  // 隔 gap 天以上再答对可再得一次（间隔重复，每题最多 most 次；课后自修只算一次），
  // 题目是另写的新题（与课堂正文不重复）；分值按题型：易错判断 judge、情境辨析 scene、讲给别人听 feynman（费曼学习法专用题）；
  // 每人每门课每天最多 cap 修为（额外奖励，不计入满分；后台 ck_practice_answer / essay 核对，
  // 分值写在题库里〔practice_bank.py〕，上限写在 cloudbase-pg.sql 的 ck_practice_cap，gap、most 写在 ck_practice_answer／items／home，几处要一致）。
  // 10-22 用户：“修炼场真正的作用其实是后期为了上化神用的，只有平时有累积，后期才能更早上”——上限政经 10→30、习经 3→10，并加“隔几天再答对再得一次”：
  // 天天练的同学能更早到化神（课堂得分最好的同学练满：政经约第 9 次课、习经约第 8 次课），不练到不了或要到最后，临时突击补不回来。
  const PRACTICE = {
    delay: 0, essayMin: 200, gap: 3, most: 2,
    courses: { 'political-economy': { cap: 30, judge: 2, scene: 4, feynman: 5 }, 'xjp-economy': { cap: 10, judge: 1, scene: 1, feynman: 3 } },
    of(course) { return this.courses[course] || { cap: 10, judge: 1, scene: 1, feynman: 3 }; },
    // “易错判断 +2、情境辨析 +4、讲给别人听 +5”（两种相同时合并）
    text(course) {
      const r = this.of(course);
      return r.judge === r.scene ? `易错判断、情境辨析每题 +${r.judge}，讲给别人听每题 +${r.feynman}` : `易错判断 +${r.judge}、情境辨析 +${r.scene}、讲给别人听 +${r.feynman}`;
    },
  };
  // 请假：请假的那次课计基础修为（相当于签到）；没登录也没请假的课不得修为（教师工作台结算，见 live-teacher.js）
  const LEAVE = { points: 20 };
  // 这一境界有没有“巅峰”一档：下一境界的门槛（按课程）高于巅峰的起点才有（现在是元婴：100% 到化神）
  const peakFrom = (list, level) => (level < list.length - 1 && PEAK_MIN[level] != null && list[level + 1].min > PEAK_MIN[level] + 1e-9 ? PEAK_MIN[level] : null);
  // 这一境界各档位各占哪一段（占满分的比例），画进度条上的刻度用：[{ stage, name, lo, hi }]
  function stageBands(level, course) {
    const list = realmsFor(course);
    const at = Math.max(0, Math.min(list.length - 1, Math.floor(Number(level) || 0)));
    const lo = list[at].min;
    const top = at >= list.length - 1;
    const end = top ? Math.max(1, lo + 0.1) : list[at + 1].min;   // 这一境界到哪里为止
    const base = top ? end : REALMS[at + 1].min;                  // 初期／中期／后期按原来的门槛三等分
    const third = (base - lo) / 3;
    const peak = peakFrom(list, at);
    const bands = [
      { stage: 0, name: STAGES[0], lo, hi: lo + third },
      { stage: 1, name: STAGES[1], lo: lo + third, hi: lo + 2 * third },
      { stage: 2, name: STAGES[2], lo: lo + 2 * third, hi: peak == null ? end : peak },
    ];
    if (peak != null) bands.push({ stage: PEAK, name: STAGES[PEAK], lo: peak, hi: end });
    return bands;
  }
  // 修为 → 境界：level 0—4，stage 0—2（初期／中期／后期）或 3（巅峰），within 为本境界内的进度（0—1）；course 不同门槛可能不同（REALM_MIN）。
  // 比例不再封顶 100%（2026-11-11），最高一境的初期／中期／后期按“门槛到 max(100%, 门槛＋10%)”三等分（政经化神 90%—100% 与原来一样）
  function realmOf(points, max, course) {
    const list = realmsFor(course);
    const ratio = max > 0 ? Math.max(0, Math.min(5, points / max)) : 0;
    let level = 0;
    list.forEach((realm) => { if (ratio >= realm.min - 1e-9) level = realm.level; });
    const lo = list[level].min;
    // 初期／中期／后期仍按原来的门槛三等分（2026-11-12 用户：“要确保学生目前的修为和境界是不变的，变的只是化神需要的分数”）：
    // 化神门槛提高以后（习经 135%、政经 155%），元婴照旧 65%—90% 分三段，90% 以上直到化神都是元婴后期；化神按门槛到 max(100%, 门槛＋10%) 三等分
    const hi = level < list.length - 1 ? REALMS[level + 1].min : Math.max(1, lo + 0.1);
    const within = hi > lo ? Math.max(0, Math.min(1, (ratio - lo) / (hi - lo))) : 1;
    // 巅峰（2026-11-21）：过了巅峰的起点、还没到下一境界；初期／中期／后期照旧
    const peak = peakFrom(list, level);
    const stage = peak != null && ratio >= peak - 1e-9 ? PEAK : Math.min(2, Math.floor(within * 3));
    return { level, stage, ratio, within, name: list[level].name, title: stageTitle(level, stage) };
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
  const LINGTIAN_DEV = (typeof window !== 'undefined' && window.LINGTIAN_DEV) || 'http://127.0.0.1:4100';
  function cloudbaseProvider(config) {
    if (!window.cloudbase) throw new Error('未加载 CloudBase SDK');
    const app = window.cloudbase.init({ env: config.env, region: config.region || 'ap-shanghai' });
    const auth = typeof app.auth === 'function' ? app.auth() : app.auth;
    const db = app.rdb();
    const PAGE = 500;
    const POLL_MS = 5000;
    const SAFETY_MS = 30000;
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
      // 云函数（2026-11-15 云间灵田：游戏后台在云函数 lingtian 里，凭数据库换来的凭证调用）
      async callFunction(name, data) {
        await keepFresh(false);
        const result = await app.callFunction({ name, data: data || {} });
        return result && result.result;
      },
      // options.limit：只取最新的若干条（按 id 倒序）；options.since：[列名, 值]，只取该列大于此值的行（增量读取）
      async fetchAll(kind, where, options = {}) {
        const base = () => {
          const query = filtered(db.from(COLLECTIONS[kind]).select('*'), where);
          return options.since ? query.gt(options.since[0], options.since[1]) : query;
        };
        const order = ORDER_BY[kind] || 'id';
        if (options.limit) {
          const result = await call(() => base().order(order, { ascending: false }).range(0, options.limit - 1));
          return (result.data || []).map(fromRow);
        }
        const rows = [];
        for (let from = 0; ; from += PAGE) {
          const result = await call(() => base().order(order, { ascending: true }).range(from, from + PAGE - 1));
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
        let lastRefresh = 0;
        const refresh = async () => {
          lastRefresh = Date.now();
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
        // 实时推送不可用时，每 5 秒自动刷新一次；连着实时推送时也每 30 秒补读一次（推送连接悄悄断掉、漏推时不至于一直停在旧数据上）
        const timer = setInterval(() => { if (!live || Date.now() - lastRefresh > SAFETY_MS) refresh(); }, POLL_MS);
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
    // audit：旁听（2026-11-05，规则同 cloudbase-pg.sql 的 ck_my_checkin / ck_my_audit）——正式成员的写入只认非旁听记录
    // 登录与在线记录（2026-11-05，规则同 cloudbase-pg.sql 的 ck_visit_touch）：这台设备在这个课堂 3 分钟内还有活动就并进上一段，否则另起一段
    const visitTouch = (classroom, sid, name, owner, kind, auditor) => {
      const rows = read('visits');
      const last = rows.filter((v) => String(v.classroom) === String(classroom) && v.owner === owner && v.sid === sid)
        .sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at))[0];
      const now = Date.now();
      if (last && now - Date.parse(last.last_at) < 180000) {
        last.seconds = (Number(last.seconds) || 0) + Math.min(90, Math.max(0, Math.round((now - Date.parse(last.last_at)) / 1000)));
        last.last_at = new Date(now).toISOString();
      } else {
        const room = read('classrooms').find((r) => String(r.id) === String(classroom));
        if (!room) return;
        rows.push({ id: Math.max(0, ...rows.map((v) => Number(v.id) || 0)) + 1, course: room.course, class_id: room.class_id, classroom: room.id, unit: room.chapter,
          sid, name: String(name || '').slice(0, 20), owner, kind: kind === 'ping' ? 'back' : kind, started_at: new Date(now).toISOString(), last_at: new Date(now).toISOString(), seconds: 0, auditor: Boolean(auditor) });
      }
      write('visits', rows);
    };
    const myCheckin = (uid, classroom, audit = false) => {
      const room = read('classrooms').find((row) => String(row.id) === String(classroom));
      if (!room) return null;
      const devices = read('devices');
      const mine = read('checkins').filter((row) => row.owner === uid && String(row.classroom) === String(classroom) && row.verified
        && Boolean(row.auditor) === audit
        && devices.some((d) => String(d.class_id) === String(room.class_id) && d.sid === sidKey(row.sid) && d.owner === uid));
      return mine[mine.length - 1] || null;
    };
    const memberOk = (uid, classroom, sid, name) => {
      const me = myCheckin(uid, classroom);
      return Boolean(me) && sidKey(me.sid) === sidKey(sid) && plain(me.name) === plain(name);
    };
    // 请假补做（规则同 cloudbase-pg.sql 的 ck_leave_makeup / ck_makeup_open，2026-11-19）：这个学号在本班有请假，请假的日子里这个课堂上过课（别的同学正式登录过）；
    // 课堂停止或结束提交以后，本设备正式登录过这个课堂的请假同学可以补交
    const leaveMakeup = (room, sid) => Boolean(room) && read('leaves').some((l) => String(l.class_id) === String(room.class_id) && sidKey(l.sid) === sidKey(sid)
      && read('checkins').some((c) => String(c.classroom) === String(room.id) && c.verified && !c.auditor && !c.makeup && sidKey(c.sid) !== sidKey(sid)
        && String(c.session) >= String(l.start_day) && String(c.session) <= String(l.end_day)));
    const makeupOpen = (uid, classroom) => {
      const room = read('classrooms').find((row) => String(row.id) === String(classroom));
      const me = myCheckin(uid, classroom);
      return Boolean(room && me && !(room.is_current && room.submissions_open) && leaveMakeup(room, me.sid));
    };
    // 10 分钟内这台设备登录失败、申请过多（规则同 cloudbase-pg.sql 的 ck_join）
    const tooMany = (uid) => read('seclog').filter((row) => row.owner === uid && Date.now() - Date.parse(row.at) < 600000
      && ['bad_code', 'bad_sid', 'bad_name', 'bad_pin', 'request', 'pin_forgot'].includes(row.kind)).length >= 20;
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
      const makeup = (kind === 'choices' || kind === 'answers') && makeupOpen(uid, doc.classroom);   // 请假补做：课堂停止后也收选择、作答，停止递交的题也收
      if (!makeup && (!state || state !== 'open')) throw new Error('new row violates row-level security policy (mock)');
      if (!makeup && (kind === 'choices' || kind === 'answers') && isStopped(stopsOf(doc.classroom), `${doc.case}:${doc.item}`)) {
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
      async addMany(kind, list) {
        const uid = await this.ensureAnonymous();
        let docs = list;
        docs.forEach((doc) => guard(kind, doc, uid));
        const rows = read(kind);
        if (kind === 'choices' || kind === 'answers') {
          // 规则同 cloudbase-pg.sql 的触发器 ck_stamp：学号统一成本人加入记录上的写法（时间也以后台为准，见下面的 ts）
          docs = docs.map((doc) => { const me = myCheckin(uid, doc.classroom); return me && sidKey(me.sid) === sidKey(doc.sid) ? { ...doc, sid: me.sid } : doc; });
          const taken = new Set(rows.map((row) => `${row.classroom}|${row.sid}|${row.case}|${row.item}`));
          if (docs.some((doc) => taken.has(`${doc.classroom}|${doc.sid}|${doc.case}|${doc.item}`))) {
            throw Object.assign(new Error('duplicate key value violates unique constraint (mock)'), { code: '23505' });
          }
        }
        const ts = Date.now();
        const created = new Date(ts).toISOString();
        docs.forEach((doc) => rows.push({ id: Math.random().toString(36).slice(2), owner: uid, ...(kind === 'danmaku' ? { status: 'new' } : {}), ...doc, ts, created_at: created }));
        write(kind, rows);
      },
      // 云间灵田（2026-11-15）：本机测试时，游戏云函数和 lt_* 函数转给本机灵田测试服务（lingtian/test/dev-server.cjs，连本机 PostgreSQL）；
      // 地址栏 ?as=uA 指定用本机测试库里的哪位同学（默认 uA），教师账号用 TEACHER_UID
      async callFunction(name, data) {
        const response = await fetch(`${LINGTIAN_DEV}/fn/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
        return response.json();
      },
      async rpc(name, params = {}) {
        if (/^lt_/.test(name) || name === 'ck_my_sect_role') {
          const as = localStorage.getItem(prefix + 'teacher') ? 'TEACHER_UID' : (new URLSearchParams(location.search).get('as') || localStorage.getItem('lingtian-dev-as') || 'uA');
          // 本机模拟课堂的编号在本机灵田测试库里不存在：lingtian-dev-room 指定换成测试库里的哪个课堂（如 4012）
          const devRoom = Number(localStorage.getItem('lingtian-dev-room')) || 0;
          if (devRoom && 'p_classroom' in params) params = { ...params, p_classroom: devRoom };
          const response = await fetch(`${LINGTIAN_DEV}/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as, params }) });
          const out = await response.json();
          if (out && out.error) throw new Error(out.error);
          return out;
        }
        // 学生登录：课堂码＋点名册＋4 位口令（规则同 cloudbase-pg.sql 的 ck_join）
        if (name === 'ck_join') {
          const uid = await this.ensureAnonymous();
          const now = Date.now();
          const at = new Date().toISOString();
          if (tooMany(uid)) return { status: 'too_many' };
          const code = normalizeCode(params.p_code).replace(/[^A-Z0-9]/g, '');
          const room = read('classrooms').find((row) => row.code === code);   // 历史课堂的码也认，最后只给查看（规则同 cloudbase-pg.sql）
          if (!room) { secLog('bad_code', { owner: uid, detail: code.slice(0, 12) }); return { status: 'bad_code' }; }
          const sid = sidKey(params.p_sid);
          const nm = plain(params.p_name);
          if (!/^[A-Z0-9]{4,20}$/.test(sid) || nm.length < 2 || nm.length > 20) return { status: 'invalid' };
          const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = klass && Array.isArray(klass.roster) ? klass.roster : [];
          if (!roster.length) return { status: 'no_roster' };
          let person = roster.find((item) => sidKey(item.sid) === sid);
          let audit = false;   // 旁听（2026-11-05）
          const ctx = { owner: uid, course: room.course, class_id: room.class_id, classroom: room.id, sid, name: nm };
          // 不在点名册上（2026-10-28）：只提示核对姓名和学号，不再自动申请；确实不在名单上的同学自己点“申请加入”（ck_join_apply）
          if (!person) {
            const req = read('requests').find((row) => String(row.class_id) === String(room.class_id) && row.sid === sid);
            if (req && req.status === 'pending') return { status: 'pending' };
            if (req && req.status === 'audit') {
              person = { sid: req.sid, name: req.name };
              audit = true;
            } else {
              secLog('bad_sid', ctx);
              return { status: 'not_listed', rejected: Boolean(req && req.status === 'rejected') };
            }
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
              // 老师同意了“忘记口令”申请：只有提出申请的那台设备能设新口令
              if (pin && pin.reset_owner && pin.reset_owner !== uid) return { status: 'reset_other' };
              const fresh = String(params.p_new_pin || '');
              if (!/^\d{4}$/.test(fresh)) return { status: 'set_pin' };
              if (weakPin(fresh, sid)) return { status: 'weak_pin' };
              const salt = Math.random().toString(36).slice(2);
              if (!pin) { pin = { class_id: room.class_id, sid }; pins.push(pin); }
              Object.assign(pin, { pin_hash: await sha256(`${salt}:${fresh}`), salt, fails: 0, locks: 0, locked_until: null, set_at: at, updated_at: at, reset_owner: null });
              write('pins', pins);
              secLog('pin_set', ctx);
            } else {
              const typed = String(params.p_pin || '');
              const ask = read('pinreqs').find((row) => String(row.class_id) === String(room.class_id) && row.sid === sid && row.owner === uid);
              const forgot = ask ? ask.status : null;
              if (!/^\d{4}$/.test(typed)) return { status: 'need_pin', forgot };
              if (await sha256(`${pin.salt}:${typed}`) !== pin.pin_hash) {
                // 连续输错 10 次锁定：第一次 15 分钟、第二次 1 小时、第三次起须教师解锁
                const count = (pin.fails || 0) + 1;
                const locks = pin.locks || 0;
                const minutes = count < 10 ? 0 : locks === 0 ? 15 : locks === 1 ? 60 : 10 * 365 * 24 * 60;
                const until = minutes ? new Date(now + minutes * 60000).toISOString() : null;
                Object.assign(pin, { fails: until ? 0 : count, locks: locks + (until ? 1 : 0), locked_until: until, updated_at: at });
                write('pins', pins);
                secLog(until ? 'locked' : 'bad_pin', { ...ctx, detail: !until ? null : locks === 0 ? '15 分钟' : locks === 1 ? '1 小时' : '须教师解锁' });
                return until ? { status: 'locked', until, teacher: locks >= 2 } : { status: 'bad_pin', left: 10 - count, forgot };
              }
              Object.assign(pin, { fails: 0, locks: 0, updated_at: at });
              write('pins', pins);
              secLog('new_device', ctx);
            }
            const fresh = read('devices');
            fresh.push({ class_id: room.class_id, sid, owner: uid, first_at: at, last_at: at });
            write('devices', fresh);
          }
          const makeup = !room.is_current && !audit && leaveMakeup(room, person.sid);   // 请假补做（2026-11-19）
          visitTouch(room.id, sid, person.name, uid, room.is_current || makeup ? 'login' : 'view', audit);
          if (!room.is_current && !makeup) {   // 历史课堂：只查看，不记登录
            secLog('view_past', ctx);
            return { status: 'view', classroom: room.id, course: room.course, chapter: room.chapter, case_no: room.case_no || null, room_name: room.name, pwd_hash: '', name: person.name, sid: person.sid, audit };
          }
          const rows = read('checkins');
          rows.push({ id: nextId(rows), owner: uid, course: room.course, session: today(), name: person.name, sid: person.sid, page: room.chapter, path: '/',
            ts: now, classroom: room.id, class_name: String(params.p_class || '').trim().slice(0, 40) || null,
            group_name: String(params.p_group || '').trim().slice(0, 20) || null, verified: true, auditor: audit, makeup });
          write('checkins', rows);
          if (makeup) secLog('makeup', ctx);
          return { status: 'ok', classroom: room.id, course: room.course, chapter: room.chapter, case_no: room.case_no || null, room_name: room.name,
            submissions_open: room.submissions_open, danmaku: room.danmaku, pwd_hash: '', name: person.name, sid: person.sid, audit, makeup };
        }
        // 申请加入、忘记口令（规则同 cloudbase-pg.sql 的 ck_join_apply / ck_pin_forgot / ck_decide_pin_request）
        if (name === 'ck_join_apply' || name === 'ck_pin_forgot') {
          const uid = await this.ensureAnonymous();
          const at = new Date().toISOString();
          if (tooMany(uid)) return { status: 'too_many' };
          const code = normalizeCode(params.p_code).replace(/[^A-Z0-9]/g, '');
          const room = read('classrooms').find((row) => row.code === code);
          if (!room) { secLog('bad_code', { owner: uid, detail: code.slice(0, 12) }); return { status: 'bad_code' }; }
          const sid = sidKey(params.p_sid);
          const nm = plain(params.p_name);
          if (!/^[A-Z0-9]{4,20}$/.test(sid) || nm.length < 2 || nm.length > 20) return { status: 'invalid' };
          const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = klass && Array.isArray(klass.roster) ? klass.roster : [];
          if (!roster.length) return { status: 'no_roster' };
          const person = roster.find((item) => sidKey(item.sid) === sid);
          const ctx = { owner: uid, course: room.course, class_id: room.class_id, classroom: room.id, sid, name: nm };
          const sameClass = (row) => String(row.class_id) === String(room.class_id);
          if (name === 'ck_join_apply') {
            if (person) return { status: 'listed' };
            const reqs = read('requests');
            const req = reqs.find((row) => sameClass(row) && row.sid === sid);
            if (req && req.status === 'pending') return { status: 'pending' };
            if (req && req.status === 'audit') return { status: 'audit' };   // 已允许旁听，直接登录（2026-11-05）
            if (reqs.filter((row) => sameClass(row) && row.status === 'pending').length >= 100) return { status: 'too_many' };
            const fields = { name: nm, class_name: String(params.p_class || '').trim().slice(0, 40) || null, owner: uid, status: 'pending', created_at: at, decided_at: null };
            if (req) Object.assign(req, fields);
            else reqs.push({ id: nextId(reqs), class_id: room.class_id, course: room.course, sid, ...fields });
            write('requests', reqs);
            secLog('request', ctx);
            return { status: 'pending' };
          }
          if (!person) return { status: 'not_listed' };
          if (plain(person.name) !== nm) { secLog('bad_name', ctx); return { status: 'bad_name' }; }
          if (read('devices').some((d) => sameClass(d) && d.sid === sid && d.owner === uid)) return { status: 'no_need' };
          const pin = read('pins').find((row) => sameClass(row) && row.sid === sid);
          if (!pin || (!pin.pin_hash && (!pin.reset_owner || pin.reset_owner === uid))) return { status: 'no_pin' };
          const asks = read('pinreqs');
          const ask = asks.find((row) => sameClass(row) && row.sid === sid);
          if (ask && ask.status === 'pending' && ask.owner === uid) return { status: 'pending' };
          if (asks.filter((row) => sameClass(row) && row.status === 'pending').length >= 100) return { status: 'too_many' };
          const fields = { name: person.name, owner: uid, status: 'pending', created_at: at, decided_at: null };
          if (ask) Object.assign(ask, fields);
          else asks.push({ id: nextId(asks), class_id: room.class_id, course: room.course, sid, ...fields });
          write('pinreqs', asks);
          secLog('pin_forgot', { ...ctx, name: person.name });
          return { status: 'pending' };
        }
        // 分组讨论（规则同 cloudbase-pg.sql 的 ck_disc_state / join / board 与 ck_set_disc_awards）
        if (/^ck_disc_|^ck_set_disc_awards$/.test(name)) {
          const uid = await this.ensureAnonymous();
          const teacher = Boolean(localStorage.getItem(prefix + 'teacher'));
          const classroom = params.p_classroom;
          const no = String(params.p_case);
          const roomNo = `${no}d`;
          const room = read('classrooms').find((row) => String(row.id) === String(classroom));
          const members = read('debatemembers');
          const posts = read('debateposts');
          const likes = read('debatelikes');
          const same = (row) => String(row.classroom) === String(classroom);
          const likeCount = (id) => likes.filter((l) => String(l.post_id) === String(id)).length;
          const klass = room && read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = new Set(((klass && klass.roster) || []).map((x) => sidKey(x.sid)));
          const ranked = (caseRoom, role) => members.filter((m) => same(m) && m.case_no === caseRoom && m.side === role).map((m) => {
            const mine = posts.filter((p) => same(p) && p.case_no === caseRoom && p.sid === m.sid && !p.hidden);
            return { ...m, likes: mine.reduce((n, p) => n + likeCount(p.id), 0), posts: mine.length, first: mine.length ? Math.min(...mine.map((p) => Date.parse(p.created_at))) : Infinity };
          }).filter((m) => m.posts).sort((a, b) => b.likes - a.likes || a.first - b.first);
          const leadersOf = (caseRoom) => DISCUSS.roles.map((role) => ranked(caseRoom, role).filter((m) => m.likes > 0 && roster.has(m.sid))[0])
            .filter(Boolean).map((m) => ({ side: m.side, sid: m.sid, name: m.name, nick: m.nick, likes: m.likes, posts: m.posts }));
          if (name === 'ck_disc_board' || name === 'ck_set_disc_awards') {
            teacherOnly();
            if (!room) throw new Error('课堂不存在');
            const matches = read('debatematches');
            if (name === 'ck_set_disc_awards') {
              const rest = matches.filter((d) => !(same(d) && d.case_no === roomNo));
              if (params.p_won != null) {
                if ((params.p_won || []).some((w) => !DISCUSS.roles.includes(w))) throw new Error('角色组只能是 r1—r4');
                rest.push({ classroom: Number(classroom) || classroom, case_no: roomNo, stage: 'done', args: { won: params.p_won, leader: Number(params.p_leader), win: Number(params.p_win), at: new Date().toISOString() } });
              }
              write('debatematches', rest);
              const rows = [];
              rest.filter((d) => same(d) && /d$/.test(d.case_no) && d.args && d.args.won).forEach((d) => {
                leadersOf(d.case_no).forEach((m) => rows.push({ case_no: d.case_no, sid: m.sid, name: m.name, side: m.side, points: d.args.leader, leader: true, win: false }));
                members.filter((m) => same(m) && m.case_no === d.case_no && d.args.won.includes(m.side)
                  && posts.some((p) => same(p) && p.case_no === d.case_no && p.sid === m.sid && !p.hidden))
                  .forEach((m) => rows.push({ case_no: d.case_no, sid: m.sid, name: m.name, side: m.side, points: d.args.win, leader: false, win: true }));
              });
              const sum = (list) => {
                const map = new Map();
                list.filter((r) => r.points > 0 && roster.has(r.sid)).forEach((r) => {
                  const old = map.get(r.sid) || { sid: r.sid, name: r.name, side: r.side, points: 0, leader: false, win: false };
                  map.set(r.sid, { ...old, points: old.points + r.points, leader: old.leader || r.leader, win: old.win || r.win });
                });
                return Array.from(map.values()).map((r) => ({ ...r, points: Math.min(20, r.points) }));
              };
              const day = today();
              const bonus = read('bonus').filter((b) => !(same(b) && b.kind === 'discuss'));
              sum(rows).forEach((r) => bonus.push({ id: nextId(bonus), course: room.course, classroom: room.id, day, kind: 'discuss', sid: r.sid, name: String(r.name || '').slice(0, 20), points: r.points, created_at: new Date().toISOString() }));
              write('bonus', bonus);
              return { list: sum(rows.filter((r) => r.case_no === roomNo)).sort((a, b) => b.points - a.points), total: bonus.filter((b) => same(b) && b.kind === 'discuss').length };
            }
            const out = {};
            DISCUSS.roles.forEach((role) => {
              const mine = posts.filter((p) => same(p) && p.case_no === roomNo && p.side === role && !p.hidden);
              out[role] = {
                members: members.filter((m) => same(m) && m.case_no === roomNo && m.side === role).length,
                posts: mine.length,
                top: ranked(roomNo, role).slice(0, 3).map((m) => ({ sid: m.sid, name: m.name, nick: m.nick, likes: m.likes, posts: m.posts })),
                all: mine.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((p) => ({ id: p.id, nick: p.nick, name: (members.find((m) => same(m) && m.case_no === roomNo && m.sid === p.sid) || {}).name, text: p.text, at: p.created_at, likes: likeCount(p.id) })),
              };
            });
            const votes = {};
            const latest = new Map();
            read('choices').filter((row) => same(row) && row.case === no && /^sim-[1-3]$/.test(row.item))
              .sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((row) => latest.set(`${row.item}|${sidKey(row.sid)}`, row));
            latest.forEach((row) => { const v = votes[row.item] || (votes[row.item] = {}); v[row.choice] = (v[row.choice] || 0) + 1; });
            const result = matches.find((d) => same(d) && d.case_no === roomNo && d.args && d.args.won);
            const awarded = read('bonus').filter((b) => same(b) && b.kind === 'discuss').map((b) => ({ sid: b.sid, name: b.name, points: b.points }));
            return { ...out, votes, leaders: leadersOf(roomNo), result: result ? result.args : null, awarded };
          }
          const me = myCheckin(uid, classroom) || (teacher && room ? { sid: 'WBF0001', name: '王不凡', test: true } : null);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          const mem = members.find((m) => same(m) && m.case_no === roomNo && m.sid === sid);
          const roles = Array.isArray(params.p_roles) ? params.p_roles : [];
          const chosen = () => {
            const c = read('choices').filter((row) => same(row) && row.case === no && row.item === 'rt-role' && sidKey(row.sid) === sid)
              .sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
            const at = c ? roles.indexOf(c.choice) : -1;
            return roles.length >= 2 && roles.length <= 4 && at >= 0 ? `r${at + 1}` : null;
          };
          if (name === 'ck_disc_state') {
            if (mem) return { status: 'joined', role: mem.side, nick: mem.nick, test: Boolean(me.test) };
            const role = me.test ? null : chosen();
            return { status: !role && !me.test ? 'pick' : 'nick', role, test: Boolean(me.test) };
          }
          if (name === 'ck_disc_join') {
            if (!room || !room.is_current) return { status: 'closed' };
            if (mem) return { status: 'ok', role: mem.side, nick: mem.nick };
            const role = me.test ? (DISCUSS.roles.includes(params.p_role) ? params.p_role : null) : chosen();
            if (!role) return { status: 'pick' };
            // 2026-11-18 起实名（同 cloudbase-pg.sql 的 ck_disc_join / ck_biz_join）：登录时的姓名，同名加学号末两位（还重复加末四位）；p_nick 不再使用
            const real = String(me.name || '').replace(/\s+/g, '').slice(0, 12) || `同学${String(sid).slice(-4)}`;
            const used = (value) => members.some((m) => same(m) && m.case_no === roomNo && m.nick.toLowerCase() === value.toLowerCase());
            let nick = real;
            if (used(nick)) nick = `${real.slice(0, 9)}·${String(sid).slice(-2)}`;
            if (used(nick)) nick = `${real.slice(0, 7)}·${String(sid).slice(-4)}`;
            if (used(nick)) return { status: 'taken' };
            members.push({ id: nextId(members), classroom: Number(classroom), case_no: roomNo, side: role, sid, name: me.name, nick, joined_at: new Date().toISOString() });
            write('debatemembers', members);
            return { status: 'ok', role, nick };
          }
          throw new Error(`未知的后台函数：${name}`);
        }
        // 经营沙盘（规则同 cloudbase-pg.sql 的 ck_biz_state / join / vote / board / control 与 ck_set_biz_awards）
        if (/^ck_biz_|^ck_set_biz_awards$/.test(name)) {
          const uid = await this.ensureAnonymous();
          const teacher = Boolean(localStorage.getItem(prefix + 'teacher'));
          const classroom = params.p_classroom;
          const no = String(params.p_case);
          const roomNo = `${no}b`;
          const room = read('classrooms').find((row) => String(row.id) === String(classroom));
          const members = read('debatemembers');
          const posts = read('debateposts');
          const likes = read('debatelikes');
          const games = read('bizgames');
          const votes = read('bizvotes');
          const same = (row) => String(row.classroom) === String(classroom);
          const likeCount = (id) => likes.filter((l) => String(l.post_id) === String(id)).length;
          const gameRow = () => games.find((g) => same(g) && g.case_no === no);
          const ranked = (role) => members.filter((m) => same(m) && m.case_no === roomNo && m.side === role).map((m) => {
            const mine = posts.filter((p) => same(p) && p.case_no === roomNo && p.sid === m.sid && !p.hidden);
            return { ...m, likes: mine.reduce((n, p) => n + likeCount(p.id), 0), posts: mine.length, first: mine.length ? Math.min(...mine.map((p) => Date.parse(p.created_at))) : Infinity };
          }).filter((m) => m.posts).sort((a, b) => b.likes - a.likes || a.first - b.first);
          const gameJson = (names) => {
            const g = gameRow() || {};
            const reps = {};
            Object.entries(g.reps || {}).forEach(([k, v]) => { reps[k] = names ? { ...v } : { nick: v.nick }; });
            const out = {};
            votes.filter((v) => same(v) && v.case_no === no).forEach((v) => {
              const r = out[String(v.round)] || (out[String(v.round)] = {});
              (r[String(v.decision)] || (r[String(v.decision)] = {}))[v.role] = v.choice;
            });
            return { stage: g.stage || 'chat', reps, event: g.event || null, shown: g.shown || null, votes: out };
          };
          if (name === 'ck_biz_board' || name === 'ck_biz_control' || name === 'ck_set_biz_awards') {
            teacherOnly();
            if (!room) throw new Error('课堂不存在');
            if (name === 'ck_biz_board') {
              const roles = {};
              BIZ.roles.forEach((role) => {
                const mine = posts.filter((p) => same(p) && p.case_no === roomNo && p.side === role && !p.hidden);
                roles[role] = {
                  members: members.filter((m) => same(m) && m.case_no === roomNo && m.side === role).length,
                  posts: mine.length,
                  top: ranked(role).slice(0, 5).map((m) => ({ sid: m.sid, name: m.name, nick: m.nick, likes: m.likes, posts: m.posts })),
                  hot: mine.map((p) => ({ id: p.id, nick: p.nick, name: (members.find((m) => same(m) && m.case_no === roomNo && m.sid === p.sid) || {}).name, text: p.text, likes: likeCount(p.id) }))
                    .sort((a, b) => b.likes - a.likes || Number(b.id) - Number(a.id)).slice(0, 4),
                  all: mine.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((p) => ({ id: p.id, nick: p.nick, name: (members.find((m) => same(m) && m.case_no === roomNo && m.sid === p.sid) || {}).name, text: p.text, at: p.created_at, likes: likeCount(p.id) })),
                };
              });
              const awarded = read('bonus').filter((b) => same(b) && b.day === today() && b.kind === 'biz').map((b) => ({ sid: b.sid, name: b.name, points: b.points }));
              return { roles, game: gameJson(true), awarded };
            }
            if (name === 'ck_set_biz_awards') {
              const day = today();
              const bonus = read('bonus').filter((b) => !(same(b) && b.day === day && b.kind === 'biz'));
              if (params.p_pass === true) {
                const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
                const roster = new Set(((klass && klass.roster) || []).map((x) => sidKey(x.sid)));
                const add = new Map();
                Object.values((gameRow() || {}).reps || {}).forEach((r) => add.set(r.sid, { name: r.name, points: (add.get(r.sid) || { points: 0 }).points + Number(params.p_rep) }));
                if (Number(params.p_top_points) > 0) {
                  members.filter((m) => same(m) && m.case_no === roomNo && (params.p_top || []).includes(m.side)
                    && posts.some((p) => same(p) && p.case_no === roomNo && p.sid === m.sid && !p.hidden))
                    .forEach((m) => add.set(m.sid, { name: m.name, points: ((add.get(m.sid) || { points: 0 }).points) + Number(params.p_top_points) }));
                }
                add.forEach((v, sid) => { if (roster.has(sid)) bonus.push({ id: nextId(bonus), course: room.course, classroom: room.id, day, kind: 'biz', sid, name: String(v.name || '').slice(0, 20), points: Math.min(20, v.points), created_at: new Date().toISOString() }); });
              }
              write('bonus', bonus);
              return bonus.filter((b) => same(b) && b.day === day && b.kind === 'biz').map((b) => ({ sid: b.sid, name: b.name, points: b.points })).sort((a, b) => b.points - a.points);
            }
            let g = gameRow();
            if (!g) { g = { classroom: Number(classroom) || classroom, case_no: no, stage: 'chat', reps: {}, event: null, shown: null }; games.push(g); }
            const args = params.p_args || {};
            const action = params.p_action;
            if (action === 'reps') {
              if (args.role) {
                if (!BIZ.roles.includes(args.role)) throw new Error('角色组不对');
                if (!args.sid) delete g.reps[args.role];
                else {
                  const m = members.find((x) => same(x) && x.case_no === roomNo && x.side === args.role && x.sid === sidKey(args.sid));
                  if (!m) throw new Error('这位同学不在这个角色组');
                  g.reps[args.role] = { sid: m.sid, name: m.name, nick: m.nick };
                }
              } else {
                g.reps = {};
                BIZ.roles.forEach((role) => { const best = ranked(role)[0]; if (best) g.reps[role] = { sid: best.sid, name: best.name, nick: best.nick }; });
              }
            } else if (action === 'stage') {
              if (!['chat', 'vote1', 'show1', 'vote2', 'done'].includes(args.stage)) throw new Error('阶段不对');
              g.stage = args.stage;
            } else if (action === 'event') {
              if (args.key) { g.event = { key: String(args.key).slice(0, 8), title: String(args.title || '').slice(0, 40), text: String(args.text || '').slice(0, 120) }; g.stage = 'vote2'; }
              else { g.event = null; g.stage = 'show1'; write('bizvotes', votes.filter((v) => !(same(v) && v.case_no === no && v.round === 2))); votes.splice(0, votes.length, ...read('bizvotes')); }
            } else if (action === 'show') {
              g.shown = Object.keys(args).length ? args : null;
            } else if (action === 'reset') {
              write('bizvotes', votes.filter((v) => !(same(v) && v.case_no === no)));
              votes.splice(0, votes.length, ...read('bizvotes'));
              Object.assign(g, { stage: 'chat', reps: {}, event: null, shown: null });
            } else throw new Error('不支持的操作');
            write('bizgames', games);
            return gameJson(true);
          }
          const me = myCheckin(uid, classroom) || (teacher && room ? { sid: 'WBF0001', name: '王不凡', test: true } : null);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          const mem = members.find((m) => same(m) && m.case_no === roomNo && m.sid === sid);
          const chosen = () => {
            const c = read('choices').filter((row) => same(row) && row.case === no && row.item === 'biz-role' && sidKey(row.sid) === sid && BIZ.roles.includes(row.choice))
              .sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
            return c ? c.choice : null;
          };
          if (name === 'ck_biz_state') {
            const game = gameJson(false);
            if (mem) {
              const g = gameRow();
              return { status: 'joined', role: mem.side, nick: mem.nick, test: Boolean(me.test), rep: Boolean(g && g.reps && g.reps[mem.side] && g.reps[mem.side].sid === sid), game };
            }
            const role = me.test ? null : chosen();
            return { status: !role && !me.test ? 'pick' : 'nick', role, test: Boolean(me.test), rep: false, game };
          }
          if (name === 'ck_biz_join') {
            if (!room || !room.is_current) return { status: 'closed' };
            if (mem) return { status: 'ok', role: mem.side, nick: mem.nick };
            const role = me.test ? (BIZ.roles.includes(params.p_role) ? params.p_role : null) : chosen();
            if (!role) return { status: 'pick' };
            // 2026-11-18 起实名（同 cloudbase-pg.sql 的 ck_disc_join / ck_biz_join）：登录时的姓名，同名加学号末两位（还重复加末四位）；p_nick 不再使用
            const real = String(me.name || '').replace(/\s+/g, '').slice(0, 12) || `同学${String(sid).slice(-4)}`;
            const used = (value) => members.some((m) => same(m) && m.case_no === roomNo && m.nick.toLowerCase() === value.toLowerCase());
            let nick = real;
            if (used(nick)) nick = `${real.slice(0, 9)}·${String(sid).slice(-2)}`;
            if (used(nick)) nick = `${real.slice(0, 7)}·${String(sid).slice(-4)}`;
            if (used(nick)) return { status: 'taken' };
            members.push({ id: nextId(members), classroom: Number(classroom), case_no: roomNo, side: role, sid, name: me.name, nick, joined_at: new Date().toISOString() });
            write('debatemembers', members);
            return { status: 'ok', role, nick };
          }
          if (name === 'ck_biz_vote') {
            const d = Number(params.p_decision);
            if (!(d >= 1 && d <= 3) || !['A', 'B', 'C'].includes(params.p_choice)) return { status: 'bad' };
            const g = gameRow();
            const role = g && Object.keys(g.reps || {}).find((k) => g.reps[k].sid === sid);
            if (!role) return { status: 'not_rep' };
            const round = g.stage === 'vote1' ? 1 : g.stage === 'vote2' ? 2 : 0;
            if (!round || !room || !room.is_current || !room.submissions_open) return { status: 'closed' };
            const rest = votes.filter((v) => !(same(v) && v.case_no === no && v.round === round && v.decision === d && v.role === role));
            rest.push({ classroom: Number(classroom) || classroom, case_no: no, round, decision: d, role, choice: params.p_choice, sid, updated_at: new Date().toISOString() });
            write('bizvotes', rest);
            return { status: 'ok', round };
          }
          throw new Error(`未知的后台函数：${name}`);
        }
        // 辩论聊天室（规则同 cloudbase-pg.sql 的 ck_debate_state / join / post / feed / like / board / hide / leaders 与 ck_set_debate_winners）
        if (/^ck_debate_|^ck_set_debate_winners$/.test(name)) {
          const uid = await this.ensureAnonymous();
          const teacher = Boolean(localStorage.getItem(prefix + 'teacher'));
          const rooms = read('classrooms');
          // 计时同步（2026-11-20；规则同 cloudbase-pg.sql 的 ck_debate_control / ck_debate_live）
          if (name === 'ck_debate_live' || name === 'ck_debate_control') {
            const matches = read('debatematches');
            const same = (m) => String(m.classroom) === String(params.p_classroom) && m.case_no === params.p_case;
            const leftOf = (m) => (m.paused_left != null ? m.paused_left : Math.max(0, m.stage_secs - Math.floor((Date.now() - Date.parse(m.stage_at)) / 1000)));
            const stateOf = (m) => (m ? { status: 'ok', stage: m.stage, secs: m.stage_secs, left: leftOf(m), paused: m.paused_left != null, args: { pro: [], con: [] }, says: [] } : { status: 'none' });
            if (name === 'ck_debate_live') return stateOf(matches.find(same));
            teacherOnly();
            const action = params.p_action;
            const at = matches.findIndex(same);
            if (action === 'lock') {
              const row = { classroom: Number(params.p_classroom) || params.p_classroom, case_no: params.p_case, stage: 'ready', stage_at: new Date().toISOString(), stage_secs: 0, paused_left: null };
              if (at >= 0) matches[at] = row; else matches.push(row);
            } else if (action === 'reset') {
              if (at >= 0) matches.splice(at, 1);
            } else {
              const m = matches[at];
              if (!m) throw new Error('请先选定论点与辩手');
              const gone = Math.floor((Date.now() - Date.parse(m.stage_at)) / 1000);
              if (action === 'stage') Object.assign(m, { stage: params.p_stage, stage_at: new Date().toISOString(), stage_secs: Math.min(1800, Math.max(0, Number(params.p_secs) || 0)), paused_left: null });
              else if (action === 'pause') { if (m.paused_left == null) m.paused_left = leftOf(m); }
              else if (action === 'resume') { if (m.paused_left != null) Object.assign(m, { stage_at: new Date().toISOString(), stage_secs: m.paused_left, paused_left: null }); }
              else if (action === 'extend') {
                const add = params.p_secs == null ? 30 : Number(params.p_secs);
                if (m.paused_left != null) m.paused_left = Math.min(1800, Math.max(0, m.paused_left + add));
                else m.stage_secs = Math.min(1800, Math.max(0, gone + Math.max(0, m.stage_secs - gone) + add));
              } else throw new Error('没有这个操作');
            }
            write('debatematches', matches);
            return stateOf(matches.find(same));
          }
          const members = read('debatemembers');
          const posts = read('debateposts');
          const likes = read('debatelikes');
          const likeCount = (id) => likes.filter((l) => String(l.post_id) === String(id)).length;
          const ranked = (classroom, no, side, roster) => {
            const list = members.filter((m) => String(m.classroom) === String(classroom) && m.case_no === no && m.side === side && (!roster || roster.has(m.sid)))
              .map((m) => {
                const mine = posts.filter((p) => String(p.classroom) === String(classroom) && p.case_no === no && p.sid === m.sid && !p.hidden);
                return { ...m, likes: mine.reduce((s, p) => s + likeCount(p.id), 0), posts: mine.length, first: mine.length ? Math.min(...mine.map((p) => Date.parse(p.created_at))) : Infinity };
              }).filter((m) => m.posts);
            return list.sort((a, b) => b.likes - a.likes || a.first - b.first);
          };
          // 全场点赞前三（2026-11-05，规则同 cloudbase-pg.sql 的 ck_debate_leaders：点名册内、至少被赞 1 次，同票先发言的在前）
          const rosterOf = (classroom) => {
            const room = rooms.find((row) => String(row.id) === String(classroom));
            const klass = room && read('classes').find((row) => String(row.id) === String(room.class_id));
            return new Set(((klass && klass.roster) || []).map((p) => sidKey(p.sid)));
          };
          const leaders = (classroom, no) => {
            const roster = rosterOf(classroom);
            return ['pro', 'con'].flatMap((side) => ranked(classroom, no, side, roster)).filter((m) => m.likes > 0)
              .sort((a, b) => b.likes - a.likes || a.first - b.first).slice(0, DEBATE.top)
              .map((m) => ({ sid: m.sid, name: m.name, nick: m.nick, side: m.side, likes: m.likes, posts: m.posts }));
          };
          if (name === 'ck_debate_board' || name === 'ck_debate_hide' || name === 'ck_set_debate_winners') {
            teacherOnly();
            if (name === 'ck_debate_hide') {
              const post = posts.find((p) => String(p.id) === String(params.p_post));
              if (post) { post.hidden = params.p_hidden !== false; write('debateposts', posts); }
              return Boolean(post);
            }
            const room = rooms.find((row) => String(row.id) === String(params.p_classroom));
            if (!room) throw new Error('课堂不存在');
            const no = String(params.p_case);
            const day = today();
            if (name === 'ck_set_debate_winners') {
              // 2026-11-05：点赞前三各加 p_points；2026-11-21 起获胜方不再加修为（p_side 只说明结果，pro / con / none 都只给点赞前三），空＝撤销
              const bonus = read('bonus').filter((b) => !(String(b.classroom) === String(room.id) && b.day === day && b.kind === 'debate'));
              const top = params.p_side ? leaders(room.id, no) : [];
              const side = params.p_side;
              if (side) {
                if (!['pro', 'con', 'none'].includes(side)) throw new Error('请选择获胜方');
                const points = Number(params.p_points);
                if (!(points >= 1 && points <= 10)) throw new Error('每项加分应为 1—10');
                const sum = new Map();
                const add = (sid, name) => { const was = sum.get(sid); sum.set(sid, { name, points: Math.min(20, (was ? was.points : 0) + points) }); };
                top.forEach((m) => add(m.sid, m.name));
                sum.forEach((v, sid) => bonus.push({ id: nextId(bonus), course: room.course, classroom: room.id, day, kind: 'debate', sid, name: v.name, points: v.points, created_at: new Date().toISOString() }));
              }
              write('bonus', bonus);
              return bonus.filter((b) => String(b.classroom) === String(room.id) && b.day === day && b.kind === 'debate')
                .map((b) => ({ sid: b.sid, name: b.name, points: b.points, top: top.some((m) => m.sid === b.sid), win: false }))
                .sort((x, y) => y.points - x.points || String(x.name).localeCompare(String(y.name), 'zh'));
            }
            const votes = (side) => {
              const first = new Map();
              read('choices').filter((c) => String(c.classroom) === String(room.id) && c.case === no && c.item === 'debate-post').sort((a, b) => (a.ts || 0) - (b.ts || 0))
                .forEach((c) => { if (!first.has(sidKey(c.sid))) first.set(sidKey(c.sid), c.choice); });
              // 政经辩论赛的辩后票在作业里（题号 debate.post，同 cloudbase-pg.sql 的 ck_debate_board）
              read('homework').filter((h) => String(h.classroom) === String(room.id) && h.payload && h.payload['debate.post'])
                .forEach((h) => { if (!first.has(sidKey(h.sid))) first.set(sidKey(h.sid), h.payload['debate.post'].v); });
              return Array.from(first.values()).filter((v) => v === side).length;
            };
            const board = {};
            ['pro', 'con'].forEach((side) => {
              const mine = posts.filter((p) => String(p.classroom) === String(room.id) && p.case_no === no && p.side === side && !p.hidden);
              board[side] = {
                members: members.filter((m) => String(m.classroom) === String(room.id) && m.case_no === no && m.side === side).length,
                posts: mine.length,
                top: ranked(room.id, no, side).slice(0, 10).map((m) => ({ sid: m.sid, name: m.name, nick: m.nick, likes: m.likes, posts: m.posts })),
                hot: mine.map((p) => ({ id: p.id, nick: p.nick, name: (members.find((m) => m.sid === p.sid && String(m.classroom) === String(room.id) && m.case_no === no) || {}).name, text: p.text, likes: likeCount(p.id) }))
                  .sort((a, b) => b.likes - a.likes || Number(b.id) - Number(a.id)).slice(0, 6),
                all: mine.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((p) => ({ id: p.id, nick: p.nick, name: (members.find((m) => m.sid === p.sid && String(m.classroom) === String(room.id) && m.case_no === no) || {}).name, text: p.text, at: p.created_at, likes: likeCount(p.id) })),
                votes: votes(side),
              };
            });
            board.leaders = leaders(room.id, no);
            board.awarded = read('bonus').filter((b) => String(b.classroom) === String(room.id) && b.day === day && b.kind === 'debate').map((b) => ({ sid: b.sid, name: b.name, points: b.points }));
            return board;
          }
          const post = name === 'ck_debate_like' ? posts.find((p) => String(p.id) === String(params.p_post) && !p.hidden) : null;
          if (name === 'ck_debate_like' && !post) return { status: 'gone' };
          const classroom = post ? post.classroom : params.p_classroom;
          const no = post ? post.case_no : String(params.p_case);
          const room = rooms.find((row) => String(row.id) === String(classroom));
          const me = myCheckin(uid, classroom) || (teacher && room ? { sid: 'WBF0001', name: '王不凡', test: true } : null);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          const mem = members.find((m) => String(m.classroom) === String(classroom) && m.case_no === no && m.sid === sid);
          const voted = () => {
            const c = read('choices').filter((row) => String(row.classroom) === String(classroom) && row.case === no && row.item === 'debate-pre' && sidKey(row.sid) === sid && ['pro', 'con'].includes(row.choice))
              .sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
            if (c) return c.choice;
            // 政经辩论赛：辩前票在作业里（题号 debate.pre，同 cloudbase-pg.sql 的 ck_debate_side）
            const h = read('homework').find((row) => String(row.classroom) === String(classroom) && sidKey(row.sid) === sid && row.payload
              && row.payload['debate.pre'] && ['pro', 'con'].includes(row.payload['debate.pre'].v));
            return h ? h.payload['debate.pre'].v : null;
          };
          if (name === 'ck_debate_state') {
            if (mem) return { status: 'joined', side: mem.side, nick: mem.nick, test: Boolean(me.test) };
            const side = me.test ? null : voted();
            return { status: !side && !me.test ? 'pick' : 'nick', side, test: Boolean(me.test) };
          }
          if (name === 'ck_debate_join') {
            if (!room || !room.is_current) return { status: 'closed' };
            if (mem) return { status: 'ok', side: mem.side, nick: mem.nick };
            const side = me.test ? (['pro', 'con'].includes(params.p_side) ? params.p_side : null) : voted();
            if (!side) return { status: 'pick' };
            // 2026-11-18 起实名（同 cloudbase-pg.sql 的 ck_debate_join）：用登录时的姓名，同名的加学号末两位（还重复加末四位）；p_nick 不再使用
            const real = String(me.name || '').replace(/\s+/g, '').slice(0, 12) || `同学${String(sid).slice(-4)}`;
            const used = (nick) => members.some((m) => String(m.classroom) === String(classroom) && m.case_no === no && m.nick.toLowerCase() === nick.toLowerCase());
            let nick = real;
            if (used(nick)) nick = `${real.slice(0, 9)}·${String(sid).slice(-2)}`;
            if (used(nick)) nick = `${real.slice(0, 7)}·${String(sid).slice(-4)}`;
            if (used(nick)) return { status: 'taken' };
            members.push({ id: nextId(members), classroom: Number(classroom), case_no: no, side, sid, name: me.name, nick, joined_at: new Date().toISOString() });
            write('debatemembers', members);
            return { status: 'ok', side, nick };
          }
          if (!mem) return { status: 'join' };
          if (name === 'ck_debate_post') {
            if (!room || !room.is_current || !room.submissions_open) return { status: 'closed' };
            const text = String(params.p_text || '').replace(/\s+/g, ' ').trim();
            if (text.length < 2 || text.length > DEBATE.textMax) return { status: 'short' };
            const mine = posts.filter((p) => String(p.classroom) === String(classroom) && p.case_no === no && p.sid === sid);
            if (mine.some((p) => Date.now() - Date.parse(p.created_at) < DEBATE.gap)) return { status: 'wait' };
            if (mine.length >= DEBATE.perPerson) return { status: 'too_many' };
            const row = { id: nextId(posts), classroom: Number(classroom), case_no: no, side: mem.side, sid, nick: mem.nick, text, hidden: false, created_at: new Date().toISOString() };
            posts.push(row);
            write('debateposts', posts);
            return { status: 'ok', id: row.id };
          }
          if (name === 'ck_debate_like') {
            if (post.side !== mem.side) return { status: 'join' };
            if (post.sid === sid) return { status: 'mine' };
            const rest = likes.filter((l) => !(String(l.post_id) === String(post.id) && l.sid === sid));
            if (params.p_like) rest.push({ post_id: post.id, sid, created_at: new Date().toISOString() });
            write('debatelikes', rest);
            const count = rest.filter((l) => String(l.post_id) === String(post.id)).length;
            return { status: 'ok', likes: count, liked: Boolean(params.p_like) };
          }
          if (name === 'ck_debate_feed') {
            const same = (m) => String(m.classroom) === String(classroom) && m.case_no === no;
            return {
              status: 'ok', side: mem.side, nick: mem.nick,
              members: members.filter((m) => same(m) && m.side === mem.side).length,
              others: members.filter((m) => same(m) && m.side !== mem.side).length,
              posts: posts.filter((p) => same(p) && p.side === mem.side && !p.hidden).slice(-150)
                .map((p) => ({ id: p.id, nick: p.nick, text: p.text, at: p.created_at, mine: p.sid === sid, likes: likeCount(p.id), liked: likes.some((l) => String(l.post_id) === String(p.id) && l.sid === sid) })),
              top: ranked(classroom, no, mem.side).slice(0, DEBATE.top).map((m) => ({ nick: m.nick, likes: m.likes, me: m.sid === sid })),
              leaders: leaders(classroom, no).map((m) => ({ nick: m.nick, side: m.side, likes: m.likes, me: m.sid === sid })),
              list: members.filter((m) => same(m) && m.side === mem.side).map((m) => {
                const mine = posts.filter((p) => same(p) && p.sid === m.sid && !p.hidden);
                const seen = read('presence').find((r) => String(r.classroom) === String(classroom) && r.sid === m.sid);
                return { nick: m.nick, me: m.sid === sid, likes: mine.reduce((n, p) => n + likeCount(p.id), 0), posts: mine.length,
                  online: Boolean(seen && Date.now() - Date.parse(seen.last_seen) < 120000), joined: m.joined_at };
              }).sort((a, b) => b.likes - a.likes || String(a.joined).localeCompare(String(b.joined))),
            };
          }
        }
        // 期中考查作业打分（规则同 cloudbase-pg.sql 的 ck_save_exam_score）
        if (name === 'ck_save_exam_score') {
          teacherOnly();
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room || !/^exam\d{2}$/.test(room.chapter)) throw new Error('这不是期中考查作业的课堂');
          const sid = sidKey(params.p_sid);
          const score = params.p_score == null || params.p_score === '' ? null : Number(params.p_score);
          if (score != null && !(score >= 0 && score <= 100 && Number.isInteger(score * 2))) throw new Error('得分应为 0—100（可到 0.5 分）');
          const comment = String(params.p_comment || '').trim().slice(0, 1000) || null;
          const rows = read('examscores');
          const at = rows.findIndex((row) => String(row.classroom) === String(room.id) && row.sid === sid);
          if (score == null && !comment) { if (at >= 0) rows.splice(at, 1); write('examscores', rows); return {}; }
          const row = at >= 0 ? rows[at] : { id: nextId(rows), classroom: room.id, sid };
          Object.assign(row, { name: String(params.p_name || '').trim().slice(0, 40) || row.name || null, score, comment, graded_at: new Date().toISOString() });
          if (at < 0) rows.push(row);
          write('examscores', rows);
          return { ...row };
        }
        if (name === 'ck_decide_pin_request') {
          teacherOnly();
          const asks = read('pinreqs');
          const ask = asks.find((row) => String(row.id) === String(params.p_id));
          if (!ask) throw new Error('申请不存在');
          const at = new Date().toISOString();
          if (params.p_allow) {
            const pins = read('pins');
            let pin = pins.find((row) => String(row.class_id) === String(ask.class_id) && row.sid === ask.sid);
            if (!pin) { pin = { class_id: ask.class_id, sid: ask.sid }; pins.push(pin); }
            Object.assign(pin, { pin_hash: null, salt: null, fails: 0, locks: 0, locked_until: null, set_at: null, updated_at: at, reset_owner: ask.owner });
            write('pins', pins);
          }
          Object.assign(ask, { status: params.p_allow ? 'approved' : 'rejected', decided_at: at });
          write('pinreqs', asks);
          secLog(params.p_allow ? 'pin_allow' : 'pin_deny', { course: ask.course, class_id: ask.class_id, sid: ask.sid, name: ask.name, owner: 'teacher' });
          return params.p_allow ? 'approved' : 'rejected';
        }
        // 这堂课感觉怎么样（规则同 cloudbase-pg.sql 的 ck_set_mood / ck_my_mood / ck_mood_stats）：每人每个课堂每天一票，老师只看人数
        if (name === 'ck_set_mood' || name === 'ck_my_mood') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          const day = today();
          const rows = read('moods');
          const mineAt = (row) => String(row.classroom) === String(params.p_classroom) && me && row.sid === sidKey(me.sid) && row.day === day;
          if (name === 'ck_my_mood') { const row = rows.find(mineAt); return row ? row.mood : 0; }
          if (!me) return { status: 'login' };
          if (!read('classrooms').some((row) => String(row.id) === String(params.p_classroom) && row.is_current)) return { status: 'closed' };
          const mood = Number(params.p_mood);
          if (![-1, 0, 1].includes(mood)) throw new Error('请选择笑脸或不高兴的脸');
          const rest = rows.filter((row) => !mineAt(row));
          if (mood) rest.push({ classroom: Number(params.p_classroom), sid: sidKey(me.sid), day, mood, at: new Date().toISOString() });
          write('moods', rest);
          // 隐藏彩蛋（2026-11-05）：点笑脸加 EGG.mood 修为，每人每天只加一次（本班各课堂合起来；改选、撤回再点都不再加）
          let bonus = 0;
          if (mood === 1) {
            const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
            const sameClass = new Set(read('classrooms').filter((row) => row.course === room.course && String(row.class_id || '') === String(room.class_id || '')).map((row) => String(row.id)));
            const list = read('bonus');
            if (!list.some((row) => row.kind === 'mood' && row.sid === sidKey(me.sid) && row.day === day && sameClass.has(String(row.classroom)))) {
              list.push({ id: `${Date.now()}-mood`, course: room.course, classroom: room.id, day, kind: 'mood', sid: sidKey(me.sid), name: me.name, points: EGG.mood, created_at: new Date().toISOString() });
              write('bonus', list);
              bonus = EGG.mood;
            }
          }
          return { status: 'ok', mood, bonus };
        }
        if (name === 'ck_mood_stats') {
          if (!localStorage.getItem(prefix + 'teacher')) return [];
          const ids = new Set((params.p_classrooms || []).map(String));
          const groups = new Map();
          read('moods').filter((row) => ids.has(String(row.classroom))).forEach((row) => {
            const key = `${row.classroom}|${row.day}`;
            const item = groups.get(key) || { classroom: row.classroom, day: row.day, up: 0, down: 0 };
            if (row.mood > 0) item.up += 1; else item.down += 1;
            groups.set(key, item);
          });
          return Array.from(groups.values()).sort((a, b) => String(b.day).localeCompare(String(a.day)));
        }
        // 章节页核对本人是否已登录本课堂；每天第一次打开补记一次加入
        if (name === 'ck_checkin_today') {
          const uid = await this.ensureAnonymous();
          const open = classroomState(params.p_classroom) !== null;
          let me = myCheckin(uid, params.p_classroom);
          if (!me || sidKey(me.sid) !== sidKey(params.p_sid)) {
            me = myCheckin(uid, params.p_classroom, true);   // 旁听（2026-11-05）
            if (!me || sidKey(me.sid) !== sidKey(params.p_sid)) return open ? 'login' : 'past';
          }
          if (open && me.session !== today()) {
            const rows = read('checkins');
            rows.push({ ...me, id: nextId(rows), session: today(), ts: Date.now() });
            write('checkins', rows);
          }
          // 2026-11-04：已登录过的设备直接打开章节页，也刷新“最近登录”（规则同 cloudbase-pg.sql，2 分钟内不重复写）
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const devices = read('devices');
          const mine = room && devices.find((d) => String(d.class_id) === String(room.class_id) && d.sid === sidKey(me.sid) && d.owner === uid);
          if (mine && Date.now() - Date.parse(mine.last_at || 0) > 120000) {
            mine.last_at = new Date().toISOString();
            write('devices', devices);
          }
          visitTouch(params.p_classroom, sidKey(me.sid), me.name, uid, 'open', me.auditor);
          // 隐藏彩蛋（2026-11-05，规则同 cloudbase-pg.sql）：每人每天记一次登录；同一周（周一至周日）满 EGG.days 天加 EGG.week 修为，每周一次。旁听不算
          if (!me.auditor && room && room.class_id != null) {
            const days = read('logindays');
            const sid = sidKey(me.sid);
            const day = today();
            if (!days.some((row) => String(row.class_id) === String(room.class_id) && row.sid === sid && row.day === day)) {
              days.push({ class_id: room.class_id, sid, day });
              write('logindays', days);
              const at = new Date(`${day}T00:00:00Z`);
              const monday = new Date(at.getTime() - ((at.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
              const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
              const count = days.filter((row) => String(row.class_id) === String(room.class_id) && row.sid === sid && row.day >= monday && row.day <= sunday).length;
              const classRooms = new Set(read('classrooms').filter((row) => String(row.class_id) === String(room.class_id)).map((row) => String(row.id)));
              const list = read('bonus');
              if (count >= EGG.days && !list.some((row) => row.kind === 'week' && row.sid === sid && row.day === monday && classRooms.has(String(row.classroom)))) {
                list.push({ id: `${Date.now()}-week`, course: room.course, classroom: room.id, day: monday, kind: 'week', sid, name: me.name, points: EGG.week, created_at: new Date().toISOString() });
                write('bonus', list);
                return ['ok', { bonus: EGG.week, kind: 'week', days: count }];
              }
            }
          }
          return me.auditor ? 'audit' : 'ok';
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
        // 小游戏“老师开始”（2026-11-22，规则同 cloudbase-pg-20261122-小游戏老师开始.sql）：本机表 gamestarts（每课堂每个小游戏一行）
        if (name === 'ck_game_started' || name === 'ck_game_start') {
          let rows = read('gamestarts');
          if (name === 'ck_game_start') {
            teacherOnly();
            if (!read('classrooms').some((r) => String(r.id) === String(params.p_classroom))) throw new Error('课堂不存在');
            if (!/^(mech|disc|biz):\d{2}$/.test(params.p_game || '')) throw new Error('小游戏编号不对');
            rows = rows.filter((r) => !(String(r.classroom) === String(params.p_classroom) && r.game === params.p_game));
            if (params.p_on !== false) rows.push({ classroom: params.p_classroom, game: params.p_game, started_at: new Date().toISOString() });
            write('gamestarts', rows);
          }
          const started = {};
          rows.filter((r) => String(r.classroom) === String(params.p_classroom)).forEach((r) => { started[r.game] = r.started_at; });
          return { status: 'ok', started };
        }
        // 机制图闯关看板（2026-11-20，规则同 cloudbase-pg-20261120-抢答与闯关.sql 的 ck_mech_report / ck_mech_board）：本机表 mechruns（每课堂每案例每人一行）
        if (name === 'ck_mech_report' || name === 'ck_mech_board') {
          const runs = read('mechruns');
          const mine = (r) => String(r.classroom) === String(params.p_classroom) && r.case_no === params.p_case;
          if (name === 'ck_mech_board') {
            teacherOnly();
            const rows = runs.filter(mine);
            const miss = {};
            rows.forEach((r) => Object.keys(r.miss || {}).forEach((k) => { if (Number(r.miss[k]) > 0) miss[k] = (miss[k] || 0) + 1; }));
            const cleared = rows.filter((r) => r.cleared_at).sort((x, y) => x.cleared_at - y.cleared_at);
            return { status: 'ok', players: rows.length, chain: rows.filter((r) => r.chain).length, cleared: cleared.length, miss,
              list: cleared.slice(0, 12).map((r) => ({ name: r.name, ms: r.used_ms, miss: Object.values(r.miss || {}).reduce((sum, v) => sum + (Number(v) || 0), 0) })) };
          }
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: localStorage.getItem(prefix + 'teacher') ? 'preview' : 'login' };
          if (!/^\d{2}$/.test(params.p_case || '') || !params.p_state || typeof params.p_state !== 'object' || Array.isArray(params.p_state)) throw new Error('参数不对');
          const st = params.p_state;
          const int = (v, d) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : d);
          const total = Math.min(20, int(st.total, 0));
          const step = Math.min(total, int(st.step, 0));
          const clear = st.clear === true && total > 0 && step >= total;
          const missIn = {};
          Object.keys(st.miss && typeof st.miss === 'object' ? st.miss : {}).forEach((k) => {
            if (/^(next|[①②③④⑤⑥]→[①②③④⑤⑥])$/.test(k) && /^\d{1,4}$/.test(String(st.miss[k]))) missIn[k] = Math.min(99, Number(st.miss[k]));
          });
          const sid = sidKey(me.sid);
          let row = runs.find((r) => mine(r) && r.sid === sid);
          if (!row) {
            row = { id: nextId(runs), classroom: params.p_classroom, case_no: params.p_case, sid, name: me.name, step: 0, total: 0, chain: false, miss: {}, tries: 1, used_ms: null, cleared_at: null };
            runs.push(row);
          }
          if (!row.cleared_at) { row.step = Math.max(row.step, step); row.total = total; row.miss = missIn; }   // 通关以后再闯，不改第一次的成绩
          row.chain = row.chain || st.chain === true || clear;
          row.tries = Math.max(row.tries, Math.min(99, Math.max(1, int(st.tries, 1))));
          if (clear && !row.cleared_at) { row.cleared_at = Date.now(); row.used_ms = Math.min(3600000, int(st.ms, 0)); }
          row.name = me.name;
          write('mechruns', runs);
          return { status: 'ok' };
        }
        // 限时抢答与闯关（2026-11-20，规则同 cloudbase-pg-20261120-抢答与闯关.sql 的 ck_act_control / live / answer / board）：
        // 本机表 actgames（每课堂每案例每种玩法一行，含参考答案）、actanswers（每人每局一次）；后台时钟用 performance 的时刻
        if (/^ck_act_(control|live|answer|board)$/.test(name)) {
          const clock = () => Math.round(performance.timeOrigin + performance.now());
          const norm = (text) => Array.from(new Set(String(text == null ? '' : text).split(',').map((v) => v.trim()).filter(Boolean))).sort().join(',');
          const games = read('actgames');
          const sameRoom = (g) => String(g.classroom) === String(params.p_classroom);
          const stateOf = (g) => ({ id: g.id, case: g.case_no, kind: g.kind, mode: g.mode, go_at: g.go_at, secs: g.secs, closed: Boolean(g.closed_at), top: g.top, points: g.points, now: clock() });
          const room = read('classrooms').find((r) => String(r.id) === String(params.p_classroom));
          const explainOf = (g) => {
            const out = {};
            read('explainbank').filter((e) => room && e.course === g.course && e.unit === room.chapter && Object.keys(g.answer).some((k) => `${g.case_no}:${k}` === e.key))
              .forEach((e) => { const { need, ...body } = e.body || {}; out[e.key] = body; });
            return out;
          };
          if (name === 'ck_act_control') {
            teacherOnly();
            if (!room) throw new Error('课堂不存在');
            let g = games.find((x) => sameRoom(x) && x.case_no === params.p_case && x.kind === params.p_kind);
            const now = clock();
            if (params.p_action === 'start') {
              const mode = params.p_mode || 'game';
              if (mode === 'game' && !(params.p_answer && Object.keys(params.p_answer).length)) throw new Error('开局要带参考答案');
              const next = { mode, answer: params.p_answer || {}, go_at: now + Math.min(30, Math.max(0, params.p_delay == null ? 5 : Number(params.p_delay))) * 1000,
                secs: Math.min(1800, Math.max(0, params.p_secs == null ? 60 : Number(params.p_secs))), closed_at: null };
              if (g) Object.assign(g, next);
              else { g = { id: Math.max(0, ...games.map((x) => Number(x.id) || 0)) + 1, course: room.course, classroom: room.id, case_no: params.p_case, kind: params.p_kind, top: 10, points: 5, ...next }; games.push(g); }
            } else if (params.p_action === 'reset') {
              write('actgames', games.filter((x) => x !== g));
              if (g) write('actanswers', read('actanswers').filter((a) => a.game_id !== g.id));
              return { status: 'none' };
            } else {
              if (!g) return { status: 'none' };
              if (params.p_action === 'extend') {
                g.secs = Math.min(1800, Math.max(g.secs, Math.ceil((now - g.go_at) / 1000)) + Math.min(600, Math.max(5, params.p_secs == null ? 30 : Number(params.p_secs))));
                g.closed_at = null;
              } else if (params.p_action === 'stop') g.closed_at = g.closed_at || now;
              else throw new Error('不认识的操作');
            }
            write('actgames', games);
            return { status: 'ok', game: stateOf(g) };
          }
          if (name === 'ck_act_board') {
            teacherOnly();
            const g = games.find((x) => sameRoom(x) && x.case_no === params.p_case && x.kind === params.p_kind);
            if (!g) return { status: 'none', now: clock() };
            const list = read('actanswers').filter((a) => a.game_id === g.id).sort((x, y) => x.at - y.at);
            const items = {};
            Object.keys(g.answer).forEach((k) => { items[k] = list.filter((a) => norm((a.value || {})[k]) === norm(g.answer[k])).length; });
            return { status: 'ok', game: stateOf(g), total: list.length, right: list.filter((a) => a.ok).length, items,
              list: list.map((a) => ({ sid: a.sid, name: a.name, ok: a.ok, right: a.right_n, total: a.total_n, place: a.place, bonus: a.bonus, ms: a.used_ms })) };
          }
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me && !localStorage.getItem(prefix + 'teacher')) return { status: 'login' };
          const sid = me ? sidKey(me.sid) : null;
          const answers = read('actanswers');
          if (name === 'ck_act_live') {
            return { status: 'ok', now: clock(), games: games.filter(sameRoom).map((g) => {
              const mine = sid ? answers.find((a) => a.game_id === g.id && a.sid === sid) : null;
              const { now: skip, ...rest } = stateOf(g);
              return { ...rest, mine: mine ? { value: mine.value, right: mine.right_n, total: mine.total_n, ok: mine.ok, place: mine.place, bonus: mine.bonus } : null,
                key: g.kind === 'quest' && mine ? g.answer : null, explain: g.kind === 'quest' && mine ? explainOf(g) : null };
            }) };
          }
          const g = games.find((x) => String(x.id) === String(params.p_game) && sameRoom(x));
          if (!g) return { status: 'gone' };
          if (g.mode !== 'game') return { status: 'plain' };
          const a = (params.p_value && params.p_value.a) || {};
          const keys = Object.keys(g.answer);
          const right = keys.filter((k) => norm(a[k]) === norm(g.answer[k])).length;
          const ok = keys.length > 0 && right === keys.length;
          const extra = g.kind === 'quest' ? { key: g.answer, explain: explainOf(g) } : {};
          if (!me) return { status: 'ok', preview: true, place: null, bonus: 0, ok, right, total: keys.length, ...extra };   // 学生版测试页里的教师账号：只判不记
          const old = answers.find((x) => x.game_id === g.id && x.sid === sid);
          if (old) return { status: 'done', place: old.place, bonus: old.bonus, ...extra, ok: old.ok, right: old.right_n, total: old.total_n, value: old.value };
          if (g.closed_at) return { status: 'closed' };
          const now = clock();
          if (now < g.go_at) return { status: 'wait', go_at: g.go_at, now };
          if (now > g.go_at + g.secs * 1000 + 8000) return { status: 'late' };
          let place = null;
          let bonus = 0;
          if (ok && g.kind === 'rush') { place = answers.filter((x) => x.game_id === g.id && x.ok).length + 1; bonus = place <= g.top ? g.points : 0; }
          else if (ok) bonus = g.points;
          answers.push({ id: nextId(answers), game_id: g.id, classroom: g.classroom, sid, name: me.name, value: a, right_n: right, total_n: keys.length, ok, place, bonus, used_ms: Math.max(0, now - g.go_at), at: now });
          write('actanswers', answers);
          if (bonus > 0) {
            const bonusRows = read('bonus');
            const hit = bonusRows.find((b) => String(b.classroom) === String(g.classroom) && b.day === today() && b.kind === g.kind && b.sid === sid);
            if (hit) hit.points = Math.min(100, (Number(hit.points) || 0) + bonus);
            else bonusRows.push({ id: `${Date.now()}-${g.kind}`, course: g.course, classroom: g.classroom, day: today(), kind: g.kind, sid, name: me.name, points: bonus, created_at: new Date().toISOString() });
            write('bonus', bonusRows);
          }
          // 普通题号的作答补记进 choices（“理论匹配”一问题号以 k 结尾，不记）；已有记录的不动
          const choices = read('choices');
          const labels = (params.p_value && params.p_value.l) || {};
          keys.filter((k) => !/^tk-\d+k$/.test(k) && a[k]).forEach((k) => {
            if (choices.some((c) => String(c.classroom) === String(g.classroom) && sidKey(c.sid) === sid && c.case === g.case_no && c.item === k)) return;
            choices.push({ id: nextId(choices), owner: uid, course: g.course, classroom: g.classroom, session: today(), name: me.name, sid: me.sid, path: '', case: g.case_no, item: k,
              choice: norm(a[k]), label: String(labels[k] || '').slice(0, 120), ts: Date.now() });
          });
          write('choices', choices);
          return { status: 'ok', place, bonus, ok, right, total: keys.length, ...extra };
        }
        // 情境猜谜抢答（规则同 cloudbase-pg.sql 的 ck_puzzle_open / close / live / guess）
        // 模拟“后台时钟”：用 performance 的时刻，不受页面里改动 Date.now 的影响（本机测试倒计时同步时用）
        const serverClock = () => Math.round(performance.timeOrigin + performance.now());
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
          // 游戏状态：出题＝ask，倒计时 PUZZLE.delay 秒（规则同 cloudbase-pg.sql）
          const goAt = serverClock() + PUZZLE.delay * 1000;
          const games = read('puzzlegames').filter((g) => String(g.classroom) !== String(room.id));
          games.push({ classroom: room.id, course: room.course, phase: 'ask', round_id: row.id, label: row.label, surface: row.surface, go_at: goAt, seen_at: serverClock(), updated_at: serverClock() });
          write('puzzlegames', games);
          return { id: row.id, points: row.points, winner_sid: row.winner_sid, winner_name: row.winner_name, won_at: row.won_at, delay: PUZZLE.delay, go_at: goAt, now: serverClock() };
        }
        // 投屏页大屏的游戏状态（规则同 cloudbase-pg.sql 的 ck_puzzle_game）：rules / reveal / end / beat
        if (name === 'ck_puzzle_game') {
          teacherOnly();
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) throw new Error('课堂不存在');
          const action = params.p_action;
          const games = read('puzzlegames');
          let game = games.find((g) => String(g.classroom) === String(room.id));
          if (['rules', 'reveal', 'end'].includes(action)) {
            const rows = read('puzzles');
            rows.forEach((row) => { if (String(row.classroom) === String(room.id)) row.is_open = false; });
            write('puzzles', rows);
          }
          if (action === 'beat') { if (game) game.seen_at = serverClock(); }
          else if (action === 'rules') {
            if (!game) games.push(game = { classroom: room.id, course: room.course });
            Object.assign(game, { phase: 'rules', round_id: null, label: '', surface: '', go_at: null, seen_at: serverClock(), updated_at: serverClock() });
          } else if (action === 'reveal') {
            if (!game) games.push(game = { classroom: room.id, course: room.course, round_id: null, label: '', surface: '' });
            Object.assign(game, { phase: 'reveal', go_at: null, seen_at: serverClock(), updated_at: serverClock() });
          } else if (action === 'end') {
            game = null;
            write('puzzlegames', games.filter((g) => String(g.classroom) !== String(room.id)));
            return { phase: null, now: serverClock() };
          } else throw new Error(`不认识的操作：${action}`);
          write('puzzlegames', games);
          return { phase: game ? game.phase : null, now: serverClock() };
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
            const now = serverClock();
            const game = read('puzzlegames').find((g) => String(g.classroom) === String(params.p_classroom));
            let row = null;
            let phase = 'ask';
            if (game) {
              if (now - game.seen_at > 150000 || new Date(game.updated_at).toDateString() !== new Date(now).toDateString()) return { status: 'none', now };
              row = game.round_id != null ? rows.find((item) => String(item.id) === String(game.round_id)) || null : null;
              phase = game.phase === 'ask' && (!row || !row.is_open) ? 'reveal' : game.phase;
            } else {
              row = rows.filter((item) => String(item.classroom) === String(params.p_classroom) && item.is_open && item.day === today()).pop();
              if (!row) return { status: 'none', now };
            }
            const mine = row ? mineOf(row) : [];
            return { status: 'open', phase, round: row ? row.id : null, label: (game && game.label) || (row && row.label) || '', surface: (game && game.surface) || (row && row.surface) || '',
              points: row ? row.points : null, tries: PUZZLE.tries, used: mine.length, won: Boolean(row && row.winner_sid),
              mine: !row ? null : row.winner_sid === sid ? 'won' : mine.some((g) => g.ok) ? 'right' : null,
              go_at: phase === 'ask' && game && game.go_at ? game.go_at : null, now };
          }
          const guess = puzzleNorm(params.p_text);
          if (!guess) return { status: 'empty' };
          const row = rows.find((item) => String(item.id) === String(params.p_round) && String(item.classroom) === String(params.p_classroom));
          if (!row || !row.is_open || row.day !== today()) return { status: 'closed' };
          const game = read('puzzlegames').find((g) => String(g.classroom) === String(params.p_classroom) && String(g.round_id) === String(row.id));
          if (game && game.go_at && game.go_at > serverClock()) return { status: 'wait', go_at: game.go_at, now: serverClock() };
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
          if (!me) {
            // 2026-11-21 只查看历史课堂的也累计在线时长：这台设备在这个课堂有过“查看”的记录，就接着往下记（不点小绿灯）
            const seen = read('visits').filter((v) => String(v.classroom) === String(params.p_classroom) && v.owner === uid && v.kind === 'view')
              .sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at))[0];
            if (seen) visitTouch(params.p_classroom, seen.sid, seen.name, uid, 'view', seen.auditor);
            return false;
          }
          const rows = read('presence');
          const sid = sidKey(me.sid);
          const row = rows.find((item) => String(item.classroom) === String(params.p_classroom) && item.sid === sid);
          const now = new Date().toISOString();
          if (!row) rows.push({ classroom: Number(params.p_classroom), sid, name: me.name, owner: uid, last_seen: now });
          else if (Date.now() - Date.parse(row.last_seen) > 20000) Object.assign(row, { name: me.name, owner: uid, last_seen: now });
          write('presence', rows);
          visitTouch(params.p_classroom, sid, me.name, uid, 'ping', false);
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
          const makeup = makeupOpen(uid, params.p_classroom);   // 请假补做（2026-11-19）
          const room = read('classrooms').find((row) => row.id === params.p_classroom && ((row.is_current && row.submissions_open) || makeup));
          if (!room || room.chapter !== params.p_unit) throw new Error('new row violates row-level security policy (mock)');
          if (room.deadline && Date.now() > Date.parse(room.deadline)) throw Object.assign(new Error('已过递交截止时间'), { code: '42501' });
          if (!memberOk(uid, params.p_classroom, params.p_sid, params.p_name)) throw Object.assign(new Error('请回首页重新登录（本课堂需核对身份）'), { code: '42501' });
          if (isStopped(stopsOf(params.p_classroom), params.p_key) && !makeup) throw Object.assign(new Error('老师已停止递交这道题'), { code: '42501' });
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
          // 修为榜隐匿姓名（同 ck_rank_hidden）：别人看到“***”，本人带真名和 hidden，教师照常
          const hidden = new Set(read('rankhidden').filter((row) => row.course === room.course && Number(row.class_id) === (Number(room.class_id) || 0)).map((row) => row.sid));
          const rows = read('realms').filter((row) => row.course === room.course && Number(row.class_id) === (Number(room.class_id) || 0) && Number(row.points) > 0)
            .sort((a, b) => Number(b.points) - Number(a.points) || String(a.sid).localeCompare(String(b.sid)));
          const sectOf = new Map(read('sectmembers').filter((m) => m.course === room.course && Number(m.class_id) === (Number(room.class_id) || 0) && m.sect !== 'sanxiu').map((m) => [m.sid, m.sect]));
          // 2026-11-11：元婴（3）以上照常显示姓名
          const ranked = rows.map((row) => ({ ...row, hidden: Number(row.realm) < 3 && hidden.has(row.sid), sect: sectOf.get(row.sid) || null, rank: 1 + rows.filter((other) => Number(other.points) > Number(row.points)).length }));
          const mine = ranked.find((row) => row.sid === sid);
          return { status: 'ok', total: ranked.length, updated_at: ranked.reduce((at, row) => (row.updated_at > at ? row.updated_at : at), '') || null,
            top: ranked.filter((row, i) => row.rank <= 10 && i < 15).map((row) => ({ rank: row.rank, name: row.hidden && sid !== null && row.sid !== sid ? '***' : row.name,
              hidden: row.hidden, sect: row.sect, realm: row.realm, stage: row.stage, points: Number(row.points), me: sid !== null && row.sid === sid })),
            mine: mine ? { rank: mine.rank, realm: mine.realm, stage: mine.stage, points: Number(mine.points), hidden: mine.hidden, can_hide: Number(mine.realm) === 2, locked: Number(mine.realm) >= 3, sect: mine.sect } : null };
        }
        // 宗主任期（2026-11-22，规则同 cloudbase-pg.sql 的 ck_sect_terms_roll）：每周一推选，本宗元婴以上、班级还在的弟子里修为最高的担任；
        //   连任最多两周，做满的这一轮不再当；都轮过一遍以后开新一轮（刚做满两周的排到最后）。本周已经定好、人也还够格的不动。返回本课程本周的宗主
        const sectTermsOf = (course) => {
          const now8 = new Date(Date.now() + 8 * 3600000);
          const monday = Date.UTC(now8.getUTCFullYear(), now8.getUTCMonth(), now8.getUTCDate() - ((now8.getUTCDay() + 6) % 7));
          const week = new Date(monday).toISOString().slice(0, 10), prevWeek = new Date(monday - 7 * 86400000).toISOString().slice(0, 10);
          const classes = new Set(read('classes').map((row) => Number(row.id)));
          const members = read('sectmembers').filter((m) => m.course === course && SECTS.some((item) => item.key === m.sect) && Number(m.realm) >= 3 && classes.has(Number(m.class_id)));
          const same = (a, b) => Boolean(a && b) && Number(a.class_id) === Number(b.class_id) && String(a.sid) === String(b.sid);
          let terms = read('sectterms');
          let changed = false;
          SECTS.forEach((item) => {
            const ok = members.filter((m) => m.sect === item.key)
              .sort((a, b) => Number(b.points) - Number(a.points) || String(a.joined_at).localeCompare(String(b.joined_at)) || String(a.sid).localeCompare(String(b.sid)));
            const mine = terms.filter((t) => t.course === course && t.sect === item.key);
            const cur = mine.find((t) => t.week === week);
            if (cur ? ok.some((m) => same(m, cur)) : !ok.length) return;
            const prev = mine.find((t) => t.week === prevWeek);
            let round = Math.max(1, ...mine.map((t) => Number(t.round) || 1));
            const done = Boolean(prev && Number(prev.streak) >= 2);
            const servedOut = (m) => mine.some((t) => Number(t.round) === round && Number(t.streak) >= 2 && same(t, m));
            let pick = ok.find((m) => !(done && same(m, prev)) && !servedOut(m));
            if (!pick && ok.length) { round += 1; pick = ok.find((m) => !(done && same(m, prev))) || ok[0]; }
            terms = terms.filter((t) => t !== cur);
            if (pick) terms.push({ course, sect: item.key, week, class_id: Number(pick.class_id), sid: pick.sid, name: pick.name, points: Number(pick.points) || 0, realm: Number(pick.realm) || 0,
              streak: prev && same(prev, pick) ? Number(prev.streak) + 1 : 1, round });
            changed = true;
          });
          if (changed) write('sectterms', terms);
          return { week, terms: terms.filter((t) => t.course === course && t.week === week), all: terms.filter((t) => t.course === course) };
        };
        const sectLord = (course, term) => {   // 宗主现在的修为、境界、小境界
          const m = read('sectmembers').find((row) => row.course === course && Number(row.class_id) === Number(term.class_id) && String(row.sid) === String(term.sid)) || term;
          const r = read('realms').find((row) => row.course === course && Number(row.class_id) === Number(term.class_id) && String(row.sid) === String(term.sid));
          return { name: m.name, class_name: m.class_name || '', points: Number(m.points) || 0, realm: Number(m.realm) || 0, stage: r ? Number(r.stage) || 0 : 0 };
        };
        // 教师：本课程本周的宗主和任期记录（规则同 cloudbase-pg.sql 的 ck_sect_leader_list）
        if (name === 'ck_sect_leader_list') {
          if (!localStorage.getItem(prefix + 'teacher')) throw new Error('只有教师账号可以查看宗主任期');
          const { week, terms, all } = sectTermsOf(params.p_course);
          return { week,
            leaders: terms.map((t) => ({ sect: t.sect, class_id: t.class_id, sid: t.sid, weeks: t.streak, round: t.round, ...sectLord(params.p_course, t) })),
            history: all.slice().sort((a, b) => String(b.week).localeCompare(String(a.week))).map((t) => ({ week: t.week, sect: t.sect, class_id: t.class_id, sid: t.sid, name: t.name, points: t.points, weeks: t.streak, round: t.round, class_name: sectLord(params.p_course, t).class_name })) };
        }
        // 宗门榜与拜入宗门（规则同 cloudbase-pg.sql 的 ck_sect_board / ck_sect_join）
        if (name === 'ck_sect_board' || name === 'ck_sect_join') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) return { status: 'login' };
          const classId = Number(room.class_id) || 0;
          // 本机测试版里同一个浏览器常常也登录着教师工作台：有本人加入记录时按学生算，没有时教师才看到不带本人的宗门榜
          const me = myCheckin(await this.ensureAnonymous(), params.p_classroom);
          const teacher = !me && name === 'ck_sect_board' && Boolean(localStorage.getItem(prefix + 'teacher'));
          if (!me && !teacher) return { status: 'login' };
          const sid = me ? sidKey(me.sid) : null;
          const realm = sid && read('realms').find((row) => row.course === room.course && Number(row.class_id) === classId && row.sid === sid);
          const list = read('sectmembers');
          const old = sid && list.find((m) => m.course === room.course && Number(m.class_id) === classId && m.sid === sid);
          if (name === 'ck_sect_join') {
            const want = String(params.p_sect || '');
            if (!SECTS.some((item) => item.key === want) && want !== 'sanxiu') throw new Error('没有这个宗门');
            if (!realm || Number(realm.realm) < SECT_MIN_REALM) return { status: 'realm' };
            // 2026-11-05 用户：“学生只有一次更改宗门的机会。”——拜入后可改投他宗一次，不能退为散修；散修拜入不算改投
            let changes = old ? Number(old.changes) || 0 : 0;
            if (old && old.sect !== 'sanxiu') {
              if (old.sect === want) return { status: 'ok', sect: want, changes };
              if (want === 'sanxiu' || changes >= 1) return { status: 'locked', sect: old.sect, changes };
              changes += 1;
            }
            const klass = read('classes').find((row) => Number(row.id) === classId);
            const at = new Date().toISOString();
            const row = { id: old ? old.id : Date.now(), course: room.course, class_id: classId, class_name: klass ? klass.name : '', sid, name: realm.name, sect: want,
              points: Number(realm.points) || 0, realm: Number(realm.realm) || 0, changes, joined_at: old && old.sect === want ? old.joined_at : at, updated_at: at };
            write('sectmembers', list.filter((m) => m !== old).concat(row));
            return { status: 'ok', sect: want, changes };
          }
          const inCourse = list.filter((m) => m.course === room.course);
          const sum = (rows) => rows.reduce((total, m) => total + (Number(m.points) || 0), 0);
          const lords = sectTermsOf(room.course).terms;   // 本周宗主（2026-11-22）：学生看到境界、修为、连任第几周，不带姓名
          return { status: 'ok',
            sects: SECTS.map((item) => {
              const rows = inCourse.filter((m) => m.sect === item.key);
              const mineClass = rows.filter((m) => Number(m.class_id) === classId);
              const term = lords.find((t) => t.sect === item.key);
              const lord = term ? sectLord(room.course, term) : null;
              return { key: item.key, points: sum(rows), members: rows.length, class_members: mineClass.length, class_points: sum(mineClass),
                leader: term ? { realm: lord.realm, stage: lord.stage, points: lord.points, weeks: term.streak, here: Number(term.class_id) === classId,
                  mine: !teacher && Number(term.class_id) === classId && String(term.sid) === String(sid), ...(teacher ? { name: lord.name, class_name: lord.class_name } : {}) } : null };
            }),
            sanxiu: inCourse.filter((m) => m.sect === 'sanxiu').length,
            class_sanxiu: inCourse.filter((m) => m.sect === 'sanxiu' && Number(m.class_id) === classId).length,
            classes: new Set(inCourse.filter((m) => m.sect !== 'sanxiu').map((m) => Number(m.class_id))).size,
            mine: teacher ? null : { sect: old ? old.sect : null, realm: realm ? Number(realm.realm) : null, points: realm ? Number(realm.points) : old ? Number(old.points) : null,
              can_join: Boolean(realm && Number(realm.realm) >= SECT_MIN_REALM), changes: old ? Number(old.changes) || 0 : 0,
              can_change: Boolean(realm && Number(realm.realm) >= SECT_MIN_REALM && old && old.sect !== 'sanxiu' && !(Number(old.changes) >= 1)) } };
        }
        // 灵根八相（规则同 cloudbase-pg.sql 的 ck_my_lingen：本班全学期、不含期中考查作业；本人八项＋全班平均＋刻度上限；教师调用时 me 为空）
        if (name === 'ck_my_lingen') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) return { status: 'login' };
          const me = myCheckin(await this.ensureAnonymous(), params.p_classroom);
          const teacher = !me && Boolean(localStorage.getItem(prefix + 'teacher'));
          if (!me && !teacher) return { status: 'login' };
          const mySid = me ? sidKey(me.sid) : null;
          const classId = Number(room.class_id) || 0;
          const rooms = new Set(read('classrooms').filter((r) => r.course === room.course && (Number(r.class_id) || 0) === classId && !/^exam/.test(String(r.chapter || ''))).map((r) => String(r.id)));
          const inRooms = (row) => rooms.has(String(row.classroom));
          const klass = read('classes').find((row) => Number(row.id) === classId);
          const people = new Set(((klass && klass.roster) || []).filter((p) => p && p.sid && !p.extra).map((p) => sidKey(p.sid)));
          if (mySid) people.add(mySid);
          const checks = read('checkins').filter((row) => inRooms(row) && row.verified && !row.auditor);
          const ts = (row) => row.created_at || row.started_at || row.at || '';
          const acts = [
            ...checks, ...read('choices').filter(inRooms), ...read('answers').filter(inRooms), ...read('homework').filter(inRooms),
            ...read('danmaku').filter((row) => inRooms(row) && !row.withdrawn_at),
            ...read('practice').filter((row) => row.course === room.course && (Number(row.class_id) || 0) === classId),
            ...read('visits').filter((row) => row.course === room.course && (Number(row.class_id) || 0) === classId && !row.auditor),
            ...read('puzzleguesses').filter(inRooms), ...read('debateposts').filter(inRooms),
          ];
          const dayOf = (at) => (at ? new Date(new Date(at).getTime() + 8 * 3600000).toISOString().slice(0, 10) : '');
          const realms = read('realms').filter((row) => row.course === room.course && (Number(row.class_id) || 0) === classId);
          const per = Array.from(people).map((sid) => {
            const mineActs = acts.filter((row) => sidKey(row.sid) === sid);
            const realm = realms.find((row) => row.sid === sid);
            const d = (realm && realm.detail) || {};
            return {
              sid,
              attend: new Set(checks.filter((row) => sidKey(row.sid) === sid).map((row) => String(row.classroom))).size,
              days: new Set(mineActs.map((row) => dayOf(ts(row))).filter(Boolean)).size,
              acts: mineActs.length,
              rate: Number(d.attend) > 0 ? Math.min(100, Math.round(100 * (Number(d.right || 0) / 35) / (Number(d.attend) / 20))) : 0,
              danmaku: read('danmaku').filter((row) => inRooms(row) && sidKey(row.sid) === sid && !row.gift && !row.withdrawn_at && row.status !== 'hidden').length,
              practice: read('practice').filter((row) => row.course === room.course && (Number(row.class_id) || 0) === classId && sidKey(row.sid) === sid).length,
              online: Math.round(read('visits').filter((row) => row.course === room.course && (Number(row.class_id) || 0) === classId && !row.auditor && sidKey(row.sid) === sid)
                .reduce((t, row) => t + (Number(row.seconds) || 0), 0) / 60),
              points: realm ? Number(realm.points) || 0 : 0,
            };
          });
          const held = new Set(checks.map((row) => String(row.classroom))).size;
          const first = checks.map((row) => dayOf(row.created_at)).filter(Boolean).sort()[0];
          const today = dayOf(new Date().toISOString());
          const span = Math.max(1, first ? Math.round((Date.parse(today) - Date.parse(first)) / 86400000) + 1 : 1);
          const mineRow = mySid ? per.find((row) => row.sid === mySid) : null;
          const avg = (key) => (per.length ? Math.round((per.reduce((t, row) => t + row[key], 0) / per.length) * 10) / 10 : 0);
          const top = (key) => Math.max(0, ...per.map((row) => row[key]));
          const maxOf = { attend: held, days: span, rate: 100 };
          return { status: 'ok', teacher, people: per.length, held, span,
            updated_at: realms.reduce((at, row) => (row.updated_at > at ? row.updated_at : at), '') || null,
            rows: ['attend', 'days', 'acts', 'rate', 'danmaku', 'practice', 'online', 'points'].map((key) => ({ key, me: mineRow ? mineRow[key] : null, avg: avg(key), max: key in maxOf ? maxOf[key] : top(key) })) };
        }
        if (name === 'ck_set_rank_hidden') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const me = room && myCheckin(await this.ensureAnonymous(), params.p_classroom);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          const classId = Number(room.class_id) || 0;
          const list = read('rankhidden').filter((row) => !(row.course === room.course && Number(row.class_id) === classId && row.sid === sid));
          if (params.p_hidden) {
            const realm = read('realms').find((row) => row.course === room.course && Number(row.class_id) === classId && row.sid === sid);
            if (!realm || Number(realm.realm) < 2) return { status: 'realm', hidden: false };
            if (Number(realm.realm) >= 3) return { status: 'locked', hidden: false };   // 2026-11-11：元婴以上不能隐匿
            list.push({ course: room.course, class_id: classId, sid, hidden_at: new Date().toISOString() });
          }
          write('rankhidden', list);
          return { status: 'ok', hidden: Boolean(params.p_hidden) };
        }
        // 时间轴排排站·全班分队（规则同 cloudbase-pg.sql 的 ck_tl_*，2026-11-11）：教师分组、出题、看进度、揭晓、结束、报到；学生看题、选位置
        if (/^ck_tl_/.test(name)) {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const games = read('tlgames');
          const game = games.find((g) => String(g.classroom) === String(params.p_classroom)) || null;
          const saveGame = (g) => write('tlgames', games.filter((x) => String(x.classroom) !== String(params.p_classroom)).concat(g ? [g] : []));
          const answers = read('tlanswers');
          const ms = (iso) => (iso ? Date.parse(iso) : null);
          const nowIso = () => new Date().toISOString();
          const sizes = (teams) => Object.values(teams || {}).reduce((t, v) => { t[v] = (t[v] || 0) + 1; return t; }, { red: 0, blue: 0 });
          const qAnswers = (g) => answers.filter((a) => String(a.classroom) === String(params.p_classroom) && Number(a.q_no) === Number(g.q_no));
          const joinTeam = (g, sid, nm) => {
            if (!g) return null;
            if (g.teams[sid] || g.phase === 'over') return g.teams[sid] || null;
            const z = sizes(g.teams);
            const team = z.red < z.blue ? 'red' : z.blue < z.red ? 'blue' : (Math.random() < 0.5 ? 'red' : 'blue');
            g.teams[sid] = team;
            g.names[sid] = String(nm || '').slice(0, 20);
            saveGame(g);
            return team;
          };
          if (name === 'ck_tl_start') {
            teacherOnly();
            if (!room) throw new Error('课堂不存在');
            const day = today();
            const devices = read('devices');
            const present = new Map();
            read('checkins').filter((c) => String(c.classroom) === String(room.id) && c.verified && !c.auditor && c.session === day
              && devices.some((d) => String(d.class_id) === String(room.class_id) && d.sid === sidKey(c.sid) && d.owner === c.owner))
              .forEach((c) => present.set(sidKey(c.sid), c.name));
            if (present.size < 2) return { status: 'few', n: present.size };
            const order = [...present.keys()].map((sid) => [Math.random(), sid]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
            const flip = Math.random() < 0.5 ? 0 : 1;
            const teams = {};
            const names = {};
            order.forEach((sid, i) => { teams[sid] = (i + 1 + flip) % 2 === 1 ? 'red' : 'blue'; names[sid] = String(present.get(sid) || '').slice(0, 20); });
            write('tlanswers', answers.filter((a) => String(a.classroom) !== String(room.id)));
            saveGame({ classroom: room.id, course: room.course, gkey: String(params.p_key || '').slice(0, 60), title: String(params.p_title || '').slice(0, 80), teams, names,
              phase: 'rules', q_no: 0, q_total: Math.max(0, Math.min(Number(params.p_total) || 0, 30)), card: '', slots: [], answer: null, end_at: null,
              scored: 0, q_red: 0, q_blue: 0, score_red: 0, score_blue: 0, winner: null, awarded: 0, seen_at: nowIso(), updated_at: nowIso() });
            const list = (side) => order.filter((sid) => teams[sid] === side).map((sid) => ({ sid, name: names[sid] })).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
            return { status: 'ok', n: order.length, now: Date.now(), red: list('red'), blue: list('blue') };
          }
          if (name === 'ck_tl_ask') {
            teacherOnly();
            if (!game || game.phase === 'over') throw new Error('还没有分组，或这一局已经结束');
            const seconds = Number(params.p_seconds);
            if (!(seconds >= 5 && seconds <= 60)) throw new Error('作答时间应为 5—60 秒');
            const slots = Array.isArray(params.p_slots) ? params.p_slots : [];
            const answer = Number(params.p_answer);
            if (!String(params.p_card || '').trim() || !(Number(params.p_q_no) >= 1)) throw new Error('题目不正确');
            if (!slots.length || slots.length > 12 || !(answer >= 0 && answer <= slots.length)) throw new Error('时间轴或正确位置不正确');
            write('tlanswers', answers.filter((a) => !(String(a.classroom) === String(params.p_classroom) && Number(a.q_no) === Number(params.p_q_no))));
            const endAt = Date.now() + seconds * 1000;
            Object.assign(game, { phase: 'ask', q_no: Number(params.p_q_no), card: String(params.p_card).trim().slice(0, 120),
              slots: slots.map((x) => ({ date: String(x.date || '').slice(0, 20), label: String(x.label || '').slice(0, 60) })), answer, end_at: new Date(endAt).toISOString(),
              q_red: 0, q_blue: 0, seen_at: nowIso(), updated_at: nowIso() });
            saveGame(game);
            return { q_no: game.q_no, end_at: endAt, now: Date.now() };
          }
          if (name === 'ck_tl_board') {
            teacherOnly();
            if (!game) return { status: 'none' };
            const list = qAnswers(game);
            const shown = game.phase === 'reveal' || game.phase === 'over';
            return { status: 'ok', phase: game.phase, q_no: game.q_no, sizes: sizes(game.teams), end_at: ms(game.end_at), now: Date.now(),
              red_n: list.filter((a) => a.team === 'red').length, blue_n: list.filter((a) => a.team === 'blue').length,
              red_ok: shown ? list.filter((a) => a.team === 'red' && a.ok).length : null, blue_ok: shown ? list.filter((a) => a.team === 'blue' && a.ok).length : null,
              score_red: game.score_red, score_blue: game.score_blue };
          }
          if (name === 'ck_tl_reveal') {
            teacherOnly();
            if (!game || game.q_no < 1) throw new Error('还没有出题');
            const list = qAnswers(game);
            const red = list.filter((a) => a.team === 'red' && a.ok).length;
            const blue = list.filter((a) => a.team === 'blue' && a.ok).length;
            if (game.phase === 'ask') {
              if (game.scored < game.q_no) { game.score_red += red > blue ? 1 : 0; game.score_blue += blue > red ? 1 : 0; game.scored = game.q_no; }
              Object.assign(game, { phase: 'reveal', q_red: red, q_blue: blue, end_at: new Date(Math.min(Date.now(), ms(game.end_at) || Date.now())).toISOString(), seen_at: nowIso(), updated_at: nowIso() });
              saveGame(game);
            }
            return { q_no: game.q_no, answer: game.answer, red_ok: game.q_red, blue_ok: game.q_blue, red_n: list.filter((a) => a.team === 'red').length,
              blue_n: list.filter((a) => a.team === 'blue').length, sizes: sizes(game.teams),
              win: game.q_red > game.q_blue ? 'red' : game.q_blue > game.q_red ? 'blue' : 'tie', score_red: game.score_red, score_blue: game.score_blue };
          }
          if (name === 'ck_tl_finish') {
            teacherOnly();
            if (!game) throw new Error('还没有分组');
            if (game.phase !== 'over') {
              const win = game.scored < 1 ? 'none' : game.score_red > game.score_blue ? 'red' : game.score_blue > game.score_red ? 'blue' : 'tie';
              let n = 0;
              if (win !== 'none') {
                const klass = read('classes').find((row) => String(row.id) === String(room && room.class_id));
                const roster = new Set(((klass && klass.roster) || []).map((person) => sidKey(person.sid)));
                const day = today();
                const bonus = read('bonus');
                Object.entries(game.teams).filter(([sid, side]) => (win === 'tie' || side === win) && roster.has(sid)).forEach(([sid]) => {
                  const old = bonus.find((row) => String(row.classroom) === String(game.classroom) && row.day === day && row.kind === 'timeline' && row.sid === sid);
                  if (old) old.points = Math.min(old.points + TIMELINE.points, 5);
                  else bonus.push({ id: `${Date.now()}-tl${n}`, course: game.course, classroom: game.classroom, day, kind: 'timeline', sid, name: game.names[sid] || '', points: TIMELINE.points, created_at: nowIso() });
                  n += 1;
                });
                write('bonus', bonus);
              }
              Object.assign(game, { phase: 'over', winner: win, awarded: n, end_at: null, seen_at: nowIso(), updated_at: nowIso() });
              saveGame(game);
            }
            return { winner: game.winner, awarded: game.awarded, score_red: game.score_red, score_blue: game.score_blue, sizes: sizes(game.teams) };
          }
          if (name === 'ck_tl_game') {
            teacherOnly();
            if (params.p_action === 'beat') { if (game) { game.seen_at = nowIso(); saveGame(game); } }
            else if (params.p_action === 'end') { write('tlanswers', answers.filter((a) => String(a.classroom) !== String(params.p_classroom))); saveGame(null); }
            else throw new Error(`不认识的操作：${params.p_action}`);
            return { status: 'ok', now: Date.now() };
          }
          const me = myCheckin(await this.ensureAnonymous(), params.p_classroom);
          if (!me) return { status: 'login' };
          const sid = sidKey(me.sid);
          if (name === 'ck_tl_live') {
            if (!game || Date.now() - ms(game.seen_at) > 150000) return { status: 'none', now: Date.now() };
            const team = joinTeam(game, sid, me.name);
            const mine = game.q_no > 0 ? qAnswers(game).find((a) => a.sid === sid) : null;
            const shown = game.phase === 'reveal' || game.phase === 'over';
            return { status: 'open', phase: game.phase, title: game.title, team, sizes: sizes(game.teams), q_no: game.q_no, q_total: game.q_total, card: game.card, slots: game.slots,
              end_at: ms(game.end_at), now: Date.now(), mine: mine ? mine.slot : null, ok: shown && mine ? mine.ok : null,
              answer: shown ? game.answer : null, red_ok: shown ? game.q_red : null, blue_ok: shown ? game.q_blue : null,
              score_red: game.score_red, score_blue: game.score_blue, winner: game.winner, awarded: game.phase === 'over' ? game.awarded : null };
          }
          if (name === 'ck_tl_answer') {
            if (!game || game.phase !== 'ask' || Number(game.q_no) !== Number(params.p_q_no)) return { status: 'closed' };
            if (Date.now() > ms(game.end_at) + 600) return { status: 'late', end_at: ms(game.end_at), now: Date.now() };
            const slot = Number(params.p_slot);
            if (!(slot >= 0 && slot <= game.slots.length)) return { status: 'bad' };
            const team = game.teams[sid] || joinTeam(game, sid, me.name);
            if (!team) return { status: 'closed' };
            const rest = read('tlanswers').filter((a) => !(String(a.classroom) === String(params.p_classroom) && Number(a.q_no) === Number(game.q_no) && a.sid === sid));
            write('tlanswers', rest.concat({ classroom: game.classroom, q_no: game.q_no, sid, team, slot, ok: slot === Number(game.answer), created_at: nowIso() }));
            return { status: 'ok', slot, team };
          }
          throw new Error(`未知的后台函数：${name}`);
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
          // 学生版测试页里的教师账号：直接给解答（规则同 cloudbase-pg.sql）
          if (!me && localStorage.getItem(prefix + 'teacher')) {
            const at = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
            const hit = at && read('explainbank').find((e) => e.course === at.course && e.unit === at.chapter && e.key === params.p_key);
            if (!hit) return { status: 'none' };
            const { need: skipNeed, ...openBody } = hit.body || {};
            return { status: 'ok', body: openBody };
          }
          if (!me) return { status: 'login' };
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const sid = sidKey(me.sid);
          const row = read('explainbank').find((e) => e.course === room.course && e.unit === room.chapter && e.key === params.p_key);
          // 2026-11-20：解答标了 open 的（四步解析）不看境界；标了 need 的要这一组题全部递交才给
          if (!(row && row.body && row.body.open)) {
            const realm = read('realms').find((item) => item.course === room.course && Number(item.class_id) === (Number(room.class_id) || 0) && item.sid === sid);
            if (!realm || Number(realm.realm) < 1) return { status: 'locked', realm: realm ? Number(realm.realm) : 0, need: 1 };
          }
          if (!row) return { status: 'none' };
          const mine = (doc) => String(doc.classroom) === String(params.p_classroom) && sidKey(doc.sid) === sid;
          const submitted = (key, loose) => {
            const [no, item = ''] = String(key).split(':');
            return read('homework').some((h) => mine(h) && Object.prototype.hasOwnProperty.call(h.payload || {}, key))
              || (item && read('choices').some((c) => mine(c) && c.case === no && (c.item === item || (loose && item === 'match' && /^match-/.test(c.item)))))
              || (item && read('answers').some((a) => mine(a) && a.case === no && a.item === item));
          };
          if (Array.isArray(row.body.need)) {
            if (!row.body.need.every((key) => submitted(key, false))) return { status: 'todo' };
            const { need: skip, ...rest } = row.body;
            return { status: 'ok', body: rest };
          }
          return submitted(params.p_key, true) ? { status: 'ok', body: row.body } : { status: 'todo' };
        }
        // 修炼场（规则同 cloudbase-pg.sql 的 ck_practice_home / items / answer / essay）
        if (/^ck_practice_(home|items|answer|essay)$/.test(name)) {
          const uid = await this.ensureAnonymous();
          // 学生版测试页里的教师账号＝王不凡（规则同 cloudbase-pg.sql 的 ck_practice_me）
          const me = myCheckin(uid, params.p_classroom)
            || (localStorage.getItem(prefix + 'teacher') && read('classrooms').some((row) => String(row.id) === String(params.p_classroom)) ? { sid: 'WBF0001', name: '王不凡' } : null);
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
          const { gap, most } = PRACTICE;
          const stat = (unit, item) => {
            const rows = log.filter((l) => l.unit === unit && l.item === item);
            const earns = rows.filter((l) => l.points > 0);
            const lastEarn = earns.reduce((m, l) => (l.day > m ? l.day : m), '');
            const today = rows.some((l) => l.day === day);
            const times = earns.length;
            // again：得过一次、已隔够 gap 天、今天还没做过——现在答对可再得一次（规则同 cloudbase-pg.sql）
            const again = times > 0 && times < most && addDays(lastEarn, gap) <= day && !today;
            const wait = times > 0 && times < most && !again ? Math.max(0, Math.round((Date.parse(addDays(lastEarn, gap)) - Date.parse(day)) / 864e5)) : 0;
            return { earned: times > 0, times, again, wait, lastEarn, today, tried: rows.length > 0, last: rows.reduce((m, l) => (l.day > m ? l.day : m), '') };
          };
          const have = log.filter((l) => l.day === day).reduce((sum, l) => sum + l.points, 0);
          if (name === 'ck_practice_home') {
            const units = [...new Set(bank.map((b) => b.unit))].map((unit) => {
              const rows = bank.filter((b) => b.unit === unit && !SELF.includes(b.kind));
              const tried = rows.map((b) => ({ b, s: stat(unit, b.item) })).filter((x) => x.s.tried);
              const opens = opensOf(unit);
              const plain = rows.filter((b) => !isFeyn(b));
              return { unit, title: rows[0].title, order: rows[0].ord, n: plain.length, fn: rows.length - plain.length, essays: rows.filter((b) => b.kind === 'essay').length, opens, open: Boolean(opens) && opens <= day,
                earned: tried.filter((x) => x.s.earned && !isFeyn(x.b)).length, firm: tried.filter((x) => x.s.times >= most && !isFeyn(x.b)).length,
                fe: tried.filter((x) => x.s.earned && isFeyn(x.b)).length, ffirm: tried.filter((x) => x.s.times >= most && isFeyn(x.b)).length,
                tried: tried.filter((x) => !isFeyn(x.b)).length, due: tried.filter((x) => x.b.kind !== 'essay' && ((!x.s.earned && x.s.last < day) || x.s.again)).length };
            }).sort((a, b) => a.order - b.order);
            return { status: 'ok', course: room.course, cap: PRACTICE.of(room.course).cap, delay: PRACTICE.delay, gap, most, date: day, today: have, total: log.reduce((sum, l) => sum + l.points, 0), units };
          }
          if (name === 'ck_practice_items') {
            const mode = params.p_mode;
            const open = new Set(bank.map((b) => b.unit).filter((unit) => isOpen(unit)));
            if (!mode || (!['review', 'mix', 'feynman', 'write'].includes(mode) && !open.has(mode))) return { status: 'closed' };
            let rows = bank.filter((b) => open.has(b.unit) && !SELF.includes(b.kind)).map((b) => ({ b, s: stat(b.unit, b.item) }));
            const rank = (s) => (!s.earned ? 0 : s.again ? 1 : 2);   // 没得过的在前，到期巩固的其次
            if (mode === 'review') rows = rows.filter((x) => x.b.kind !== 'essay' && ((!x.s.earned && x.s.tried && x.s.last < day) || x.s.again)).slice(0, 40);
            else if (mode === 'mix' || mode === 'feynman') rows = rows.filter((x) => x.b.kind !== 'essay' && isFeyn(x.b) === (mode === 'feynman'))
              .map((x) => ({ ...x, r: Math.random() })).sort((a, b) => (rank(a.s) - rank(b.s)) || (a.r - b.r)).slice(0, 12);
            else if (mode === 'write') rows = rows.filter((x) => x.b.kind === 'essay' || x.b.kind === 'transfer');
            else rows = rows.filter((x) => x.b.unit === mode && !isFeyn(x.b));
            return { status: 'ok', mode, items: rows.map(({ b, s }) => ({ unit: b.unit, item: b.item, title: b.title, kind: b.kind, body: b.body, points: b.points,
              earned: s.earned, times: s.times, most, again: s.again, wait: s.wait, today: s.today, tried: s.tried })) };
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
          let wait = 0;
          const limit = essay || row.kind === 'review' ? 1 : most;   // 课后自修只算一次
          if (correct && s.times >= limit) reason = 'earned';
          else if (correct && s.times > 0 && addDays(s.lastEarn, gap) > day) { reason = 'wait'; wait = s.wait; }
          else if (correct && !essay && s.today) reason = 'today';
          else if (correct) { points = Math.max(0, Math.min(row.points, PRACTICE.of(room.course).cap - have)); if (!points) reason = 'cap'; }
          const all = read('practice');
          all.push({ id: nextId(all), course: room.course, class_id: room.class_id, sid, name: me.name, unit: row.unit, item: row.item, day,
            answer: essay ? { text: String(params.p_text).slice(0, 6000) } : params.p_answer, correct, points, created_at: new Date().toISOString() });
          write('practice', all);
          if (!essay && row.kind === 'review') return { status: 'ok' };   // 课后自修（出门测、温故）不给答案和对错（2026-10-28，同 ck_practice_answer）
          return essay ? { status: 'ok', reveal: row.reveal, points, reason, today: have + points, cap: PRACTICE.of(room.course).cap }
            : { status: 'ok', correct, answer: row.answer.ok, reveal: row.reveal, points, reason, wait, times: s.times + (points > 0 ? 1 : 0), most: limit, today: have + points, cap: PRACTICE.of(room.course).cap };
        }
        // 期中考查递交截止时间（学生页读取）、已递交人数比例：学生可调，放在 teacherOnly 之前（2026-11-12 修正模拟后台：截止时间原来放在后面，学生读不到）
        if (name === 'ck_room_deadline') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          return room ? room.deadline || null : null;
        }
        // 期中考查作业已递交人数比例（规则同 cloudbase-pg.sql 的 ck_exam_progress，2026-11-12）
        if (name === 'ck_exam_progress') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room || !/^exam\d{2}$/.test(room.chapter)) return { status: 'none' };
          if (!myCheckin(await this.ensureAnonymous(), room.id) && !localStorage.getItem(prefix + 'teacher')) return { status: 'login' };
          const klass = read('classes').find((row) => String(row.id) === String(room.class_id));
          const roster = [...new Set(((klass && klass.roster) || []).map((person) => sidKey(person.sid)).filter(Boolean))];
          const sent = new Set(read('homework').filter((doc) => String(doc.classroom) === String(room.id) && doc.payload && doc.payload.exam !== undefined).map((doc) => sidKey(doc.sid)));
          return { status: 'ok', done: roster.filter((key) => sent.has(key)).length, total: roster.length };
        }
        // 学生打开章节页时取“建议被采纳”的通知（本班各课堂），取过即记为已通知
        if (name === 'ck_my_notices') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: 'login', adopt: 0 };
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const authors = read('fbauthors');
          let adopt = 0;
          authors.forEach((row) => {
            if (row.course === room.course && String(row.class_id) === String(room.class_id) && row.sid === sidKey(me.sid) && row.points > row.notified) {
              adopt += row.points - row.notified;
              row.notified = row.points;
            }
          });
          write('fbauthors', authors);
          return { status: 'ok', adopt };
        }
        if (['ck_my_feedback_threads', 'ck_answer_feedback', 'ck_seen_feedback_replies'].includes(name)) {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return name === 'ck_my_feedback_threads' ? { status: 'login', threads: [] } : { status: 'login' };
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          const mine = new Set(read('fbauthors').filter((row) => row.course === room.course && String(row.class_id) === String(room.class_id) && row.sid === sidKey(me.sid))
            .map((row) => String(row.feedback_id)));
          const replies = read('fbreplies');
          if (name === 'ck_my_feedback_threads') {
            const threads = read('feedback').filter((f) => mine.has(String(f.id)) && replies.some((r) => String(r.feedback_id) === String(f.id) && r.by_teacher && !r.seen_at))
              .map((f) => ({ id: f.id, case_no: f.case_no, created_on: f.created_on, text: f.text,
                replies: replies.filter((r) => String(r.feedback_id) === String(f.id)).map((r) => ({ id: r.id, by_teacher: r.by_teacher, text: r.text, created_at: r.created_at, seen: Boolean(r.seen_at) })) }));
            return { status: 'ok', threads };
          }
          if (name === 'ck_answer_feedback') {
            if (!mine.has(String(params.p_id))) throw new Error('只能回复自己的建议');
            const text = String(params.p_text || '').trim();
            if (!text || text.length > 500) throw new Error('回复请写 1—500 字');
            const row = { id: Date.now(), feedback_id: params.p_id, by_teacher: false, text, created_at: new Date().toISOString(), seen_at: null };
            replies.push(row);
            write('fbreplies', replies);
            return { status: 'ok', reply: { id: row.id, by_teacher: false, text, created_at: row.created_at, seen: false } };
          }
          const ids = new Set((params.p_ids || []).map(String));
          let seen = 0;
          replies.forEach((r) => { if (ids.has(String(r.feedback_id)) && mine.has(String(r.feedback_id)) && r.by_teacher && !r.seen_at) { r.seen_at = new Date().toISOString(); seen += 1; } });
          write('fbreplies', replies);
          return { status: 'ok', seen };
        }
        teacherOnly();
        // 学生版测试页：教师以“王不凡”的名义发弹幕、祭出法宝（规则同 cloudbase-pg.sql 的 ck_test_danmaku；owner 用本机匿名身份，便于“我发过的弹幕”）
        if (name === 'ck_test_danmaku') {
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom) && row.is_current && row.submissions_open && row.danmaku !== 'off');
          if (!room) throw Object.assign(new Error('老师未开放弹幕'), { code: '42501' });
          const rows = read('danmaku');
          const base = { id: Math.random().toString(36).slice(2), owner: await this.ensureAnonymous(), course: room.course, classroom: room.id, name: '王不凡', sid: 'WBF0001', ts: Date.now() };
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
          if (!params.p_keep) rows.forEach((row) => { if (sameGroup(row, params.p_course, params.p_class)) row.is_current = false; });
          const now = new Date().toISOString();
          const room = { id: Math.max(Date.now(), ...rows.map((row) => Number(row.id) + 1 || 0)), course: params.p_course, code: newCode(), name: String(params.p_name).trim(),
            chapter: params.p_chapter, case_no: Number(params.p_case) || null, is_current: true, submissions_open: true, danmaku: 'direct', class_id: params.p_class || null, created_at: now, updated_at: now };
          rows.push(room);
          write('classrooms', rows);
          return { ...room };
        }
        if (name === 'ck_set_current') {
          return updateRoom(params.p_classroom, (room, rows) => {
            if (params.p_current) room.submissions_open = true;   // 2026-10-28 起一个班可以同时开放几个课堂，不再停止其他课堂
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
        // 投票器（规则同 cloudbase-pg.sql 的 ck_poll_open / ck_poll_close / ck_poll_live / ck_poll_vote）
        if (name === 'ck_poll_open') {
          teacherOnly();
          const room = read('classrooms').find((row) => String(row.id) === String(params.p_classroom));
          if (!room) throw new Error('课堂不存在');
          const options = params.p_options;
          if (!Array.isArray(options) || options.length < 2 || options.length > 6 || options.some((o) => typeof o !== 'string' || !o.trim() || o.trim().length > 12)) {
            throw new Error('选项要有 2—6 个，每个 1—12 个字');
          }
          const rows = read('polls');
          const now = new Date().toISOString();
          rows.forEach((row) => { if (String(row.classroom) === String(room.id) && row.status === 'open') { row.status = 'closed'; row.closed_at = now; } });
          const row = { id: nextId(rows), course: room.course, classroom: room.id, question: String(params.p_question || '').trim().slice(0, 80) || null,
            options, status: 'open', reveal: false, created_at: now, closed_at: null };
          rows.push(row);
          write('polls', rows);
          return { ...row };
        }
        if (name === 'ck_poll_close') {
          teacherOnly();
          const rows = read('polls');
          const row = rows.find((item) => String(item.id) === String(params.p_poll));
          if (!row) throw new Error('这次投票已经不在了');
          row.status = 'closed';
          row.closed_at = row.closed_at || new Date().toISOString();
          row.reveal = params.p_reveal !== false;
          write('polls', rows);
          return { ...row };
        }
        if (name === 'ck_poll_live') {
          const uid = await this.ensureAnonymous();   // 本机测试时教师和学生共用一个浏览器：“本人投的”按学生身份认（与 ck_poll_vote 相同）
          const poll = read('polls').filter((row) => String(row.classroom) === String(params.p_classroom)
            && (row.status === 'open' || Date.now() - Date.parse(row.closed_at) < 180000)).sort((a, b) => Number(b.id) - Number(a.id))[0];
          if (!poll) return null;
          const votes = read('pollvotes').filter((v) => String(v.poll) === String(poll.id));
          const mine = votes.find((v) => v.owner === uid);
          return { poll: poll.id, question: poll.question, options: poll.options, status: poll.status, mine: mine ? mine.choice : null,
            counts: poll.status === 'closed' && poll.reveal ? poll.options.map((_, i) => votes.filter((v) => v.choice === i).length) : null };
        }
        if (name === 'ck_poll_vote') {
          const uid = await this.ensureAnonymous();
          const poll = read('polls').find((row) => String(row.id) === String(params.p_poll));
          const room = poll && read('classrooms').find((row) => String(row.id) === String(poll.classroom) && row.is_current);
          if (!poll || poll.status !== 'open' || !room) return { status: 'closed' };
          const me = myCheckin(uid, poll.classroom);
          if (!me) return { status: 'login' };
          const choice = Number(params.p_choice);
          if (!(choice >= 0 && choice < poll.options.length)) throw new Error('选项不对');
          const rows = read('pollvotes').filter((v) => !(String(v.poll) === String(poll.id) && sidKey(v.sid) === sidKey(me.sid)));
          rows.push({ poll: poll.id, classroom: poll.classroom, sid: sidKey(me.sid), name: me.name, owner: uid, choice, updated_at: new Date().toISOString() });
          write('pollvotes', rows);
          return { status: 'ok', choice };
        }
        // 期中考查递交截止时间（规则同 cloudbase-pg.sql 的 ck_set_deadline / ck_room_deadline）
        if (name === 'ck_set_deadline') {
          teacherOnly();
          return updateRoom(params.p_classroom, (room) => { room.deadline = params.p_deadline || null; });
        }
        // 课表、日程（规则同 cloudbase-pg.sql 的 ck_set_class_schedule / ck_save_teacher_setting / ck_save_event）
        if (name === 'ck_set_class_schedule') {
          teacherOnly();
          const plan = params.p_schedule;
          const slots = (plan && plan.slots) || [];
          if (plan && (!Array.isArray(slots) || slots.length > 14 || JSON.stringify(plan).length > 4000
            || slots.some((s) => !(s.day >= 1 && s.day <= 7) || !(s.from >= 1 && s.from <= 16) || !(s.to >= s.from && s.to <= 16)))) throw new Error('上课安排不正确');
          return updateClass(params.p_class, (row) => { row.schedule = slots.length ? plan : null; });
        }
        if (name === 'ck_save_teacher_setting') {
          teacherOnly();
          // 2026-11-18 加 adjust（课表调整），同 cloudbase-pg.sql：planner 8000 字节以内，calendar、adjust 30000 字节以内
          if (!['planner', 'calendar', 'adjust'].includes(params.p_key) || !params.p_value
            || new TextEncoder().encode(JSON.stringify(params.p_value)).length > (params.p_key === 'planner' ? 8000 : 30000)) throw new Error('设置不正确');
          const rows = read('teachersettings').filter((row) => row.key !== params.p_key);
          rows.push({ key: params.p_key, value: params.p_value, updated_at: new Date().toISOString() });
          write('teachersettings', rows);
          return true;
        }
        if (name === 'ck_save_event') {
          teacherOnly();
          const title = String(params.p_title || '').trim();
          const time = (value) => { const text = String(value || '').trim(); if (text && !/^[0-2]\d:[0-5]\d$/.test(text)) throw new Error('时间格式应为 08:00'); return text || null; };
          if (!params.p_day || !title || title.length > 60) throw new Error('请填写日期和标题（60 字以内）');
          const rows = read('events');
          const now = new Date().toISOString();
          const fields = { day: params.p_day, start_time: time(params.p_start), end_time: time(params.p_end), title, note: String(params.p_note || '').trim().slice(0, 500) || null,
            color: params.p_color || null, done: Boolean(params.p_done), updated_at: now };
          let row = params.p_id == null ? null : rows.find((item) => String(item.id) === String(params.p_id));
          if (params.p_id != null && !row) throw new Error('这条安排已经不在了');
          if (row) Object.assign(row, fields);
          else { row = { id: nextId(rows), ...fields, created_at: now }; rows.push(row); }
          write('events', rows);
          return { ...row };
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
          return updateRoom(params.p_classroom, (room) => { room.class_id = params.p_class; });
        }
        if (name === 'ck_delete_class') {
          const ids = read('classrooms').filter((row) => String(row.class_id || '') === String(params.p_class)).map((row) => row.id);
          ['checkins', 'choices', 'answers', 'danmaku', 'homework', 'bonus', 'stops', 'presence', 'puzzles', 'puzzleguesses', 'moods', 'examscores', 'debatemembers', 'debateposts', 'bizgames', 'bizvotes', 'fbauthors'].forEach((kind) => write(kind, read(kind).filter((row) => !ids.includes(row.classroom))));
          write('classrooms', read('classrooms').filter((row) => !ids.includes(row.id)));
          write('classes', read('classes').filter((row) => String(row.id) !== String(params.p_class)));
          ['pins', 'devices', 'requests', 'pinreqs', 'seclog', 'giftuses', 'logindays'].forEach((kind) => write(kind, read(kind).filter((row) => String(row.class_id) !== String(params.p_class))));
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
          const me = room && myCheckin(uid, params.p_classroom);
          if (!me) {
            throw Object.assign(new Error('进入课堂后才能提交建议'), { code: '42501' });
          }
          const text = String(params.p_text || '').trim();
          if (!/^\d{2}$/.test(String(params.p_case || '')) || text.length < 2 || text.length > 500) throw new Error('建议请写 2—500 字');
          const rows = read('feedback');
          const id = Math.max(0, ...rows.map((row) => Number(row.id) || 0)) + 1;
          rows.push({ id, course: room.course, classroom: room.id, unit: room.chapter, case_no: params.p_case, text, created_on: today(), adopted: 0, adopted_at: null });
          write('feedback', rows);
          // 2026-11-05：另记提交者（老师读不到；只用于采纳后给作者加修为、通知作者）
          const authors = read('fbauthors');
          authors.push({ feedback_id: id, course: room.course, class_id: room.class_id, classroom: room.id, sid: sidKey(me.sid), name: me.name, created_on: today(), points: 0, notified: 0 });
          write('fbauthors', authors);
          // 每个课堂第一次提交 10 字以上加修为（只记提交过，不记是哪一条）
          const bonus = read('bonus');
          if (text.length < FEEDBACK.min || bonus.some((row) => String(row.classroom) === String(room.id) && row.kind === 'feedback' && row.sid === sidKey(me.sid))) return false;
          bonus.push({ id: `${Date.now()}-fb`, course: room.course, classroom: room.id, day: today(), kind: 'feedback', sid: sidKey(me.sid), name: me.name, points: FEEDBACK.points, created_at: new Date().toISOString() });
          write('bonus', bonus);
          return true;
        }
        // 老师点赞采纳匿名建议（规则同 cloudbase-pg.sql 的 ck_adopt_feedback / ck_adopt_recount）：0／5／10／20。
        // 2026-11-20 起同一位同学 7 天内靠点赞最多得 20 修为：这里记下老师点的数（asked）和时间（liked_at），实际加多少（points）按时间顺序重算；
        // 返回的 adopted 是老师点的数，不是实际加的数（不让老师从“没加满”看出几条建议出自同一个人）
        if (name === 'ck_adopt_feedback') {
          teacherOnly();
          const points = Number(params.p_points);
          if (![0, ...EGG.adopt].includes(points)) throw new Error('修为只能选 5、10 或 20');
          const rows = read('feedback');
          const doc = rows.find((row) => String(row.id) === String(params.p_id));
          if (!doc) throw new Error('这条建议已经删除');
          const authors = read('fbauthors');
          const author = authors.find((row) => String(row.feedback_id) === String(params.p_id));
          if (!author) return { status: 'no_author', adopted: Number(doc.adopted) || 0 };
          const now = new Date().toISOString();
          doc.adopted = points;
          doc.adopted_at = points ? now : null;
          write('feedback', rows);
          const mine = (row) => row.course === author.course && String(row.class_id) === String(author.class_id) && row.sid === author.sid;
          // 本规则之前点的赞（没有 liked_at）：照原样保留（capped＝false，不重算），但算进之后 7 天的合计
          authors.filter((row) => mine(row) && (Number(row.points) || 0) > 0 && !row.liked_at).forEach((row) => {
            const old = rows.find((item) => String(item.id) === String(row.feedback_id));
            Object.assign(row, { asked: row.points, capped: false, liked_at: (old && old.adopted_at) || `${row.created_on}T00:00:00+08:00` });
          });
          if (points > 0) Object.assign(author, { asked: points, liked_at: now, capped: true });
          else Object.assign(author, { asked: 0, liked_at: null, capped: true, points: 0, notified: 0 });
          const at = (row) => Date.parse(row.liked_at);
          const span = EGG.adoptDays * 86400000;
          authors.filter((row) => mine(row) && row.capped !== false && (Number(row.asked) || 0) > 0 && row.liked_at)
            .sort((x, y) => at(x) - at(y) || Number(x.feedback_id) - Number(y.feedback_id))
            .forEach((row) => {
              const used = authors.filter((other) => mine(other) && other !== row && (Number(other.points) || 0) > 0 && other.liked_at && at(other) > at(row) - span
                && (at(other) < at(row) || (at(other) === at(row) && Number(other.feedback_id) < Number(row.feedback_id))))
                .reduce((total, other) => total + Number(other.points), 0);
              const give = Math.min(Number(row.asked), Math.max(0, EGG.adoptCap - used));
              row.points = give;
              row.notified = Math.min(Number(row.notified) || 0, give);
            });
          write('fbauthors', authors);
          // 加分记录：这位同学同一课堂同一天（建议提交日）被采纳的几条合成一行
          const groups = new Map();
          authors.filter(mine).forEach((row) => {
            const key = `${row.classroom}|${row.created_on}`;
            const group = groups.get(key) || { classroom: row.classroom, day: row.created_on, sum: 0 };
            group.sum += Number(row.points) || 0;
            groups.set(key, group);
          });
          const list = read('bonus').filter((row) => !(row.kind === 'adopt' && row.sid === author.sid && groups.has(`${row.classroom}|${row.day}`)));
          groups.forEach((group, key) => {
            if (group.sum > 0) list.push({ id: `${Date.now()}-adopt-${key}`, course: author.course, classroom: group.classroom, day: group.day, kind: 'adopt', sid: author.sid, name: author.name, points: Math.min(group.sum, 100), created_at: now });
          });
          write('bonus', list);
          return { status: 'ok', adopted: points };
        }
        // 匿名建议的回复（2026-11-19，同 cloudbase-pg-20261119-建议回复.sql）：老师回复、读回复、撤回；作者取有新回复的建议、回复老师、点关闭记为已看
        if (name === 'ck_reply_feedback') {
          teacherOnly();
          if (!read('feedback').some((row) => String(row.id) === String(params.p_id))) throw new Error('这条建议已经删除');
          if (!read('fbauthors').some((row) => String(row.feedback_id) === String(params.p_id))) return { status: 'no_author' };
          const text = String(params.p_text || '').trim();
          if (!text || text.length > 500) throw new Error('回复请写 1—500 字');
          const rows = read('fbreplies');
          const row = { id: Date.now(), feedback_id: params.p_id, by_teacher: true, text, created_at: new Date().toISOString(), seen_at: null };
          rows.push(row);
          write('fbreplies', rows);
          return { status: 'ok', reply: row };
        }
        if (name === 'ck_feedback_replies_for') {
          teacherOnly();
          const ids = new Set((params.p_ids || []).map(String));
          return read('fbreplies').filter((row) => ids.has(String(row.feedback_id))).sort((a, b) => Number(a.id) - Number(b.id));
        }
        if (name === 'ck_delete_feedback_reply') {
          teacherOnly();
          const rows = read('fbreplies');
          const keep = rows.filter((row) => !(String(row.id) === String(params.p_id) && row.by_teacher));
          write('fbreplies', keep);
          return { status: keep.length < rows.length ? 'ok' : 'gone' };
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
          // 宗门（同后台触发器 ck_sect_sync）：结算时同步弟子的修为和境界
          const sects = read('sectmembers');
          sects.forEach((m) => {
            const got = fresh.find((row) => m.course === params.p_course && Number(m.class_id) === classId && row.sid === m.sid);
            if (got) Object.assign(m, { points: Number(got.points) || 0, realm: Number(got.realm) || 0, name: got.name, updated_at: at });
          });
          write('sectmembers', sects);
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
              // 原来是旁听的：以前的加入记录转为正式（2026-11-05）
              const rooms = new Set(read('classrooms').filter((r) => String(r.class_id) === String(req.class_id)).map((r) => String(r.id)));
              write('checkins', read('checkins').map((row) => (row.auditor && sidKey(row.sid) === req.sid && rooms.has(String(row.classroom)) ? { ...row, auditor: false } : row)));
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
        // 允许旁听（2026-11-05，规则同 cloudbase-pg.sql 的 ck_audit_request）：不进点名册；原来加进点名册的移出，以前的加入记录转为旁听
        if (name === 'ck_audit_request') {
          teacherOnly();
          const reqs = read('requests');
          const req = reqs.find((row) => String(row.id) === String(params.p_id));
          if (!req) throw new Error('申请不存在');
          const classes = read('classes');
          const klass = classes.find((row) => String(row.id) === String(req.class_id));
          if (klass) {
            klass.roster = (klass.roster || []).filter((person) => !(sidKey(person.sid) === req.sid && person.extra));
            write('classes', classes);
          }
          const listed = klass && (klass.roster || []).some((person) => sidKey(person.sid) === req.sid);
          if (!listed) {
            const rooms = new Set(read('classrooms').filter((r) => String(r.class_id) === String(req.class_id)).map((r) => String(r.id)));
            write('checkins', read('checkins').map((row) => (!row.auditor && sidKey(row.sid) === req.sid && rooms.has(String(row.classroom)) ? { ...row, auditor: true } : row)));
          }
          Object.assign(req, { status: 'audit', decided_at: new Date().toISOString() });
          write('requests', reqs);
          secLog('audit', { course: req.course, class_id: req.class_id, sid: req.sid, name: req.name, owner: 'teacher' });
          return { status: 'audit' };
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
          read('practice').filter((l) => l.course === params.p_course && String(l.class_id || 0) === String(params.p_class || 0) && l.sid !== 'WBF0001').forEach((l) => {
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
        // 2026-11-06 删除无效弹幕撤回修为并提醒（规则同后台 ck_delete_danmaku）
        if (name === 'ck_delete_danmaku') {
          teacherOnly();
          const rows = read('danmaku');
          const row = rows.find((item) => String(item.id) === String(params.p_id));
          if (!row) return { status: 'gone', points: 0, notified: false };
          const sid = sidKey(row.sid);
          write('danmaku', rows.filter((item) => item !== row));
          if (row.gift || row.withdrawn_at || sid === 'WBF0001') return { status: 'ok', points: 0, notified: false, sid, name: row.name };
          const allRooms = read('classrooms');
          const room = allRooms.find((item) => String(item.id) === String(row.classroom)) || {};
          const classId = Number(room.class_id) || 0;
          const klass = read('classes').find((item) => String(item.id) === String(room.class_id));
          const inScope = !klass || !Array.isArray(klass.units) || !klass.units.length || klass.units.includes(room.chapter);
          const realms = read('realms');
          const realm = realms.find((item) => item.course === room.course && Number(item.class_id) === classId && item.sid === sid);
          let cut = 0;
          if (realm && inScope && !/^exam/.test(room.chapter || '')) {
            const settled = Date.parse(realm.updated_at);
            const m = Math.max(1, Number(params.p_meetings) || 1);
            const unitRooms = new Map(allRooms.filter((item) => item.course === room.course && (Number(item.class_id) || 0) === classId && item.chapter === room.chapter).map((item) => [String(item.id), item]));
            const count = (list) => {
              const said = new Set();
              let likes = 0;
              list.forEach((doc) => {
                const home = unitRooms.get(String(doc.classroom));
                if (!home || sidKey(doc.sid) !== sid || doc.gift || doc.withdrawn_at || doc.status === 'hidden' || (Date.parse(doc.created_at) || doc.ts) > settled) return;
                if (doc.liked_at && Date.parse(doc.liked_at) <= settled) likes += 1;
                if (home.danmaku === 'review' && doc.status !== 'shown') return;
                const text = String(doc.text || '').replace(/^(【[^】]{1,12}】\s*)+/, '').replace(/[\s\p{P}\p{S}＿_]/gu, '');
                if (text.length >= 4) said.add(text);
              });
              return { said: said.size, likes };
            };
            const was = count(rows);
            const now = count(rows.filter((item) => item !== row));
            const detail = realm.detail || {};
            const dmCut = Math.min(Math.min(10 * m, 2 * was.said) - Math.min(10 * m, 2 * now.said), Math.max(0, Number(detail.danmaku) || 0));
            const likeCut = Math.min(5 * (Math.min(was.likes, 2 * m) - Math.min(now.likes, 2 * m)), Math.max(0, Number(detail.like) || 0));
            cut = dmCut + likeCut;
            if (cut > 0) {
              realm.points = Math.max(0, Number(realm.points) - cut);
              const level = realmOf(realm.points, Number(realm.max_points), realm.course);
              realm.realm = level.level;
              realm.stage = level.stage;
              realm.detail = { ...detail, danmaku: Math.max(0, (Number(detail.danmaku) || 0) - dmCut), like: Math.max(0, (Number(detail.like) || 0) - likeCut) };
              write('realms', realms);
              // 宗门（同后台触发器 ck_sect_sync）
              const sects = read('sectmembers');
              sects.forEach((item) => { if (item.course === realm.course && Number(item.class_id) === classId && item.sid === sid) { item.points = realm.points; item.realm = realm.realm; } });
              write('sectmembers', sects);
            }
          }
          const removed = read('dmremoved');
          write('dmremoved', removed.concat([{ id: nextId(removed), course: room.course, class_id: classId, classroom: room.id, sid, name: row.name, text: row.text, points: cut, created_at: new Date().toISOString(), notified_at: null }]));
          return { status: 'ok', points: cut, notified: true, sid, name: row.name };
        }
        if (name === 'ck_my_danmaku_removed') {
          const uid = await this.ensureAnonymous();
          const me = myCheckin(uid, params.p_classroom);
          if (!me) return { status: 'login', removed: [], points: 0 };
          const room = read('classrooms').find((item) => String(item.id) === String(params.p_classroom)) || {};
          const rows = read('dmremoved');
          const mine = rows.filter((item) => item.course === room.course && Number(item.class_id) === (Number(room.class_id) || 0) && item.sid === sidKey(me.sid) && !item.notified_at);
          mine.forEach((item) => { item.notified_at = new Date().toISOString(); });
          if (mine.length) write('dmremoved', rows);
          return { status: 'ok', removed: mine.map((item) => ({ text: item.text, points: item.points })), points: mine.reduce((sum, item) => sum + (Number(item.points) || 0), 0) };
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

  // ---------- 导出 Word（.docx）与 Excel（.xlsx）：期中考查作业（2026-10-28）用，浏览器里直接生成，不经第三方 ----------
  // Word 按课程的中文文档规范：A4、1 英寸页边距、1.5 倍行距、正文两端对齐首行缩进 2 字；汉字宋体（标题黑体）、英文数字 Times New Roman；
  // 直引号按段落奇偶换成弯引号，弯引号拆成独立的 run、四个字体槽都设宋体
  const office = (() => {
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i += 1) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    // 只存不压缩的 zip（docx、xlsx 都是 zip 包）
    function zip(files, type) {
      const enc = new TextEncoder();
      const parts = [];
      const central = [];
      let offset = 0;
      files.forEach(([name, text]) => {
        const nameBytes = enc.encode(name);
        const bytes = enc.encode(text);
        const crc = crc32(bytes);
        const head = new DataView(new ArrayBuffer(30));
        [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, bytes.length, 4], [22, bytes.length, 4], [26, nameBytes.length, 2], [28, 0, 2]]
          .forEach(([at, value, size]) => (size === 4 ? head.setUint32(at, value, true) : head.setUint16(at, value, true)));
        parts.push(new Uint8Array(head.buffer), nameBytes, bytes);
        const cen = new DataView(new ArrayBuffer(46));
        [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, bytes.length, 4], [24, bytes.length, 4],
          [28, nameBytes.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
          .forEach(([at, value, size]) => (size === 4 ? cen.setUint32(at, value, true) : cen.setUint16(at, value, true)));
        central.push(new Uint8Array(cen.buffer), nameBytes);
        offset += 30 + nameBytes.length + bytes.length;
      });
      const size = central.reduce((sum, chunk) => sum + chunk.length, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, files.length, true);
      end.setUint16(10, files.length, true);
      end.setUint32(12, size, true);
      end.setUint32(16, offset, true);
      return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
    }
    const xml = (value) => String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // 直引号 → 弯引号（按段落奇偶交替）；英文单词中间的撇号用右单引号
    const curly = (text) => {
      let dq = 0;
      let sq = 0;
      return String(text == null ? '' : text).replace(/"/g, () => (dq++ % 2 ? '”' : '“'))
        .replace(/(^|.)'(?=(.|$))/gs, (all, before, after) => (/[A-Za-z]/.test(before) && /[A-Za-z]/.test(after) ? `${before}’` : `${before}${sq++ % 2 ? '’' : '‘'}`));
    };
    const fonts = (east) => `<w:rFonts w:ascii="Times New Roman" w:hAnsi="${east}" w:eastAsia="${east}" w:cs="Times New Roman"/>`;
    const SONG_ALL = '<w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体" w:cs="宋体"/>';
    function runs(text, { bold = false, size = 24, east = '宋体', color = '', underline = false } = {}) {
      const props = (font) => `<w:rPr>${font}${bold ? '<w:b/><w:bCs/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${underline ? '<w:u w:val="single"/>' : ''}</w:rPr>`;
      return curly(text).split(/([“”‘’])/).filter(Boolean).map((part) => (/^[“”‘’]$/.test(part)
        ? `<w:r>${props(SONG_ALL)}<w:t xml:space="preserve">${xml(part)}</w:t></w:r>`
        : `<w:r>${props(fonts(east))}<w:t xml:space="preserve">${xml(part)}</w:t></w:r>`)).join('');
    }
    // 段落：kind = title 标题（黑体居中）/ subtitle 副标题（楷体居中）/ h 小标题（黑体）/ body 正文（首行缩进）/ plain 不缩进 / note 小字
    function para(content, kind = 'body', opts = {}) {
      const spec = {
        title: { jc: 'center', east: '黑体', size: 36, bold: true, after: 120 },
        subtitle: { jc: 'center', east: '楷体', size: 24, after: 240 },
        h: { jc: 'left', east: '黑体', size: 28, bold: true, before: 240, after: 120, keep: true },
        body: { jc: 'both', east: '宋体', size: 24, indent: true },
        plain: { jc: 'both', east: '宋体', size: 24 },
        note: { jc: 'both', east: '宋体', size: 21, color: '595959' },
      }[kind];
      const parts = Array.isArray(content) ? content : [content];
      const body = parts.map((part) => (typeof part === 'string' ? runs(part, spec) : runs(part.text, { ...spec, ...part }))).join('');
      return `<w:p><w:pPr>${spec.keep ? '<w:keepNext/>' : ''}${opts.pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${spec.before || 0}" w:after="${spec.after || 0}" w:line="360" w:lineRule="auto"/>`
        + `${spec.indent ? '<w:ind w:firstLine="480"/>' : ''}<w:jc w:val="${spec.jc}"/></w:pPr>${body}</w:p>`;
    }
    // 表格：rows 第一行可设 head；widths 以 DXA 计（A4 版心约 9026）
    function table(rows, widths, { head = true } = {}) {
      const total = widths.reduce((sum, w) => sum + w, 0);
      const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('') + '</w:tblBorders>';
      return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`
        + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
        + rows.map((row, r) => `<w:tr>${row.map((cell, c) => {
          const bold = head && r === 0;
          const lines = String(cell == null ? '' : cell).split('\n');
          return `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/>${bold ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF3F1"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>`
            + lines.map((line) => `<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="300" w:lineRule="auto"/><w:jc w:val="${bold ? 'center' : 'left'}"/></w:pPr>${runs(line, { bold, size: 21, east: bold ? '黑体' : '宋体' })}</w:p>`).join('')
            + '</w:tc>';
        }).join('')}</w:tr>`).join('') + '</w:tbl>' + para('', 'plain');
    }
    // 期中考查作业 Word 的开头（2026-10-29 用户截图）：学生信息栏（班级、学号、姓名，下面一道金色横线）＋“作答说明”框（左侧金色竖条、米色底、藏青标题）。
    // fields 里有值的写上并加下划线，没有的留横线让学生手写；notes 每条一项，自动编号
    function examHead(fields = {}, notes = []) {
      const GOLD = 'B8913A';
      const p = (inner, { jc = 'left', before = 0, after = 0, border = '', ind = '' } = {}) => `<w:p><w:pPr>${border}<w:spacing w:before="${before}" w:after="${after}" w:line="360" w:lineRule="auto"/>${ind}<w:jc w:val="${jc}"/></w:pPr>${inner}</w:p>`;
      const field = (label, value) => runs(`${label}：`) + (value ? runs(`　${value}　`, { underline: true }) : runs('_____________'));
      const student = p([field('班级', fields.klass), field('学号', fields.sid), field('姓名', fields.name)].join(runs('　　')), {
        jc: 'center', before: 240, after: 360, border: `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="12" w:color="${GOLD}"/></w:pBdr>` });
      const items = notes.map((line, i) => p(runs(`${i + 1}. ${line}`), { jc: 'both', after: 60, ind: '<w:ind w:left="400" w:hanging="400"/>' })).join('');
      const box = `<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="single" w:sz="36" w:space="0" w:color="${GOLD}"/>`
        + '<w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/>'
        + '<w:tblCellMar><w:top w:w="200" w:type="dxa"/><w:left w:w="320" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:right w:w="240" w:type="dxa"/></w:tblCellMar></w:tblPr>'
        + '<w:tblGrid><w:gridCol w:w="9026"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9026" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8F4E8"/></w:tcPr>'
        + p(runs('作答说明', { bold: true, size: 28, east: '黑体', color: '2E4A70' }), { after: 120 }) + items + '</w:tc></w:tr></w:tbl>';
      return student + box + para('', 'plain');
    }
    // “作答说明”的默认各条：出自哪一章、题型分值、作答要求（逐条，去掉句末分号）、截止时间与递交方式
    function examNotes({ chapter = '', type = '', words = 0, requirements = [], deadline = '' } = {}) {
      const named = String(chapter || '').replace(/^(第[一二三四五六七八九十]+章)\s*(.+)$/, '$1“$2”');
      const reqs = (requirements || []).map((line) => String(line).trim().replace(/[；;，,、]$/, '')).filter(Boolean)
        .map((line) => (/[。！？]$/.test(line) ? line : `${line}。`));
      const counted = reqs.some((line) => /\d+\s*字/.test(line));
      return [
        named ? `请运用本课程${named}的相关概念与理论作答。` : '',
        `${type ? `${type}题，` : ''}总分 100 分${words && !counted ? `，${words} 字左右` : ''}；独立完成，联系给定资料论证。`,
        ...reqs,
        `${deadline ? `递交截止日期：${deadline}，` : ''}请登录课程网站在本作业页面递交（递交后不能修改）。`,
      ].filter(Boolean);
    }
    // opts.landscape：A4 横向（课表）
    function docx(bodyXml, opts = {}) {
      const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      return zip([
        ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
        ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
        ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
        ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${fonts('宋体')}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`],
        ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}<w:sectPr>${opts.landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>'}<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>`],
      ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
    // Excel：rows 第一行为表头（加粗）；数字写成数值，其余写成文本；widths 为列宽（字符数）
    const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="宋体"/><family val="3"/><charset val="134"/></font><font><b/><sz val="11"/><name val="宋体"/><family val="3"/><charset val="134"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    // 多张工作表（2026-11-05 学习数据导出）：sheets＝[{ name, rows, widths }]
    function xlsxBook(sheets) {
      const one = (sheet) => xlsx(sheet.name, sheet.rows, sheet.widths, true);
      const parts = sheets.map(one);
      const safe = (name) => xml(String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
      const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + parts.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
      const book = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${safe(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
      const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${parts.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
      return zip([
        ['[Content_Types].xml', types],
        ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', book],
        ['xl/_rels/workbook.xml.rels', rels],
        ['xl/styles.xml', XLSX_STYLES],
        ...parts.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheet]),
      ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    function xlsx(sheetName, rows, widths = [], sheetOnly = false) {
      const col = (index) => { let s = ''; let n = index + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
      const cell = (value, r, c) => {
        const ref = `${col(c)}${r + 1}`;
        const style = r === 0 ? ' s="1"' : '';
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
        if (value == null || value === '') return `<c r="${ref}"${style}/>`;
        return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
      };
      const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        + (widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
        + `<sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => cell(value, r, c)).join('')}</row>`).join('')}</sheetData></worksheet>`;
      if (sheetOnly) return sheet;
      return zip([
        ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
        ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
        ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
        ['xl/styles.xml', XLSX_STYLES],
        ['xl/worksheets/sheet1.xml', sheet],
      ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    // 保存到本机（下载）
    function save(blob, name) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    return { docx, xlsx, xlsxBook, para, table, save, curly, runs, xml, examHead, examNotes };
  })();

  // ---------- 学生页“更新说明”（2026-11-06 起放在这里，学生页和教师工作台“更新说明”共用） ----------
  // 每条是 [小标题, 说明, 日期]；分组标题为空时按条目日期自动显示日期范围。用户：“超过20天以上的更新状态不在学生端的‘更新说明’中显示。
  // 但是在教师控制台专门设置一个新的‘更新说明’板块记录所有更新情况。”——学生页 newsList(course, 20)，工作台 newsList(course, 0)
  function news(course) {
    const Live = window.ClassLive || {};
    const config = { course };
    const FB = Live.feedbackBox ? Live.feedbackBox.texts(course === 'political-economy') : { tag: '匿名建议箱' };
    const REALMS = Live.realmsFor ? Live.realmsFor(course) : (Live.REALMS || []);   // 门槛按课程（化神：习经 135%、政经 155%）
    const GIFTS = Live.GIFTS || [];
    // 修炼场规则说明（与学生页 practiceRule 相同）
    const practiceRule = () => {
      const P = Live.PRACTICE || { gap: 3, of: () => ({ cap: 10 }), text: () => '' };
      const r = P.of(config.course);
      return `题目是另写的新题，和课堂上的题不重复；老师开过的每一次课，对应的题都开放（以前的课也能复习；提前发布、还没开课的只能查看，开课后才开放、才计修为）；每题第一次答对得修为：${P.text(config.course)}（当天先答错的，隔天再答对也算）；隔 ${P.gap || 3} 天以上再答对，还能再得一次（复习巩固，每题最多两次）${config.course === 'political-economy' ? '；案例页的“课后自修”也计修为（出门测每题答对 +2、主动回忆每个概念 +1、温故答对 +2、写一段话讲给别人听 +3、课后思考写满 100 字 +5，只算一次）' : ''}；每天最多 ${r.cap} 修为。境界按全学期满分算，平时天天练、修为攒得早的同学，能更早冲上「化神」；临时突击受每日上限所限，补不回来。`;
    };
    const like = Live.LIKE || {};
    const wordgame = (Live.WORDGAME || {}).points || 10;
    const leave = (Live.LEAVE || {}).points || 20;
    return [
      { title: '最新', items: [
        // 2026-11-22（夜）：学生页手机、笔记本上更清爽，更新说明改版（用户：“你看看能不能再美观优化一下课堂页和学生页的呈现.”“都做吧”）
        ['更新说明换了样子', '最近一天的更新直接展开，更早的几天先收起；每条先显示标题和一行，点一下看全文，右上角可以“全部展开”。', '2026-11-22'],
        ['手机和笔记本上更清爽', '手机上往下翻页的时候，左下角、右下角的圆按钮先变淡，停下来再显示，不挡住正在读的文字；笔记本屏幕上，面板收起以后只剩左下角一个小圆钮（点它展开），不再挡住题目。', '2026-11-22'],
        ...(config.course === 'political-economy' ? [
          ['手机上只留顶部的目录栏', '手机上原来顶部、底部各有一条目录栏，现在只留顶部那条（往下翻时自动收起，往上翻再出现），页码也不再单独显示，底部不再挤。', '2026-11-22'],
        ] : []),
        // 2026-11-22（晚上）：小游戏等老师点“开始”（用户：“辩论赛，机制图这类小游戏，要老师点击按钮后才可以游玩，参照pk对决的方式。”）；政经线索精简与重新编号
        ...(config.course === 'xjp-economy' ? [
          ['辩论赛、机制图闯关、分组讨论、经营沙盘：等老师开始', '课程网站上课时，这几项要等老师在大屏上点“开始”以后才出现；开始以前，这里只有一张“等老师开始”的卡片，辩题、讨论题、角色卡和上面的机制图可以先看一看。辩论赛开始以后，跟着老师的进度一步一步开放，还没到的步骤不能递交。请假补做时不用等。', '2026-11-22'],
        ] : [
          ['辩论赛：等老师开始', '课程网站上课时，辩论赛要等老师在大屏上点“开始”以后，才能投辩前票、选论据卡；后面的自由讨论、聊天室、辩后投票也跟着老师的进度一步一步开放，还没到的步骤不能递交。开始以前，这里只有一张“等老师开始”的卡片，辩题可以先想一想。请假补做时不用等。', '2026-11-22'],
          ['线索按出现的先后重新编号', '案例里没有用到的延伸阅读线索去掉了；其余线索按在页面上出现的先后，重新编成线索 01、02、03……，题目、解析里提到的线索编号也一起改好了。', '2026-11-22'],
        ]),
        // 2026-11-22：云间灵田小景夜里亮灯、摆放范围放宽；宗主每周推选、连任最多两周，宗门榜显示宗主的境界和修为
        ['云间灵田 · 夜灯和摆放', '洞天里的“暖玉石灯”和“藏书小阁”到了晚上会亮灯。布置洞天时能摆的地方变大了：除了灵田和水渠，草地上都能摆，一直到草地边上；小景之间可以挨着放；压住原有的松树、灵石时，它们会自动收起，把小景挪开又回来。已经摆好的布局不受影响。', '2026-11-22'],
        ['宗主每周推选，连任最多两周', '宗主改为每周一推选一次：本宗元婴以上的同门里修为最高的担任，一任一周；连任最多两周，做满两周就换下一名，本宗元婴以上的同门都轮过一遍以后再从头轮起。面板“宗门”里，每个宗门下面多了一行本周宗主的境界、修为和连任第几周；云间灵田的宗门页同样显示（灵田里写的是道号）。', '2026-11-22'],
        // 2026-11-21（下午）：每题常显“⤢ 全屏”、全屏时带上题干和解析、“本课时步骤”日程表、更新说明按天分组
        ...(config.course === 'xjp-economy' ? [
          ['每道题右上角都有“⤢ 全屏”', '电脑上，每道题、每一块内容的右上角都有“⤢ 全屏”，一直显示，不用再把鼠标移上去找“⤢”（步骤卡右边的“⤢ 放大”也改叫“⤢ 全屏”）。全屏看题时，题干和解析跟着题目一起显示：纠错诊断里那条错误说法、每组快问快答的研讨题、迁移任务的理论要点清单，都在这一屏里。顶栏的“退出放大”改叫“退出全屏”，原来的“全屏”改叫“占满屏幕”（连浏览器的标签栏也收起）。', '2026-11-21'],
          ['“本课时步骤”换了排版', '每个课时开头的“本课时步骤”改成日程表：一行一个环节，左边是用时和起止时间，右边是这一环节的步骤，点一下就跳到页面上的对应位置。', '2026-11-21'],
        ] : [
          ['线索放进了题目里', '案例的线索不再集中放在前面，也不再一页线索、一页概念穿插着排（只有案例 01 没有变）：每个概念第 1 步“先想一想”的开头，就是这个概念要用的线索卡——读完线索，紧接着回答下面的问题；全屏看题时，线索和题目在同一屏。放在最前面单独一页的线索是案例的开头；放在概念学完之后的线索没有对应的题目，是延伸阅读。你已经递交的作答不受影响。', '2026-11-21'],
          ['每一题右上角都有“⤢ 全屏”', '电脑上，每一题（每个概念的每一步、迁移任务、辩论赛、概念串联、深度思考、课后自修的每一块）右上角都有“⤢ 全屏”，一直显示，不用再把鼠标移到卡片上找“⤢”：点一下，这一题铺满窗口，照常选择、输入和递交。顶栏的“退出放大”改叫“退出全屏”，原来的“全屏”改叫“占满屏幕”（连浏览器的标签栏也收起）。', '2026-11-21'],
        ]),
        ['修仙表情包', '“发弹幕”右边多了“表情”：一套 20 个修仙小表情——悟了、受教了、妙啊、前辈高见、求解惑、道友留步、闭关中、炼丹中、渡劫中、突破啦、稳了、道友加油、道心不稳、走火入魔、罢了罢了、灵力耗尽、御剑赶到、静观其变、天机不可泄露、告辞。点一个就发到投屏上；和发弹幕一样每 5 秒一条，老师关了弹幕或开了审核时同样受约束，发出去的可以在“我发过的弹幕”里删除。表情不计修为，想攒修为还是要写有内容的弹幕。', '2026-11-21'],
        ['更新说明按天排', '“更新说明”改为一天一组，最近的一天排在最上面，不再把一段时间的更新放在一起。', '2026-11-21'],
        ...(config.course === 'xjp-economy' ? [
          ['机制图闯关换成大屏', '机制图下面点“开始闯关”，闯关铺满屏幕：上面一排节点卡片跟着一步一步点亮，下面出题。中途点右上角“×”（或按 Esc）先回页面，再点“继续闯关”接着来；通关后页面上的机制图整张亮起。', '2026-11-20'],
          ['闯关一关一关来', '小资料分析闯关改成一关一屏：先出第一问，选了以后再出第二问，两问都选好才能进下一关（交卷以前可以回上一关改），最后一关交卷。抢答和闯关的画面换成了铺满屏幕的深色大屏风格。', '2026-11-20'],
          ['点文字不再跳页', '以前在页面左右两侧点到文字、标签或卡片，会跳到上一节或下一节；现在只有点在真正的空白处才翻节，点内容不会再跳走。', '2026-11-20'],
          ['纠错诊断改成多选', '第二课时的“纠错诊断”不再先判断对错（两条说法本来就都有问题）：每条说法从 5 个选项里选出说中了的错处（多选，没说中的不要选），选好点“递交”。', '2026-11-20'],
          ['出门测照“课后自修”', '出门测课上做不完的，下课后、下一次课之前也可以做；递交后不显示答案，答对每题另加 2 修为（不再计入“作答完成”“作答正确”），答案在下一次课讲评，讲评以后做错的题进“回温”。以前上过的课不受影响。', '2026-11-20'],
          ['机制图闯关', '第二课时的“机制图 · 弹幕接龙”改成了闯关：机制图先只亮第一步。第一阶段“推链条”——从前一步推出后一步，把整张图一步一步点亮；第二阶段“Boss 战”——给每个箭头选对道理，打败只记顺序、说不清道理的“想当然”（三颗心，答错一次少一颗，用完重来）。不计修为，可以反复闯；通关后点“逐步演示”回看整条链。改为分组讨论的案例没有闯关。', '2026-11-20'],
          ['材料归纳改为随机抢答', '第一课时的“材料归纳 · 多选”先收起：老师发起抢答后，页面弹出 5 秒倒计时，随后限时作答，每人只能交一次，前 10 位答对的同学各加 5 修为；抢答结束后这道题照常显示在页面上。', '2026-11-20'],
          ['小资料分析改为限时闯关', '第二课时的“迁移任务 · 小资料分析”先收起：老师开放入口后，三则小资料一关一关作答，每关两问——先选出唯一讲对了的分析，再判断它对应哪个理论要点，两问都对才算过关；限时内只能交一次，到时间自动交卷，三关全过加 5 修为。交卷后可以看到题目、答案和讲解。', '2026-11-20'],
          ['四步解析对所有同学开放', 'Q1—Q4 每一组快答题都递交以后，题目下方可以点“展开四步解析”，看这道研讨题按“亮明观点—教材依据—案例事实—回到题目说明”写出来的完整分析（不看境界，所有同学都能看）。', '2026-11-20'],
        ] : []),
        ['辩论赛：只有点赞前三加修为', '辩后投票票数多的一方仍然公布为获胜方，但不再给获胜方加修为（以前课上已经加的不变）；只有两方聊天室合起来、发言被点赞最多的三位同学各加 5 修为。辩后票按自己的判断投，不用看哪一方人多。', '2026-11-21'],
        ['“确认递交？”可以慢慢来', '点“递交”后出现“确认递交？”，原来 3 秒内不再点就自动取消，现在可以等 15 秒；这期间去勾“写完自检”、修改作答，提示会跟着更新，回来再点一次就递交。过了时间没有确认，会写明“这道题还没有递交”。', '2026-11-21'],
        ['元婴多了一档「元后巅峰」', '修为到全学期满分的 100% 以后、突破「化神」以前，称号是「元后巅峰」。初期、中期、后期的分界没有变，大家现在的境界不受影响。点面板上的境界可以看到进度条上标出的四个档位。', '2026-11-21'],
        ['退出放大时可以选回到哪里', '在“放大”里换过题以后，点“退出放大”或按 Esc 会先问一句：回到进来时的那一题，还是留在现在这一题（也可以点“继续看题”不退出）。没换过题直接退出。', '2026-11-20'],
        ['云间灵田：卖灵草可以选数量', '乾坤袋里每种灵草多了一个数量框：点“−”“＋”或“一半”，也可以直接输入数字，再点“售给药铺 N 份”；不用一份一份点，也不用一次全卖。', '2026-11-20'],
        ['面板里的“导出 HTML”去掉了', '网站上的作答递交以后就存在后台，不用再导出文件交给老师，所以面板里只留“导出 PDF”（复习用）。', '2026-11-20'],
        ['辩论赛加了自由讨论和倒计时', '辩论赛现在是四步：① 选立场 · 论据卡 → ② 自由讨论 5 分钟（和同一立场的同学当面讨论，想好自己的观点和理由，这一步聊天室还不能发言）→ ③ 聊天室发言点赞 → ④ 辩后投票。每一步的倒计时也显示在你的页面上，时间到了这一步就不能再递交（聊天室不能再发言）；老师加时以后可以继续。', '2026-11-20'],
        ['云间灵田：卡牌光效换了', '地品、天品卡牌的光效换了：光点从卡牌边框上随机冒出、向外飘散，书案上的展示牌也一样（不再是一圈圈向外扩散的框和放射的光线）。', '2026-11-20'],
        ['电脑上也能全屏答题', (config.course === 'political-economy'
          ? '在电脑上点题目右上角的“⤢”（或直接点题目卡片、递交旁边的“⤢ 全屏”），这一题会放大铺满窗口：照常选择、输入和递交，'
          : '在电脑上点步骤卡右边的“⤢ 放大”、题目右上角的“⤢”或递交旁边的“⤢ 全屏”，这道题会放大铺满窗口：照常作答和递交，')
          + '顶上有“上一题”“下一题”（键盘 ← → 也行），A−／A+ 调大小，点“退出放大”或按 Esc 回到页面。手机上答题仍用递交旁边的“⤢ 全屏”。', '2026-11-20'],
        ...(config.course === 'political-economy' ? [
          ['概念串联改为拖动排序', '概念串联的排序题不用再点“上移”“下移”：按住每句话右边的“≡”上下拖动，就能调整先后顺序（电脑上按住整句也能拖）。每句话前面的序号跟着句子走、不会变，排好以后可以按序号把顺序读出来。', '2026-11-20'],
          ['深度思考', '原来的“豁然开朗”改名“深度思考”，放在概念串联之后，学习路线页不再预告“本课悬念”。每个案例后半段的顺序改为：迁移任务 → 辩论赛 → 概念串联 → 深度思考 → 课后自修；有的案例在“深度思考”里另有几个假想问题，用弹幕说出你的判断。', '2026-11-20'],
          ['概念讲解', '「筑基」以上的同学，“先想一想”递交以后点题目下方的“展开解答与概念讲解”：除了参考答案，还能看到这个概念的讲解——要点与定义、教案板书、典型题解析和教材原文，和老师投屏讲的一样。', '2026-11-19'],
          ['算一算一步一步来', '“用一用”里的计算题，上方列出“一步一步来”的几个问题（比如“一天创造的新价值应该怎样计算？”），照着一步一步算；课上老师先问每一步，再一步一步展开解法。', '2026-11-19'],
          ['手机能输入负号了', '计算题的输入框换了键盘：以前苹果手机的数字键盘没有负号，填不了负数，现在弹出的键盘有“-”号。', '2026-11-19'],
        ] : []),
        ['请假以后可以补做', '请假那次课的题目，课后用那次课的课堂码登录就能补交，照常计修为；课堂停止以后也能补（老师撤销请假、换了课堂码就不能再补）。弹幕、投票、小游戏等课堂活动不补。', '2026-11-19'],
        ['匿名建议可以收到回复', '老师回复了你的匿名建议以后，你下次打开课程页面会弹出对话框：能看到老师的回复，也可以在对话框里继续回复老师。这段往来只有你能看到，老师仍然不知道建议是谁写的；看完点“关闭”，不关的话下次打开还会弹出。', '2026-11-19'],
        ...(config.course === 'political-economy' ? [['本节课重点', '每个案例最后的“概念小结”页最前面新增“本节课重点”：一段话串起这节课，列出重点和难点，再给三道重点问答——先用自己的话答一答，答不上来就点“回看”复习对应的概念。', '2026-11-19']] : []),
        ...(config.course === 'xjp-economy' ? [['本节课重点', '每章最后的“本章知识点小结”最前面新增“本节课重点”（页面导航“重点与小结”）：一段话串起这节课，列出重点和难点，再给三道重点问答——先用自己的话答一答，答不上来就点“回看”复习对应的研讨题。', '2026-11-19']] : []),
        ['云间灵田 · 手机竖屏也能玩', '手机转不过来的时候（比如在微信里打开，或者手机锁了方向），灵田不会再卡在“横置手机，展开山景”：点“先竖着玩”，就能竖着种田、答题和交易。提示里也写了怎么打开旋转——在微信里打开的，到微信“我 → 设置 → 通用”里打开“横屏模式”。竖屏时“我的灵田”和时间放在最上面；开卡后的“全卷已览”改为两列大卡，卡图和名称看得更清楚。以后把手机横过来，会自动展开完整山景。', '2026-11-18'],
        ['经营沙盘、分组讨论实名', '经营沙盘和分组讨论的本组聊天室也改为实名：递交角色以后点“进入聊天室”就以真实姓名进入，不用再取昵称；发言和成员名单都显示姓名（同名的同学名字后加学号末两位）。', '2026-11-18'],
        ['辩论聊天室实名', '辩论赛的聊天室改为实名：递交辩前票以后点“进入聊天室”就以真实姓名进入，不用再取昵称；发言、成员名单和点赞前三都显示姓名（同名的同学名字后加学号末两位）。', '2026-11-18'],
        ['参悟 · 卡背依据', '云间灵田“道藏参悟”去掉了作答前的“看看卡背提示”：先自己判断，点“确认我的判断”以后，对错和卡背依据一起显示；答错了可以对照依据再想一次。', '2026-11-18'],
        ['宗门弹幕', '拜入宗门的同学，投屏上的弹幕外框是本宗的颜色（枫霞谷枫红、玄月宗玄紫、灵犀山青绿、星澜宫星蓝）；宗主的弹幕带一圈炫彩流光。', '2026-11-18'],
        ['云间灵田 · 卡住修好了', '修好了做过“参悟”以后灵田一直显示“有操作待确认，请同步云端”（参悟里是“这次研习结果正在确认”）、什么也做不了的问题。如果你还看到这条提示，点一下“同步云端”（参悟里是“同步进度”）就恢复了；同一次操作只会结算一次，不会重复。', '2026-11-18'],
        ['回温', `${config.course === 'political-economy' ? '案例页“课后自修”的最后、“本堂作业递交情况”的后面' : '章节页最后一个出门测的后面'}新增“回温”：汇集你在课堂、修炼场和云间灵田里做错的题，逐题重做。答对了就从清单里移走；答错了可以看答案和讲解（课堂上的题要到「筑基」才给答案和讲解，同“展开解答”），过一会儿再来做一遍。${config.course === 'political-economy' ? '课后自修的出门测、温故，等下一次课讲评以后才进回温。' : ''}回温的题不算本堂作业，不计入递交情况，也不加修为，是帮你把易错点补牢。`, '2026-11-18'],
        ['云间灵田', '拜入宗门（四大宗门之一，散修不能）以后，面板“宗门”里会出现“云间灵田”入口（老师开放后才有）：开辟自己的灵田，种灵植、炼丹、到坊市交易，也能去各课各届道友那里“偷菜”。第一次进入先起一个道号——道友们看到的是道号，不要用真实姓名；请文明取名，不能用国家领导人的姓名（含谐音、拼音、缩写），不能有辱骂、低俗、敏感的字词，道号不文明的会被老师销号。浇水、锄草时有一定概率要先答对一道本课程修炼场的题；偷菜会触发守田阵法，答对才偷得到，答错要赔灵石给田主。道友名单每批 5 位，每天前 5 批免费，之后每答对一题再换一批，最多再换 5 批。灵田里的境界以课程网站的修为境界为准；服丹可以折算网站修为（每颗 0.3—3，每天最多 3、每周最多 15，整学期最多为满分的 10%，老师结算修为时计入）。本宗元婴以上、修为第一的同学是宗主（11 月 22 日起改为每周一推选、连任最多两周），境界旁会显示“宗主”标志，可以在灵田里布置本宗山门。', '2026-11-15'],
        ...(config.course === 'political-economy' ? [['第八章新题', '第八章两个案例（案例 13、14）补上了“豁然开朗”（学习路线页先抛出的悬念，辩论赛之后揭晓）和完整的“课后自修”（闭卷默写、温故、讲给别人听，做了就积累修为）；修炼场也新增了这两个案例的情境辨析、易错判断和“讲给别人听”练习题。', '2026-11-11']] : []),
        ...(config.course === 'xjp-economy' ? [['迁移任务 · 小资料分析', '第二课时的“迁移任务”改为小资料分析：三则新的小资料，每题四个说法里只有一个用本案例的道理讲对了，选出来逐题递交（不用再写“说一说”）。出门测之前加了一轮“情境猜谜”抢答。猜词游戏不再放在页面里，老师在课堂工具里决定这堂课玩不玩。', '2026-11-12']] : []),
        ...(config.course === 'xjp-economy' ? [['分组讨论', `有圆桌会议的案例（案例 02、03、04、05、10、11、13、14）第二课时改为“分组讨论”：按四方角色分成四组，选好角色递交后取一个昵称进入本组聊天室，围绕讨论题和本组任务发言、给本组的好发言点赞；点赞最多的就是本组发言人，到大屏前亮观点；最后全班为三项议程表决。每组发言人加 ${DISCUSS.leader} 修为，本方提案被全班表决采纳的组里在聊天室发过言的同学各加 ${DISCUSS.win} 修为。机制图改由老师逐步演示，不再弹幕接龙。`, '2026-11-11']] : []),
        ...(config.course === 'xjp-economy' ? [['时间轴排排站', `PK 对决里的“时间轴排排站”改为全班一起玩：老师点“分组”后全班随机分成红、蓝两队，你的页面上会弹出答题对话框，显示你在哪一队；每题倒计时内在对话框里选大屏上那张事件卡该放在时间轴的第几个位置（可以改选），倒计时结束揭晓，答对人数多的一队得 1 分；最后得分高的一队每人修为 +${TIMELINE.points}。`, '2026-11-11']] : []),
        ['灵根八相', '面板上新增粉色的“灵根”按钮：用一张八边形图看你本学期在八个方向上的修炼——勤勉（到课）、恒心（学习天数）、精进（学习行为）、悟性（正确率）、论道（弹幕）、历练（修炼场）、定力（在线时长）、根基（修为），和全班平均比一比，看清自己的所长和待补。“修为榜”“灵根”“修炼场”“宗门”四个按钮现在排在学号下面一行。', '2026-11-11'],
        ['突破元婴', '突破「元婴」「化神」时，课堂投屏和你自己的页面都会播放一次突破画面和祝福语（每台设备各放一次；已经突破的同学，下次打开页面时补放一次）。到「元婴」以后，修为榜上照常显示姓名，不能再隐匿。', '2026-11-11'],
        ['无效弹幕', '老师删除无效弹幕（比如只发“1”“111”）时，这条弹幕已经得到的修为会撤回，你的页面上会弹窗提醒。发有内容的弹幕才有修为，同一句只算一次。', '2026-11-06'],
        ['全屏答题（手机）', '用手机做题时，点题目下方“递交”旁边的“⤢ 全屏”，或面板里的“全屏答题”：一题一屏、字更大，左下角、右下角是“上一题”“下一题”，顺着做下去；右上角 A−、A+ 调字号。安卓手机会自动转成横屏；iPhone 可以把手机横过来（先在控制中心关掉“竖排方向锁定”），或点上方的“横屏”把画面转过来，写字时会自动转回竖屏。点左上角“退出”（或返回键）回到原来的页面，停在刚才那道题。', '2026-11-06'],
        ['辩论赛简化', `辩论赛取消 3v3 辩论台，只有三步：① 选立场（辩前投票）、选 2 张论据卡，分别递交；② 取一个昵称进入本方聊天室发言，给本方的好发言点赞——两方合起来，发言被点赞最多的三位同学各加 ${(Live.DEBATE || {}).likes || 5} 修为；③ 辩后投票：听了两方的观点，现在支持哪一方。老师停止递交后，票数多的一方获胜（当时获胜方聊天室里的同学各加 5 修为；2026-11-21 起获胜方不再加修为）。`, '2026-11-06'],
        ['宗门', `达到「筑基」境界后，可以点面板学号一行右边的“宗门”拜入四大宗门之一：${(Live.SECTS || []).map((sect) => sect.name).join('、')}，也可以暂做散修（散修以后仍可拜入宗门）。拜入以后有一次改投他宗的机会，只有一次，也不能退为散修。宗门分是本课程历届弟子的修为之和，宗门榜按宗门分排名；弟子结课以后修为仍留在宗门里，一届一届传承下去。拜入后修为榜上你的名字旁会显示宗门标记。`, '2026-11-05'],
        ['情境猜谜抢答', `老师点“看玩法”或出题后，页面上方会弹出“情境猜谜抢答”对话框，大屏关掉前一直都在；每次出题（包括“下一题”）全班统一倒计时 ${(Live.PUZZLE || {}).delay || 10} 秒，大家的倒计时按老师的时钟同步，倒计时结束才能输入谜底抢答，网速慢的同学也来得及。`, '2026-11-05'],
        ['法宝', '祭出法宝时，除了投屏，你自己的页面上也会出现法宝的画面。', '2026-11-05'],
        ['展开解答', '「筑基」以上展开解答时，单选题会逐项说明每个错误选项错在哪里；选择题的选项也改得更有迷惑性，正确答案不再总是最长的那一项。', '2026-11-05'],
        ...(config.course === 'xjp-economy' ? [
          ['经营沙盘', `案例 06（第九章）、08（第十章）、09（第十章）、19（第六章）第二课时的圆桌会议改为“经营沙盘”：全班为一家虚拟的企业、银行或城市片区开会做决策。先选一个角色组并递交，看本组的私密信息；再取昵称进本组聊天室商量、给好建议点赞，点赞最多的建议作者当本组代表；四位代表为三项决策投票，中途还有一张突发事件卡。各项指标都守住红线就算经营合格：四位代表各加 ${(Live.BIZ || {}).rep || 10} 修为，本方指标最高的角色组里发过言的同学各加 ${(Live.BIZ || {}).top || 5} 修为。`, '2026-11-04'],
        ] : []),
        ['修为榜隐名', '达到「结丹」境界后，可以在修为榜上隐匿自己的姓名：打开修为榜，点一下自己的名字（或下面的“隐匿我的姓名”），同学们看到的就是“***”，修为和名次照常显示；再点一下恢复。老师那里照常显示姓名。', '2026-10-30'],
        ['课堂投票', '老师在投屏页发起临时投票时，你的页面中间会弹出选项（如“是／否”“赞同／反对”），点一个就投好了，投票结束前可以改；老师公布结果后会显示各项人数。投票不计修为。', '2026-10-29'],
        ['这堂课感觉怎么样', `页面最后的“${FB.tag}”上方新增一行笑脸和不高兴的脸：上完课点一下，告诉老师这堂课感觉怎么样。每人每天一票、可以改；老师只看到各有多少人，看不到是谁选的。`, '2026-10-28'],
        ['元婴', '境界「元婴」的门槛由全学期满分的 80% 调为 65%（筑基 15%、结丹 35%、化神 90% 不变），老师下一次结算修为后生效。', '2026-10-28'],
        ...(config.course === 'political-economy' ? [
          ['迁移任务', '案例页的辩论赛之前新增“迁移任务”：几个新的小案例（都不是本案例里的事），像猜谜一样想一想，每个小案例最能用本案例哪个概念来解释，给每个选一个概念，全部选好后一起递交，课上跟老师核对。', '2026-10-30'],
          ['辩论赛', '案例页的“小组辨析”改为辩论赛，辩题只有正反两方（不再有“部分同意”），具体玩法见上面的“辩论赛简化”。', '2026-10-29'],
          ['课后自修不给答案', '课后自修（出门测、主动回忆、温故、讲给别人听）不再显示答案、解析和对错，讲评在下一次课；答对的照常计入修为。主动回忆改为写好后点“写好了”。', '2026-10-28'],
        ] : []),
        ['登录', '学号不在本班点名册上时，登录页会提示核对姓名和学号（多半是填错了），不再自动向老师申请；确实不在本班名单上的同学（如重修、跨班旁听）点“申请加入本班”。换了手机或电脑又忘记口令，可以在输口令的地方点“忘记口令”向老师申请重设，老师同意后在这台设备上设新口令。', '2026-10-28'],
      ] },
      { title: '', items: [
        ['修炼场多攒修为', `修炼场每天最多 ${(Live.PRACTICE || {}).of ? Live.PRACTICE.of(config.course).cap : 10} 修为（原来${config.course === 'political-economy' ? ' 10' : ' 3'}）；答对过的题隔 ${(Live.PRACTICE || {}).gap || 3} 天以上再答对，还能再得一次（“回炉巩固”里会出现到期的题）。境界按全学期满分算，平时天天练的同学能更早冲上「化神」。`, '2026-10-22'],
        ['修炼场', `面板上学号那一行新增绿色的“修炼场”：平时做本课程的题攒修为，有四种练法——专攻一块（西蒙学习法）、回炉巩固（间隔重复）、混合乱炼（交错练习）、讲给别人听（费曼学习法，有专门的题）。${practiceRule()}`, '2026-10-22'],
        ['境界与修为榜', `境界比例调整为：筑基 15%、结丹 35%、元婴 80%、化神 90%（占全学期满分）。修为榜现在显示每位同学的修为；结丹以上的同学，发弹幕的输入框有按境界变化的流光环绕。`, '2026-10-22'],
        ['境界解锁', '达到「筑基」后，题目递交以后可以在题目下方点“展开解答”看参考答案和讲解；达到「结丹」解锁“资料与延伸阅读”里的学习方法小锦囊（每上一次课多解锁一种方法，由浅入深），还可以在修为榜上隐匿姓名。', '2026-10-22'],
        ...(config.course === 'political-economy' ? [
          ['课后自修', '出门测、课后思考（申论式大题）并入每个案例页的“课后自修”，下课后完成：出门测每题答对 +2 修为，课后思考写满 100 字递交 +5 修为（不评对错），照常逐题递交给老师；“本堂作业递交情况”移到课后自修的最后。', '2026-10-23'],
          ['提问', '概念小结的“提问墙”弹幕取消：没想通的地方写进每个案例页最后的“匿名建议和提问箱”，老师看到后在下一堂课统一解答。', '2026-10-23'],
          ['豁然开朗', '前七章每个案例新增一个“本课悬念”：学习路线页先抛出一个反常识的问题，出门测之后揭晓——先凭直觉选，再看讲解和教材原文。不计分。', '2026-10-22'],
          ['课后自修', '前七章每个案例的出门测之后新增“课后自修”页，也积累修为：主动回忆（凭记忆写满 8 字再翻开对照 +1）、温故（前面案例的概念换个情境再考，答对 +2）、讲给没学过的人听（写满 30 字递交 +3），计入修炼场每日上限。', '2026-10-22'],
        ] : []),
        ...(config.course === 'xjp-economy' ? [
          ['一章两个案例', '第三、四章这样有两个案例的章，老师可以一次只上一个案例：这次课的页面只显示这个案例，下次课再上另一个。', '2026-10-23'],
          ['情境猜谜', '第二章第二课时在猜词游戏之后加了“情境猜谜 · 抢答”：看大屏上的小情境，在“情境猜谜抢答”里输入谜底，第一个猜中的加修为（11 月 5 日起改为页面上方弹出的对话框）。', '2026-10-23'],
          ['递交情况', '“本堂作业递交情况”移到“本章知识点小结”的前面，做完本堂课的题就能看到还有哪些没交。', '2026-10-23'],
        ] : []),
        ...(config.course === 'xjp-economy' ? [['PK 对决', '部分案例第二课时的圆桌会议换成了 PK 对决：老师抽两位同学上台一对一，比擂台抢答、时间轴排排站、因果链拼图或数据猜猜猜，获胜的同学加修为；台下同学先自己作答，揭晓时对照。', '2026-10-22']] : []),
        ['修为榜', '面板上学号那一行右边的金色“修为榜”：看本班修为前十名（前三名站领奖台），也能看到自己排第几；按老师最近一次结算排名，显示境界和修为。', '2026-10-21'],
        ['情境猜谜抢答', `老师在大屏打开“情境猜谜”（看玩法或出题）时，页面上方会弹出“情境猜谜抢答”对话框，老师关掉大屏前一直都在；每次出题后全班统一倒计时 ${(Live.PUZZLE || {}).delay || 10} 秒（按老师的时钟同步），倒计时结束才能输入谜底（本章或本案例的一个概念）点“抢答”，每题最多猜 ${(Live.PUZZLE || {}).tries || 3} 次；第一个猜中的同学加 ${(Live.PUZZLE || {}).points || 5} 修为，投屏上会出现恭喜。`, '2026-10-21'],
        ['递交情况', '页面最下方新增“本堂作业递交情况”：以老师后台收到的为准，显示已递交几题、还有哪些没交（点一下就跳过去），和老师工作台看到的一样。', '2026-10-21'],
        ['学习方法', '“资料与延伸阅读”里新增“学习方法小锦囊”：番茄工作法、西蒙学习法、记忆宫殿、费曼学习法、间隔重复、主动回忆，每种都有用在这门课的例子。', '2026-10-21'],
        ['弹幕', `回答弹幕小问题、弹幕接龙最多可以写 50 字；老师每堂课最多点 ${like.limit || 20} 个赞。`, '2026-10-21'],
      ] },
      { title: '', items: [
        ['请假', `不能来上课时，点面板上姓名旁边的“请假”（面板收起时先点“展开”），选好日期、写明原因提交，老师在加入名单里能看到；没过完的请假可以撤销。请假的那次课计 ${leave} 修为（相当于签到），没有登录也没有请假的课不得任何修为。`, '2026-10-16'],
        ...(config.course === 'political-economy' ? [['使用说明', '页面右下角新增“使用说明”：每个案例怎么学、怎么递交、怎么翻页，都在里面。', '2026-10-16']] : []),
        ...(config.course === 'xjp-economy' ? [
          ['先读案例再投票', '第一课时改为先读案例，再投“课堂投票 · 前测”。', '2026-10-16'],
          ['圆桌会议', '改为四步：认领角色 → 以角色身份发弹幕表态（自动带上【角色名】）→ 三项议程各投一票 → 老师揭晓参考方案，看看各方的底线守住没有、提案写进去没有。', '2026-10-16'],
          ['猜词游戏', '第二课时圆桌会议之后加一轮本章概念猜词游戏：被抽到就上台，一人描述、一人猜。', '2026-10-16'],
        ] : []),
      ] },
      { course: 'xjp-economy', title: '', items: [
        ['理论知识点总结', '每章最后“资料与延伸阅读”新增“复习资料”一栏，按教材整理导论和第一至十五章的核心知识点，含教材原文、记忆口诀、易错判断和课后思考答题要点，点开直接定位到本章，可导出 PDF。', '2026-10-14'],
      ] },
      { course: 'xjp-economy', title: '案例课堂改版', items: [
        ['新题型', '每个案例增加单选、多选、判断题和出门测，每题做完点“递交”，递交后不能修改。', '2026-10-09'],
        ['辩论赛', '辩前投票投哪一方，就站在哪一方；质询弹幕会自动带上【正方】或【反方】。', '2026-10-09'],
        ['圆桌协商', '先递交角色，再以角色身份发弹幕表态，然后为三项议程各投一票，最后对照老师揭晓的参考方案。', '2026-10-09'],
        ['理论要点', '缩写的理论要点，点一下就能看到完整内容。', '2026-10-09'],
        ['章节末尾', '依次是本章知识点小结、资料与延伸阅读（可下载《习近平经济思想学习纲要》《习近平经济思想的生动实践述评》）、匿名建议箱。', '2026-10-09'],
      ] },
      { course: 'political-economy', title: '资料与延伸阅读', items: [
        ['知识点总结', '新增《政治经济学前七章理论知识点总结》，点开直接阅读，也可以导出 PDF，复习考试用。', '2026-10-14'],
        ['参考书', '新增《政治经济学简明教程》（陈享光主编）、《现代政治经济学新编》（通用版，程恩富、冯艳主编）、《政治经济学》（谢地、宋冬林主编）。', '2026-10-14'],
      ] },
      { title: '登录更安全', items: [
        ['个人口令', '登录改为“课堂码＋点名册＋4 位个人口令”。第一次登录时自己设口令，请记牢；忘了请老师在工作台重置。', '2026-10-10'],
        ['防冒用', '口令输错太多次会暂时锁定，锁定时间一次比一次长；不在本班点名册上的同学，要老师允许后才能登录。', '2026-10-10'],
        ['点名册编号', '面板上姓名前的“N号”是你在点名册上的编号，课堂抽人时用。', '2026-10-10'],
      ] },
      { title: '修为境界', items: [
        ['积累修为', '每次课最多 100 修为（签到 20、作答完成 35、作答正确 35、弹幕最多 10），老师点赞、猜词游戏第一名、情境猜谜第一个猜中、匿名建议另外加。', '2026-10-12'],
        ['五个境界', `炼气 → 筑基 → 结丹 → 元婴 → 化神，按全学期修为占满分的比例晋升（${REALMS.slice(1).map((realm) => `${realm.name} ${Math.round(realm.min * 100)}%`).join('、')}）。点面板上的境界或“修为说明”查看进度。`, '2026-10-12'],
        ['弹幕字色', '每升一境多两种（炼气霜白、月银，筑基加青冥、翠竹，结丹加金曦、大红，元婴加樱粉、紫霄，化神加流金、七彩）；投屏上你的名字颜色也与境界一致。', '2026-10-12'],
        ['法宝', `${GIFTS.map((gift) => `${gift.name}（${REALMS[gift.level] ? REALMS[gift.level].name : ''}）`).join('、')}。突破时先在你自己的页面预览一次；之后每件法宝可以在课上祭出一次，投屏全班可见，你自己的页面上也会显示，每次课最多祭出一件。`, '2026-10-12'],
        ['突破恭喜', '有同学突破境界时，投屏最上方会显示一行恭喜。', '2026-10-12'],
      ] },
      { title: '弹幕与课堂', items: [
        ['老师点赞', `说得好的弹幕会盖上「师赞」朱印，你的页面上也会出现盖章动画；每赞加 ${like.points || 5} 修为（每次课最多算 ${like.perStudent || 2} 个），老师每堂课最多点赞 ${like.limit || 10} 次。`, '2026-10-12'],
        ['我发过的弹幕', '在面板底部查看自己发过的弹幕，可以删除（投屏上撤下，老师的记录里仍保留）。', '2026-10-12'],
        ['匿名弹幕', '老师打开“匿名”时，投屏只显示内容、不显示姓名，老师后台仍能看到是谁发的。', '2026-10-12'],
        ['猜词游戏', `老师抽两位同学上台，一人背对屏幕猜、一人用自己的话描述；每次课得分第一的一组两人各加 ${wordgame} 修为。`, '2026-10-12'],
        ['停止递交', '老师可以让某道题停止递交，停止后这道题不能再递交、也不计修为，请跟上课堂节奏及时递交。', '2026-10-12'],
        config.course === 'political-economy'
          ? ['匿名建议和提问箱', '每次课最后可以匿名提问或提建议：没想通的地方写下来，老师下一堂课统一解答；老师的讲授、案例的呈现、希望增加的互动方式也都可以说。', '2026-10-12']
          : ['匿名建议箱', '每次课最后可以匿名对这堂课提建议，老师的讲授、案例的呈现、希望增加的互动方式都可以说。', '2026-10-12'],
        ['手机端', '面板收成一个境界小图标，点一下展开。', '2026-10-12'],
      ] },
    ].filter((section) => !section.course || section.course === config.course);
  }
  const NEWS_DAYS = 20;
  const newsDay = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(ms));
  const newsMd = (d) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
  function newsRange(dates) {
    const list = dates.filter(Boolean).sort();
    if (!list.length) return '';
    const [a, b] = [list[0], list[list.length - 1]];
    if (a === b) return newsMd(a);
    return a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(5, 7))} 月 ${Number(a.slice(8, 10))}—${Number(b.slice(8, 10))} 日` : `${newsMd(a)}—${newsMd(b)}`;
  }
  // 2026-11-21 用户：“更新说明，不同日期的单独列出来，按照天为单位，比如11月21日：……11月20日：……按照最近日期更新放最上面。不要一段时间的更新都放一起。”
  // 按天分组：一天一组，最近的一天在最上面；同一天里按上面 news() 里写的先后。
  // 每组 { day: 'YYYY-MM-DD', title: '11 月 21 日'（不是今年的带年份）, items: [[小标题, 说明, 日期, 主题]] }；主题＝news() 里那一组的标题（如“修为境界”），没有就是空。
  // days＞0：只要最近 days 天的条目（今天往前数）
  function newsList(course, days) {
    const cutoff = days ? newsDay(Date.now() - days * 86400000) : '';
    const year = newsDay(Date.now()).slice(0, 4);
    const byDay = new Map();
    news(course).forEach((section) => {
      const topic = section.title === '最新' ? '' : section.title || '';
      section.items.forEach((item) => {
        if (!item[2] || (cutoff && item[2] < cutoff)) return;
        if (!byDay.has(item[2])) byDay.set(item[2], []);
        byDay.get(item[2]).push([item[0], item[1], item[2], topic]);
      });
    });
    return Array.from(byDay.keys()).sort().reverse()
      .map((day) => ({ day, title: `${day.slice(0, 4) === year ? '' : `${Number(day.slice(0, 4))} 年 `}${newsMd(day)}`, items: byDay.get(day), last: day }));
  }

  // 聊天室看板的发言列表（2026-11-07 用户：“课堂完整版正文中聊天室内容的显示要按照发布的时间顺序固定显示，然后要能够显示所有内容，可以通过上下滑动的方式”）：
  // rows 按发布先后传入；已有的行留在原处（只更新点赞数等，不因点赞变换位置），新的接在最下面；
  // 正看着最下面时跟着新消息滚动，往上翻看时不打扰。行内容变了才动 DOM，翻看时不会被刷新打断
  function syncFeed(box, rows, rowHtml) {
    const follow = box.scrollHeight - box.scrollTop - box.clientHeight < 28;
    const top = box.scrollTop;
    const old = new Map(Array.from(box.children).map((el) => [el.dataset.feedId, el]));
    let cursor = box.firstElementChild;
    rows.forEach((row) => {
      const id = String(row.id);
      const html = rowHtml(row);
      let el = old.get(id);
      if (!el) { el = document.createElement('li'); el.dataset.feedId = id; }
      old.delete(id);
      if (el.dataset.feedHtml !== html) { el.innerHTML = html; el.dataset.feedHtml = html; }
      if (el === cursor) cursor = cursor.nextElementSibling; else box.insertBefore(el, cursor);
    });
    old.forEach((el) => el.remove());
    box.scrollTop = follow ? box.scrollHeight : top;
  }
  const feedClockFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false });
  const feedClock = (at) => { const ms = Date.parse(at); return Number.isNaN(ms) ? '' : feedClockFormat.format(new Date(ms)); };

  // ---------- 投屏页的聊天室（2026-11-21；辩论赛 live-debate.js、分组讨论 live-discuss.js、经营沙盘 biz_sim.js 共用） ----------
  // 用户：“教师版聊天室的样子跟学生版的一样吧，也能显示加入的人。”
  //   样子照学生页的聊天室（live-student.js 的 .dbr-room）：上面一条有底色的标题栏，成员名单（头像、在线的小绿点、被点赞数和发言数），
  //   一条一条的消息气泡（头像、名字、时间、点赞数）。老师这里不发言、不点赞；每条发言后面有“×”，可以隐藏不合适的发言。
  //   聊天室够宽时（辩论赛两间并排）成员名单在左边竖着排，和学生页一样；窄的时候（分组讨论、经营沙盘四间并排）名单横着排在消息上面，
  //   和学生手机上一样。按聊天室自己的宽度切换（容器查询），不看窗口宽度。
  //   成员名单直接读 ck_debate_members（教师可读），在线状态读 ck_presence（2 分钟内报到过＝在线，和工作台的小绿灯一样），不用新的后台函数。
  const chatRoom = (() => {
    const ONLINE_MS = 2 * 60 * 1000;
    const h = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // 头像：名字第一个字，底色按名字算出（同一个名字颜色固定，和学生页一样）；online 不传＝不显示在线点
    const avatar = (nick, online) => {
      const hue = Array.from(String(nick || '')).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 360, 17);
      return `<i class="tcr-av" style="--h:${hue}" aria-hidden="true">${h(Array.from(String(nick || '?'))[0])}${online === undefined ? '' : `<s class="${online ? 'is-on' : ''}"></s>`}</i>`;
    };
    const CSS = `
    .tcr-rooms { display: grid; gap: 12px; padding: 12px; }
    .tcr-rooms.is-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tcr-rooms.is-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    @media (max-width: 1100px) { .tcr-rooms.is-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .tcr-rooms.is-2, .tcr-rooms.is-4 { grid-template-columns: minmax(0, 1fr); } }
    .tcr-room { container-type: inline-size; display: flex; flex-direction: column; min-width: 0; border-radius: 14px; border: 1.5px solid rgba(35,101,95,.4); background: #fbfdfc; color: #201c18; overflow: hidden; text-align: left; }
    .tcr-room.is-con, .tcr-room.is-r2 { border-color: rgba(164,73,45,.45); background: #fffbf8; }
    .tcr-room.is-r3 { border-color: rgba(61,90,153,.45); background: #f8faff; }
    .tcr-room.is-r4 { border-color: rgba(138,90,26,.45); background: #fffcf4; }
    .tcr-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 10px 16px; background: linear-gradient(180deg, #2b7169, #23655f); color: #fff; }
    .tcr-room.is-con .tcr-head, .tcr-room.is-r2 .tcr-head { background: linear-gradient(180deg, #b55536, #a4492d); }
    .tcr-room.is-r3 .tcr-head { background: linear-gradient(180deg, #4a68a8, #3d5a99); }
    .tcr-room.is-r4 .tcr-head { background: linear-gradient(180deg, #9b6a25, #8a5a1a); }
    .tcr-head > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; min-width: 0; }
    .tcr-head b { font-size: 18px; letter-spacing: .06em; }
    .tcr-head span { font-size: 14px; opacity: .94; }
    .tcr-head .tcr-tag { padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,.2); font-size: 13.5px; font-weight: 700; opacity: 1; overflow-wrap: anywhere; }
    .tcr-tag[hidden], .tcr-extra[hidden] { display: none; }
    .tcr-extra { padding: 8px 14px; border-bottom: 1px solid rgba(70,51,34,.08); background: #fffaf0; color: #3b3129; font-size: 14px; line-height: 1.6; }
    .tcr-body { display: flex; flex-direction: column; min-height: 0; }
    .tcr-people { flex: 0 0 auto; padding: 8px 10px; border-bottom: 1px solid rgba(70,51,34,.1); background: rgba(70,51,34,.03); }
    .tcr-people h5 { margin: 0 4px 6px; font-size: 13.5px; font-weight: 800; color: #6d6259; letter-spacing: .04em; }
    .tcr-people ul { margin: 0; padding: 0 0 2px; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; max-height: 124px; overflow-y: auto; overscroll-behavior: contain; }
    .tcr-people li { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 10px 3px 3px; border: 1px solid rgba(70,51,34,.1); border-radius: 999px; background: #fff; }
    .tcr-people li > span { display: grid; min-width: 0; }
    .tcr-people b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #201c18; }
    .tcr-people b small { margin-left: 4px; font-weight: 400; color: #6d6259; }
    .tcr-people span > small { display: none; color: #8a7f74; font-size: 12px; white-space: nowrap; }
    .tcr-people em, .tcr-who em { margin-right: 4px; padding: 0 6px; border-radius: 999px; background: #b8862b; color: #fff; font-style: normal; font-size: 11.5px; font-weight: 800; white-space: nowrap; }
    .tcr-people li.tcr-none { padding: 2px 4px; border: 0; background: none; color: #8a7f74; font-size: 13.5px; }
    .tcr-av { position: relative; flex: 0 0 auto; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: hsl(var(--h) 45% 46%); color: #fff; font-style: normal; font-weight: 800; font-size: 14px; line-height: 1; }
    .tcr-av s { position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fbfdfc; background: #c8c0b5; text-decoration: none; }
    .tcr-av s.is-on { background: #2fb36b; }
    .tcr-main { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    .tcr-list { flex: 1 1 auto; margin: 0; padding: 12px 14px; list-style: none; display: grid; align-content: start; gap: 12px; max-height: 420px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
    .tcr-list::-webkit-scrollbar, .tcr-people ul::-webkit-scrollbar, .tcr-people::-webkit-scrollbar { width: 8px; }
    .tcr-list::-webkit-scrollbar-thumb, .tcr-people ul::-webkit-scrollbar-thumb, .tcr-people::-webkit-scrollbar-thumb { border-radius: 8px; background: rgba(70,51,34,.28); }
    .tcr-list[hidden], .tcr-empty[hidden] { display: none; }
    .tcr-list > li { display: flex; align-items: flex-start; gap: 8px; min-width: 0; margin: 0; padding: 0; }
    .tcr-list > li .tcr-av { width: 32px; height: 32px; font-size: 15px; }
    .tcr-msg-body { display: grid; gap: 3px; min-width: 0; max-width: 100%; }
    .tcr-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; font-size: 12.5px; color: #8a7f74; }
    .tcr-who b { color: #4a4038; font-size: 13.5px; } .tcr-who b small { margin-left: 4px; font-weight: 400; color: #8a7f74; }
    .tcr-who time { font-variant-numeric: tabular-nums; }
    .tcr-who .tcr-hide { margin-left: auto; }
    /* 气泡里先是发言，点赞数在右下角；发言长、一行放不下时点赞数换到下一行靠右，发言占满整行（投屏页字大、聊天室窄，能多放几个字） */
    .tcr-bubble { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: flex-end; gap: 4px 8px; padding: 8px 10px 8px 12px; border-radius: 4px 14px 14px 14px; background: #fff; border: 1px solid rgba(70,51,34,.12); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .tcr-bubble p { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 16px; line-height: 1.6; color: #201c18; word-break: break-word; }
    .tcr-like { flex: 0 0 auto; padding: 3px 8px; border: 1px solid rgba(192,57,43,.3); border-radius: 999px; background: #fff; color: #c0392b; font-weight: 700; font-size: 12.5px; line-height: 1; white-space: nowrap; }
    .tcr-like.is-zero { border-color: rgba(70,51,34,.15); color: #b3a89b; }
    .tcr-hide { flex: 0 0 auto; align-self: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #b3a89b; font-size: 16px; line-height: 1; cursor: pointer; }
    .tcr-hide:hover, .tcr-hide:focus-visible { background: #f3e3dc; color: #a4492d; outline: 0; }
    .tcr-empty { margin: 0; padding: 18px 16px; color: #8a7f74; font-size: 14.5px; line-height: 1.7; }
    @container (min-width: 520px) {
      .tcr-body { display: grid; grid-template-columns: 176px minmax(0, 1fr); min-height: 300px; }
      .tcr-people { border-bottom: 0; border-right: 1px solid rgba(70,51,34,.1); padding: 10px 8px; max-height: 480px; overflow-y: auto; overscroll-behavior: contain; }
      .tcr-people h5 { margin: 0 6px 8px; }
      .tcr-people ul { display: grid; gap: 2px; max-height: none; overflow: visible; }
      .tcr-people li { padding: 6px; border: 0; border-radius: 9px; background: none; }
      .tcr-people li.is-key { background: rgba(184,134,43,.12); }
      .tcr-people span > small { display: block; }
      .tcr-people .tcr-av { width: 32px; height: 32px; font-size: 15px; }
      .tcr-list { max-height: 480px; }
    }
    @media print { .tcr-hide { display: none; } }
    `;
    let styled = false;
    function style() {
      if (styled || typeof document === 'undefined') return;
      styled = true;
      const el = document.createElement('style');
      el.textContent = CSS;
      document.head.appendChild(el);
    }
    // 一间聊天室的外壳：只建一次，之后用 paint 更新。tone：pro / con / r1—r4（标题栏和边框的颜色，同学生页）
    function shell(key, tone) {
      style();
      return `<section class="tcr-room is-${h(tone)}" data-tcr="${h(key)}"><header class="tcr-head"><div><b data-tcr-title></b><span data-tcr-meta></span></div><span class="tcr-tag" data-tcr-tag hidden></span></header>`
        + '<div class="tcr-extra" data-tcr-extra hidden></div>'
        + '<div class="tcr-body"><aside class="tcr-people"><h5 data-tcr-count>成员</h5><ul data-tcr-people></ul></aside>'
        + '<div class="tcr-main"><ul class="tcr-list" data-tcr-list aria-live="polite"></ul><p class="tcr-empty" data-tcr-none hidden></p></div></div></section>';
    }
    // 内容没变就不动页面（每隔几秒刷新一次，翻看名单、发言时不被打断）
    function put(room, selector, value, asHtml) {
      const el = room.querySelector(selector);
      if (!el) return null;
      const text = value == null ? '' : String(value);
      if (el.dataset.tcrPut !== text) { if (asHtml) el.innerHTML = text; else el.textContent = text; el.dataset.tcrPut = text; }
      return el;
    }
    // 画一间聊天室。view：
    //   title、meta：标题栏；tag：标题栏右边的小标签（如“代表：某某”），空＝不显示；extra：标题栏下面一条（HTML，各看板自己的内容），空＝不显示；
    //   people：[{ nick, real（要补在后面的姓名）, online, likes, posts, badge（如“发言人”“代表”） }]，还没读到名单时给 null；count：成员人数（名单没读到时显示）；
    //   posts：[{ id, nick, real, text, at, likes, badge }]，按发布先后；empty：还没有发言时的说明；hide：true＝每条发言后面有“×”（data-tcr-hide＝发言的 id）
    function paint(room, view) {
      if (!room) return;
      put(room, '[data-tcr-title]', view.title);
      put(room, '[data-tcr-meta]', view.meta);
      const tag = put(room, '[data-tcr-tag]', view.tag);
      if (tag) tag.hidden = !view.tag;
      const extra = put(room, '[data-tcr-extra]', view.extra, true);
      if (extra) extra.hidden = !view.extra;
      const people = Array.isArray(view.people) ? view.people : null;
      const online = people ? people.filter((p) => p.online).length : 0;
      put(room, '[data-tcr-count]', people ? `成员 ${people.length} · 在线 ${online}` : `成员 ${Number(view.count) || 0}`);
      put(room, '[data-tcr-people]', people
        ? people.map((p) => `<li class="${p.badge ? 'is-key' : ''}" title="${h(`${p.nick}：被点赞 ${p.likes} 次，发言 ${p.posts} 条，${p.online ? '在线' : '不在线'}`)}">${avatar(p.nick, Boolean(p.online))}`
          + `<span><b>${p.badge ? `<em>${h(p.badge)}</em>` : ''}${h(p.nick)}${p.real ? `<small>${h(p.real)}</small>` : ''}</b><small>♥ ${Number(p.likes) || 0} · ${Number(p.posts) || 0} 条</small></span></li>`).join('')
          || '<li class="tcr-none">还没有人进来</li>'
        : `<li class="tcr-none">${Number(view.count) ? '正在读取成员名单……（一直读不到时，请确认本机已登录教师工作台）' : '还没有人进来'}</li>`, true);
      const list = room.querySelector('[data-tcr-list]');
      const rows = Array.isArray(view.posts) ? view.posts : [];
      const none = put(room, '[data-tcr-none]', view.empty || '还没有发言');
      if (none) none.hidden = rows.length > 0;
      list.hidden = !rows.length;
      syncFeed(list, rows, (p) => `${avatar(p.nick)}<div class="tcr-msg-body"><div class="tcr-who"><b>${h(p.nick)}${p.real ? `<small>${h(p.real)}</small>` : ''}</b>${p.badge ? `<em>${h(p.badge)}</em>` : ''}<time>${h(feedClock(p.at))}</time>`
        + `${view.hide ? `<button type="button" class="tcr-hide" data-tcr-hide="${h(p.id)}" title="隐藏这条发言" aria-label="隐藏这条发言">×</button>` : ''}</div>`
        + `<div class="tcr-bubble"><p>${h(p.text)}</p><span class="tcr-like${Number(p.likes) ? '' : ' is-zero'}" title="被点赞 ${Number(p.likes) || 0} 次">♥ ${Number(p.likes) || 0}</span></div></div>`);
    }
    // 读成员名单和在线状态。classroom：课堂 id；caseNo：聊天室的房间号（辩论赛＝案例号，分组讨论＝案例号＋d，经营沙盘＝案例号＋b）。
    // 返回 [{ sid, name, nick, side, online }]，按进来的先后；读不到在线状态时都算不在线
    async function people(backend, classroom, caseNo) {
      const id = Number(classroom) || classroom;
      const members = await backend.fetchAll('debatemembers', { classroom: id, case_no: String(caseNo) });
      let seen = new Map();
      try {
        seen = new Map((await backend.fetchAll('presence', { classroom: id })).map((row) => [String(row.sid), Date.parse(String(row.last_seen || '').replace(/(\.\d{3})\d+/, '$1')) || 0]));
      } catch (error) { /* 在线状态读不到：名单照常显示，都不点绿灯 */ }
      return members.map((m) => ({ sid: m.sid, name: m.name, nick: m.nick, side: m.side, online: Date.now() - (seen.get(String(m.sid)) || 0) < ONLINE_MS }));
    }
    // 一组成员配上各自被点赞数、发言数（从这一组的发言里数），按点赞、发言从多到少排，再按进来的先后（同学生页的名单）
    function roster(members, posts) {
      const stat = new Map();
      (posts || []).forEach((p) => { const s = stat.get(p.nick) || { likes: 0, posts: 0 }; s.likes += Number(p.likes) || 0; s.posts += 1; stat.set(p.nick, s); });
      return (members || []).map((m, i) => ({ ...m, ...(stat.get(m.nick) || { likes: 0, posts: 0 }), order: i }))
        .sort((a, b) => b.likes - a.likes || b.posts - a.posts || a.order - b.order);
    }
    // 每块看板一个：隔 8 秒读一次名单（在线状态会变）；看板上的人数和手里的名单对不上时马上重读（有人刚进来）
    function tracker(backend) {
      let at = 0;
      let list = null;
      let key = '';
      let busy = false;
      let tried = -1;
      return {
        list: () => list,
        async refresh(classroom, caseNo, count) {
          const now = `${classroom}|${caseNo}`;
          if (now !== key) { key = now; list = null; at = 0; tried = -1; }
          const behind = count != null && (!list || count !== list.length) && count !== tried;
          if (busy || (!behind && Date.now() - at < 8000)) return list;
          busy = true;
          try { list = await people(backend, classroom, caseNo); }
          catch (error) { console.warn('[聊天室成员名单]', error); }
          finally { busy = false; at = Date.now(); tried = count == null ? -1 : count; }
          return list;
        },
      };
    }
    return { shell, paint, people, roster, tracker, avatar, style, ONLINE_MS };
  })();

  window.ClassLive = window.ClassLive || {};
  Object.assign(window.ClassLive, {
    syncFeed,
    feedClock,
    chatRoom,
    news,
    newsList,
    newsRange,
    NEWS_DAYS,
    attached: false,
    today,
    COLLECTIONS,
    REALMS,
    STAGES,
    stageTitle,
    stageBands,
    SECTS,
    SECT_MIN_REALM,
    GIFTS,
    COLORS,
    colorFor,
    LIKE,
    WORDGAME,
    PUZZLE,
    PK,
    TIMELINE,
    DEBATE,
    DEBATE_STAGE,
    BIZ,
    DISCUSS,
    POLL,
    FEEDBACK,
    EGG,
    feedbackBox: FEEDBACK_BOX,
    PRACTICE,
    LEAVE,
    office,
    realmOf,
    realmsFor,
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
    // 投屏页选当前课堂：一门课的几个班级可能同时有当前课堂，2026-10-28 起一个班也可以同时开放几个课堂。
    // 工作台“打开本章课堂完整版”的地址带 ?room=（开放中就用它）；否则优先老师在工作台选的班级（地址 ?class= 或本机记住的），
    // 再优先与本页章节（案例）相同的、最近发布的；都对不上时取最近发布的（页面会提示“不是本章”）
    pickRoom(rooms, course, unit) {
      const current = rooms.filter((row) => row.is_current).sort((a, b) => Number(b.id) - Number(a.id));
      if (!current.length) return null;
      const params = new URLSearchParams(location.search);
      const exact = params.get('room') && current.find((row) => String(row.id) === params.get('room'));
      if (exact) return exact;
      let wanted = params.get('class');
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
