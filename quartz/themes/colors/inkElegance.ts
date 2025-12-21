import { ColorScheme } from "../../util/theme"

/**
 * 墨韵配色主题 - 优雅、简约、适合阅读
 */
export const inkEleganceColors = {
  name: "墨韵",
  description: "优雅的黑白灰配色，极简设计，专注内容",
  lightMode: {
    light: "#ffffff",           // 纯白背景
    lightgray: "#f5f5f5",       // 浅灰
    gray: "#9ca3af",            // 中灰
    darkgray: "#374151",        // 深灰
    dark: "#111827",            // 接近黑
    secondary: "#4b5563",       // 深灰（链接）
    tertiary: "#6b7280",        // 中深灰（强调）
    highlight: "rgba(75, 85, 99, 0.08)",
    textHighlight: "#fef3c788",
  } as ColorScheme,
  darkMode: {
    light: "#0a0a0a",           // 接近纯黑
    lightgray: "#1a1a1a",       // 深灰黑
    gray: "#525252",            // 中灰
    darkgray: "#d4d4d4",        // 浅灰
    dark: "#fafafa",            // 浅色文字
    secondary: "#a3a3a3",       // 浅灰（链接）
    tertiary: "#d4d4d4",        // 更浅灰（强调）
    highlight: "rgba(163, 163, 163, 0.12)",
    textHighlight: "#fef3c766",
  } as ColorScheme,
}
