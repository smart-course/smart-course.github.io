/* 校历识别（2026-10-28 用户：“在教师控制台再增加一个查看校历的功能，可以上传每年的校历，在网站中生成，并且自动识别周次和节假日”）
 * 上传校历图片后在浏览器里识别（文字识别用 Tesseract.js，程序和中文字库都放在本站 /js/vendor/tesseract/，不经第三方，图片不离开这台电脑）：
 *   1. 找表格线：深色像素连成长横线、长竖线，横线之间是一周一行，最后 7 列是星期一至星期日，前一列是周次；
 *      “学期”一列里也有横线的位置是学期分界（如春季学期和夏季学期）。
 *   2. 每一格单独放大识别：第一格的日期（如 8/31）定出整张表的日期（之后每格加一天）；格子里是汉字的就是节假日（中秋节、国庆节……）；
 *      每个学期第一行的周次是“零”还是“一”。
 *   3. 整张图识别一遍，从标题读学年和学校，从下方说明读放假起止（××节：××月××日至××月××日）、调休上班补课（××月××日上班，补周×课程）、寒暑假。
 * 识别结果交给 live-planner.js 的校历预览，老师核对、修改后再保存。只在点“上传校历”时才加载本文件和识别程序。
 */
(function (root) {
  'use strict';
  const CN = '零一二三四五六七八九十';
  const cnNumber = (text) => {
    const t = String(text || '').replace(/[^零〇一二三四五六七八九十]/g, '').replace(/〇/g, '零');
    if (!t) return null;
    if (t === '十') return 10;
    if (t.length === 1) return CN.indexOf(t);
    if (t[0] === '十') return 10 + CN.indexOf(t[1]);
    if (t[1] === '十') return CN.indexOf(t[0]) * 10 + (t[2] ? CN.indexOf(t[2]) : 0);
    return null;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // ---------- 找表格线（gray：每像素亮度 0—255，w×h）----------
  function runs(len, dark, gap = 3) {
    // 一行（或一列）里最长的深色连续段（允许 gap 像素的断点）
    let best = 0;
    let start = -1;
    let miss = 0;
    for (let i = 0; i < len; i += 1) {
      if (dark(i)) { if (start < 0) start = i; miss = 0; best = Math.max(best, i - start + 1); } else if (start >= 0) { miss += 1; if (miss > gap) { start = -1; miss = 0; } }
    }
    return best;
  }
  function cluster(list) {
    const out = [];
    list.forEach((v) => { const last = out[out.length - 1]; if (last && v - last.end <= 2) last.end = v; else out.push({ start: v, end: v }); });
    return out.map((g) => Math.round((g.start + g.end) / 2));
  }
  function detectGrid(gray, w, h, threshold = 120) {
    const dark = (x, y) => gray[y * w + x] < threshold;
    const hLines = [];
    for (let y = 0; y < h; y += 1) if (runs(w, (x) => dark(x, y)) >= w * 0.55) hLines.push(y);
    const rowsY = cluster(hLines);
    if (rowsY.length < 4) return null;
    const top = rowsY[0];
    const bottom = rowsY[rowsY.length - 1];
    const vLines = [];
    for (let x = 0; x < w; x += 1) if (runs(bottom - top, (i) => dark(x, top + i)) >= (bottom - top) * 0.3) vLines.push(x);
    const colsX = cluster(vLines);
    if (colsX.length < 9) return null;
    // 最后 8 条竖线围出 7 列（星期一至星期日），再往前一条是“周次”列的左边
    const days = colsX.slice(-8);
    const labelLeft = colsX[colsX.length - 9];
    // 一周一行：行高接近中位数的才算（表头、下方说明框不算）
    const gaps = rowsY.slice(1).map((y, i) => [rowsY[i], y]);
    const heights = gaps.map(([a, b]) => b - a).sort((a, b) => a - b);
    const median = heights[Math.floor(heights.length / 2)];
    const rows = gaps.filter(([a, b]) => Math.abs(b - a - median) <= median * 0.35);
    // 表头（星期一……）是第一个格子行之前的那一行；学期分界：“学期”列里这条横线也是连着的
    const termLeft = colsX[0];
    const termRight = labelLeft;
    const termBreak = (y) => [-1, 0, 1].some((d) => runs(termRight - termLeft, (i) => dark(termLeft + i, y + d), 2) >= (termRight - termLeft) * 0.7);
    return { days, labelLeft, rows, median, termBreak };
  }

  // ---------- 从识别出的文字里读学年、学校、学期名称、放假、调休、寒暑假 ----------
  const squash = (text) => String(text || '').replace(/[ \t　]+/g, '').replace(/[｛{【\[]/g, '(').replace(/[｝}】\]]/g, ')').replace(/（/g, '(').replace(/）/g, ')').replace(/：/g, ':');
  const HOLIDAY_WORDS = [['中秋', '中秋节'], ['国庆', '国庆节'], ['元旦', '元旦'], ['春节', '春节'], ['除夕', '除夕'], ['清明', '清明节'], ['劳动', '劳动节'], ['五一', '劳动节'], ['端午', '端午节'], ['寒假', '寒假'], ['暑假', '暑假']];
  const holidayName = (text) => { const hit = HOLIDAY_WORDS.find(([key]) => text.includes(key)); return hit ? hit[1] : ''; };
  function parseText(raw, fallbackYear) {
    const lines = String(raw || '').split(/\n/).map(squash).filter(Boolean);
    const all = lines.join('\n');
    const yearMatch = /(\d{4})[-—–~]+(\d{4})学?年/.exec(all);
    const y1 = yearMatch ? Number(yearMatch[1]) : fallbackYear;
    const y2 = yearMatch ? Number(yearMatch[2]) : fallbackYear + 1;
    const school = (/^(.{2,20}?)(?:\d{4}[-—–~]+\d{4})/.exec(lines[0] || '') || [])[1] || '';
    const termWords = ((/[(（]([^)）]*学期)[)）]/.exec(all) || [])[1] || '').split(/[、,，和]/).map((t) => t.replace(/学期/, '')).filter(Boolean).map((t) => `${t}学期`);
    // 月份 ≥ 8 归前一年，否则归后一年（一学年跨两个年头）
    const dateOf = (y, m, d) => { const year = y ? Number(y) : (Number(m) >= 8 ? y1 : y2); const dt = new Date(year, Number(m) - 1, Number(d)); return Number.isNaN(dt.getTime()) ? null : ymd(dt); };
    const holidays = [];
    // “寒假：自……起至……止”认错一个字（如“寒公”）也算
    const rangeRe = /([一-龥]{1,4}节|元旦|春节|寒.|暑.)[:：]?(?:自)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[^至]{0,10}至(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g;
    let m;
    while ((m = rangeRe.exec(all))) {
      const name = holidayName(m[1]) || (/^寒/.test(m[1]) ? '寒假' : /^暑/.test(m[1]) ? '暑假' : m[1]);
      const from = dateOf(m[2], m[3], m[4]);
      const to = dateOf(m[5], m[6], m[7]);
      if (from && to && to >= from) holidays.push({ name, from, to, type: /假$/.test(name) ? 'break' : 'off' });
    }
    const workdays = [];
    const workRe = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[^，,。；;]{0,10}?上班[，,]?补(?:周|星期)([一二三四五六日天])/g;
    while ((m = workRe.exec(all))) {
      const date = dateOf(m[1], m[2], m[3]);
      if (date) workdays.push({ date, as: '一二三四五六日天'.indexOf(m[4]) % 7 + 1 || 7 });
    }
    // “××月××日（周一）上课”：学期第 1 周的周一
    const starts = [];
    const startRe = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\(周一\)上课/g;
    while ((m = startRe.exec(all))) { const date = dateOf(m[1], m[2], m[3]); if (date && !starts.includes(date)) starts.push(date); }
    const notes = lines.filter((line) => line.length >= 8 && !/^\[|^\|/.test(line) && /[一-龥]{4,}/.test(line) && !/华东|校历|^\(/.test(line.slice(0, 6)))
      .map((line) => line.replace(/^[▲么全人和凸亡a-zA-Z|[\]\s]+/, ''));
    const zeroWeek = /第零(?:周)?至/.test(all);
    return { y1, y2, school, termWords, holidays, workdays, starts, notes, zeroWeek };
  }

  // ---------- 整张图识别：crop(x, y, w, h, scale, clean) 返回放大后的格子图（clean＝黑白二值化并四周留白），ocr(image, mode) 返回文字 ----------
  // mode：page 整页；digits 只认数字和“/”；holiday 只认节假日用字；label 只认周次的中文数字（参数见下方 OCR_MODES）
  async function recognize({ gray, width, height, crop, ocr, progress = () => {} }) {
    progress(0.05, '识别整张图的文字（标题和说明）');
    const text = await ocr(crop(0, 0, width, height, 1), 'page');
    const info = parseText(text, new Date().getFullYear());
    progress(0.15, '寻找表格');
    const grid = detectGrid(gray, width, height);
    const result = { year: `${info.y1}-${info.y2}`, school: info.school, terms: [], holidays: info.holidays.slice(), workdays: info.workdays.slice(), notes: info.notes, text };
    if (!grid || !grid.rows.length) return { ...result, warning: '没有找到校历表格，只从说明文字里读出了放假和调休；请在下方补上各学期第 1 周的日期。' };
    const termStarts = [0];
    grid.rows.forEach(([a], i) => { if (i > 0 && grid.termBreak(a)) termStarts.push(i); });
    // 认数字用原图放大 3 倍；认汉字（节日、周次）离格线远一点、黑白二值化、四周留白，放大 4 倍（短词才认得出，如“元旦”）
    const cellImage = (c, r, clean) => { const [a, b] = grid.rows[r]; const m = clean ? 4 : 2;
      return crop(grid.days[c] + m, a + m, grid.days[c + 1] - grid.days[c] - 2 * m, b - a - 2 * m, clean ? 4 : 3, clean); };
    // 第一遍：每格只认数字，“月/日”写法的格子投票定出第一格的日期（每格比前一格晚一天）
    const total = grid.rows.length * 7;
    const digits = [];
    for (let r = 0; r < grid.rows.length; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        digits.push((await ocr(cellImage(c, r), 'digits')).replace(/\s+/g, ''));
        progress(0.15 + 0.6 * (digits.length / total), `识别表格日期（${digits.length}/${total} 格）`);
      }
    }
    const votes = new Map();
    digits.forEach((t, i) => {
      const m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return;
      const d = new Date(Number(m[1]) >= 8 ? info.y1 : info.y2, Number(m[1]) - 1, Number(m[2]));
      if (d.getMonth() !== Number(m[1]) - 1) return;
      const key = ymd(addDays(d, -i));
      votes.set(key, (votes.get(key) || 0) + 1);
    });
    const best = Array.from(votes).sort((a, b) => b[1] - a[1])[0];
    let firstDate = best ? new Date(best[0].replace(/-/g, '/')) : null;
    if (!firstDate && info.starts.length) firstDate = new Date(info.starts[0].replace(/-/g, '/'));
    if (!firstDate) return { ...result, warning: '没有认出表格里的日期；请在下方填好各学期第 1 周的日期。' };
    firstDate = addDays(firstDate, -((firstDate.getDay() + 6) % 7));
    // 第二遍：和应有日期对不上的格子，只用节假日用字再认一次，认出节日名称的才算节假日（认错的数字不会被当成节日）
    const odd = digits.map((t, i) => {
      const day = addDays(firstDate, i);
      // 每月 1 日在校历上写成“月/1”（被节日占了时写在下一天，如 10/2、1/2）：只认出“1”的 1 日格子，可能写的是节日
      const md = `${day.getMonth() + 1}/${day.getDate()}`;
      return (day.getDate() === 1 ? t === md : t === String(day.getDate()) || t === md) ? -1 : i;
    }).filter((i) => i >= 0);
    const found = [];
    for (const [k, i] of odd.entries()) {
      // 先用二值化的格子认，认不出再用原图认（两种各有认得出的字）
      let name = holidayName((await ocr(cellImage(i % 7, Math.floor(i / 7), true), 'holiday')).replace(/\s+/g, ''));
      if (!name) name = holidayName((await ocr(cellImage(i % 7, Math.floor(i / 7), false), 'holiday')).replace(/\s+/g, ''));
      progress(0.75 + 0.15 * ((k + 1) / odd.length), '识别节假日');
      if (name) found.push({ name, date: ymd(addDays(firstDate, i)) });
    }
    // 各学期：第一行是第零周还是第一周（周次格子、说明里的“第零至……周”“××月××日（周一）上课”）、行数
    for (let k = 0; k < termStarts.length; k += 1) {
      const from = termStarts[k];
      const to = k + 1 < termStarts.length ? termStarts[k + 1] : grid.rows.length;
      const [a, b] = grid.rows[from];
      const label = cnNumber(await ocr(crop(grid.labelLeft + 4, a + 4, grid.days[0] - grid.labelLeft - 8, b - a - 8, 4, true), 'label'));
      const start = ymd(addDays(firstDate, from * 7));
      const second = ymd(addDays(firstDate, from * 7 + 7));
      const zero = label === 0 || (k === 0 && info.zeroWeek) || (info.starts.includes(second) && !info.starts.includes(start));
      const month = Number(start.slice(5, 7));
      const name = info.termWords[k] || (k > 0 && to - from <= 6 ? '夏季学期' : month >= 8 || month === 1 ? '秋季学期' : '春季学期');
      result.terms.push({ name, start, first: zero ? 0 : 1, weeks: to - from });
    }
    // 表格里标出的节假日：说明里没有起止的，按那一天（或连着的几天）算放假
    found.forEach((item) => {
      if (result.holidays.some((h) => h.type !== 'break' && item.date >= h.from && item.date <= h.to)) return;
      const prev = result.holidays.find((h) => h.name === item.name && ymd(addDays(new Date(h.to.replace(/-/g, '/')), 1)) === item.date);
      if (prev) prev.to = item.date;
      else result.holidays.push({ name: item.name, from: item.date, to: item.date, type: /假$/.test(item.name) ? 'break' : 'off' });
    });
    result.holidays.sort((x, y) => x.from.localeCompare(y.from));
    progress(1, '识别完成');
    return result;
  }
  // 给识别程序的参数（Tesseract：7＝只认一行，3＝自动分版；whitelist＝只认这些字）
  const OCR_MODES = {
    page: { tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' },
    digits: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789/' },
    holiday: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: '中秋国庆元旦春节除夕清明劳动端午寒暑假日' },
    label: { tessedit_pageseg_mode: '7', tessedit_char_whitelist: '零一二三四五六七八九十' },
  };

  const api = { detectGrid, parseText, recognize, cnNumber, OCR_MODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClassLiveCalendarOCR = api;
})(typeof window !== 'undefined' ? window : globalThis);
