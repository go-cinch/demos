import type { ActionConfig } from '@/api/permission-catalog'

import { $te, i18n } from '@/locales'
import { $t, catalogLabel } from '@/locales'
import { catalogDefaultLocale, catalogMessages } from '@/locales/catalog'

import { actionResourceBindings } from './resource-catalog'

function translatedPart(
  namespace: 'actions' | 'operations' | 'resources',
  key: string,
  locale: string
) {
  for (const tag of [locale, catalogDefaultLocale()]) {
    const labels = catalogMessages(tag)[namespace] as Record<string, unknown> | undefined
    const value = labels?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  // Preserve bundled bootstrap translations while the public catalog loads.
  if (
    locale === String((i18n.global.locale as any).value ?? i18n.global.locale) &&
    $te(`${namespace}.${key}`)
  )
    return $t(`${namespace}.${key}`)
  return ''
}

/** Names follow the actual bindings, never the random suffix of an action word. */
export function automaticActionName(
  config: ActionConfig | undefined,
  locale = String((i18n.global.locale as any).value ?? i18n.global.locale)
) {
  return [
    ...new Set(
      actionResourceBindings(config).map((binding) => {
        const resource = translatedPart('resources', binding.resource_key, locale)
        const operation = translatedPart('operations', binding.operation, locale)
        const separator = resource && operation && locale.startsWith('zh') ? '' : ' '
        return `${operation || binding.operation}${separator}${resource || binding.resource_key}`
      })
    )
  ].join(' / ')
}

export function actionDisplayName(word: string, config?: ActionConfig, fallbackName?: string) {
  const locale = String((i18n.global.locale as any).value ?? i18n.global.locale)
  return (
    translatedPart('actions', word, locale) ||
    automaticActionName(config, locale) ||
    fallbackName ||
    catalogLabel('actions', word)
  )
}
