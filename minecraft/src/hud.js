/**
 * hud.js - 统一 HUD（浏览器 + 微信小游戏）
 *
 * 接收一个已创建好的 Canvas 2D 离屏画布，在其上绘制所有 HUD 元素。
 * 暴露 this.canvas，由 renderer.drawHUD(hud.canvas) 通过 WebGL 纹理叠加到 3D 场景。
 *
 * 接口：
 *   new HUD(canvas)
 *   hud.hideLoading()
 *   hud.update({ pos, fps, cx, cz, isThirdPerson, blockIdx })
 *   hud.canvas  ← 离屏画布，每帧由 renderer 作为纹理上传
 */

export class HUD {
  /**
   * @param {HTMLCanvasElement|object} canvas - 离屏 2D 画布（浏览器或微信小游戏）
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.width  = canvas.width;
    this.height = canvas.height;

    this._fontSize = Math.max(14, Math.round(this.width / 35));
    this._padding  = this._fontSize * 0.7;
    this._lineH    = this._fontSize * 1.6;

    this._loading   = true;
    this._loadAlpha = 1.0;
    this._data      = null;

    this._blockNames = ['草地', '泥土', '石头', '木头', '树叶'];

    this._ctx = canvas.getContext('2d');

    // 首帧立即画加载画面
    this._drawLoadingScreen(1.0);
  }

  // ── 公共接口 ─────────────────────────────────────────────────

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
   */
  update(data) {
    this._data = data;
    this._drawHUD();
  }

  // ── 内部绘制 ──────────────────────────────────────────────────

  _drawHUD() {
    const ctx = this._ctx;
    const w   = this.width;
    const h   = this.height;
    const fs  = this._fontSize;
    const pad = this._padding;
    const lh  = this._lineH;

    ctx.clearRect(0, 0, w, h);

    if (this._loading) {
      this._drawLoadingScreen(this._loadAlpha);
      return;
    }
    if (!this._data) return;

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

      // 序号
      ctx.font         = `${Math.round(fs * 0.72)}px monospace`;
      ctx.fillStyle    = sel ? '#ffff88' : 'rgba(255,255,255,0.55)';
      ctx.textBaseline = 'top';
      ctx.textAlign    = 'left';
      ctx.fillText(`${i + 1}`, sx + slotSize * 0.1, barY + slotSize * 0.08);

      // 名称
      ctx.font         = `bold ${Math.round(fs * 0.68)}px sans-serif`;
      ctx.fillStyle    = sel ? '#ffffff' : 'rgba(255,255,255,0.75)';
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.fillText(names[i], sx + slotSize / 2, barY + slotSize * 0.65);
      ctx.textAlign    = 'left';
    }
  }

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
        this._ctx.clearRect(0, 0, this.width, this.height);
        return;
      }
      this._drawLoadingScreen(this._loadAlpha);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

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
