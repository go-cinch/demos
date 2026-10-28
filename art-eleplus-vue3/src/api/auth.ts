import { getAuthInfo, login } from './auth-service'

export function fetchLogin(params: Api.Auth.LoginParams) {
  return login({
    username: params.userName,
    password: params.password,
    slider_proof: params.sliderProof,
    captcha_id: params.captchaId,
    captcha_points: params.captchaPoints
  })
}

export async function fetchGetUserInfo(): Promise<Api.Auth.UserInfo> {
  const user = await getAuthInfo()
  if (user.scope !== 'admin') throw new Error('Invalid permission scope')
  const permission = user.permission
  void import('@/locales/catalog').then((m) => m.refreshI18nCatalog())
  const menus = [
    ...new Set(
      (permission?.menus ?? [])
        .filter(
          (menu) =>
            menu.menu_key?.startsWith('admin:menu:') &&
            menu.menu_path?.startsWith('/') &&
            !menu.menu_path.startsWith('//')
        )
        .map((menu) => menu.menu_path)
    )
  ]
  if (permission.permission_scope === '*') menus.push('*')
  if (!menus.includes('/dashboard/overview')) menus.push('/dashboard/overview')
  const buttons = [...new Set((permission?.menus ?? []).flatMap((menu) => menu.btns ?? []))]
  if (permission.permission_scope === '*') buttons.push('*')
  // Compatibility aliases let the existing Art screens use the same scoped grants.
  for (const key of [...buttons]) {
    if (key.startsWith('admin:btn:'))
      buttons.push(
        key.slice(10).replaceAll(':', '.').replace('system.user-group.', 'system.user.group.')
      )
  }
  return {
    avatar: '',
    scope: user.scope,
    permission,
    buttons,
    code: user.code,
    email: '',
    menus,
    role: user.role,
    roles: menus,
    userId: user.id,
    userName: user.username
  }
}
