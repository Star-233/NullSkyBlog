import type { IncomingMessage, ServerResponse } from "node:http";
import type { AstroIntegration } from "astro";
import {
  createStudioPost,
  deleteStudioPost,
  getGitStatus,
  getVditorDistDir,
  listStudioPosts,
  publishToGitHub,
  saveStudioPost,
  saveUploadedImage,
  tryServeStaticFile,
} from "./server";
import type { StudioFrontmatter } from "./types";

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown
): void {
  const payload = JSON.stringify(data);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(payload);
}

/**
 * Local-only writing studio integration.
 * Completely inactive during `astro build` / `astro preview` / `astro sync`.
 */
export function localStudio(): AstroIntegration {
  let isDevCommand = false;
  let rootDir = process.cwd();
  let basePath = "";

  return {
    name: "nullsky-local-studio",
    hooks: {
      "astro:config:setup": ({ command, config, injectRoute }) => {
        if (command !== "dev") return;
        isDevCommand = true;
        rootDir = decodeURIComponent(new URL(config.root).pathname).replace(
          /^\/([A-Za-z]:)/,
          "$1"
        );
        basePath = config.base.replace(/\/+$/, "");

        injectRoute({
          pattern: "/studio",
          entrypoint: "./src/studio/StudioPage.astro",
        });
      },

      "astro:server:setup": ({ server, refreshContent }) => {
        if (!isDevCommand) return;

        const vditorDistDir = getVditorDistDir();
        const assetsImagesDir = `${rootDir}/src/assets/images`;
        const vditorDistPrefix = "/__studio/vditor/dist/";
        const apiPrefix = "/__studio/api";

        server.middlewares.use(async (req, res, next) => {
          const url = req.url || "";
          const rawPathname = url.split("?")[0];
          const pathname =
            basePath && rawPathname.startsWith(basePath)
              ? rawPathname.slice(basePath.length) || "/"
              : rawPathname;

          // 1. Serve Vditor dist assets locally (offline-safe, zero CDN dependency)
          if (pathname.startsWith(vditorDistPrefix)) {
            const rel = pathname.slice(vditorDistPrefix.length);
            const file = await tryServeStaticFile(vditorDistDir, rel);
            if (file) {
              res.statusCode = 200;
              res.setHeader("Content-Type", file.contentType);
              res.end(file.content);
              return;
            }
          }

          // 2. Serve src/assets/images/ for Vditor's relative image previews (../../assets/images/...)
          if (pathname.startsWith("/assets/images/")) {
            const rel = pathname.slice("/assets/images/".length);
            const file = await tryServeStaticFile(assetsImagesDir, rel);
            if (file) {
              res.statusCode = 200;
              res.setHeader("Content-Type", file.contentType);
              res.end(file.content);
              return;
            }
          }

          // 3. Studio JSON API endpoints
          if (!pathname.startsWith(apiPrefix)) {
            next();
            return;
          }

          const route = pathname.slice(apiPrefix.length);
          try {
            if (req.method === "GET" && route === "/posts") {
              const posts = await listStudioPosts(rootDir);
              sendJson(res, 200, { posts });
              return;
            }

            if (req.method === "POST" && route === "/posts/save") {
              const body = await readJsonBody<{
                filePath: string;
                frontmatter: Partial<StudioFrontmatter>;
                body: string;
              }>(req);
              const post = await saveStudioPost(rootDir, body);
              if (refreshContent) {
                await refreshContent({});
              }
              sendJson(res, 200, { post });
              return;
            }

            if (req.method === "POST" && route === "/posts/create") {
              const body = await readJsonBody<{
                title: string;
                slug?: string;
                ext?: "md" | "mdx";
              }>(req);
              const post = await createStudioPost(rootDir, body);
              if (refreshContent) {
                await refreshContent({});
              }
              sendJson(res, 200, { post });
              return;
            }

            if (req.method === "POST" && route === "/posts/delete") {
              const body = await readJsonBody<{ filePath: string }>(req);
              await deleteStudioPost(rootDir, body.filePath);
              if (refreshContent) {
                await refreshContent({});
              }
              sendJson(res, 200, { ok: true });
              return;
            }

            if (req.method === "POST" && route === "/upload") {
              const body = await readJsonBody<{
                postFilePath: string;
                filename: string;
                dataBase64: string;
              }>(req);
              const result = await saveUploadedImage(rootDir, body);
              sendJson(res, 200, result);
              return;
            }

            if (req.method === "GET" && route === "/git/status") {
              const status = await getGitStatus(rootDir);
              sendJson(res, 200, status);
              return;
            }

            if (req.method === "POST" && route === "/git/publish") {
              const body = await readJsonBody<{
                message?: string;
                runCheck?: boolean;
              }>(req);
              const result = await publishToGitHub(rootDir, body);
              sendJson(res, 200, result);
              return;
            }

            sendJson(res, 404, { error: "未知接口" });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "操作失败，请检查输入";
            sendJson(res, 400, { error: message });
          }
        });
      },
    },
  };
}
