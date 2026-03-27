function monitorKey(
  predicate: (e: KeyboardEvent) => boolean,
): Iterator<boolean> {
  let value = false;

  // see https://tldraw.dev/blog/adding-delays-to-modifier-keys
  let upTimeout: ReturnType<typeof setTimeout> | undefined;

  const onDown = (e: KeyboardEvent) => {
    if (predicate(e)) {
      clearTimeout(upTimeout);
      value = true;
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (predicate(e)) {
      upTimeout = setTimeout(() => {
        value = false;
      }, 150);
    }
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  return {
    next: () => ({ value, done: false as const }),
  };
}

export const altKey = monitorKey((e) => e.key === "Alt");
