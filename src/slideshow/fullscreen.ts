export function toggleFullscreen(
  showError: (title: string, error: unknown) => void,
) {
  (document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen()
  ).catch((e) => showError("Couldn't toggle fullscreen", e));
}
