import type { StyleOptions, RendererOptions } from './types'
import { codeThemes, type CodeThemeId } from '@/config/code-themes'

// 将样式对象转换为 CSS 字符串
export function cssPropertiesToString(style: StyleOptions = {}): string {
  if (!style) return ''

  return Object.entries(style)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      // 处理媒体查询
      if (key === '@media (max-width: 768px)') {
        return ''  // 我们不在内联样式中包含媒体查询
      }
      
      // 转换驼峰命名为连字符命名
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      
      // 处理数字值
      if (typeof value === 'number' && !cssKey.includes('line-height')) {
        value = `${value}px`
      }

      return `${cssKey}: ${value}`
    })
    .filter(Boolean)  // 移除空字符串
    .join(';')
}

// 将基础样式选项转换为 CSS 字符串
export function baseStylesToString(base: RendererOptions['base'] = {}): string {
  if (!base) return ''

  const styles: string[] = []

  if (base.lineHeight) {
    styles.push(`line-height: ${base.lineHeight}`)
  }
  if (base.fontSize) {
    styles.push(`font-size: ${base.fontSize}`)
  }
  if (base.textAlign) {
    styles.push(`text-align: ${base.textAlign}`)
  }
  if (base.themeColor) {
    styles.push(`--theme-color: ${base.themeColor}`)
  }

  return styles.join(';')
}

// 获取代码主题的样式
export function getCodeThemeStyles(theme: CodeThemeId): StyleOptions {
  const themeConfig = codeThemes.find(t => t.id === theme)
  if (!themeConfig) return {}

  return {
    background: themeConfig.theme.background,
    color: themeConfig.theme.text,
  }
}

// 获取代码token的样式
export function getTokenStyles(
  theme: CodeThemeId,
  tokenType: string,
  forceDarkPalette = false
): string {
  let themeConfig = codeThemes.find(t => t.id === theme)
  if (!themeConfig) return ''

  if (forceDarkPalette && isLightColor(themeConfig.theme.background)) {
    const fallbackTheme = codeThemes.find(t => t.id === 'monokai')
    if (fallbackTheme) {
      themeConfig = fallbackTheme
    }
  }

  const tokenColor = themeConfig.theme[tokenType as keyof typeof themeConfig.theme] || themeConfig.theme.text
  if (!tokenColor) return ''
  return `color: ${tokenColor};`
}

export function isLightCodeTheme(theme: CodeThemeId): boolean {
  const themeConfig = codeThemes.find(t => t.id === theme)
  if (!themeConfig) return false
  return isLightColor(themeConfig.theme.background)
}

function isLightColor(color: string): boolean {
  const hex = color.replace('#', '')
  const parsed = hex.length === 3
    ? hex.split('').map(c => parseInt(c + c, 16))
    : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(v => parseInt(v, 16))
  const [r, g, b] = parsed
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.7
}
