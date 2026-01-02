import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import Backlinks from "../Backlinks"
import { FullSlug, simplifySlug, resolveRelative } from "../../util/path"
import { i18n } from "../../i18n"
import style from "../styles/backlinks.scss"
import { classNames } from "../../util/lang"
 
export default (() => {
  const VirtualNodeContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { fileData, allFiles, cfg, displayClass } = props
    const slug = fileData.slug
 
    // 虚拟节点的实际名称（不含 virtual/ 前缀）
    const virtualNodeName = slug
    
    // 手动查找反向链接：找到所有 links 包含 virtualNodeName 的文件
    const backlinkFiles = allFiles.filter((file) => 
      file.links?.includes(virtualNodeName as any)
    )
 
    return (
      <div class="popover-hint">
        <article>
          {/* <h1>{virtualNodeName}</h1> */}
          <h1>{fileData.frontmatter?.title}</h1>
          <p>这是一个尚未创建的页面，但已被以下 {backlinkFiles.length} 个页面引用：</p>
        </article>
        
        <div class={classNames(displayClass, "backlinks")}>
          <h3>{i18n(cfg.locale).components.backlinks.title}</h3>
          <ul>
            {backlinkFiles.length > 0 ? (
              backlinkFiles.map((f) => (
                <li>
                  <a href={resolveRelative(fileData.slug!, f.slug!)} class="internal">
                    {f.frontmatter?.title ?? f.slug}
                  </a>
                </li>
              ))
            ) : (
              <li>{i18n(cfg.locale).components.backlinks.noBacklinksFound}</li>
            )}
          </ul>
        </div>
      </div>
    )
  }
 
  VirtualNodeContent.css = style
  return VirtualNodeContent
}) satisfies QuartzComponentConstructor