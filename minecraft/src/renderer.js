/**
 * renderer.js - WebGL 渲染器
 * 负责编译着色器、管理缓冲区、绘制区块网格
 */

import { Mat4 } from './math.js';
import { BasicVertexShader, SolidFragmentShader, WaterFragmentShader } from './shaders.js';

/**
 * Renderer - WebGL 渲染器
 * 负责编译着色器、管理缓冲区、绘制区块网格
 */
class Renderer {
  /**
   * @param {WebGLRenderingContext} gl
   * @param {number} width
   * @param {number} height
   */
  constructor(gl, width, height) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.chunkBuffers = new Map(); // key: "cx,cz" => buffer set
    this._initGL();
  }

  _initGL() {
    const gl = this.gl;
    // 编译着色器程序
    this.solidProgram = this._createProgram(BasicVertexShader, SolidFragmentShader);
    this.waterProgram = this._createProgram(BasicVertexShader, WaterFragmentShader);

    // 获取 attribute / uniform 位置 (固体)
    this.solidLocations = {
      aPosition: gl.getAttribLocation(this.solidProgram, 'aPosition'),
      aNormal: gl.getAttribLocation(this.solidProgram, 'aNormal'),
      aColor: gl.getAttribLocation(this.solidProgram, 'aColor'),
      uMVP: gl.getUniformLocation(this.solidProgram, 'uMVP'),
      uCameraPos: gl.getUniformLocation(this.solidProgram, 'uCameraPos'),
    };

    // 获取 attribute / uniform 位置 (水面)
    this.waterLocations = {
      aPosition: gl.getAttribLocation(this.waterProgram, 'aPosition'),
      aNormal: gl.getAttribLocation(this.waterProgram, 'aNormal'),
      aColor: gl.getAttribLocation(this.waterProgram, 'aColor'),
      uMVP: gl.getUniformLocation(this.waterProgram, 'uMVP'),
      uCameraPos: gl.getUniformLocation(this.waterProgram, 'uCameraPos'),
      uTime: gl.getUniformLocation(this.waterProgram, 'uTime'),
    };

    // GL 状态
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // 启用混合 (用于水面半透明)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 天空颜色
    gl.clearColor(0.53, 0.81, 0.98, 1.0);
  }

  // ---- 着色器编译 ----

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
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
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  // ---- 缓冲区管理 ----

  _createBufferSet(mesh) {
    if (!mesh || mesh.indices.length === 0) return null;
    const gl = this.gl;
    
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);

    const normBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    return { posBuf, normBuf, colBuf, idxBuf, indexCount: mesh.indices.length };
  }

  _deleteBufferSet(buf) {
    if (!buf) return;
    const gl = this.gl;
    gl.deleteBuffer(buf.posBuf);
    gl.deleteBuffer(buf.normBuf);
    gl.deleteBuffer(buf.colBuf);
    gl.deleteBuffer(buf.idxBuf);
  }

  /**
   * 上传 Chunk 网格数据到 GPU
   * @param {string} key - "cx,cz"
   * @param {object} meshGroup - Chunk.buildMesh() 的返回值 (包含 solidMesh, waterMesh)
   */
  uploadChunkMesh(key, meshGroup) {
    // 如果已有旧缓冲区，先删除
    this.removeChunkMesh(key);

    this.chunkBuffers.set(key, {
      solid: this._createBufferSet(meshGroup.solidMesh),
      water: this._createBufferSet(meshGroup.waterMesh),
    });
  }

  /** 删除指定区块的 GPU 缓冲区 */
  removeChunkMesh(key) {
    if (this.chunkBuffers.has(key)) {
      const bufs = this.chunkBuffers.get(key);
      this._deleteBufferSet(bufs.solid);
      this._deleteBufferSet(bufs.water);
      this.chunkBuffers.delete(key);
    }
  }

  // ---- 渲染 ----

  _drawBufferSet(buf, locs) {
    if (!buf) return;
    const gl = this.gl;

    // Position
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf);
    gl.enableVertexAttribArray(locs.aPosition);
    gl.vertexAttribPointer(locs.aPosition, 3, gl.FLOAT, false, 0, 0);

    // Normal
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf);
    gl.enableVertexAttribArray(locs.aNormal);
    gl.vertexAttribPointer(locs.aNormal, 3, gl.FLOAT, false, 0, 0);

    // Color
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.colBuf);
    gl.enableVertexAttribArray(locs.aColor);
    gl.vertexAttribPointer(locs.aColor, 3, gl.FLOAT, false, 0, 0);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idxBuf);
    gl.drawElements(gl.TRIANGLES, buf.indexCount, gl.UNSIGNED_INT, 0);
  }

  /**
   * 渲染一帧
   * @param {Mat4} viewMatrix - 视图矩阵
   * @param {Mat4} projMatrix - 投影矩阵
   * @param {Vec3} cameraPos - 相机世界坐标（计算雾气需要）
   */
  render(viewMatrix, projMatrix, cameraPos) {
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const mvp = projMatrix.multiply(viewMatrix);

    // 1. 渲染所有固体方块 (不透明)
    gl.useProgram(this.solidProgram);
    gl.uniformMatrix4fv(this.solidLocations.uMVP, false, mvp.m);
    if (cameraPos) {
      gl.uniform3f(this.solidLocations.uCameraPos, cameraPos.x, cameraPos.y, cameraPos.z);
    }
    for (const bufs of this.chunkBuffers.values()) {
      this._drawBufferSet(bufs.solid, this.solidLocations);
    }

    // 2. 渲染所有水面方块 (半透明)
    // 理想情况下应该根据深度排序，但为了简化，直接在固体之后渲染
    gl.useProgram(this.waterProgram);
    gl.uniformMatrix4fv(this.waterLocations.uMVP, false, mvp.m);
    if (cameraPos) {
      gl.uniform3f(this.waterLocations.uCameraPos, cameraPos.x, cameraPos.y, cameraPos.z);
    }
    gl.uniform1f(this.waterLocations.uTime, performance.now() / 1000.0);
    
    for (const bufs of this.chunkBuffers.values()) {
      this._drawBufferSet(bufs.water, this.waterLocations);
    }
  }

  /** 调整画布大小 */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }
}

export { Renderer };
