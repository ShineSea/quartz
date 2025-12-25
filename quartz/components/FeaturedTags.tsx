import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import style from "./styles/homepage.scss"

export interface FeaturedTagsOptions {
  /**
   * 要展示的常用标签（空数组表示展示所有标签，按数量排序）
   */
  featuredTags?: string[]
  /**
   * 标签区域标题（默认为"🏷️ 常用标签"）
   */
  title?: string
  /**
   * 最多显示标签数量（仅在 featuredTags 为空时生效，默认显示全部）
   */
  maxTags?: number
}

const defaultOptions: FeaturedTagsOptions = {
  featuredTags: [],
  title: "🏷️ 常用标签",
  maxTags: undefined,
}

export default ((userOpts?: Partial<FeaturedTagsOptions>) => {
  const opts: FeaturedTagsOptions = { ...defaultOptions, ...userOpts }

  const FeaturedTags: QuartzComponent = (props: QuartzComponentProps) => {
    const { allFiles, fileData } = props

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
      // 如果设置了最大数量限制
      if (opts.maxTags && opts.maxTags > 0) {
        tagsToShow = tagsToShow.slice(0, opts.maxTags)
      }
    }

    if (tagsToShow.length === 0) {
      return null
    }

    return (
      <>
        <h2 class="homepage-section-title">{opts.title}</h2>
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
      </>
    )
  }

  FeaturedTags.css = style
  return FeaturedTags
}) satisfies QuartzComponentConstructor
