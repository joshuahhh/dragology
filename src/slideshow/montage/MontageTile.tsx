import { type CSSProperties, useEffect, useRef } from "react";
import { slideFileUrl } from "../slide";
import type { MontageTile } from "./layout";

/** How long a video's last frame takes to crossfade into its start */
const CROSSFADE_S = 0.5;

const fill: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

/**
 * A muted video that loops forever. Each time round, its last frame
 * crossfades into its start: the frame is copied to a canvas over the video,
 * which fades out once the video is playing again. (Adapted from the
 * LoopingVideo of the Declarative Dragging slide.)
 */
export function LoopingVideo({
  file,
  paused = false,
}: {
  file: string;
  /** Show the first frame, still */
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current!;
    if (!paused) {
      video.play()?.catch(() => {});
    } else {
      video.pause();
      if (video.currentTime !== 0) video.currentTime = 0;
    }
  }, [paused]);
  return (
    <>
      <video
        ref={videoRef}
        src={slideFileUrl(file)}
        autoPlay={!paused}
        preload="auto"
        muted
        playsInline
        onEnded={async (e) => {
          const video = e.currentTarget;
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d")!.drawImage(video, 0, 0);
          canvas.style.transition = "none";
          canvas.style.opacity = "1";
          // Commit the opacity, so that the fade below starts from it
          canvas.getBoundingClientRect();
          video.currentTime = 0;
          await video.play().catch(() => {});
          canvas.style.transition = `opacity ${CROSSFADE_S * 1000}ms linear`;
          canvas.style.opacity = "0";
        }}
        style={fill}
      />
      <canvas ref={canvasRef} style={{ ...fill, opacity: 0 }} />
    </>
  );
}

/** A tile's contents: its video, or a labeled placeholder for one to come */
export function TileContent({
  tile,
  paused,
  labelScale = 1,
}: {
  tile: MontageTile;
  paused?: boolean;
  /** Scales the placeholder's text, for a canvas drawn small */
  labelScale?: number;
}) {
  if (tile.file) return <LoopingVideo file={tile.file} paused={paused} />;
  const fontSize = Math.max(14, Math.min(tile.w, tile.h) / 9) * labelScale;
  return (
    <div
      style={{
        ...fill,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: fontSize * 0.4,
        padding: fontSize,
        boxSizing: "border-box",
        background:
          "repeating-linear-gradient(135deg, #f4f4f5 0 14px, #ececee 14px 28px)",
        color: "#71717a",
        textAlign: "center",
        fontFamily: "ui-monospace, Menlo, monospace",
      }}
    >
      <div style={{ fontSize, fontWeight: 600, color: "#52525b" }}>
        {tile.id}
      </div>
      {tile.label && (
        <div style={{ fontSize: fontSize * 0.6, lineHeight: 1.3 }}>
          {tile.label}
        </div>
      )}
    </div>
  );
}
