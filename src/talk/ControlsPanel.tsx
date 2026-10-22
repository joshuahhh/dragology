import { CSSProperties, ReactNode } from "react";

/**
 * Every shortcut on the live-coding page, in the order the controls
 * panel shows them. The keyboard handler and the panel both go through
 * `perform(code, delta)`, so a shortcut and its control can't disagree.
 * All shortcuts are Option/Alt plus the key.
 */
export type Shortcut = {
  /** `KeyboardEvent.code`s that trigger it (a pair means back / forward). */
  codes: string[];
  /** How the keys are shown. */
  keys: string;
  label: string;
  /** Qualifier shown after the label. */
  note?: string;
  section: "Snippet" | "Show" | "Style" | "Actions";
  kind: "snippet" | "toggle" | "cycle" | "swatches" | "size" | "action";
};

export const SHORTCUTS: Shortcut[] = [
  {
    codes: ["BracketLeft", "BracketRight"],
    keys: "⌥[ ⌥]",
    label: "Snippet",
    section: "Snippet",
    kind: "snippet",
  },
  {
    codes: ["KeyO"],
    keys: "⌥O",
    label: "Code ⟷ diagram highlighting",
    section: "Show",
    kind: "toggle",
  },
  {
    codes: ["KeyB"],
    keys: "⌥B",
    label: "Bright look",
    section: "Show",
    kind: "toggle",
  },
  {
    codes: ["KeyZ"],
    keys: "⌥Z",
    label: "Fold styling attributes",
    section: "Show",
    kind: "toggle",
  },
  {
    codes: ["KeyS"],
    keys: "⌥S",
    label: "State",
    section: "Show",
    kind: "toggle",
  },
  {
    codes: ["KeyT"],
    keys: "⌥T",
    label: "Spec tree",
    note: "while dragging",
    section: "Show",
    kind: "toggle",
  },
  {
    codes: ["KeyD"],
    keys: "⌥D",
    label: "Debug overlay",
    note: "while dragging",
    section: "Show",
    kind: "toggle",
  },
  {
    codes: ["KeyH"],
    keys: "⌥H",
    label: "Highlight",
    section: "Style",
    kind: "cycle",
  },
  {
    codes: ["KeyK"],
    keys: "⌥K",
    label: "Highlight color",
    section: "Style",
    kind: "swatches",
  },
  {
    codes: ["KeyC"],
    keys: "⌥C",
    label: "Syntax colors",
    section: "Style",
    kind: "cycle",
  },
  {
    codes: ["KeyL"],
    keys: "⌥L",
    label: "Letter font",
    section: "Style",
    kind: "cycle",
  },
  {
    codes: ["Minus", "Equal"],
    keys: "⌥− ⌥=",
    label: "Code size",
    section: "Style",
    kind: "size",
  },
  {
    codes: ["KeyF"],
    keys: "⌥F",
    label: "Reformat",
    section: "Actions",
    kind: "action",
  },
  {
    codes: ["KeyR"],
    keys: "⌥R",
    label: "Reset diagram",
    section: "Actions",
    kind: "action",
  },
  {
    codes: ["KeyP"],
    keys: "⌥P",
    label: "Copy settings",
    section: "Actions",
    kind: "action",
  },
];

/** ⌥/ opens and closes the panel; Esc closes it. */
export const PANEL_CODE = "Slash";

/** What the panel displays. `byCode` holds each control's current value,
 * keyed by its first code; a toggle's value is `null` when it doesn't
 * apply right now. */
export type ControlValues = {
  snippetTitle: string;
  snippetIdx: number;
  snippetCount: number;
  swatches: { name: string; color: string }[];
  swatchIdx: number;
  byCode: Record<string, boolean | string | number | null>;
};

const INK = "#27272a";
const MUTED = "#a1a1aa";
const ACCENT = "#d946ef";
const LINE = "#e4e4e7";

export function ControlsPanel({
  values,
  perform,
  style,
}: {
  values: ControlValues;
  perform: (code: string, delta?: number) => void;
  style?: CSSProperties;
}) {
  const sections = ["Snippet", "Show", "Style", "Actions"] as const;
  return (
    <div
      role="dialog"
      aria-label="Controls and keyboard shortcuts"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 400,
        background: "white",
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06)",
        padding: "8px 0",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        fontSize: 14,
        color: INK,
        userSelect: "none",
        ...style,
      }}
    >
      {sections.map((section, i) => (
        <div
          key={section}
          style={{
            padding: "4px 16px",
            borderTop: i > 0 ? "1px solid #f4f4f5" : undefined,
          }}
        >
          {section !== "Actions" && <SectionTitle>{section}</SectionTitle>}
          {section === "Actions" ? (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                padding: "6px 0",
              }}
            >
              {SHORTCUTS.filter((s) => s.section === section).map((s) => (
                <button
                  key={s.keys}
                  style={buttonStyle({ padding: "0 8px" })}
                  onClick={() => perform(s.codes[0])}
                >
                  {s.label}
                  <Kbd style={{ marginLeft: 6 }}>{s.keys}</Kbd>
                </button>
              ))}
            </div>
          ) : (
            SHORTCUTS.filter((s) => s.section === section).map((s) => (
              <Row key={s.keys} shortcut={s}>
                <Control shortcut={s} values={values} perform={perform} />
              </Row>
            ))
          )}
        </div>
      ))}
      <div
        style={{
          borderTop: "1px solid #f4f4f5",
          padding: "8px 16px 2px",
          fontSize: 12,
          color: MUTED,
        }}
      >
        <Kbd>⌥/</Kbd> opens and closes this · <Kbd>Esc</Kbd> closes
      </div>
    </div>
  );
}

function Row({
  shortcut,
  children,
}: {
  shortcut: Shortcut;
  children: ReactNode;
}) {
  if (shortcut.kind === "snippet")
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 64px",
          alignItems: "center",
          gap: 10,
          minHeight: 36,
        }}
      >
        {children}
        <Kbd style={{ justifySelf: "end" }}>{shortcut.keys}</Kbd>
      </div>
    );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 64px",
        alignItems: "center",
        gap: 10,
        minHeight: 32,
      }}
    >
      <span>
        {shortcut.label}
        {shortcut.note && (
          <span style={{ color: MUTED, fontSize: 12, marginLeft: 5 }}>
            {shortcut.note}
          </span>
        )}
      </span>
      {children}
      <Kbd style={{ justifySelf: "end" }}>{shortcut.keys}</Kbd>
    </div>
  );
}

function Control({
  shortcut: s,
  values,
  perform,
}: {
  shortcut: Shortcut;
  values: ControlValues;
  perform: (code: string, delta?: number) => void;
}) {
  const [back, fwd] = s.codes;
  const value = values.byCode[s.codes[0]];
  switch (s.kind) {
    case "snippet":
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "26px 1fr 26px",
            gap: 6,
            alignItems: "center",
          }}
        >
          <StepButton
            onClick={() => perform(back)}
            disabled={values.snippetIdx === 0}
          >
            ‹
          </StepButton>
          <div style={{ textAlign: "center", lineHeight: 1.25 }}>
            <div style={{ fontWeight: 600 }}>{values.snippetTitle}</div>
            <div style={{ color: MUTED, fontSize: 12 }}>
              {values.snippetIdx + 1} of {values.snippetCount}
            </div>
          </div>
          <StepButton
            onClick={() => perform(fwd)}
            disabled={values.snippetIdx === values.snippetCount - 1}
          >
            ›
          </StepButton>
        </div>
      );
    case "toggle":
      return (
        <Switch
          on={value === true}
          disabled={value === null}
          onClick={() => perform(back)}
        />
      );
    case "cycle":
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <StepButton onClick={() => perform(back, -1)}>‹</StepButton>
          <span style={{ minWidth: 112, textAlign: "center", fontSize: 13 }}>
            {String(value)}
          </span>
          <StepButton onClick={() => perform(back, 1)}>›</StepButton>
        </span>
      );
    case "swatches":
      return (
        <span style={{ display: "inline-flex", gap: 5 }}>
          {values.swatches.map((sw, i) => (
            <button
              key={sw.name}
              title={sw.name}
              onClick={() => perform(back, i - values.swatchIdx)}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: sw.color,
                border: `2px solid ${i === values.swatchIdx ? INK : "white"}`,
                boxShadow: `0 0 0 1px ${LINE}`,
                padding: 0,
                cursor: "pointer",
              }}
            />
          ))}
        </span>
      );
    case "size":
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <StepButton onClick={() => perform(back)}>−</StepButton>
          <span style={{ minWidth: 34, textAlign: "center", fontSize: 13 }}>
            {String(value)}
          </span>
          <StepButton onClick={() => perform(fwd)}>+</StepButton>
        </span>
      );
    case "action":
      return null;
  }
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        color: MUTED,
        fontWeight: 600,
        margin: "4px 0 2px",
      }}
    >
      {children}
    </div>
  );
}

function Kbd({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <kbd
      style={{
        font: "12px ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#52525b",
        background: "#f4f4f5",
        border: `1px solid ${LINE}`,
        borderBottomWidth: 2,
        borderRadius: 5,
        padding: "1px 6px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </kbd>
  );
}

function buttonStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    border: `1px solid ${LINE}`,
    background: "white",
    borderRadius: 6,
    height: 26,
    font: "inherit",
    fontSize: 13,
    color: INK,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    ...extra,
  };
}

function StepButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={buttonStyle({
        width: 26,
        padding: 0,
        color: disabled ? "#d4d4d8" : "#71717a",
        cursor: disabled ? "default" : "pointer",
      })}
    >
      {children}
    </button>
  );
}

function Switch({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "not available for this snippet" : undefined}
      style={{
        width: 34,
        height: 20,
        borderRadius: 999,
        border: "none",
        padding: 0,
        position: "relative",
        background: disabled ? "#f4f4f5" : on ? ACCENT : LINE,
        cursor: disabled ? "default" : "pointer",
        transition: "background 150ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

/**
 * The corner button that opens the panel. `visible` is the page's
 * decision; this only fades.
 */
export function HelpButton({
  visible,
  open,
  onClick,
}: {
  visible: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label="Controls and keyboard shortcuts (⌥/)"
      title="Controls and keyboard shortcuts (⌥/)"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: `1px solid ${open ? "#a1a1aa" : LINE}`,
        background: "white",
        color: open ? INK : MUTED,
        font: "600 17px ui-sans-serif, system-ui, sans-serif",
        cursor: "pointer",
        boxShadow: "0 1px 2px rgba(0,0,0,.05)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 300ms",
      }}
    >
      ?
    </button>
  );
}
