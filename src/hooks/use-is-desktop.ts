import { useEffect, useState } from 'react'

/** 是否 ≥ md 断点；桌面与移动端需切换整棵渲染树（分栏需真实布局）。 */
export function useIsDesktop(breakpoint = 768): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia
      ? true
      : window.matchMedia(`(min-width: ${breakpoint}px)`).matches
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    mql.addEventListener('change', onChange)
    // 订阅后校正一次，防初始值与后续状态不一致。
    setIsDesktop(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [breakpoint])

  return isDesktop
}
