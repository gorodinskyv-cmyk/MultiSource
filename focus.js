/*
 * MultiSource Focus Return Lab v0.1 (Android / webOS + Lampa internal player)
 * Independent, opt-in Lampa addon. Core MultiSource 1.3.15 unchanged.
 * MIT; no network or storage. Does NOT intercept remote keys.
 */
(function () {
  'use strict';
  if (window.MultiSourceFocusReturn) return;

  var COMPONENT = 'multi_source_online_v1';
  var state = {
    version: '0.1-test', booted: false, armed: false, external: false,
    closeEvents: 0, resumeEvents: 0, restores: 0, lastResult: 'idle',
    lastController: '', lastTrigger: '', lastError: '', lastPlayAt: 0
  };
  var timers = [];
  var bootTimer = null;
  var bootTries = 0;

  function activeComponent() {
    try {
      var activity = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      return activity && (activity.component || (activity.object && activity.object.component) ||
        (activity.activity && activity.activity.component)) || '';
    } catch (err) { return ''; }
  }
  function visibleView() {
    var root = document.querySelector('.ms-scroll-viewport');
    return !!(root && document.documentElement && document.documentElement.contains(root));
  }
  function openedPlayer() {
    try { return !!(Lampa.Player && typeof Lampa.Player.opened === 'function' && Lampa.Player.opened()); }
    catch (err) { return false; }
  }
  function overlayOpen() {
    try {
      if (Lampa.Select && typeof Lampa.Select.opened === 'function' && Lampa.Select.opened()) return true;
      if (Lampa.Modal && typeof Lampa.Modal.opened === 'function' && Lampa.Modal.opened()) return true;
      if (document.body && /(?:^|\s)(?:selectbox--open|settings--open|modal--open)(?:\s|$)/.test(document.body.className || '')) return true;
    } catch (err) {}
    return false;
  }
  function isVisible() { return !document.hidden && document.visibilityState !== 'hidden'; }
  function removeTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }
  function restore(trigger, forceManual) {
    state.lastTrigger = trigger;
    if (!forceManual && !state.armed) return state.lastResult = 'not-armed';
    if (!isVisible()) return state.lastResult = 'document-hidden';
    if (!window.Lampa || !Lampa.Controller || !Lampa.Activity) return state.lastResult = 'no-lampa';
    if (activeComponent() !== COMPONENT) return state.lastResult = 'outside-multisource';
    if (!visibleView()) return state.lastResult = 'view-detached';
    if (openedPlayer()) return state.lastResult = 'player-open';
    if (overlayOpen()) return state.lastResult = 'overlay-open';
    try {
      var enabled = Lampa.Controller.enabled && Lampa.Controller.enabled();
      var name = enabled && enabled.name || '';
      state.lastController = name;
      // Never steal controller from a real active Select, modal, settings or search panel.
      if (/^(select|modal|settings|search|keyboard|input|player|player-loading)$/.test(name) &&
          name !== 'player' && name !== 'player-loading') return state.lastResult = 'controller-busy:' + name;

      var focused = document.activeElement;
      if (focused && focused.matches && focused.matches('iframe.ms-webframe')) {
        try { focused.blur(); } catch (ignored) {}
      }
      // toggle('content') invokes MultiSource's existing collectionSet/collectionFocus.
      // It also works when active controller *already* has the name 'content'.
      Lampa.Controller.toggle('content');
      state.restores += 1;
      state.armed = false;
      state.external = false;
      return state.lastResult = 'restored';
    } catch (err) {
      state.lastError = String(err && err.message || err).slice(0, 120);
      return state.lastResult = 'exception';
    }
  }
  function schedule(trigger) {
    removeTimers();
    [90, 360, 850, 1600].forEach(function (delay) {
      timers.push(setTimeout(function () {
        if (!state.armed) return;
        var result = restore(trigger, false);
        // Stop retrying only on successful restore or when user has left MultiSource.
        if (result === 'restored' || result === 'outside-multisource') removeTimers();
      }, delay));
    });
  }
  function markPlaying(external) {
    if (activeComponent() !== COMPONENT) return;
    removeTimers();
    state.armed = true;
    state.external = !!external;
    state.lastPlayAt = Date.now();
    state.lastResult = external ? 'external-armed' : 'internal-armed';
  }
  function onClose() {
    if (!state.armed) return;
    state.closeEvents++;
    schedule('player-close');
  }
  function onResume() {
    if (!state.armed || !state.external) return;
    state.resumeEvents++;
    schedule('external-resume');
  }
  function boot() {
    bootTries++;
    if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener ||
        typeof Lampa.Player.listener.follow !== 'function' || !Lampa.Controller || !Lampa.Activity ||
        !document.body) {
      if (bootTries < 180) bootTimer = setTimeout(boot, 500);
      else state.lastResult = 'lampa-api-unavailable';
      return;
    }
    state.booted = true;
    Lampa.Player.listener.follow('start', function () { markPlaying(false); });
    Lampa.Player.listener.follow('external', function () { markPlaying(true); });
    Lampa.Player.listener.follow('close', onClose);
    // An Android external app or webOS native player may return without Player.close.
    window.addEventListener('pageshow', onResume, false);
    window.addEventListener('focus', onResume, false);
    document.addEventListener('visibilitychange', function () { if (isVisible()) onResume(); }, false);
    state.lastResult = 'ready';
  }
  window.MultiSourceFocusReturn = {
    diagnostic: function () { return {
      version: state.version, booted: state.booted, armed: state.armed,
      external: state.external, closeEvents: state.closeEvents,
      resumeEvents: state.resumeEvents, restores: state.restores,
      currentComponent: window.Lampa ? activeComponent() : '',
      controller: state.lastController, lastTrigger: state.lastTrigger,
      lastResult: state.lastResult, lastError: state.lastError
    }; },
    restore: function () { return restore('manual', true); }
  };
  boot();
})();
