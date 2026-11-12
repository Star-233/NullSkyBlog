# NullSkyBlog

基于 [AstroPaper](https://github.com/satnaing/astro-paper) 的静态博客。

- 站点：https://star-233.github.io/NullSkyBlog/
- 框架：Astro 7 + Tailwind CSS 4
- 部署：GitHub Pages（GitHub Actions）

## 本地开发

需要 Node.js >= 22.23.4 和 pnpm。

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

构建产物在 `dist/`。

## 写文章

文章放在 `src/content/posts/`，新建 `.md` 或 `.mdx` 文件即可。配置在 `astro-paper.config.ts`。

## 部署

推送到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages。
