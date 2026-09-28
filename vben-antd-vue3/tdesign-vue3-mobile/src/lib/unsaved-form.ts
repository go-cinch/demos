import { onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

export function useUnsavedForm(dirty: () => boolean, busy: () => boolean) {
  const discardOpen = ref(false);
  let resolve: ((discard: boolean) => void) | undefined;
  function decide(discard: boolean) {
    const done = resolve;
    resolve = undefined;
    discardOpen.value = false;
    done?.(discard);
  }
  function beforeClose(): boolean | Promise<boolean> {
    if (busy()) return false;
    if (!dirty()) return true;
    if (resolve) return false;
    discardOpen.value = true;
    return new Promise<boolean>((done) => {
      resolve = done;
    });
  }
  watch(discardOpen, (open) => {
    if (!open) decide(false);
  });
  // Expired sessions and password changes must still reach the authentication screen.
  onBeforeRouteLeave((to) => to.path.startsWith('/auth/') || beforeClose());
  onBeforeUnmount(() => decide(false));
  return { discardOpen, decide, beforeClose };
}
