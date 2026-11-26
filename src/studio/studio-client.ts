import Vditor from "vditor";
import type { StudioFrontmatter, StudioGitStatus, StudioPost } from "./types";

const rootEl = document.getElementById("studio-app");
const basePath = rootEl?.dataset.base ?? "";
const apiBase = `${basePath}/__studio/api`;
const vditorCdn = `${basePath}/__studio/vditor`;

let posts: StudioPost[] = [];
let activePost: StudioPost | null = null;
let activeTags: string[] = [];
let isDirty = false;
let isLoadingPost = false;
let isVditorReady = false;
let vditor: Vditor | null = null;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const postListEl = el<HTMLDivElement>("post-list");
const searchInput = el<HTMLInputElement>("post-search-input");
const activeFilePathEl = el<HTMLSpanElement>("active-file-path");
const saveStatusEl = el<HTMLSpanElement>("save-status");
const previewBtn = el<HTMLAnchorElement>("preview-post-btn");
const draftPreviewHint = el<HTMLSpanElement>("draft-preview-hint");
const toastEl = el<HTMLDivElement>("studio-toast");

const fmTitle = el<HTMLInputElement>("fm-title");
const fmPubDatetime = el<HTMLInputElement>("fm-pubDatetime");
const fmDescription = el<HTMLInputElement>("fm-description");
const fmDraft = el<HTMLInputElement>("fm-draft");
const fmFeatured = el<HTMLInputElement>("fm-featured");
const fmHideToc = el<HTMLInputElement>("fm-hideToc");
const fmAuthor = el<HTMLInputElement>("fm-author");
const fmModDatetime = el<HTMLInputElement>("fm-modDatetime");
const fmOgImage = el<HTMLInputElement>("fm-ogImage");
const fmCanonicalURL = el<HTMLInputElement>("fm-canonicalURL");
const fmHideEditPost = el<HTMLInputElement>("fm-hideEditPost");
const fmTagInput = el<HTMLInputElement>("fm-tag-input");
const tagsChipsEl = el<HTMLDivElement>("tags-chips");

let toastTimer: number | undefined;
function showToast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.remove("opacity-0");
  toastEl.classList.add("opacity-100");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("opacity-100");
    toastEl.classList.add("opacity-0");
  }, 2600);
}

function setDirty(dirty: boolean): void {
  isDirty = dirty;
  saveStatusEl.textContent = dirty ? "● 有未保存修改" : "✓ 已保存";
  saveStatusEl.className = dirty
    ? "text-xs text-amber-500 font-medium whitespace-nowrap"
    : "text-xs text-emerald-500 whitespace-nowrap";
}

function formatNowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
}

function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function syncVditorTheme(): void {
  if (!vditor) return;
  const dark = isDarkTheme();
  vditor.setTheme(
    dark ? "dark" : "classic",
    dark ? "dark" : "light",
    dark ? "native" : "github"
  );
}

async function apiJson<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("读取图片失败"));
      }
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function renderTagChips(): void {
  tagsChipsEl.innerHTML = "";
  activeTags.forEach((tag, index) => {
    const chip = document.createElement("span");
    chip.className =
      "bg-muted text-foreground inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px]";

    const label = document.createElement("span");
    label.textContent = tag;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.className = "text-muted-foreground hover:text-foreground ml-0.5";
    removeBtn.addEventListener("click", () => {
      activeTags.splice(index, 1);
      renderTagChips();
      setDirty(true);
    });

    chip.append(label, removeBtn);
    tagsChipsEl.append(chip);
  });
}

function addTagFromInput(): void {
  const raw = fmTagInput.value.replace(/,/g, "").trim();
  if (!raw) return;
  if (!activeTags.includes(raw)) {
    activeTags.push(raw);
    renderTagChips();
    setDirty(true);
  }
  fmTagInput.value = "";
}

function updatePreviewLink(): void {
  if (!activePost) {
    previewBtn.href = `${basePath}/`;
    draftPreviewHint.classList.add("hidden");
    return;
  }
  previewBtn.href = `${basePath}/posts/${activePost.slug}/`;
  if (fmDraft.checked) {
    draftPreviewHint.classList.remove("hidden");
  } else {
    draftPreviewHint.classList.add("hidden");
  }
}

function renderPostList(): void {
  const keyword = searchInput.value.trim().toLowerCase();
  const filtered = posts.filter(post => {
    if (!keyword) return true;
    const haystack = [
      post.frontmatter.title,
      post.slug,
      post.frontmatter.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });

  postListEl.innerHTML = "";
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-muted-foreground px-2 py-4 text-center text-xs";
    empty.textContent = "没有匹配的文章";
    postListEl.append(empty);
    return;
  }

  for (const post of filtered) {
    const isActive = activePost?.filePath === post.filePath;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = [
      "w-full rounded px-2.5 py-2 text-left transition border",
      isActive
        ? "border-accent bg-accent/10"
        : "border-transparent hover:bg-muted/60",
    ].join(" ");

    const titleEl = document.createElement("div");
    titleEl.className = "truncate text-xs font-medium";
    titleEl.textContent = post.frontmatter.title || post.slug;

    const metaEl = document.createElement("div");
    metaEl.className =
      "text-muted-foreground mt-1 flex items-center justify-between gap-1 text-[11px]";

    const dateSpan = document.createElement("span");
    dateSpan.textContent = post.frontmatter.pubDatetime.slice(0, 10);

    const badgesSpan = document.createElement("span");
    badgesSpan.className = "flex items-center gap-1";
    if (post.frontmatter.draft) {
      const draftBadge = document.createElement("span");
      draftBadge.className =
        "rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-500";
      draftBadge.textContent = "草稿";
      badgesSpan.append(draftBadge);
    }
    if (post.frontmatter.featured) {
      const featBadge = document.createElement("span");
      featBadge.className =
        "bg-accent/20 text-accent rounded px-1.5 py-0.2 text-[10px]";
      featBadge.textContent = "精选";
      badgesSpan.append(featBadge);
    }

    metaEl.append(dateSpan, badgesSpan);
    btn.append(titleEl, metaEl);
    btn.addEventListener("click", () => {
      if (activePost?.filePath === post.filePath) return;
      if (isDirty && !window.confirm("当前文章有未保存修改，确定切换吗？")) {
        return;
      }
      selectPost(post);
    });
    postListEl.append(btn);
  }
}

function collectFormFrontmatter(): Partial<StudioFrontmatter> {
  addTagFromInput();
  return {
    title: fmTitle.value,
    pubDatetime: fmPubDatetime.value,
    modDatetime: fmModDatetime.value.trim() || null,
    description: fmDescription.value,
    tags: [...activeTags],
    draft: fmDraft.checked,
    featured: fmFeatured.checked,
    hideToc: fmHideToc.checked,
    hideEditPost: fmHideEditPost.checked,
    author: fmAuthor.value,
    ogImage: fmOgImage.value,
    canonicalURL: fmCanonicalURL.value,
  };
}

function selectPost(post: StudioPost): void {
  isLoadingPost = true;
  activePost = post;
  activeFilePathEl.textContent = post.filePath;

  const fm = post.frontmatter;
  fmTitle.value = fm.title;
  fmPubDatetime.value = fm.pubDatetime;
  fmDescription.value = fm.description;
  fmDraft.checked = fm.draft;
  fmFeatured.checked = fm.featured;
  fmHideToc.checked = fm.hideToc;
  fmHideEditPost.checked = fm.hideEditPost;
  fmAuthor.value = fm.author;
  fmModDatetime.value = fm.modDatetime ?? "";
  fmOgImage.value = fm.ogImage;
  fmCanonicalURL.value = fm.canonicalURL;

  activeTags = [...fm.tags];
  renderTagChips();
  updatePreviewLink();
  renderPostList();

  if (vditor && isVditorReady) {
    vditor.setValue(post.body);
  }
  el("studio-main").scrollTop = 0;
  setDirty(false);
  window.setTimeout(() => {
    isLoadingPost = false;
  }, 60);
}

async function saveCurrentPost(): Promise<boolean> {
  if (!activePost || !vditor || !isVditorReady) return false;
  const saveBtn = el<HTMLButtonElement>("save-post-btn");
  try {
    saveStatusEl.textContent = "保存中...";
    saveBtn.disabled = true;
    const { post } = await apiJson<{ post: StudioPost }>("/posts/save", {
      method: "POST",
      body: JSON.stringify({
        filePath: activePost.filePath,
        frontmatter: collectFormFrontmatter(),
        body: vditor.getValue(),
      }),
    });

    const idx = posts.findIndex(p => p.filePath === post.filePath);
    if (idx >= 0) posts[idx] = post;
    activePost = post;
    setDirty(false);
    updatePreviewLink();
    renderPostList();
    showToast("已保存到本地文件");
    saveBtn.textContent = "✓ 已保存";
    window.setTimeout(() => {
      saveBtn.textContent = "保存 (Ctrl+S)";
    }, 1500);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "保存失败";
    saveStatusEl.textContent = "保存失败";
    showToast(msg);
    return false;
  } finally {
    saveBtn.disabled = false;
  }
}

function initVditor(initialBody: string): void {
  isVditorReady = false;
  const dark = isDarkTheme();
  vditor = new Vditor("vditor-container", {
    height: "auto",
    minHeight: 520,
    mode: "ir",
    lang: "zh_CN",
    cdn: vditorCdn,
    value: initialBody,
    theme: dark ? "dark" : "classic",
    icon: "ant",
    placeholder: "开始写文章（支持即时渲染、$KaTeX$ 公式、表格、粘贴截图自动优化保存）...",
    cache: { enable: false },
    toolbarConfig: { pin: true },
    counter: { enable: true, type: "markdown" },
    outline: { enable: false, position: "right" },
    preview: {
      theme: { current: dark ? "dark" : "light" },
      hljs: { enable: true, style: dark ? "native" : "github" },
      math: { engine: "KaTeX", inlineDigit: true },
      markdown: { toc: true, mark: true, callout: true },
    },
    upload: {
      accept: "image/*",
      handler: files =>
        (async (): Promise<string | null> => {
          if (!activePost || !vditor) {
            return "请先选择或创建一篇文章";
          }
          for (const file of files) {
            try {
              showToast(`正在保存图片 ${file.name}...`);
              const dataBase64 = await fileToBase64(file);
              const { relativePath } = await apiJson<{
                relativePath: string;
              }>("/upload", {
                method: "POST",
                body: JSON.stringify({
                  postFilePath: activePost.filePath,
                  filename: file.name || "image.png",
                  dataBase64,
                }),
              });
              const alt = file.name.replace(/\.[^.]+$/, "") || "image";
              vditor.insertValue(`\n![${alt}](${relativePath})\n`);
              setDirty(true);
              showToast("图片已保存至 src/assets/images（将自动压缩优化）");
            } catch (err) {
              const msg = err instanceof Error ? err.message : "图片保存失败";
              showToast(msg);
              return msg;
            }
          }
          return null;
        })() as Promise<string> | Promise<null>,
    },
    input: value => {
      if (!isLoadingPost && value !== activePost?.body) {
        setDirty(true);
      }
    },
    after: () => {
      isVditorReady = true;
      isLoadingPost = true;
      if (activePost && vditor) {
        vditor.setValue(activePost.body);
      }
      setDirty(false);
      window.setTimeout(() => {
        isLoadingPost = false;
      }, 60);
    },
  });
}

function bindEvents(): void {
  const watchInputs = [
    fmTitle,
    fmPubDatetime,
    fmDescription,
    fmDraft,
    fmFeatured,
    fmHideToc,
    fmAuthor,
    fmModDatetime,
    fmOgImage,
    fmCanonicalURL,
    fmHideEditPost,
  ];
  for (const input of watchInputs) {
    input.addEventListener("input", () => {
      if (!isLoadingPost) setDirty(true);
      updatePreviewLink();
    });
    input.addEventListener("change", () => {
      if (!isLoadingPost) setDirty(true);
      updatePreviewLink();
    });
  }

  fmTagInput.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTagFromInput();
    }
  });
  fmTagInput.addEventListener("blur", addTagFromInput);

  el("set-now-btn").addEventListener("click", () => {
    fmPubDatetime.value = formatNowLocal();
    setDirty(true);
  });
  el("set-mod-now-btn").addEventListener("click", () => {
    fmModDatetime.value = formatNowLocal();
    setDirty(true);
  });

  el("toggle-advanced-btn").addEventListener("click", () => {
    const panel = el("advanced-fields");
    const isHidden = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !isHidden);
    panel.classList.toggle("grid", isHidden);
  });

  searchInput.addEventListener("input", renderPostList);

  el("save-post-btn").addEventListener("click", () => {
    void saveCurrentPost();
  });

  el("theme-toggle-btn").addEventListener("click", () => {
    const next = isDarkTheme() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
    syncVditorTheme();
  });

  previewBtn.addEventListener("click", async e => {
    if (isDirty) {
      e.preventDefault();
      const saved = await saveCurrentPost();
      if (saved && activePost) {
        window.open(`${basePath}/posts/${activePost.slug}/`, "_blank");
      }
    }
  });

  el("delete-post-btn").addEventListener("click", async () => {
    if (!activePost) return;
    if (
      !window.confirm(
        `确定删除文章「${activePost.frontmatter.title}」(${activePost.filePath}) 吗？此操作不可撤销。`
      )
    ) {
      return;
    }
    try {
      await apiJson("/posts/delete", {
        method: "POST",
        body: JSON.stringify({ filePath: activePost.filePath }),
      });
      posts = posts.filter(p => p.filePath !== activePost?.filePath);
      activePost = posts[0] ?? null;
      if (activePost) {
        selectPost(activePost);
      } else if (vditor) {
        vditor.setValue("");
      }
      renderPostList();
      showToast("文章已删除");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败");
    }
  });

  // New Post Modal
  const newModal = el("new-post-modal");
  const newTitleInput = el<HTMLInputElement>("new-post-title");
  const newSlugInput = el<HTMLInputElement>("new-post-slug");
  const newExtSelect = el<HTMLSelectElement>("new-post-ext");

  const openNewModal = () => {
    newTitleInput.value = "";
    newSlugInput.value = "";
    newExtSelect.value = "md";
    newModal.classList.remove("hidden");
    newModal.classList.add("flex");
    newTitleInput.focus();
  };
  const closeNewModal = () => {
    newModal.classList.add("hidden");
    newModal.classList.remove("flex");
  };

  el("new-post-btn").addEventListener("click", openNewModal);
  el("close-new-modal-btn").addEventListener("click", closeNewModal);
  el("cancel-new-post-btn").addEventListener("click", closeNewModal);

  el("confirm-new-post-btn").addEventListener("click", async () => {
    const title = newTitleInput.value.trim();
    if (!title) {
      showToast("请填写文章标题");
      return;
    }
    try {
      const { post } = await apiJson<{ post: StudioPost }>("/posts/create", {
        method: "POST",
        body: JSON.stringify({
          title,
          slug: newSlugInput.value.trim(),
          ext: newExtSelect.value as "md" | "mdx",
        }),
      });
      posts.unshift(post);
      closeNewModal();
      selectPost(post);
      showToast("已创建新文章草稿");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建失败");
    }
  });

  // Publish Modal
  const pubModal = el("publish-modal");
  const branchLabel = el("git-branch-label");
  const statusList = el("git-status-list");
  const commitMsgInput = el<HTMLInputElement>("publish-commit-msg");
  const runCheckBox = el<HTMLInputElement>("publish-run-check");
  const logBox = el("publish-log-box");
  const confirmPubBtn = el<HTMLButtonElement>("confirm-publish-btn");

  const closePubModal = () => {
    pubModal.classList.add("hidden");
    pubModal.classList.remove("flex");
  };
  el("close-publish-modal-btn").addEventListener("click", closePubModal);
  el("cancel-publish-btn").addEventListener("click", closePubModal);

  el("open-publish-btn").addEventListener("click", async () => {
    if (isDirty) {
      const ok = await saveCurrentPost();
      if (!ok) return;
    }
    logBox.classList.add("hidden");
    logBox.textContent = "";
    pubModal.classList.remove("hidden");
    pubModal.classList.add("flex");
    commitMsgInput.value = activePost
      ? `docs: update ${activePost.slug}`
      : "docs: update blog posts";
    statusList.textContent = "正在检查 Git 状态...";

    try {
      const status = await apiJson<StudioGitStatus>("/git/status");
      branchLabel.textContent = `分支：${status.branch}`;
      statusList.textContent = status.clean
        ? "工作区干净（若本地有未推送提交，可直接推送）"
        : status.changes.join("\n");
    } catch (err) {
      statusList.textContent =
        err instanceof Error ? err.message : "读取 Git 状态失败";
    }
  });

  confirmPubBtn.addEventListener("click", async () => {
    confirmPubBtn.disabled = true;
    confirmPubBtn.textContent = "正在校验并推送...";
    logBox.classList.remove("hidden");
    logBox.textContent = "正在执行，请稍候（若开启 astro check 约需数秒）...";

    try {
      const { output } = await apiJson<{ output: string }>("/git/publish", {
        method: "POST",
        body: JSON.stringify({
          message: commitMsgInput.value.trim(),
          runCheck: runCheckBox.checked,
        }),
      });
      logBox.textContent = output || "推送成功！";
      showToast("已成功推送到 GitHub");
    } catch (err) {
      logBox.textContent =
        err instanceof Error ? `推送失败：\n${err.message}` : "推送失败";
      showToast("推送失败，请查看日志");
    } finally {
      confirmPubBtn.disabled = false;
      confirmPubBtn.textContent = "确认提交并推送";
    }
  });

  document.addEventListener(
    "keydown",
    e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveCurrentPost();
      }
    },
    true
  );

  window.addEventListener("beforeunload", e => {
    if (isDirty) {
      e.preventDefault();
    }
  });
}

async function bootstrap(): Promise<void> {
  bindEvents();
  try {
    const data = await apiJson<{ posts: StudioPost[] }>("/posts");
    posts = data.posts;
    activePost = posts[0] ?? null;
    if (activePost) {
      selectPost(activePost);
    } else {
      renderPostList();
    }
    initVditor(activePost?.body ?? "");
  } catch (err) {
    showToast(err instanceof Error ? err.message : "加载文章列表失败");
    initVditor("");
  }
}

void bootstrap();
