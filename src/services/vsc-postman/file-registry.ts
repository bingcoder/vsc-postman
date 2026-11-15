import type { FileSource } from '@/types/http'

/** 行 id → 文件句柄，仅内存；丢失时 prepareRequest 抛 file-missing。 */
const sources = new Map<string, FileSource>()

export function setFileSource(rowId: string, source: FileSource): void {
  sources.set(rowId, source)
}

export function getFileSource(rowId: string): FileSource | undefined {
  return sources.get(rowId)
}

export function removeFileSource(rowId: string): void {
  sources.delete(rowId)
}

export function clearFileSources(): void {
  sources.clear()
}
