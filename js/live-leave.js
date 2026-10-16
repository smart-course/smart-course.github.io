/* 学生请假：章节页左下角面板和首页（这台设备登录过时）点“请假”打开。
 * 选择请假日期（从哪天到哪天）、填写原因，提交后老师在工作台“加入名单”的备注里看到“请假”和原因；
 * 请假的那次课计基础修为（ClassLive.LEAVE.points，相当于签到），没登录也没请假的课不得修为。
 * 后台函数：ck_request_leave / ck_my_leaves / ck_cancel_leave（凭本设备登录过的课堂核对是本班学生，只能给自己请假）。
 * 用法：ClassLeave.open({ backend, identity })，identity 是本机保存的学生身份（含 classroom、name、sid）。
 */
(function () {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const shift = (day, n) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const shortDay = (day) => String(day || '').slice(5).replace('-', '月') + '日';
  const range = (row) => (row.start_day === row.end_day ? shortDay(row.start_day) : `${shortDay(row.start_day)}—${shortDay(row.end_day)}`);
  const CSS = `
.cl-leave{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(32,28,24,.55);font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#223832}
.cl-leave[hidden]{display:none}
.cl-leave-card{width:min(460px,100%);max-height:calc(100vh - 40px);overflow:auto;padding:20px 22px 22px;border-radius:12px;background:#fffdf8;box-shadow:0 24px 60px rgba(20,16,12,.3)}
.cl-leave-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
.cl-leave-head h3{margin:0;font:800 21px/1.3 "Songti SC",STSong,SimSun,serif}
.cl-leave-head button{width:34px;height:34px;border:1px solid #d7d7ca;border-radius:50%;background:#fff;color:#223832;font-size:20px;line-height:1;cursor:pointer}
.cl-leave-who{margin:0 0 12px;color:#64706a;font-size:13.5px}
.cl-leave-row{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:8px}
.cl-leave-row span{padding-bottom:10px;color:#64706a}
.cl-leave label{display:block;font-weight:750;font-size:14px}
.cl-leave input,.cl-leave textarea{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px 10px;border:1.5px solid #d7d7ca;border-radius:8px;background:#fff;color:#223832;font:inherit}
.cl-leave textarea{min-height:84px;resize:vertical}
.cl-leave input:focus,.cl-leave textarea:focus{outline:none;border-color:#216459;box-shadow:0 0 0 3px #e4efeb}
.cl-leave-reason{margin-top:12px}
.cl-leave-count{float:right;color:#8a918d;font-weight:500;font-size:12.5px}
.cl-leave-note{margin:10px 0 0;padding:9px 12px;border-radius:8px;background:#f4ede3;color:#5b4a36;font-size:13px;line-height:1.6}
.cl-leave-error{min-height:20px;margin:8px 0 0;color:#ae5137;font-weight:700;font-size:13.5px}
.cl-leave-error.is-ok{color:#216459}
.cl-leave-submit{width:100%;margin-top:4px;padding:11px;border:0;border-radius:8px;background:#216459;color:#fff;font-family:inherit;font-weight:800;font-size:15px;line-height:1;cursor:pointer}
.cl-leave-submit[disabled]{opacity:.6;cursor:default}
.cl-leave-mine{margin-top:16px;padding-top:12px;border-top:1px solid #e3ddd0}
.cl-leave-mine h4{margin:0 0 6px;font-size:14px}
.cl-leave-mine ul{margin:0;padding:0;list-style:none}
.cl-leave-mine li{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed #e3ddd0;font-size:13.5px}
.cl-leave-mine li b{margin-right:6px;color:#ae5137}
.cl-leave-mine li button{flex:0 0 auto;padding:2px 9px;border:1px solid #d7d7ca;border-radius:6px;background:#fff;color:#64706a;font:inherit;font-size:12.5px;cursor:pointer}
.cl-leave-mine p{margin:0;color:#8a918d;font-size:13px}
@media (max-width:520px){.cl-leave{padding:0;place-items:stretch}.cl-leave-card{width:100%;max-height:none;height:100%;border-radius:0}}`;

  let box = null;
  let ctx = null;
  function build() {
    if (!document.getElementById('cl-leave-style')) {
      const style = document.createElement('style');
      style.id = 'cl-leave-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    box = document.createElement('div');
    box.className = 'cl-leave';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '请假');
    box.innerHTML = `<form class="cl-leave-card" data-leave-form novalidate>
      <div class="cl-leave-head"><h3>请假</h3><button type="button" data-leave-close aria-label="关闭">×</button></div>
      <p class="cl-leave-who" data-leave-who></p>
      <div class="cl-leave-row">
        <label>从<input type="date" name="start" required></label><span>到</span><label>（含）<input type="date" name="end" required></label>
      </div>
      <label class="cl-leave-reason">请假原因<span class="cl-leave-count" data-leave-count>0/200</span>
        <textarea name="reason" maxlength="200" placeholder="例如：发烧去医院就诊；参加学校运动会。" required></textarea></label>
      <p class="cl-leave-note" data-leave-note></p>
      <p class="cl-leave-error" role="status" data-leave-error></p>
      <button type="submit" class="cl-leave-submit">提交请假</button>
      <div class="cl-leave-mine"><h4>我的请假记录</h4><div data-leave-mine><p>正在读取……</p></div></div>
    </form>`;
    document.body.appendChild(box);
    const form = box.querySelector('[data-leave-form]');
    const reason = form.elements.reason;
    reason.addEventListener('input', () => { box.querySelector('[data-leave-count]').textContent = `${reason.value.length}/200`; });
    form.elements.start.addEventListener('change', () => {
      if (!form.elements.end.value || form.elements.end.value < form.elements.start.value) form.elements.end.value = form.elements.start.value;
    });
    box.querySelector('[data-leave-close]').addEventListener('click', close);
    box.addEventListener('click', (event) => { event.stopPropagation(); if (event.target === box) close(); });
    // 打开时按键只作用于请假框（章节页的 ↓ ↑ 翻页、快捷键不响应）；Esc 关闭
    window.addEventListener('keydown', (event) => {
      if (!box || box.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      event.stopPropagation();
    }, true);
    form.addEventListener('submit', submit);
    box.querySelector('[data-leave-mine]').addEventListener('click', cancel);
  }
  const setError = (text, ok) => {
    const el = box.querySelector('[data-leave-error]');
    el.textContent = text || '';
    el.classList.toggle('is-ok', Boolean(ok));
  };
  const room = () => Number(ctx.identity.classroom) || ctx.identity.classroom;
  async function rpc(name, params) {
    await ctx.backend.ensureAnonymous();
    let result = await ctx.backend.rpc(name, { p_classroom: room(), ...params });
    if (Array.isArray(result) && name !== 'ck_my_leaves') result = result[0];
    return result;
  }
  async function loadMine() {
    const list = box.querySelector('[data-leave-mine]');
    try {
      const rows = (await rpc('ck_my_leaves', {})) || [];
      const day = today();
      list.innerHTML = rows.length
        ? `<ul>${rows.map((row) => `<li><span><b>${esc(range(row))}</b>${esc(row.reason)}</span>${row.end_day >= day
          ? `<button type="button" data-leave-cancel="${esc(row.id)}">撤销</button>` : ''}</li>`).join('')}</ul>`
        : '<p>还没有请假记录。</p>';
    } catch (problem) {
      console.warn('[请假] 记录没有读到：', (problem && problem.message) || problem);
      list.innerHTML = '<p>暂时读不到请假记录。</p>';
    }
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const start = form.elements.start.value, end = form.elements.end.value || start;
    const text = form.elements.reason.value.replace(/\s+/g, ' ').trim();
    if (!start) { setError('请选择请假日期'); form.elements.start.focus(); return; }
    if (end < start) { setError('结束日期不能早于开始日期'); form.elements.end.focus(); return; }
    if (text.length < 2) { setError('请写明请假原因'); form.elements.reason.focus(); return; }
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    button.textContent = '正在提交……';
    try {
      const result = (await rpc('ck_request_leave', { p_start: start, p_end: end, p_reason: text })) || {};
      const messages = {
        login: '这台设备还没有核对过身份：请先在首页用课堂码登录一次，再来请假。',
        bad_date: '日期不对：最早可以补请 7 天前的假，最晚请 60 天后的假，一次最多 31 天。',
        bad_reason: '请假原因写 2—200 字。',
        too_many: '今天提交的请假太多了，明天再试；有问题请直接找老师。',
      };
      if (result.status === 'ok') {
        setError(`已提交：${range(result)}请假。老师在加入名单里能看到你的请假原因。`, true);
        form.elements.reason.value = '';
        box.querySelector('[data-leave-count]').textContent = '0/200';
        loadMine();
      } else {
        setError(messages[result.status] || '没有提交成功，请再试一次。');
      }
    } catch (problem) {
      console.error(problem);
      setError('没有提交成功，请检查网络后再试一次。');
    } finally {
      button.disabled = false;
      button.textContent = '提交请假';
    }
  }
  async function cancel(event) {
    const button = event.target.closest('[data-leave-cancel]');
    if (!button) return;
    if (button.dataset.confirm !== '1') {
      button.dataset.confirm = '1';
      button.textContent = '确认撤销？';
      setTimeout(() => { if (button.isConnected) { button.dataset.confirm = ''; button.textContent = '撤销'; } }, 3000);
      return;
    }
    button.disabled = true;
    try {
      const done = await rpc('ck_cancel_leave', { p_id: Number(button.dataset.leaveCancel) || button.dataset.leaveCancel });
      setError(done ? '已撤销这次请假。' : '没有撤销成功（已经过去的请假不能撤销）。', Boolean(done));
    } catch (problem) {
      console.error(problem);
      setError('没有撤销成功，请检查网络后再试一次。');
    }
    loadMine();
  }
  let lastFocus = null;
  function open(options) {
    if (!options || !options.backend || !options.identity || !options.identity.classroom) return;
    ctx = options;
    if (!box) build();
    lastFocus = document.activeElement;
    const form = box.querySelector('[data-leave-form]');
    const day = today();
    form.elements.start.min = shift(day, -7);
    form.elements.start.max = shift(day, 60);
    form.elements.end.min = shift(day, -7);
    form.elements.end.max = shift(day, 60);
    if (!form.elements.start.value) { form.elements.start.value = day; form.elements.end.value = day; }
    const points = ((window.ClassLive && window.ClassLive.LEAVE) || {}).points || 20;
    box.querySelector('[data-leave-who]').textContent = [ctx.identity.name, ctx.identity.sid, ctx.identity.class_name].filter(Boolean).join(' · ');
    box.querySelector('[data-leave-note]').textContent = `请假的那次课计 ${points} 修为（相当于签到）；没有登录也没有请假的课，不得任何修为。`
      + '老师在加入名单的备注里能看到“请假”和你写的原因。还没过完的请假可以撤销。';
    setError('');
    box.hidden = false;
    loadMine();
    setTimeout(() => form.elements.reason.focus(), 30);
  }
  function close() {
    if (!box) return;
    box.hidden = true;
    if (lastFocus && lastFocus.focus && !lastFocus.matches('[data-cl-leave],[data-join-leave-open]')) lastFocus.focus();
    else if (lastFocus && lastFocus.blur) lastFocus.blur();
  }
  window.ClassLeave = { open, close };
})();
