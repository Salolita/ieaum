export function onPageHidden(report: () => void) {
  let wasVisible = document.visibilityState === 'visible';
  function hide() {
    if (!wasVisible) return;
    wasVisible = false;
    report();
  }
  function visibility() {
    if (document.visibilityState === 'hidden') hide();
    else if (document.visibilityState === 'visible') wasVisible = true;
  }
  function show() { wasVisible = document.visibilityState === 'visible'; }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
  };
}
