(() => {
  // Sunset Rally — On-Screen Touch Controls (Virtual D-Pad & A/B Buttons)
  'use strict';

  let initialized = false;
  let isTouch = false;
  let forcedVisible = false;
  let padEnabled = true;

  const STORAGE_KEY = 'sr_touch_pad_enabled';

  const state = {
    left: false,
    right: false,
    up: false,
    down: false,
    shot: false,
    set: false
  };

  const activeDpadTouches = new Set();
  const activeShotTouches = new Set();
  const activeSetTouches = new Set();
  const actionTouchIds = new Set();
  let dpadTouchId = null;

  let mouseActiveDpad = false;
  let mouseActiveShot = false;
  let mouseActiveSet = false;

  let dpadEl = null;
  let containerEl = null;
  let toggleCheckbox = null;
  let btnUp = null;
  let btnDown = null;
  let btnLeft = null;
  let btnRight = null;
  let btnA = null;
  let btnB = null;

  function detectTouchDevice() {
    if (typeof window === 'undefined') return false;
    return Boolean(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
  }

  function updateVisibility() {
    if (!containerEl) return;
    const shouldShow = forcedVisible || isTouch;
    if (shouldShow) {
      containerEl.removeAttribute('hidden');
      document.body?.classList?.add('has-touch-controls');
      applyPadEnabledVisuals();
    } else {
      containerEl.setAttribute('hidden', '');
      document.body?.classList?.remove('has-touch-controls');
    }
  }

  function applyPadEnabledVisuals() {
    if (!containerEl) return;
    containerEl.classList.toggle('is-pad-hidden', !padEnabled);
    if (toggleCheckbox && toggleCheckbox.checked !== padEnabled) {
      toggleCheckbox.checked = padEnabled;
    }
  }

  function setPadEnabled(val, persist = true) {
    padEnabled = Boolean(val);
    applyPadEnabledVisuals();
    if (!padEnabled) {
      resetDpad();
      resetActions();
    }
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, padEnabled ? '1' : '0');
      } catch (_) {}
    }
  }

  function updateDpadVisuals() {
    btnUp?.classList.toggle('is-active', state.up);
    btnDown?.classList.toggle('is-active', state.down);
    btnLeft?.classList.toggle('is-active', state.left);
    btnRight?.classList.toggle('is-active', state.right);
  }

  function updateActionVisuals() {
    btnA?.classList.toggle('is-active', state.shot);
    btnB?.classList.toggle('is-active', state.set);
  }

  function isTouchOverButton(btn, clientX, clientY, marginScale = 1.6) {
    if (!btn || typeof clientX !== 'number' || typeof clientY !== 'number') return false;
    const rect = btn.getBoundingClientRect();
    if (!rect || rect.width <= 0) return true;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.max(rect.width / 2, 24) * marginScale;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    return dist <= radius;
  }

  function handleDpadCoords(clientX, clientY) {
    if (!dpadEl) return;
    const rect = dpadEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const deadzone = rect.width * 0.12;
    const maxRadius = rect.width * 1.8;

    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      state.left = false;
      state.right = false;
      state.up = false;
      state.down = false;
      updateDpadVisuals();
      return;
    }

    state.left = dx < -deadzone;
    state.right = dx > deadzone;
    state.up = dy < -deadzone;
    state.down = dy > deadzone;

    updateDpadVisuals();
  }

  function resetDpad() {
    activeDpadTouches.clear();
    dpadTouchId = null;
    mouseActiveDpad = false;
    state.left = false;
    state.right = false;
    state.up = false;
    state.down = false;
    updateDpadVisuals();
  }

  function resetActions() {
    actionTouchIds.clear();
    activeShotTouches.clear();
    activeSetTouches.clear();
    mouseActiveShot = false;
    mouseActiveSet = false;
    state.shot = false;
    state.set = false;
    updateActionVisuals();
  }

  function syncAllTouches(e) {
    // If no touches exist on screen at all, release everything immediately
    if (!e?.touches || e.touches.length === 0) {
      resetDpad();
      resetActions();
      return;
    }

    // Build set of currently alive touch identifiers
    const aliveIds = new Set();
    for (let i = 0; i < e.touches.length; i++) {
      aliveIds.add(e.touches[i].identifier);
    }

    // Explicitly delete any ended touches reported in changedTouches
    if (e.changedTouches) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const id = e.changedTouches[i].identifier;
        activeDpadTouches.delete(id);
        actionTouchIds.delete(id);
        activeShotTouches.delete(id);
        activeSetTouches.delete(id);
        if (dpadTouchId === id) dpadTouchId = null;
      }
    }

    // Purge any dead touches that are no longer physically on the screen
    for (const id of activeDpadTouches) {
      if (!aliveIds.has(id)) activeDpadTouches.delete(id);
    }
    for (const id of actionTouchIds) {
      if (!aliveIds.has(id)) actionTouchIds.delete(id);
    }
    for (const id of activeShotTouches) {
      if (!aliveIds.has(id)) activeShotTouches.delete(id);
    }
    for (const id of activeSetTouches) {
      if (!aliveIds.has(id)) activeSetTouches.delete(id);
    }

    // If D-Pad touch ended, try to recover from remaining alive D-Pad touch or reset
    if (activeDpadTouches.size === 0) {
      resetDpad();
    } else if (dpadTouchId === null || !aliveIds.has(dpadTouchId)) {
      dpadTouchId = activeDpadTouches.values().next().value ?? null;
      if (dpadTouchId === null) resetDpad();
    }

    // Sync button states
    state.shot = activeShotTouches.size > 0 || mouseActiveShot;
    state.set = activeSetTouches.size > 0 || mouseActiveSet;
    updateActionVisuals();
  }

  function setupDpadEvents() {
    if (!dpadEl) return;

    dpadEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      markTouchDevice();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        activeDpadTouches.add(touch.identifier);
        if (dpadTouchId === null) {
          dpadTouchId = touch.identifier;
          handleDpadCoords(touch.clientX, touch.clientY);
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (dpadTouchId === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === dpadTouchId) {
          e.preventDefault();
          handleDpadCoords(touch.clientX, touch.clientY);
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', syncAllTouches, { passive: false });
    window.addEventListener('touchcancel', syncAllTouches, { passive: false });

    // Fallback mouse/pointer click for testing & desktop inspection
    dpadEl.addEventListener('mousedown', (e) => {
      mouseActiveDpad = true;
      handleDpadCoords(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseActiveDpad) return;
      handleDpadCoords(e.clientX, e.clientY);
    });
    const stopMouse = () => {
      if (mouseActiveDpad) {
        mouseActiveDpad = false;
        if (activeDpadTouches.size === 0) resetDpad();
      }
    };
    window.addEventListener('mouseup', stopMouse);
    window.addEventListener('mouseleave', stopMouse);
  }

  function setupActionEvents() {
    if (!btnA || !btnB) return;

    // Button A (SHOT)
    btnA.addEventListener('touchstart', (e) => {
      e.preventDefault();
      markTouchDevice();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        actionTouchIds.add(touch.identifier);
        activeShotTouches.add(touch.identifier);
      }
      state.shot = true;
      updateActionVisuals();
    }, { passive: false });

    // Button B (SET)
    btnB.addEventListener('touchstart', (e) => {
      e.preventDefault();
      markTouchDevice();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        actionTouchIds.add(touch.identifier);
        activeSetTouches.add(touch.identifier);
      }
      state.set = true;
      updateActionVisuals();
    }, { passive: false });

    // Sliding across or off action buttons
    window.addEventListener('touchmove', (e) => {
      if (actionTouchIds.size === 0) return;
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (actionTouchIds.has(touch.identifier)) {
          const overA = isTouchOverButton(btnA, touch.clientX, touch.clientY);
          const overB = isTouchOverButton(btnB, touch.clientX, touch.clientY);
          if (overA) activeShotTouches.add(touch.identifier); else activeShotTouches.delete(touch.identifier);
          if (overB) activeSetTouches.add(touch.identifier); else activeSetTouches.delete(touch.identifier);
        }
      }
      state.shot = activeShotTouches.size > 0 || mouseActiveShot;
      state.set = activeSetTouches.size > 0 || mouseActiveSet;
      updateActionVisuals();
    }, { passive: false });

    window.addEventListener('touchend', syncAllTouches, { passive: false });
    window.addEventListener('touchcancel', syncAllTouches, { passive: false });

    // Mouse fallback for Button A / B (click/hold)
    btnA.addEventListener('mousedown', (e) => {
      e.preventDefault();
      mouseActiveShot = true;
      state.shot = true;
      updateActionVisuals();
    });
    btnB.addEventListener('mousedown', (e) => {
      e.preventDefault();
      mouseActiveSet = true;
      state.set = true;
      updateActionVisuals();
    });
    const stopActionMouse = () => {
      mouseActiveShot = false;
      mouseActiveSet = false;
      state.shot = activeShotTouches.size > 0;
      state.set = activeSetTouches.size > 0;
      updateActionVisuals();
    };
    window.addEventListener('mouseup', stopActionMouse);
    window.addEventListener('mouseleave', stopActionMouse);
  }

  function setupSafetyHandlers() {
    // Window blur / app switch / tab switch resets all inputs
    window.addEventListener('blur', () => {
      resetDpad();
      resetActions();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        resetDpad();
        resetActions();
      }
    });
    window.addEventListener('pagehide', () => {
      resetDpad();
      resetActions();
    });
    window.addEventListener('pointercancel', () => {
      resetDpad();
      resetActions();
    });
    // Prevent context menu on long-press which can swallow touchend
    containerEl?.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function setupFullscreenScrollPrevention() {
    const isFullscreen = () => {
      const arena = document.querySelector?.('#arena') || document.querySelector?.('.arena');
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) return false;
      return Boolean(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement ||
        (arena && arena.classList?.contains?.('is-fullscreen'))
      );
    };

    const shouldLockScroll = () => {
      if (typeof window.rallyGame?.shouldLockScroll === 'function') {
        return window.rallyGame.shouldLockScroll();
      }
      if (!isFullscreen()) return false;
      const snapshot = window.rallyGame?.snapshot?.();
      if (!snapshot?.running || snapshot?.winner) return false;
      const doc = typeof document !== 'undefined' ? document : null;
      if (doc?.querySelector?.('dialog[open]')) return false;
      const overlay = doc?.querySelector?.('#overlay');
      if (overlay && !overlay.classList?.contains?.('hidden')) return false;
      return true;
    };

    const isInsideDialog = (e) => {
      const target = e?.target;
      return Boolean(target && (target.closest?.('dialog') || target.tagName?.toLowerCase?.() === 'dialog'));
    };

    // Prevent touch scrolling when actively playing in fullscreen arena
    window.addEventListener('touchmove', (e) => {
      if (isInsideDialog(e)) return;
      if (shouldLockScroll()) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent pinch-zoom gesture in fullscreen arena during gameplay
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
      window.addEventListener(name, (e) => {
        if (isInsideDialog(e)) return;
        if (shouldLockScroll()) {
          e.preventDefault();
        }
      }, { passive: false });
    });

    // Prevent double-tap zoom in fullscreen arena during gameplay
    let lastTouchEndTime = 0;
    window.addEventListener('touchend', (e) => {
      if (isInsideDialog(e)) return;
      if (shouldLockScroll()) {
        const now = performance.now();
        if (now - lastTouchEndTime < 350) {
          e.preventDefault();
        }
        lastTouchEndTime = now;
      }
    }, { passive: false });
  }

  function markTouchDevice() {
    if (!isTouch) {
      isTouch = true;
      updateVisibility();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    containerEl = document.querySelector('#touch-controls');
    if (!containerEl) return;

    dpadEl = containerEl.querySelector('#touch-dpad');
    btnUp = containerEl.querySelector('.dpad-up');
    btnDown = containerEl.querySelector('.dpad-down');
    btnLeft = containerEl.querySelector('.dpad-left');
    btnRight = containerEl.querySelector('.dpad-right');
    btnA = containerEl.querySelector('.action-a');
    btnB = containerEl.querySelector('.action-b');
    toggleCheckbox = containerEl.querySelector('#toggle-touch-pad');

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        padEnabled = saved !== '0';
      }
    } catch (_) {}

    if (toggleCheckbox) {
      toggleCheckbox.checked = padEnabled;
      toggleCheckbox.addEventListener('change', () => {
        setPadEnabled(toggleCheckbox.checked, true);
      });
    }

    // First detect touch
    isTouch = detectTouchDevice();
    updateVisibility();

    // Listen to first touch to activate if not detected upfront
    window.addEventListener('touchstart', markTouchDevice, { once: true, passive: true });

    setupDpadEvents();
    setupActionEvents();
    setupSafetyHandlers();
    setupFullscreenScrollPrevention();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  window.touchControls = {
    init,
    read(controller = 1) {
      if (controller !== 1 || !padEnabled) return null;

      // Invariant sanity check: inputs cannot stay active without touches or mouse
      if (activeShotTouches.size === 0 && !mouseActiveShot && state.shot) {
        state.shot = false;
        updateActionVisuals();
      }
      if (activeSetTouches.size === 0 && !mouseActiveSet && state.set) {
        state.set = false;
        updateActionVisuals();
      }
      if (activeDpadTouches.size === 0 && dpadTouchId === null && !mouseActiveDpad) {
        if (state.left || state.right || state.up || state.down) {
          state.left = false;
          state.right = false;
          state.up = false;
          state.down = false;
          updateDpadVisuals();
        }
      }

      const move = (state.right ? 1 : 0) - (state.left ? 1 : 0);
      return {
        move,
        jump: state.up,
        up: state.up,
        down: state.down,
        shot: state.shot,
        set: state.set
      };
    },
    setVisible(val) {
      forcedVisible = Boolean(val);
      updateVisibility();
    },
    isVisible() {
      return !containerEl?.hasAttribute('hidden') && (forcedVisible || isTouch);
    },
    isPadEnabled() {
      return padEnabled;
    },
    setPadEnabled(val) {
      setPadEnabled(val, true);
    },
    getState() {
      return { ...state };
    },
    reset() {
      resetDpad();
      resetActions();
    }
  };
})();
