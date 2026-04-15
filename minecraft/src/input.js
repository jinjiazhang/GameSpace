/**
 * input.js - 输入抽象层
 *
 * 浏览器：键盘 + 鼠标指针锁定 + 触摸（手机浏览器）
 * 微信小游戏：wx.onTouch* 触摸事件
 *
 * 虚拟摇杆布局（触摸端）：
 *   左侧区域   → 虚拟摇杆（移动）
 *   右侧区域   → 视角拖拽（滑动）
 *   右下按钮区  → 跳跃(A) / 破坏(□) / 放置(△) / 视角切换(F)
 *
 * 向外暴露只读属性（供 HUD 绘制）：
 *   this.joystick   = { active, baseX, baseY, stickX, stickY, radius }
 *   this.btns       = { jump, attack, place, camToggle } (每帧按下状态)
 */

// 按钮布局（相对右下角，单位 px，运行时根据画布尺寸初始化）
const BTN_RADIUS_RATIO  = 0.055;   // 按钮半径 / 画布短边
const BTN_MARGIN_RATIO  = 0.13;    // 距右/下边缘的间距比例
const JOYSTICK_RADIUS   = 60;      // 摇杆底座半径

class Input {
  /**
   * @param {object} canvas  - 主 Canvas（用于尺寸）
   * @param {boolean} isWx   - 是否微信小游戏
   */
  constructor(canvas, isWx = false) {
    this.canvas = canvas;
    this.isWx   = isWx;

    // 视角增量
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;

    // 供 HUD 读取的摇杆状态
    this.joystick = {
      active: false,
      baseX: 0, baseY: 0,     // 底座圆心（首次按下位置）
      stickX: 0, stickY: 0,   // 操纵杆圆心（当前触摸位置，已夹紧）
      radius: JOYSTICK_RADIUS,
    };

    // 供 HUD 读取的按钮状态（每帧）
    this.btns = { jump: false, attack: false, place: false, camToggle: false };

    // 内部触摸 ID
    this._joystickTouchId = null;
    this._lookTouchId     = null;
    this._lastLookX = 0;
    this._lastLookY = 0;

    // 按钮触摸 ID（防多指误触）
    this._btnTouchIds = { jump: null, attack: null, place: null, camToggle: null };

    // 按钮布局（初始化后填入）
    this._btnLayout = null;

    if (isWx) {
      this._initWxInput();
    } else {
      this._initBrowserInput();
    }
  }

  // ────────────────────────────────────────────────────────────
  // 按钮布局计算（触摸端共用）
  // ────────────────────────────────────────────────────────────

  _buildBtnLayout() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const r = Math.round(Math.min(W, H) * BTN_RADIUS_RATIO);
    const m = Math.round(Math.min(W, H) * BTN_MARGIN_RATIO);

    // 右下角 2×2 菱形布局
    //   camToggle(F) 在最右
    //   jump(A)      在最下
    //   attack(□)    在中左
    //   place(△)     在中上
    const cx = W - m - r;
    const cy = H - m - r;
    const gap = r * 2.3;

    return {
      r,
      jump:      { x: cx,        y: cy,        label: 'A',  color: '#44bb44' },
      attack:    { x: cx - gap,  y: cy - r,    label: '□',  color: '#cc4444' },
      place:     { x: cx,        y: cy - gap,  label: '△',  color: '#4488dd' },
      camToggle: { x: cx - r,    y: cy - gap - r, label: 'F', color: '#cc9900' },
    };
  }

  // ────────────────────────────────────────────────────────────
  // 触摸命中测试
  // ────────────────────────────────────────────────────────────

  _hitBtn(tx, ty) {
    if (!this._btnLayout) return null;
    const { r, jump, attack, place, camToggle } = this._btnLayout;
    const hit = (b) => {
      const dx = tx - b.x, dy = ty - b.y;
      return dx * dx + dy * dy <= r * r;
    };
    if (hit(jump))      return 'jump';
    if (hit(attack))    return 'attack';
    if (hit(place))     return 'place';
    if (hit(camToggle)) return 'camToggle';
    return null;
  }

  // ────────────────────────────────────────────────────────────
  // 统一触摸处理（浏览器触摸 + 微信触摸）
  // ────────────────────────────────────────────────────────────

  _onTouchStart(touches) {
    // 延迟初始化按钮布局（等画布尺寸确定后）
    if (!this._btnLayout) this._btnLayout = this._buildBtnLayout();

    for (const t of touches) {
      const tx = t.clientX, ty = t.clientY;
      const W  = this.canvas.width;

      // 先检测按钮区（优先级最高）
      const btn = this._hitBtn(tx, ty);
      if (btn && this._btnTouchIds[btn] === null) {
        this._btnTouchIds[btn] = t.identifier;
        this.btns[btn] = true;
        continue;
      }

      // 左半屏 → 摇杆
      if (tx < W * 0.45 && this._joystickTouchId === null) {
        this._joystickTouchId = t.identifier;
        this.joystick.active = true;
        this.joystick.baseX  = tx;
        this.joystick.baseY  = ty;
        this.joystick.stickX = tx;
        this.joystick.stickY = ty;
        continue;
      }

      // 右侧非按钮区 → 视角拖拽
      if (this._lookTouchId === null) {
        this._lookTouchId = t.identifier;
        this._lastLookX   = tx;
        this._lastLookY   = ty;
      }
    }
  }

  _onTouchMove(touches) {
    for (const t of touches) {
      if (t.identifier === this._joystickTouchId) {
        // 更新摇杆
        const dx  = t.clientX - this.joystick.baseX;
        const dy  = t.clientY - this.joystick.baseY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const max = this.joystick.radius;
        if (len > max) {
          this.joystick.stickX = this.joystick.baseX + dx / len * max;
          this.joystick.stickY = this.joystick.baseY + dy / len * max;
        } else {
          this.joystick.stickX = t.clientX;
          this.joystick.stickY = t.clientY;
        }
      } else if (t.identifier === this._lookTouchId) {
        // 视角
        this.mouseDX += (t.clientX - this._lastLookX) * 1.5;
        this.mouseDY += (t.clientY - this._lastLookY) * 1.5;
        this._lastLookX = t.clientX;
        this._lastLookY = t.clientY;
      }
    }
  }

  _onTouchEnd(touches) {
    for (const t of touches) {
      if (t.identifier === this._joystickTouchId) {
        this._joystickTouchId  = null;
        this.joystick.active   = false;
        this.joystick.stickX   = this.joystick.baseX;
        this.joystick.stickY   = this.joystick.baseY;
      }
      if (t.identifier === this._lookTouchId) {
        this._lookTouchId = null;
      }
      for (const btn of ['jump', 'attack', 'place', 'camToggle']) {
        if (t.identifier === this._btnTouchIds[btn]) {
          this._btnTouchIds[btn] = null;
          this.btns[btn]         = false;
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // 浏览器初始化
  // ────────────────────────────────────────────────────────────

  _initBrowserInput() {
    this._keys       = {};
    this._keyPressed = {};

    const doc = globalThis.document;
    const canvas = this.canvas;

    // 键盘
    doc.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (!this._keyPressed[e.code]) this._keyPressed[e.code] = true;
      if (e.code === 'Escape' && this.pointerLocked) doc.exitPointerLock();
    });
    doc.addEventListener('keyup', (e) => {
      this._keys[e.code]       = false;
      this._keyPressed[e.code] = false;
    });

    // 指针锁
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
    });
    doc.addEventListener('pointerlockchange', () => {
      this.pointerLocked = doc.pointerLockElement === canvas;
    });
    doc.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    // 鼠标按键
    this._mouseClickLeft  = false;
    this._mouseClickRight = false;
    canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this._mouseClickLeft  = true;
      if (e.button === 2) this._mouseClickRight = true;
      e.preventDefault();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触摸（手机浏览器）
    const normTouch = (t) => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onTouchStart(Array.from(e.changedTouches).map(normTouch));
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._onTouchMove(Array.from(e.changedTouches).map(normTouch));
    }, { passive: false });
    canvas.addEventListener('touchend',    (e) => this._onTouchEnd(Array.from(e.changedTouches).map(normTouch)));
    canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(Array.from(e.changedTouches).map(normTouch)));
  }

  // ────────────────────────────────────────────────────────────
  // 微信初始化
  // ────────────────────────────────────────────────────────────

  _initWxInput() {
    const wx = globalThis.wx;
    const normTouch = (t) => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY });

    wx.onTouchStart  ((e) => this._onTouchStart(e.changedTouches.map(normTouch)));
    wx.onTouchMove   ((e) => this._onTouchMove (e.changedTouches.map(normTouch)));
    wx.onTouchEnd    ((e) => this._onTouchEnd  (e.changedTouches.map(normTouch)));
    wx.onTouchCancel ((e) => this._onTouchEnd  (e.changedTouches.map(normTouch)));
  }

  // ────────────────────────────────────────────────────────────
  // 每帧更新玩家输入
  // ────────────────────────────────────────────────────────────

  update(player) {
    if (this.isWx) {
      this._updateTouch(player);
    } else {
      this._updateBrowser(player);
    }
  }

  _updateBrowser(player) {
    const k = this._keys || {};

    // 键盘
    player.inputForward  = !!(k['KeyW'] || k['ArrowUp']);
    player.inputBackward = !!(k['KeyS'] || k['ArrowDown']);
    player.inputLeft     = !!(k['KeyA'] || k['ArrowLeft']);
    player.inputRight    = !!(k['KeyD'] || k['ArrowRight']);
    player.inputJump     = !!(k['Space']);

    // 鼠标交互
    player.clickLeft  = this._mouseClickLeft;
    player.clickRight = this._mouseClickRight;
    this._mouseClickLeft  = false;
    this._mouseClickRight = false;

    // 数字键切换方块（1-5）
    const kp = this._keyPressed || {};
    player.blockSelectKey = 0;
    for (let i = 1; i <= 5; i++) {
      if (kp[`Digit${i}`]) { player.blockSelectKey = i; kp[`Digit${i}`] = false; }
    }

    // F 键切换视角（单次触发）
    player.inputToggleCamera = !!(kp['KeyF']);
    if (kp['KeyF']) kp['KeyF'] = false;

    // 触摸叠加（手机浏览器，摇杆 + 按钮）
    this._applyTouchToPlayer(player);

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  _updateTouch(player) {
    this._applyTouchToPlayer(player);

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /** 将摇杆/按钮状态写入 player（键盘优先叠加，不覆盖已有 true） */
  _applyTouchToPlayer(player) {
    const js = this.joystick;
    if (js.active) {
      const dx = (js.stickX - js.baseX) / js.radius;
      const dy = (js.stickY - js.baseY) / js.radius;
      if (dy < -0.2) player.inputForward  = true;
      if (dy >  0.2) player.inputBackward = true;
      if (dx < -0.2) player.inputLeft     = true;
      if (dx >  0.2) player.inputRight    = true;
    }
    if (this.btns.jump)      player.inputJump           = true;
    if (this.btns.attack)    player.clickLeft            = true;
    if (this.btns.place)     player.clickRight           = true;
    if (this.btns.camToggle) {
      player.inputToggleCamera = true;
      this.btns.camToggle = false; // 单次消费
    }
  }

  /** 返回按钮布局（供 HUD 绘制使用） */
  getBtnLayout() {
    if (!this._btnLayout) this._btnLayout = this._buildBtnLayout();
    return this._btnLayout;
  }
}

export { Input };
