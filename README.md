# 静读 iOS 免费侧载版

经文、阅读界面和笔记功能内置在 App 中，启动不依赖 GitHub Pages 或电脑。助手和朗读由手机直接调用用户配置的千问 API，仍按 API 账户计费。本项目使用 Capacitor 8.5.3，最低支持 iOS 18。

## Windows 安装到 iPhone

1. 按 [AltStore Classic 的 Windows 官方教程](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows) 安装 AltServer、所需的 Apple 组件，并通过 USB 将 AltStore 安装到 iPhone。Apple 账号只在官方安装工具中登录，不要发给他人。
2. 根据系统提示信任开发者，并启用 iPhone「设置 → 隐私与安全性 → 开发者模式」。
3. 在 iPhone 下载本项目发布的 `Jingdu-unsigned.ipa` 并保存到“文件”。它需要由 AltStore 使用你的 Apple 账号重新签名，不能直接点 IPA 安装。
4. 电脑保持 AltServer 运行，手机与电脑处于同一 Wi-Fi（或 USB 连接），打开 AltStore → My Apps → 左上角 +，选择 IPA。
5. 打开「静读」，在「助手 → 设置」填写自己的百炼 Key。经文无需联网；助手及语音需要网络。

免费账号的安装签名有效期为 7 天；到期前使用 AltStore 的 Refresh All 续签，需要电脑上的 AltServer 配合，日常阅读不需要开电脑。免费侧载一般最多同时启用 3 个 App（包括 AltStore）。详见 [官方说明](https://faq.altstore.io/altstore-classic/your-altstore)。

## 笔记与密钥

App 与 Safari / 主屏幕网页版的存储互相独立。先从网页版导出笔记 JSON，再在 App 的读经笔记区导入。App 的“导出”会打开 iOS 分享菜单，可选“存储到文件”。密钥存储在此 App 的 WebView 本地存储中，不是系统钥匙串，不进入笔记备份，也不上传 GitHub。卸载 App 会删除其本地数据，升级和续签时请保留原 App 并提前备份笔记。

## 更新与编译

网页版更新不会自动替换 App 内置文件。安装新版 IPA 升级；保持相同 Bundle ID 和签名账号有助于保留数据。

GitHub Actions 工作流 `.github/workflows/ios.yml` 使用标准 macOS runner，生成未签名的 iPhone Release IPA，供 AltStore 重签。只使用公开代码及经文，不需要 Apple 证书、Apple 密码或百炼密钥。GitHub 构建产物保留 7 天，下载后可自行保存。

Mac 本地构建：安装 Node 22+ 和 Xcode 26+，运行 `npm ci`、`npm run sync`、`npm run open`。网页文件在 `www/`，该目录由上级本地开发工程的 `scripts/build-ios.py` 生成。

## 经文来源

原数据来自 [thiagobodruk/bible](https://github.com/thiagobodruk/bible) 贡献者，固定版本 `13225a15fa5e3e3043495b0c82df56c3fdfeb7f4` 的 `json/zh_cuv.json`，上游声明 [CC BY-NC 2.0 BR](https://creativecommons.org/licenses/by-nc/2.0/br/)。用 OpenCC t2s 转为简体并清理空白，保留原章节目次；未逐节校勘。完整来源和变更见 `www/data/source.json`。此侧载版用于个人非商业使用。
