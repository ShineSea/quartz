import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import style from "./styles/homepage.scss"

export interface MostLinkedOptions {
  /**
   * 标题（默认为"🔗 引用最多"）
   */
  title?: string
  /**
   * 显示文章数量（默认为 10）
   */
  limit?: number
  /**
   * 是否显示链接数量
   */
  showCount?: boolean
}

const defaultOptions: MostLinkedOptions = {
  title: "🔗 引用最多",
  limit: 10,
  showCount: true,
}

export default ((userOpts?: Partial<MostLinkedOptions>) => {
  const opts: MostLinkedOptions = { ...defaultOptions, ...userOpts }

  const MostLinked: QuartzComponent = (props: QuartzComponentProps) => {
    const { allFiles, fileData } = props

    // 统计每个文件的反向链接数量
    const backlinkCounts = new Map<string, number>()
    
    allFiles.forEach((file) => {
      const links = file.links ?? []
      links.forEach((link) => {
        const count = backlinkCounts.get(link) || 0
        backlinkCounts.set(link, count + 1)
      })
    })

    // 过滤并排序文章
    const sortedFiles = allFiles
      .filter((file) => {
        // 过滤掉 tags 页面和首页
        if (file.slug?.startsWith("tags/")) return false
        if (file.slug === "index") return false
        return true
      })
      .map((file) => ({
        file,
        backlinkCount: backlinkCounts.get(file.slug!) || 0,
      }))
      .sort((a, b) => {
        // 按反向链接数量降序排列
        if (b.backlinkCount !== a.backlinkCount) {
          return b.backlinkCount - a.backlinkCount
        }
        // 如果链接数相同，按标题字母顺序排序
        const titleA = a.file.frontmatter?.title || a.file.slug || ""
        const titleB = b.file.frontmatter?.title || b.file.slug || ""
        return titleA.localeCompare(titleB)
      })
      .slice(0, opts.limit) // 只取前 N 篇

    if (sortedFiles.length === 0) {
      return null
    }

    return (
      <>
        <h2 class="homepage-section-title">{opts.title}</h2>
        <div class="recent-updates">
          {sortedFiles.map(({ file, backlinkCount }) => {
            const fileUrl = resolveRelative(fileData.slug!, file.slug as FullSlug)
            const title = file.frontmatter?.title || file.slug || "Untitled"

            return (
              <a href={fileUrl} class="recent-update-item">
                <div class="recent-update-content">
                  <h3 class="recent-update-title">{title}</h3>
                  {file.frontmatter?.description && (
                    <p class="recent-update-description">{file.frontmatter.description}</p>
                  )}
                </div>
                {opts.showCount && backlinkCount > 0 && (
                  <div class="recent-update-date popular-count">
                    {backlinkCount} 个链接
                  </div>
                )}
              </a>
            )
          })}
        </div>
      </>
    )
  }

  MostLinked.css = style
  return MostLinked
}) satisfies QuartzComponentConstructor
