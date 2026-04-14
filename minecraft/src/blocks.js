/**
 * blocks.js - 方块类型定义
 * 每种方块有 id、name、颜色（用于纹理着色）、是否透明、是否固体
 */

class BlockType {
  /**
   * @param {number} id
   * @param {string} name
   * @param {number[]} color - [r, g, b] 范围 0-1
   * @param {boolean} transparent
   * @param {boolean} solid
   */
  constructor(id, name, color, transparent = false, solid = true) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.transparent = transparent;
    this.solid = solid;
  }
}

/** 方块注册表 */
class BlockRegistry {
  constructor() {
    this._blocks = new Map();
    this._nextId = 0;
  }

  /** 注册一个方块类型 */
  register(name, color, transparent = false, solid = true) {
    const id = this._nextId++;
    const block = new BlockType(id, name, color, transparent, solid);
    this._blocks.set(id, block);
    this[name.toUpperCase()] = id; // 便捷常量 BlockRegistry.GRASS 等
    return id;
  }

  /** 通过 id 获取方块类型 */
  get(id) {
    return this._blocks.get(id);
  }

  /** 是否为空气/空方块 */
  isAir(id) {
    return id === 0;
  }
}

// 创建全局注册表并注册所有方块
const Blocks = new BlockRegistry();

// id=0 预留给空气
Blocks._nextId = 1;
Blocks.AIR = 0;

Blocks.register('GRASS',    [0.36, 0.68, 0.24]);
Blocks.register('DIRT',     [0.55, 0.37, 0.24]);
Blocks.register('STONE',    [0.50, 0.50, 0.50]);
Blocks.register('SAND',     [0.86, 0.82, 0.62]);
Blocks.register('WATER',    [0.20, 0.40, 0.80], true, false);
Blocks.register('WOOD',     [0.55, 0.35, 0.16]);
Blocks.register('LEAVES',   [0.20, 0.55, 0.15], true);
Blocks.register('BEDROCK',  [0.22, 0.22, 0.22]);
Blocks.register('SNOW',     [0.95, 0.95, 0.98]);
Blocks.register('COAL_ORE', [0.30, 0.30, 0.30]);
Blocks.register('IRON_ORE', [0.60, 0.50, 0.40]);

export { Blocks, BlockType, BlockRegistry };
