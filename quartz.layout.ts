import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      // [M] 去除GitHub和Discord链接
      // GitHub: "https://github.com/jackyzha0/quartz",
      // "Discord Community": "https://discord.gg/cRFFHYye7t",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.CustomMeta(), // 添加自定义元数据组件
    Component.TagList(),
    // 在首页显示自定义 Homepage 组件
    Component.ConditionalRender({
      component: Component.Homepage({
        // 可选配置：指定要显示的一级目录（留空则显示全部）
        // topFolders: ["技术", "笔记", "项目"],
        // 可选配置：指定要显示的常用标签（留空则显示全部）
        // featuredTags: ["JavaScript", "Python", "React"],
        showFolderCount: true,
        foldersTitle: "📂 探索内容",
        tagsTitle: "🏷️ 常用标签",
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          // Component: Component.Search(),
          Component: Component.Search2({
            enablePreview: true,
            initialDisplayCount: 10, // 首次显示10个
            loadMoreCount: 10, // 每次加载10个
          }),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    // Component.Explorer(),
    Component.Explorer2({
      accordionMode: true, // 启用手风琴模式
    }),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(
      Component.TableOfContents2({
        collapseByDefault: true, // 默认折叠子级标题
      }),
    ),
    Component.Backlinks({
      hideWhenEmpty: false, // 即使没有反向链接也显示
    }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search2({
            enablePreview: true,
            initialDisplayCount: 10,
            loadMoreCount: 10,
          }),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    // Component.Explorer(),
    Component.Explorer2({
      accordionMode: true, // 启用手风琴模式
    }),
  ],
  right: [],
}
