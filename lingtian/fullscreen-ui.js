(function (global) {
  'use strict';

  // Use the document element so the game, dialogs and toast layer stay together.
  // Native fullscreen and orientation locking are optional enhancements: the
  // caller owns the immersive CSS layout, focus and scroll restoration.
  global.createSpiritFullscreenUI = function (options = {}) {
    const document = global.document;
    const target = options.target || document.documentElement;
    const orientation = global.screen?.orientation;
    const persistent = options.persistent === true;
    const listeners = [], nativeListeners = [];
    // Persistent games always keep their CSS layout. Native intent is separate
    // so cancelling a pending browser request still unwinds a late success.
    let active = persistent, nativeWanted = false, destroyed = false, intent = 0, claimed = false, lastNative = false;
    let requestTask = null, exitTask = null, lockTask = null, lockIntent = -1;
    let orientationLocked = false, resizeFrame = 0, settleTimer = 0, lastSnapshot = '';

    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
    const native = () => claimed && fullscreenElement() === target;
    function isPhone() {
      if (typeof options.isPhone === 'function') return !!options.isPhone();
      if (typeof options.isPhone === 'boolean') return options.isPhone;
      const navigator = global.navigator || {}, screen = global.screen || {};
      if (/iPad/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return false;
      const width = screen.width || global.innerWidth || 0, height = screen.height || global.innerHeight || 0;
      return !!(global.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) && Math.min(width, height) > 0 && Math.min(width, height) <= 600;
    }
    function isPortrait() {
      const width = Number(global.innerWidth), height = Number(global.innerHeight);
      if (width > 0 && height > 0) return height > width;
      if (/^(portrait|landscape)/.test(orientation?.type || '')) return orientation.type.startsWith('portrait');
      if (typeof global.orientation === 'number') return Math.abs(global.orientation) % 180 === 0;
      return document.documentElement.clientHeight > document.documentElement.clientWidth;
    }
    function state() {
      return { active: active && !destroyed, native: !destroyed && native(), phonePortrait: active && !destroyed && isPhone() && isPortrait(), orientationLocked: active && !destroyed && orientationLocked };
    }
    function emit() {
      if (destroyed) return;
      const value = state(), snapshot = JSON.stringify(value);
      if (snapshot !== lastSnapshot) { lastSnapshot = snapshot; options.onChange?.(value); }
    }
    function resize() {
      if (destroyed) return;
      emit();
      // 智慧课堂（2026-11-18）：有的手机浏览器转屏后过一会儿才更新窗口宽高；最后一次变化 400ms 后再核对一次横竖
      global.clearTimeout(settleTimer);
      settleTimer = global.setTimeout(() => { settleTimer = 0; if (!destroyed) { emit(); options.onResize?.(); } }, 400);
      if (resizeFrame) return;
      const run = () => { resizeFrame = 0; if (!destroyed) { emit(); options.onResize?.(); } };
      if (typeof global.requestAnimationFrame === 'function') resizeFrame = global.requestAnimationFrame(run);
      else run();
    }
    function listen(node, type, callback, nativeEvent = false) {
      if (!node?.addEventListener) return;
      node.addEventListener(type, callback);
      (nativeEvent ? nativeListeners : listeners).push(() => node.removeEventListener(type, callback));
    }
    function removeNativeListeners() { while (nativeListeners.length) nativeListeners.pop()(); }
    function finishCleanup() {
      // Old WebKit returns no Promise. Keep only its cancellation observer until
      // an in-flight transition finishes (or the bounded fallback timer fires).
      if (destroyed && !requestTask?.legacy && !exitTask?.legacy) removeNativeListeners();
    }
    function unlock(force = false) {
      const needed = force || orientationLocked || !!lockTask;
      orientationLocked = false;
      if (needed) { try { orientation?.unlock?.(); } catch (_) {} }
    }
    function lockLandscape() {
      if (destroyed || !active || !nativeWanted || !native() || exitTask || !isPhone() || typeof orientation?.lock !== 'function' || lockTask || lockIntent === intent) return;
      const task = { intent }; lockTask = task; lockIntent = intent;
      let result;
      try { result = orientation.lock('landscape'); }
      catch (_) { lockTask = null; return; }
      Promise.resolve(result).then(() => {
        if (lockTask !== task) return;
        lockTask = null;
        if (!destroyed && active && nativeWanted && native() && task.intent === intent && !exitTask) orientationLocked = true;
        else unlock(true); // A late lock must not survive exit or destruction.
        emit(); resize(); lockLandscape();
      }, () => {
        if (lockTask !== task) return;
        lockTask = null; orientationLocked = false;
        emit(); resize(); lockLandscape();
      });
    }
    function taskRecord() {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      return { intent, promise, resolve, legacy: false, timer: 0 };
    }
    function clearTimer(task) { if (task?.timer) { global.clearTimeout(task.timer); task.timer = 0; } }
    function syncNative() {
      const current = native(), previous = lastNative;
      lastNative = current;
      if (current) {
        if (destroyed || !nativeWanted) leaveNative();
        else if (!exitTask) lockLandscape();
      } else if (previous) {
        unlock();
        // Persistent games remain in their CSS layout after browser Escape.
        // An older programmatic exit must not cancel a newer native intent.
        if (!exitTask) { nativeWanted = false; if (!persistent) active = false; intent++; }
      }
      emit(); resize();
    }
    function finishRequest(task) {
      if (requestTask !== task) return;
      clearTimer(task); requestTask = null;
      syncNative(); task.resolve(state()); finishCleanup();
    }
    function finishExit(task) {
      if (exitTask !== task) return;
      clearTimer(task);
      syncNative(); // Observe the transition while it is still marked as ours.
      exitTask = null;
      if (!destroyed && native() && !nativeWanted && task.intent === intent) {
        // The browser refused to leave; keep the visible exit control truthful.
        active = true; nativeWanted = true; intent++;
      }
      if (!native() && !requestTask && !nativeWanted) claimed = false;
      lockLandscape(); emit(); resize(); task.resolve(state()); finishCleanup();
    }
    function leaveNative() {
      if (exitTask) return exitTask.promise;
      if (!native()) return Promise.resolve(state());
      const leave = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
      if (typeof leave !== 'function') return Promise.resolve(state());
      const task = taskRecord(); exitTask = task;
      try {
        const result = leave.call(document);
        if (result && typeof result.then === 'function') Promise.resolve(result).then(() => finishExit(task), () => finishExit(task));
        else { task.legacy = true; task.timer = global.setTimeout(() => finishExit(task), 1500); if (!native()) finishExit(task); }
      } catch (_) { finishExit(task); }
      return task.promise;
    }
    function enter() {
      if (destroyed) return Promise.resolve(state());
      if (active && (!persistent || (nativeWanted && (native() || requestTask)))) return requestTask?.promise || Promise.resolve(state());
      active = true; nativeWanted = true; intent++;
      if (fullscreenElement() === target) claimed = true;
      if (!native() && !requestTask && !exitTask) {
        const request = target.requestFullscreen || target.webkitRequestFullscreen || target.webkitRequestFullScreen;
        if (typeof request === 'function') {
          const task = taskRecord(); requestTask = task; claimed = true;
          try {
            // This call stays in the original click stack. Awaiting anything
            // first could consume the browser's transient user activation.
            const result = request.call(target);
            if (result && typeof result.then === 'function') Promise.resolve(result).then(() => finishRequest(task), () => finishRequest(task));
            else { task.legacy = true; task.timer = global.setTimeout(() => finishRequest(task), 1500); if (native()) finishRequest(task); }
          } catch (_) { finishRequest(task); }
        }
      }
      syncNative();
      return requestTask?.promise || Promise.resolve(state());
    }
    function exit() {
      if (nativeWanted || (!persistent && active)) intent++;
      nativeWanted = false;
      if (!persistent) active = false;
      unlock();
      const pendingEntry = requestTask?.promise;
      const pendingExit = leaveNative();
      if (!native() && !requestTask) claimed = false;
      emit(); resize();
      return pendingEntry ? pendingEntry.then(() => exitTask?.promise || state()) : pendingExit;
    }
    function onFullscreenChange() {
      syncNative();
      if (requestTask?.legacy && native()) finishRequest(requestTask);
      if (exitTask?.legacy && !native()) finishExit(exitTask);
    }
    function onFullscreenError(event) {
      if (event?.target && event.target !== target && event.target !== document) return;
      if (requestTask) finishRequest(requestTask);
    }
    function onKeydown(event) {
      if (!active || event.key !== 'Escape' || event.defaultPrevented || document.querySelector?.('dialog[open]')) return;
      exit();
    }
    listen(document, 'fullscreenchange', onFullscreenChange, true);
    listen(document, 'webkitfullscreenchange', onFullscreenChange, true);
    listen(document, 'fullscreenerror', onFullscreenError, true);
    listen(document, 'webkitfullscreenerror', onFullscreenError, true);
    listen(document, 'keydown', onKeydown);
    listen(global, 'resize', resize);
    listen(global, 'orientationchange', resize);
    listen(orientation, 'change', resize);
    listen(global.visualViewport, 'resize', resize);
    listen(global.visualViewport, 'scroll', resize);
    emit();
    return {
      enter, exit, toggle() { return (persistent ? native() || !!requestTask : active) ? exit() : enter(); },
      isActive() { return active && !destroyed; }, isNative() { return !destroyed && native(); },
      destroy() {
        if (destroyed) return;
        active = false; nativeWanted = false; intent++; unlock(); emit();
        destroyed = true;
        const settled = exit();
        while (listeners.length) listeners.pop()();
        if (resizeFrame) global.cancelAnimationFrame?.(resizeFrame);
        global.clearTimeout(settleTimer); settleTimer = 0;
        resizeFrame = 0; finishCleanup();
        return settled;
      }
    };
  };
})(window);
