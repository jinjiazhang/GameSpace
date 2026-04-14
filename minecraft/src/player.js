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
  /**
   * 获取第三人称模型渲染数据
   * 返回各部件的 { mesh, modelMatrix } 列表
   * @returns {Array<{ positions, normals, colors, indices, modelMatrix: Float32Array }>}
   */
  getModelParts() {
    const px = this.position.x;
    const py = this.position.y - PLAYER_HEIGHT; // 脚底 Y
    const pz = this.position.z;
    const yaw = this.yaw;

    // 部件尺寸（与原版比例相近，单位：格）
    const HEAD_W = 0.5, HEAD_H = 0.5, HEAD_D = 0.5;
    const BODY_W = 0.5, BODY_H = 0.75, BODY_D = 0.25;
    const ARM_W = 0.25, ARM_H = 0.75, ARM_D = 0.25;
    const LEG_W = 0.25, LEG_H = 0.75, LEG_D = 0.25;

    // 腿部摆动动画（根据移动速度）
    const moving = Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.1;
    const swing = moving ? Math.sin(performance.now() / 180) * 0.4 : 0;

    const parts = [];

    // 头部：身体顶端 + 半个头高
    parts.push(_makeBoxPart(
      HEAD_W, HEAD_H, HEAD_D,
      [0.88, 0.71, 0.51],   // 肤色
      px, py + LEG_H + BODY_H + HEAD_H * 0.5, pz,
      yaw, 0
    ));

    // 身体
    parts.push(_makeBoxPart(
      BODY_W, BODY_H, BODY_D,
      [0.25, 0.45, 0.75],   // 蓝色衬衫
      px, py + LEG_H + BODY_H * 0.5, pz,
      yaw, 0
    ));

    // 左臂（玩家右侧）：偏左 offset，绕身体顶端摆动
    const armOffX = (BODY_W * 0.5 + ARM_W * 0.5);
    parts.push(_makeBoxPart(
      ARM_W, ARM_H, ARM_D,
      [0.88, 0.71, 0.51],
      px + Math.cos(yaw) * armOffX,
      py + LEG_H + ARM_H * 0.5,
      pz - Math.sin(yaw) * armOffX,
      yaw, -swing
    ));

    // 右臂
    parts.push(_makeBoxPart(
      ARM_W, ARM_H, ARM_D,
      [0.88, 0.71, 0.51],
      px - Math.cos(yaw) * armOffX,
      py + LEG_H + ARM_H * 0.5,
      pz + Math.sin(yaw) * armOffX,
      yaw, swing
    ));

    // 左腿
    const legOffX = LEG_W * 0.5;
    parts.push(_makeBoxPart(
      LEG_W, LEG_H, LEG_D,
      [0.15, 0.22, 0.55],   // 深蓝裤子
      px + Math.cos(yaw) * legOffX,
      py + LEG_H * 0.5,
      pz - Math.sin(yaw) * legOffX,
      yaw, swing
    ));

    // 右腿
    parts.push(_makeBoxPart(
      LEG_W, LEG_H, LEG_D,
      [0.15, 0.22, 0.55],
      px - Math.cos(yaw) * legOffX,
      py + LEG_H * 0.5,
      pz + Math.sin(yaw) * legOffX,
      yaw, -swing
    ));

    return parts;
  }

}

/**
 * 构建一个长方体部件的顶点/索引数据，并计算其模型矩阵
 * @param {number} w,h,d - 宽高深（以中心为原点的 box）
 * @param {number[]} color - RGB
 * @param {number} wx,wy,wz - 世界坐标（部件中心）
 * @param {number} yaw - 玩家朝向
 * @param {number} pitchX - 绕 X 轴的摆动角度（手臂/腿动画）
 */
function _makeBoxPart(w, h, d, color, wx, wy, wz, yaw, pitchX) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const [r, g, b] = color;

  // 6个面，每面4顶点
  // 法线方向：+X, -X, +Y, -Y, +Z, -Z
  const faceData = [
    // pos x
    { n: [1,0,0], v: [[hw,-hh,-hd],[hw,hh,-hd],[hw,hh,hd],[hw,-hh,hd]] },
    // neg x
    { n: [-1,0,0], v: [[-hw,-hh,hd],[-hw,hh,hd],[-hw,hh,-hd],[-hw,-hh,-hd]] },
    // pos y (顶面)
    { n: [0,1,0], v: [[-hw,hh,-hd],[hw,hh,-hd],[hw,hh,hd],[-hw,hh,hd]] },
    // neg y (底面)
    { n: [0,-1,0], v: [[-hw,-hh,hd],[hw,-hh,hd],[hw,-hh,-hd],[-hw,-hh,-hd]] },
    // pos z
    { n: [0,0,1], v: [[-hw,-hh,hd],[-hw,hh,hd],[hw,hh,hd],[hw,-hh,hd]] },
    // neg z
    { n: [0,0,-1], v: [[hw,-hh,-hd],[hw,hh,-hd],[-hw,hh,-hd],[-hw,-hh,-hd]] },
  ];

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  let idx = 0;
  for (const face of faceData) {
    // 顶面稍微提亮，底面稍暗，增加层次感
    const bright = face.n[1] > 0.5 ? 1.15 : (face.n[1] < -0.5 ? 0.75 : 1.0);
    for (const [vx, vy, vz] of face.v) {
      positions.push(vx, vy, vz);
      normals.push(face.n[0], face.n[1], face.n[2]);
      colors.push(r * bright, g * bright, b * bright);
    }
    indices.push(idx, idx+1, idx+2, idx, idx+2, idx+3);
    idx += 4;
  }

  // 构建模型矩阵：先绕 X 轴旋转（手臂/腿摆动），再绕 Y 轴旋转（朝向），再平移
  const modelMatrix = _buildModelMatrix(wx, wy, wz, yaw, pitchX);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices),
    modelMatrix,
  };
}

/**
 * 构建模型矩阵：绕 X 轴倾斜（摆动），绕 Y 轴旋转（朝向），平移
 * 列主序 Float32Array，与 WebGL uniformMatrix4fv 对应
 */
function _buildModelMatrix(tx, ty, tz, yaw, pitchX) {
  const cy = Math.cos(yaw),   sy = Math.sin(yaw);
  const cx = Math.cos(pitchX), sx = Math.sin(pitchX);

  // R = Ry * Rx（先 Rx 再 Ry）
  // Ry: [ cy, 0, sy; 0,1,0; -sy,0,cy ]
  // Rx: [ 1,0,0; 0,cx,-sx; 0,sx,cx ]
  // R = Ry * Rx
  const m = new Float32Array(16);
  // 列0
  m[0]  =  cy;       m[1]  = sy*sx;    m[2]  = -sy*cx;   m[3]  = 0;
  // 列1
  m[4]  =  0;        m[5]  = cx;       m[6]  = sx;        m[7]  = 0;
  // 列2
  m[8]  =  sy;       m[9]  = -cy*sx;   m[10] = cy*cx;     m[11] = 0;
  // 列3（平移）
  m[12] = tx;        m[13] = ty;       m[14] = tz;        m[15] = 1;
  return m;
}

export { Player, PLAYER_HEIGHT };
