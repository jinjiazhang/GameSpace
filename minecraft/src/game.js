/**
 * game.js - 游戏主类
 * 负责初始化各个子系统、管理游戏主循环
 * 支持浏览器和微信小游戏两种运行环境
 */

import { Vec3, Mat4 } from './math.js';
import { World } from './world.js';
import { Renderer } from './renderer.js';
import { Player, PLAYER_HEIGHT } from './player.js';
import { Input } from './input.js';
import { CHUNK_WIDTH, CHUNK_DEPTH } from './chunk.js';

class Game {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement|object} options.canvas - 画布
   * @param {WebGLRenderingContext} options.gl - WebGL 上下文
   * @param {boolean} options.isWx - 是否微信小游戏
   * @param {number} options.width - 画布宽
   * @param {number} options.height - 画布高
   */
  constructor({ canvas, gl, isWx = false, width = 800, height = 600 }) {
    this.canvas = canvas;
    this.gl = gl;
    this.isWx = isWx;
    this.width = width;
    this.height = height;
    this.running = false;
    this.lastTime = 0;

    // 初始化子系统
    this.world = new World(42);
    this.renderer = new Renderer(gl, width, height);
    this.player = new Player(8, 40, 8);
    this.input = new Input(canvas, isWx);

    // 将玩家放到合适高度
    this._spawnPlayer();

    // FOV
    this.fov = 70 * Math.PI / 180;
    this.near = 0.1;
    this.far = 300;
  }

  /** 在出生点找到地面并放置玩家 */
  _spawnPlayer() {
    const x = 8;
    const z = 8;
    // 先确保出生点附近的区块已加载
    this.world.ensureChunksAround(x, z);
    const h = this.world.getHeight(x, z);
    this.player.position.set(x, h + 2 + PLAYER_HEIGHT, z);
  }

  /** 启动游戏主循环 */
  start() {
    this.running = true;
    this.lastTime = performance.now();
    this._loop();
  }

  /** 停止游戏 */
  stop() {
    this.running = false;
  }

  /** 主循环 */
  _loop() {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // 限制最大帧间隔
    this.lastTime = now;

    this._update(dt);
    this._render();

    // 下一帧
    if (this.isWx) {
      // 微信小游戏使用 requestAnimationFrame
      const wxApi = globalThis.wx;
      wxApi.requestAnimationFrame(() => this._loop());
    } else {
      requestAnimationFrame(() => this._loop());
    }
  }

  /** 更新逻辑 */
  _update(dt) {
    // 输入
    this.input.update(this.player);

    // 玩家物理
    this.player.update(dt, this.world);

    // 确保玩家周围的区块已加载
    this.world.ensureChunksAround(this.player.position.x, this.player.position.z);

    // 重建脏区块的网格
    const dirtyChunks = this.world.getDirtyChunks();
    const getWorldBlock = (wx, wy, wz) => this.world.getBlock(wx, wy, wz);
    for (const chunk of dirtyChunks) {
      const mesh = chunk.buildMesh(getWorldBlock);
      const key = `${chunk.cx},${chunk.cz}`;
      this.renderer.uploadChunkMesh(key, mesh);
    }
  }

  /** 渲染 */
  _render() {
    const viewMatrix = this.player.getViewMatrix();
    const aspect = this.width / this.height;
    const projMatrix = Mat4.perspective(this.fov, aspect, this.near, this.far);
    this.renderer.render(viewMatrix, projMatrix);
  }

  /** 画布大小变更 */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.resize(width, height);
  }
}

export { Game };
