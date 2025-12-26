import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import { formatDate } from "./Date"
import { QuartzPluginData } from "../plugins/vfile"
import style from "./styles/homepage.scss"

export interface RecentUpdatesOptions {
  /**
   * 标题（默认为"🕒 最近更新"）
   */
  title?: string
  /**
   * 显示文章数量（默认为 10）
   */
  limit?: number
  /**
   * 是否显示日期
   */
  showDate?: boolean
}

const defaultOptions: RecentUpdatesOptions = {
  title: "🕒 最近更新",
  limit: 10,
  showDate: true,
}

export default ((userOpts?: Partial<RecentUpdatesOptions>) => {
  const opts: RecentUpdatesOptions = { ...defaultOptions, ...userOpts }

  const RecentUpdates: QuartzComponent = (props: QuartzComponentProps) => {
    const { allFiles, fileData, cfg } = props

    // 过滤并排序文章
    const sortedFiles = allFiles
      .filter((file) => {
        // 过滤掉 tags 页面和首页
        if (file.slug?.startsWith("tags/")) return false
        if (file.slug === "index") return false
        return true
      })
      .sort((a, b) => {
        // 获取日期用于排序（优先使用 published/date，然后 modified，最后 created）
        const getDate = (file: QuartzPluginData) => {
          const dates = file.dates
          if (!dates) return new Date(0)
          // 按优先级获取日期：published > modified > created
          return dates.published || dates.modified || dates.created || new Date(0)
        }

        const dateA = getDate(a)
        const dateB = getDate(b)
        
        return dateB.getTime() - dateA.getTime() // 降序排列（最新的在前）
      })
      .slice(0, opts.limit) // 只取前 N 篇

    if (sortedFiles.length === 0) {
      return null
    }

    return (
      <>
        <h2 class="homepage-section-title">{opts.title}</h2>
        <div class="recent-updates">
          {sortedFiles.map((file) => {
            const fileUrl = resolveRelative(fileData.slug!, file.slug as FullSlug)
            const title = file.frontmatter?.title || file.slug || "Untitled"
            
            // 获取显示日期（同样优先级：published > modified > created）
            const displayDate = file.dates?.published || file.dates?.modified || file.dates?.created

            return (
              <a href={fileUrl} class="recent-update-item">
                <div class="recent-update-content">
                  <h3 class="recent-update-title">{title}</h3>
                  {file.frontmatter?.description && (
                    <p class="recent-update-description">{file.frontmatter.description}</p>
                  )}
                </div>
                {opts.showDate && displayDate && (
                  <div class="recent-update-date">
                    {formatDate(displayDate, cfg.locale)}
                  </div>
                )}
              </a>
            )
          })}
        </div>
      </>
    )
  }

  RecentUpdates.css = style
  return RecentUpdates
}) satisfies QuartzComponentConstructor
