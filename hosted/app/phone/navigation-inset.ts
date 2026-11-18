// Keep keyboard scrolling clear of the mobile navigation. The document is the
// scroll container, so its inset is separate from the shell's content padding.
export function observeNavigationInset(nav: HTMLElement): () => void {
  const viewport = nav.ownerDocument.documentElement;
  const view = nav.ownerDocument.defaultView;
  const shell = nav.parentElement;
  if (!view || !shell) return () => {};
  const viewportName = "--phone-viewport-inset", shellName = "--phone-nav-height";
  const previousViewport = viewport.style.getPropertyValue(viewportName);
  const previousViewportPriority = viewport.style.getPropertyPriority(viewportName);
  const previousShell = shell.style.getPropertyValue(shellName);
  const previousShellPriority = shell.style.getPropertyPriority(shellName);
  let active = true;
  const resize = () => {
    if (!active) return;
    const height = nav.getBoundingClientRect().height;
    shell.style.setProperty(shellName, `${height}px`);
    viewport.style.setProperty(viewportName, `${view.getComputedStyle(nav).position === "fixed" ? height : 0}px`);
  };
  resize();
  view.addEventListener("resize", resize);
  const observer = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(resize) : null;
  observer?.observe(nav);
  return () => {
    active = false;
    observer?.disconnect();
    view.removeEventListener("resize", resize);
    if (previousViewport) viewport.style.setProperty(viewportName, previousViewport, previousViewportPriority);
    else viewport.style.removeProperty(viewportName);
    if (previousShell) shell.style.setProperty(shellName, previousShell, previousShellPriority);
    else shell.style.removeProperty(shellName);
  };
}
