/** Match patterns cannot contain ports: protocol//hostname/* covers all ports. */
export function permissionPatternForUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null

  return `${url.protocol}//${url.hostname}/*`
}