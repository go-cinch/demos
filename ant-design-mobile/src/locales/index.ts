import { proxy, subscribe } from 'valtio';
import zhSystem from './zh-CN/system.json';
import enSystem from './en-US/system.json';
import zhApp from './zh-CN/app.json';
import enApp from './en-US/app.json';
import zhPage from './zh-CN/page.json';
import enPage from './en-US/page.json';
import { readStored, writeStored } from '../lib/storage';

export const locale = proxy<{ value: 'zh-CN' | 'en-US' }>({
  value: readStored<string>('cinch-garnet-language', 'zh-CN') === 'en-US' ? 'en-US' : 'zh-CN',
});
function persistLocale() {
  writeStored('cinch-garnet-language', locale.value);
  document.documentElement.lang = locale.value;
}
subscribe(locale, persistLocale);
persistLocale();
const pairs: Record<string, [string, string]> = {
  discardTitle: ['放弃未保存的修改？', 'Discard unsaved changes?'],
  discardHint: ['关闭后，本次填写的内容将丢失。', 'Closing will discard the changes in this form.'],
  keepEditing: ['继续编辑', 'Keep editing'],
  discard: ['放弃修改', 'Discard changes'],
  showPassword: ['显示密码', 'Show password'],
  hidePassword: ['隐藏密码', 'Hide password'],
  loadMore: ['加载更多', 'Load more'],
  summaryView: ['摘要', 'Summary'],
  detailView: ['详细字段', 'Detailed fields'],
  displayMode: ['显示方式', 'Display mode'],
  columnsHint: [
    '控制详细字段；摘要中的名称和状态始终保留。',
    'Controls detailed fields; the summary name and status remain visible.',
  ],
  appliedFilters: ['已应用条件', 'Applied filters'],
  resetFilters: ['清空筛选', 'Clear filters'],
  chooseDate: ['选择日期和时间', 'Choose date and time'],
  pickDateTime: ['选择日期和时间', 'Choose date and time'],
  oneHour: ['1 小时后', 'In 1 hour'],
  oneDay: ['1 天后', 'In 1 day'],
  oneWeek: ['1 周后', 'In 1 week'],
  deleteCount: ['删除 {count} 项', 'Delete {count} items'],
  memberCount: ['{count} 位成员', '{count} members'],
  ruleCount: ['{count} 条规则', '{count} rules'],
  desktopPositionHint: [
    '此设置控制桌面登录面板的位置；手机上始终居中。',
    'Sets the desktop login panel position. Mobile panels remain centered.',
  ],
  timezoneHint: [
    '当前时区：{zone}。业务时间会按此时区显示。',
    'Current timezone: {zone}. Business times are displayed in this timezone.',
  ],
  messagesUnavailable: ['消息中心暂未开放', 'Message center is not available yet'],
  messagesHint: [
    '当前版本尚不提供消息通知。待审核用户可在概览中查看。',
    'Notifications are not available in this version. Review pending users from Overview.',
  ],
  overviewDescription: ['用户状态与待办概况', 'Account status and pending reviews'],
  workspaceDescription: ['快速进入日常管理', 'Quick access to everyday administration'],
  openedPages: ['已打开的页面', 'Opened pages'],
  team: ['Cinch 团队', 'Cinch team'],
  metal: ['细腻金属 · 温润玻璃', 'Brushed metal · Soft glass'],
  garnet: ['绛钛', 'Garnet'],
  titanium: ['暖钛', 'Titanium'],
  porcelain: ['瓷白', 'Porcelain'],
  reviewQueue: ['待你处理', 'Needs your attention'],
  caughtUp: ['当前没有待审核成员', 'All membership requests reviewed'],
  personUnit: ['位成员', 'members'],
  materialNote: ['专注当下，管理有序', 'Stay focused. Stay organized.'],
  presentation: [
    '细腻的酒红金属，温润的玻璃层次。把繁杂留在背后，让每一次管理都从容。',
    'Brushed burgundy metal and soft layers of glass. A composed space for everyday administration.',
  ],

  pageSize: ['每页条数', 'Rows per page'],
  pageUnit: ['页', 'page'],
  home: ['概览', 'Overview'],
  manage: ['管理', 'Manage'],
  security: ['安全', 'Security'],
  mine: ['我的', 'Me'],
  moon: ['绛钛', 'Garnet Titanium'],
  subtitle: ['酒红金属，掌中秩序。', 'Burgundy metal. Order in your palm.'],
  workspace: ['工作空间', 'Workspace'],
  welcome: ['每一份协作，都在这里', 'A space for every collaboration'],
  members: ['位用户', 'members'],
  common: ['常用管理', 'Quick access'],
  allApps: ['全部应用', 'All apps'],
  pending: ['{count} 位新成员，等待你的确认', '{count} new members await your review'],
  pendingHint: ['审核通过后，即可加入工作空间', 'Review applications to welcome your team'],
  recent: ['最近加入', 'Recently joined'],
  deviceProtection: ['本机保护', 'Device protection'],
  loginDevices: ['登录设备', 'Signed-in devices'],
  mockData: ['演示数据', 'Demo data'],
  currentDevice: ['当前设备', 'Current'],
  removeDevice: ['移除', 'Remove'],
  deviceActiveNow: ['当前活跃', 'Active now'],
  deviceActiveTwoHours: ['2 小时前活跃', 'Active 2 hours ago'],
  deviceActiveYesterday: ['昨天活跃', 'Active yesterday'],
  deviceMockHint: [
    '设备与操作为交互演示，刷新页面后会恢复。',
    'Devices and actions are a preview and reset when the page reloads.',
  ],
  lockActionHint: ['暂时离开时锁定当前屏幕', 'Lock this screen when you step away'],
  overviewHint: ['从容处理，井然有序', 'Everything in its place'],
  manageHint: ['让每一件管理工作，轻一点', 'Keep everyday administration simple'],
  userHint: ['让每一位成员，各得其位', 'A place for everyone on your team'],
  securityHint: ['守护空间，也守护每一份信任', 'Care for your workspace and your team'],
  profileHint: ['你的账号，你的工作空间', 'Your account, your workspace'],
  searchApps: ['搜索应用', 'Search apps'],
  noData: ['暂无数据', 'No records'],
  noResults: ['没有匹配的结果', 'No matching results'],
  retry: ['重试', 'Retry'],
  loading: ['加载中…', 'Loading…'],
  cancel: ['取消', 'Cancel'],
  save: ['保存修改', 'Save changes'],
  confirm: ['确认', 'Confirm'],
  close: ['关闭', 'Close'],
  back: ['返回', 'Back'],
  detail: ['详情', 'Details'],
  next: ['下一页', 'Next'],
  previous: ['上一页', 'Previous'],
  page: ['第 {page} 页', 'Page {page}'],
  all: ['全部', 'All'],
  select: ['选择', 'Select'],
  selected: ['已选择 {count} 项', '{count} selected'],
  done: ['完成', 'Done'],
  clear: ['清空', 'Clear'],
  logout: ['退出登录', 'Sign out'],
  logoutConfirm: ['确认退出当前账号？', 'Sign out of this account?'],
  loginTitle: ['欢迎回来', 'Welcome back'],
  loginHint: ['一处空间，让管理更从容', 'Your workspace, one calm moment away'],
  remember: ['记住账号和密码', 'Remember account and password'],
  registerLink: ['创建账号', 'Create an account'],
  loginLink: ['返回登录', 'Back to sign in'],
  registerTitle: ['加入工作空间', 'Join the workspace'],
  registerHint: ['创建账号，等待管理员审核', 'Create an account for administrator review'],
  slider: ['向右滑动完成验证', 'Slide right to verify'],
  sliderHandle: ['拖动验证滑块', 'Drag verification slider'],
  sliderKeyboard: [
    '使用左右方向键移动滑块，按 Enter 或空格提交验证。',
    'Use the arrow keys to move the slider, then press Enter or Space to verify.',
  ],
  sliderProgress: ['验证滑块，已移动 {count}%', 'Verification slider, {count}% complete'],
  refreshCaptcha: ['刷新验证码', 'Refresh challenge'],
  captchaAlt: ['按提示顺序点选图片', 'Select points in the indicated order'],
  pointCaptchaKeyboard: [
    '使用方向键移动光标，按 Enter 或空格选择位置。',
    'Use the arrow keys to move the cursor, then press Enter or Space to select a point.',
  ],
  dark: ['深绛外观', 'Deep garnet'],
  light: ['浅绛外观', 'Pale garnet'],
  theme: ['主题', 'Theme'],
  language: ['语言', 'Language'],
  settings: ['高级配置', 'Advanced settings'],
  appearance: ['外观', 'Appearance'],
  layout: ['布局', 'Layout'],
  reduced: ['减少透明度', 'Reduce transparency'],
  panel: ['登录面板位置', 'Login panel position'],
  left: ['居左', 'Left'],
  center: ['居中', 'Center'],
  right: ['居右', 'Right'],
  color: ['色彩方案', 'Color scheme'],
  blue: ['绛钛', 'Garnet'],
  green: ['青松', 'Pine'],
  violet: ['暮紫', 'Dusk violet'],
  footer: ['显示页面页脚', 'Show page footer'],
  copyright: ['版权信息', 'Copyright'],
  copyrightEnabled: ['显示版权信息', 'Show copyright'],
  copyrightDate: ['日期 / 年份', 'Date / year'],
  company: ['公司名称', 'Company name'],
  companyLink: ['公司链接', 'Company link'],
  icp: ['备案信息', 'ICP text'],
  icpLink: ['备案链接', 'ICP link'],
  autoYear: ['留空使用当前年份', 'Current year when empty'],
  timezone: ['时区', 'Timezone'],
  messages: ['消息', 'Messages'],
  noMessages: ['暂无新消息', 'No new messages'],
  lock: ['锁屏', 'Lock screen'],
  lockHint: ['输入锁屏密码以继续', 'Enter the screen lock password to continue'],
  lockPassword: ['锁屏密码', 'Screen lock password'],
  unlock: ['解锁', 'Unlock'],
  lockWrong: ['锁屏密码不正确', 'Incorrect screen lock password'],
  search: ['搜索页面', 'Search pages'],
  avatar: ['账号菜单', 'Account menu'],
  pin: ['固定标签', 'Pin tab'],
  unpin: ['取消固定', 'Unpin tab'],
  noAccess: ['暂无访问权限', 'Access unavailable'],
  noAccessHint: [
    '你可以返回概览或联系管理员分配权限',
    'Return to overview or ask an administrator for access',
  ],
  notFound: ['页面不存在', 'Page not found'],
  about: ['关于这个空间', 'About this workspace'],
  profile: ['基本信息', 'Basic information'],
  password: ['修改密码', 'Change password'],
  securityAccounts: ['受限账号', 'Restricted accounts'],
  securityPermissions: ['权限与边界', 'Permissions and boundaries'],
  session: ['当前会话', 'Current session'],
  sessionHint: ['账号安全，从每一次登录开始', 'Account security starts with each sign-in'],
  enabled: ['已启用', 'Enabled'],
  disabled: ['已停用', 'Disabled'],
  permissionCount: ['{count} 项权限', '{count} permissions'],
  displayName: ['显示名称', 'Display name'],
  department: ['部门', 'Department'],
  view: ['查看详情', 'View details'],
  refresh: ['刷新', 'Refresh'],
  ascending: ['默认排序', 'Default order'],
  more: ['更多操作', 'More actions'],
  notifications: ['通知', 'Notifications'],
  noUserAccess: ['欢迎，{name}', 'Welcome, {name}'],
  noUserAccessHint: [
    '从下方入口开始管理你的工作空间',
    'Choose an entry below to open your workspace',
  ],
  choose: ['请选择', 'Choose'],
  searchOptions: ['搜索选项', 'Search options'],
  createGroup: ['使用新分组“{name}”', 'Use new group “{name}”'],
  invalidDate: ['请输入有效的 YYYY-MM-DD HH:mm:ss 时间', 'Enter a valid YYYY-MM-DD HH:mm:ss date'],
  dateFormat: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm:ss'],
  passwordSuccess: ['密码修改成功，请重新登录', 'Password changed. Please sign in again'],
  sessionExpired: ['会话已失效，请重新登录', 'Session expired. Please sign in again'],
  status: ['账号状态', 'Account status'],
};
export function t(key: string, vars: Record<string, string | number> = {}) {
  let value: string;
  if (pairs[key]) value = pairs[key][locale.value === 'zh-CN' ? 0 : 1];
  else {
    const catalogs: Record<string, unknown> =
      locale.value === 'zh-CN'
        ? { system: zhSystem, app: zhApp, page: zhPage }
        : { system: enSystem, app: enApp, page: enPage };
    let result: unknown = catalogs;
    for (const part of key.split('.')) result = (result as Record<string, unknown>)?.[part];
    value = typeof result === 'string' ? result : key;
  }
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
export function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
}
