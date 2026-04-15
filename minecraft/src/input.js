/**
 * input.js - 统一输入层
 *
 * 桌面：
 *   - 键盘 WASD / Space / 1-5 / F
 *   - 鼠标锁定后旋转视角，左右键负责挖/放
 *   - 未锁定时可点击 HUD 上的按钮与快捷栏
 *
 * 触摸：
 *   - 左侧区域：虚拟摇杆移动
 *   - 右侧区域：滑动旋转视角
 *   - 右下角三个动作按钮：跳 / 挖 / 放
 *   - 底部快捷栏：点击切换方块
 */

const JOYSTICK_RADIUS_RATIO = 0.095;
const JOYSTICK_CENTER_X_RATIO = 0.18;
const JOYSTICK_CENTER_Y_RATIO = 0.76;
const ACTION_RADIUS_RATIO = 0.062;
const ACTION_MARGIN_RATIO = 0.055;
const ACTION_GAP_RATIO = 0.095;
const HOTBAR_SLOT_RATIO = 0.11;
const HOTBAR_GAP_RATIO = 0.015;
const HOTBAR_BOTTOM_RATIO = 0.035;
const LOOK_SENSITIVITY = 1.5;
const MOVE_DEADZONE = 0.22;
const HOTBAR_COUNT = 5;

class Input {
  constructor(canvas, isWx = false) {
    this.canvas = canvas;
    this.isWx = isWx;

    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;

    this.joystick = {
      active: false,
      baseX: 0,
      baseY: 0,
      stickX: 0,
      stickY: 0,
      radius: 60,
    };

    // 用于 HUD 高亮显示的按钮按下状态
    this.btns = {
      jump: false,
      attack: false,
      place: false,
    };

    // 单帧动作队列，按下时写入，update 时消费
    this._queued = {
      jump: false,
      attack: false,
      place: false,
      blockSelect: 0,
      toggleCamera: false,
    };

    this._keys = {};
    this._keyPressed = {};
    this._mouseLeft = false;
    this._mouseRight = false;
    this._mouseHUDAction = null;

    this._layout = null;
    this._joystickId = null;
    this._lookId = null;
    this._lastLookX = 0;
    this._lastLookY = 0;
    this._btnIds = {
      jump: null,
      attack: null,
      place: null,
    };
    this._hotbarTouchIds = new Set();

    if (isWx) {
      this._initWx();
    } else {
      this._initBrowser();
    }
  }

  resize() {
    this._layout = null;
  }

  getLayout() {
    if (!this._layout) this._layout = this._buildLayout();
    return this._layout;
  }

  // 兼容旧调用
  getBtnLayout() {
    return this.getLayout();
  }

  _getLogicalSize() {
    if (this.isWx) {
      const info = globalThis.wx.getSystemInfoSync();
      return { width: info.windowWidth, height: info.windowHeight };
    }
    const rect = this.canvas.getBoundingClientRect();
    return {
      width: rect.width > 0 ? rect.width : this.canvas.width,
      height: rect.height > 0 ? rect.height : this.canvas.height,
    };
  }

  _buildLayout() {
    const { width: W, height: H } = this._getLogicalSize();
    const S = Math.min(W, H);

    const joystickRadius = Math.round(S * JOYSTICK_RADIUS_RATIO);
    const joystickCenterX = Math.round(W * JOYSTICK_CENTER_X_RATIO);
    const joystickCenterY = Math.round(H * JOYSTICK_CENTER_Y_RATIO);

    const actionRadius = Math.round(S * ACTION_RADIUS_RATIO);
    const actionMargin = Math.round(S * ACTION_MARGIN_RATIO);
    const actionGap = Math.round(S * ACTION_GAP_RATIO * 1.2);

    const slotSize = Math.round(S * HOTBAR_SLOT_RATIO);
    const slotGap = Math.round(S * HOTBAR_GAP_RATIO);
    const hotbarWidth = HOTBAR_COUNT * slotSize + (HOTBAR_COUNT - 1) * slotGap;
    const hotbarX = Math.round((W - hotbarWidth) / 2);
    const hotbarY = Math.round(H - slotSize - S * HOTBAR_BOTTOM_RATIO);

    // 动作按钮布局：
    // - 跳：固定在右下角，最容易盲按
    // - 挖：在跳按钮左侧
    // - 放：在跳按钮上方
    // 同时适当拉大间距，避免三个按钮过于拥挤
    const jumpX = W - actionMargin - actionRadius;
    const jumpY = H - actionMargin - actionRadius;
    const attackX = jumpX - actionGap;
    const attackY = jumpY;
    const placeX = jumpX;
    const placeY = jumpY - actionGap;

    const hotbarSlots = [];
    for (let i = 0; i < HOTBAR_COUNT; i++) {
      hotbarSlots.push({
        index: i,
        x: hotbarX + i * (slotSize + slotGap),
        y: hotbarY,
        size: slotSize,
      });
    }

    const layout = {
      width: W,
      height: H,
      joystick: {
        x: joystickCenterX,
        y: joystickCenterY,
        radius: joystickRadius,
        hitRadius: joystickRadius * 1.75,
      },
      actions: {
        radius: actionRadius,
        jump: {
          x: jumpX,
          y: jumpY,
          label: '跳',
          color: '#44bb44',
        },
        attack: {
          x: attackX,
          y: attackY,
          label: '挖',
          color: '#cc4444',
        },
        place: {
          x: placeX,
          y: placeY,
          label: '放',
          color: '#4488dd',
        },
      },
      hotbar: {
        x: hotbarX,
        y: hotbarY,
        slotSize,
        slotGap,
        slots: hotbarSlots,
      },
    };

    this.joystick.radius = joystickRadius;
    return layout;
  }

  _toCanvas(clientX, clientY) {
    if (this.isWx) {
      return { x: clientX, y: clientY };
    }
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  _hitActionButton(x, y) {
    const { actions } = this.getLayout();
    const names = ['jump', 'attack', 'place'];
    for (const name of names) {
      const btn = actions[name];
      const dx = x - btn.x;
      const dy = y - btn.y;
      if (dx * dx + dy * dy <= actions.radius * actions.radius) {
        return name;
      }
    }
    return null;
  }

  _hitHotbar(x, y) {
    const { hotbar } = this.getLayout();
    for (const slot of hotbar.slots) {
      if (
        x >= slot.x && x <= slot.x + slot.size &&
        y >= slot.y && y <= slot.y + slot.size
      ) {
        return slot.index;
      }
    }
    return -1;
  }

  _inJoystickZone(x, y) {
    const { joystick } = this.getLayout();
    const dx = x - joystick.x;
    const dy = y - joystick.y;
    return dx * dx + dy * dy <= joystick.hitRadius * joystick.hitRadius;
  }

  _beginJoystick(identifier) {
    const { joystick } = this.getLayout();
    this._joystickId = identifier;
    this.joystick.active = true;
    this.joystick.baseX = joystick.x;
    this.joystick.baseY = joystick.y;
    this.joystick.stickX = joystick.x;
    this.joystick.stickY = joystick.y;
  }

  _updateJoystick(x, y) {
    const bx = this.joystick.baseX;
    const by = this.joystick.baseY;
    const dx = x - bx;
    const dy = y - by;
    const len = Math.sqrt(dx * dx + dy * dy);
    const max = this.joystick.radius;

    if (len > max && len > 0.0001) {
      this.joystick.stickX = bx + dx / len * max;
      this.joystick.stickY = by + dy / len * max;
    } else {
      this.joystick.stickX = x;
      this.joystick.stickY = y;
    }
  }

  _queueAction(name) {
    this._queued[name] = true;
    this.btns[name] = true;
  }

  _releaseAction(name) {
    this.btns[name] = false;
  }

  _onTouchStart(touches) {
    const layout = this.getLayout();

    for (const touch of touches) {
      const { x, y } = this._toCanvas(touch.clientX, touch.clientY);

      const hotbarIndex = this._hitHotbar(x, y);
      if (hotbarIndex >= 0) {
        this._queued.blockSelect = hotbarIndex + 1;
        this._hotbarTouchIds.add(touch.identifier);
        continue;
      }

      const btn = this._hitActionButton(x, y);
      if (btn && this._btnIds[btn] === null) {
        this._btnIds[btn] = touch.identifier;
        this._queueAction(btn);
        continue;
      }

      if (x <= layout.width * 0.5 && this._joystickId === null) {
        this._beginJoystick(touch.identifier);
        this._updateJoystick(x, y);
        continue;
      }

      if (this._lookId === null) {
        this._lookId = touch.identifier;
        this._lastLookX = x;
        this._lastLookY = y;
      }
    }
  }

  _onTouchMove(touches) {
    for (const touch of touches) {
      const { x, y } = this._toCanvas(touch.clientX, touch.clientY);

      if (touch.identifier === this._joystickId) {
        this._updateJoystick(x, y);
        continue;
      }

      if (touch.identifier === this._lookId) {
        this.mouseDX += (x - this._lastLookX) * LOOK_SENSITIVITY;
        this.mouseDY += (y - this._lastLookY) * LOOK_SENSITIVITY;
        this._lastLookX = x;
        this._lastLookY = y;
      }
    }
  }

  _onTouchEnd(touches) {
    for (const touch of touches) {
      if (touch.identifier === this._joystickId) {
        this._joystickId = null;
        this.joystick.active = false;
        this.joystick.stickX = this.joystick.baseX;
        this.joystick.stickY = this.joystick.baseY;
      }

      if (touch.identifier === this._lookId) {
        this._lookId = null;
      }

      for (const name of ['jump', 'attack', 'place']) {
        if (touch.identifier === this._btnIds[name]) {
          this._btnIds[name] = null;
          this._releaseAction(name);
        }
      }

      this._hotbarTouchIds.delete(touch.identifier);
    }
  }

  _resetTouchState() {
    this._joystickId = null;
    this._lookId = null;
    this.joystick.active = false;
    this.joystick.stickX = this.joystick.baseX;
    this.joystick.stickY = this.joystick.baseY;
    for (const name of ['jump', 'attack', 'place']) {
      this._btnIds[name] = null;
      this._releaseAction(name);
    }
    this._hotbarTouchIds.clear();
  }

  _initBrowser() {
    const doc = globalThis.document;
    const win = globalThis.window;
    const canvas = this.canvas;

    doc.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (!this._keyPressed[e.code]) this._keyPressed[e.code] = true;
      if (e.code === 'Escape' && this.pointerLocked) doc.exitPointerLock();
    });

    doc.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
      this._keyPressed[e.code] = false;
    });

    doc.addEventListener('pointerlockchange', () => {
      this.pointerLocked = doc.pointerLockElement === canvas;
    });

    doc.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (this.pointerLocked) {
        if (e.button === 0) this._mouseLeft = true;
        if (e.button === 2) this._mouseRight = true;
        e.preventDefault();
        return;
      }

      const { x, y } = this._toCanvas(e.clientX, e.clientY);
      const hotbarIndex = this._hitHotbar(x, y);
      if (hotbarIndex >= 0) {
        this._queued.blockSelect = hotbarIndex + 1;
        e.preventDefault();
        return;
      }

      const btn = this._hitActionButton(x, y);
      if (btn) {
        this._mouseHUDAction = btn;
        this._queueAction(btn);
        e.preventDefault();
        return;
      }

      canvas.requestPointerLock();
    });

    canvas.addEventListener('mouseup', (e) => {
      if (this._mouseHUDAction) {
        this._releaseAction(this._mouseHUDAction);
        this._mouseHUDAction = null;
        e.preventDefault();
      }
      if (this.pointerLocked) {
        this._mouseLeft = false;
        this._mouseRight = false;
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const norm = (t) => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onTouchStart(Array.from(e.changedTouches).map(norm));
    }, { passive: false });

    // move/end/cancel 绑定到 document：
    // 手指拖出 canvas 边界后再松开时，canvas 自己不一定能收到 touchend，
    // 会导致摇杆 identifier 残留，角色持续移动。
    doc.addEventListener('touchmove', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      e.preventDefault();
      this._onTouchMove(Array.from(e.changedTouches).map(norm));
    }, { passive: false });
    doc.addEventListener('touchend', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      this._onTouchEnd(Array.from(e.changedTouches).map(norm));
    }, { passive: false });
    doc.addEventListener('touchcancel', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      this._onTouchEnd(Array.from(e.changedTouches).map(norm));
    }, { passive: false });

    // 浏览器失焦、切标签或系统打断手势时，强制清空触摸状态，避免摇杆残留
    win.addEventListener('blur', () => this._resetTouchState());
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) this._resetTouchState();
    });
  }

  _initWx() {
    const wx = globalThis.wx;
    const norm = (t) => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY });
    wx.onTouchStart((e) => this._onTouchStart(e.changedTouches.map(norm)));
    wx.onTouchMove((e) => this._onTouchMove(e.changedTouches.map(norm)));
    wx.onTouchEnd((e) => this._onTouchEnd(e.changedTouches.map(norm)));
    wx.onTouchCancel((e) => this._onTouchEnd(e.changedTouches.map(norm)));
  }

  update(player) {
    player.inputForward = false;
    player.inputBackward = false;
    player.inputLeft = false;
    player.inputRight = false;
    player.inputJump = false;
    player.clickLeft = false;
    player.clickRight = false;
    player.inputToggleCamera = false;
    player.blockSelectKey = 0;

    if (!this.isWx) this._applyKeyboard(player);
    this._applyTouch(player);

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  _applyKeyboard(player) {
    const k = this._keys;
    const kp = this._keyPressed;

    player.inputForward = !!(k['KeyW'] || k['ArrowUp']);
    player.inputBackward = !!(k['KeyS'] || k['ArrowDown']);
    player.inputLeft = !!(k['KeyA'] || k['ArrowLeft']);
    player.inputRight = !!(k['KeyD'] || k['ArrowRight']);
    player.inputJump = !!k['Space'];

    if (this._mouseLeft) player.clickLeft = true;
    if (this._mouseRight) player.clickRight = true;
    this._mouseLeft = false;
    this._mouseRight = false;

    for (let i = 1; i <= HOTBAR_COUNT; i++) {
      if (kp[`Digit${i}`]) {
        player.blockSelectKey = i;
        kp[`Digit${i}`] = false;
      }
    }

    if (kp['KeyF']) {
      player.inputToggleCamera = true;
      kp['KeyF'] = false;
    }
  }

  _applyTouch(player) {
    const js = this.joystick;
    if (js.active) {
      const dx = (js.stickX - js.baseX) / js.radius;
      const dy = (js.stickY - js.baseY) / js.radius;
      if (dy < -MOVE_DEADZONE) player.inputForward = true;
      if (dy > MOVE_DEADZONE) player.inputBackward = true;
      if (dx < -MOVE_DEADZONE) player.inputLeft = true;
      if (dx > MOVE_DEADZONE) player.inputRight = true;
    }

    if (this._queued.jump) {
      player.inputJump = true;
      this._queued.jump = false;
    }
    if (this._queued.attack) {
      player.clickLeft = true;
      this._queued.attack = false;
    }
    if (this._queued.place) {
      player.clickRight = true;
      this._queued.place = false;
    }
    if (this._queued.toggleCamera) {
      player.inputToggleCamera = true;
      this._queued.toggleCamera = false;
    }
    if (this._queued.blockSelect > 0) {
      player.blockSelectKey = this._queued.blockSelect;
      this._queued.blockSelect = 0;
    }
  }
}

export { Input };
