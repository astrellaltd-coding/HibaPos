import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Returns true on small screens (< MOBILE_BREAKPOINT). The initial value is
 * computed lazily inside useState so the effect below only registers the
 * resize listener — it does not call setState synchronously, which would
 * trip `react-hooks/set-state-in-effect`.
 *
 * On the server, `window` is undefined and we return `false` from
 * `!!undefined`. On the client, the lazy initializer reads window.innerWidth
 * directly. Hydration mismatch is acceptable here because callers only gate
 * cosmetic layout branches (lg:flex vs drawer); server-rendered HTML is
 * progressively enhanced with the correct value on first client render.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(() => {
    if (typeof window === "undefined") return undefined
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}