/** Release startup UI even when a transition is disabled or never finishes. */
export function unmountGlobalLoading() {
  window.dispatchEvent(new Event('vben:app-ready'));
  const loading = document.querySelector('#__app-loading__');
  if (!loading) return;
  let fallback: ReturnType<typeof setTimeout>;
  const remove = () => {
    clearTimeout(fallback);
    loading.removeEventListener('transitionend', remove);
    loading.remove();
    document.querySelectorAll('[data-app-loading^="inject"]').forEach((element) => element.remove());
  };
  loading.addEventListener('transitionend', remove, { once: true });
  fallback = setTimeout(remove, 1000);
  loading.classList.add('hidden');
}
