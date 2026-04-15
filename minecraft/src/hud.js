/**
 * hud.js - 统一 HUD（浏览器 + 微信小游戏）
 *
 * HUD 只负责在离屏 2D Canvas 上绘制，再由 renderer.drawHUD(hud.canvas)
 * 作为 WebGL 纹理叠加到最终画面。
 */

const BLOCK_NAMES = ['草地', '泥土', '石头', '木头', '树叶'];

class HUD {
  constructor(canvas, dpr = 1) {
    this.canvas = canvas;
    this._dpr = dpr || 1;
    this._ctx = canvas.getContext('2d');

    this.width = Math.round(canvas.width / this._dpr);
    this.height = Math.round(canvas.height / this._dpr);

    this._fontSize = Math.max(14, Math.round(this.width / 35));
    this._padding = this._fontSize * 0.7;
    this._lineH = this._fontSize * 1.6;

    this._loading = true;
    this._loadAlpha = 1.0;
    this._data = null;
    this._input = null;

    this._drawHUD();
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = Math.round(width / this._dpr);
    this.height = Math.round(height / this._dpr);
    this._fontSize = Math.max(14, Math.round(this.width / 35));
    this._padding = this._fontSize * 0.7;
    this._lineH = this._fontSize * 1.6;
  }

  hideLoading() {
    if (!this._loading) return;
    this._loading = false;
    this._loadAlpha = 1.0;
    this._fadeOutLoading();
  }

  update(data, input) {
    this._data = data;
    this._input = input;
    this._drawHUD();
  }

  _drawHUD() {
    const ctx = this._ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    if (this._loading) {
      this._drawLoadingScreen(this._loadAlpha);
      ctx.restore();
      return;
    }

    if (!this._data) {
      ctx.restore();
      return;
    }

    this._drawInfoPanel(ctx);
    if (!this._data.isThirdPerson) this._drawCrosshair(ctx);
    this._drawHotbar(ctx);

    if (this._input) {
      this._drawJoystick(ctx);
      this._drawActions(ctx);
    }

    ctx.restore();
  }

  _drawInfoPanel(ctx) {
    const fs = this._fontSize;
    const pad = this._padding;
    const lh = this._lineH;
    const { pos, fps, cx, cz, isThirdPerson } = this._data;

    const lines = [
      `XYZ: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
      `FPS: ${fps}`,
      `区块: (${cx}, ${cz})`,
      `视角: ${isThirdPerson ? '第三人称' : '第一人称'}`,
    ];

    const width = fs * 15;
    const height = lines.length * lh + pad;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this._roundRect(ctx, pad, pad, width, height, 8);
    ctx.fill();

    ctx.font = `${fs}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    lines.forEach((line, index) => {
      ctx.fillText(line, pad * 2, pad + index * lh + pad * 0.35);
    });
  }

  _drawCrosshair(ctx) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const len = this._fontSize * 0.9;

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - len, cy);
    ctx.lineTo(cx + len, cy);
    ctx.moveTo(cx, cy - len);
    ctx.lineTo(cx, cy + len);
    ctx.stroke();
  }

  _drawHotbar(ctx) {
    const layout = this._input ? this._input.getLayout() : null;
    const slots = layout ? layout.hotbar.slots : this._buildFallbackHotbar();
    const selected = this._data.blockIdx;

    for (const slot of slots) {
      const isSelected = slot.index === selected;
      const x = slot.x;
      const y = slot.y;
      const size = slot.size;

      ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.48)';
      this._roundRect(ctx, x, y, size, size, 6);
      ctx.fill();

      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = isSelected ? 2.5 : 1.2;
      this._roundRect(ctx, x, y, size, size, 6);
      ctx.stroke();

      ctx.font = `${Math.round(size * 0.24)}px monospace`;
      ctx.fillStyle = isSelected ? '#ffee88' : 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(slot.index + 1), x + size * 0.08, y + size * 0.06);

      ctx.font = `bold ${Math.round(size * 0.22)}px sans-serif`;
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.8)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(BLOCK_NAMES[slot.index], x + size / 2, y + size * 0.64);
    }

    ctx.textAlign = 'left';
  }

  _buildFallbackHotbar() {
    const size = Math.round(Math.min(this.width, this.height) * 0.11);
    const gap = Math.round(Math.min(this.width, this.height) * 0.015);
    const total = BLOCK_NAMES.length * size + (BLOCK_NAMES.length - 1) * gap;
    const x = Math.round((this.width - total) / 2);
    const y = Math.round(this.height - size - Math.min(this.width, this.height) * 0.035);

    return BLOCK_NAMES.map((_, index) => ({
      index,
      x: x + index * (size + gap),
      y,
      size,
    }));
  }

  _drawJoystick(ctx) {
    const { joystick } = this._input.getLayout();
    const state = this._input.joystick;
    const baseX = joystick.x;
    const baseY = joystick.y;
    const baseR = joystick.radius;

    ctx.beginPath();
    ctx.arc(baseX, baseY, baseR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 2;
    ctx.stroke();

    this._drawJoystickArrows(ctx, baseX, baseY, baseR);

    const knobX = state.active ? state.stickX : baseX;
    const knobY = state.active ? state.stickY : baseY;
    const knobR = baseR * 0.46;

    ctx.beginPath();
    ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
    ctx.fillStyle = state.active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.26)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.60)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawJoystickArrows(ctx, cx, cy, r) {
    const size = r * 0.2;
    const dist = r * 0.7;
    const dirs = [
      [0, -dist, 0],
      [0, dist, Math.PI],
      [-dist, 0, -Math.PI / 2],
      [dist, 0, Math.PI / 2],
    ];

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    for (const [dx, dy, angle] of dirs) {
      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.72, size * 0.55);
      ctx.lineTo(-size * 0.72, size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawActions(ctx) {
    const { actions } = this._input.getLayout();
    this._drawActionButton(ctx, actions.jump, this._input.btns.jump);
    this._drawActionButton(ctx, actions.attack, this._input.btns.attack);
    this._drawActionButton(ctx, actions.place, this._input.btns.place);
  }

  _drawActionButton(ctx, btn, pressed) {
    const radius = this._input.getLayout().actions.radius;

    ctx.beginPath();
    ctx.arc(btn.x, btn.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = this._colorWithAlpha(btn.color, pressed ? 0.78 : 0.38);
    ctx.fill();
    ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = pressed ? 2.8 : 1.5;
    ctx.stroke();

    ctx.font = `bold ${Math.round(radius * 0.52)}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x, btn.y);
    ctx.textAlign = 'left';
  }

  _colorWithAlpha(hex, alpha) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  _drawLoadingScreen(alpha) {
    const ctx = this._ctx;
    const w = this.width;
    const h = this.height;
    const fs = this._fontSize * 1.6;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(20, 48, 20)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = `bold ${fs * 1.5}px sans-serif`;
    ctx.fillStyle = '#7ec850';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('我的世界', w / 2, h / 2 - fs * 0.7);

    ctx.font = `${fs * 0.85}px sans-serif`;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('世界生成中...', w / 2, h / 2 + fs * 0.6);

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  _fadeOutLoading() {
    const step = () => {
      this._loadAlpha -= 0.06;
      if (this._loadAlpha <= 0) {
        this._loadAlpha = 0;
        this._drawHUD();
        return;
      }
      this._drawHUD();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

export { HUD };
