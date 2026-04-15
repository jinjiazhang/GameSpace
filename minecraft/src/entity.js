/**
 * entity.js - 实体系统 + 实体渲染器
 *
 * 层级结构：
 *   Entity            —— 所有可渲染生物的基类（位置、方向、速度、生命值）
 *     └─ HumanoidEntity —— 人形实体（头/身/臂/腿六部件骨骼模型）
 *          └─ Player   —— 玩家（在 player.js 中定义）
 *   EntityRenderer    —— 统一管理所有实体的 GPU 缓冲区与绘制
 *
 * 数据与渲染分离原则：
 *   - Entity / HumanoidEntity 只负责状态数据和骨骼动画计算
 *   - 实际 GPU 上传与绘制由同文件的 EntityRenderer 完成
 */

import { Vec3 } from './math.js';

// ─────────────────────────────────────────────
// 工具函数：构建盒体部件几何数据
// ─────────────────────────────────────────────

/**
 * 生成一个以原点为中心的长方体的顶点/法线/颜色/索引数组
 * @param {number} w  宽 (X)
 * @param {number} h  高 (Y)
 * @param {number} d  深 (Z)
 * @param {number[]} color  [r, g, b]  0~1
 * @returns {{ positions: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint16Array }}
 */
export function buildBoxGeometry(w, h, d, color) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const [r, g, b] = color;

  const faceData = [
    { n: [1,  0, 0], v: [[ hw,-hh,-hd],[ hw, hh,-hd],[ hw, hh, hd],[ hw,-hh, hd]] },
    { n: [-1, 0, 0], v: [[-hw,-hh, hd],[-hw, hh, hd],[-hw, hh,-hd],[-hw,-hh,-hd]] },
    { n: [0,  1, 0], v: [[-hw, hh,-hd],[ hw, hh,-hd],[ hw, hh, hd],[-hw, hh, hd]] },
    { n: [0, -1, 0], v: [[-hw,-hh, hd],[ hw,-hh, hd],[ hw,-hh,-hd],[-hw,-hh,-hd]] },
    { n: [0,  0, 1], v: [[-hw,-hh, hd],[-hw, hh, hd],[ hw, hh, hd],[ hw,-hh, hd]] },
    { n: [0,  0,-1], v: [[ hw,-hh,-hd],[ hw, hh,-hd],[-hw, hh,-hd],[-hw,-hh,-hd]] },
  ];

  const positions = [], normals = [], colors = [], indices = [];
  let idx = 0;

  for (const face of faceData) {
    // 顶面稍微提亮，底面稍暗，增加层次感
    const bright = face.n[1] > 0.5 ? 1.15 : (face.n[1] < -0.5 ? 0.75 : 1.0);
    for (const [vx, vy, vz] of face.v) {
      positions.push(vx, vy, vz);
      normals.push(face.n[0], face.n[1], face.n[2]);
      colors.push(r * bright, g * bright, b * bright);
    }
    indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
    idx += 4;
  }

  return {
    positions: new Float32Array(positions),
    normals:   new Float32Array(normals),
    colors:    new Float32Array(colors),
    indices:   new Uint16Array(indices),
  };
}

/**
 * 构建部件的模型矩阵（列主序，供 WebGL uniformMatrix4fv 使用）
 * 变换顺序：先绕 X 轴旋转（摆动），再绕 Y 轴旋转（朝向），再平移
 * @param {number} tx, ty, tz  世界坐标（部件中心）
 * @param {number} yaw         绕 Y 轴旋转（朝向）
 * @param {number} pitchX      绕 X 轴旋转（手臂/腿摆动角度）
 * @returns {Float32Array} 4x4 列主序矩阵
 */
export function buildPartModelMatrix(tx, ty, tz, yaw, pitchX) {
  const cy = Math.cos(yaw),    sy = Math.sin(yaw);
  const cx = Math.cos(pitchX), sx = Math.sin(pitchX);

  // R = Ry * Rx
  const m = new Float32Array(16);
  m[0]  =  cy;      m[1]  =  sy * sx;  m[2]  = -sy * cx;  m[3]  = 0;
  m[4]  =  0;       m[5]  =  cx;       m[6]  =  sx;        m[7]  = 0;
  m[8]  =  sy;      m[9]  = -cy * sx;  m[10] =  cy * cx;   m[11] = 0;
  m[12] =  tx;      m[13] =  ty;       m[14] =  tz;        m[15] = 1;
  return m;
}

// ─────────────────────────────────────────────
// Entity — 所有实体的基类
// ─────────────────────────────────────────────

/**
 * Entity 基类
 *
 * 子类需实现：
 *   getModelParts()  —— 返回当前帧的骨骼部件列表
 *   getBoundingBox() —— 返回 AABB 包围盒 { minX, maxX, minY, maxY, minZ, maxZ }
 */
export class Entity {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  constructor(x, y, z) {
    /** 世界坐标（脚底中心） */
    this.position = new Vec3(x, y, z);
    /** 速度 */
    this.velocity = new Vec3(0, 0, 0);
    /** 水平朝向（绕 Y 轴，弧度） */
    this.yaw = 0;
    /** 垂直俯仰（绕 X 轴，弧度） */
    this.pitch = 0;
    /** 生命值（0 = 死亡） */
    this.health = 20;
    /** 是否在地面 */
    this.onGround = false;
    /** 是否活跃（false 时跳过更新和渲染） */
    this.alive = true;
  }

  /**
   * 获取朝向的前方向向量（水平）
   * @returns {Vec3}
   */
  getForward() {
    return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  /**
   * 获取朝向的右方向向量（水平）
   * @returns {Vec3}
   */
  getRight() {
    return new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  /**
   * 获取视线方向（3D，结合 yaw 和 pitch）
   * @returns {Vec3}
   */
  getLookDir() {
    return new Vec3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
       Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();
  }

  /**
   * 获取 AABB 包围盒（子类重写以提供自定义尺寸）
   * @returns {{ hw: number, hd: number, height: number }}
   */
  getBoundingBox() {
    return { hw: 0.3, hd: 0.3, height: 1.6 };
  }

  /**
   * 返回当前帧要渲染的骨骼部件列表
   * 每个部件：{ positions, normals, colors, indices, modelMatrix }
   * 子类必须重写此方法
   * @returns {Array}
   */
  getModelParts() {
    return [];
  }
}

// ─────────────────────────────────────────────
// HumanoidEntity — 人形实体（六部件骨骼）
// ─────────────────────────────────────────────

/**
 * HumanoidEntity 人形实体定义
 *
 * 骨骼描述结构（SKELETON）用于定义各部件的：
 *   - size:   [w, h, d]        以格为单位
 *   - color:  [r, g, b]        0~1
 *   - pivot:  'top'|'bottom'   旋转轴（摆动时绕顶端还是底端）
 *   - attach: 相对于脚底的 Y 偏移基准（由 layout 自动算）
 *
 * 子类可通过覆盖 SKELETON 来定制外观（不同皮肤/体型）
 * 而 getModelParts() 逻辑保持通用
 */
export class HumanoidEntity extends Entity {
  /**
   * @param {number} x
   * @param {number} y  脚底 Y 坐标
   * @param {number} z
   * @param {object} options
   * @param {object} [options.skeleton]  可选骨骼覆盖（不传则使用默认玩家外观）
   */
  constructor(x, y, z, options = {}) {
    super(x, y, z);
    this.skeleton = options.skeleton || HumanoidEntity.DEFAULT_SKELETON;
  }

  /**
   * 默认玩家外观骨骼描述
   * 采用 Minecraft 原版比例
   */
  static DEFAULT_SKELETON = {
    head: {
      size:  [0.50, 0.50, 0.50],
      color: [0.88, 0.71, 0.51],  // 肤色
    },
    body: {
      size:  [0.50, 0.75, 0.25],
      color: [0.25, 0.45, 0.75],  // 蓝色衬衫
    },
    leftArm: {
      size:  [0.25, 0.75, 0.25],
      color: [0.88, 0.71, 0.51],  // 肤色
    },
    rightArm: {
      size:  [0.25, 0.75, 0.25],
      color: [0.88, 0.71, 0.51],
    },
    leftLeg: {
      size:  [0.25, 0.75, 0.25],
      color: [0.15, 0.22, 0.55],  // 深蓝裤子
    },
    rightLeg: {
      size:  [0.25, 0.75, 0.25],
      color: [0.15, 0.22, 0.55],
    },
  };

  getBoundingBox() {
    const sk = this.skeleton;
    return {
      hw:     sk.body.size[0] / 2,
      hd:     sk.body.size[2] / 2,
      height: sk.leftLeg.size[1] + sk.body.size[1] + sk.head.size[1],
    };
  }

  /**
   * 计算并返回当前帧的六部件列表
   * 包含行走动画（腿/手臂摆动）
   */
  getModelParts() {
    const sk = this.skeleton;
    const px = this.position.x;
    const py = this.position.y; // 脚底 Y
    const pz = this.position.z;
    const yaw = this.yaw;

    const [, LEG_H]  = sk.leftLeg.size;
    const [BODY_W, BODY_H] = sk.body.size;
    const [HEAD_W, HEAD_H] = sk.head.size;
    const [ARM_W, ARM_H]   = sk.leftArm.size;
    const [LEG_W]          = sk.leftLeg.size;

    // 行走摆动：根据水平速度决定是否播放动画
    const moving = Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.1;
    const swing  = moving ? Math.sin(performance.now() / 180) * 0.4 : 0;

    const parts = [];

    // ── 头部 ──────────────────────────────────
    parts.push(this._makePart(
      sk.head,
      px,
      py + LEG_H + BODY_H + HEAD_H * 0.5,
      pz,
      yaw, 0,
    ));

    // ── 身体 ──────────────────────────────────
    parts.push(this._makePart(
      sk.body,
      px,
      py + LEG_H + BODY_H * 0.5,
      pz,
      yaw, 0,
    ));

    // ── 左臂（玩家视角右侧） ──────────────────
    const armOffX = BODY_W * 0.5 + ARM_W * 0.5;
    parts.push(this._makePart(
      sk.leftArm,
      px + Math.cos(yaw) * armOffX,
      py + LEG_H + ARM_H * 0.5,
      pz - Math.sin(yaw) * armOffX,
      yaw, -swing,
    ));

    // ── 右臂 ──────────────────────────────────
    parts.push(this._makePart(
      sk.rightArm,
      px - Math.cos(yaw) * armOffX,
      py + LEG_H + ARM_H * 0.5,
      pz + Math.sin(yaw) * armOffX,
      yaw, swing,
    ));

    // ── 左腿 ──────────────────────────────────
    const legOffX = LEG_W * 0.5;
    parts.push(this._makePart(
      sk.leftLeg,
      px + Math.cos(yaw) * legOffX,
      py + LEG_H * 0.5,
      pz - Math.sin(yaw) * legOffX,
      yaw, swing,
    ));

    // ── 右腿 ──────────────────────────────────
    parts.push(this._makePart(
      sk.rightLeg,
      px - Math.cos(yaw) * legOffX,
      py + LEG_H * 0.5,
      pz + Math.sin(yaw) * legOffX,
      yaw, -swing,
    ));

    return parts;
  }

  /**
   * 根据骨骼部件描述构建几何数据 + 模型矩阵
   * @param {object} boneDef  骨骼描述 { size, color }
   * @param {number} wx,wy,wz 世界坐标（部件中心）
   * @param {number} yaw
   * @param {number} pitchX   摆动角度
   */
  _makePart(boneDef, wx, wy, wz, yaw, pitchX) {
    const [w, h, d] = boneDef.size;
    const geo = buildBoxGeometry(w, h, d, boneDef.color);
    const modelMatrix = buildPartModelMatrix(wx, wy, wz, yaw, pitchX);
    return { ...geo, modelMatrix };
  }
}

// ─────────────────────────────────────────────
// EntityRenderer — 实体专属渲染器
// ─────────────────────────────────────────────

import { PlayerVertexShader, PlayerFragmentShader } from './shaders.js';

/**
 * EntityRenderer
 *
 * 使用 PlayerVertexShader / PlayerFragmentShader 渲染所有人形实体。
 * 预分配持久 GPU Buffer（bufferSubData 更新，避免每帧 create/delete）。
 *
 * 使用方式：
 *   const er = new EntityRenderer(gl);
 *   // 每帧：
 *   er.drawEntities(entities, vpMatrix, cameraPos);
 *
 * 如果未来需要不同外观的实体（怪物等），可在此扩展为多 Program 管理。
 */
export class EntityRenderer {
  /**
   * @param {WebGLRenderingContext} gl
   */
  constructor(gl) {
    this.gl = gl;
    this._program = null;
    this._locs = null;

    // 预分配容量：最多同屏 64 个实体
    // 人形：6部件 * 24顶点 = 144顶点，6部件 * 36索引 = 216索引
    this._MAX_ENTITIES   = 64;
    this._VERTS_PER_ENTITY = 6 * 24;
    this._IDX_PER_ENTITY   = 6 * 36;

    this._posBuf  = null;
    this._normBuf = null;
    this._colBuf  = null;
    this._idxBuf  = null;

    this._init();
  }

  // ─── 初始化 ───────────────────────────────────────────────────────────────

  _init() {
    const gl = this.gl;

    this._program = this._createProgram(PlayerVertexShader, PlayerFragmentShader);
    const p = this._program;

    this._locs = {
      aPosition:  gl.getAttribLocation(p, 'aPosition'),
      aNormal:    gl.getAttribLocation(p, 'aNormal'),
      aColor:     gl.getAttribLocation(p, 'aColor'),
      uModel:     gl.getUniformLocation(p, 'uModel'),
      uVP:        gl.getUniformLocation(p, 'uVP'),
      uCameraPos: gl.getUniformLocation(p, 'uCameraPos'),
    };

    const maxV = this._MAX_ENTITIES * this._VERTS_PER_ENTITY;
    const maxI = this._MAX_ENTITIES * this._IDX_PER_ENTITY;

    this._posBuf  = this._allocBuffer(gl.ARRAY_BUFFER,         maxV * 3, Float32Array, gl.DYNAMIC_DRAW);
    this._normBuf = this._allocBuffer(gl.ARRAY_BUFFER,         maxV * 3, Float32Array, gl.DYNAMIC_DRAW);
    this._colBuf  = this._allocBuffer(gl.ARRAY_BUFFER,         maxV * 3, Float32Array, gl.DYNAMIC_DRAW);
    this._idxBuf  = this._allocBuffer(gl.ELEMENT_ARRAY_BUFFER, maxI,     Uint16Array,  gl.DYNAMIC_DRAW);
  }

  _allocBuffer(target, count, TypedArray, usage) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(target, buf);
    gl.bufferData(target, new TypedArray(count), usage);
    return buf;
  }

  // ─── 主绘制接口 ────────────────────────────────────────────────────────────

  /**
   * 绘制所有实体
   * @param {Entity[]} entities  实体数组
   * @param {Mat4}     vpMatrix  View-Projection 矩阵
   * @param {Vec3}     cameraPos 相机世界坐标（雾气计算）
   */
  drawEntities(entities, vpMatrix, cameraPos) {
    if (!entities || entities.length === 0) return;

    const gl = this.gl;
    gl.useProgram(this._program);
    const locs = this._locs;

    gl.uniformMatrix4fv(locs.uVP, false, vpMatrix.m);
    if (cameraPos) {
      gl.uniform3f(locs.uCameraPos, cameraPos.x, cameraPos.y, cameraPos.z);
    }

    this._bindAttrib(this._posBuf,  locs.aPosition, 3);
    this._bindAttrib(this._normBuf, locs.aNormal,   3);
    this._bindAttrib(this._colBuf,  locs.aColor,    3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf);

    for (const entity of entities) {
      if (!entity.alive) continue;
      const parts = entity.getModelParts();
      if (!parts || parts.length === 0) continue;
      this._drawEntityParts(parts, locs);
    }
  }

  _drawEntityParts(parts, locs) {
    const gl = this.gl;

    for (const part of parts) {
      gl.uniformMatrix4fv(locs.uModel, false, part.modelMatrix);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, part.positions);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._normBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, part.normals);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, part.colors);

      this._bindAttrib(this._posBuf,  locs.aPosition, 3);
      this._bindAttrib(this._normBuf, locs.aNormal,   3);
      this._bindAttrib(this._colBuf,  locs.aColor,    3);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, part.indices);

      gl.drawElements(gl.TRIANGLES, part.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }

  // ─── 工具方法 ──────────────────────────────────────────────────────────────

  _bindAttrib(buf, loc, size) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[EntityRenderer] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  _createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[EntityRenderer] Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  /** 释放所有 GPU 资源 */
  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this._posBuf);
    gl.deleteBuffer(this._normBuf);
    gl.deleteBuffer(this._colBuf);
    gl.deleteBuffer(this._idxBuf);
    gl.deleteProgram(this._program);
  }
}
