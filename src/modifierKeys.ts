function monitorKey(
  predicate: (e: KeyboardEvent) => boolean,
): Iterator<boolean> {
  let value = false;

  const onDown = (e: KeyboardEvent) => {
    if (predicate(e)) value = true;
  };
  const onUp = (e: KeyboardEvent) => {
    if (predicate(e)) value = false;
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  return {
    next: () => ({ value, done: false as const }),
  };
}

export const altKey = monitorKey((e) => e.key === "Alt");
