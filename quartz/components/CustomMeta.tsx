import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { resolveRelative, slugifyFilePath } from "../util/path"
import { FullSlug, FilePath } from "../util/path"
import style from "./styles/contentMeta.scss"

// 定义内置元数据字段列表
const builtinFields = [
  'title',
  'tags',
  'aliases',
  'modified',
  'created',
  'published',
  'description',
  'socialDescription',
  'publish',
  'draft',
  'lang',
  'enableToc',
  'cssclasses',
  'socialImage',
  'comments'
]

const CustomMeta: QuartzComponent = ({ fileData, displayClass, cfg }: QuartzComponentProps) => {
  const frontmatter = fileData.frontmatter
  if (!frontmatter) return null

  // 获取所有非内置的元数据字段
  const customFields = Object.keys(frontmatter).filter(
    key => !builtinFields.includes(key) && frontmatter[key] !== undefined && frontmatter[key] !== null
  )

  // 如果没有自定义字段，不渲染任何内容
  if (customFields.length === 0) {
    return null
  }

  // 处理值，支持链接渲染
  const renderValue = (value: any): any => {
    if (Array.isArray(value)) {
      return (
        <ul class="custom-meta-list">
          {value.map((item, index) => (
            <li key={index}>{renderValue(item)}</li>
          ))}
        </ul>
      )
    } else if (typeof value === 'string') {
      // 检查是否为内部链接格式 [[link]]
      const wikilinkRegex = /\[\[([^\]]+)\]\]/g
      if (wikilinkRegex.test(value)) {
        wikilinkRegex.lastIndex = 0 // 重置正则表达式索引
        const parts = value.split(wikilinkRegex)
        return (
          <>
            {parts.map((part, index) => {
              if (index % 2 === 1) {
                // 这是链接内容
                // 处理带别名的链接格式 [[path/to/file|title]]
                const pipeIndex = part.indexOf('|')
                const actualLink = pipeIndex !== -1 ? part.substring(0, pipeIndex) : part
                const linkText = pipeIndex !== -1 ? part.substring(pipeIndex + 1) : part
                
                // 使用 slugifyFilePath 来正确处理文件名
                const slugified = slugifyFilePath(`${actualLink}.md` as FilePath)
                const linkDest = resolveRelative(fileData.slug!, slugified)
                return (
                  <a href={linkDest} class="internal">
                    {linkText}
                  </a>
                )
              } else {
                // 这是普通文本
                return part
              }
            })}
          </>
        )
      } else if (value.startsWith("http://") || value.startsWith("https://")) {
        // 外部链接
        return (
          <a href={value} class="external" target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        )
      }
      return value
    }
    return String(value)
  }

  return (
    <div class={classNames(displayClass, "custom-meta")}>
      {/* <h3>笔记元数据</h3> */}
      <table class="custom-meta-table">
        <tbody>
          {customFields.map(field => {
            const value = frontmatter[field]
            // 只渲染非空值
            if (value !== undefined && value !== null && value !== '') {
              return (
                <tr key={field}>
                  <td class="custom-meta-key">{field.replace(/_/g, ' ')}</td>
                  <td class="custom-meta-value">{renderValue(value)}</td>
                </tr>
              )
            }
            return null
          })}
        </tbody>
      </table>
    </div>
  )
}

CustomMeta.css = `
.custom-meta {
  margin: var(--meta-container-margin, 1rem 0);
  padding: var(--meta-container-padding, 1rem);
  background-color: var(--meta-container-background, var(--lightgray));
  border: var(--meta-container-border, none);
  border-radius: var(--meta-container-border-radius, 4px);
  box-shadow: var(--meta-container-shadow, none);
}

.custom-meta h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.custom-meta-table {
  width: 100%;
  border-collapse: collapse;
  padding: var(--meta-table-padding, 0);
  border-radius: var(--meta-table-border-radius, 0);
}

.custom-meta-key {
  font-weight: var(--meta-key-font-weight, bold);
  width: 120px;
  vertical-align: top;
  padding: 0.25rem 0.5rem 0.25rem 0;
  border-right: 1px solid var(--gray);
}

.custom-meta-value {
  padding: 0.25rem 0.5rem;
  vertical-align: top;
}

.custom-meta-table tr:nth-child(even) {
  background-color: rgba(0, 0, 0, var(--meta-striped-opacity, 0.05));
}

.custom-meta-table tr:hover {
  background-color: rgba(0, 0, 0, var(--meta-row-hover-opacity, 0.1));
}

.custom-meta-list {
  margin: 0;
  padding-left: 1rem;
}

.custom-meta-list ul {
  margin: 0.25rem 0;
  padding-left: 1.5rem;
}

.custom-meta .internal {
  text-decoration: underline;
  color: var(--secondary);
}

.custom-meta .external {
  text-decoration: underline;
  color: var(--tertiary);
}

.custom-meta .internal:hover {
  color: var(--tertiary);
}
`

export default (() => CustomMeta) satisfies QuartzComponentConstructor