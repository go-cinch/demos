import { onScopeDispose, ref, watch } from 'vue';

import { Modal } from 'ant-design-vue';

import { MFACancelled, mfaPrompt } from '#/security/mfa-prompt';
export function useOperationConfirmation() {
  const operationPopover = ref('');
  const submittingConfirmations = new Set<ReturnType<typeof Modal.confirm>>();

  async function runConfirmedOperation(operation: () => unknown) {
    try {
      return await operation();
    } catch (cause) {
      if (!(cause instanceof MFACancelled)) throw cause;
    }
  }

  function confirmSensitiveOperation(
    options: Parameters<typeof Modal.confirm>[0],
  ) {
    const dialog = Modal.confirm({
      ...options,
      async onOk() {
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
    if (open && mfaPrompt.value?.mode !== 'sensitive') {
      operationPopover.value = key;
    } else if (operationPopover.value === key) {
      operationPopover.value = '';
    }
  }

  watch(
    () => mfaPrompt.value?.id,
    () => {
      if (mfaPrompt.value?.mode !== 'sensitive') return;
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
