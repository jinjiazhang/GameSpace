/**
 * world.js - 世界管理与地形生成
 * 管理多个 Chunk，提供方块的全局读写接口
 * 使用 Simplex Noise 生成程序化地形
 */

import { Chunk, CHUNK_WIDTH, CHUNK_HEIGHT, CHUNK_DEPTH } from './chunk.js';
import { Blocks } from './blocks.js';
import { SimplexNoise } from './noise.js';

/** 地形生成参数 */
const TERRAIN_SEA_LEVEL = 20;
const TERRAIN_SCALE = 0.02;     // 噪声缩放
const TERRAIN_HEIGHT = 20;      // 地形振幅
const TERRAIN_OCTAVES = 4;

class World {
  constructor(seed = 42) {
    this.chunks = new Map();  // key: "cx,cz"
    this.noise = new SimplexNoise(seed);
    this.seed = seed;
    this.renderDistance = 4;  // 渲染半径（区块数）
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  /** 获取或创建 Chunk */
  getChunk(cx, cz) {
    const key = this._key(cx, cz);
    if (!this.chunks.has(key)) {
      const chunk = new Chunk(cx, cz);
      this._generateTerrain(chunk);
      this.chunks.set(key, chunk);
    }
    return this.chunks.get(key);
  }

  /** 通过世界坐标获取方块 id */
  getBlock(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_WIDTH);
    const cz = Math.floor(wz / CHUNK_DEPTH);
    const lx = ((wx % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const lz = ((wz % CHUNK_DEPTH) + CHUNK_DEPTH) % CHUNK_DEPTH;
    const chunk = this.chunks.get(this._key(cx, cz));
    if (!chunk) return 0;
    return chunk.getBlock(lx, wy, lz);
  }

  /** 通过世界坐标设置方块 */
  setBlock(wx, wy, wz, blockId) {
    const cx = Math.floor(wx / CHUNK_WIDTH);
    const cz = Math.floor(wz / CHUNK_DEPTH);
    const lx = ((wx % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const lz = ((wz % CHUNK_DEPTH) + CHUNK_DEPTH) % CHUNK_DEPTH;
    const chunk = this.getChunk(cx, cz);
    chunk.setBlock(lx, wy, lz, blockId);
    // 如果修改的是区块边界方块，需标记相邻区块为脏
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_WIDTH - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_DEPTH - 1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const chunk = this.chunks.get(this._key(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  // ---- 地形生成 ----

  /** 为单个 Chunk 生成地形 */
  _generateTerrain(chunk) {
    const ox = chunk.cx * CHUNK_WIDTH;
    const oz = chunk.cz * CHUNK_DEPTH;

    for (let z = 0; z < CHUNK_DEPTH; z++) {
      for (let x = 0; x < CHUNK_WIDTH; x++) {
        const wx = ox + x;
        const wz = oz + z;

        // 用分形噪声生成高度
        const n = this.noise.fbm(wx * TERRAIN_SCALE, wz * TERRAIN_SCALE, TERRAIN_OCTAVES);
        const height = Math.floor(TERRAIN_SEA_LEVEL + n * TERRAIN_HEIGHT);
        const clampedHeight = Math.max(1, Math.min(CHUNK_HEIGHT - 1, height));

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let blockId = 0; // 空气

          if (y === 0) {
            blockId = Blocks.BEDROCK;
          } else if (y < clampedHeight - 4) {
            blockId = Blocks.STONE;
          } else if (y < clampedHeight - 1) {
            blockId = Blocks.DIRT;
          } else if (y === clampedHeight - 1) {
            if (clampedHeight < TERRAIN_SEA_LEVEL - 1) {
              blockId = Blocks.SAND;
            } else if (clampedHeight > TERRAIN_SEA_LEVEL + 8) {
              blockId = Blocks.SNOW;
            } else {
              blockId = Blocks.GRASS;
            }
          } else if (y < TERRAIN_SEA_LEVEL && y >= clampedHeight) {
            blockId = Blocks.WATER;
          }

          chunk.setBlock(x, y, z, blockId);
        }

        // 简单的树木生成
        if (clampedHeight >= TERRAIN_SEA_LEVEL && clampedHeight < TERRAIN_SEA_LEVEL + 7) {
          const treeNoise = this.noise.noise2D(wx * 0.5, wz * 0.5);
          if (treeNoise > 0.7 && x > 2 && x < CHUNK_WIDTH - 2 && z > 2 && z < CHUNK_DEPTH - 2) {
            this._placeTree(chunk, x, clampedHeight, z);
          }
        }
      }
    }
    chunk.dirty = true;
  }

  /** 在指定位置放置一棵树 */
  _placeTree(chunk, x, baseY, z) {
    const trunkHeight = 4 + Math.floor(Math.abs(this.noise.noise2D(x, z)) * 2);
    // 树干
    for (let y = 0; y < trunkHeight; y++) {
      chunk.setBlock(x, baseY + y, z, Blocks.WOOD);
    }
    // 树冠
    const leafStart = baseY + trunkHeight - 1;
    for (let dy = 0; dy < 3; dy++) {
      const radius = dy === 2 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx === 0 && dz === 0 && dy < 2) continue; // 树干位置不放叶子
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy < 2) continue; // 去角
          chunk.setBlock(x + dx, leafStart + dy, z + dz, Blocks.LEAVES);
        }
      }
    }
  }

  /** 确保玩家周围的区块已加载 */
  ensureChunksAround(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK_WIDTH);
    const pcz = Math.floor(playerZ / CHUNK_DEPTH);
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        this.getChunk(pcx + dx, pcz + dz);
      }
    }
  }

  /** 获取所有需要重建网格的 Chunk */
  getDirtyChunks() {
    const result = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) result.push(chunk);
    }
    return result;
  }

  /** 获取指定坐标处的地形高度 */
  getHeight(wx, wz) {
    const n = this.noise.fbm(wx * TERRAIN_SCALE, wz * TERRAIN_SCALE, TERRAIN_OCTAVES);
    return Math.max(1, Math.min(CHUNK_HEIGHT - 1, Math.floor(TERRAIN_SEA_LEVEL + n * TERRAIN_HEIGHT)));
  }
}

export { World };
