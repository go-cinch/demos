export function focusFirstError(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    const field = form?.querySelector<HTMLElement>('.invalid, .warning');
    if (!field) return;
    field.scrollIntoView({ block: 'center', behavior: 'instant' });
    field
      .querySelector<HTMLElement>('input,textarea,button,[tabindex="0"]')
      ?.focus({ preventScroll: true });
  });
}
