// Shared state object: the DOM buttons write into it, GameScene reads it
// every frame alongside the keyboard. The game never knows where input
// came from.
export const touchState = {
  moveX: 0,   // -1 to 1 (analog horizontal)
  jump: false,  // held
  fire: false,  // held
};

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Remembers the player's preferred side for the controls. When swapped,
// the action buttons move to the left and the d-pad to the right.
const SWAP_STORAGE_KEY = 'astrohop.controlsSwapped';

function isSwapped() {
  try {
    return localStorage.getItem(SWAP_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function applySwap(swapped) {
  document.getElementById('touch-controls')?.classList.toggle('swapped', swapped);
}

/**
 * Wires the "Swap controls" button so players can flip the d-pad and the
 * action buttons between sides. The choice is saved to localStorage and
 * re-applied on the next load.
 */
export function setupControlsSwap() {
  applySwap(isSwapped());

  document.getElementById('swap-controls')?.addEventListener('click', () => {
    const swapped = !isSwapped();
    applySwap(swapped);
    try {
      localStorage.setItem(SWAP_STORAGE_KEY, swapped ? '1' : '0');
    } catch {
      /* storage unavailable (private mode) — the swap still applies for the session */
    }
  });
}

/**
 * Pointer handling done properly for a virtual gamepad:
 *
 * - every active pointer (finger) is tracked by its pointerId, so any
 *   number of buttons can be held at once (run + jump + fire);
 * - on every pointermove we re-resolve which button is under the finger
 *   (elementFromPoint), so sliding from ◀ to ▶ without lifting works;
 * - a button stays pressed while AT LEAST one finger holds it;
 * - pointer events + touch-action:none = no 300ms delays, no scrolling.
 */
export function setupTouchControls() {
  if (!isTouchDevice()) return;

  document.body.classList.add('touch');

  const container = document.getElementById('touch-controls');
  const baseEl = document.getElementById('joystick-base');
  const knobEl = document.getElementById('joystick-knob');
  const jumpBtn = document.getElementById('btn-jump');
  const fireBtn = document.getElementById('btn-fire');

  // --- Virtual Joystick ---
  class VirtualJoystick {
    constructor(baseEl, knobEl) {
      this.base = baseEl;
      this.knob = knobEl;
      this.radius = baseEl.offsetWidth / 2;
      this.deadZone = 0.15;
      this.pointerId = null;
      this.active = false;
      this.centerX = 0;
      this.centerY = 0;
    }

    activate(pointerId, clientX, clientY) {
      if (this.active) return false;
      this.pointerId = pointerId;
      this.active = true;
      this.setCenter(clientX, clientY);
      this.updateVisualCenter();
      this.knob.style.transform = 'translate(0, 0)';
      this.knob.style.transition = 'none';
      this.base.classList.add('active');
      return true;
    }

    setCenter(clientX, clientY) {
      const baseR = this.base.offsetWidth / 2;
      const margin = 40;
      const maxCenterX = window.innerWidth * 0.35 - baseR - margin;
      this.centerX = Math.max(baseR + margin, Math.min(maxCenterX, clientX));
      this.centerY = Math.max(
        baseR + 40,
        Math.min(window.innerHeight - this.base.offsetWidth / 2 - 40, clientY)
      );
    }

    updateVisualCenter() {
      this.base.style.left = (this.centerX - this.base.offsetWidth / 2) + 'px';
      this.base.style.top = (this.centerY - this.base.offsetHeight / 2) + 'px';
    }

    move(pointerId, clientX, clientY) {
      if (!this.active || pointerId !== this.pointerId) return;

      const dx = clientX - this.centerX;
      const dy = clientY - this.centerY;
      const distance = Math.hypot(dx, dy);
      const maxDist = this.base.offsetWidth / 2;

      let clampedX = dx;
      let clampedY = dy;
      if (distance > maxDist) {
        const ratio = maxDist / distance;
        clampedX = dx * ratio;
        clampedY = dy * ratio;
      }

      this.knob.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

      const magnitude = Math.hypot(clampedX, clampedY) / maxDist;
      const output = this.applyResponseCurve(magnitude);

      if (output === 0) {
        touchState.moveX = 0;
      } else {
        const factor = output / magnitude;
        touchState.moveX = Math.max(-1, Math.min(1, (clampedX / maxDist) * factor));
      }
    }

    applyResponseCurve(magnitude) {
      const deadZone = 0.15;
      if (magnitude < deadZone) return 0;
      const normalized = (magnitude - deadZone) / (1 - deadZone);
      if (normalized < 0.4) return normalized * 0.8;
      if (normalized < 0.8) return 0.32 + (normalized - 0.4) * 1.2;
      return 0.8 + (normalized - 0.8);
    }

    deactivate(pointerId) {
      if (pointerId !== this.pointerId || !this.active) return;
      this.active = false;
      this.pointerId = null;
      this.knob.style.transition = 'transform 100ms ease-out';
      this.knob.style.transform = 'translate(0, 0)';
      touchState.moveX = 0;
      this.base.classList.remove('active');
      setTimeout(() => { this.knob.style.transition = ''; }, 150);
    }
  }

  const joystick = new VirtualJoystick(baseEl, knobEl);

  // --- Trackers ---
  const joystickTracker = { pointerId: null, active: false };
  const jumpTracker = { pointerIds: new Set() };
  const fireTracker = { pointerIds: new Set() };

  // --- Helpers (defined once, before first use) ---
  function isInJoystickZone(x) {
    return x < window.innerWidth * 0.35;
  }

  function getActionButton(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el?.closest('.ctrl');
    if (!btn) return null;
    const key = btn.dataset.key;
    return (key === 'jump' || key === 'fire') ? key : null;
  }

  function capturePointer(pointerId) {
    try { container.setPointerCapture(pointerId); } catch {}
  }

  function releasePointer(pointerId) {
    try {
      if (container.hasPointerCapture(pointerId)) {
        container.releasePointerCapture(pointerId);
      }
    } catch {}
  }

  // State cleanup ONLY - never releases capture, idempotent
  function cleanupPointer(pointerId) {
    if (joystickTracker.pointerId === pointerId) {
      joystick.deactivate(pointerId);
      joystickTracker.active = false;
      joystickTracker.pointerId = null;
      touchState.moveX = 0;
    }
    if (jumpTracker.pointerIds.has(pointerId)) {
      jumpTracker.pointerIds.delete(pointerId);
      if (jumpTracker.pointerIds.size === 0) touchState.jump = false;
    }
    if (fireTracker.pointerIds.has(pointerId)) {
      fireTracker.pointerIds.delete(pointerId);
      if (fireTracker.pointerIds.size === 0) touchState.fire = false;
    }
  }

  // --- Event Listeners (each registered ONCE) ---

  // pointerdown
  container.addEventListener('pointerdown', (e) => {
    e.preventDefault();

    const actionKey = getActionButton(e.clientX, e.clientY);

    // 1. ACTION BUTTONS FIRST
    if (actionKey === 'jump') {
      jumpTracker.pointerIds.add(e.pointerId);
      touchState.jump = true;
      capturePointer(e.pointerId);
      return;
    }
    if (actionKey === 'fire') {
      fireTracker.pointerIds.add(e.pointerId);
      touchState.fire = true;
      capturePointer(e.pointerId);
      return;
    }

    // 2. JOYSTICK ZONE (only if not already active)
    if (!joystickTracker.active && isInJoystickZone(e.clientX)) {
      if (joystick.activate(e.pointerId, e.clientX, e.clientY)) {
        joystickTracker.pointerId = e.pointerId;
        joystickTracker.active = true;
        capturePointer(e.pointerId);
        return;
      }
    }
    // Touch in dead zone → ignore
  });

  // pointermove
  container.addEventListener('pointermove', (e) => {
    if (e.pointerId === joystickTracker.pointerId && joystickTracker.active) {
      joystick.move(e.pointerId, e.clientX, e.clientY);
      return;
    }

    // Button slide-off detection
    for (const [tracker, key] of [[jumpTracker, 'jump'], [fireTracker, 'fire']]) {
      if (tracker.pointerIds.has(e.pointerId)) {
        const btn = getActionButton(e.clientX, e.clientY);
        if (btn !== key) {
          tracker.pointerIds.delete(e.pointerId);
          if (tracker.pointerIds.size === 0) touchState[key] = false;
        }
      }
    }
  });

  // pointerup: cleanup + release
  container.addEventListener('pointerup', (e) => {
    cleanupPointer(e.pointerId);
    releasePointer(e.pointerId);
  });

  // pointercancel: cleanup + release
  container.addEventListener('pointercancel', (e) => {
    cleanupPointer(e.pointerId);
    releasePointer(e.pointerId);
  });

  // lostpointercapture: cleanup ONLY (never release)
  container.addEventListener('lostpointercapture', (e) => {
    cleanupPointer(e.pointerId);
  });
}