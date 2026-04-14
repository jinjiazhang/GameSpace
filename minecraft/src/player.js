/**
 * player.js - 玩家与相机系统
 * 第一人称视角，WASD 移动，鼠标旋转
 */

import { Vec3, Mat4 } from './math.js';
import { Blocks } from './blocks.js';

/** 玩家物理常量 */
const MOVE_SPEED = 6.0;
const SWIM_SPEED = 4.0;       // 水中移动速度（较慢）
const MOUSE_SENSITIVITY = 0.002;
const GRAVITY = -20.0;
const JUMP_SPEED = 8.0;
const SWIM_JUMP_SPEED = 6.0;  // 水中跳跃速度（较弱）
const WATER_BUOYANCY = 8.0;   // 水的浮力加速度
const WATER_DRAG = 3.0;       // 水中阻力系数
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;

/** 第三人称相机参数 */
const THIRD_PERSON_DIST = 5.0;   // 相机距玩家的理想距离
const THIRD_PERSON_UP = 1.0;     // 相机额外向上偏移量
const CAMERA_MODE_FIRST  = 'first';
const CAMERA_MODE_THIRD  = 'third';

/** 不可碰撞的方块集合（空气+水） */
const NON_SOLID_IDS = new Set([0, Blocks.WATER]);

class Player {
  constructor(x, y, z) {
    this.position = new Vec3(x, y + PLAYER_HEIGHT, z);
    this.velocity = new Vec3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;

    // 视角模式
    this.cameraMode = CAMERA_MODE_FIRST; // 'first' | 'third'

    // 输入状态
    this.inputForward = false;
    this.inputBackward = false;
    this.inputLeft = false;
    this.inputRight = false;
    this.inputJump = false;
    this.inputToggleCamera = false; // F 键切换视角

    // 方块交互
    this.clickLeft = false;   // 左键点击（破坏）
    this.clickRight = false;  // 右键点击（放置）
    this.blockSelectKey = 0;  // 数字键切换方块（0=无）
  }

  /** 前方向（水平） */
  getForward() {
    return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  /** 右方向（水平） */
  getRight() {
    return new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  /** 视线方向（3D） */
  getLookDir() {
    return new Vec3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  /** 切换视角模式 */
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
   * 获取相机信息
   * @param {object} world - 用于弹簧臂碰墙检测
   * @returns {{ eye: Vec3, viewMatrix: Mat4 }}
   */
  getCameraInfo(world) {
    // 玩家头部眼睛位置（第一人称基点）
    const eyePos = new Vec3(
      this.position.x,
      this.position.y - PLAYER_HEIGHT * 0.1, // 略低于头顶
      this.position.z
    );

    if (this.cameraMode === CAMERA_MODE_FIRST) {
      const dir = this.getLookDir();
      const center = eyePos.add(dir);
      return {
        eye: eyePos,
        viewMatrix: Mat4.lookAt(eyePos, center, new Vec3(0, 1, 0)),
      };
    }

    // ---- 第三人称：弹簧臂 ----
    const dir = this.getLookDir();
    // 反方向 + 上方偏移
    const backDir = new Vec3(-dir.x, -dir.y, -dir.z);
    const idealEye = new Vec3(
      eyePos.x + backDir.x * THIRD_PERSON_DIST,
      eyePos.y + backDir.y * THIRD_PERSON_DIST + THIRD_PERSON_UP,
      eyePos.z + backDir.z * THIRD_PERSON_DIST
    );

    // 弹簧臂碰墙：从头部向相机方向逐步检测
    let actualDist = THIRD_PERSON_DIST;
    if (world) {
      const stepCount = Math.ceil(THIRD_PERSON_DIST * 2);
      for (let i = 1; i <= stepCount; i++) {
        const t = (i / stepCount) * THIRD_PERSON_DIST;
        const testX = eyePos.x + backDir.x * t;
        const testY = eyePos.y + backDir.y * t + THIRD_PERSON_UP * (t / THIRD_PERSON_DIST);
        const testZ = eyePos.z + backDir.z * t;
        const blockId = world.getBlock(Math.floor(testX), Math.floor(testY), Math.floor(testZ));
        // 撞到固体（非空气、非水）时缩短距离
        if (blockId !== 0 && blockId !== Blocks.WATER) {
          actualDist = Math.max(0.5, t - 0.3);
          break;
        }
      }
    }

    const camEye = new Vec3(
      eyePos.x + backDir.x * actualDist,
      eyePos.y + backDir.y * actualDist + THIRD_PERSON_UP,
      eyePos.z + backDir.z * actualDist
    );
    // 看向玩家头部
    return {
      eye: camEye,
      viewMatrix: Mat4.lookAt(camEye, eyePos, new Vec3(0, 1, 0)),
    };
  }

  /** 获取相机视图矩阵（向后兼容，第一人称） */
  getViewMatrix() {
    return this.getCameraInfo(null).viewMatrix;
  }

  /**
   * 更新玩家状态
   * @param {number} dt - 帧间隔（秒）
   * @param {object} world - World 对象
   */
  update(dt, world) {
    const forward = this.getForward();
    const right = this.getRight();
    const moveDir = new Vec3(0, 0, 0);

    if (this.inputForward)  { moveDir.x += forward.x; moveDir.z += forward.z; }
    if (this.inputBackward) { moveDir.x -= forward.x; moveDir.z -= forward.z; }
    if (this.inputRight)    { moveDir.x += right.x;   moveDir.z += right.z; }
    if (this.inputLeft)     { moveDir.x -= right.x;   moveDir.z -= right.z; }

    // 检测是否在水中
    const inWater = this._isInWater(world);
    const speed = inWater ? SWIM_SPEED : MOVE_SPEED;

    if (moveDir.length() > 0) {
      const norm = moveDir.normalize();
      this.velocity.x = norm.x * speed;
      this.velocity.z = norm.z * speed;
    } else {
      // 水中阻力：速度快速衰减
      const dragFactor = inWater ? Math.max(0, 1 - WATER_DRAG * dt) : 0;
      this.velocity.x *= dragFactor;
      this.velocity.z *= dragFactor;
      if (!inWater) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // 跳跃：水中可游泳跳跃，地面可普通跳跃
    if (this.inputJump) {
      if (inWater) {
        // 在水中可以向上游
        if (this.velocity.y < SWIM_JUMP_SPEED) {
          this.velocity.y = SWIM_JUMP_SPEED;
        }
      } else if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    // 重力 / 浮力
    if (inWater) {
      // 水中：浮力抵消大部分重力，剩余向下微弱下沉
      this.velocity.y += (GRAVITY + WATER_BUOYANCY) * dt;
      // 限制下落速度（水的阻力）
      this.velocity.y = Math.max(-2.0, Math.min(4.0, this.velocity.y));
    } else {
      this.velocity.y += GRAVITY * dt;
    }

    const newPos = this.position.add(this.velocity.scale(dt));
    this._collide(newPos, world);

    if (this.position.y < -10) {
      this.position.y = 80;
      this.velocity.y = 0;
    }
  }

  /** 检测玩家身体是否在水中 */
  _isInWater(world) {
    const feetY = Math.floor(this.position.y - PLAYER_HEIGHT);
    const headY = Math.floor(this.position.y);
    for (let y = feetY; y <= headY; y++) {
      const blockId = world.getBlock(Math.floor(this.position.x), y, Math.floor(this.position.z));
      if (blockId === Blocks.WATER) return true;
    }
    return false;
  }

  /** 简单的 AABB 碰撞检测 */
  _collide(newPos, world) {
    const feetY = newPos.y - PLAYER_HEIGHT;
    const blockBelow = world.getBlock(Math.floor(newPos.x), Math.floor(feetY), Math.floor(newPos.z));

    this.position.x = newPos.x;
    this.position.z = newPos.z;
    this._checkHorizontalCollision(world);

    if (this.velocity.y <= 0) {
      if (!NON_SOLID_IDS.has(blockBelow)) {
        this.position.y = Math.floor(feetY) + 1 + PLAYER_HEIGHT;
        this.velocity.y = 0;
        this.onGround = true;
      } else {
        this.position.y = newPos.y;
        this.onGround = false;
      }
    } else {
      const headY = newPos.y + 0.2;
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
    const r = PLAYER_RADIUS;
    const feetY = Math.floor(this.position.y - PLAYER_HEIGHT);
    const bodyY = Math.floor(this.position.y);
    const checkPoints = [
      [this.position.x - r, this.position.z - r],
      [this.position.x + r, this.position.z - r],
      [this.position.x - r, this.position.z + r],
      [this.position.x + r, this.position.z + r],
    ];

    for (const [cx, cz] of checkPoints) {
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

  /** 鼠标移动处理 */
  onMouseMove(dx, dy) {
    this.yaw   -= dx * MOUSE_SENSITIVITY;   // 向右移动 → 视角右转（yaw 减小）
    this.pitch -= dy * MOUSE_SENSITIVITY;   // 向上移动 → 视角上抬（pitch 减小）
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  /**
   * 射线检测（DDA 算法）
   * 从玩家视线方向发射射线，返回命中的方块位置和法线方向
   * @param {object} world - World 对象
   * @param {number} maxDist - 最大检测距离
   * @returns {{ hit: [x,y,z], normal: [nx,ny,nz], blockId: number } | null}
   */
  raycast(world, maxDist = 6) {
    const dir = this.getLookDir();
    // 从眼睛位置发射
    const originX = this.position.x;
    const originY = this.position.y - PLAYER_HEIGHT * 0.4; // 眼睛略低于头顶
    const originZ = this.position.z;

    let x = Math.floor(originX);
    let y = Math.floor(originY);
    let z = Math.floor(originZ);

    const stepX = dir.x > 0 ? 1 : (dir.x < 0 ? -1 : 0);
    const stepY = dir.y > 0 ? 1 : (dir.y < 0 ? -1 : 0);
    const stepZ = dir.z > 0 ? 1 : (dir.z < 0 ? -1 : 0);

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x !== 0
      ? ((stepX > 0 ? (x + 1) : x) - originX) * (1 / dir.x) * Math.sign(dir.x || 1)
      : Infinity;
    let tMaxY = dir.y !== 0
      ? ((stepY > 0 ? (y + 1) : y) - originY) * (1 / dir.y) * Math.sign(dir.y || 1)
      : Infinity;
    let tMaxZ = dir.z !== 0
      ? ((stepZ > 0 ? (z + 1) : z) - originZ) * (1 / dir.z) * Math.sign(dir.z || 1)
      : Infinity;

    // 修正初始 tMax 值（使用更简洁的方式）
    if (dir.x !== 0) {
      const boundaryX = stepX > 0 ? x + 1 : x;
      tMaxX = (boundaryX - originX) / dir.x;
    }
    if (dir.y !== 0) {
      const boundaryY = stepY > 0 ? y + 1 : y;
      tMaxY = (boundaryY - originY) / dir.y;
    }
    if (dir.z !== 0) {
      const boundaryZ = stepZ > 0 ? z + 1 : z;
      tMaxZ = (boundaryZ - originZ) / dir.z;
    }

    let prevX = x, prevY = y, prevZ = z;
    const maxSteps = Math.ceil(maxDist) * 3; // 足够的步数

    for (let i = 0; i < maxSteps; i++) {
      prevX = x; prevY = y; prevZ = z;

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX;
        tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY;
        tMaxY += tDeltaY;
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ;
        tMaxZ += tDeltaZ;
      }

      const blockId = world.getBlock(x, y, z);
      if (!NON_SOLID_IDS.has(blockId)) {
        return {
          hit: [x, y, z],
          normal: [prevX - x, prevY - y, prevZ - z],
          blockId: blockId,
        };
      }
    }

    return null;
  }
}

export { Player, PLAYER_HEIGHT };
