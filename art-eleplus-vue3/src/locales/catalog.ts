import { ref } from 'vue'
import i18n from './index'
import { authRequestClient } from '@/api/catalog-client'
export interface I18nCatalog {
  group_order?: string[]
  default_locale: string
  locales: { enabled: boolean; name: string; tag: string }[]
  messages: Record<string, { frontend?: Record<string, any> }>
  schema_version: number
}
let catalog: I18nCatalog | undefined
const revision = ref(0)
const bundled = new Map<string, Record<string, any>>()
let pending: Promise<void> | undefined
export function catalogDefaultLocale() {
  void revision.value
  return catalog?.default_locale ?? 'en-US'
}
export function catalogLanguages() {
  void revision.value
  return catalog?.locales ?? []
}
export function catalogGroupOrder() {
  void revision.value
  return catalog?.group_order ?? []
}
export function catalogGroupWords() {
  void revision.value
  return [
    ...new Set(
      Object.values(catalog?.messages ?? {}).flatMap((m) => Object.keys(m.frontend?.groups ?? {}))
    )
  ].sort()
}
export function catalogGroupNames(word: string) {
  void revision.value
  return Object.fromEntries(
    (catalog?.locales ?? []).map((l) => [
      l.tag,
      catalog?.messages[l.tag]?.frontend?.groups?.[word] ?? ''
    ])
  )
}
export function refreshI18nCatalog() {
  if (pending) return pending
  pending = (async () => {
    try {
      const next = await authRequestClient.get<I18nCatalog>('/dictionary/pub/i18n', {
        params: { f: 'default_locale,locales,group_order,frontend_messages' }
      })
      if (next.schema_version !== 2 || !Array.isArray(next.locales) || !next.messages) return
      catalog = next
      revision.value++
      for (const [tag, messages] of Object.entries(next.messages)) {
        if (tag === 'zh-CN' || tag === 'en-US') {
          const local = tag === 'zh-CN' ? 'zh' : 'en'
          if (!bundled.has(local))
            bundled.set(local, JSON.parse(JSON.stringify(i18n.global.getLocaleMessage(local))))
          i18n.global.setLocaleMessage(local, JSON.parse(JSON.stringify(bundled.get(local))))
          i18n.global.mergeLocaleMessage(local, messages.frontend ?? {})
        }
      }
    } catch {
      /* Last good labels remain available offline. */
    }
  })().finally(() => {
    pending = undefined
  })
  return pending
}

export function catalogMessages(tag: string): Record<string, any> {
  void revision.value
  return catalog?.messages[tag === 'zh' ? 'zh-CN' : tag === 'en' ? 'en-US' : tag]?.frontend ?? {}
}
