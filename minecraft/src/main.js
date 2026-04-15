/**
 * main.js - 入口文件
 * 检测运行环境，自动适配浏览器或微信小游戏
 */

import { Game } from './game.js';
import { HUD } from './hud.js';

// ===================== 浏览器环境 =====================

function initBrowser() {
  const document = globalThis.document;
  const window   = globalThis.window;
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('找不到 #gameCanvas');
    return;
  }

  // 全屏适配：统一使用 CSS 逻辑像素，触摸坐标和布局坐标天然一致，无需 DPR 换算
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width  = canvas.width  + 'px';
    canvas.style.height = canvas.height + 'px';
    if (window._game) {
      window._game.resize(canvas.width, canvas.height);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // 获取 WebGL 上下文
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
  });

  if (!gl) {
    document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:40vh">您的浏览器不支持 WebGL</h1>';
    return;
  }

  // 启用 Uint32 索引支持
  const ext = gl.getExtension('OES_element_index_uint');
  if (!ext) {
    console.warn('OES_element_index_uint 不可用，大区块可能无法渲染');
  }

  // 统一 HUD：外部创建离屏 canvas，直接传入；dpr 用于坐标系换算
  const dpr = window.devicePixelRatio || 1;
  const hudCanvas = globalThis.document.createElement('canvas');
  hudCanvas.width  = canvas.width;
  hudCanvas.height = canvas.height;
  const hud = new HUD(hudCanvas, dpr);

  // 创建并启动游戏
  const game = new Game({
    canvas,
    gl,
    isWx: false,
    hud,
    width: canvas.width,
    height: canvas.height,
  });

  window._game = game;
  game.start();
}

// ===================== 微信小游戏环境 =====================

function initWx() {
  const wx = globalThis.wx;

  // 主 WebGL 画布（第一次 createCanvas）
  const canvas = wx.createCanvas();
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    depth: true,
  });

  if (!gl) {
    console.error('微信小游戏 WebGL 初始化失败');
    return;
  }

  gl.getExtension('OES_element_index_uint');

  const info = wx.getSystemInfoSync();
  const pw = info.windowWidth  * (info.pixelRatio || 1);
  const ph = info.windowHeight * (info.pixelRatio || 1);

  canvas.width  = pw;
  canvas.height = ph;

  // 统一 HUD：微信第二次 createCanvas() 返回离屏 2D 画布，直接传入
  const dpr = info.pixelRatio || 1;
  const hudCanvas = wx.createCanvas();
  hudCanvas.width  = pw;
  hudCanvas.height = ph;
  const hud = new HUD(hudCanvas, dpr);

  const game = new Game({
    canvas,
    gl,
    isWx: true,
    hud,
    width: pw,
    height: ph,
  });

  game.start();
}

// ===================== 自动检测环境 =====================

if (globalThis.wx && globalThis.wx.createCanvas) {
  initWx();
} else if (typeof document !== 'undefined') {
  // 等待 DOM 加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowser);
  } else {
    initBrowser();
  }
}
