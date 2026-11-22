/* 《金融机构与市场》同一单元各张页面之间，带着本单元的钥匙走。
 *
 * 这门课一个单元（一次课）有好几张页面：课次页 lsNN.html，和它同一把钥匙的附页——案例阅读页、讲义页、模拟房间、
 * 期中经营模拟的两张游戏页。学生从首页用课堂码登录时，钥匙（StatiCrypt 的解密值）带在网址 # 后面进到课次页。
 * 浏览器替网站“记住”的钥匙只有一把——最后登录的那个课堂的。一个班同时开着几个课堂（比如第1次课和期中经营模拟）时，
 * 从课次页点进案例页，记住的那一把可能已经是别的课堂的，页面就打不开。所以这里：
 *   · 把进来时带的钥匙按“课程＋单元”记在本机；
 *   · 给同一单元各页面之间的链接带上它（放在 # 后面，不会发给服务器），要跳到页面里某一处时把位置一起带上（&at=…）；
 *   · 页面打开以后，把地址栏里的钥匙去掉，只留下普通的 #位置。
 *   · 这一页在前台时，把浏览器“记住”的钥匙认回本单元的这一把，刷新、后退都打得开。
 * 老师的“学生测试版”（地址带 ?preview=课堂编号&staticrypt_pwd=…）：链接照样带着这两项走。
 * 预览副本、本机测试不加密，没有钥匙，链接原样不动。
 * 本脚本要排在本课程其他脚本之前（它们会清掉地址栏里的钥匙）。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  if (!config || !config.unit || !config.course) return;
  const unit = config.unit;
  const STORE = `fim-key:${config.course}:${unit}`;
  const query = new URLSearchParams(location.search);
  const frag = location.hash.slice(1);
  const preview = query.get('preview') || '';
  const fromFrag = (frag.match(/(?:^|&)staticrypt_pwd=([0-9a-f]{64})(?:&|$)/) || [])[1] || '';
  const fromQuery = /^[0-9a-f]{64}$/.test(query.get('staticrypt_pwd') || '') ? query.get('staticrypt_pwd') : '';
  let key = fromFrag || fromQuery;
  try { if (key) localStorage.setItem(STORE, key); else key = localStorage.getItem(STORE) || ''; } catch (error) { /* 无痕模式等：只用这一次带来的 */ }

  // 地址栏里不留钥匙；带来的“跳到哪一处”换成普通的 #位置（后面的脚本按它滚过去）
  const at = (frag.match(/(?:^|&)at=([A-Za-z0-9_-]+)/) || [])[1] || '';
  if (fromFrag || (fromQuery && !preview)) {
    if (!preview) { query.delete('staticrypt_pwd'); query.delete('remember_me'); }
    const search = query.toString();
    try { history.replaceState(null, '', location.pathname + (search ? `?${search}` : '') + (at ? `#${at}` : '')); } catch (error) { /* 忽略 */ }
  }

  // 这一页在前台时，让浏览器“记住”的就是本单元的钥匙：学生中途用别的课堂码登录过（记住的会被换成那一把），回到这一页刷新、后退仍然打得开
  function claim() {
    if (!key || preview) return;
    try {
      if (localStorage.getItem('staticrypt_passphrase') !== key) {
        localStorage.setItem('staticrypt_passphrase', key);
        localStorage.setItem('staticrypt_expiration', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
      }
    } catch (error) { /* 忽略 */ }
  }
  claim();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') claim(); });
  ['focus', 'pageshow', 'beforeunload', 'pagehide'].forEach((type) => window.addEventListener(type, claim));

  const SAME = new RegExp(`^(${unit}(?:-[a-z0-9]+)?\\.html)(?:\\?[^#]*)?(?:#(.*))?$`);
  /* 同一单元的页面地址 → 带上钥匙（和测试页的参数）的地址；别的地址原样返回。 */
  function href(url) {
    const m = String(url == null ? '' : url).match(SAME);
    if (!m || /staticrypt_pwd=/.test(url)) return url;      // 别的页面、已经带上钥匙的：不动
    const anchor = m[2] && /^[A-Za-z0-9_-]+$/.test(m[2]) ? m[2] : '';
    if (preview) return `${m[1]}?preview=${encodeURIComponent(preview)}${key ? `&staticrypt_pwd=${key}` : ''}${anchor ? `#${anchor}` : ''}`;
    if (!key) return m[1] + (anchor ? `#${anchor}` : '');
    return `${m[1]}#staticrypt_pwd=${key}&remember_me${anchor ? `&at=${anchor}` : ''}`;
  }
  function wire(root) {
    if (!key && !preview) return;
    (root || document).querySelectorAll('a[href]').forEach((a) => {
      const raw = a.getAttribute('href');
      const next = href(raw);
      if (next !== raw) a.setAttribute('href', next);
    });
  }
  // 页面里后来才生成的链接：点下去（或者右键、中键）之前补上
  ['click', 'auxclick', 'contextmenu', 'touchstart', 'mousedown'].forEach((type) => {
    document.addEventListener(type, (event) => {
      const a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!a) return;
      const raw = a.getAttribute('href');
      const next = href(raw);
      if (next !== raw) a.setAttribute('href', next);
    }, true);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wire(document)); else wire(document);

  window.FimKey = { unit, preview, has: Boolean(key), href, wire, go(url) { location.href = href(url); } };
})();
