/**
 * renderer.js - WebGL 渲染器
 * 负责编译着色器、管理缓冲区、绘制区块网格
 */

import { Mat4 } from './math.js';

/** 顶点着色器 */
const VS_SOURCE = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  uniform mat4 uMVP;
  
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  
  void main() {
    gl_Position = uMVP * vec4(aPosition, 1.0);
    vColor = aColor;
    vNormal = aNormal;
    vWorldPos = aPosition;
  }
`;

/** 片段着色器 */
const FS_SOURCE = `
  precision mediump float;
  
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  
  uniform vec3 uCameraPos;
  
  // 光照常量设置
  const vec3 lightDir = normalize(vec3(0.5, 0.9, 0.3)); // 太阳光方向
  const vec3 lightColor = vec3(1.0, 0.96, 0.88);        // 阳光颜色（偏暖）
  const vec3 ambientColor = vec3(0.4, 0.45, 0.5);       // 环境光（偏蓝/灰，模拟天光）
  const vec3 skyColor = vec3(0.53, 0.81, 0.98);         // 天空颜色，用于雾气混合

  void main() {
    // 1. 漫反射光照 (Lambert)
    vec3 norm = normalize(vNormal);
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;

    // 合并光照与方块底色
    vec3 finalColor = (ambientColor + diffuse) * vColor;

    // 2. 距离雾 (Fog)
    float dist = length(uCameraPos - vWorldPos);
    // 雾气范围：40格开始起雾，80格完全融入天空背景
    float fogFactor = smoothstep(40.0, 80.0, dist);
    
    finalColor = mix(finalColor, skyColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

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
    this.program = this._createProgram(VS_SOURCE, FS_SOURCE);

    // 获取 attribute / uniform 位置
    this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
    this.aNormal = gl.getAttribLocation(this.program, 'aNormal');
    this.aColor = gl.getAttribLocation(this.program, 'aColor');
    this.uMVP = gl.getUniformLocation(this.program, 'uMVP');
    this.uCameraPos = gl.getUniformLocation(this.program, 'uCameraPos');

    // GL 状态
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
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

  /**
   * 上传 Chunk 网格数据到 GPU
   * @param {string} key - "cx,cz"
   * @param {object} mesh - Chunk.buildMesh() 的返回值
   */
  uploadChunkMesh(key, mesh) {
    const gl = this.gl;

    // 如果已有旧缓冲区，先删除
    if (this.chunkBuffers.has(key)) {
      const old = this.chunkBuffers.get(key);
      gl.deleteBuffer(old.posBuf);
      gl.deleteBuffer(old.normBuf);
      gl.deleteBuffer(old.colBuf);
      gl.deleteBuffer(old.idxBuf);
    }

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

    this.chunkBuffers.set(key, {
      posBuf, normBuf, colBuf, idxBuf,
      indexCount: mesh.indices.length,
    });
  }

  /** 删除指定区块的 GPU 缓冲区 */
  removeChunkMesh(key) {
    if (this.chunkBuffers.has(key)) {
      const buf = this.chunkBuffers.get(key);
      const gl = this.gl;
      gl.deleteBuffer(buf.posBuf);
      gl.deleteBuffer(buf.normBuf);
      gl.deleteBuffer(buf.colBuf);
      gl.deleteBuffer(buf.idxBuf);
      this.chunkBuffers.delete(key);
    }
  }

  // ---- 渲染 ----

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

    gl.useProgram(this.program);

    const mvp = projMatrix.multiply(viewMatrix);
    gl.uniformMatrix4fv(this.uMVP, false, mvp.m);

    if (cameraPos) {
      gl.uniform3f(this.uCameraPos, cameraPos.x, cameraPos.y, cameraPos.z);
    }

    // 遍历所有区块缓冲区进行绘制
    for (const buf of this.chunkBuffers.values()) {
      // Position
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf);
      gl.enableVertexAttribArray(this.aPosition);
      gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);

      // Normal
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf);
      gl.enableVertexAttribArray(this.aNormal);
      gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);

      // Color
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.colBuf);
      gl.enableVertexAttribArray(this.aColor);
      gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 0, 0);

      // Draw
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idxBuf);
      gl.drawElements(gl.TRIANGLES, buf.indexCount, gl.UNSIGNED_INT, 0);
    }
  }

  /** 调整画布大小 */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }
}

export { Renderer };
