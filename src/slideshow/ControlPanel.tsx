import { type RefObject } from "react";
import { Link } from "react-router-dom";
import { type AudienceFeed } from "./audienceFeed";
import { StageInfo } from "./StageInfo";
import { formatSeconds, savedTotal, type TimingMode } from "./timing";

/** What the hotkeys that aren't Ctrl+Shift commands do */
export type PanelAction = "next" | "prev" | "saveNotes" | "cancelNotes";

/** How to do each action, or null where it can't be done now */
export type PanelActions = Record<PanelAction, (() => void) | null>;

/**
 * A hotkey as the panel lists it: its alternative key combos, each a list of
 * keys drawn as one keycap, what it does, and how its row does it: as an
 * action, or as the Ctrl+Shift command with that key's `code`
 */
type Hotkey = { combos: string[][]; does: string } & (
  | { action: PanelAction }
  | { code: string }
);

const HOTKEY_SECTIONS: { title: string; hotkeys: Hotkey[] }[] = [
  {
    title: "Navigate",
    hotkeys: [
      {
        combos: [["→"], ["↓"], ["Space"], ["⌃", "⇧", "→"], ["⌃", "⇧", "↓"]],
        does: "Next",
        action: "next",
      },
      {
        combos: [["←"], ["↑"], ["⌃", "⇧", "←"], ["⌃", "⇧", "↑"]],
        does: "Previous",
        action: "prev",
      },
      { combos: [["⌃", "⇧", "O"]], does: "Outline", code: "KeyO" },
    ],
  },
  {
    title: "Present",
    hotkeys: [
      {
        combos: [["⌃", "⇧", "A"]],
        does: "Share with audience window",
        code: "KeyA",
      },
      { combos: [["⌃", "⇧", "F"]], does: "Fullscreen", code: "KeyF" },
      { combos: [["⌃", "⇧", "S"]], does: "Stage only", code: "KeyS" },
      {
        combos: [["⌃", "⇧", "B"]],
        does: "Stage in its own window",
        code: "KeyB",
      },
      { combos: [["⌃", "⇧", "R"]], does: "Reload this slide", code: "KeyR" },
      { combos: [["⌃", "⇧", "D"]], does: "Demo settings bars", code: "KeyD" },
      { combos: [["⌃", "⇧", "T"]], does: "Time a run-through", code: "KeyT" },
      { combos: [["⌃", "⇧", "P"]], does: "This panel", code: "KeyP" },
    ],
  },
  {
    title: "Notes editor",
    hotkeys: [
      {
        combos: [
          ["⌘", "S"],
          ["⌘", "Enter"],
        ],
        does: "Save",
        action: "saveNotes",
      },
      { combos: [["Esc"]], does: "Cancel", action: "cancelNotes" },
    ],
  },
];

/**
 * The presenter's control panel, opened from the button at the right end of
 * the status bar (or Ctrl+Shift+P): the hotkeys, timing (run-throughs during dev), and how the
 * stage reaches the audience. Only the arrow keys and Space yield to a focused editor or demo;
 * the Ctrl+Shift keys work everywhere. Clicking a hotkey's row does what the key does.
 */
export function ControlPanel({
  stageRef,
  feed,
  timing,
  actions,
  onCommand,
  onClose,
}: {
  stageRef: RefObject<HTMLElement | null>;
  feed: AudienceFeed;
  timing: TimingMode | null;
  actions: PanelActions;
  /** Does the Ctrl+Shift command with this key's `code` */
  onCommand: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-72 rounded-lg border border-white/10 bg-zinc-900 text-xs text-zinc-300 shadow-xl shadow-black/50 select-none">
      <div className="flex items-center justify-between border-b border-white/10 py-1.5 pr-1.5 pl-3">
        <span className="font-semibold text-zinc-200">Controls</span>
        <button
          type="button"
          onClick={onClose}
          title="Close (⌃⇧P)"
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="block"
          >
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-3 px-3 py-2.5">
        {HOTKEY_SECTIONS.map(({ title, hotkeys }) => (
          <section key={title}>
            <SectionTitle>{title}</SectionTitle>
            <div className="-mx-1.5 flex flex-col">
              {hotkeys.map((hotkey) => {
                const { combos, does } = hotkey;
                const run =
                  "code" in hotkey
                    ? () => onCommand(hotkey.code)
                    : actions[hotkey.action];
                return (
                  <button
                    key={does}
                    type="button"
                    disabled={!run}
                    // Keep focus where it is: in the notes editor, a blur would
                    // save the edit before Cancel could drop it
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run?.()}
                    className="flex items-center justify-between gap-3 rounded px-1.5 py-0.5 text-left enabled:hover:bg-white/10 enabled:hover:text-zinc-100 disabled:opacity-50"
                  >
                    <span>{does}</span>
                    <span className="flex flex-wrap items-center justify-end gap-1">
                      {combos.map((combo, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-zinc-600">/</span>}
                          <kbd className="min-w-[1.25rem] rounded border border-white/15 bg-white/5 px-1 text-center font-sans text-[11px] leading-[18px] tracking-wider text-zinc-200">
                            {combo.join("")}
                          </kbd>
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <section>
          <SectionTitle>Timing</SectionTitle>
          <TimingControls timing={timing} />
        </section>
        <section>
          <SectionTitle>Stage size</SectionTitle>
          <StageInfo stageRef={stageRef} feed={feed} />
        </section>
      </div>
    </div>
  );
}

function TimingControls({ timing }: { timing: TimingMode | null }) {
  const total = savedTotal();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-zinc-400">
        {total.slides > 0
          ? `Latest timings: ${formatSeconds(total.seconds)} over ${total.slides} slides`
          : "No slides timed yet"}
        {total.slides > 0 && (
          <Link
            to="/slideshow-timing"
            className="shrink-0 text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-300"
          >
            Breakdown
          </Link>
        )}
      </div>
      {timing && <RunControls timing={timing} />}
    </div>
  );
}

function RunControls({ timing }: { timing: TimingMode }) {
  const { run, saving, start, stop, discard } = timing;
  const button =
    "rounded border border-white/15 bg-white/5 px-2 py-0.5 text-zinc-200 hover:bg-white/10 disabled:opacity-50";
  return (
    <div className="flex gap-1.5">
      {run ? (
        <>
          <button
            type="button"
            className={button}
            onClick={stop}
            disabled={saving}
          >
            {saving ? "Saving…" : "Stop and save"}
          </button>
          <button type="button" className={button} onClick={discard}>
            Discard run
          </button>
        </>
      ) : (
        <button type="button" className={button} onClick={start}>
          Start timing
        </button>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
      {children}
    </div>
  );
}

/** The status bar's button that opens and closes the panel */
export function ControlPanelButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${open ? "Hide" : "Show"} controls and hotkeys (⌃⇧P)`}
      aria-expanded={open}
      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
        open
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      }`}
    >
      {/* A keyboard */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h.01M11 13h.01M15 13h.01M8 16h8" />
      </svg>
    </button>
  );
}
