// Move an explicitly submitted search to its result heading only while that
// submission still owns the user's attention. Later typing, navigation, focus,
// scrolling or window switching cancels the move.
export function prepareSearchResultReveal(
  form: HTMLFormElement | null,
  resultHeading: () => HTMLHeadingElement | null,
  stillCurrent: () => boolean,
): (completed: boolean) => void {
  const doc = form?.ownerDocument, win = doc?.defaultView;
  if (!form || !doc || !win) return () => {};
  let cancelled = false, finished = false;
  const interactions = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  const cleanup = () => {
    for (const name of interactions) doc.removeEventListener(name, cancel, true);
    doc.removeEventListener("focusin", changedFocus, true);
    win.removeEventListener("blur", cancel);
  };
  const cancel = () => { cancelled = true; cleanup(); };
  const changedFocus = (event: FocusEvent) => {
    // Disabling the submit button can return focus to the page itself.
    if (event.target !== doc.body && event.target !== doc.documentElement) cancel();
  };
  for (const name of interactions) doc.addEventListener(name, cancel, { capture: true, passive: true });
  doc.addEventListener("focusin", changedFocus, true);
  win.addEventListener("blur", cancel);
  return completed => {
    if (finished) return;
    finished = true;
    if (!completed || cancelled) { cleanup(); return; }
    win.requestAnimationFrame(() => {
      const target = resultHeading();
      const reveal = !cancelled && doc.hasFocus() && form.isConnected && target?.isConnected && stillCurrent();
      cleanup();
      if (reveal && target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
  };
}
