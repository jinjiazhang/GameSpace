/**
 * hud.js - 统一 HUD（浏览器 + 微信小游戏）
 *
 * 接收一个已创建好的离屏 2D Canvas，在其上绘制所有 HUD 元素。
 * 暴露 this.canvas，由 renderer.drawHUD(hud.canvas) 通过 WebGL 纹理叠加到 3D 场景。
 *
 * 接口：
 *   new HUD(canvas)
 *   hud.hideLoading()
 *   hud.update({ pos, fps, cx, cz, isThirdPerson, blockIdx }, input?)
 *   hud.canvas  ← 离屏画布，每帧由 renderer 作为纹理上传
 */

export class HUD {
  /**
   * @param {HTMLCanvasElement|object} canvas - 离屏 2D 画布（浏览器或微信小游戏）
   */
  constructor(canvas, dpr) {
    this.canvas = canvas;
    // dpr：物理像素/逻辑像素比率。浏览器传 window.devicePixelRatio，微信传 pixelRatio
    // input._buildLayout 使用逻辑像素坐标，HUD 绘制也统一用逻辑像素，通过 ctx.scale(dpr) 对齐
    this._dpr   = dpr || 1;
    // width/height 存储逻辑像素（= 物理像素 / dpr）
    this.width  = Math.round(canvas.width  / this._dpr);
    this.height = Math.round(canvas.height / this._dpr);

    this._fontSize = Math.max(14, Math.round(this.width / 35));
    this._padding  = this._fontSize * 0.7;
    this._lineH    = this._fontSize * 1.6;

    this._loading   = true;
    this._loadAlpha = 1.0;
    this._data      = null;
    this._input     = null;

    this._blockNames = ['草地', '泥土', '石头', '木头', '树叶'];

    this._ctx = canvas.getContext('2d');

    // 首帧立即画加载画面（应用 scale 确保坐标一致）
    this._ctx.save();
    this._ctx.scale(this._dpr, this._dpr);
    this._drawLoadingScreen(1.0);
    this._ctx.restore();
  }

  // ── 公共接口 ──────────────────────────────────────────────────

  /** 画布尺寸变更时调用（物理像素尺寸） */
  resize(width, height) {
    this.canvas.width  = width;
    this.canvas.height = height;
    this.width  = Math.round(width  / this._dpr);
    this.height = Math.round(height / this._dpr);
    this._fontSize = Math.max(14, Math.round(this.width / 35));
    this._padding  = this._fontSize * 0.7;
    this._lineH    = this._fontSize * 1.6;
  }

  /** 首帧渲染完成后调用，淡出加载画面 */
  hideLoading() {
    if (!this._loading) return;
    this._loading   = false;
    this._loadAlpha = 1.0;
    this._fadeOutLoading();
  }

  /**
   * 每帧更新 HUD，重绘离屏画布
   * @param {{ pos, fps, cx, cz, isThirdPerson, blockIdx }} data
   * @param {Input|null} input - 传入 input 实例，绘制虚拟摇杆和按钮（触摸端）
   */
  update(data, input = null) {
    this._data  = data;
    this._input = input;
    this._drawHUD();
  }

  // ── 内部绘制 ──────────────────────────────────────────────────

  _drawHUD() {
    const ctx = this._ctx;
    const dpr = this._dpr;
    const w   = this.width;   // 逻辑像素宽
    const h   = this.height;  // 逻辑像素高
    const fs  = this._fontSize;
    const pad = this._padding;
    const lh  = this._lineH;

    // 先清空物理像素画布，再 scale 切换到逻辑像素坐标系绘制
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    if (this._loading) {
      this._drawLoadingScreen(this._loadAlpha);
      ctx.restore();
      return;
    }
    if (!this._data) {
      ctx.restore();
      return;
    }

    const { pos, fps, cx, cz, isThirdPerson, blockIdx } = this._data;

    // ── 左上角信息面板 ──────────────────────────────────────────
    const lines = [
      `XYZ: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
      `FPS: ${fps}`,
      `区块: (${cx}, ${cz})`,
      `视角: ${isThirdPerson ? '第三人称' : '第一人称'}`,
    ];
    const panelW = fs * 15;
    const panelH = lh * lines.length + pad;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this._roundRect(ctx, pad, pad, panelW, panelH, 8);
    ctx.fill();

    ctx.font         = `${fs}px monospace`;
    ctx.fillStyle    = '#ffffff';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, pad * 2, pad + i * lh + pad * 0.4);
    });

    // ── 准星（仅第一人称）─────────────────────────────────────
    if (!isThirdPerson) {
      const cx2 = w / 2, cy2 = h / 2;
      const cr  = fs * 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth   = Math.max(2, fs * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx2 - cr, cy2); ctx.lineTo(cx2 + cr, cy2);
      ctx.moveTo(cx2, cy2 - cr); ctx.lineTo(cx2, cy2 + cr);
      ctx.stroke();
    }

    // ── 底部快捷栏 ──────────────────────────────────────────────
    const names    = this._blockNames;
    const slotSize = Math.min(fs * 3.2, w / (names.length + 2));
    const slotGap  = slotSize * 0.14;
    const totalW   = names.length * (slotSize + slotGap) - slotGap;
    const barX     = (w - totalW) / 2;
    const barY     = h - slotSize - pad * 2.5;

    for (let i = 0; i < names.length; i++) {
      const sx  = barX + i * (slotSize + slotGap);
      const sel = i === blockIdx;

      ctx.fillStyle = sel ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.5)';
      this._roundRect(ctx, sx, barY, slotSize, slotSize, 5);
      ctx.fill();

      ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = sel ? 2.5 : 1;
      this._roundRect(ctx, sx, barY, slotSize, slotSize, 5);
      ctx.stroke();

      ctx.font         = `${Math.round(fs * 0.72)}px monospace`;
      ctx.fillStyle    = sel ? '#ffff88' : 'rgba(255,255,255,0.55)';
      ctx.textBaseline = 'top';
      ctx.textAlign    = 'left';
      ctx.fillText(`${i + 1}`, sx + slotSize * 0.1, barY + slotSize * 0.08);

      ctx.font         = `bold ${Math.round(fs * 0.68)}px sans-serif`;
      ctx.fillStyle    = sel ? '#ffffff' : 'rgba(255,255,255,0.75)';
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.fillText(names[i], sx + slotSize / 2, barY + slotSize * 0.65);
      ctx.textAlign    = 'left';
    }

    // ── 虚拟摇杆 + 按钮（传入 input 时始终显示，不判断触摸设备）──
    if (this._input) {
      this._drawJoystick(ctx);
      this._drawButtons(ctx);
    }

    ctx.restore(); // 恢复 scale 状态
  }

  // ── 虚拟摇杆绘制 ──────────────────────────────────────────────

  _drawJoystick(ctx) {
    const js    = this._input.joystick;
    const baseR = js.radius;
    // 固定圆心：从 input layout 取，保证视觉和命中完全一致
    const layout = this._input.getBtnLayout();
    const baseX  = layout.jsCX;
    const baseY  = layout.jsCY;

    // 底座圆
    ctx.beginPath();
    ctx.arc(baseX, baseY, baseR, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // 方向箭头
    this._drawArrows(ctx, baseX, baseY, baseR);

    // 操纵杆圆（活跃时跟随手指，否则居中）
    let stickX = baseX, stickY = baseY;
    if (js.active) {
      const dx  = js.stickX - js.baseX;
      const dy  = js.stickY - js.baseY;
      const len = Math.sqrt(dx * dx + dy * dy);
      const max = baseR;
      if (len > max) {
        stickX = baseX + dx / len * max;
        stickY = baseY + dy / len * max;
      } else {
        stickX = baseX + dx;
        stickY = baseY + dy;
      }
    }

    const knobR = baseR * 0.46;
    ctx.beginPath();
    ctx.arc(stickX, stickY, knobR, 0, Math.PI * 2);
    ctx.fillStyle   = js.active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  _drawArrows(ctx, cx, cy, r) {
    const size = r * 0.22;
    const dist = r * 0.72;
    const dirs = [
      [0,    -dist,  0           ],  // 上
      [0,     dist,  Math.PI     ],  // 下
      [-dist, 0,    -Math.PI / 2 ],  // 左
      [ dist, 0,     Math.PI / 2 ],  // 右
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (const [dx, dy, angle] of dirs) {
      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0,          -size);
      ctx.lineTo( size * 0.7, size * 0.5);
      ctx.lineTo(-size * 0.7, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 按钮绘制 ──────────────────────────────────────────────────

  _drawButtons(ctx) {
    const layout = this._input.getBtnLayout();
    if (!layout) return;

    const { r, jump, attack, place } = layout;
    const btns = this._input.btns;

    const drawBtn = (btn, pressed, label) => {
      const alpha = pressed ? 0.75 : 0.35;

      ctx.beginPath();
      ctx.arc(btn.x, btn.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = this._colorWithAlpha(btn.color, alpha);
      ctx.fill();
      ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = pressed ? 2.5 : 1.5;
      ctx.stroke();

      // 主标签
      ctx.font         = `bold ${Math.round(r * 0.55)}px sans-serif`;
      ctx.fillStyle    = pressed ? '#ffffff' : 'rgba(255,255,255,0.85)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, btn.x, btn.y);
      ctx.textAlign = 'left';
    };

    drawBtn(jump,   btns.jump,   '跳');
    drawBtn(attack, btns.attack, '挖');
    drawBtn(place,  btns.place,  '放');
  }

  /** 将 #rrggbb 颜色加 alpha 转为 rgba() */
  _colorWithAlpha(hex, alpha) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  // ── 加载画面 ──────────────────────────────────────────────────

  _drawLoadingScreen(alpha) {
    const ctx = this._ctx;
    const w   = this.width;
    const h   = this.height;
    const fs  = this._fontSize * 1.6;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha  = alpha;
    ctx.fillStyle    = 'rgb(20, 48, 20)';
    ctx.fillRect(0, 0, w, h);

    ctx.font         = `bold ${fs * 1.5}px sans-serif`;
    ctx.fillStyle    = '#7ec850';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('我的世界', w / 2, h / 2 - fs * 0.7);

    ctx.font      = `${fs * 0.85}px sans-serif`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('世界生成中...', w / 2, h / 2 + fs * 0.6);

    ctx.globalAlpha = 1.0;
    ctx.textAlign   = 'left';
  }

  _fadeOutLoading() {
    const step = () => {
      this._loadAlpha -= 0.06;
      if (this._loadAlpha <= 0) {
        this._loadAlpha = 0;
        this._ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        return;
      }
      this._ctx.save();
      this._ctx.scale(this._dpr, this._dpr);
      this._drawLoadingScreen(this._loadAlpha);
      this._ctx.restore();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── 工具 ──────────────────────────────────────────────────────

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,     y,     x + r, y,          r);
    ctx.closePath();
  }
}
