# Bridge 新闻快照 MVP

把公开新闻文章转换成可分享的静态阅读页。GitHub Actions 负责抓取，GitHub Pages 负责托管；本地电脑不需要保存文章。

## 部署

1. 将仓库推送到 GitHub，默认分支命名为 `main`。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 打开 **Actions → 生成文章快照 → Run workflow**，输入公开文章 URL。
4. 完成后打开该次运行的 Summary，复制分享地址。

如果默认分支启用了禁止机器人直接推送的保护规则，需要允许 GitHub Actions 推送，或暂时关闭该规则。

## 本地测试

```bash
npm ci
npm test
npm run capture -- "https://example.com/article"
python3 -m http.server 8000 --directory public
```

## MVP 边界

- 只处理无需登录即可访问的普通 HTML 文章。
- 每篇最多下载 30 张图片；网页和单张图片分别限制为 8 MB。
- 不支持视频、付费墙、DRM 和必须运行 JavaScript 才能显示正文的页面。
- 快照是公开静态文件；随机路径不是访问控制。
- 请仅保存和分享你有权使用的内容，并保留来源信息。
