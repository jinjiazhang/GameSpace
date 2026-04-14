/**
 * main.js - 入口文件
 * 检测运行环境，自动适配浏览器或微信小游戏
 */

import { Game } from './game.js';

// ===================== 浏览器环境 =====================

function initBrowser() {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('找不到 #gameCanvas');
    return;
  }

  // 全屏适配
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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

  // 创建并启动游戏
  const game = new Game({
    canvas,
    gl,
    isWx: false,
    width: canvas.width,
    height: canvas.height,
  });

  window._game = game;
  game.start();

  // 显示提示
  const hint = document.getElementById('hint');
  if (hint) {
    hint.style.display = 'block';
    setTimeout(() => { hint.style.opacity = '0'; }, 4000);
    setTimeout(() => { hint.style.display = 'none'; }, 5000);
  }
}

// ===================== 微信小游戏环境 =====================

function initWx() {
  const wx = globalThis.wx;
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
  const game = new Game({
    canvas,
    gl,
    isWx: true,
    width: info.windowWidth * info.pixelRatio,
    height: info.windowHeight * info.pixelRatio,
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
