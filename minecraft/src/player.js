/**
 * player.js - 玩家与相机系统
 *
 * Player 继承自 HumanoidEntity，专注于：
 *   - 输入状态管理
 *   - 第一/第三人称相机
 *   - 物理模拟（重力、碰撞、水中浮力）
 *   - 射线检测（方块交互）
 *
 * 模型渲染数据由父类 HumanoidEntity.getModelParts() 提供
 * GPU 上传与绘制由 EntityRenderer（entity.js）负责
 */

import { Vec3, Mat4 } from './math.js';
import { Blocks } from './blocks.js';
import { HumanoidEntity } from './entity.js';

// ─── 物理常量 ─────────────────────────────────────────────────────────────────
const MOVE_SPEED       = 6.0;
const SWIM_SPEED       = 4.0;
const MOUSE_SENSITIVITY = 0.002;
const GRAVITY          = -20.0;
const JUMP_SPEED       = 8.0;
const SWIM_JUMP_SPEED  = 6.0;
const WATER_BUOYANCY   = 8.0;
const WATER_DRAG       = 3.0;

/** 玩家包围盒（半宽/高） */
export const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;

// ─── 相机常量 ─────────────────────────────────────────────────────────────────
const THIRD_PERSON_DIST = 5.0;
const THIRD_PERSON_UP   = 1.0;
const CAMERA_MODE_FIRST = 'first';
const CAMERA_MODE_THIRD = 'third';

/** 不可碰撞方块集合（空气 + 水） */
const NON_SOLID_IDS = new Set([0, Blocks.WATER]);

// ─────────────────────────────────────────────────────────────────────────────

class Player extends HumanoidEntity {
  /**
   * @param {number} x
   * @param {number} y  脚底 Y 坐标
   * @param {number} z
   * @param {object} [options]
   * @param {object} [options.skeleton]  可选骨骼覆盖，用于自定义皮肤/体型
   */
  constructor(x, y, z, options = {}) {
    super(x, y, z, options);

    // Player.position 语义为"玩家身体中心（含身高偏移）"，保持向后兼容
    this.position.y += PLAYER_HEIGHT;

    // 视角模式
    this.cameraMode = CAMERA_MODE_FIRST;

    // ── 输入状态 ──────────────────────────────
    this.inputForward       = false;
    this.inputBackward      = false;
    this.inputLeft          = false;
    this.inputRight         = false;
    this.inputJump          = false;
    this.inputToggleCamera  = false;  // F 键

    // ── 方块交互 ──────────────────────────────
    this.clickLeft      = false;  // 左键：破坏
    this.clickRight     = false;  // 右键：放置
    this.blockSelectKey = 0;      // 数字键（0 = 无）
  }

  // ─── 包围盒 ───────────────────────────────────────────────────────────────

  getBoundingBox() {
    return { hw: PLAYER_RADIUS, hd: PLAYER_RADIUS, height: PLAYER_HEIGHT };
  }

  // ─── 相机 ─────────────────────────────────────────────────────────────────

  /** 切换视角模式（first ↔ third） */
  toggleCameraMode() {
    this.cameraMode = this.cameraMode === CAMERA_MODE_FIRST
      ? CAMERA_MODE_THIRD
      : CAMERA_MODE_FIRST;
  }

  /** 是否第三人称 */
  isThirdPerson() {
    return this.cameraMode === CAMERA_MODE_THIRD;
  }

  /**
   * 获取相机信息（视图矩阵 + 眼睛世界坐标）
   * @param {object|null} world  用于弹簧臂碰墙检测；传 null 则跳过碰撞
   * @returns {{ eye: Vec3, viewMatrix: Mat4 }}
   */
  getCameraInfo(world) {
    // 眼睛位置（略低于头顶）
    const eyePos = new Vec3(
      this.position.x,
      this.position.y - PLAYER_HEIGHT * 0.1,
      this.position.z,
    );

    if (this.cameraMode === CAMERA_MODE_FIRST) {
      const dir    = this.getLookDir();
      const center = eyePos.add(dir);
      return {
        eye:        eyePos,
        viewMatrix: Mat4.lookAt(eyePos, center, new Vec3(0, 1, 0)),
      };
    }

    // ── 第三人称：弹簧臂 ──────────────────────
    const dir     = this.getLookDir();
    const backDir = new Vec3(-dir.x, -dir.y, -dir.z);

    let actualDist = THIRD_PERSON_DIST;
    if (world) {
      const stepCount = Math.ceil(THIRD_PERSON_DIST * 2);
      for (let i = 1; i <= stepCount; i++) {
        const t    = (i / stepCount) * THIRD_PERSON_DIST;
        const upOff = THIRD_PERSON_UP * (t / THIRD_PERSON_DIST);
        const blockId = world.getBlock(
          Math.floor(eyePos.x + backDir.x * t),
          Math.floor(eyePos.y + backDir.y * t + upOff),
          Math.floor(eyePos.z + backDir.z * t),
        );
        if (blockId !== 0 && blockId !== Blocks.WATER) {
          actualDist = Math.max(0.5, t - 0.3);
          break;
        }
      }
    }

    const camEye = new Vec3(
      eyePos.x + backDir.x * actualDist,
      eyePos.y + backDir.y * actualDist + THIRD_PERSON_UP,
      eyePos.z + backDir.z * actualDist,
    );
    return {
      eye:        camEye,
      viewMatrix: Mat4.lookAt(camEye, eyePos, new Vec3(0, 1, 0)),
    };
  }

  /** 向后兼容：仅返回视图矩阵（第一人称） */
  getViewMatrix() {
    return this.getCameraInfo(null).viewMatrix;
  }

  // ─── 物理更新 ─────────────────────────────────────────────────────────────

  /**
   * 每帧更新：输入 → 速度 → 碰撞 → 落水 → 重力
   * @param {number} dt    帧间隔（秒）
   * @param {object} world World 对象
   */
  update(dt, world) {
    const forward = this.getForward();
    const right   = this.getRight();
    const moveDir = new Vec3(0, 0, 0);

    if (this.inputForward)  { moveDir.x += forward.x; moveDir.z += forward.z; }
    if (this.inputBackward) { moveDir.x -= forward.x; moveDir.z -= forward.z; }
    if (this.inputRight)    { moveDir.x += right.x;   moveDir.z += right.z; }
    if (this.inputLeft)     { moveDir.x -= right.x;   moveDir.z -= right.z; }

    const inWater = this._isInWater(world);
    const speed   = inWater ? SWIM_SPEED : MOVE_SPEED;

    if (moveDir.length() > 0) {
      const norm      = moveDir.normalize();
      this.velocity.x = norm.x * speed;
      this.velocity.z = norm.z * speed;
    } else {
      const drag      = inWater ? Math.max(0, 1 - WATER_DRAG * dt) : 0;
      this.velocity.x *= drag;
      this.velocity.z *= drag;
      if (!inWater) { this.velocity.x = 0; this.velocity.z = 0; }
    }

    if (this.inputJump) {
      if (inWater) {
        if (this.velocity.y < SWIM_JUMP_SPEED) this.velocity.y = SWIM_JUMP_SPEED;
      } else if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround   = false;
      }
    }

    if (inWater) {
      this.velocity.y += (GRAVITY + WATER_BUOYANCY) * dt;
      this.velocity.y  = Math.max(-2.0, Math.min(4.0, this.velocity.y));
    } else {
      this.velocity.y += GRAVITY * dt;
    }

    const newPos = this.position.add(this.velocity.scale(dt));
    this._collide(newPos, world);

    // 掉出世界底部时重置
    if (this.position.y < -10) {
      this.position.y = 80;
      this.velocity.y = 0;
    }

    // 单帧消费的输入标志位——用完即清零，防止下一帧残留
    this.inputJump          = false;
    this.clickLeft          = false;
    this.clickRight         = false;
    this.inputToggleCamera  = false;
    this.blockSelectKey     = 0;
  }

  // ─── 碰撞 ─────────────────────────────────────────────────────────────────

  _isInWater(world) {
    const feetY = Math.floor(this.position.y - PLAYER_HEIGHT);
    const headY = Math.floor(this.position.y);
    for (let y = feetY; y <= headY; y++) {
      if (world.getBlock(Math.floor(this.position.x), y, Math.floor(this.position.z)) === Blocks.WATER) {
        return true;
      }
    }
    return false;
  }

  _collide(newPos, world) {
    const feetY      = newPos.y - PLAYER_HEIGHT;
    const blockBelow = world.getBlock(Math.floor(newPos.x), Math.floor(feetY), Math.floor(newPos.z));

    this.position.x = newPos.x;
    this.position.z = newPos.z;
    this._checkHorizontalCollision(world);

    if (this.velocity.y <= 0) {
      if (!NON_SOLID_IDS.has(blockBelow)) {
        this.position.y = Math.floor(feetY) + 1 + PLAYER_HEIGHT;
        this.velocity.y = 0;
        this.onGround   = true;
      } else {
        this.position.y = newPos.y;
        this.onGround   = false;
      }
    } else {
      const headY      = newPos.y + 0.2;
      const blockAbove = world.getBlock(Math.floor(this.position.x), Math.floor(headY), Math.floor(this.position.z));
      if (!NON_SOLID_IDS.has(blockAbove)) {
        this.velocity.y = 0;
      } else {
        this.position.y = newPos.y;
      }
      this.onGround = false;
    }
  }

  _checkHorizontalCollision(world) {
    const r      = PLAYER_RADIUS;
    const feetY  = Math.floor(this.position.y - PLAYER_HEIGHT);
    const bodyY  = Math.floor(this.position.y);
    const corners = [
      [this.position.x - r, this.position.z - r],
      [this.position.x + r, this.position.z - r],
      [this.position.x - r, this.position.z + r],
      [this.position.x + r, this.position.z + r],
    ];

    for (const [cx, cz] of corners) {
      for (let y = feetY; y <= bodyY; y++) {
        const b = world.getBlock(Math.floor(cx), y, Math.floor(cz));
        if (!NON_SOLID_IDS.has(b)) {
          const bx = Math.floor(cx) + 0.5;
          const bz = Math.floor(cz) + 0.5;
          const dx = this.position.x - bx;
          const dz = this.position.z - bz;
          if (Math.abs(dx) > Math.abs(dz)) {
            this.position.x = bx + (dx > 0 ? 0.5 + r : -0.5 - r);
          } else {
            this.position.z = bz + (dz > 0 ? 0.5 + r : -0.5 - r);
          }
        }
      }
    }
  }

  // ─── 输入 ─────────────────────────────────────────────────────────────────

  /** 鼠标移动（dx / dy 为像素偏移） */
  onMouseMove(dx, dy) {
    this.yaw   -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  // ─── 射线检测 ─────────────────────────────────────────────────────────────

  /**
   * DDA 射线检测：沿视线方向找到第一个固体方块
   * @param {object} world
   * @param {number} maxDist
   * @returns {{ hit: [x,y,z], normal: [nx,ny,nz], blockId: number } | null}
   */
  raycast(world, maxDist = 6) {
    const dir = this.getLookDir();

    const originX = this.position.x;
    const originY = this.position.y - PLAYER_HEIGHT * 0.4;
    const originZ = this.position.z;

    let x = Math.floor(originX), y = Math.floor(originY), z = Math.floor(originZ);

    const stepX = dir.x > 0 ? 1 : (dir.x < 0 ? -1 : 0);
    const stepY = dir.y > 0 ? 1 : (dir.y < 0 ? -1 : 0);
    const stepZ = dir.z > 0 ? 1 : (dir.z < 0 ? -1 : 0);

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x !== 0 ? ((stepX > 0 ? x + 1 : x) - originX) / dir.x : Infinity;
    let tMaxY = dir.y !== 0 ? ((stepY > 0 ? y + 1 : y) - originY) / dir.y : Infinity;
    let tMaxZ = dir.z !== 0 ? ((stepZ > 0 ? z + 1 : z) - originZ) / dir.z : Infinity;

    let prevX = x, prevY = y, prevZ = z;
    const maxSteps = Math.ceil(maxDist) * 3;

    for (let i = 0; i < maxSteps; i++) {
      prevX = x; prevY = y; prevZ = z;

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX; tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY; tMaxY += tDeltaY;
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ; tMaxZ += tDeltaZ;
      }

      const blockId = world.getBlock(x, y, z);
      if (!NON_SOLID_IDS.has(blockId)) {
        return {
          hit:     [x, y, z],
          normal:  [prevX - x, prevY - y, prevZ - z],
          blockId,
        };
      }
    }

    return null;
  }

  // ─── 模型部件（覆盖父类，使用 position.y - PLAYER_HEIGHT 作为脚底） ──────────

  /**
   * 覆盖 HumanoidEntity.getModelParts()
   * 因为 Player.position.y 是带身高偏移的中心位置，需减回脚底
   */
  getModelParts() {
    // 暂存原始 position.y，临时换为脚底 Y 让父类逻辑正确定位各部件
    const savedY       = this.position.y;
    this.position.y    = savedY - PLAYER_HEIGHT;
    const parts        = super.getModelParts();
    this.position.y    = savedY;
    return parts;
  }
}

export { Player };
