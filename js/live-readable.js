/*
 * 字号优化（学生页，2026-10-21 学生反映字太小）：两门课的页面样式都用 px 字号，这里在页面加载时按设备和学生选的档位改写样式表里的字号：
 * 正文按比例放大，小字向下限靠拢，大标题只略放大（免得手机上挤出屏幕）；行高是 px 的按同样比例放大。
 * 档位：0 标准（已比原来大）／1 大／2 特大，存 localStorage classlive-font，各页面、两门课通用；学生面板上的“字号”按钮切换。
 * 样式表的 data-readable：panel＝学生面板（面板宽度固定，倍数温和一些）；skip＝不改（如法宝画面）。原值记在 WeakMap 里，换档时从原值重算。
 * 放在 <head> 末尾同步执行，页面第一次显示时字号就是改好的；之后插入的样式（面板、弹窗）由 MutationObserver 补上。
 * 教师投屏页（课堂版／讲解版，2026-10-21 用户要求“教师投屏的字也调大”）：script 标签带 data-screen="1"，用投屏档位（放得更大、标题也多放大一些），
 * 选择另存 classlive-font-screen（与学生页分开，同一台电脑看学生版测试页不互相影响）；切换按钮在右下角课堂控件条（live-room.js）。
 * 提供 window.ClassReadable：{ LEVELS, screen, level(), set(n), onChange(fn) }。
 */
(function () {
  'use strict';
  const SCREEN = Boolean(document.currentScript && document.currentScript.dataset.screen === '1');
  const KEY = SCREEN ? 'classlive-font-screen' : 'classlive-font';
  const LEVELS = ['标准', '大', '特大'];
  // k：正文放大倍数；floor：小字下限（11px 以下的角标、图标字不拉到下限，只按倍数放大）；
  // cap、ratio：24px 以上的标题最多多放大 cap 的 ratio 倍（学生页手机屏小，标题只略放大；投屏多放大一些）
  const STUDENT = {
    phone: [{ k: 1.06, floor: 14 }, { k: 1.18, floor: 15 }, { k: 1.3, floor: 16 }],
    tablet: [{ k: 1.12, floor: 15 }, { k: 1.24, floor: 16 }, { k: 1.38, floor: 17 }],
    desktop: [{ k: 1.12, floor: 15 }, { k: 1.24, floor: 16 }, { k: 1.38, floor: 17 }],
  };
  const PROJECTOR = [{ k: 1.25, floor: 17, cap: 10, ratio: 0.6 }, { k: 1.4, floor: 19, cap: 16, ratio: 0.6 }, { k: 1.55, floor: 21, cap: 22, ratio: 0.6 }];
  const PROFILE = SCREEN ? { phone: PROJECTOR, tablet: PROJECTOR, desktop: PROJECTOR } : STUDENT;
  const PANEL = SCREEN ? [{ k: 1.1, floor: 14 }, { k: 1.2, floor: 15 }, { k: 1.3, floor: 16 }] : [{ k: 1, floor: 13.5 }, { k: 1.08, floor: 14 }, { k: 1.16, floor: 15 }];
  let level = 0;
  try { level = Math.max(0, Math.min(2, Math.round(Number(localStorage.getItem(KEY)) || 0))); } catch (error) { level = 0; }
  const device = () => (window.matchMedia('(max-width: 699px)').matches ? 'phone'
    : window.matchMedia('(max-width: 1199px)').matches ? 'tablet' : 'desktop');
  let current = device();

  function scale(px, p) {
    let out = px * p.k;
    if (px >= 24) out = px + Math.min(out - px, p.cap || 4) * (p.ratio || 0.5);
    else if (px >= 11 && px < p.floor) out = Math.max(out, px + (p.floor - px) * 0.75);
    return Math.round(out * 2) / 2;
  }
  const num = (text) => Math.round(parseFloat(text) * 2) / 2;
  // font 简写（含 var() 时浏览器不拆成单项）：第一个 px 数值是字号，紧跟“/”的 px 数值是行高
  const FONT_PX = /(^|[\s,])(\d*\.?\d+)px(\s*\/\s*(\d*\.?\d+)px)?/;

  const originals = new WeakMap();
  function processRule(rule, p) {
    const st = rule.style;
    let o = originals.get(rule);
    if (o === undefined) {
      o = { size: st.getPropertyValue('font-size').trim(), sizePrio: st.getPropertyPriority('font-size'),
        lh: st.getPropertyValue('line-height').trim(), lhPrio: st.getPropertyPriority('line-height'),
        font: st.getPropertyValue('font').trim(), fontPrio: st.getPropertyPriority('font') };
      const usable = /^\d*\.?\d+px$/.test(o.size) || (!o.size && FONT_PX.test(o.font));
      originals.set(rule, usable ? o : null);
      if (!usable) return;
    }
    if (!o) return;
    if (/^\d*\.?\d+px$/.test(o.size)) {
      const from = num(o.size);
      const to = scale(from, p);
      st.setProperty('font-size', `${to}px`, o.sizePrio);
      if (/^\d*\.?\d+px$/.test(o.lh)) st.setProperty('line-height', `${Math.round(num(o.lh) * to / from * 2) / 2}px`, o.lhPrio);
      return;
    }
    const value = o.font.replace(FONT_PX, (all, lead, size, slash, lh) => {
      const from = num(size);
      const to = scale(from, p);
      return `${lead}${to}px${slash ? `/${Math.round(num(lh) * to / from * 2) / 2}px` : ''}`;
    });
    st.setProperty('font', value, o.fontPrio);
  }
  function walk(rules, p) {
    for (const rule of Array.from(rules)) {
      if (rule.style && 'selectorText' in rule) processRule(rule, p);
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules, p);
    }
  }
  function applySheet(sheet) {
    const node = sheet && sheet.ownerNode;
    const tag = node && node.dataset ? node.dataset.readable : '';
    if (tag === 'skip') return;
    let rules;
    try { rules = sheet.cssRules; } catch (error) { return; }   // 跨域样式表读不到，跳过
    if (!rules) return;
    walk(rules, tag === 'panel' ? PANEL[level] : PROFILE[current][level]);
  }
  function applyAll() {
    current = device();
    Array.from(document.styleSheets).forEach(applySheet);
    document.documentElement.dataset.font = String(level);
  }

  const listeners = [];
  window.ClassReadable = {
    LEVELS,
    screen: SCREEN,
    level: () => level,
    set(next) {
      level = Math.max(0, Math.min(2, Math.round(Number(next) || 0)));
      try { localStorage.setItem(KEY, String(level)); } catch (error) { /* 无痕模式等存不下时只对本页生效 */ }
      applyAll();
      listeners.forEach((fn) => { try { fn(level); } catch (error) { /* 忽略 */ } });
    },
    onChange(fn) { if (typeof fn === 'function') listeners.push(fn); },
  };

  applyAll();
  // 之后插入或改写的样式（页面后半的 <style>、学生面板、弹窗）：插入时补上
  const pending = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    pending.forEach((node) => { if (node.sheet) applySheet(node.sheet); else if (node.tagName === 'LINK') node.addEventListener('load', () => applySheet(node.sheet), { once: true }); });
    pending.clear();
  };
  new MutationObserver((records) => {
    records.forEach((record) => {
      const target = record.target;
      if (target && target.tagName === 'STYLE') pending.add(target);
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'STYLE' || (node.tagName === 'LINK' && /stylesheet/i.test(node.rel))) pending.add(node);
        else if (node.querySelectorAll) node.querySelectorAll('style, link[rel~="stylesheet"]').forEach((child) => pending.add(child));
      });
    });
    if (pending.size && !queued) { queued = true; Promise.resolve().then(flush); }
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', applyAll);
  window.addEventListener('load', applyAll);
  // 设备类别变了（如手机、iPad 横竖屏切换）就按新类别重算
  ['(max-width: 699px)', '(max-width: 1199px)'].forEach((query) => {
    const media = window.matchMedia(query);
    const onChange = () => { if (device() !== current) applyAll(); };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  });
  window.addEventListener('orientationchange', () => setTimeout(() => { if (device() !== current) applyAll(); }, 300));
})();
