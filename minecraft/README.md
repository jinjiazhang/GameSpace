# 🎮 我的世界 JS 版

纯 JavaScript 实现的《我的世界》风格体素游戏，支持**浏览器**和**微信小游戏**双平台运行。

## ✨ 特性

- 🌍 程序化地形生成（Simplex Noise + 分形布朗运动）
- 🧱 11 种方块类型（草地、泥土、石头、沙子、水、木头、树叶等）
- 🌲 自动树木生成
- 🏔️ 生物群系（沙滩、雪地、草原）
- 🎯 第一人称视角 + WASD 移动 + 鼠标控制
- 💥 AABB 碰撞检测 + 重力物理
- 🖥️ WebGL 渲染（面剔除 + 方向光照）
- 📱 微信小游戏适配（虚拟摇杆 + 触摸视角）
- 📦 面向对象编程，代码结构清晰

## 📁 项目结构

```
minecraft/
├── index.html          # 浏览器入口页面
├── build.js            # 微信小游戏打包脚本
├── src/
│   ├── main.js         # 入口文件（自动检测环境）
│   ├── game.js         # 游戏主类（主循环、子系统管理）
│   ├── world.js        # 世界管理（区块调度、地形生成）
│   ├── chunk.js        # 区块数据（方块存储、网格构建）
│   ├── blocks.js       # 方块注册表（类型定义）
│   ├── noise.js        # Simplex 噪声生成器
│   ├── renderer.js     # WebGL 渲染器
│   ├── player.js       # 玩家与相机系统
│   ├── input.js        # 输入抽象层（键鼠+触摸）
│   └── math.js         # 向量与矩阵工具库
└── wx/
    ├── game.js         # 微信小游戏入口（打包后）
    └── game.json       # 微信小游戏配置
```

## 🚀 运行方式

### 浏览器

直接用 HTTP 服务器打开 `index.html`：

```bash
cd minecraft
python -m http.server 8080
# 访问 http://localhost:8080
```

**操作说明：**
- 🖱️ 点击屏幕锁定鼠标
- `W/A/S/D` 移动
- `空格` 跳跃
- `ESC` 释放鼠标

### 微信小游戏

1. 运行打包脚本：
```bash
node build.js
```

2. 将 `wx/` 目录上传到微信开发者工具

**触摸操作：**
- 左半屏虚拟摇杆移动
- 右半屏滑动控制视角
- 向上推摇杆跳跃

## 🏗️ 架构设计

### 模块职责

| 模块 | 职责 |
|------|------|
| `Game` | 主循环、子系统协调 |
| `World` | 区块调度、全局方块读写 |
| `Chunk` | 16×64×16 方块数据、网格构建 |
| `Renderer` | WebGL 着色器、缓冲区管理、绘制 |
| `Player` | 位置/速度/碰撞、相机矩阵 |
| `Input` | 浏览器键鼠 / 微信触摸适配 |
| `Blocks` | 方块类型注册表 |
| `SimplexNoise` | 程序化噪声 |

### 渲染流程

```
Chunk.buildMesh() → 仅渲染暴露面（面剔除）
       ↓
Renderer.uploadChunkMesh() → 上传顶点/法线/颜色/索引到 GPU
       ↓
Renderer.render() → 设置 MVP 矩阵，绘制所有区块
```

### 地形生成

使用 Simplex Noise 的 FBM（分形布朗运动）生成高度图，根据高度分配不同方块类型，并随机放置树木。

## 📋 技术要求

- WebGL 支持（需 `OES_element_index_uint` 扩展）
- 现代浏览器（Chrome / Firefox / Safari / Edge）
- 微信小游戏基础库 2.0+

## License

MIT
