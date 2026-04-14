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
    document.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      // 按 Escape 解锁指针
      if (e.code === 'Escape' && this.pointerLocked) {
        document.exitPointerLock();
      }
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
  }

  // ---- 微信小游戏触摸输入 ----

  _initWxInput() {
    // 虚拟摇杆状态
    this._joystickX = 0;
    this._joystickY = 0;
    this._joystickTouchId = null;
    this._joystickOriginX = 0;
    this._joystickOriginY = 0;

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
        } else if (this._touchId === null) {
          // 右半屏 - 视角控制
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

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  _updateWx(player) {
    player.inputForward = this._joystickY < -0.2;
    player.inputBackward = this._joystickY > 0.2;
    player.inputLeft = this._joystickX < -0.2;
    player.inputRight = this._joystickX > 0.2;
    player.inputJump = this._joystickY < -0.6; // 向上推摇杆触发跳跃

    player.onMouseMove(this.mouseDX, this.mouseDY);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}

export { Input };
