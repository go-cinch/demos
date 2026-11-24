import { onScopeDispose, ref, watch } from 'vue';

import { userCache } from '@vben/utils/cache';

import { Modal } from 'ant-design-vue';

import {
  VerificationCancelled,
  verificationPrompt,
} from '#/security/verification-prompt';
export function useOperationConfirmation() {
  const operationPopover = ref('');
  const submittingConfirmations = new Set<ReturnType<typeof Modal.confirm>>();

  async function runConfirmedOperation(operation: () => unknown) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof VerificationCancelled)) throw error;
    }
  }

  function confirmSensitiveOperation(
    options: Parameters<typeof Modal.confirm>[0],
  ) {
    const current = userCache.capture();
    const dialog = Modal.confirm({
      ...options,
      async onOk() {
        if (!current()) return;
        submittingConfirmations.add(dialog);
        try {
          return await runConfirmedOperation(() => options.onOk?.());
        } finally {
          submittingConfirmations.delete(dialog);
        }
      },
    });
    return dialog;
  }

  function setOperationPopover(key: string, open: boolean) {
    if (open && verificationPrompt.value?.mode !== 'sensitive') {
      operationPopover.value = key;
    } else if (operationPopover.value === key) {
      operationPopover.value = '';
    }
  }

  watch(
    () => verificationPrompt.value?.id,
    () => {
      if (verificationPrompt.value?.mode !== 'sensitive') return;
      // The operation is already confirmed; show only the shared identity prompt.
      operationPopover.value = '';
      submittingConfirmations.forEach((dialog) => {
        dialog.update({ focusTriggerAfterClose: false });
        dialog.destroy();
      });
      submittingConfirmations.clear();
    },
    { flush: 'sync' },
  );

  onScopeDispose(() => {
    submittingConfirmations.forEach((dialog) => dialog.destroy());
    submittingConfirmations.clear();
  });
  return {
    confirmSensitiveOperation,
    operationPopover,
    setOperationPopover,
    runConfirmedOperation,
  };
}
