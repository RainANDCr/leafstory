# Android APK 打包指南（Capacitor）

> 状态说明：`android/` 原生工程已生成并纳入仓库（包名 `app.leafstory.diary`，
> 应用名「落叶物语」，图标为 Capacitor 默认占位）。**本机未安装 Android
> SDK/JDK，APK 尚未实际构建**——按本文档在你装有 Android Studio 的电脑上操作。

## 0. 环境要求

- Android Studio（Ladybug 或更新）+ 其自带 JDK 17
- Node.js ≥ 20（本仓库已用）
- （可选发布）自备 keystore：`keytool -genkey -v -keystore leafstory.jks -keyalg RSA -keysize 2048 -validity 10000 -alias leafstory`

## 1. 首次构建

```bash
npm install            # 安装依赖（含 @capacitor/android）
npm run build          # 构建前端到 dist/
npx cap sync android   # 同步 web 资源与插件到原生工程
```

然后用 Android Studio：**Open → 选择仓库里的 `android/` 目录** → 等 Gradle 同步完成。

## 2. 调试运行与 debug APK

- 连接手机（开发者模式 + USB 调试）或启动模拟器 → Run ▶。
- 命令行 debug APK：

```bash
cd android
./gradlew assembleDebug        # 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

debug APK 直接可安装（设置 → 安全 → 允许未知来源）。

## 3. 签名 Release APK

`android/key.properties`（**不要提交 Git**，.gitignore 已忽略）：

```properties
storeFile=../../leafstory.jks   # 或绝对路径
storePassword=你的keystore密码
keyAlias=leafstory
keyPassword=你的key密码
```

在 `android/app/build.gradle` 的 `android {}` 内加入（若尚无）：

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
    }
}
```

```bash
cd android && ./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

**keystore 与密码务必备份到安全位置：丢了就无法给老用户发更新。**

## 4. 应用图标与启动图

当前为占位图标。替换：Android Studio 里右键 `android/app/src/main/res` →
New → Image Asset，导入 1024×1024 图标（可用 `public/favicon.svg` 导出）。
启动图同理（New → Vector / Image Asset）。

## 5. 行为说明（与 Web 的一致性）

- **数据**：云端模式下 APK 与网站访问同一个 Supabase，登录同一账号即同一份数据；
  未配置 `.env` 时为本地模式（数据存手机，卸载即清空）。APG/安装包内
  **不含** service_role 或任何 BYOK Key（AI Key 仅会话内存）。
- **登录重定向**：邮箱验证/找回密码链接按 Site URL 在浏览器打开后，回到
  应用内已是登录态（同一 WebView 存储会话）；如需应用内深链，后续在
  Supabase Redirect URLs 增加 `app.leafstory.diary://` 并配置 intent-filter。
- **照片上传**：WebView 内 `<input type="file">` 原生支持相册/拍照选择。
- **系统返回键**：走 WebView 历史栈（返回上一页），栈底退出应用（Capacitor 默认）。
- **纪念日提醒**：设置 → 偏好 → 开启「纪念日提醒」并授权（运行时权限），
  本地通知在未来 30 天的纪念日当天 09:00 提醒；应用被杀/关机期间的新增
  纪念日不保证即时重排（下次打开应用重排），不做虚假承诺。

## 6. 常见问题

- Gradle 同步失败：检查 `android/variables.gradle` 的 SDK 版本与本地 Android Studio 匹配。
- 白屏：确认执行过 `npm run build && npx cap sync android`（webDir=dist）。
