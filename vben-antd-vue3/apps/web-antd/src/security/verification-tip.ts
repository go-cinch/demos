import { h } from 'vue';

import { message } from 'ant-design-vue';

import { requestErrorMessage } from '#/api/request-error';
import { markRequestErrorReported } from '#/api/request-feedback';
import { $t } from '#/locales';

// Sensitive verification and enrollment modals use z-index 2000.
export const verificationModalTipTheme = {
  components: { Message: { zIndexPopup: 2010 } },
};

export function useVerificationTip() {
  const [tip, TipHolder] = message.useMessage({ maxCount: 1 });

  function showTip(type: 'error' | 'info', text: () => string) {
    tip.open({
      type,
      content: () => h('span', { role: 'status' }, text()),
      duration: 3,
    });
  }

  function showFailure(cause: unknown, type: 'error' | 'info' = 'error') {
    if (!markRequestErrorReported(cause)) return;
    showTip(type, () => requestErrorMessage(cause));
  }

  return {
    showFailure,
    showUnconfirmedDelivery: (cause: unknown) => showFailure(cause, 'info'),
    showExpired: () => showTip('info', () => $t('verification.loginExpired')),
    showCopyFailure: () =>
      showTip('error', () => $t('verification.copyFailed')),
    TipHolder,
  };
}
