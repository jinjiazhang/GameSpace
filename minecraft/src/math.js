/**
 * math.js - 向量与矩阵工具库
 * 提供3D游戏所需的基础数学运算，纯JS实现，无外部依赖
 */

// ===================== Vec3 三维向量 =====================

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  set(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    return this;
  }

  add(v) {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v) {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s) {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize() {
    const len = this.length();
    return len > 0 ? this.scale(1 / len) : new Vec3();
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }
}

// ===================== Mat4 4x4矩阵（列主序） =====================

class Mat4 {
  constructor() {
    // 16个元素，列主序存储，初始为单位矩阵
    this.m = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  /** 单位矩阵 */
  static identity() {
    return new Mat4();
  }

  /** 透视投影矩阵 */
  static perspective(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    const out = new Mat4();
    out.m[0] = f / aspect;
    out.m[5] = f;
    out.m[10] = (far + near) * nf;
    out.m[11] = -1;
    out.m[14] = 2 * far * near * nf;
    out.m[15] = 0;
    return out;
  }

  /** 视图矩阵（lookAt） */
  static lookAt(eye, center, up) {
    const z = eye.sub(center).normalize();
    const x = up.cross(z).normalize();
    const y = z.cross(x).normalize();

    const out = new Mat4();
    out.m[0] = x.x; out.m[1] = y.x; out.m[2] = z.x; out.m[3] = 0;
    out.m[4] = x.y; out.m[5] = y.y; out.m[6] = z.y; out.m[7] = 0;
    out.m[8] = x.z; out.m[9] = y.z; out.m[10] = z.z; out.m[11] = 0;
    out.m[12] = -x.dot(eye);
    out.m[13] = -y.dot(eye);
    out.m[14] = -z.dot(eye);
    out.m[15] = 1;
    return out;
  }

  /** 矩阵乘法 this × other */
  multiply(other) {
    const a = this.m, b = other.m;
    const out = new Mat4();
    const o = out.m;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        o[j * 4 + i] =
          a[i] * b[j * 4] +
          a[4 + i] * b[j * 4 + 1] +
          a[8 + i] * b[j * 4 + 2] +
          a[12 + i] * b[j * 4 + 3];
      }
    }
    return out;
  }
}

export { Vec3, Mat4 };
