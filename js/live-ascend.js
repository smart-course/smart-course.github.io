/* 境界突破画面（2026-11-11 用户：“学生突破元婴的话在课堂页面和学生自己的页面会有类似于祭出法宝的动画（可参照凡人修仙传的突破元婴的动画）和祝福语。
 *   只要在该台设备没出现过，无论是课堂页面还是学生页面，下次登陆的时候都会在各自的页面出现一次。”）
 *   第二版（11-11）：劫云漩涡、九霄天雷、金丹碎裂、法相睁眼、两个大字砸落。
 *   第三版（2026-11-28 用户：“突破元婴和化神的动画你能重新设计一下吗？你可以网上搜一下凡人修仙传中针对这个的描述或者动画来设计。”
 *     接着又说：“元婴和化神的字体，可以用灵田里面每日诗句的那个字体。图像尽量不要有坐相这类偏宗教化的内容”；
 *     看了初稿又说：“不要有惰躁惧骄这个，还是太宗教化了。人物你可以设计得更精细一些吗？比如用修仙小道友表情包中的小道友形象”）：
 *   按原作的设定重新编排——结婴是“丹破婴生”；化神是元婴能感知、调动天地元气，开始领悟法则（原作里在谷中闭关，借五色寒焰进阶）。
 *   不画打坐的人形、光环、莲花、八卦、法相这类偏宗教的形象，也不写心魔一类的字。人物就是“修仙小道友”表情包里的小道友
 *   （画法照 live-stickers.js：圆脸、发髻插金簪、青色袍子、金腰带；外面一圈白边，像表情包一样），从一团金光里显出来、睁眼、
 *   举起双手（同表情包“突破啦”）。大字、名牌的印章、标题、动词和祝福语用马善政毛笔楷书（和云间灵田的诗句同一种字体）；
 *   姓名不在字体里，用系统字体。画面全部原创（SVG／CSS 绘制），不取用任何作品的图片、文字或画面；约 11 秒，点画面或按 Esc 可提前关闭。
 *   元婴（level 3）“碎丹成婴”：洞府里聚灵阵亮起、灵气流进金丹 → 灵气翻涌、金丹发暗，定灵珠荡开清光把乱流抚平 → 金丹布满裂纹、碎开，
 *     碎片旋回凝成一团金光，显出小道友、睁眼、举起双手 → 洞顶天窗外灵气漩涡、灵气旋着灌下来 → 两个大字落下 → 名牌与祝福语。
 *   化神（level 4）“元婴化神”：谷中五色寒焰环绕、小道友升到焰圈中间，四面八方的天地元气旋着汇来 → 峭壁退开成星空，神识一圈圈荡开、
 *     星星依次亮起连成星网 → 浑仪一样的两道光环和极轴（法则）转起来，五色寒焰旋进身体，天上撕开一道空间裂缝透出光 →
 *     化神：一团金光里换上月白金边的袍子、长大一些、星星眼、举起双手，五色光点绕身 → 两个大字 → 名牌。
 *   手机竖着拿（学生页 fit='narrow' 且屏幕瘦高）：两侧多裁一些让画面大一些，大字和空间裂缝往里收，名牌挪到画面下方、字大一些。
 *
 *   window.ClassLiveAscend.play({ level, names, self, fit, layer, blessing }) → Promise（画面结束时完成）
 *     names＝突破的同学姓名（投屏页可以几位一起；匿名时传空数组，显示“本班同学”），self＝学生本人页面（名牌写“恭喜你”），
 *     fit＝'wide'（投屏：1280×720 等比放进屏幕）或 'narrow'（学生页：两侧可略裁，手机上更大）。几次调用会排队依次播放。
 *   window.ClassLiveAscend.blessing(level)：随机取一句祝福语。
 */
(function () {
  'use strict';
  if (window.ClassLiveAscend) return;
  // 毛笔楷书：马善政毛笔楷书（SIL OFL 1.1，和云间灵田的诗句同一种字体），只截取本文件里用到的字（tools/ascend_font.py 生成，协议 /fonts/OFL-MaShanZheng.txt）。
  //   改了这里的文字（祝福语、大字等）要重跑 python3 tools/ascend_font.py，它会顺便改下面的版本号
  const FONT_URL = '/fonts/ascend-brush.woff2?v=45de0e5bc4';
  const FAMILY = 'ClassLiveAscendBrush';
  const BRUSH = `'${FAMILY}', 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
  const LEVELS = {
    3: {
      realm: '元婴', title: '突破元婴', verb: '碎丹成婴', chars: ['元', '婴'],
      veil: 'radial-gradient(ellipse at 50% 58%, #241042 0%, #110824 48%, #05030c 100%)',
      core: ['#fffbe6', '#ffe08a', '#ffb43c', '#d9781a'],
      ring: ['rgba(255,214,120,.95)', 'rgba(190,150,255,.95)', 'rgba(255,240,200,.9)'],
      mote: ['#ffe9a8', '#d8b4ff', '#fff6d8'],
      glyph: 'linear-gradient(180deg, #fffbe8 0%, #ffe08a 30%, #c8901e 50%, #ffd36b 66%, #fff3c4 100%)', glyphGlow: 'rgba(170,120,255,.95)',
      ink: ['#4e0610', '#b3141e'],
      titleCss: 'background-image:linear-gradient(100deg,#ffe9a8,#fff8e6 30%,#d8b4ff 55%,#ffe08a 80%,#ffe9a8);',
      plateAt: 7.9,
      blessings: [
        '瓶颈已破，丹碎婴成。愿你守住这份初心，向化神再进一步！',
        '丹破婴生，神识初开。一路修来不容易，为你喝彩！',
        '金丹化婴，脱胎换骨。愿你以此为新起点，学而不倦，思而有得！',
        '定得住心，才结得成婴。愿你此后道途更宽，勤修不辍！',
      ],
    },
    4: {
      realm: '化神', title: '突破化神', verb: '元婴化神', chars: ['化', '神'],
      veil: 'radial-gradient(ellipse at 50% 40%, #1c1840 0%, #0b0a22 50%, #03030a 100%)',
      core: ['#ffffff', '#fff1b8', '#ffc86b', '#ff8fc4'],
      ring: ['rgba(255,211,107,.95)', 'rgba(255,143,196,.95)', 'rgba(127,216,255,.95)'],
      flames: ['#7fd6ff', '#f2fbff', '#b98cff', '#6fe3b3', '#ffd36b'],   // 五色寒焰：冰蓝、霜白、紫、青、金
      mote: ['#ffe9a8', '#ff9fd0', '#9fe3ff'],
      glyph: 'linear-gradient(180deg, #ffffff 0%, #fff0b8 24%, #e6a51e 48%, #ffd36b 66%, #fffbe8 100%)', glyphGlow: 'rgba(255,200,90,1)',
      ink: ['#5a0a0a', '#c8281e'],
      titleCss: 'background-image:linear-gradient(100deg,#ffd36b,#ff8fc4 25%,#b98cff 50%,#7fd8ff 75%,#ffd36b);',
      plateAt: 8.0,
      blessings: [
        '元婴化神，神照天地。你已站上本课修行之巅，愿你学以致用、行稳致远！',
        '感天地元气，悟一缕法则。为你的坚持与悟性喝彩！',
        '神识所及，星河在望。愿你把这份修为带到更远的地方！',
      ],
    },
  };
  const DURATION = 11000;   // 与 .cl-ascend 的 cl-as-life 一致
  // 震屏时刻 [轻重, 秒, 时长]
  const SHAKES = {
    3: [['s', 2.75, 0.3], ['s', 3.2, 0.3], ['s', 4.6, 0.5], ['l', 5.15, 0.7], ['m', 6.0, 0.4], ['m', 7.1, 0.32], ['m', 7.45, 0.32]],
    4: [['s', 2.45, 0.3], ['l', 5.65, 0.6], ['l', 7.0, 0.6], ['m', 7.35, 0.32], ['m', 7.7, 0.32]],
  };
  const shakeCss = (level) => SHAKES[level].map(([k, t, d]) => `cl-as-shk-${k} ${d}s linear ${t}s`).join(', ');
  const style = document.createElement('style');
  style.dataset.readable = 'skip';   // 场景按 1280×720 缩放，不参与学生页字号调整（live-readable.js）
  style.textContent = `
  @font-face { font-family: '${FAMILY}'; src: url('${FONT_URL}') format('woff2'); font-display: block; }
  .cl-ascend { position: fixed; inset: 0; z-index: 2147483100; overflow: hidden; cursor: pointer; animation: cl-as-life ${DURATION}ms ease forwards; }
  @keyframes cl-as-life { 0% { opacity: 0; } 4% { opacity: 1; } 94% { opacity: 1; } 100% { opacity: 0; } }
  .cl-ascend.is-closing { animation: cl-as-out .45s ease forwards; }
  @keyframes cl-as-out { to { opacity: 0; } }
  .cl-as-veil { position: absolute; inset: 0; }
  .cl-as-box { position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px; transform: translate(-50%, -50%) scale(var(--as-scale, 1)); }
  .cl-as-box * { box-sizing: content-box; }
  .cl-as-stage { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; }
  .cl-as-stage-3 { animation: ${shakeCss(3)}; } .cl-as-stage-4 { animation: ${shakeCss(4)}; }
  @keyframes cl-as-shk-s { 0%, 100% { transform: none; } 25% { transform: translate(-4px, 3px); } 50% { transform: translate(4px, -3px); } 75% { transform: translate(-2px, -2px); } }
  @keyframes cl-as-shk-m { 0%, 100% { transform: none; } 15% { transform: translate(-9px, 6px); } 35% { transform: translate(8px, -7px); } 55% { transform: translate(-6px, -4px); } 75% { transform: translate(4px, 5px); } }
  @keyframes cl-as-shk-l { 0%, 100% { transform: none; } 8% { transform: translate(-18px, 12px) rotate(-.5deg); } 18% { transform: translate(16px, -14px) rotate(.5deg); } 30% { transform: translate(-13px, -9px); }
    42% { transform: translate(11px, 12px) rotate(.3deg); } 56% { transform: translate(-8px, 6px); } 70% { transform: translate(6px, -5px); } 85% { transform: translate(-3px, 3px); } }
  .cl-as-abs { position: absolute; left: 0; top: 0; overflow: visible; }
  @keyframes cl-as-show { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cl-as-hide { to { opacity: 0; } }
  @keyframes cl-as-spin { to { transform: rotate(360deg); } }
  @keyframes cl-as-spin-r { to { transform: rotate(-360deg); } }
  @keyframes cl-as-pop { 0% { opacity: 0; transform: scale(.2); } 60% { opacity: 1; transform: scale(1.15); } 100% { opacity: 1; transform: none; } }
  @keyframes cl-as-flow { to { stroke-dashoffset: -200; } }
  /* 一段段流光（路径 pathLength=100，dasharray 一段亮的；同一路径另画一条淡的底线 .is-base） */
  @keyframes cl-as-stream { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
  /* 闪光（很大一块，手机竖屏画面外也不露边）、冲击环、火花、光点 */
  .cl-as-flash { position: absolute; inset: -1200px; opacity: 0; animation: cl-as-flash .55s ease-out forwards; }
  @keyframes cl-as-flash { 0% { opacity: 0; } 10% { opacity: var(--fo, .8); } 100% { opacity: 0; } }
  .cl-as-ring { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; border: 5px solid; opacity: 0; animation: cl-as-ring 1.5s ease-out forwards; }
  @keyframes cl-as-ring { 0% { opacity: .95; transform: scale(.3); } 100% { opacity: 0; transform: scale(8); } }
  .cl-as-spark { position: absolute; width: 3px; height: 14px; margin: -7px 0 0 -1.5px; border-radius: 2px; opacity: 0; animation: cl-as-spark .8s cubic-bezier(.1,.8,.3,1) forwards; }
  @keyframes cl-as-spark { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(1.4); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--d) * -1)) scaleY(.4); } }
  .cl-as-mote { position: absolute; border-radius: 50%; opacity: 0; animation: cl-as-mote var(--t, 3s) ease-in var(--w, 4s) infinite; }
  @keyframes cl-as-mote { 0% { opacity: 0; transform: translateY(0) scale(.6); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-320px) scale(1.1); } }
  .cl-as-crack path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cl-as-crack .4s ease-out forwards; }
  @keyframes cl-as-crack { to { stroke-dashoffset: 0; } }
  /* 小道友（两种画面共用）：一团金光里显出本色、手臂从垂着转到举起、换脸（闭眼→睁眼）、眼边一闪，身后一团柔光，轻轻浮动 */
  .cl-dy-light { position: absolute; inset: 0; animation: cl-dy-light .9s ease-out var(--t, 0s) both; }
  @keyframes cl-dy-light { from { filter: sepia(1) saturate(2.6) brightness(3); } to { filter: sepia(0) saturate(1) brightness(1); } }
  .cl-as-arm { transform-box: view-box; transform: rotate(var(--r)); animation: cl-as-arm .55s cubic-bezier(.3,1.5,.5,1) var(--up, 99s) forwards; }
  @keyframes cl-as-arm { to { transform: rotate(0deg); } }
  .cl-dy-fa { animation: cl-as-hide .1s linear var(--t, 0s) forwards; }
  .cl-dy-fb { opacity: 0; animation: cl-as-show .1s linear var(--t, 0s) forwards; }
  .cl-as-eyes { transform-box: fill-box; transform-origin: center; transform: scaleY(0); animation: cl-as-eye .4s ease-out var(--t, 0s) forwards; }
  @keyframes cl-as-eye { 0% { transform: scaleY(0); } 55% { transform: scaleY(1.3); } 100% { transform: scaleY(1); } }
  .cl-as-twk { transform-box: fill-box; transform-origin: center; opacity: 0; animation: cl-as-twk .9s ease-out var(--t, 0s) forwards; }
  @keyframes cl-as-twk { 0% { opacity: 0; transform: scale(.2) rotate(0deg); } 30% { opacity: 1; transform: scale(1.3) rotate(45deg); } 100% { opacity: 0; transform: scale(.5) rotate(90deg); } }
  .cl-as-aura { position: absolute; left: -92px; top: -65px; width: 370px; height: 360px; border-radius: 50%; animation: cl-as-aura 1.8s ease-in-out infinite alternate; }
  @keyframes cl-as-aura { to { transform: scale(1.1); opacity: .72; } }
  @keyframes cl-as-bob { to { transform: translateY(-7px); } }

  /* ============ 元婴：碎丹成婴 ============ */
  /* 洞府：嶙峋的山壁、垂下的钟乳石，正上方一个天窗；天窗里漏下一道淡淡的光（山壁画到画面外，宽屏、竖屏都不露边） */
  .cl-ys-cave { position: absolute; inset: 0; overflow: visible; }
  .cl-ys-shaft { position: absolute; inset: 0; opacity: 0; filter: blur(12px); animation: cl-as-show 1.4s ease-out .3s forwards; }
  /* 聚灵阵：地上一圈灵石依次亮起，阵纹连起来 */
  .cl-ys-stone { opacity: .25; animation: cl-ys-stone .5s ease-out forwards; }
  @keyframes cl-ys-stone { from { opacity: .25; } to { opacity: 1; } }
  .cl-ys-lines { opacity: 0; animation: cl-as-show 1s ease-out 1s forwards, cl-as-hide 1s ease-in 6.4s forwards; }
  /* 灵气：从灵石流向金丹 */
  .cl-ys-qi { opacity: 0; animation: cl-as-show .8s ease-out .9s forwards, cl-as-hide .8s ease-in 4.6s forwards; }
  .cl-ys-qi path { stroke-dasharray: 5 15; animation: cl-as-flow 1.6s linear infinite; }
  /* 丹田光轮：金丹外一圈刻度光轮和转着的灵力 */
  .cl-ys-orb { position: absolute; left: 530px; top: 290px; width: 220px; height: 220px; border-radius: 50%; mix-blend-mode: screen; opacity: 0;
    animation: cl-as-pop .7s ease-out 1.1s forwards, cl-as-hide .8s ease-in 6.4s forwards; }
  .cl-ys-orb > i { position: absolute; inset: 0; border-radius: 50%; }
  .cl-ys-orb > i:nth-child(1) { animation: cl-as-spin 7s linear infinite; }
  .cl-ys-orb > i:nth-child(2) { inset: 22px; animation: cl-as-spin-r 4.5s linear infinite; }
  /* 金丹：吸纳灵气、灵气翻涌时发暗、裂开、碎去 */
  .cl-ys-core { position: absolute; left: 612px; top: 372px; width: 56px; height: 56px; border-radius: 50%; overflow: hidden; opacity: 0;
    animation: cl-as-pop .6s ease-out 1.3s forwards, cl-ys-throb 1.1s ease-in-out 1.9s 2, cl-ys-dim 1.3s ease-in-out 2.6s, cl-ys-tremble .08s linear 4.6s 7, cl-ys-burst .4s ease-in 5.15s forwards; }
  .cl-ys-core > i { position: absolute; inset: 0; border-radius: 50%; animation: cl-as-spin 3.2s linear infinite; }
  @keyframes cl-ys-throb { 50% { transform: scale(1.16); filter: brightness(1.5); } }
  @keyframes cl-ys-dim { 40% { filter: brightness(.45) saturate(.6); transform: scale(.9); } 100% { filter: none; transform: none; } }
  @keyframes cl-ys-tremble { 0% { transform: translate(-1.5px, 1px) scale(1.1); filter: brightness(1.8); } 50% { transform: translate(1.5px, -1px) scale(1.14); filter: brightness(2.2); } 100% { transform: scale(1.12); filter: brightness(2); } }
  @keyframes cl-ys-burst { 0% { opacity: 1; transform: scale(1.2); } 55% { opacity: 1; transform: scale(2.3); filter: brightness(2.8); } 100% { opacity: 0; transform: scale(3.8); } }
  .cl-ys-crack { animation: cl-as-hide .2s ease-in 5.17s forwards; }
  /* 碎片：先迸开，再旋回来凝成元婴 */
  .cl-ys-shard { position: absolute; left: 640px; top: 400px; width: 12px; height: 26px; margin: -13px 0 0 -6px; clip-path: polygon(50% 0, 100% 40%, 50% 100%, 0 40%); opacity: 0;
    animation: cl-ys-shard 1.25s cubic-bezier(.3,.6,.4,1) 5.15s forwards; }
  @keyframes cl-ys-shard { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1.2); }
    38% { opacity: 1; transform: rotate(calc(var(--a) + 40deg)) translateY(calc(var(--d) * -1)) scale(.9); }
    100% { opacity: 0; transform: rotate(calc(var(--a) + 330deg)) translateY(-4px) scale(.25); } }
  /* 元婴：碎片聚拢处一团金光里显出小道友（闭眼、垂手），睁眼、举起双手，之后轻轻浮动 */
  .cl-ys-baby { position: absolute; left: 546px; top: 283px; width: 187px; height: 230px; opacity: 0; animation: cl-ys-born .8s cubic-bezier(.2,.9,.3,1.25) 5.95s forwards; }
  @keyframes cl-ys-born { 0% { opacity: 0; transform: scale(.15); } 45% { opacity: 1; } 100% { opacity: 1; transform: none; } }
  .cl-ys-baby > div { position: absolute; inset: 0; animation: cl-as-bob 2.4s ease-in-out 7s infinite alternate; }
  /* 灵气翻涌：几团暗紫的乱流从四面卷过来，四周暗下去，金丹发暗；定灵珠荡开清光把乱流抚平 */
  .cl-ys-veil { position: absolute; inset: -1200px; opacity: 0; animation: cl-ys-veil 2s ease-in-out 2.3s forwards; }
  @keyframes cl-ys-veil { 0% { opacity: 0; } 30% { opacity: .85; } 55% { opacity: .65; } 75% { opacity: .85; } 100% { opacity: 0; } }
  .cl-ys-wisp { position: absolute; width: 170px; height: 110px; margin: -55px 0 0 -85px; opacity: 0; animation: cl-ys-wisp 1.6s cubic-bezier(.3,.2,.3,1) var(--t) forwards, cl-ys-gone .45s ease-in 3.85s forwards; }
  .cl-ys-wisp > i { position: absolute; inset: 0; border-radius: 50%; filter: blur(9px); animation: cl-ys-churn 1.1s ease-in-out infinite alternate; }
  @keyframes cl-ys-wisp { 0% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.7); } 100% { opacity: 1; transform: translate(calc(var(--dx) * .28), calc(var(--dy) * .28)) scale(1); } }
  @keyframes cl-ys-churn { to { transform: rotate(14deg) scale(1.12, .9); } }
  @keyframes cl-ys-gone { to { opacity: 0; transform: translate(calc(var(--dx) * .5), calc(var(--dy) * .5)) scale(1.8); filter: blur(6px); } }
  .cl-ys-pearl { position: absolute; left: 627px; top: 255px; width: 26px; height: 26px; border-radius: 50%; opacity: 0;
    animation: cl-as-pop .5s ease-out 3.35s forwards, cl-ys-pearl-go .8s ease-in 4.4s forwards; }
  @keyframes cl-ys-pearl-go { to { opacity: 0; transform: translateY(132px) scale(.4); } }
  .cl-ys-calm { position: absolute; left: 640px; top: 268px; width: 90px; height: 90px; margin: -45px 0 0 -45px; border-radius: 50%; border: 3px solid; opacity: 0; animation: cl-ys-calm 1.2s ease-out forwards; }
  @keyframes cl-ys-calm { 0% { opacity: .95; transform: scale(.3); } 100% { opacity: 0; transform: scale(13); } }
  /* 天地异象：洞顶天窗外的灵气漩涡，灵气旋着灌下来，落到小道友身上 */
  .cl-ys-vortex { position: absolute; left: 360px; top: -256px; width: 560px; height: 560px; transform: scaleY(.38); }
  .cl-ys-vortex > div { position: absolute; inset: 0; border-radius: 50%; opacity: 0; animation: cl-ys-vx 1.3s ease-out 6s forwards; }
  .cl-ys-vortex > div > i { position: absolute; inset: 0; border-radius: 50%; animation: cl-as-spin 6s linear infinite; }
  @keyframes cl-ys-vx { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }
  .cl-ys-bloom { position: absolute; left: 430px; top: -130px; width: 420px; height: 270px; border-radius: 50%; opacity: 0; animation: cl-as-show .9s ease-out 6.05s forwards; }
  .cl-ys-pour { opacity: 0; animation: cl-as-show .5s ease-out 6.25s forwards, cl-ys-pour-dim 1.6s ease-in-out 8.2s forwards; }
  .cl-ys-pour path { stroke-dasharray: 20 80; animation: cl-as-stream 1.1s linear infinite; }
  .cl-ys-pour path.is-base { stroke-dasharray: none; animation: none; opacity: .3; }
  @keyframes cl-ys-pour-dim { to { opacity: .45; } }

  /* ============ 化神：元婴化神 ============ */
  /* 谷中：两侧峭壁、谷底薄雾；元气汇来时峭壁向两边退开 */
  .cl-hs-cliff { position: absolute; top: 0; height: 720px; overflow: visible; animation: cl-hs-cliff 1.3s ease-in-out 2.9s forwards; }
  @keyframes cl-hs-cliff { to { opacity: 0; transform: translateX(var(--x)); } }
  .cl-hs-mist { position: absolute; border-radius: 50%; filter: blur(24px); opacity: 0; animation: cl-as-show 1.2s ease-out .2s forwards, cl-hs-drift 6s ease-in-out infinite alternate; }
  @keyframes cl-hs-drift { to { transform: translateX(var(--mx, 60px)); } }
  /* 星空：先只看得到谷口一线暗星；神识一圈圈荡开时一颗颗亮起，连成星网 */
  .cl-hs-star { position: absolute; border-radius: 50%; background: #fff; opacity: 0;
    animation: cl-hs-star-dim .8s ease-out .2s forwards, cl-hs-star-lit .6s ease-out var(--t) forwards, cl-hs-twinkle var(--p, 2s) ease-in-out var(--t2) infinite alternate; }
  @keyframes cl-hs-star-dim { to { opacity: .22; } }
  @keyframes cl-hs-star-lit { 0% { opacity: .22; transform: scale(1); } 35% { opacity: 1; transform: scale(2.4); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes cl-hs-twinkle { to { opacity: .4; } }
  .cl-hs-web { animation: cl-hs-web-dim 1.5s ease-in-out 7s forwards; filter: drop-shadow(0 0 3px rgba(190,225,255,.8)); }
  .cl-hs-web path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cl-as-crack .6s ease-out var(--t) forwards; }
  @keyframes cl-hs-web-dim { to { opacity: .55; } }
  .cl-hs-ripple { position: absolute; left: 640px; top: 330px; width: 200px; height: 200px; margin: -100px 0 0 -100px; border-radius: 50%; border: 2px solid rgba(210,235,255,.85);
    box-shadow: 0 0 26px rgba(150,200,255,.6), inset 0 0 26px rgba(150,200,255,.45); opacity: 0; animation: cl-hs-ripple 1.3s linear var(--t) forwards; }
  @keyframes cl-hs-ripple { 0% { opacity: .95; transform: scale(.2); } 70% { opacity: .5; } 100% { opacity: 0; transform: scale(8); } }
  .cl-hs-nebula { position: absolute; left: 240px; top: -100px; width: 800px; height: 800px; border-radius: 50%; filter: blur(34px); opacity: 0; transform: scaleY(.55);
    animation: cl-hs-neb 1.6s ease-out 3s forwards; }
  .cl-hs-nebula > i { position: absolute; inset: 0; border-radius: 50%; animation: cl-as-spin 30s linear infinite; }
  @keyframes cl-hs-neb { to { opacity: .7; } }
  /* 五色寒焰：每朵一套关键帧（画面里的 <style>，见 flameFrames）：绕着小道友转，转到前面的大、挡在身前，最后越转越快、旋进身体 */
  .cl-hs-flame { position: absolute; left: 640px; top: 400px; width: 36px; height: 58px; margin: -50px 0 0 -18px; opacity: 0; }
  .cl-hs-flame svg { display: block; width: 100%; height: 100%; overflow: visible; animation: cl-hs-flicker .35s ease-in-out infinite alternate; transform-origin: 50% 90%; }
  @keyframes cl-hs-flicker { to { transform: scale(.92, 1.08) skewX(3deg); } }
  /* 小道友：从谷底升到焰圈中间悬着；化神时一团金光里换上月白袍子、长大一些、举起双手 */
  .cl-hs-baby { position: absolute; left: 546px; top: 215px; width: 187px; height: 230px; opacity: 0; z-index: 6;
    animation: cl-hs-rise 1.3s cubic-bezier(.2,.8,.3,1) 1.3s forwards; }
  @keyframes cl-hs-rise { from { opacity: 0; transform: translateY(260px) scale(.4); } 30% { opacity: 1; } to { opacity: 1; transform: none; } }
  .cl-hs-baby > div { position: absolute; inset: 0; animation: cl-as-bob 2.2s ease-in-out 2.6s infinite alternate; }
  .cl-hs-grow { position: absolute; inset: 0; animation: cl-hs-grow .7s cubic-bezier(.2,1.4,.4,1) 7s forwards; }
  @keyframes cl-hs-grow { to { transform: scale(1.2); } }
  .cl-hs-gold { position: absolute; inset: 0; animation: cl-as-hide .3s ease-in 7s forwards; }
  .cl-hs-spirit { position: absolute; inset: 0; opacity: 0; animation: cl-as-show .2s ease-out 7s forwards; }
  /* 天地元气：四面八方的光流朝同一个方向旋着汇向小道友（一段段流光沿淡淡的底线走），光点被吸过来 */
  .cl-hs-qi { opacity: 0; animation: cl-as-show 1s ease-out 2.4s forwards, cl-as-hide .6s ease-in 6.6s forwards; }
  .cl-hs-qi path { stroke-dasharray: 16 84; animation: cl-as-stream 1.4s linear infinite; }
  .cl-hs-qi path.is-base { stroke-dasharray: none; animation: none; opacity: .16; }
  .cl-hs-dot { position: absolute; left: 640px; top: 330px; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; border-radius: 50%; opacity: 0;
    animation: cl-hs-suck var(--p, 1.6s) cubic-bezier(.5,0,.9,.6) var(--t) 3; }
  @keyframes cl-hs-suck { 0% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.4); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(0, 0) scale(.4); } }
  /* 法则：浑仪一样的两道带刻度的光环（地平环、斜着的黄道环）和一根极轴，光环各自转动，化神时向外散开 */
  .cl-hs-armil { position: absolute; left: 640px; top: 330px; width: 0; height: 0; z-index: 5; opacity: 0;
    animation: cl-as-show .6s ease-out 4.2s forwards, cl-hs-armil-out .8s ease-in 6.6s forwards; }
  @keyframes cl-hs-armil-out { to { opacity: 0; transform: scale(1.8); } }
  .cl-hs-armil > b { position: absolute; left: 0; top: 0; perspective: 1400px; opacity: 0; animation: cl-as-show .7s ease-out var(--t) forwards; }
  .cl-hs-armil > b > i { position: absolute; left: calc(var(--rr) * -1); top: calc(var(--rr) * -1); width: calc(var(--rr) * 2); height: calc(var(--rr) * 2); border-radius: 50%;
    transform: rotateZ(var(--z)) rotateX(var(--x)); animation: cl-hs-gyro var(--p) linear infinite; }
  .cl-hs-armil > b > i > u { position: absolute; inset: -7px; border-radius: 50%; }
  .cl-hs-armil > b > i.is-axis { left: -1px; top: -250px; width: 2px; height: 500px; border-radius: 1px; transform: rotate(-24deg); animation: none; }
  @keyframes cl-hs-gyro { from { transform: rotateZ(var(--z)) rotateX(var(--x)) rotate(0deg); } to { transform: rotateZ(var(--z)) rotateX(var(--x)) rotate(var(--dir, 360deg)); } }
  /* 空间裂缝：右上方天幕先亮起一道线，再撕开一道中间宽、两头尖、边缘参差的口子，透出光；四周的碎屑被吸进去 */
  .cl-hs-riftbox { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 3; }
  .cl-hs-rift { position: absolute; left: 990px; top: 126px; width: 0; height: 0; transform: rotate(-22deg); }
  .cl-hs-rift-line { position: absolute; left: -230px; top: -2px; width: 460px; height: 4px; border-radius: 2px; background: #fff; box-shadow: 0 0 10px #fff, 0 0 26px #ffe08a; opacity: 0;
    transform: scaleX(0); animation: cl-hs-rift-line .3s ease-out 5.6s forwards, cl-as-hide .4s ease-in 6.3s forwards; }
  @keyframes cl-hs-rift-line { 0% { opacity: 1; transform: scaleX(0); } 100% { opacity: 1; transform: none; } }
  .cl-hs-rift-open { position: absolute; left: -260px; top: -110px; width: 520px; height: 220px; opacity: 0; transform: scaleY(.02);
    animation: cl-hs-rift-open .6s cubic-bezier(.2,.9,.3,1.15) 5.85s forwards, cl-hs-breath 1.8s ease-in-out 6.9s infinite alternate; }
  @keyframes cl-hs-rift-open { 0% { opacity: 1; transform: scaleY(.02); } 100% { opacity: 1; transform: none; } }
  @keyframes cl-hs-breath { to { transform: scaleY(1.08); filter: brightness(1.15); } }
  .cl-hs-rift-open svg { display: block; overflow: visible; }
  .cl-hs-cracks { opacity: 0; animation: cl-as-show .5s ease-out 6.2s forwards; }
  .cl-hs-chip { position: absolute; width: 7px; height: 12px; clip-path: polygon(50% 0, 100% 45%, 40% 100%, 0 40%); opacity: 0; animation: cl-hs-chip 1.1s cubic-bezier(.5,0,.9,.5) var(--t) forwards; }
  @keyframes cl-hs-chip { 0% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(0deg); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(0, 0) rotate(480deg) scale(.3); } }
  /* 化神后：五色光点绕身（关键帧也在画面里的 <style>） */
  .cl-hs-orb { position: absolute; left: 640px; top: 410px; width: 0; height: 0; }
  .cl-hs-orb > i { position: absolute; left: -8px; top: -8px; width: 16px; height: 16px; border-radius: 50%; opacity: 0; animation: cl-as-pop .5s ease-out var(--t) forwards; }

  /* 两个大字落下（墨圈溅开） */
  .cl-as-glyph { position: absolute; top: 150px; width: 320px; height: 320px; margin-left: -160px; display: grid; place-items: center; }
  .cl-as-glyph.is-l { left: 312px; } .cl-as-glyph.is-r { left: 968px; }
  .cl-as-ink { position: absolute; inset: 0; overflow: visible; transform: scale(0); opacity: 0; animation: cl-as-ink .45s cubic-bezier(.2,1.3,.4,1) forwards; }
  @keyframes cl-as-ink { 0% { opacity: 0; transform: scale(1.35) rotate(-30deg); } 25% { opacity: 1; } 100% { opacity: 1; transform: none; } }
  .cl-as-enso { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cl-as-crack .42s cubic-bezier(.3,.8,.4,1) forwards; }
  .cl-as-glyph b { position: relative; display: block; font: 400 236px/1 ${BRUSH}; color: transparent;
    background-image: var(--gl); background-size: 100% 220%; -webkit-background-clip: text; background-clip: text; -webkit-text-stroke: 2px rgba(70,36,0,.55);
    filter: drop-shadow(0 0 14px var(--gg)) drop-shadow(0 7px 0 rgba(0,0,0,.55)); opacity: 0;
    animation: cl-as-slam .5s cubic-bezier(.3,1.5,.5,1) forwards, cl-as-glyph-flow 3s linear infinite; }
  @keyframes cl-as-slam { 0% { opacity: 0; transform: scale(3.4) rotate(-8deg); } 50% { opacity: 1; transform: scale(.88) rotate(1deg); } 100% { opacity: 1; transform: none; } }
  @keyframes cl-as-glyph-flow { to { background-position: 0 220%; } }
  /* 名牌与祝福语 */
  .cl-as-plate { position: absolute; left: 50%; bottom: 22px; display: flex; align-items: center; gap: 22px; width: max-content; max-width: 1060px; padding: 14px 42px 14px 18px; border: 1px solid #d8b25a; border-radius: 6px;
    background: linear-gradient(180deg, rgba(32,18,8,.95), rgba(10,6,4,.97)); box-shadow: inset 0 0 0 4px rgba(10,6,4,.96), inset 0 0 0 5px rgba(216,178,90,.6), 0 0 44px rgba(255,200,100,.25), 0 14px 50px rgba(0,0,0,.6);
    transform: translateX(-50%); opacity: 0; animation: cl-as-plate .7s cubic-bezier(.2,.9,.3,1.2) var(--pd, 7.9s) forwards; }
  .cl-as-plate::before, .cl-as-plate::after { content: ''; position: absolute; top: 50%; width: 12px; height: 12px; margin-top: -6px; background: #d8b25a; transform: rotate(45deg); box-shadow: 0 0 10px rgba(255,210,120,.8); }
  .cl-as-plate::before { left: -7px; } .cl-as-plate::after { right: -7px; }
  @keyframes cl-as-plate { from { opacity: 0; transform: translate(-50%, 36px) scale(.96); } to { opacity: 1; transform: translate(-50%, 0); } }
  .cl-as-seal { flex: 0 0 auto; display: grid; place-items: center; width: 70px; height: 70px; border: 3px solid #c8281e; border-radius: 8px; background: #fff4e0; color: #c8281e;
    font: 400 30px/1.02 ${BRUSH}; text-align: center; box-shadow: inset 0 0 0 3px #fff4e0, inset 0 0 0 4.5px #c8281e, 0 0 16px rgba(200,40,30,.5); transform: rotate(-4deg); }
  .cl-as-lines { display: flex; flex-direction: column; gap: 3px; min-width: 0; text-align: left; }
  .cl-as-who { color: #f1e2c4; font: 700 22px/1.4 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; letter-spacing: .04em; overflow-wrap: anywhere; }
  .cl-as-verb { margin-left: .7em; color: #ffe9a8; font: 400 27px/1.2 ${BRUSH}; letter-spacing: .08em; white-space: nowrap; }
  .cl-as-title { font: 400 56px/1.12 ${BRUSH}; letter-spacing: .12em; color: transparent; -webkit-background-clip: text; background-clip: text;
    background-size: 220% 100%; animation: cl-as-title 4s linear infinite; }
  @keyframes cl-as-title { to { background-position: 220% 0; } }
  .cl-as-bless { color: #f3e3c0; font: 400 27px/1.45 ${BRUSH}; letter-spacing: .05em; }
  .cl-as-tip { position: absolute; right: 18px; top: 14px; padding: 4px 12px; border: 1px solid rgba(255,255,255,.35); border-radius: 999px; color: rgba(255,255,255,.75);
    background: rgba(0,0,0,.25); font: 600 13px/1.4 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  /* 手机竖着拿：画面两侧多裁一些（看得到中间约 760px），大字和空间裂缝往里收，名牌挪到画面下方、字大一些 */
  .cl-ascend.is-tall .cl-as-glyph.is-l { left: 400px; } .cl-ascend.is-tall .cl-as-glyph.is-r { left: 880px; }
  .cl-ascend.is-tall .cl-hs-riftbox { transform: translateX(-110px); }
  .cl-ascend.is-tall .cl-as-plate { bottom: var(--plate-bottom, 22px); max-width: 630px; }
  .cl-ascend.is-tall .cl-as-who { font-size: 27px; } .cl-ascend.is-tall .cl-as-verb { font-size: 31px; }
  .cl-ascend.is-tall .cl-as-title { font-size: 62px; } .cl-ascend.is-tall .cl-as-bless { font-size: 31px; }
  @media (prefers-reduced-motion: reduce) {
    .cl-ascend *, .cl-ascend *::before, .cl-ascend *::after { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  }`;
  document.head.appendChild(style);

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  // 固定种子的随机数：同一种画面每次都一样（不同境界不同）
  function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  const ptsText = (pts) => pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  function sparks(rand, x, y, n, delay, colors, spread = 180) {
    return Array.from({ length: n }, () => {
      const a = -spread / 2 + rand() * spread;
      const c = colors[Math.floor(rand() * colors.length)];
      return `<span class="cl-as-spark" style="left:${f1(x)}px;top:${f1(y)}px;--a:${f1(a)}deg;--d:${f1(40 + rand() * 110)}px;background:${c};box-shadow:0 0 8px ${c};animation-delay:${f1(delay + rand() * 0.08)}s"></span>`;
    }).join('');
  }
  const flash = (t, o, x, y, c1, c2) => `<div class="cl-as-flash" style="--fo:${o};animation-delay:${t}s;background:radial-gradient(circle 1000px at ${x + 1200}px ${y + 1200}px, #fff 0, ${c1} 14%, ${c2} 32%, transparent 62%)"></div>`;
  const ring = (t, x, y, c) => `<span class="cl-as-ring" style="left:${x}px;top:${y}px;border-color:${c};box-shadow:0 0 30px ${c}, inset 0 0 20px ${c};animation-delay:${f1(t)}s"></span>`;
  // 书法圆环（一笔圆）：粗笔一圈、留一个缺口，外加两道飞白细笔，落字时一笔画出
  function inkSvg(rand, L, id, delay) {
    const arc = (r, a0, a1, cx = 160, cy = 160) => {
      const p = (a) => `${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)}`;
      return `M${p(a0)}A${r} ${r} 0 1 1 ${p(a1)}`;
    };
    const a0 = -Math.PI / 2 - 0.35 + rand() * 0.2;
    const dl = `style="animation-delay:${f1(delay)}s"`;
    return `<svg class="cl-as-ink" ${dl} viewBox="0 0 320 320" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".45"></stop><stop offset=".7" stop-color="#000" stop-opacity=".15"></stop><stop offset="1" stop-color="#000" stop-opacity="0"></stop></radialGradient></defs>
      <circle cx="160" cy="160" r="128" fill="url(#${id})"></circle>
      <g fill="none" stroke-linecap="round">
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(132, a0, a0 - 0.55)}" stroke="${L.ink[1]}" stroke-width="30" opacity=".92"></path>
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(134, a0 + 0.15, a0 - 1.5, 168, 152)}" stroke="${L.ink[1]}" stroke-width="16" opacity=".85"></path>
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(114, a0 + 0.3, a0 - 0.9)}" stroke="${L.ink[0]}" stroke-width="6" opacity=".75"></path>
        <path class="cl-as-enso" ${dl} pathLength="1" d="${arc(147, a0 + 0.6, a0 - 1.6)}" stroke="${L.ink[1]}" stroke-width="3" opacity=".6"></path></g></svg>`;
  }
  function glyphs(rand, L, level, times) {
    return L.chars.map((ch, i) => `<div class="cl-as-glyph is-${i ? 'r' : 'l'}" style="--gl:${L.glyph};--gg:${L.glyphGlow}">
        ${inkSvg(rand, L, `cl-as-ink-${level}-${i}`, times[i] + 0.04)}
        <b style="animation-delay:${times[i]}s, ${f1(times[i] + 0.6)}s">${esc(ch)}</b></div>`).join('');
  }
  function motes(rand, colors, n, from) {
    return Array.from({ length: n }, () => {
      const size = 3 + rand() * 6;
      const c = colors[Math.floor(rand() * colors.length)];
      return `<span class="cl-as-mote" style="left:${f1(140 + rand() * 1000)}px;top:${f1(420 + rand() * 280)}px;width:${f1(size)}px;height:${f1(size)}px;background:${c};box-shadow:0 0 ${f1(size * 2.5)}px ${c};--t:${f1(2.4 + rand() * 2)}s;--w:${f1(from + rand() * 2)}s"></span>`;
    }).join('');
  }

  // ============ 小道友（“修仙小道友”表情包里的形象）============
  // 画法照 live-stickers.js 的 head／body／arm（128×128 的格子），颜色可换；另加了发丝高光、衣摆云水纹、腰带穗子；
  //   外面一圈白边（像表情包）和金色柔光，在深色画面上也看得清
  const DY = { skin: '#ffe3c9', line: '#3a2a22', hair: '#2f2622', sheen: '#7d6c63', robe: '#2f8177', deep: '#1f5d56', trim: '#f7efdc', sash: '#e2ac40',
    blush: '#f7a195', gold: '#f4c64e', jade: '#7fd3c1', mouth: '#a8322a', rim: '#fff8e6' };
  const DY_SPIRIT = Object.assign({}, DY, { robe: '#f3f6ff', deep: '#aebce8', trim: '#ffd76a', sash: '#f4c64e', jade: '#9fe3ff', rim: '#ffffff' });   // 化神：月白袍子、金边
  const SW = (P, w, color) => `stroke="${color || P.line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  function dyEye(P, kind, x, y) {
    if (kind === 'closed') return `<path d="M${f1(x - 4.8)} ${f1(y - 0.8)} Q${x} ${f1(y + 4.4)} ${f1(x + 4.8)} ${f1(y - 0.8)}" fill="none" ${SW(P, 2.7)}/>`;
    if (kind === 'star') {
      const p = [[0, -6.6], [2, -2], [6.6, 0], [2, 2], [0, 6.6], [-2, 2], [-6.6, 0], [-2, -2]].map(([dx, dy]) => `${f1(x + dx)} ${f1(y + dy)}`).join(' L');
      return `<path d="M${p}Z" fill="${P.gold}" ${SW(P, 1.5)}/>`;
    }
    return `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="4.6" fill="${P.line}"/><circle cx="${f1(x - 1.2)}" cy="${f1(y - 1.8)}" r="1.4" fill="#fff"/>`;
  }
  const DY_MOUTH = {
    open: (P) => `<path d="M58.2 59.4 Q64 70 69.8 59.4Z" fill="${P.mouth}" ${SW(P, 2.1)}/><ellipse cx="64" cy="64.6" rx="2.6" ry="1.7" fill="#f08a80"/>`,
    smile: (P) => `<path d="M59.4 60.2 Q64 65 68.6 60.2" fill="none" ${SW(P, 2.4)}/>`,
  };
  // 脸：eyes 眼（'closed' 闭眼／'star' 星星眼／其他＝圆眼），mouth 嘴，up＝扬眉；openAt＝几秒睁眼（眼睛从一条缝张开）
  function dyFace(P, eyes, mouth, up, openAt) {
    const pair = dyEye(P, eyes, 54, 52) + dyEye(P, eyes, 74, 52);
    return (up ? `<path d="M49 42.4 Q54 39.8 59 42.4 M69 42.4 Q74 39.8 79 42.4" fill="none" ${SW(P, 2.1)}/>` : '')
      + (openAt == null ? `<g>${pair}</g>` : `<g class="cl-as-eyes" style="--t:${openAt}s">${pair}</g>`) + DY_MOUTH[mouth](P);
  }
  function dyHead(P) {
    return `<path d="M37.4 50 C35.6 22.6 92.4 22.6 90.6 50 C92.2 60 89.6 66 87.6 68.6 L40.4 68.6 C38.4 66 35.8 60 37.4 50Z" fill="${P.hair}" ${SW(P, 2)}/>`
      + `<circle cx="37" cy="52.4" r="4.3" fill="${P.skin}" ${SW(P, 2)}/><circle cx="91" cy="52.4" r="4.3" fill="${P.skin}" ${SW(P, 2)}/>`
      + `<circle cx="64" cy="50" r="27" fill="${P.skin}" ${SW(P, 2.6)}/>`
      + `<ellipse cx="46" cy="58.4" rx="5" ry="3.1" fill="${P.blush}" opacity=".62"/><ellipse cx="82" cy="58.4" rx="5" ry="3.1" fill="${P.blush}" opacity=".62"/>`
      + `<path d="M38 48 C37 25.6 91 25.6 90 48 C85 39.6 76.6 36.2 70.4 37.6 C67 40.6 61 40.6 57.6 37.6 C51.4 36.2 43 39.6 38 48Z" fill="${P.hair}" ${SW(P, 1.6)}/>`
      + `<path d="M45.6 34.6 Q53 29.6 61 30.2" fill="none" stroke="${P.sheen}" stroke-width="2" stroke-linecap="round"/>`
      + `<circle cx="64" cy="17.6" r="9.2" fill="${P.hair}" ${SW(P, 2)}/><path d="M59.4 13.4 Q62.4 10.8 66.2 11.4" fill="none" stroke="${P.sheen}" stroke-width="1.6" stroke-linecap="round"/>`
      + `<path d="M49.6 20.4 L78.4 15.4" fill="none" stroke="${P.line}" stroke-width="5" stroke-linecap="round"/><path d="M49.6 20.4 L78.4 15.4" fill="none" stroke="${P.gold}" stroke-width="2.8" stroke-linecap="round"/>`
      + `<circle cx="80" cy="15.1" r="2.9" fill="${P.jade}" ${SW(P, 1.2)}/>`;
  }
  function dyBody(P) {
    return `<ellipse cx="54.4" cy="111.6" rx="7.2" ry="3.7" fill="${P.line}"/><ellipse cx="73.6" cy="111.6" rx="7.2" ry="3.7" fill="${P.line}"/>`
      + `<path d="M49 73.4 C44 76.6 41 84.6 39.6 103.6 C39.2 107.8 42 109.8 46 109.8 L82 109.8 C86 109.8 88.8 107.8 88.4 103.6 C87 84.6 84 76.6 79 73.4 C74 77.6 54 77.6 49 73.4Z" fill="${P.robe}" ${SW(P, 2.6)}/>`
      + `<path d="M42.8 104 q4.3 -3 8.6 0 t8.6 0 t8.6 0 t8.6 0 t8.6 0" fill="none" ${SW(P, 1.5, P.deep)}/>`
      + `<path d="M64 88.6 L61.6 103" fill="none" ${SW(P, 1.6, P.deep)}/>`
      + `<path d="M52.4 74.6 L64 87.6 L75.6 74.6" fill="none" ${SW(P, 4.6, P.trim)}/><path d="M41.6 92.6 H86.4 V98.4 H41.6Z" fill="${P.sash}" ${SW(P, 1.6)}/>`
      + `<path d="M74.4 98.4 l-1.4 7.6 M78.2 98.4 l1.6 7" fill="none" ${SW(P, 2, P.sash)}/><circle cx="72.8" cy="107" r="1.7" fill="${P.jade}" ${SW(P, 0.8)}/><circle cx="80" cy="106.2" r="1.7" fill="${P.jade}" ${SW(P, 0.8)}/>`;
  }
  // 手臂：从肩 (x1,y1) 到手 (x2,y2)，bend＝弯多少（袖子、袖口、拳头）
  function dyArm(P, x1, y1, x2, y2, bend) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const cx = (x1 + x2) / 2 - ((y2 - y1) / len) * bend;
    const cy = (y1 + y2) / 2 + ((x2 - x1) / len) * bend;
    const d = `M${x1} ${y1} Q${f1(cx)} ${f1(cy)} ${x2} ${y2}`;
    const dl = Math.hypot(x2 - cx, y2 - cy) || 1;
    const ux = (x2 - cx) / dl;
    const uy = (y2 - cy) / dl;
    return `<path d="${d}" fill="none" stroke="${P.line}" stroke-width="13.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${P.robe}" stroke-width="8.4" stroke-linecap="round"/>`
      + `<circle cx="${f1(x2 - ux * 2.6)}" cy="${f1(y2 - uy * 2.6)}" r="6.3" fill="${P.trim}" ${SW(P, 1.8)}/>`
      + `<circle cx="${f1(x2 + ux * 2.4)}" cy="${f1(y2 + uy * 2.4)}" r="5.2" fill="${P.skin}" ${SW(P, 2.1)}/>`;
  }
  // 整个小道友（宽 187、高 230）。o.faceA＝[眼, 嘴, 扬眉]；o.faceB＋o.at＝几秒换成这张脸（o.openAt＝换脸时睁眼）；
  //   o.armsAt＝几秒举起双手（null＝一直垂着）；o.twinkleAt＝眼边一闪；o.glow＝两层柔光的颜色
  function dollSvg(P, o) {
    const arms = o.armsAt == null
      ? dyArm(P, 46.4, 80, 37.6, 98, -3) + dyArm(P, 81.6, 80, 90.4, 98, 3)
      : `<g class="cl-as-arm" style="transform-origin:46.4px 80px;--r:-114deg;--up:${o.armsAt}s">${dyArm(P, 46.4, 80, 30, 60, 5)}</g>`
        + `<g class="cl-as-arm" style="transform-origin:81.6px 80px;--r:114deg;--up:${o.armsAt}s">${dyArm(P, 81.6, 80, 98, 60, -5)}</g>`;
    const faces = o.faceB
      ? `<g class="cl-dy-fa" style="--t:${o.at}s">${dyFace(P, ...o.faceA)}</g><g class="cl-dy-fb" style="--t:${o.at}s">${dyFace(P, ...o.faceB, o.openAt)}</g>`
      : dyFace(P, ...o.faceA);
    const twinkle = o.twinkleAt == null ? '' : `<path class="cl-as-twk" style="--t:${o.twinkleAt}s" d="M99 26L101.4 33.6L109 36L101.4 38.4L99 46L96.6 38.4L89 36L96.6 33.6Z" fill="#fff"/>`;
    const r = P.rim;
    return `<svg width="187" height="230" viewBox="16 2 96 118" style="position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(2.4px 0 0 ${r}) drop-shadow(-2.4px 0 0 ${r}) drop-shadow(0 2.4px 0 ${r}) drop-shadow(0 -2.4px 0 ${r}) drop-shadow(0 0 6px ${o.glow[0]}) drop-shadow(0 0 18px ${o.glow[1]})" aria-hidden="true">
      ${dyBody(P)}${arms}${dyHead(P)}${faces}${twinkle}</svg>`;
  }
  const aura = (a, b) => `<span class="cl-as-aura" style="background:radial-gradient(ellipse, ${a} 0, ${b} 40%, transparent 70%)"></span>`;
  // 绕圈的关键帧：椭圆轨道，转到前面（下半圈）的大、z-index 高，转到后面的小、z-index 低
  function orbitFrames(name, rx, ry, steps = 24) {
    const rows = [];
    for (let k = 0; k <= steps; k += 1) {
      const a = (k / steps) * Math.PI * 2;
      const s = Math.sin(a);
      rows.push(`${f1((k / steps) * 100)}%{transform:translate(${f1(Math.cos(a) * rx)}px,${f1(s * ry)}px) scale(${(1 + s * 0.2).toFixed(2)});z-index:${s > 0 ? 7 : 4}}`);
    }
    return `@keyframes ${name}{${rows.join('')}}`;
  }
  // 五色寒焰的关键帧（0—6.6 秒）：依次点燃，绕小道友转（4.2 秒一圈），5.4 秒起越转越快、越转越近，6.6 秒收进身体
  function flameFrames(i, n) {
    const T = 6.6;
    const steps = 55;
    const ignite = 0.3 + i * 0.15;
    let angle = (i / n) * Math.PI * 2;
    const rows = [];
    for (let k = 0; k <= steps; k += 1) {
      const t = (k / steps) * T;
      const s = Math.max(0, Math.min(1, (t - 5.4) / 1.2));
      const R = 170 * (1 - s * s * (3 - 2 * s));
      const sin = Math.sin(angle);
      const scale = (1 + sin * 0.18) * (1 - 0.6 * s);
      const op = t < ignite ? 0 : Math.min(1, (t - ignite) / 0.3) * (s > 0.8 ? (1 - s) / 0.2 : 1);
      rows.push(`${f1((k / steps) * 100)}%{transform:translate(${f1(Math.cos(angle) * R)}px,${f1(sin * R * 0.25)}px) scale(${scale.toFixed(2)});z-index:${sin > 0 ? 7 : 4};opacity:${op.toFixed(2)}}`);
      angle += (T / steps) * ((Math.PI * 2) / 4.2) * (1 + 2.5 * s);
    }
    return `@keyframes cl-hs-fl-${i}{${rows.join('')}}`;
  }

  // ============ 元婴：碎丹成婴 ============
  function sceneYuanying(L) {
    const rand = seeded(3 * 131 + 17);
    const DAN = [640, 400];   // 金丹（元婴在这里成形）
    // 洞府：两侧山壁（内侧参差）、洞顶左右两块垂着钟乳石，中间是天窗；山壁一直画到画面外
    const wallL = [[330, -700], [322, 0], [316, 34], [300, 46], [296, 76], [270, 96], [264, 128], [240, 154], [244, 196], [214, 226], [222, 270], [190, 304], [198, 352], [168, 394], [178, 446], [148, 488], [160, 540], [130, 590], [142, 650], [114, 720], [100, 1400]];
    const wallR = [[950, -700], [958, 0], [966, 32], [984, 48], [988, 80], [1014, 100], [1018, 132], [1044, 160], [1040, 200], [1068, 230], [1060, 274], [1094, 308], [1086, 356], [1116, 398], [1106, 450], [1136, 492], [1124, 546], [1154, 594], [1142, 652], [1170, 720], [1184, 1400]];
    const ceilL = [[316, 30], [334, 38], [341, 92], [352, 40], [368, 44], [382, 50], [392, 128], [402, 54], [414, 48], [432, 44], [441, 98], [448, 46], [458, 34], [476, 26], [486, 0], [486, -700]];
    const ceilR = [[794, -700], [794, 0], [812, 32], [830, 40], [838, 88], [846, 44], [862, 46], [877, 50], [887, 120], [898, 52], [914, 44], [930, 40], [938, 96], [946, 38], [962, 30], [964, 0]];
    const rock = (pts, close, rim) => `<polygon points="${ptsText(pts.concat(close))}" fill="url(#cl-ys-rock)"></polygon><polyline points="${ptsText(rim)}" fill="none" stroke="#7a5ac8" stroke-opacity=".38" stroke-width="2.5" stroke-linejoin="round"></polyline>`;
    const skyStars = Array.from({ length: 16 }, () => `<circle cx="${f1(500 + rand() * 280)}" cy="${f1(4 + rand() * 46)}" r="${f1(0.8 + rand() * 1.3)}" fill="#e8e0ff" opacity="${f1(0.4 + rand() * 0.5)}"></circle>`).join('');
    const sky = `<svg class="cl-as-abs" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
      <defs><radialGradient id="cl-ys-sky" cx="50%" cy="0%" r="70%"><stop offset="0" stop-color="#3a3478"></stop><stop offset=".6" stop-color="#1c1640" stop-opacity=".7"></stop><stop offset="1" stop-color="#110824" stop-opacity="0"></stop></radialGradient></defs>
      <ellipse cx="640" cy="0" rx="230" ry="90" fill="url(#cl-ys-sky)"></ellipse>${skyStars}</svg>`;
    const cave = `<svg class="cl-ys-cave" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
      <defs><linearGradient id="cl-ys-rock" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="720"><stop offset="0" stop-color="#04020a"></stop><stop offset="1" stop-color="#140b22"></stop></linearGradient>
        <radialGradient id="cl-ys-floor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2c1a4a" stop-opacity=".9"></stop><stop offset="1" stop-color="#120a22" stop-opacity="0"></stop></radialGradient></defs>
      <ellipse cx="640" cy="566" rx="560" ry="110" fill="url(#cl-ys-floor)"></ellipse>
      <path d="M-700 700C-200 640 380 594 640 594C900 594 1480 640 1980 700V1400H-700Z" fill="#07040e" stroke="#5a3f96" stroke-opacity=".35" stroke-width="2"></path>
      ${rock(wallL, [[-700, 1400], [-700, -700]], wallL.slice(1, -1))}${rock(wallR, [[1980, 1400], [1980, -700]], wallR.slice(1, -1))}
      ${rock(ceilL, [[316, -700]], ceilL.slice(0, -1))}${rock(ceilR, [[964, -700]], ceilR.slice(1))}</svg>`;
    const shaft = `<svg class="cl-ys-shaft" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
      <defs><linearGradient id="cl-ys-shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfc4ff" stop-opacity=".16"></stop><stop offset="1" stop-color="#cfc4ff" stop-opacity="0"></stop></linearGradient></defs>
      <polygon points="520,20 760,20 850,600 430,600" fill="url(#cl-ys-shaft)"></polygon></svg>`;
    // 聚灵阵：八块灵石摆一圈（透视压扁的椭圆），依次亮起；两道阵纹把它们连起来
    const stones = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return [640 + Math.cos(a) * 300, 560 + Math.sin(a) * 58];
    });
    const stoneSvg = stones.map(([x, y], i) => {
      const c = i % 2 ? '#d8b4ff' : '#ffe08a';
      return `<g class="cl-ys-stone" style="animation-delay:${f1(0.25 + i * 0.09)}s;filter:drop-shadow(0 0 6px ${c}) drop-shadow(0 0 16px ${c})">
        <polygon points="${f1(x)},${f1(y - 28)} ${f1(x + 10)},${f1(y - 12)} ${f1(x + 7)},${f1(y + 4)} ${f1(x - 7)},${f1(y + 4)} ${f1(x - 10)},${f1(y - 12)}" fill="${c}" fill-opacity=".85" stroke="#fff" stroke-opacity=".6"></polygon>
        <ellipse cx="${f1(x)}" cy="${f1(y + 6)}" rx="16" ry="4" fill="${c}" opacity=".45"></ellipse></g>`;
    }).join('');
    const array = `<svg class="cl-as-abs" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
      <g class="cl-ys-lines" fill="none" stroke="#c9a0ff" stroke-opacity=".55"><ellipse cx="640" cy="560" rx="300" ry="58" stroke-width="2"></ellipse><ellipse cx="640" cy="560" rx="250" ry="47" stroke-width="1"></ellipse></g>
      ${stoneSvg}
      <g class="cl-ys-qi" fill="none" stroke-linecap="round">${stones.map(([x, y], i) => `<path d="M${f1(x)} ${f1(y - 16)}Q${f1(x + (DAN[0] - x) * 0.45)} ${f1(y - 160)} ${DAN[0]} ${DAN[1]}" stroke="${i % 2 ? '#d8b4ff' : '#ffe08a'}" stroke-width="2.4" opacity=".85" style="animation-delay:${f1(-rand() * 1.6)}s"></path>`).join('')}</g></svg>`;
    // 丹田光轮（刻度圈＋转着的灵力）
    const orb = `<div class="cl-ys-orb" style="z-index:5">
      <i style="border:2px solid rgba(255,224,150,.65);background:repeating-conic-gradient(from 0deg, rgba(255,224,150,.55) 0deg 1.2deg, transparent 1.2deg 9deg);-webkit-mask-image:radial-gradient(circle, transparent 84%, #000 86%);mask-image:radial-gradient(circle, transparent 84%, #000 86%)"></i>
      <i style="background:conic-gradient(from 0deg, rgba(255,214,120,.0), rgba(255,214,120,.55), rgba(190,150,255,.15), rgba(190,150,255,.6), rgba(255,214,120,.0));-webkit-mask-image:radial-gradient(circle, transparent 30%, #000 46%, transparent 70%);mask-image:radial-gradient(circle, transparent 30%, #000 46%, transparent 70%)"></i>
      <i style="background:radial-gradient(circle, rgba(255,236,190,.22), rgba(140,90,220,.14) 55%, transparent 72%)"></i></div>`;
    // 金丹（表面一圈转着的云纹）与裂纹、碎片
    const core = `<div class="cl-ys-core" style="z-index:6;background:radial-gradient(circle at 38% 34%, ${L.core[0]}, ${L.core[1]} 30%, ${L.core[2]} 62%, ${L.core[3]});box-shadow:0 0 24px ${L.core[1]}, 0 0 60px ${L.core[2]}">
      <i style="background:repeating-conic-gradient(from 10deg, rgba(255,255,255,.0) 0deg 18deg, rgba(255,250,220,.55) 22deg 26deg, rgba(255,255,255,0) 30deg 45deg);-webkit-mask-image:radial-gradient(circle, transparent 38%, #000 42%, #000 70%, transparent 74%);mask-image:radial-gradient(circle, transparent 38%, #000 42%, #000 70%, transparent 74%)"></i></div>`;
    const cracks = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.5;
      const p = (ang, r) => `${f1(45 + Math.cos(ang) * r)} ${f1(45 + Math.sin(ang) * r)}`;
      const mid = a + (rand() - 0.5) * 0.6;
      return `<path pathLength="1" d="M${p(a, 4)}L${p(mid, 16)}L${p(a + 0.14, 34)}" style="animation-delay:${f1(4.5 + i * 0.05)}s"></path>`;
    }).join('');
    const crack = `<svg class="cl-ys-crack cl-as-crack cl-as-abs" style="left:595px;top:355px;z-index:6" width="90" height="90" viewBox="0 0 90 90" aria-hidden="true"><g fill="none" stroke="#fffdf4" stroke-width="2.4" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #fff)">${cracks}</g></svg>`;
    const shards = Array.from({ length: 32 }, () => {
      const c = L.core[1 + Math.floor(rand() * 3)];
      return `<span class="cl-ys-shard" style="z-index:6;--a:${f1(rand() * 360)}deg;--d:${f1(120 + rand() * 200)}px;background:${c};box-shadow:0 0 12px ${c}"></span>`;
    }).join('');
    // 元婴：一团金光里显出小道友（闭眼、微笑、垂手），6.75 秒睁眼、张嘴笑、扬眉，举起双手
    const baby = `<div class="cl-ys-baby" style="z-index:7"><div><div class="cl-dy-light" style="--t:5.95s">
      ${aura('rgba(255,224,138,.5)', 'rgba(185,140,255,.26)')}
      ${dollSvg(DY, { faceA: ['closed', 'smile', false], faceB: ['dot', 'open', true], at: 6.75, openAt: 6.75, armsAt: 6.78, twinkleAt: 6.85, glow: ['rgba(255,224,138,.9)', 'rgba(185,140,255,.7)'] })}</div></div></div>`;
    // 灵气翻涌：七团暗紫的乱流从四周卷过来
    const wisps = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const x = 640 + Math.cos(a) * 250;
      const y = 400 + Math.sin(a) * 150;
      return `<span class="cl-ys-wisp" style="left:${f1(x)}px;top:${f1(y)}px;--dx:${f1(Math.cos(a) * 420)}px;--dy:${f1(Math.sin(a) * 260)}px;--t:${f1(2.3 + i * 0.08)}s;z-index:8">
        <i style="background:radial-gradient(ellipse, rgba(52,26,110,.9) 0, rgba(24,12,60,.8) 42%, rgba(80,50,160,.3) 62%, transparent 74%)"></i></span>`;
    }).join('');
    const ash = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      return sparks(rand, 640 + Math.cos(a) * 160, 400 + Math.sin(a) * 100, 6, 3.86, ['#4a3a8a', '#7a6ac0', '#3a3060'], 360);
    }).join('');
    const calm = [3.7, 3.86, 4.02].map((t) => `<span class="cl-ys-calm" style="border-color:#9ff0d0;box-shadow:0 0 24px #6fe3b3, inset 0 0 14px #6fe3b3;animation-delay:${t}s;z-index:9"></span>`).join('');
    // 天窗外的灵气漩涡（亮的）与旋着灌下来的几股灵气
    const arms = Array.from({ length: 6 }, (_, k) => {
      const th0 = (k / 6) * Math.PI * 2;
      const pts = [];
      for (let r = 18; r <= 280; r += 12) { const th = th0 + r / 84; pts.push([280 + Math.cos(th) * r, 280 + Math.sin(th) * r]); }
      return pts;
    });
    const vortex = `<div class="cl-ys-vortex"><div><i style="background:radial-gradient(circle, rgba(255,248,226,1) 0, rgba(255,214,120,.9) 9%, rgba(160,110,245,.5) 30%, rgba(90,60,180,.18) 50%, transparent 64%)">
      <svg width="560" height="560" viewBox="0 0 560 560" style="position:absolute;inset:0" aria-hidden="true"><g fill="none" stroke-linecap="round">${arms.map((pts, k) => `<polyline points="${ptsText(pts)}" stroke="${k % 2 ? '#e2c6ff' : '#ffe9a8'}" stroke-width="${k % 2 ? 7 : 11}" opacity=".7"></polyline>`).join('')}</g></svg></i></div></div>`;
    const bloom = `<span class="cl-ys-bloom" style="z-index:4;background:radial-gradient(ellipse, rgba(255,240,200,.55) 0, rgba(200,160,255,.25) 40%, transparent 70%)"></span>`;
    const pour = `<svg class="cl-as-abs cl-ys-pour" width="1280" height="720" viewBox="0 0 1280 720" style="z-index:6;filter:drop-shadow(0 0 6px rgba(255,230,170,.9))" aria-hidden="true"><g fill="none" stroke-linecap="round">
      ${[[-70, 1], [-30, -1], [10, 1], [50, -1], [86, 1]].map(([dx, side], k) => {
        const d = `M${640 + dx} 50C${640 + dx + side * 90} 150 ${640 - side * 80} 220 640 300`;
        const c = ['#ffe9a8', '#e2c6ff', '#ffffff', '#ffe08a', '#d8b4ff'][k];
        return `<path class="is-base" d="${d}" stroke="${c}" stroke-width="7"></path><path pathLength="100" d="${d}" stroke="${c}" stroke-width="${k === 2 ? 5 : 3.6}" style="animation-delay:${f1(-k * 0.22)}s"></path>`;
      }).join('')}</g></svg>`;
    return {
      veil: L.veil,
      html: `<div class="cl-as-stage cl-as-stage-3">
        ${sky}${vortex}${cave}${shaft}${bloom}${array}
        ${motes(rand, L.mote, 18, 0.8)}
        ${orb}${core}${crack}${shards}${pour}${baby}
        <div class="cl-ys-veil" style="z-index:8;background:radial-gradient(ellipse 1000px 680px at 1840px 1604px, transparent 30%, rgba(40,16,90,.4) 60%, rgba(8,4,24,.8) 88%)"></div>
        ${wisps}
        <span class="cl-ys-pearl" style="z-index:9;background:radial-gradient(circle at 38% 34%, #f4fff9, #9ff0d0 40%, #2fae86);box-shadow:0 0 16px #6fe3b3, 0 0 40px #2fae86"></span>
        ${calm}${ash}
        ${flash(5.15, 1, DAN[0], DAN[1], L.ring[0], 'rgba(255,214,120,.6)')}${flash(6.0, 0.55, DAN[0], DAN[1], L.ring[1], 'rgba(190,150,255,.35)')}
        ${flash(7.1, 0.3, 312, 310, L.glyphGlow, 'rgba(170,120,255,.25)')}${flash(7.45, 0.3, 968, 310, L.glyphGlow, 'rgba(170,120,255,.25)')}
        ${ring(5.2, DAN[0], DAN[1], L.ring[0])}${ring(6.0, DAN[0], DAN[1], L.ring[1])}${ring(6.2, DAN[0], DAN[1], L.ring[2])}
        ${motes(rand, L.mote, 30, 6.2)}
        ${glyphs(rand, L, 3, [7.1, 7.45])}
      </div>`,
    };
  }

  // ============ 化神：元婴化神 ============
  function sceneHuashen(L) {
    const rand = seeded(4 * 131 + 17);
    const C = [640, 330];   // 小道友悬停处：天地元气、神识、法则光环的中心
    // 两侧峭壁（谷中闭关），石缝里一点寒光；峭壁一直画到画面外；谷底薄雾
    const cliffs = [
      ['M-700 1400V-700H120V0L170 90L140 160L210 240L190 330L260 410L240 500L310 590L300 720L300 1400Z', 'M0 720V170L56 236L36 330L104 410L86 500L162 592L150 720Z', '-180px'],
      ['M1980 1400V-700H1150V0L1100 100L1135 170L1060 250L1085 340L1010 420L1035 510L960 600L975 720L975 1400Z', 'M1280 720V180L1222 250L1244 340L1176 420L1196 510L1118 600L1128 720Z', '180px'],
    ].map(([d, d2, x]) => `<svg class="cl-hs-cliff" style="left:0;--x:${x};z-index:4" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
      <path d="${d}" fill="#06050f" stroke="#5a7ad0" stroke-opacity=".5" stroke-width="3" stroke-linejoin="round"></path><path d="${d2}" fill="#0d0c22" stroke="#4a62b0" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"></path></svg>`).join('');
    const mist = [[300, 610, 520, 120, '50px'], [760, 640, 600, 110, '-60px'], [520, 680, 700, 90, '40px']].map(([x, y, w, h, mx]) => `<span class="cl-hs-mist" style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;--mx:${mx};z-index:4;background:radial-gradient(ellipse, rgba(140,170,230,.32), transparent 70%)"></span>`).join('');
    // 星空：先暗着；神识荡开（3.2 秒起，每秒约 600px）扫到哪里，哪里的星星就亮起来
    const starList = Array.from({ length: 110 }, () => {
      const x = rand() * 1280;
      const y = rand() * 600;
      const size = 1 + rand() * 2.4;
      const d = Math.hypot(x - C[0], y - C[1]);
      return { x, y, size, t: 3.2 + Math.max(0, d - 20) / 600, p: 1.4 + rand() * 1.6 };
    });
    const stars = starList.map((s) => `<span class="cl-hs-star" style="left:${f1(s.x)}px;top:${f1(s.y)}px;width:${f1(s.size)}px;height:${f1(s.size)}px;box-shadow:0 0 ${f1(s.size * 3)}px #cfe6ff;--t:${f1(s.t)}s;--t2:${f1(s.t + 0.6)}s;--p:${f1(s.p)}s"></span>`).join('');
    // 星网：亮一些的星星和最近的一颗（70—170px）连线，两颗都亮了再连
    const bright = starList.filter((s) => s.size > 1.9);
    const pairs = [];
    bright.forEach((a, i) => {
      let best = null;
      bright.forEach((b, j) => {
        if (i === j) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d >= 70 && d <= 170 && (!best || d < best.d)) best = { j, d };
      });
      if (best && !pairs.some(([p, q]) => (p === i && q === best.j) || (p === best.j && q === i))) pairs.push([i, best.j]);
    });
    const web = `<svg class="cl-as-abs cl-hs-web" width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true"><g fill="none" stroke="#bfe0ff" stroke-opacity=".34" stroke-width="1.1" stroke-linecap="round">
      ${pairs.slice(0, 16).map(([i, j]) => { const a = bright[i]; const b = bright[j]; return `<path pathLength="1" d="M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}" style="--t:${f1(Math.max(a.t, b.t) + 0.1)}s"></path>`; }).join('')}</g></svg>`;
    const nebula = `<div class="cl-hs-nebula"><i style="background:conic-gradient(from 0deg, rgba(127,216,255,.5), rgba(185,140,255,.55), rgba(255,143,196,.45), rgba(255,211,107,.5), rgba(111,227,179,.45), rgba(127,216,255,.5));-webkit-mask-image:radial-gradient(circle, #000 18%, transparent 66%);mask-image:radial-gradient(circle, #000 18%, transparent 66%)"></i></div>`;
    const ripples = [3.2, 3.55].map((t) => `<span class="cl-hs-ripple" style="--t:${t}s;z-index:3"></span>`).join('');
    // 五色寒焰
    const flames = L.flames.map((c, i) => `<span class="cl-hs-flame" style="animation:cl-hs-fl-${i} 6.6s linear forwards">
      <svg viewBox="0 0 36 58" aria-hidden="true" style="filter:drop-shadow(0 0 8px ${c}) drop-shadow(0 0 20px ${c})">
        <path d="M18 2C22 14 34 22 34 38C34 50 27 56 18 56C9 56 2 50 2 38C2 26 12 22 14 10C16 16 15 22 18 26C20 18 18 10 18 2Z" fill="${c}" fill-opacity=".75"></path>
        <path d="M18 22C21 30 28 34 28 42C28 50 23 53 18 53C13 53 8 50 8 42C8 36 14 34 15 28C16 32 16 35 18 37C19 32 18 27 18 22Z" fill="#ffffff" fill-opacity=".85"></path></svg></span>`).join('');
    // 小道友：先是青袍、睁眼微笑、垂手；化神时一团金光里换上月白金边的袍子，星星眼、张嘴笑、扬眉，举起双手
    const baby = `<div class="cl-hs-baby"><div><div class="cl-hs-grow">
      <div class="cl-hs-gold">${aura('rgba(255,224,138,.42)', 'rgba(127,214,255,.22)')}
        ${dollSvg(DY, { faceA: ['dot', 'smile', false], armsAt: null, glow: ['rgba(255,224,138,.8)', 'rgba(127,214,255,.6)'] })}</div>
      <div class="cl-hs-spirit"><div class="cl-dy-light" style="--t:7s">${aura('rgba(255,240,190,.6)', 'rgba(170,200,255,.3)')}
        ${dollSvg(DY_SPIRIT, { faceA: ['star', 'open', true], armsAt: 7.05, glow: ['rgba(255,236,170,1)', 'rgba(170,200,255,.9)'] })}</div></div></div></div></div>`;
    // 天地元气：从画面四周朝同一个方向旋着汇向小道友的流光（像漩涡的旋臂）＋被吸过来的光点
    const flowColors = L.flames.concat(['#ffffff']);
    const streams = Array.from({ length: 10 }, (_, i) => {
      const a0 = (i / 10) * Math.PI * 2 + rand() * 0.3;
      const pt = (r, a) => `${f1(C[0] + Math.cos(a) * r)} ${f1(C[1] + Math.sin(a) * r * 0.72)}`;
      const d = `M${pt(780, a0)}C${pt(480, a0 + 0.55)} ${pt(200, a0 + 1.15)} ${C[0]} ${C[1]}`;
      const c = flowColors[i % flowColors.length];
      return `<path class="is-base" d="${d}" stroke="${c}" stroke-width="6"></path><path pathLength="100" d="${d}" stroke="${c}" stroke-width="${f1(2.6 + rand() * 1.4)}" style="animation-delay:${f1(-rand() * 1.4)}s"></path>`;
    }).join('');
    const qi = `<svg class="cl-as-abs cl-hs-qi" width="1280" height="720" viewBox="0 0 1280 720" style="z-index:3;filter:drop-shadow(0 0 5px rgba(255,255,255,.7))" aria-hidden="true"><g fill="none" stroke-linecap="round">${streams}</g></svg>`;
    const dots = Array.from({ length: 24 }, () => {
      const a = rand() * Math.PI * 2;
      const d = 300 + rand() * 420;
      const c = flowColors[Math.floor(rand() * flowColors.length)];
      return `<span class="cl-hs-dot" style="z-index:4;background:${c};box-shadow:0 0 8px ${c};--dx:${f1(Math.cos(a) * d)}px;--dy:${f1(Math.sin(a) * d * 0.7)}px;--t:${f1(2.6 + rand() * 1.6)}s;--p:${f1(1.2 + rand() * 0.8)}s"></span>`;
    }).join('');
    // 法则：浑仪一样的两道带刻度的光环（地平环、斜着的黄道环）和一根斜着的极轴
    const ringMask = 'radial-gradient(circle closest-side, transparent 93%, #000 94%, #000 99%, transparent 100%)';
    const armil = `<div class="cl-hs-armil"><b style="--t:4.2s"><i class="is-axis" style="background:linear-gradient(180deg, transparent, rgba(255,233,168,.85) 14%, rgba(255,233,168,.85) 86%, transparent);box-shadow:0 0 8px rgba(255,214,120,.9)"></i></b>
      ${[[186, 72, -6, 'rgba(255,214,120,.9)', 10, '360deg', 4.25], [158, 62, 26, 'rgba(127,216,255,.85)', 13, '-360deg', 4.45]]
      .map(([r, x, z, c, p, dir, t]) => `<b style="--t:${t}s"><i style="--rr:${r}px;--x:${x}deg;--z:${z}deg;--p:${p}s;--dir:${dir};border:2px solid ${c};box-shadow:0 0 12px ${c}, inset 0 0 10px ${c}">
        <u style="background:repeating-conic-gradient(${c} 0deg 2.2deg, transparent 2.2deg 15deg);-webkit-mask-image:${ringMask};mask-image:${ringMask}"></u></i></b>`).join('')}</div>`;
    // 空间裂缝：画在裂缝自己的坐标里（横着，中心是原点），整体转 -22°。口子里是深紫的另一片天和几点亮星，
    //   边缘一圈白亮的光，口子两侧有几道细裂纹，外面一团光晕
    const N = 16;
    const half = (u) => 26 * Math.pow(Math.sin(Math.PI * u), 0.9);
    const top = [];
    const bottom = [];
    for (let k = 0; k <= N; k += 1) {
      const u = k / N;
      const inner = k && k < N ? Math.sin(Math.PI * u) : 0;
      const x = -200 + 400 * u + (rand() - 0.5) * 10 * inner;
      top.push([x, -half(u) + (rand() - 0.5) * 14 * inner]);
      bottom.push([x + (rand() - 0.5) * 8 * inner, half(u) + (rand() - 0.5) * 14 * inner]);
    }
    const lens = top.concat(bottom.slice().reverse());
    const glowLens = lens.map(([x, y]) => [x * 1.12, y * 3]);
    const cracksSvg = Array.from({ length: 7 }, (_, k) => {
      const [x, y] = (k % 2 ? bottom : top)[2 + Math.floor(rand() * (N - 3))];
      const dir = k % 2 ? 1 : -1;
      const l1 = 12 + rand() * 18;
      const l2 = 10 + rand() * 22;
      const x1 = x + (rand() - 0.5) * 24;
      return `<polyline points="${f1(x)},${f1(y)} ${f1(x1)},${f1(y + dir * l1)} ${f1(x1 + (rand() - 0.5) * 30)},${f1(y + dir * (l1 + l2))}"></polyline>`;
    }).join('');
    const specks = Array.from({ length: 9 }, () => `<circle cx="${f1(-140 + rand() * 280)}" cy="${f1((rand() - 0.5) * 16)}" r="${f1(0.9 + rand() * 1.6)}" fill="${rand() < 0.5 ? '#fffbe8' : '#ffd36b'}"></circle>`).join('');
    const rift = `<div class="cl-hs-rift"><span class="cl-hs-rift-line"></span><div class="cl-hs-rift-open">
      <svg width="520" height="220" viewBox="-260 -110 520 220" aria-hidden="true">
        <defs><radialGradient id="cl-hs-void" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#140a32"></stop><stop offset=".62" stop-color="#3a2a86"></stop><stop offset=".86" stop-color="#9fb8ff"></stop><stop offset="1" stop-color="#f2f8ff"></stop></radialGradient>
          <filter id="cl-hs-rift-b" x="-40%" y="-150%" width="180%" height="400%"><feGaussianBlur stdDeviation="16"></feGaussianBlur></filter>
          <filter id="cl-hs-rift-e" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="4"></feGaussianBlur></filter></defs>
        <polygon points="${ptsText(glowLens)}" fill="#d8ccff" opacity=".5" filter="url(#cl-hs-rift-b)"></polygon>
        <polygon points="${ptsText(lens)}" fill="none" stroke="#dff0ff" stroke-width="10" stroke-linejoin="round" filter="url(#cl-hs-rift-e)"></polygon>
        <polygon points="${ptsText(lens)}" fill="url(#cl-hs-void)"></polygon>${specks}
        <polygon points="${ptsText(lens)}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"></polygon>
        <g class="cl-hs-cracks" fill="none" stroke="#e6f3ff" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity=".85">${cracksSvg}</g></svg></div></div>`;
    // 被吸进裂缝的碎屑：终点在裂缝中线上，从四周 90—220px 处飞过去
    const ang = (-22 * Math.PI) / 180;
    const chips = Array.from({ length: 18 }, () => {
      const u = (rand() - 0.5) * 1.6 * 200;
      const tx = 990 + Math.cos(ang) * u;
      const ty = 126 + Math.sin(ang) * u;
      const a = rand() * Math.PI * 2;
      const d = 90 + rand() * 130;
      const c = rand() < 0.5 ? '#fff6d8' : '#b9e8ff';
      return `<span class="cl-hs-chip" style="left:${f1(tx)}px;top:${f1(ty)}px;background:${c};box-shadow:0 0 8px ${c};--dx:${f1(Math.cos(a) * d)}px;--dy:${f1(Math.sin(a) * d)}px;--t:${f1(5.95 + rand() * 1.4)}s"></span>`;
    }).join('');
    // 化神后五色光点绕身
    const orbs = L.flames.map((c, i) => `<span class="cl-hs-orb" style="animation:cl-hs-orbit5 2.6s linear ${f1(-i * 0.52)}s infinite"><i style="--t:${f1(7.05 + i * 0.06)}s;background:radial-gradient(circle at 40% 35%, #fff, ${c} 60%);box-shadow:0 0 10px ${c}, 0 0 22px ${c}"></i></span>`).join('');
    return {
      veil: L.veil,
      html: `<div class="cl-as-stage cl-as-stage-4">
        <style>${L.flames.map((_, i) => flameFrames(i, L.flames.length)).join('')}${orbitFrames('cl-hs-orbit5', 140, 32)}</style>
        ${stars}${web}${nebula}${ripples}<div class="cl-hs-riftbox">${rift}${chips}</div>${cliffs}${mist}
        ${qi}${dots}${armil}${flames}${baby}${orbs}
        ${flash(5.65, 0.6, 990, 126, '#ffe9a8', 'rgba(185,232,255,.4)')}
        ${flash(7.0, 0.85, C[0], C[1], L.ring[0], 'rgba(255,214,120,.45)')}
        ${flash(7.35, 0.3, 312, 310, L.glyphGlow, 'rgba(255,200,90,.25)')}${flash(7.7, 0.3, 968, 310, L.glyphGlow, 'rgba(255,200,90,.25)')}
        ${ring(7.0, C[0], C[1], L.ring[0])}${ring(7.15, C[0], C[1], L.ring[1])}${ring(7.3, C[0], C[1], L.ring[2])}
        ${sparks(rand, C[0], C[1], 24, 7.0, L.flames, 360)}
        ${motes(rand, L.mote, 30, 7.2)}
        ${glyphs(rand, L, 4, [7.35, 7.7])}
      </div>`,
    };
  }
  const scene = (level) => (level === 4 ? sceneHuashen(LEVELS[4]) : sceneYuanying(LEVELS[3]));

  // 毛笔字体：第一次播放前先取字体文件（最多等 1.5 秒；取不到就用系统楷体）
  let fontWait = null;
  function fontReady() {
    if (!fontWait) {
      let load = Promise.resolve();
      try {
        if (document.fonts && document.fonts.load) load = document.fonts.load(`400 64px '${FAMILY}'`, '元婴化神').catch(() => null);
      } catch (e) { /* 旧浏览器没有 document.fonts */ }
      fontWait = Promise.race([load, new Promise((resolve) => setTimeout(resolve, 1500))]);
    }
    return fontWait;
  }

  let layerEl = null;
  function layerFor(layer) {
    if (layer) return layer;
    if (!layerEl) {
      layerEl = document.createElement('div');
      layerEl.className = 'cl-ascend-layer';
      document.body.appendChild(layerEl);
    }
    return layerEl;
  }
  function namesText(names, self) {
    if (self) return '恭喜你';
    const list = (names || []).filter(Boolean);
    if (!list.length) return '恭喜本班同学';
    return list.length > 6 ? `恭喜 ${list.slice(0, 6).join('、')} 等 ${list.length} 位同学` : `恭喜 ${list.join('、')}`;
  }
  const blessing = (level) => { const list = (LEVELS[level] || LEVELS[3]).blessings; return list[Math.floor(Math.random() * list.length)]; };
  function show({ level = 3, names = [], self = false, fit = 'wide', layer = null, blessing: words = '' } = {}) {
    const lv = LEVELS[level] ? level : 3;
    const L = LEVELS[lv];
    const sc = scene(lv);
    const el = document.createElement('div');
    el.className = `cl-ascend cl-ascend-${lv}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', `${namesText(names, self)}${L.title}`);
    // 投屏：1280×720 整个放进屏幕；学生页：两侧可裁到 960；手机竖着拿：两侧再多裁一些（看中间约 760），名牌挪到画面下方的空处
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tall = fit === 'narrow' && h > w * 1.2;
    const scale = tall ? Math.min(w / 760, h / 720) : fit === 'narrow' ? Math.min(w / 960, h / 720) : Math.min(w / 1280, h / 720);
    el.style.setProperty('--as-scale', String(scale));
    if (tall) {
      el.classList.add('is-tall');
      const below = (h - 720 * scale) / 2 / scale;   // 画面下方空出来的高度（换算成画面里的像素）
      el.style.setProperty('--plate-bottom', `${f1(-Math.max(0, Math.min(190, below - 30)))}px`);
    }
    el.innerHTML = `<div class="cl-as-veil" style="background:${sc.veil}"></div>
      <div class="cl-as-box">${sc.html}
        <div class="cl-as-plate" style="--pd:${L.plateAt}s"><span class="cl-as-seal">${esc(L.realm.slice(0, 1))}<br>${esc(L.realm.slice(1))}</span>
          <div class="cl-as-lines"><span class="cl-as-who"><span class="cl-as-names"></span><span class="cl-as-verb">${esc(L.verb)}</span></span>
            <span class="cl-as-title" style="${L.titleCss}">${esc(L.title)}</span><span class="cl-as-bless"></span></div></div></div>
      <span class="cl-as-tip">点一下画面可提前关闭</span>`;
    el.querySelector('.cl-as-names').textContent = namesText(names, self);
    el.querySelector('.cl-as-bless').textContent = words || blessing(lv);
    layerFor(layer).appendChild(el);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener('keydown', onKey, true);
        el.remove();
        resolve();
      };
      const close = () => {
        if (done || el.classList.contains('is-closing')) return;
        el.classList.add('is-closing');
        setTimeout(finish, 460);
      };
      const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
      const opened = Date.now();
      el.addEventListener('click', (event) => { event.stopPropagation(); if (Date.now() - opened > 600) close(); });
      document.addEventListener('keydown', onKey, true);
      const timer = setTimeout(finish, DURATION + 100);
    });
  }
  // 几次调用排队依次播放（第一次先等毛笔字体）
  let queue = Promise.resolve();
  function play(options) {
    const run = queue.then(fontReady).then(() => show(options));
    queue = run.catch(() => {});
    return run;
  }
  window.ClassLiveAscend = { play, blessing, DURATION, LEVELS: Object.keys(LEVELS).map(Number), nameOf: (level) => (LEVELS[level] || LEVELS[3]).realm };
})();
