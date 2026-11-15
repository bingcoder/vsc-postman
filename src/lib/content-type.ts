const TEXTUAL_CONTENT_TYPE = /text\/|json|xml|javascript|ecmascript|urlencoded|graphql|yaml|csv/i

export function isTextualContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return true
  return TEXTUAL_CONTENT_TYPE.test(contentType)
}
