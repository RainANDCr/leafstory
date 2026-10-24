# 发布检查清单（RELEASE_CHECKLIST）

> ✅ = 已在本仓库实测通过；⚠️ = 需要你在自己环境/后台确认；❌ = 明确未做（附原因）。

## 代码与测试（本仓库实测）

- ✅ `npm run lint` / `npm run typecheck`：0 错误
- ✅ `npm run test`：单测全绿（覆盖日期语义、可见性规则、问答两阶段、信件安全、导出排除、解除配对、年度统计、通知调度、AI 提示词与错误映射）
- ✅ `npm run build`：生产构建成功
- ✅ `npm run test:e2e`（Playwright + Chromium）：本地模式关键路径
  （注册→配对→日记→树反馈→纪念日→故事→心愿完成→信件封存→未到期不可开→私密日记不可见→导出入口）
- ✅ 三账号语义经单测覆盖（本地模式）；云端 RLS 的三账号实测 ⚠️ 见下

## 安全（需你在 Supabase 后台确认）

- ⚠️ 六个迁移已在你项目按序执行，且所有业务表 RLS = Enabled
- ⚠️ Storage 桶 `diary-media` 为私有（public=false）
- ⚠️ Site URL / Redirect URLs 已按 docs/WEB_DEPLOYMENT.md 配置
- ✅ 前端无 service_role / BYOK Key；Key 仅内存（测试验证不进 URL/localStorage）
- ✅ 信件正文零 SELECT 策略（仅 RPC）；问答两阶段 RLS；导出按构造排除越权内容
- ✅ `git ls-files` 无 .env / keystore / jks

## Web 部署

- ✅ `vercel.json`（SPA rewrite）与 `public/_redirects`（Cloudflare）已就绪
- ⚠️ 在 Vercel/Cloudflare 导入仓库并配置环境变量（见 docs/WEB_DEPLOYMENT.md）
- ⚠️ 部署后手测：刷新任意子路由不 404；登录/退出；照片上传与查看
- ⚠️ Supabase 邮件模板（可选：换成你们喜欢的语气）

## Android

- ✅ Capacitor 工程（app.leafstory.diary / 落叶物语）已生成；本地通知适配与设置开关就绪
- ❌ **APK 未构建**：本机无 Android SDK/JDK——在装有 Android Studio 的电脑上按 docs/ANDROID_BUILD.md 操作
- ⚠️ 替换占位图标/启动图；自备 keystore 并妥善备份
- ⚠️ 真机手测：登录回跳、相册上传、系统返回键、键盘/安全区、纪念日提醒授权

## 运维

- ⚠️ 备份策略（Supabase Backups + 重大节点前 db dump）
- ⚠️ 版本更新顺序：先执行新迁移 → 再部署前端/重打 APK
- ✅ 回滚：Vercel/Cloudflare 自带版本回退；数据库只增不删迁移

## 隐私声明（可随发布直接使用）

> 《落叶物语》是仅限两位成员的私密日记：无公开动态、无陌生人推荐、无广告与第三方追踪；定位默认关闭，地点由你主动添加；照片与文字仅存于你们的空间（或你自己的设备——本地模式）。地图瓦片来自 OpenStreetMap，加载地图时其服务商会看到大致访问区域（可用列表视图替代）。时光邮局的信件在到期前以服务端策略密封，任何一方（含我们）都无法提前阅读。AI 功能完全可选且自备 Key：只有你逐篇勾选并确认后，所选文字才会发送给你配置的模型服务商，费用由服务商决定；你的 Key 只保留在当前页面内存。

## 许可与第三方

- 代码：自有；依赖均为开源（MIT/Apache-2.0 类，`npm ls` 可查）
- 地图瓦片：OpenStreetMap（ODbL，需保留署名——MapView 已带 attribution）
- 字体：系统字体栈（PingFang/微软雅黑/思源等随系统授权），未捆绑分发的商用字体
- 插画/SVG/图标：本项目原创；emoji 为系统字体
