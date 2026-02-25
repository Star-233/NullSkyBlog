# NullSkyBlog

基于 VitePress 搭建的静态博客网站。

[链接](https://star-233.github.io/NullSkyBlog/)

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

## 许可证

MIT
