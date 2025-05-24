# smart-yoga-beginner-app

本项目为 [Rork](https://rork.com) 平台生成的智能瑜伽入门App，基于 React Native / Expo。

## 项目目标

- 实现一套最小可用版的智能瑜伽训练应用，后续迁移为 **微信小程序**，并与自研云函数、姿势检测、语音提醒等模块集成。

## 当前状态

- [x] Rork自动生成React Native完整代码
- [x] 主要页面、mock业务逻辑齐全
- [ ] 微信小程序目录结构适配（待AI迁移）
- [ ] 体式图片、音频、序列JSON等资源需补齐
- [ ] 后端云函数/AI打分/云存储对接（待融合）

## 目录结构
```text
app/                  # 主要页面和导航
  _layout.tsx
  index.tsx
  meditation.tsx
  sequence/[level].tsx
assets/images/         # 项目图标等图片
services/yoga-api.ts   # Mock API与业务逻辑
stores/sequence-store.ts
package.json           # 依赖配置
tsconfig.json
