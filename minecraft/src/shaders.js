/**
 * shaders.js - WebGL 着色器定义
 */

export const BasicVertexShader = `
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

export const SolidFragmentShader = `
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
    vec3 texColor = vColor;
    vec3 localP = fract(vWorldPos);

    // 固体方块处理
    // 1. 像素化噪点
    vec3 blockCoord = floor(vWorldPos * 16.0);
    float noise = fract(sin(dot(blockCoord, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    texColor *= (0.94 + 0.12 * noise);

    // 2. 边缘伪环境光遮蔽 (Fake AO) - 极其微弱，仅提供一点体积感而不是网格线
    vec3 distToEdge = min(localP, 1.0 - localP);
    float edgeDist = 1.0;
    vec3 absNorm = abs(normalize(vNormal));
    if (absNorm.x > 0.5) edgeDist = min(distToEdge.y, distToEdge.z);
    else if (absNorm.y > 0.5) edgeDist = min(distToEdge.x, distToEdge.z);
    else edgeDist = min(distToEdge.x, distToEdge.y);

    // 极细的接缝：只有边缘 1% 范围内才受影响，且暗度只有 10%
    float ao = smoothstep(0.0, 0.015, edgeDist);
    texColor *= (0.90 + 0.10 * ao);

    // 3. 漫反射光照 (Lambert)
    vec3 norm = normalize(vNormal);
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;

    // 合并光照
    vec3 finalColor = (ambientColor + diffuse) * texColor;

    // 4. 距离雾 (Fog)
    float dist = length(uCameraPos - vWorldPos);
    float fogFactor = smoothstep(40.0, 80.0, dist);
    finalColor = mix(finalColor, skyColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/**
 * 玩家模型专用着色器
 * - uModel: 部件的世界变换矩阵（平移+旋转）
 * - uVP:    投影 * 视图矩阵（不含模型变换，单独传入）
 */
export const PlayerVertexShader = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;

  uniform mat4 uModel;  // 部件模型矩阵
  uniform mat4 uVP;     // View-Projection 矩阵

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = uModel * vec4(aPosition, 1.0);
    gl_Position = uVP * worldPos;
    vWorldPos = worldPos.xyz;
    vColor = aColor;
    // 法线变换：只需旋转部分（忽略非均匀缩放）
    vNormal = mat3(uModel) * aNormal;
  }
`;

export const PlayerFragmentShader = `
  precision mediump float;

  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  uniform vec3 uCameraPos;

  const vec3 lightDir = normalize(vec3(0.5, 0.9, 0.3));
  const vec3 lightColor = vec3(1.0, 0.96, 0.88);
  const vec3 ambientColor = vec3(0.35, 0.4, 0.45);
  const vec3 skyColor = vec3(0.53, 0.81, 0.98);

  void main() {
    vec3 norm = normalize(vNormal);
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;
    vec3 finalColor = (ambientColor + diffuse) * vColor;

    // 距离雾
    float dist = length(uCameraPos - vWorldPos);
    float fogFactor = smoothstep(40.0, 80.0, dist);
    finalColor = mix(finalColor, skyColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/**
 * HUD 覆盖层着色器
 * 将一张 2D Canvas 纹理以正交投影全屏覆盖到 WebGL 画布上
 * aPosition: vec2，范围 [-1, 1]（NDC 坐标，直接省略矩阵运算）
 * aTexCoord: vec2，范围 [0, 1]
 */
export const HudVertexShader = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aTexCoord;
  }
`;

export const HudFragmentShader = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  void main() {
    gl_FragColor = texture2D(uTexture, vTexCoord);
  }
`;

export const WaterFragmentShader = `
  precision mediump float;
  
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  
  uniform vec3 uCameraPos;
  uniform float uTime;
  
  const vec3 lightDir = normalize(vec3(0.5, 0.9, 0.3));
  const vec3 lightColor = vec3(1.0, 0.96, 0.88);
  const vec3 ambientColor = vec3(0.4, 0.45, 0.5);
  const vec3 skyColor = vec3(0.53, 0.81, 0.98);

  void main() {
    vec3 texColor = vColor;

    vec3 norm = normalize(vNormal);
    float diff = max(dot(norm, lightDir), 0.0);
    
    // 水面特殊光照：增加一点高光反射感，减弱漫反射
    vec3 diffuse = diff * lightColor * 0.7 + vec3(0.1, 0.2, 0.3);

    // 合并光照
    vec3 finalColor = (ambientColor + diffuse) * texColor;

    // 雾气
    float dist = length(uCameraPos - vWorldPos);
    float fogFactor = smoothstep(40.0, 80.0, dist);
    finalColor = mix(finalColor, skyColor, fogFactor);

    // 水的透明度 (Alpha值越大，水越不透明)
    gl_FragColor = vec4(finalColor, 0.95);
  }
`;
