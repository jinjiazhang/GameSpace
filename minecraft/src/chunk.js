/**
 * chunk.js - 区块数据与网格构建
 * 一个 Chunk 是 16×64×16 的方块区域
 * 负责存储方块数据并生成渲染用的顶点/索引数据
 */

import { Blocks } from './blocks.js';

const CHUNK_WIDTH = 16;   // X 方向
const CHUNK_HEIGHT = 64;  // Y 方向（高度）
const CHUNK_DEPTH = 16;   // Z 方向

/** 6个面的顶点偏移与法线方向 */
const FACE_DEFS = [
  { dir: [0, 1, 0],  corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },   // 顶面 +Y
  { dir: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },   // 底面 -Y
  { dir: [1, 0, 0],  corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },   // 右面 +X
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },   // 左面 -X
  { dir: [0, 0, 1],  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },   // 前面 +Z
  { dir: [0, 0, -1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },   // 后面 -Z
];

class Chunk {
  /**
   * @param {number} cx - 区块 X 坐标
   * @param {number} cz - 区块 Z 坐标
   */
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    // 一维数组存储方块 id
    this.blocks = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT * CHUNK_DEPTH);
    // 渲染网格数据（由 buildMesh 生成）
    this.mesh = null;
    this.dirty = true;
  }

  // ---- 方块读写 ----

  _index(x, y, z) {
    return y * CHUNK_WIDTH * CHUNK_DEPTH + z * CHUNK_WIDTH + x;
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_WIDTH || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_DEPTH) {
      return 0; // 越界当空气
    }
    return this.blocks[this._index(x, y, z)];
  }

  setBlock(x, y, z, blockId) {
    if (x < 0 || x >= CHUNK_WIDTH || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_DEPTH) return;
    this.blocks[this._index(x, y, z)] = blockId;
    this.dirty = true;
  }

  // ---- 网格构建 ----

  /**
   * 构建渲染网格
   * @param {Function} getWorldBlock - (wx, wy, wz) => blockId 获取世界方块
   * @returns {{ positions: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint32Array }}
   */
  buildMesh(getWorldBlock) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];

    const ox = this.cx * CHUNK_WIDTH;
    const oz = this.cz * CHUNK_DEPTH;

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_DEPTH; z++) {
        for (let x = 0; x < CHUNK_WIDTH; x++) {
          const blockId = this.getBlock(x, y, z);
          if (blockId === 0) continue; // 空气不渲染

          const blockType = Blocks.get(blockId);
          if (!blockType) continue;

          for (let f = 0; f < 6; f++) {
            const face = FACE_DEFS[f];
            // 相邻方块的世界坐标
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            // 获取相邻方块（可能跨 Chunk）
            let neighborId;
            if (nx >= 0 && nx < CHUNK_WIDTH && nz >= 0 && nz < CHUNK_DEPTH && ny >= 0 && ny < CHUNK_HEIGHT) {
              neighborId = this.getBlock(nx, ny, nz);
            } else if (ny < 0 || ny >= CHUNK_HEIGHT) {
              neighborId = 0;
            } else {
              neighborId = getWorldBlock(ox + nx, ny, oz + nz);
            }

            // 相邻方块为空气或透明时才绘制此面
            const neighborType = Blocks.get(neighborId);
            if (neighborId !== 0 && neighborType && !neighborType.transparent) continue;

            const vertCount = positions.length / 3;
            // 颜色由片段着色器计算光照，这里只需传原生底色
            const cr = blockType.color[0];
            const cg = blockType.color[1];
            const cb = blockType.color[2];

            for (const corner of face.corners) {
              positions.push(ox + x + corner[0], y + corner[1], oz + z + corner[2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              colors.push(cr, cg, cb);
            }

            // 两个三角形
            indices.push(
              vertCount, vertCount + 1, vertCount + 2,
              vertCount, vertCount + 2, vertCount + 3
            );
          }
        }
      }
    }

    this.mesh = {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: new Uint32Array(indices),
    };
    this.dirty = false;
    return this.mesh;
  }
}

// 导出常量供外部使用
Chunk.WIDTH = CHUNK_WIDTH;
Chunk.HEIGHT = CHUNK_HEIGHT;
Chunk.DEPTH = CHUNK_DEPTH;

export { Chunk, CHUNK_WIDTH, CHUNK_HEIGHT, CHUNK_DEPTH };
