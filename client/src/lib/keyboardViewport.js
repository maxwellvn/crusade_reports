const EDITABLE_CONTROL = "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable='true']";

export function calculateKeyboardInset({ innerHeight, viewportHeight, offsetTop = 0, focused }) {
  if (!focused) return 0;
  return Math.max(0, Math.round(innerHeight - viewportHeight - offsetTop));
}

export function needsKeyboardReveal(rect, { top, height, actionBarHeight = 0, margin = 16 }) {
  const safeTop = top + margin;
  const safeBottom = top + height - actionBarHeight - margin;
  return rect.top < safeTop || rect.bottom > safeBottom;
}

export function installKeyboardViewportManager(win = window, doc = document) {
  const viewport = win.visualViewport;
  const root = doc.documentElement;
  let revealFrame = 0;
  let blurTimer = 0;

  const focusedControl = () => doc.activeElement?.matches?.(EDITABLE_CONTROL) ? doc.activeElement : null;
  const viewportMetrics = () => ({
    top: Math.round(viewport?.offsetTop || 0),
    height: Math.round(viewport?.height || win.innerHeight),
  });

  const revealFocusedControl = () => {
    win.cancelAnimationFrame(revealFrame);
    revealFrame = win.requestAnimationFrame(() => {
      const control = focusedControl();
      if (!control) return;
      const actionBarHeight = doc.querySelector(".public-fixed-bottom-action")?.getBoundingClientRect().height || 0;
      if (needsKeyboardReveal(control.getBoundingClientRect(), { ...viewportMetrics(), actionBarHeight })) {
        control.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
    });
  };

  const update = () => {
    const control = focusedControl();
    const metrics = viewportMetrics();
    const inset = calculateKeyboardInset({
      innerHeight: win.innerHeight,
      viewportHeight: metrics.height,
      offsetTop: metrics.top,
      focused: Boolean(control),
    });
    root.style.setProperty("--keyboard-inset", `${inset}px`);
    root.toggleAttribute("data-keyboard-open", inset > 0);
    if (control) revealFocusedControl();
  };

  const onFocusIn = () => {
    win.clearTimeout(blurTimer);
    update();
    blurTimer = win.setTimeout(update, 80);
  };
  const onFocusOut = () => {
    win.clearTimeout(blurTimer);
    blurTimer = win.setTimeout(update, 80);
  };

  doc.addEventListener("focusin", onFocusIn);
  doc.addEventListener("focusout", onFocusOut);
  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  update();

  return () => {
    doc.removeEventListener("focusin", onFocusIn);
    doc.removeEventListener("focusout", onFocusOut);
    win.removeEventListener("resize", update);
    win.removeEventListener("orientationchange", update);
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    win.clearTimeout(blurTimer);
    win.cancelAnimationFrame(revealFrame);
    root.style.removeProperty("--keyboard-inset");
    root.removeAttribute("data-keyboard-open");
  };
}
