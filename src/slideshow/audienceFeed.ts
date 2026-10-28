import _ from "lodash";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { useShownErrors } from "./ErrorToasts";

// Region Capture (Chromium only), which lib.dom doesn't have yet
declare class CropTarget {
  static fromElement(element: Element): Promise<CropTarget>;
}
type CroppableTrack = MediaStreamTrack & {
  cropTo(target: CropTarget | null): Promise<void>;
};

/** Part of a video frame, as fractions of its width and height */
export type Crop = { x: number; y: number; w: number; h: number };

/**
 * What the presenter's window sends the audience's: the stage, as a capture
 * of the presenter's own tab cropped to it (pointer and all). So whatever
 * happens on the presenter's stage (drags, live coding) happens on the
 * audience's too. Where the browser can't crop the capture itself (Firefox,
 * which captures the whole window), it says where the stage is in it, for
 * the audience window to crop.
 *
 * It lives on the presenter's window, as `slideshowAudienceFeed`, where the
 * audience window (which the presenter's opens) finds it through
 * `window.opener`.
 */
export class AudienceFeed extends EventTarget {
  stream: MediaStream | null = null;
  /** Where the stage is in the stream's frames, if they aren't just the stage */
  crop: Crop | null = null;
  /** The audience window, once the presenter's has opened it */
  audienceWindow: Window | null = null;
  /** How big the audience window draws the stage, in its device pixels */
  audienceSize: { w: number; h: number } | null = null;
  /** The size of the frames the audience window gets */
  audienceFrameSize: { w: number; h: number } | null = null;

  setStream(stream: MediaStream | null) {
    this.stream = stream;
    this.dispatchEvent(new Event("stream"));
  }

  setCrop(crop: Crop | null) {
    if (_.isEqual(crop, this.crop)) return;
    this.crop = crop;
    this.dispatchEvent(new Event("crop"));
  }
}

declare global {
  interface Window {
    slideshowAudienceFeed?: AudienceFeed;
  }
}

export const AUDIENCE_PATH = "#/slideshow-audience";

/** Whether this browser can crop a capture to an element (Chromium can) */
const canCrop = typeof CropTarget !== "undefined";

async function cropToStage(track: MediaStreamTrack, stage: HTMLElement) {
  await (track as CroppableTrack).cropTo(await CropTarget.fromElement(stage));
}

/**
 * Where the stage is in a capture of the presenter's window, or of the
 * screen it's on. It takes the window's toolbars to be all above the page, as
 * in Firefox, with any border the same on the other three sides.
 */
function stageInCapture(stage: HTMLElement, track: MediaStreamTrack): Crop {
  const r = stage.getBoundingClientRect();
  // The page's top-left corner in the frame, and the frame's size
  const border = (window.outerWidth - window.innerWidth) / 2;
  let left = border;
  let top = window.outerHeight - window.innerHeight - border;
  let frameW = window.outerWidth;
  let frameH = window.outerHeight;
  if (capturesScreen(track)) {
    // Firefox's own screen.left and screen.top: where the screen is among
    // the others, in the coordinates of window.screenX and screenY
    const s = screen as Screen & { left?: number; top?: number };
    left += window.screenX - (s.left ?? 0);
    top += window.screenY - (s.top ?? 0);
    frameW = screen.width;
    frameH = screen.height;
  }
  return {
    x: (left + r.left) / frameW,
    y: (top + r.top) / frameH,
    w: r.width / frameW,
    h: r.height / frameH,
  };
}

/**
 * Whether a capture is of the presenter's screen rather than its window.
 * Firefox's displaySurface doesn't say, so this goes by whose shape the
 * frames have. (When they're the same shape, the window fills the screen,
 * and it doesn't matter.)
 */
function capturesScreen(track: MediaStreamTrack) {
  const { width, height } = track.getSettings();
  if (!width || !height) return false;
  const aspect = width / height;
  return (
    Math.abs(aspect - screen.width / screen.height) <
    Math.abs(aspect - window.outerWidth / window.outerHeight)
  );
}

/**
 * Sends the stage to the audience window. Returns `share`, which opens the
 * audience window if it isn't open, and starts capturing the stage if it
 * isn't being captured. Call it from a user gesture: the capture prompt and
 * the new window both need one. Also returns the errors to show on screen
 * (and a way to add more).
 *
 * Where the browser can't crop the capture (Firefox), the audience window
 * crops it, to where the stage is in the presenter's window.
 */
export function useAudienceFeed(stageRef: RefObject<HTMLElement | null>) {
  const [feed] = useState(
    () => (window.slideshowAudienceFeed ??= new AudienceFeed()),
  );
  const { errors, show: showError, dismiss: dismissError } = useShownErrors();

  // A capture started on an earlier visit to the page is cropped to that
  // visit's stage, so crop it to this one
  useEffect(() => {
    const track = feed.stream?.getVideoTracks()[0];
    if (canCrop && track && stageRef.current) {
      cropToStage(track, stageRef.current).catch((e) =>
        showError("Couldn't crop the capture to the stage", e),
      );
    }
  }, [feed, stageRef, showError]);

  // Keep the audience window up to date on where the stage is in the
  // capture. (Checking often catches the window moving, too.)
  useEffect(() => {
    if (canCrop) return;
    const update = () => {
      const track = feed.stream?.getVideoTracks()[0];
      const stage = stageRef.current;
      feed.setCrop(track && stage ? stageInCapture(stage, track) : null);
    };
    update();
    const interval = setInterval(update, 250);
    feed.addEventListener("stream", update);
    return () => {
      clearInterval(interval);
      feed.removeEventListener("stream", update);
      feed.setCrop(null);
    };
  }, [feed, stageRef]);

  const capture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      // As many pixels as there are: left to themselves, browsers may capture
      // at less (Firefox captures a Retina window at 1x)
      video: {
        frameRate: { ideal: 60 },
        width: { ideal: 8192 },
        height: { ideal: 8192 },
      },
      audio: false,
      preferCurrentTab: true,
      surfaceSwitching: "exclude",
    } as DisplayMediaStreamOptions);
    const [track] = stream.getVideoTracks();
    track.addEventListener("ended", () => {
      if (feed.stream !== stream) return;
      feed.setStream(null);
      showError(
        "The capture stopped: Stop Sharing was pressed, or the browser or the OS ended it. Press A to share again",
      );
    });
    if (canCrop && stageRef.current) {
      // Still share it uncropped if cropping fails
      await cropToStage(track, stageRef.current).catch((e) =>
        showError("Couldn't crop the capture to the stage", e),
      );
    }
    console.log("Sharing the stage:", track.getSettings());
    feed.setStream(stream);
  }, [feed, stageRef, showError]);

  const share = useCallback(() => {
    // Ask to capture before opening the window, since opening one uses up
    // the gesture's user activation
    if (!feed.stream) {
      capture().catch((e) => showError("Couldn't capture the stage", e));
    }
    // Leave an open audience window be: opening it again would reload it,
    // and focusing it would take the keyboard from the presenter
    if (!feed.audienceWindow || feed.audienceWindow.closed) {
      feed.audienceWindow = window.open(
        AUDIENCE_PATH,
        "dragology-audience",
        "popup,width=960,height=540",
      );
      if (!feed.audienceWindow) {
        showError(
          "The audience window was blocked: allow pop-ups for this site, then press A again",
        );
      }
    }
  }, [feed, capture, showError]);

  return { feed, share, errors, showError, dismissError };
}
