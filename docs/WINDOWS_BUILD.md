# Windows EXE 构建（Electron）

> 状态：本机已实测构建出三个产物（见下）；应用名「落叶物语」，包标识 `app.leafstory.diary`。

## 产物

| 文件 | 说明 |
|---|---|
| `release/LeafStory-Setup-0.1.0.exe` | NSIS 安装包（可选安装目录、开始菜单/桌面快捷方式） |
| `release/LeafStory-Portable-0.1.0.exe` | 单文件便携版，双击即用 |
| `release/win-unpacked/落叶物语.exe` | 免安装目录版（调试用） |

未做代码签名：首次运行 Windows SmartScreen 可能提示「未知发布者」——点「仍要运行」即可；正式分发需自购代码签名证书并配置 `CSC_LINK/CSC_KEY_PASSWORD`。

## 构建

```bash
npm install
npm run electron:build     # = npm run build + electron-builder --win
npm run electron:start     # 本地直接运行打包前的窗口（需先 npm run build）
```

## 国内网络注意（本次实测踩坑）

electron-builder 需要从 GitHub Releases 下载 7zip / winCodeSign / nsis。若直连超时，用代理镜像下载后放入缓存（builder 检测到缓存即不再联网）：

```bash
# 以 ghproxy.net 为例（也可用任何可达的 GitHub 代理）
P=https://ghproxy.net/https://github.com/electron-userland/electron-builder-binaries/releases/download
CACHE="$LOCALAPPDATA/electron-builder/Cache"
mkdir -p "$CACHE/7zip@1.0.0" "$CACHE/winCodeSign-2.6.0" "$CACHE/nsis-3.0.4.1"
curl -L -o "$CACHE/7zip@1.0.0/7zip-win-x64.tar.gz"        "$P/7zip@1.0.0/7zip-win-x64.tar.gz"
curl -L -o "$CACHE/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" "$P/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
curl -L -o "$CACHE/nsis-3.0.4.1/nsis-3.0.4.1.7z"           "$P/nsis-3.0.4.1/nsis-3.0.4.1.7z"
```

Electron 本体可用 npmmirror：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。

## 桌面端行为

- 加载同一份 `dist/`；云端模式连接同一 Supabase（登录同一账号 = 同一份数据）
- 桌面端自动切换 HashRouter（`file://` 下路由正常）；外部链接（邮箱验证等）交系统浏览器打开
- 不内嵌任何私密 Key（anon key 为构建期注入的可公开值）
- 应用图标当前为 Electron 默认占位；替换：准备 256×256 `build/icon.ico` 后重新构建
