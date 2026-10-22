# 股票气泡 StockBubble

> 挂在桌面上的个股实时价格气泡 —— 不占窗口、不挡鼠标，扫一眼就知道行情。

支持 **A股 / 港股 / 美股 / 指数**，数据来自腾讯财经行情接口（无需注册 API Key）。

- **不打扰**：透明无边框窗口，默认鼠标穿透，全天贴在屏幕角落也不碍事
- **位置自由**：自动贴在任务栏上方居中，也可以拖到桌面任意位置，甚至直接压在任务栏里
- **两种显示方式**：气泡原地轮播（默认），或横向无缝滚动
- **涨红跌绿**：符合 A 股习惯配色，价格变动时脉冲高亮
- **极轻量**：常驻内存约 100MB，纯 Electron 无多余依赖

## 效果

> 截图位：安装后可在托盘菜单右键截图补充，或直接打开 `demo/index.html` 在浏览器预览气泡动画（含"模拟一次行情刷新"按钮）。

轮播模式的行为：气泡外壳（尺寸、位置）**始终固定**，只有气泡里的文字在切换 ——
旧内容轻轻上浮淡出、新内容自下浮入，过渡约 0.6 秒，默认每 6 秒换一只。

## 核心设计：刷新与切换是两个独立的事

这是本项目最容易被做错的地方，也是它和其他行情小工具的差别所在：

| | 数据刷新间隔 | 内容轮播间隔 |
| --- | --- | --- |
| 决定什么 | 多久向接口取一次最新价 | 每只股票在气泡里停留多久 |
| 影响范围 | 只替换数字，不重排、不动轮播、不改气泡宽度 | 只由它自己决定 |
| 默认值 | 5 秒（2~60 秒可调） | 6 秒（2~30 秒可调） |

两者互不影响。刷新期间即使某只股票没取到数据（休市、接口缺项、网络抖动），
也沿用上一笔并标记为 stale，**不会打乱轮播顺序或把轮播重置回第一只** ——
主进程 `fillMissing` 保证返回数组长度恒定，是这一行为的关键。

## 安装

### 方式一：下载安装包（推荐）

前往 [Releases](../../releases) 下载最新的 `StockBubble-Setup-x.y.z.exe`：

1. 双击运行，选择安装目录（默认即可）→ 安装
2. 勾选"运行股票气泡"→ 完成
3. 屏幕上即出现行情气泡，桌面/开始菜单会创建带图标的快捷方式

> 安装包未做代码签名，首次运行如遇 Windows SmartScreen 提示，点击「更多信息 → 仍要运行」即可。

### 方式二：从源码运行

```bash
git clone https://github.com/<your-name>/stock-bubble.git
cd stock-bubble
npm install
npm start
```

## 使用

- **添加/删除股票**：右键托盘图标（屏幕右下角）→ `设置…`，输入代码添加
  - A股：`600519`、`000001`、`300750`（也可直接输中文名搜索）
  - 港股：`00700`
  - 美股：`AAPL`、`NVDA`
  - 指数：`sh000001`、`sz399001`
- **切换显示方式**：托盘右键 → `显示方式` → 轮播 / 横向滚动；也可在设置窗口切换
- **移动气泡位置**：托盘右键 → `移动气泡位置…`，或用设置窗口的「拖动定位气泡」。
  气泡会出现蓝色虚线框，按住拖到任意位置（可以压在任务栏上），松手自动保存并重新锁定。
  想恢复默认位置：托盘右键 → `气泡回到任务栏`。
- **鼠标穿透**：默认开启，气泡不挡鼠标操作。关掉后可以直接拖动气泡。

## 可调项

| 项目 | 范围 | 说明 |
| --- | --- | --- |
| 内容轮播间隔 | 2 ~ 30 秒 | 每只股票在气泡里停留多久（默认 6 秒），与刷新频率无关 |
| 滚动速度 | 0 ~ 200 px/s | 滚动模式下的移动速度 |
| 气泡高度 | 24 ~ 60 px | |
| 透明度 | 30% ~ 100% | |
| 横向宽度 | 40% ~ 100% 屏宽 | 仅滚动模式；轮播模式窗口自动贴合气泡 |
| 距任务栏间距 | 0 ~ 40 px | 仅贴任务栏时有效 |
| 数据刷新间隔 | 2 ~ 60 秒 | 多久取一次最新价；只更新数字，不打断轮播 |
| 开机自启 | 开 / 关 | |

配置保存在 `%APPDATA%\stock-bubble\config.json`。

## 开发

```bash
npm start          # 本地运行
npm run dist       # 打包 Windows 安装程序 → release/
npm run dist:store # 打包微软商店 AppX → store-build/
```

打包缓存默认写入用户目录。国内网络建议设置镜像：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

如果遇到杀毒软件锁定 `win-unpacked.tmp` 导致 `EPERM`，可加上 `-c.electronDist=node_modules/electron/dist`
跳过 electron 解压环节（`build.cmd` 已内置该参数）。

### 目录结构

```
src/main.js        主进程：气泡定位（贴任务栏 / 自定义坐标）、拖动定位、托盘、行情轮询、IPC
src/quotes.js      腾讯行情接口（qt.gtimg.cn，GBK 解码）+ 股票搜索
src/store.js       配置读写、股票代码归一化、版本迁移
src/preload.js     contextBridge 安全桥
src/bar.html/js    气泡渲染：轮播（固定外壳 + 内容交叉淡入 + 进度条）/ 无缝滚动、涨红跌绿、价格脉冲
src/settings.html  设置窗口
build/             应用图标（make_icon.py 生成 icon.ico / tray.png / appx 商店图标）
demo/index.html    气泡效果演示页（浏览器直接打开，无需安装）
tools/             辅助脚本
```

## 发布到 Microsoft Store

项目已内置 AppX 打包配置，`npm run dist:store` 产出的 `StockBubble-1.3.0.appx` 可直接上传：

1. 在 [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com) 注册开发者账户（个人账户免费，身份证 + 人脸验证）
2. Partner Center → New product → 预留应用名
3. 上传 `.appx`，填写截图、描述、年龄分级问卷
4. 提交认证，通常 1~3 个工作日

> AppX 包无需自行签名，商店认证通过后由微软自动重签名。
> 提交前请把 `package.json` 里的 `build.appx.identityName` / `publisher` 改成你在 Partner Center 预留的名称。

## 免责声明

行情数据来源于腾讯财经公开接口，仅供参考，**不构成任何投资建议**。
接口可用性、数据准确性由数据提供方决定，本项目不对由此产生的任何损失负责。

## License

[MIT](LICENSE)
