// Safe back navigation: normal entry → router.back(); deep link (no history)
// → explicit fallback route. Fixes bare-router.back() deep-link traps.
export function goBack(router: any, fallback: string) {
  try {
    if (typeof router?.canGoBack === 'function' ? router.canGoBack() : true) {
      router.back();
      return;
    }
  } catch { /* fall through to fallback */ }
  router.replace(fallback);
}
