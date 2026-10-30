import _ from "lodash";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type SlidePos = { slide: number; step: number };

/** What a key press forwarded to the stage's window needs to be pressed again */
type KeyInit = Pick<KeyboardEventInit, "key" | "code" | "shiftKey">;

/** What the presenter's window and the popped-out stage's say to each other */
type PopoutMessage =
  // The presenter's, on opening: is the stage out?
  | { type: "hello" }
  // The stage's, on opening (or answering hello): it's out, on this slide
  | { type: "open"; pos: SlidePos }
  // The stage's, as it closes
  | { type: "closed" }
  // The presenter's: bring the stage back
  | { type: "close" }
  | { type: "pos"; pos: SlidePos }
  // A Ctrl+Shift command for the other window, by key code
  | { type: "command"; code: string }
  // A bare key pressed in the presenter's window, for the stage's
  | { type: "key"; init: KeyInit };

const CHANNEL = "dragology-slideshow-popout";

/**
 * The stage, popped out into a window of its own (⌃⇧B), for presenting from
 * one screen: share that window, and keep the notes and the outline in the
 * presenter's. The stage window is the slideshow's stage-only page, a page of
 * its own, so there's still just the one stage, live in whichever window has
 * it. The two windows keep to the same slide and step, over a
 * BroadcastChannel, so either survives the other reloading.
 *
 * Bare keys pressed in the presenter's window (outside its notes editor) go to
 * the stage's, as if pressed there, for the slides' own keys (a demo's cue,
 * say) and so that → moves on as it would there.
 */
export function useStagePopout({
  isStageWindow,
  pos,
  setPos,
  stageUrl,
  onCommand,
  showError,
}: {
  /** Whether this window is the popped-out stage, rather than the presenter's */
  isStageWindow: boolean;
  pos: SlidePos;
  setPos: Dispatch<SetStateAction<SlidePos>>;
  /** The stage window's URL, to open it at */
  stageUrl: string;
  /** Runs a command the other window sent */
  onCommand: (code: string) => void;
  showError: (title: string, error?: unknown) => void;
}) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  // In the presenter's window: whether the stage is out
  const [poppedOut, setPoppedOut] = useState(false);
  const poppedOutRef = useRef(poppedOut);
  poppedOutRef.current = poppedOut;
  // The stage window, if this window opened it (and hasn't reloaded since)
  const stageWindowRef = useRef<Window | null>(null);
  // The position the other window last sent, not to be sent back to it
  const receivedRef = useRef<SlidePos | null>(null);
  const latest = useRef({ pos, setPos, onCommand });
  latest.current = { pos, setPos, onCommand };

  const post = useCallback(
    (msg: PopoutMessage) => channelRef.current?.postMessage(msg),
    [],
  );

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL);
    channelRef.current = channel;
    // A stage window that's reloading says it's closed, then that it's open:
    // wait a moment before bringing the stage back here
    let closing: ReturnType<typeof setTimeout> | undefined;
    const receivePos = (next: SlidePos) => {
      receivedRef.current = next;
      latest.current.setPos((pos) => (_.isEqual(pos, next) ? pos : next));
    };
    channel.onmessage = ({ data: msg }: MessageEvent<PopoutMessage>) => {
      if (isStageWindow) {
        if (msg.type === "hello") {
          channel.postMessage({ type: "open", pos: latest.current.pos });
        } else if (msg.type === "close") {
          window.close();
        } else if (msg.type === "pos") {
          receivePos(msg.pos);
        } else if (msg.type === "command") {
          latest.current.onCommand(msg.code);
        } else if (msg.type === "key") {
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              ...msg.init,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      } else {
        if (msg.type === "open" || msg.type === "pos") {
          clearTimeout(closing);
          setPoppedOut(true);
          receivePos(msg.pos);
        } else if (msg.type === "closed") {
          clearTimeout(closing);
          closing = setTimeout(() => {
            stageWindowRef.current = null;
            setPoppedOut(false);
          }, 1000);
        } else if (msg.type === "command") {
          latest.current.onCommand(msg.code);
        }
      }
    };
    if (!isStageWindow) {
      channel.postMessage({ type: "hello" });
      return () => {
        clearTimeout(closing);
        channel.close();
        channelRef.current = null;
      };
    }
    channel.postMessage({ type: "open", pos: latest.current.pos });
    const onPageHide = () => channel.postMessage({ type: "closed" });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      channel.close();
      channelRef.current = null;
    };
  }, [isStageWindow]);

  // Send the other window where we've gone (but not where it sent us)
  const linked = isStageWindow || poppedOut;
  const { slide, step } = pos;
  useEffect(() => {
    if (!linked) return;
    const echo = _.isEqual(receivedRef.current, { slide, step });
    receivedRef.current = null;
    if (!echo) post({ type: "pos", pos: { slide, step } });
  }, [linked, slide, step, post]);

  // A stage window closed without saying so (it crashed, say) is still closed
  useEffect(() => {
    if (!poppedOut) return;
    const interval = setInterval(() => {
      if (stageWindowRef.current?.closed) {
        stageWindowRef.current = null;
        setPoppedOut(false);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [poppedOut]);

  // The presenter's bare keys, on the way down, before anything here sees them
  useEffect(() => {
    if (!poppedOut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable]")
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      post({
        type: "key",
        init: { key: e.key, code: e.code, shiftKey: e.shiftKey },
      });
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [poppedOut, post]);

  /** Pops the stage out, or brings it back */
  const toggle = useCallback(() => {
    if (isStageWindow) {
      window.close();
    } else if (poppedOutRef.current) {
      post({ type: "close" });
      stageWindowRef.current?.close();
      stageWindowRef.current = null;
      setPoppedOut(false);
    } else {
      const w = window.open(
        stageUrl,
        "dragology-stage",
        "popup,width=1280,height=720",
      );
      if (!w) {
        showError(
          "The stage window was blocked: allow pop-ups for this site, then press ⌃⇧B again",
        );
        return;
      }
      stageWindowRef.current = w;
      setPoppedOut(true);
    }
  }, [isStageWindow, stageUrl, showError, post]);

  /** Sends a command to the other window */
  const sendCommand = useCallback(
    (code: string) => post({ type: "command", code }),
    [post],
  );

  return { poppedOut, toggle, sendCommand };
}
