# 贡献指南

感谢你愿意改进 StockBubble！

## 开发环境

- Windows 10 / 11
- Node.js ≥ 18
- npm ≥ 9

```bash
npm install
npm start
```

## 提交前自检

1. `npm start` 能正常启动，托盘菜单、设置窗口、气泡显示均正常
2. 改动涉及行情解析时，分别用 A股、港股、美股、指数各验证一次
3. 改动涉及轮播/滚动时，确认「刷新不打断轮播」这条约束没有被破坏
4. 不提交 `node_modules/`、`release/`、`store-build/` 等产物（已在 .gitignore 中）

## 代码约定

- 主进程与渲染进程通过 `preload.js` 的 contextBridge 通信，**不要开启 `nodeIntegration`**
- 配置项新增字段需在 `src/store.js` 的 `DEFAULT_CONFIG` 中给出默认值，
  若语义变更需同步升级 `CONFIG_VERSION` 并写迁移逻辑，保证老用户配置平滑升级
- 中文注释，标识符英文

## 提交信息

建议使用约定式提交：

```
feat: 新增指数支持
fix: 修复接口缺项时轮播被重置
docs: 补充商店发布说明
refactor: 拆分刷新与轮播调度
```

## 提交 PR

- 说明「解决了什么问题」而非「改了哪些行」
- 涉及界面改动请附截图或 GIF
- 保持单个 PR 聚焦一件事

## 报告问题

请在 Issue 中附上：

- Windows 版本、应用版本（托盘右键 → 关于）
- 复现步骤
- 相关日志（`%APPDATA%\stock-bubble\` 下，如有）
