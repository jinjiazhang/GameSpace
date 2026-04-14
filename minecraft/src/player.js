/**
 * player.js - 玩家与相机系统
 * 第一人称视角，WASD 移动，鼠标旋转
 */

import { Vec3, Mat4 } from './math.js';
import { Blocks } from './blocks.js';

/** 玩家物理常量 */
const MOVE_SPEED = 6.0;
const MOUSE_SENSITIVITY = 0.002;
const GRAVITY = -20.0;
const JUMP_SPEED = 8.0;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;

/** 不可碰撞的方块集合（空气+水） */
const NON_SOLID_IDS = new Set([0, Blocks.WATER]);

class Player {
  constructor(x, y, z) {
    this.position = new Vec3(x, y + PLAYER_HEIGHT, z);
    this.velocity = new Vec3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;

    // 输入状态
    this.inputForward = false;
    this.inputBackward = false;
    this.inputLeft = false;
    this.inputRight = false;
    this.inputJump = false;
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

  /** 获取相机视图矩阵 */
  getViewMatrix() {
    const eye = this.position;
    const dir = this.getLookDir();
    const center = eye.add(dir);
    return Mat4.lookAt(eye, center, new Vec3(0, 1, 0));
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

    if (moveDir.length() > 0) {
      const norm = moveDir.normalize();
      this.velocity.x = norm.x * MOVE_SPEED;
      this.velocity.z = norm.z * MOVE_SPEED;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.inputJump && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    this.velocity.y += GRAVITY * dt;

    const newPos = this.position.add(this.velocity.scale(dt));
    this._collide(newPos, world);

    if (this.position.y < -10) {
      this.position.y = 80;
      this.velocity.y = 0;
    }
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
    this.yaw += dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }
}

export { Player, PLAYER_HEIGHT };
