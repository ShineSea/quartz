import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import { trieFromAllFiles } from "../util/ctx"
import style from "./styles/homepage.scss"

export interface HomepageOptions {
  /**
   * 要在首页展示的一级目录名称（空数组表示展示所有一级目录）
   */
  topFolders?: string[]
  /**
   * 要在首页展示的常用标签
   */
  featuredTags?: string[]
  /**
   * 是否显示文件夹中的文件数量
   */
  showFolderCount?: boolean
  /**
   * 卡片标题（默认为"探索内容"）
   */
  foldersTitle?: string
  /**
   * 标签区域标题（默认为"常用标签"）
   */
  tagsTitle?: string
}

const defaultOptions: HomepageOptions = {
  topFolders: [],
  featuredTags: [],
  showFolderCount: true,
  foldersTitle: "📂 探索内容",
  tagsTitle: "🏷️ 常用标签",
}

export default ((userOpts?: Partial<HomepageOptions>) => {
  const opts: HomepageOptions = { ...defaultOptions, ...userOpts }

  const Homepage: QuartzComponent = (props: QuartzComponentProps) => {
    const { allFiles, fileData, cfg } = props

    // 构建文件树
    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const root = trie.findNode([])

    if (!root) {
      return <div>无法加载内容</div>
    }

    // 获取一级目录
    const topLevelFolders = root.children.filter((node) => {
      if (!node.isFolder) return false
      // 过滤掉 tags 文件夹
      if (node.slugSegment === "tags") return false
      // 如果指定了特定文件夹，只显示这些文件夹
      if (opts.topFolders && opts.topFolders.length > 0) {
        return opts.topFolders.includes(node.slugSegment)
      }
      return true
    })

    // 计算每个文件夹中的文件数量
    const getFolderFileCount = (node: any): number => {
      let count = 0
      for (const child of node.children) {
        if (child.data) {
          count++
        }
        if (child.isFolder) {
          count += getFolderFileCount(child)
        }
      }
      return count
    }

    // 收集所有标签
    const allTags = new Map<string, number>()
    allFiles.forEach((file) => {
      const tags = file.frontmatter?.tags ?? []
      tags.forEach((tag: string) => {
        allTags.set(tag, (allTags.get(tag) || 0) + 1)
      })
    })

    // 确定要显示的标签
    let tagsToShow: [string, number][] = []
    if (opts.featuredTags && opts.featuredTags.length > 0) {
      // 显示指定的标签
      tagsToShow = opts.featuredTags
        .filter((tag) => allTags.has(tag))
        .map((tag) => [tag, allTags.get(tag)!])
    } else {
      // 显示所有标签，按数量排序
      tagsToShow = Array.from(allTags.entries()).sort((a, b) => b[1] - a[1])
    }

    return (
      <div class="homepage-container">
        {/* 文件夹卡片区域 */}
        {topLevelFolders.length > 0 && (
          <section class="homepage-section">
            <h2 class="homepage-section-title">{opts.foldersTitle}</h2>
            <div class="folder-cards">
              {topLevelFolders.map((folder) => {
                const fileCount = getFolderFileCount(folder)
                const folderUrl = resolveRelative(fileData.slug!, folder.slug as FullSlug)
                return (
                  <a href={folderUrl} class="folder-card">
                    <div class="folder-card-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </div>
                    <div class="folder-card-content">
                      <h3 class="folder-card-title">{folder.displayName}</h3>
                      {opts.showFolderCount && (
                        <p class="folder-card-count">
                          {fileCount} {fileCount === 1 ? "篇文章" : "篇文章"}
                        </p>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </section>
        )}

        {/* 常用标签区域 */}
        {tagsToShow.length > 0 && (
          <section class="homepage-section">
            <h2 class="homepage-section-title">{opts.tagsTitle}</h2>
            <div class="tag-cloud">
              {tagsToShow.map(([tag, count]) => {
                const tagUrl = resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)
                return (
                  <a href={tagUrl} class="tag-item">
                    <span class="tag-name">{tag}</span>
                    <span class="tag-count">{count}</span>
                  </a>
                )
              })}
            </div>
          </section>
        )}
      </div>
    )
  }

  Homepage.css = style
  return Homepage
}) satisfies QuartzComponentConstructor
