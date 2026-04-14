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
import { Blocks } from './blocks.js';

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
    this._frameCount = 0;
    this._fpsTime = 0;
    this._fps = 60;

    // 当前放置的方块类型（可切换）
    this.selectedBlock = Blocks.GRASS;
    this._blockTypes = [Blocks.GRASS, Blocks.DIRT, Blocks.STONE, Blocks.WOOD, Blocks.LEAVES];
    this._blockTypeIndex = 0;

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
    this.world.ensureChunksAround(x, z);

    // 螺旋扩展搜索第一个高于水面的陆地坐标
    let spawnX = x, spawnZ = z;
    outer:
    for (let r = 0; r <= 16; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // 只遍历当前环
          const h = this.world.getHeight(x + dx, z + dz);
          // getHeight 返回的 h 是固体地表顶面 Y
          // 当 h > 20（SEA_LEVEL）时地表在水面以上
          if (h > 20) {
            spawnX = x + dx;
            spawnZ = z + dz;
            break outer;
          }
        }
      }
    }

    const groundY = this.world.getHeight(spawnX, spawnZ);
    // 玩家脚底落在地表上方 1 格，再加上玩家身高偏移
    this.player.position.set(spawnX + 0.5, groundY + 1 + PLAYER_HEIGHT, spawnZ + 0.5);
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

    // 方块交互：破坏/放置
    this._handleBlockInteraction();

    // 数字键切换方块类型
    if (this.player.blockSelectKey > 0) {
      this._blockTypeIndex = this.player.blockSelectKey - 1;
      if (this._blockTypeIndex < this._blockTypes.length) {
        this.selectedBlock = this._blockTypes[this._blockTypeIndex];
      }
      this.player.blockSelectKey = 0;
    }

    // 重建脏区块的网格
    const dirtyChunks = this.world.getDirtyChunks();
    const getWorldBlock = (wx, wy, wz) => this.world.getBlock(wx, wy, wz);
    for (const chunk of dirtyChunks) {
      const mesh = chunk.buildMesh(getWorldBlock);
      const key = `${chunk.cx},${chunk.cz}`;
      this.renderer.uploadChunkMesh(key, mesh);
    }
  }

  /** 处理方块放置/破坏 */
  _handleBlockInteraction() {
    if (!this.player.clickLeft && !this.player.clickRight) return;

    const hit = this.player.raycast(this.world);
    if (!hit) return;

    const [hx, hy, hz] = hit.hit;
    const [nx, ny, nz] = hit.normal;

    if (this.player.clickLeft) {
      // 左键破坏方块
      this.world.setBlock(hx, hy, hz, Blocks.AIR); // 0 = 空气
    } else if (this.player.clickRight) {
      // 右键放置方块（在命中的面法线方向）
      const px = hx + nx;
      const py = hy + ny;
      const pz = hz + nz;
      // 检查是否与玩家位置重叠
      const pPos = this.player.position;
      const feetY = Math.floor(pPos.y - PLAYER_HEIGHT);
      const headY = Math.floor(pPos.y);
      let overlapsPlayer = false;
      for (let y = Math.max(0, feetY); y <= headY; y++) {
        if (Math.floor(pPos.x) === px && y === py && Math.floor(pPos.z) === pz) {
          overlapsPlayer = true;
          break;
        }
      }
      if (!overlapsPlayer) {
        this.world.setBlock(px, py, pz, this.selectedBlock);
      }
    }
  }

  /** 渲染 */
  _render() {
    const viewMatrix = this.player.getViewMatrix();
    const aspect = this.width / this.height;
    const projMatrix = Mat4.perspective(this.fov, aspect, this.near, this.far);
    this.renderer.render(viewMatrix, projMatrix);

    // 更新 HUD
    this._updateHUD();
  }

  /** 更新 HUD 显示 */
  _updateHUD() {
    if (this.isWx) return; // 微信端不使用 DOM HUD

    // FPS 计算
    this._frameCount++;
    const now = performance.now();
    if (now - this._fpsTime >= 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTime = now;
    }

    // 获取 DOM 元素（首次就绪后显示）
    const hud = document.getElementById('hud');
    if (!hud) return;

    // 首次渲染后通知隐藏加载画面
    if (hud.style.display === 'none') {
      hud.style.display = 'block';
      if (window._hideLoading) window._hideLoading();
    }

    const p = this.player.position;
    document.getElementById('hud-pos').textContent =
      `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    document.getElementById('hud-fps').textContent = String(this._fps);

    const cx = Math.floor(p.x / CHUNK_WIDTH);
    const cz = Math.floor(p.z / CHUNK_DEPTH);
    document.getElementById('hud-chunk').textContent = `${cx}, ${cz}`;

    // 更新快捷栏选中状态
    const slots = document.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this._blockTypeIndex);
    });
  }

  /** 画布大小变更 */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.resize(width, height);
  }
}

export { Game };
