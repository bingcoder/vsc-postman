/**
 * Minimal browser extension API surface (no @types/chrome).
 * The `chrome` namespace is the one Chromium-based browsers expose to extension pages,
 * so the identifier stays `chrome` while the product targets any Chromium browser.
 */
declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      id?: string
      url?: string
      origin?: string
    }

    interface Port {
      readonly name: string
      readonly sender?: MessageSender
      onMessage: {
        addListener(callback: (message: unknown, port: Port) => void): void
        removeListener(callback: (message: unknown, port: Port) => void): void
      }
      onDisconnect: {
        addListener(callback: (port: Port) => void): void
        removeListener(callback: (port: Port) => void): void
      }
      postMessage(message: unknown): void
      disconnect(): void
    }

    /** Extension context (Chromium 116+). */
    interface ExtensionContext {
      contextType: string
      documentUrl?: string
      documentId?: string
      tabId?: number
      windowId?: number
      frameId?: number
      incognito?: boolean
    }

    const id: string | undefined
    function connect(connectInfo?: { name?: string }): Port
    function getURL(path: string): string
    function getContexts(filter?: { contextTypes?: string[] }): Promise<ExtensionContext[]>

    const onConnect: {
      addListener(callback: (port: Port) => void): void
    }

    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void
    }
  }

  namespace permissions {
    interface Permissions {
      origins?: string[]
      permissions?: string[]
    }

    function contains(permissions: Permissions): Promise<boolean>
  }

  namespace action {
    const onClicked: {
      addListener(callback: (tab: { id?: number; url?: string }) => void): void
    }
  }

  namespace tabs {
    function create(options: { url?: string; active?: boolean }): Promise<{ id?: number }>
    function update(tabId: number, options: { active?: boolean }): Promise<unknown>
  }

  namespace windows {
    function update(windowId: number, options: { focused?: boolean }): Promise<unknown>
  }
}
