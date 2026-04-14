/**
 * input.js - 输入抽象层
 * 同时支持浏览器键盘/鼠标和微信小游戏触摸输入
 * 对外提供统一的输入状态接口
 */

class Input {
  /**
   * @param {HTMLElement|object} canvas - 浏览器 canvas 元素或微信小游戏 canvas
   * @param {boolean} isWx - 是否微信小游戏环境
   */
  constructor(canvas, isWx = false) {
    this.canvas = canvas;
    this.isWx = isWx;

    // 鼠标/触摸增量
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;

    // 触摸状态（微信小游戏用）
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._lastTouchX = 0;
    this._lastTouchY = 0;
    this._touchId = null;

    // 鼠标按键
    this._mouseButtons = {};
    this._clickLeft = false;    // 本帧左键按下（破坏方块）
    this._clickRight = false;   // 本帧右键按下（放置方块）

    if (isWx) {
      this._initWxInput();
    } else {
      this._initBrowserInput();
    }
  }

  // ---- 浏览器输入 ----

  _initBrowserInput() {
    const canvas = this.canvas;

    // 键盘
    this._keys = {};
    this._keyPressed = {};  // 单次触发（用于切换方块）
    document.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (!this._keyPressed[e.code]) {
        this._keyPressed[e.code] = true;
      }
      // 按 Escape 解锁指针
      if (e.code === 'Escape' && this.pointerLocked) {
        document.exitPointerLock();
      }
    });
    document.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
      this._keyPressed[e.code] = false;
    });
    document.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });

    // 鼠标锁定
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    // 鼠标按键：左键破坏方块，右键放置方块
    canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this._clickLeft = true;
      if (e.button === 2) this._clickRight = true;
      e.preventDefault();
    });

    // 右键菜单禁用
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- 微信小游戏触摸输入 ----

  _initWxInput() {
    // 虚拟摇杆状态
    this._joystickX = 0;
    this._joystickY = 0;
    this._joystickTouchId = null;
    this._joystickOriginX = 0;
    this._joystickOriginY = 0;
    // 跳跃按钮（右半屏上方区域轻触）
    this._jumpPressed = false;
    this._jumpTouchId = null;

    const wxApi = globalThis.wx;

    wxApi.onTouchStart((e) => {
      for (const touch of e.touches) {
        if (touch.clientX < this.canvas.width / 2) {
          // 左半屏 - 虚拟摇杆
          this._joystickTouchId = touch.identifier;
          this._joystickOriginX = touch.clientX;
          this._joystickOriginY = touch.clientY;
          this._joystickX = 0;
          this._joystickY = 0;
        } else if (touch.clientY < this.canvas.height * 0.5 && this._jumpTouchId === null) {
          // 右半屏上方 - 跳跃按钮
          this._jumpTouchId = touch.identifier;
          this._jumpPressed = true;
        } else if (this._touchId === null) {
          // 右半屏下方 - 视角控制
          this._touchId = touch.identifier;
          this._lastTouchX = touch.clientX;
          this._lastTouchY = touch.clientY;
        }
      }
    });

    wxApi.onTouchMove((e) => {
      for (const touch of e.touches) {
        if (touch.identifier === this._joystickTouchId) {
          // 虚拟摇杆
          const maxDist = 50;
          let dx = touch.clientX - this._joystickOriginX;
          let dy = touch.clientY - this._joystickOriginY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
          }
          this._joystickX = dx / maxDist;
          this._joystickY = dy / maxDist;
        } else if (touch.identifier === this._touchId) {
          // 视角
          this.mouseDX += (touch.clientX - this._lastTouchX) * 1.5;
          this.mouseDY += (touch.clientY - this._lastTouchY) * 1.5;
          this._lastTouchX = touch.clientX;
          this._lastTouchY = touch.clientY;
        }
      }
    });

    const onTouchEnd = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this._joystickTouchId) {
          this._joystickTouchId = null;
          this._joystickX = 0;
          this._joystickY = 0;
        }
        if (touch.identifier === this._touchId) {
          this._touchId = null;
        }
        if (touch.identifier === this._jumpTouchId) {
          this._jumpTouchId = null;
          this._jumpPressed = false;
        }
      }
    };

    wxApi.onTouchEnd(onTouchEnd);
    wxApi.onTouchCancel(onTouchEnd);
  }

  /** 更新玩家输入状态 */
  update(player) {
    if (this.isWx) {
      this._updateWx(player);
    } else {
      this._updateBrowser(player);
    }
  }

  _updateBrowser(player) {
    player.inputForward = !!(this._keys['KeyW'] || this._keys['ArrowUp']);
    player.inputBackward = !!(this._keys['KeyS'] || this._keys['ArrowDown']);
    player.inputLeft = !!(this._keys['KeyA'] || this._keys['ArrowLeft']);
    player.inputRight = !!(this._keys['KeyD'] || this._keys['ArrowRight']);
    player.inputJump = !!(this._keys['Space']);

    // 方块交互
    player.clickLeft = this._clickLeft;
    player.clickRight = this._clickRight;

    // 数字键切换方块（1-5）
    if (this._keyPressed['Digit1']) player.blockSelectKey = 1;
    else if (this._keyPressed['Digit2']) player.blockSelectKey = 2;
    else if (this._keyPressed['Digit3']) player.blockSelectKey = 3;
    else if (this._keyPressed['Digit4']) player.blockSelectKey = 4;
    else if (this._keyPressed['Digit5']) player.blockSelectKey = 5;

    // F 键切换第一/第三人称视角（单次触发）
    player.inputToggleCamera = !!(this._keyPressed['KeyF']);
    if (this._keyPressed['KeyF']) this._keyPressed['KeyF'] = false; // 消费掉，下帧不重复

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;

    // 消费点击事件（每帧只触发一次）
    this._clickLeft = false;
    this._clickRight = false;
  }

  _updateWx(player) {
    player.inputForward = this._joystickY < -0.2;
    player.inputBackward = this._joystickY > 0.2;
    player.inputLeft = this._joystickX < -0.2;
    player.inputRight = this._joystickX > 0.2;
    player.inputJump = this._jumpPressed; // 右上角区域轻触跳跃

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}

export { Input };
