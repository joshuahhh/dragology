import { useEffect, useRef, useState } from "react";
import { useTitle } from "../useTitle";
import { type AudienceFeed, type Crop } from "./audienceFeed";
import { ErrorToasts, useShownErrors } from "./ErrorToasts";
import { toggleFullscreen } from "./fullscreen";
import { STAGE_H, STAGE_W } from "./slide";

/**
 * The slideshow for the audience's screen: the presenter's stage, as video.
 * The presenter's window opens it (A, in the slideshow). Double-click it, or
 * press F, to go fullscreen.
 */
export function SlideshowAudiencePage() {
  useTitle("Dragology — Audience");
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"no-presenter" | "waiting" | "live">(
    "waiting",
  );
  const [crop, setCrop] = useState<Crop | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { errors, show: showError, dismiss: dismissError } = useShownErrors();

  useEffect(() => {
    const onError = (e: ErrorEvent) => showError("Error", e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) =>
      showError("Unhandled rejection", e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [showError]);

  // Follow the feed on the presenter's window. It's a new one whenever that
  // window reloads, so keep checking for it.
  useEffect(() => {
    let feed: AudienceFeed | undefined;
    const onStream = () => {
      const video = videoRef.current!;
      const stream = feed?.stream ?? null;
      if (video.srcObject !== stream) {
        try {
          video.srcObject = stream;
        } catch (e) {
          showError("Couldn't show the presenter's stream", e);
        }
        if (stream) {
          video
            .play()
            .catch((e) => showError("Couldn't play the presenter's stream", e));
        }
      }
      setStatus(!feed ? "no-presenter" : stream ? "live" : "waiting");
    };
    const onCrop = () => setCrop(feed?.crop ?? null);
    const reportSize = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (feed && r) {
        const dpr = window.devicePixelRatio;
        feed.audienceSize = { w: r.width * dpr, h: r.height * dpr };
      }
    };
    const reportFrameSize = () => {
      const v = videoRef.current;
      if (feed && v) {
        feed.audienceFrameSize = v.videoWidth
          ? { w: v.videoWidth, h: v.videoHeight }
          : null;
      }
    };
    const forget = () => {
      if (feed) {
        feed.audienceSize = null;
        feed.audienceFrameSize = null;
      }
    };
    const connect = () => {
      let next: AudienceFeed | undefined;
      try {
        next = (window.opener as Window | null)?.slideshowAudienceFeed;
      } catch {
        // The opener is gone, or isn't ours
      }
      if (next === feed) return;
      feed?.removeEventListener("stream", onStream);
      feed?.removeEventListener("crop", onCrop);
      feed = next;
      feed?.addEventListener("stream", onStream);
      feed?.addEventListener("crop", onCrop);
      onStream();
      onCrop();
      reportSize();
      reportFrameSize();
    };
    connect();
    const interval = setInterval(connect, 500);
    window.addEventListener("resize", reportSize);
    // A capture's frames change size with what's captured
    const video = videoRef.current!;
    video.addEventListener("resize", reportFrameSize);
    window.addEventListener("pagehide", forget);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", reportSize);
      video.removeEventListener("resize", reportFrameSize);
      window.removeEventListener("pagehide", forget);
      forget();
      feed?.removeEventListener("stream", onStream);
      feed?.removeEventListener("crop", onCrop);
    };
  }, [showError]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f") toggleFullscreen(showError);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [showError]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ background: "#111", cursor: fullscreen ? "none" : undefined }}
      onDoubleClick={() => toggleFullscreen(showError)}
    >
      <div
        ref={boxRef}
        style={{
          position: "relative",
          width: `min(100vw, 100vh * ${STAGE_W / STAGE_H})`,
          aspectRatio: `${STAGE_W} / ${STAGE_H}`,
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          onError={() =>
            showError("The video failed", videoRef.current?.error?.message)
          }
          muted
          playsInline
          style={{
            display: status === "live" ? "block" : "none",
            ...(crop
              ? // Scaled and shifted so the crop fills the stage's box
                {
                  position: "absolute",
                  left: `${(-crop.x / crop.w) * 100}%`,
                  top: `${(-crop.y / crop.h) * 100}%`,
                  width: `${100 / crop.w}%`,
                  height: `${100 / crop.h}%`,
                  maxWidth: "none",
                  objectFit: "fill",
                }
              : { width: "100%", height: "100%", objectFit: "contain" }),
          }}
        />
        {status !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-lg">
            {status === "no-presenter"
              ? "Open this window from the slideshow, with A."
              : "Press A in the slideshow to share its stage."}
          </div>
        )}
      </div>
      <div className="fixed bottom-3 right-3" style={{ zIndex: 100 }}>
        <ErrorToasts errors={errors} onDismiss={dismissError} />
      </div>
    </div>
  );
}
