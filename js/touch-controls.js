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

  let dpadTouchId = null;
  let shotTouchId = null;
  let setTouchId = null;

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
      shotTouchId = null;
      setTouchId = null;
      state.shot = false;
      state.set = false;
      updateActionVisuals();
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

  function handleDpadCoords(clientX, clientY) {
    if (!dpadEl) return;
    const rect = dpadEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const deadzone = rect.width * 0.12;

    state.left = dx < -deadzone;
    state.right = dx > deadzone;
    state.up = dy < -deadzone;
    state.down = dy > deadzone;

    updateDpadVisuals();
  }

  function resetDpad() {
    dpadTouchId = null;
    state.left = false;
    state.right = false;
    state.up = false;
    state.down = false;
    updateDpadVisuals();
  }

  function setupDpadEvents() {
    if (!dpadEl) return;

    dpadEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      markTouchDevice();
      if (dpadTouchId === null && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        dpadTouchId = touch.identifier;
        handleDpadCoords(touch.clientX, touch.clientY);
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

    const endDpad = (e) => {
      if (dpadTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === dpadTouchId) {
          resetDpad();
          break;
        }
      }
    };

    window.addEventListener('touchend', endDpad, { passive: false });
    window.addEventListener('touchcancel', endDpad, { passive: false });

    // Fallback mouse/pointer click for testing & desktop inspection
    let mouseActive = false;
    dpadEl.addEventListener('mousedown', (e) => {
      mouseActive = true;
      handleDpadCoords(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseActive) return;
      handleDpadCoords(e.clientX, e.clientY);
    });
    const stopMouse = () => {
      if (mouseActive) {
        mouseActive = false;
        resetDpad();
      }
    };
    window.addEventListener('mouseup', stopMouse);
  }

  function setupActionEvents() {
    if (!btnA || !btnB) return;

    // Button A (SHOT)
    btnA.addEventListener('touchstart', (e) => {
      e.preventDefault();
      markTouchDevice();
      if (e.changedTouches.length > 0) {
        shotTouchId = e.changedTouches[0].identifier;
        state.shot = true;
        updateActionVisuals();
      }
    }, { passive: false });

    const endShot = (e) => {
      if (shotTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === shotTouchId) {
          shotTouchId = null;
          state.shot = false;
          updateActionVisuals();
          break;
        }
      }
    };
    window.addEventListener('touchend', endShot, { passive: false });
    window.addEventListener('touchcancel', endShot, { passive: false });

    // Button B (SET)
    btnB.addEventListener('touchstart', (e) => {
      e.preventDefault();
      markTouchDevice();
      if (e.changedTouches.length > 0) {
        setTouchId = e.changedTouches[0].identifier;
        state.set = true;
        updateActionVisuals();
      }
    }, { passive: false });

    const endSet = (e) => {
      if (setTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === setTouchId) {
          setTouchId = null;
          state.set = false;
          updateActionVisuals();
          break;
        }
      }
    };
    window.addEventListener('touchend', endSet, { passive: false });
    window.addEventListener('touchcancel', endSet, { passive: false });

    // Mouse fallback for Button A / B (click/hold)
    btnA.addEventListener('mousedown', (e) => {
      e.preventDefault();
      state.shot = true;
      updateActionVisuals();
    });
    btnB.addEventListener('mousedown', (e) => {
      e.preventDefault();
      state.set = true;
      updateActionVisuals();
    });
    window.addEventListener('mouseup', () => {
      if (shotTouchId === null && state.shot) {
        state.shot = false;
        updateActionVisuals();
      }
      if (setTouchId === null && state.set) {
        state.set = false;
        updateActionVisuals();
      }
    });
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

    // Prevent touch scrolling when in fullscreen arena
    window.addEventListener('touchmove', (e) => {
      if (isFullscreen()) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent pinch-zoom gesture in fullscreen arena (iOS Safari)
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
      window.addEventListener(name, (e) => {
        if (isFullscreen()) {
          e.preventDefault();
        }
      }, { passive: false });
    });

    // Prevent double-tap zoom in fullscreen arena
    let lastTouchEndTime = 0;
    window.addEventListener('touchend', (e) => {
      if (isFullscreen()) {
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
      shotTouchId = null;
      setTouchId = null;
      state.shot = false;
      state.set = false;
      updateActionVisuals();
    }
  };
})();
