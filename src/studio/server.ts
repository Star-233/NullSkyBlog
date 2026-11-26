import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import {
  formatShanghaiNow,
  generateSlugFromTitle,
  normalizeFrontmatter,
  parsePostContent,
  serializePostContent,
} from "./frontmatter";
import type { StudioFrontmatter, StudioGitStatus, StudioPost } from "./types";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const POSTS_REL_DIR = "src/content/posts";
const ASSETS_IMAGES_REL_DIR = "src/assets/images";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

export function getVditorDistDir(): string {
  const pkgPath = require.resolve("vditor/package.json");
  return path.join(path.dirname(pkgPath), "dist");
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function resolveInside(rootDir: string, relPath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relPath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error("非法路径：不允许访问工作区目录之外的文件");
  }
  return resolvedTarget;
}

function computePostSlug(relToPostsDir: string): string {
  const withoutExt = relToPostsDir.replace(/\.(md|mdx)$/i, "");
  return withoutExt;
}

async function collectMarkdownFiles(
  dir: string,
  baseDir: string
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMarkdownFiles(fullPath, baseDir)));
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      results.push(toPosix(path.relative(baseDir, fullPath)));
    }
  }
  return results;
}

export async function listStudioPosts(rootDir: string): Promise<StudioPost[]> {
  const postsRoot = resolveInside(rootDir, POSTS_REL_DIR);
  await fs.mkdir(postsRoot, { recursive: true });

  const relFiles = await collectMarkdownFiles(postsRoot, postsRoot);
  const posts: StudioPost[] = [];

  for (const relFile of relFiles) {
    const absPath = resolveInside(postsRoot, relFile);
    const content = await fs.readFile(absPath, "utf-8");
    const { frontmatter, body } = parsePostContent(content);
    posts.push({
      filePath: `${POSTS_REL_DIR}/${relFile}`,
      slug: computePostSlug(relFile),
      frontmatter,
      body,
    });
  }

  posts.sort((a, b) => {
    const timeA = Date.parse(a.frontmatter.pubDatetime) || 0;
    const timeB = Date.parse(b.frontmatter.pubDatetime) || 0;
    return timeB - timeA;
  });

  return posts;
}

function sanitizePostRelPath(rootDir: string, filePath: string): {
  absPath: string;
  relToPosts: string;
  normFilePath: string;
} {
  const norm = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm.startsWith(`${POSTS_REL_DIR}/`)) {
    throw new Error("文章路径必须位于 src/content/posts/ 下");
  }
  if (!/\.(md|mdx)$/i.test(norm)) {
    throw new Error("文章文件扩展名必须为 .md 或 .mdx");
  }

  const relToPosts = norm.slice(POSTS_REL_DIR.length + 1);
  const segments = relToPosts.split("/");
  if (segments.some(seg => !seg || seg === "." || seg === ".." || seg.startsWith("_"))) {
    throw new Error("文章路径包含非法或下划线开头的片段");
  }

  const postsRoot = resolveInside(rootDir, POSTS_REL_DIR);
  const absPath = resolveInside(postsRoot, relToPosts);
  return { absPath, relToPosts, normFilePath: `${POSTS_REL_DIR}/${relToPosts}` };
}

export async function saveStudioPost(
  rootDir: string,
  payload: {
    filePath: string;
    frontmatter: Partial<StudioFrontmatter>;
    body: string;
  }
): Promise<StudioPost> {
  const { absPath, relToPosts, normFilePath } = sanitizePostRelPath(
    rootDir,
    payload.filePath
  );
  const fm = normalizeFrontmatter(payload.frontmatter as Record<string, unknown>);
  if (!fm.title.trim()) {
    throw new Error("文章标题（title）不能为空");
  }
  if (!fm.description.trim()) {
    throw new Error("文章简介（description）不能为空");
  }

  const serialized = serializePostContent(fm, payload.body);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, serialized, "utf-8");

  return {
    filePath: normFilePath,
    slug: computePostSlug(relToPosts),
    frontmatter: fm,
    body: payload.body,
  };
}

export async function createStudioPost(
  rootDir: string,
  payload: { title: string; slug?: string; ext?: "md" | "mdx" }
): Promise<StudioPost> {
  const title = (payload.title || "").trim() || "未命名文章";
  const ext = payload.ext === "mdx" ? "mdx" : "md";
  const rawSlug = (payload.slug || "").trim() || generateSlugFromTitle(title);

  const safeSlug = rawSlug
    .replace(/\\/g, "/")
    .split("/")
    .map(seg =>
      seg
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "")
    )
    .filter(Boolean)
    .join("/");

  const finalSlug = safeSlug || generateSlugFromTitle("");
  const filePath = `${POSTS_REL_DIR}/${finalSlug}.${ext}`;
  const { absPath, relToPosts } = sanitizePostRelPath(rootDir, filePath);

  try {
    await fs.access(absPath);
    throw new Error(`文章文件已存在：${filePath}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("文章文件已存在")) {
      throw err;
    }
  }

  const fm = normalizeFrontmatter({
    title,
    pubDatetime: formatShanghaiNow(),
    featured: false,
    draft: true,
    tags: ["笔记"],
    description: `${title}。`,
  });

  const body = `## ${title}\n\n在这里开始写作……\n`;
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, serializePostContent(fm, body), "utf-8");

  return {
    filePath,
    slug: computePostSlug(relToPosts),
    frontmatter: fm,
    body,
  };
}

export async function deleteStudioPost(
  rootDir: string,
  filePath: string
): Promise<void> {
  const { absPath } = sanitizePostRelPath(rootDir, filePath);
  await fs.unlink(absPath);
}

export async function saveUploadedImage(
  rootDir: string,
  payload: {
    postFilePath: string;
    filename: string;
    dataBase64: string;
  }
): Promise<{ relativePath: string; assetPath: string }> {
  const { relToPosts, normFilePath } = sanitizePostRelPath(
    rootDir,
    payload.postFilePath
  );
  const postSlug = computePostSlug(relToPosts).replace(/\//g, "-");

  const parsedName = path.parse(payload.filename || "image.png");
  const safeBase =
    parsedName.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "image";
  const ext = /^\.(png|jpe?g|webp|gif|avif|svg)$/i.test(parsedName.ext)
    ? parsedName.ext.toLowerCase()
    : ".png";

  const uniqueName = `${Date.now()}-${safeBase}${ext}`;
  const assetRelToAssetsImages = `posts/${postSlug}/${uniqueName}`;
  const assetPosixPath = `${ASSETS_IMAGES_REL_DIR}/${assetRelToAssetsImages}`;

  const assetsRoot = resolveInside(rootDir, ASSETS_IMAGES_REL_DIR);
  const absAssetPath = resolveInside(assetsRoot, assetRelToAssetsImages);

  const cleanBase64 = payload.dataBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) {
    throw new Error("上传图片内容为空");
  }

  await fs.mkdir(path.dirname(absAssetPath), { recursive: true });
  await fs.writeFile(absAssetPath, buffer);

  const relativePath = path.posix.relative(
    path.posix.dirname(normFilePath),
    assetPosixPath
  );

  return { relativePath, assetPath: assetPosixPath };
}

export async function getGitStatus(rootDir: string): Promise<StudioGitStatus> {
  const [{ stdout: branchOut }, { stdout: statusOut }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: rootDir,
    }),
    execFileAsync("git", ["status", "--short"], { cwd: rootDir }),
  ]);

  const changes = statusOut
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean);

  return {
    branch: branchOut.trim() || "main",
    changes,
    clean: changes.length === 0,
  };
}

export async function publishToGitHub(
  rootDir: string,
  payload: { message?: string; runCheck?: boolean }
): Promise<{ output: string }> {
  const logs: string[] = [];

  if (payload.runCheck) {
    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const { stdout, stderr } = await execFileAsync(
      pnpmCmd,
      ["astro", "check"],
      {
        cwd: rootDir,
        shell: process.platform === "win32",
      }
    );
    logs.push("[astro check]", stdout.trim(), stderr.trim());
  }

  const status = await getGitStatus(rootDir);
  if (!status.clean) {
    const commitMsg =
      (payload.message || "").trim() || `docs: update blog (${formatShanghaiNow()})`;
    await execFileAsync("git", ["add", "."], { cwd: rootDir });
    const { stdout: commitOut } = await execFileAsync(
      "git",
      ["commit", "-m", commitMsg],
      { cwd: rootDir }
    );
    logs.push("[git commit]", commitOut.trim());
  } else {
    logs.push("[git commit] 工作区无新增改动，将直接推送本地提交");
  }

  const { stdout: pushOut, stderr: pushErr } = await execFileAsync(
    "git",
    ["push", "origin", status.branch],
    { cwd: rootDir }
  );
  logs.push("[git push]", pushOut.trim(), pushErr.trim());

  return { output: logs.filter(Boolean).join("\n") };
}

export async function tryServeStaticFile(
  rootDir: string,
  relPath: string
): Promise<{ content: Buffer; contentType: string } | null> {
  try {
    const decoded = decodeURIComponent(relPath.split("?")[0]);
    const safeRel = decoded.replace(/^\/+/, "");
    if (!safeRel) return null;

    const absPath = resolveInside(rootDir, safeRel);
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) return null;

    const ext = path.extname(absPath).toLowerCase();
    const content = await fs.readFile(absPath);
    return {
      content,
      contentType: MIME_TYPES[ext] || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
