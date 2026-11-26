import { parse, stringify } from "yaml";
import config from "../../astro-paper.config";
import type { StudioFrontmatter } from "./types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function formatShanghaiNow(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.site.timezone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find(p => p.type === type)?.value ?? "00";

  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}+08:00`;
}

function normalizeDatetime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatShanghaiNow(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return formatShanghaiNow();
}

export function normalizeFrontmatter(
  raw: Record<string, unknown>
): StudioFrontmatter {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map(item => String(item).trim()).filter(Boolean)
    : [];

  return {
    title: typeof raw.title === "string" ? raw.title : "",
    author:
      typeof raw.author === "string" && raw.author.trim()
        ? raw.author.trim()
        : config.site.author,
    pubDatetime: normalizeDatetime(raw.pubDatetime),
    modDatetime:
      raw.modDatetime == null || raw.modDatetime === ""
        ? null
        : normalizeDatetime(raw.modDatetime),
    featured: Boolean(raw.featured),
    draft: Boolean(raw.draft),
    tags,
    description: typeof raw.description === "string" ? raw.description : "",
    ogImage: typeof raw.ogImage === "string" ? raw.ogImage : "",
    canonicalURL: typeof raw.canonicalURL === "string" ? raw.canonicalURL : "",
    hideEditPost: Boolean(raw.hideEditPost),
    hideToc: Boolean(raw.hideToc),
    timezone: typeof raw.timezone === "string" ? raw.timezone : "",
  };
}

export function parsePostContent(content: string): {
  frontmatter: StudioFrontmatter;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return {
      frontmatter: normalizeFrontmatter({}),
      body: content,
    };
  }

  const parsed = parse(match[1]);
  const rawObj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return {
    frontmatter: normalizeFrontmatter(rawObj),
    body: match[2].replace(/^\r?\n/, ""),
  };
}

export function serializePostContent(
  fm: StudioFrontmatter,
  body: string
): string {
  const output: Record<string, unknown> = {
    title: fm.title.trim() || "Untitled",
    author: fm.author.trim() || config.site.author,
    pubDatetime: fm.pubDatetime.trim() || formatShanghaiNow(),
  };

  if (fm.modDatetime) {
    output.modDatetime = fm.modDatetime.trim();
  }

  output.featured = Boolean(fm.featured);
  output.draft = Boolean(fm.draft);
  output.tags = fm.tags.length > 0 ? fm.tags : ["others"];
  output.description = fm.description.trim();

  if (fm.ogImage.trim()) output.ogImage = fm.ogImage.trim();
  if (fm.canonicalURL.trim()) output.canonicalURL = fm.canonicalURL.trim();
  if (fm.hideEditPost) output.hideEditPost = true;
  if (fm.hideToc) output.hideToc = true;
  if (fm.timezone.trim()) output.timezone = fm.timezone.trim();

  const yamlStr = stringify(output, {
    lineWidth: 0,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  }).trimEnd();

  // Keep ISO datetimes unquoted so YAML parses them as dates natively while staying readable
  const unquotedDates = yamlStr.replace(
    /^((?:pub|mod)Datetime):\s*"([^"]+)"$/gm,
    "$1: $2"
  );

  const normalizedBody = body.replace(/\r\n/g, "\n").trimEnd();
  return `---\n${unquotedDates}\n---\n\n${normalizedBody}\n`;
}

export function generateSlugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (ascii.length >= 2) {
    return ascii;
  }

  const now = formatShanghaiNow()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  return `post-${now}`;
}
