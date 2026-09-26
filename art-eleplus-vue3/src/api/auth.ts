import { getAuthInfo, login } from './auth-service'

export function fetchLogin(params: Api.Auth.LoginParams) {
  return login({
    username: params.userName,
    password: params.password,
    remember_me: params.rememberMe === true,
    slider_proof: params.sliderProof,
    captcha_id: params.captchaId,
    captcha_points: params.captchaPoints
  })
}

export async function fetchGetUserInfo(): Promise<Api.Auth.UserInfo> {
  const user = await getAuthInfo()
  const menus = [...new Set(user.permission?.menus ?? [])]
  const buttons = [...new Set(user.permission?.btns ?? [])]
  return {
    avatar: '',
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
