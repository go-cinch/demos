import type { AppRouteRecord } from '@/types/router'
import type { AuthInfo, PermissionNavigation } from '@/api/auth-service'

const joinPath = (parent: string, path: string) =>
  path.startsWith('/') || /^https?:\/\//.test(path) ? path : `${parent.replace(/\/$/, '')}/${path}`

/** Absolute menu URLs and relative native registration paths are separate views. */
export function relativeRouteTree(routes: AppRouteRecord[], parent = ''): AppRouteRecord[] {
  return routes.map((route) => {
    const fullPath = joinPath(parent, route.path || '')
    let path = fullPath
    if (parent && !/^https?:\/\//.test(fullPath)) {
      if (fullPath === parent) path = ''
      else if (fullPath.startsWith(`${parent.replace(/\/$/, '')}/`)) {
        path = fullPath.slice(parent.replace(/\/$/, '').length + 1)
      } else throw new Error(`Route ${fullPath} is outside its directory ${parent}`)
    }
    return {
      ...route,
      path,
      children: route.children?.length
        ? relativeRouteTree(route.children, fullPath)
        : route.children
    }
  })
}

function commonParent(paths: string[]) {
  const common = paths[0].split('/').filter(Boolean).slice(0, -1)
  for (const path of paths.slice(1)) {
    const parts = path.split('/').filter(Boolean).slice(0, -1)
    while (common.some((part, index) => parts[index] !== part)) common.pop()
  }
  return '/' + common.join('/')
}
const pagePaths = (routes: AppRouteRecord[]): string[] =>
  routes.flatMap((route) => (route.children?.length ? pagePaths(route.children) : [route.path]))

export function buildCatalogNavigation(
  routes: AppRouteRecord[],
  permission: AuthInfo['permission'] | undefined
): AppRouteRecord[] {
  const pages = new Map<string, AppRouteRecord>()
  const directories = new Map<string, AppRouteRecord>()
  const index = (items: AppRouteRecord[], parent = '') =>
    items.forEach((route) => {
      const path = joinPath(parent, route.path || '')
      if (route.children?.length) {
        directories.set(path, { ...route, path })
        index(route.children, path)
      } else pages.set(path, { ...route, path })
    })
  index(routes)
  const allowed = new Map((permission?.menus ?? []).map((menu) => [menu.menu_key, menu.menu_path]))
  const allowedPaths = new Set(allowed.values())
  const used = new Set<string>()
  const directoryOccurrences = new Map<string, number>()
  const build = (nodes: PermissionNavigation[], depth = 0): AppRouteRecord[] =>
    nodes.flatMap((node) => {
      if (!node.resource_key.startsWith('admin:')) return []
      if (node.menu_key && node.menu_path) {
        const page = pages.get(node.menu_path)
        if (!page || used.has(node.menu_path) || allowed.get(node.menu_key) !== node.menu_path)
          return []
        used.add(node.menu_path)
        return [
          {
            ...page,
            meta: { ...page.meta, title: `resources.${node.resource_key}`, isHide: false }
          }
        ]
      }
      const children = build(node.children ?? [], depth + 1)
      if (!children.length) return []
      const paths = pagePaths(children)
      const local = directories.get('/' + node.resource_key.split(':').slice(1).join('/'))
      // Directory keys describe catalog hierarchy, not an extra URL prefix.
      const path =
        local && paths.every((page) => page.startsWith(`${local.path.replace(/\/$/, '')}/`))
          ? local.path
          : commonParent(paths)
      const occurrence = (directoryOccurrences.get(node.resource_key) ?? 0) + 1
      directoryOccurrences.set(node.resource_key, occurrence)
      return [
        {
          ...local,
          path,
          name: `ResourceDirectory_${node.resource_key}${occurrence === 1 ? '' : `_${occurrence}`}`,
          component: depth === 0 ? '/index/index' : undefined,
          meta: {
            ...local?.meta,
            title: `resources.${node.resource_key}`,
            icon: local?.meta?.icon ?? 'ri:folder-line'
          },
          redirect: paths[0],
          children
        } as AppRouteRecord
      ]
    })
  const result = build(Array.isArray(permission?.navigation) ? permission.navigation : [])
  for (const [path, page] of pages) {
    if (!used.has(path) && (allowedPaths.has(path) || path === '/dashboard/overview')) {
      result.push({ ...page, meta: { ...page.meta, isHide: path !== '/dashboard/overview' } })
    }
  }
  return relativeRouteTree(result)
}
