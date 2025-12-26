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
    // 首页不显示普通文章标题
    Component.ConditionalRender({
      component: Component.ArticleTitle(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    // 首页不显示元数据（修改时间、阅读时长）
    Component.ConditionalRender({
      component: Component.ContentMeta({ showReadingTime: false }),
      condition: (page) => page.fileData.slug !== "index",
    }),
    // 首页不显示标签列表
    Component.ConditionalRender({
      component: Component.TagList(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    // 首页不显示自定义元数据
    Component.ConditionalRender({
      component: Component.CustomMeta(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    // 在首页显示自定义标题
    Component.ConditionalRender({
      component: Component.HomepageTitle({
        // title: "欢迎来到我的知识库", // 可自定义标题
        // description: "探索我的学习笔记、技术文章和项目文档", // 可添加描述
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
    // 在首页显示文件夹卡片（使用 BorderBox 包裹）
    Component.ConditionalRender({
      component: Component.BorderBox({
        component: Component.FolderCards({
          // topFolders: ["wiki", "notes"], // 可指定要显示的文件夹
          showFolderCount: true,
          title: "内容分类 📂",
        }),
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
    // 在首页显示常用标签（使用 BorderBox 包裹）
    // Component.ConditionalRender({
    //   component: Component.BorderBox({
    //     component: Component.FeaturedTags({
    //       // featuredTags: ["JavaScript", "Python"], // 可指定要显示的标签
    //       // maxTags: 20, // 最多显示20个标签
    //       title: "常用标签 🏷️",
    //     }),
    //   }),
    //   condition: (page) => page.fileData.slug === "index",
    // }),
    // 在首页显示热门文章和最近更新（两列布局）
    Component.ConditionalRender({
      component: Component.BorderBox({
        component: Component.RecentUpdates({
          // topFolders: ["wiki", "notes"], // 可指定要显示的文件夹
          title: "最近更新 🕒",
          limit: 10,
          showDate: true,
        }),
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.BorderBox({
        component: Component.MostLinked({
          // topFolders: ["wiki", "notes"], // 可指定要显示的文件夹
          title: "🔗 引用最多",
          limit: 10,
          showCount: true,
        }),
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
    Component.HomepageStyles(), // 确保 homepage.scss 样式被加载
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
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta({ showReadingTime: false }),
  ],
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
