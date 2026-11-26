export interface StudioFrontmatter {
  title: string;
  author: string;
  pubDatetime: string;
  modDatetime: string | null;
  featured: boolean;
  draft: boolean;
  tags: string[];
  description: string;
  ogImage: string;
  canonicalURL: string;
  hideEditPost: boolean;
  hideToc: boolean;
  timezone: string;
}

export interface StudioPost {
  /** Path relative to repo root, using forward slashes, e.g. src/content/posts/hello-world.md */
  filePath: string;
  /** Route slug matching getPostSlug logic, e.g. hello-world or notes/my-post */
  slug: string;
  frontmatter: StudioFrontmatter;
  body: string;
}

export interface StudioGitStatus {
  branch: string;
  changes: string[];
  clean: boolean;
}
