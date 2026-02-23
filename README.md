# NullSkyBlog

基于 VitePress 搭建的静态博客网站。

## 技术栈

- **VitePress** 2.0.0-alpha.16 - 静态网站生成器
- **Vue 3** - 嵌入式组件支持
- **pnpm** - 包管理器

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

启动本地开发服务器，支持热重载：

```bash
pnpm docs:dev
```

### 构建生产版本

```bash
pnpm docs:build
```

### 预览生产版本

```bash
pnpm docs:preview
```

## 项目结构

```
NullSkyBlog/
├── .vitepress/
│   └── config.mts        # VitePress 配置文件
├── markdown/              # 博客内容（Markdown 文件）
│   ├── index.md           # 首页
│   ├── markdown-examples.md
│   └── api-examples.md
├── package.json
└── pnpm-lock.yaml
```

## 写作指南

### 添加新文章

1. 在 `markdown/` 目录下创建新的 `.md` 文件
2. 添加 Frontmatter 头部信息
3. 使用 Markdown 编写内容，可嵌入 Vue 组件

### Frontmatter 格式

```yaml
---
title: 文章标题
outline: deep  # 可选：启用深层目录
---
```

### 嵌入 Vue 组件

```vue
<script setup>
import { useData } from 'vitepress'

const { frontmatter } = useData()
</script>

## {{ frontmatter.title }}
```

## 配置说明

修改 `.vitepress/config.mts` 文件来配置主题、导航栏、侧边栏等。

详细配置文档请参考：[VitePress 配置参考](https://vitepress.dev/reference/site-config)

## 许可证

MIT
