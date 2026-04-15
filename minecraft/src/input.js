/**
 * input.js - 输入抽象层
 *
 * 桌面浏览器：键盘 + 鼠标指针锁定
 * 触摸端（手机浏览器 / 微信小游戏）：
 *   左半屏     → 随指浮现虚拟摇杆（移动）
 *   右半屏     → 视角拖拽
 *   右下 3 按钮 → 跳跃 / 挖掘（左键）/ 放置（右键）
 *
 * 暴露给 HUD 的属性：
 *   this.joystick   = { active, baseX, baseY, stickX, stickY, radius }
 *   this.btns       = { jump, attack, place }
 *   this.getBtnLayout() → { r, jump, attack, place }
 */

const JOYSTICK_RADIUS  = 0.10;  // 底座半径 / 画布短边
const JOYSTICK_X_RATIO = 0.13;  // 摇杆圆心 X / 画布宽（与 hud.js 保持一致）
const JOYSTICK_Y_RATIO = 0.78;  // 摇杆圆心 Y / 画布高（与 hud.js 保持一致）
const BTN_RADIUS_RATIO = 0.065; // 按钮半径 / 画布短边
const BTN_MARGIN       = 0.06;  // 边距 / 画布短边

class Input {
  constructor(canvas, isWx = false) {
    this.canvas = canvas;
    this.isWx   = isWx;

    // 视角增量（每帧累积，读取后清零）
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;

    // 摇杆状态（供 HUD 绘制）
    this.joystick = {
      active: false,
      baseX: 0, baseY: 0,
      stickX: 0, stickY: 0,
      radius: 60, // 运行时动态计算
    };

    // 按钮状态（供 HUD 绘制 + 游戏逻辑）
    this.btns = { jump: false, attack: false, place: false };

    // 内部触摸追踪
    this._joystickId  = null;
    this._lookId      = null;
    this._lastLookX   = 0;
    this._lastLookY   = 0;
    this._btnIds      = { jump: null, attack: null, place: null };

    // 按钮布局（延迟初始化）
    this._layout = null;

    // 键盘状态（浏览器）
    this._keys       = {};
    this._keyPressed = {};

    // 鼠标按键单帧标记
    this._mouseLeft  = false;
    this._mouseRight = false;
    this._btnMouseKey = null;

    if (isWx) {
      this._initWx();
    } else {
      this._initBrowser();
    }
  }

  // ─── 坐标换算（浏览器端 clientX/Y → canvas 逻辑坐标）──────────────

  _toCanvas(clientX, clientY) {
    if (this.isWx) {
      // 微信端 clientX/Y 已经是 canvas 坐标
      return { x: clientX, y: clientY };
    }
    // 浏览器端：canvas 尺寸 = CSS 逻辑像素，clientX/Y 也是逻辑像素，直接减偏移即可
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  // ─── 按钮布局 ──────────────────────────────────────────────────────

  _buildLayout() {
    // 必须用与 _toCanvas 输出相同坐标系的尺寸（逻辑像素）
    // 浏览器：getBoundingClientRect().width = CSS 逻辑宽度
    // 微信：windowWidth = 逻辑宽度
    let W, H;
    if (this.isWx) {
      const info = globalThis.wx.getSystemInfoSync();
      W = info.windowWidth;
      H = info.windowHeight;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      W = rect.width  > 0 ? rect.width  : this.canvas.width;
      H = rect.height > 0 ? rect.height : this.canvas.height;
    }
    const S = Math.min(W, H);
    const r      = Math.round(S * BTN_RADIUS_RATIO);
    const m      = Math.round(S * BTN_MARGIN);
    const jsR    = Math.round(S * JOYSTICK_RADIUS);
    const gap    = r * 2.5;

    const jsCX = Math.round(W * JOYSTICK_X_RATIO);
    const jsCY = Math.round(H * JOYSTICK_Y_RATIO);

    const jx = W - m - r;
    const jy = H - m - r;

    this.joystick.radius  = jsR;
    this.joystick.centerX = jsCX;
    this.joystick.centerY = jsCY;

    const layout = {
      r, jsR, jsCX, jsCY,
      jump:   { x: jx,       y: jy,       label: '跳', color: '#44bb44' },
      attack: { x: jx - gap, y: jy,       label: '挖', color: '#cc4444' },
      place:  { x: jx,       y: jy - gap, label: '放', color: '#4488dd' },
    };

    // [DEBUG] 打印布局信息（上线前删除）
    console.log(`[Input] buildLayout canvas=${W}x${H} jsCenter=(${jsCX},${jsCY}) jsR=${jsR}`);
    console.log(`[Input] btns jump=(${layout.jump.x},${layout.jump.y}) attack=(${layout.attack.x},${layout.attack.y}) place=(${layout.place.x},${layout.place.y}) r=${r}`);

    return layout;
  }

  _getLayout() {
    if (!this._layout) this._layout = this._buildLayout();
    return this._layout;
  }

  /** 供 HUD 读取按钮布局 */
  getBtnLayout() {
    return this._getLayout();
  }

  /** 画布尺寸变更时必须调用，清除布局缓存 */
  resize() {
    this._layout = null;
  }

  // ─── 触摸命中测试 ──────────────────────────────────────────────────

  _hitBtn(x, y) {
    const L = this._getLayout();
    const { r } = L;
    for (const name of ['jump', 'attack', 'place']) {
      const b  = L[name];
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= r * r) return name;
    }
    return null;
  }

  _inJoystickZone(x, y, L) {
    const dx = x - L.jsCX, dy = y - L.jsCY;
    return dx * dx + dy * dy <= L.jsR * L.jsR * 4;
  }

  // ─── 统一触摸处理 ──────────────────────────────────────────────────

  _onTouchStart(touches) {
    const L = this._getLayout();

    for (const t of touches) {
      const { x, y } = this._toCanvas(t.clientX, t.clientY);

      // 1. 优先检测右下角按钮（最高优先级）
      const btn = this._hitBtn(x, y);
      // [DEBUG]
      console.log(`[Input] touchStart client=(${t.clientX.toFixed(0)},${t.clientY.toFixed(0)}) canvas=(${x.toFixed(0)},${y.toFixed(0)}) hitBtn=${btn} jsZone=${this._inJoystickZone(x,y,L)}`);
      if (btn !== null && this._btnIds[btn] === null) {
        this._btnIds[btn] = t.identifier;
        this.btns[btn]    = true;
        continue;
      }

      // 2. 命中摇杆固定圆内 → 摇杆
      if (this._inJoystickZone(x, y, L) && this._joystickId === null) {
        this._joystickId         = t.identifier;
        this.joystick.active     = true;
        this.joystick.baseX      = L.jsCX;
        this.joystick.baseY      = L.jsCY;
        this.joystick.stickX     = L.jsCX;
        this.joystick.stickY     = L.jsCY;
        continue;
      }

      // 3. 其余区域 → 视角拖拽
      if (this._lookId === null) {
        this._lookId    = t.identifier;
        this._lastLookX = x;
        this._lastLookY = y;
      }
    }
  }

  _onTouchMove(touches) {
    for (const t of touches) {
      const { x, y } = this._toCanvas(t.clientX, t.clientY);

      if (t.identifier === this._joystickId) {
        // 以固定圆心为基准
        const bx  = this.joystick.baseX;
        const by  = this.joystick.baseY;
        const dx  = x - bx;
        const dy  = y - by;
        const len = Math.sqrt(dx * dx + dy * dy);
        const max = this.joystick.radius;
        if (len > max) {
          this.joystick.stickX = bx + dx / len * max;
          this.joystick.stickY = by + dy / len * max;
        } else {
          this.joystick.stickX = x;
          this.joystick.stickY = y;
        }
      } else if (t.identifier === this._lookId) {
        this.mouseDX += (x - this._lastLookX) * 1.5;
        this.mouseDY += (y - this._lastLookY) * 1.5;
        this._lastLookX = x;
        this._lastLookY = y;
      }
    }
  }

  _onTouchEnd(touches) {
    for (const t of touches) {
      if (t.identifier === this._joystickId) {
        this._joystickId     = null;
        this.joystick.active = false;
        this.joystick.stickX = this.joystick.baseX;
        this.joystick.stickY = this.joystick.baseY;
      }
      if (t.identifier === this._lookId) {
        this._lookId = null;
      }
      // 按钮 identifier 解除绑定，btns 状态由 _applyTouch 单帧消费机制控制
      for (const btn of ['jump', 'attack', 'place']) {
        if (t.identifier === this._btnIds[btn]) {
          this._btnIds[btn] = null;
          // 注意：不在这里清零 btns[btn]，由 _applyTouch 在下一帧消费时清零
          // 这样即使 touchend 比 update 先触发，按钮效果也不会丢失
        }
      }
    }
  }

  // ─── 浏览器初始化 ──────────────────────────────────────────────────

  _initBrowser() {
    const doc    = globalThis.document;
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

    // 指针锁定
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
    canvas.addEventListener('mousedown', (e) => {
      if (this.pointerLocked) {
        if (e.button === 0) this._mouseLeft  = true;
        if (e.button === 2) this._mouseRight = true;
        e.preventDefault();
        return;
      }
      // 未锁定时检测虚拟按钮
      const { x, y } = this._toCanvas(e.clientX, e.clientY);
      const btn = this._hitBtn(x, y);
      if (btn) {
        this.btns[btn]    = true;
        this._btnMouseKey = btn;
        e.preventDefault();
      } else {
        canvas.requestPointerLock();
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (this._btnMouseKey) {
        this.btns[this._btnMouseKey] = false;
        this._btnMouseKey = null;
        e.preventDefault();
      }
      if (this.pointerLocked) {
        this._mouseLeft  = false;
        this._mouseRight = false;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触摸（手机浏览器）
    const norm = (t) => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY });
    canvas.addEventListener('touchstart',  (e) => { e.preventDefault(); this._onTouchStart(Array.from(e.changedTouches).map(norm)); }, { passive: false });
    canvas.addEventListener('touchmove',   (e) => { e.preventDefault(); this._onTouchMove (Array.from(e.changedTouches).map(norm)); }, { passive: false });
    canvas.addEventListener('touchend',    (e) => { this._onTouchEnd(Array.from(e.changedTouches).map(norm)); });
    canvas.addEventListener('touchcancel', (e) => { this._onTouchEnd(Array.from(e.changedTouches).map(norm)); });
  }

  // ─── 微信初始化 ────────────────────────────────────────────────────

  _initWx() {
    const wx   = globalThis.wx;
    const norm = (t) => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY });
    wx.onTouchStart  ((e) => this._onTouchStart(e.changedTouches.map(norm)));
    wx.onTouchMove   ((e) => this._onTouchMove (e.changedTouches.map(norm)));
    wx.onTouchEnd    ((e) => this._onTouchEnd  (e.changedTouches.map(norm)));
    wx.onTouchCancel ((e) => this._onTouchEnd  (e.changedTouches.map(norm)));
  }

  // ─── 每帧更新 ──────────────────────────────────────────────────────

  update(player) {
    if (!this.isWx) this._applyKeyboard(player);
    this._applyTouch(player);

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  _applyKeyboard(player) {
    const k  = this._keys       || {};
    const kp = this._keyPressed || {};

    player.inputForward  = !!(k['KeyW'] || k['ArrowUp']);
    player.inputBackward = !!(k['KeyS'] || k['ArrowDown']);
    player.inputLeft     = !!(k['KeyA'] || k['ArrowLeft']);
    player.inputRight    = !!(k['KeyD'] || k['ArrowRight']);
    player.inputJump     = !!(k['Space']);

    player.clickLeft  = this._mouseLeft;
    player.clickRight = this._mouseRight;
    this._mouseLeft   = false;
    this._mouseRight  = false;

    // 数字键切换方块
    player.blockSelectKey = 0;
    for (let i = 1; i <= 5; i++) {
      if (kp[`Digit${i}`]) { player.blockSelectKey = i; kp[`Digit${i}`] = false; }
    }

    // F 键切换视角（单次）
    player.inputToggleCamera = !!(kp['KeyF']);
    if (kp['KeyF']) kp['KeyF'] = false;
  }

  _applyTouch(player) {
    // 摇杆 → 移动方向
    const js = this.joystick;
    if (js.active) {
      const dx = (js.stickX - js.baseX) / js.radius;
      const dy = (js.stickY - js.baseY) / js.radius;
      if (dy < -0.25) player.inputForward  = true;
      if (dy >  0.25) player.inputBackward = true;
      if (dx < -0.25) player.inputLeft     = true;
      if (dx >  0.25) player.inputRight    = true;
    }

    // 触摸按钮（单帧消费，避免持续触摸导致无限触发）
    if (this.btns.jump)   { player.inputJump  = true; this.btns.jump   = false; }
    if (this.btns.attack) { player.clickLeft  = true; this.btns.attack = false; }
    if (this.btns.place)  { player.clickRight = true; this.btns.place  = false; }
  }
}

export { Input };
