# AGENTS.md - Agent Coding Guidelines for NullSkyBlog

# :Snacks dashboard:Snacks dashboard# Project Overview

NullSkyBlog is a VitePress-based static blog site. Content is written in Markdown (`.md`) files located in the `markdown/` directory. VitePress configuration is in `.vitepress/config.mts`.

**Tech Stack:**

- VitePress 2.0.0-alpha.16
- Node.js (pnpm as package manager)

---

## Build / Development Commands

### Development

```bash
pnpm docs:dev       # Start local dev server with hot reload
```

### Build

```bash
pnpm docs:build     # Build for production
pnpm docs:preview   # Preview production build locally
```

### Running a Single Test

No tests are currently configured in this project.

---

## Code Style Guidelines

### General Principles

1. **Keep it simple** - This is a blog/documentation site, not a complex webapp
2. **Prefer Markdown over Vue** - Use Vue components only when Markdown cannot achieve the desired functionality
3. **Consistency over cleverness** - Follow existing patterns in the codebase

### TypeScript / Configuration Files

- Use TypeScript (`.ts`, `.mts`) for all VitePress config files
- Use ESM import/export syntax (`import { defineConfig } from 'vitepress'`)

```typescript
// Good
import { defineConfig } from 'vitepress'

export default defineConfig({
  srcDir: "markdown",
  title: "NullSkyBlog"
})
```

### Vue Components in Markdown

- Use `<script setup>` syntax for Vue components embedded in Markdown
- Import Vue composition APIs explicitly

```vue
<script setup>
import { useData } from 'vitepress'

const { frontmatter } = useData()
</script>
```

### File Naming Conventions

- Markdown files: `kebab-case-with-words.md` (e.g., `getting-started.md`)
- Config files: Use `.mts` extension for TypeScript configs
- Vue components in markdown: PascalCase (e.g., `CodeBlock.vue`)

### Frontmatter Standards

Every Markdown file should include frontmatter with at least:

```yaml
---
outline: deep  # Optional: enables deep outline for table of contents
---
```

### Import Conventions

- Use absolute imports from `'vitepress'` for built-in APIs
- Group imports logically (standard library, third-party, project-specific)
- Use newline between import groups

```typescript
// VitePress APIs
import { useData, useRoute } from 'vitepress'

// Third-party (if needed)
import { ref, computed } from 'vue'
```

### Formatting

- Use 2 spaces for indentation in config files
- Use trailing commas in objects and arrays
- Maximum line length: 100 characters (soft limit for configs)

### Error Handling

- VitePress handles most errors gracefully with built-in error messages
- For custom Vue components, use try/catch for async operations
- Provide meaningful error messages in frontmatter if pages have known limitations

### Markdown Best Practices

1. **Headers** - Use ATX-style headers (`#`, `##`, `###`)
2. **Links** - Use relative links for internal pages, absolute for external
3. **Code blocks** - Specify language for syntax highlighting
4. **Images** - Place images in appropriate directories; use relative paths

```markdown
[Internal Link](./other-page)
[External Link](https://example.com)

![Image](./images/screenshot.png)
```

---

## Project Structure

```
NullSkyBlog/
├── .vitepress/
│   └── config.mts        # VitePress configuration
├── markdown/             # Blog content (Markdown files)
│   ├── index.md
│   ├── markdown-examples.md
│   └── api-examples.md
├── package.json
└── pnpm-lock.yaml
```

---

## Adding New Features

### Adding a New Blog Post

1. Create a new `.md` file in `markdown/` directory
2. Add appropriate frontmatter
3. Write content using Markdown or embed Vue components as needed

### Modifying Theme Configuration

Edit `.vitepress/config.mts` - refer to [VitePress Config Reference](https://vitepress.dev/reference/site-config)

### Adding Custom Vue Components

1. Create Vue component file (or use inline `<script setup>` in markdown)
2. Import and use in Markdown file

---

## Important Notes

- **No linting configured** - Manually review code for style consistency
- **No tests configured** - Test changes manually using `pnpm docs:preview`
- **No type checking** - This is a simple documentation site without TypeScript in content files
- **VitePress handles bundling** - No manual build configuration needed

---

## Useful Resources

- [VitePress Documentation](https://vitepress.dev/)
- [VitePress Default Theme Config](https://vitepress.dev/reference/default-theme-config)
- [VitePress Runtime APIs](https://vitepress.dev/reference/runtime-api)
