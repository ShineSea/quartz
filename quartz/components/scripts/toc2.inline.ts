const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const slug = entry.target.id
    const tocEntryElements = document.querySelectorAll(`a[data-for="${slug}"]`)
    const windowHeight = entry.rootBounds?.height
    if (windowHeight && tocEntryElements.length > 0) {
      if (entry.boundingClientRect.y < windowHeight) {
        tocEntryElements.forEach((tocEntryElement) => {
          tocEntryElement.classList.add("in-view")
          // 为选中的标题添加高亮
          const parentLi = tocEntryElement.closest(".toc-item")
          if (parentLi) {
            // 移除其他所有active状态
            document.querySelectorAll(".toc-item.active").forEach((item) => {
              item.classList.remove("active")
            })
            parentLi.classList.add("active")
          }
        })
      } else {
        tocEntryElements.forEach((tocEntryElement) => {
          tocEntryElement.classList.remove("in-view")
          const parentLi = tocEntryElement.closest(".toc-item")
          if (parentLi) {
            parentLi.classList.remove("active")
          }
        })
      }
    }
  }
})

// 切换子级目录的折叠/展开
function toggleSubToc(this: HTMLElement, event: Event) {
  event.stopPropagation()
  event.preventDefault()
  
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  
  const targetId = this.getAttribute("aria-controls")
  if (!targetId) return
  
  const childrenList = document.getElementById(targetId)
  if (childrenList) {
    childrenList.classList.toggle("collapsed")
  }
}

function toggleToc2(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupToc2() {
  for (const toc of document.getElementsByClassName("toc2")) {
    // 设置主折叠按钮
    const button = toc.querySelector(".toc2-header")
    const content = toc.querySelector(".toc2-content")
    if (!button || !content) return
    button.addEventListener("click", toggleToc2)
    window.addCleanup(() => button.removeEventListener("click", toggleToc2))
    
    // 设置每个子级折叠按钮
    const toggleButtons = toc.querySelectorAll(".toc-toggle")
    toggleButtons.forEach((toggleBtn) => {
      toggleBtn.addEventListener("click", toggleSubToc)
      window.addCleanup(() => toggleBtn.removeEventListener("click", toggleSubToc))
    })
    
    // 点击链接时高亮对应项
    const links = toc.querySelectorAll(".toc-link")
    links.forEach((link) => {
      link.addEventListener("click", function(this: HTMLElement) {
        // 移除所有active状态
        document.querySelectorAll(".toc-item.active").forEach((item) => {
          item.classList.remove("active")
        })
        // 添加当前项的active状态
        const parentLi = this.closest(".toc-item")
        if (parentLi) {
          parentLi.classList.add("active")
        }
      })
    })
  }
}

document.addEventListener("nav", () => {
  setupToc2()

  // update toc entry highlighting
  observer.disconnect()
  const headers = document.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")
  headers.forEach((header) => observer.observe(header))
})
