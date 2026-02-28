import { defineConfig } from 'vitepress'
import { withSidebar } from 'vitepress-sidebar'

export default withSidebar(defineConfig({
  srcDir: "markdown",

  base: "/NullSkyBlog/",

  title: "NullSkyBlog",
  description: "NullSky's Blog",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'MainPage', link: '/main' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
}), {
  documentRootPath: 'markdown',
  sidebarRoot: '/',
  useTitleFromFrontmatter: true
})
