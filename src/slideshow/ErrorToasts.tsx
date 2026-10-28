import { useCallback, useState } from "react";

export type ShownError = { id: number; title: string; detail: string };

let nextId = 0;

/**
 * Errors to show on screen (with `ErrorToasts`), rather than only in the
 * console. `show` logs them too.
 */
export function useShownErrors() {
  const [errors, setErrors] = useState<ShownError[]>([]);
  const show = useCallback((title: string, error?: unknown) => {
    console.warn(title, error ?? "");
    const detail =
      error === undefined
        ? ""
        : error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
    setErrors((es) => [...es, { id: nextId++, title, detail }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setErrors((es) => es.filter((e) => e.id !== id));
  }, []);
  return { errors, show, dismiss };
}

/** Errors, in a column, each with a copy button */
export function ErrorToasts({
  errors,
  onDismiss,
}: {
  errors: ShownError[];
  onDismiss: (id: number) => void;
}) {
  if (errors.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 max-w-md select-text">
      {errors.map((e) => (
        <ErrorToast key={e.id} error={e} onDismiss={() => onDismiss(e.id)} />
      ))}
    </div>
  );
}

function ErrorToast({
  error,
  onDismiss,
}: {
  error: ShownError;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = [
      error.title,
      error.detail,
      "",
      `Page: ${location.href}`,
      `Browser: ${navigator.userAgent}`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      (e) => console.warn("Couldn't copy the error:", e),
    );
  };
  return (
    <div className="rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-100 shadow-lg">
      <div className="flex items-start gap-2">
        <div className="flex-1 font-semibold">{error.title}</div>
        <button
          className="rounded bg-red-800 px-2 text-xs hover:bg-red-700"
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          className="px-1 text-red-300 hover:text-white"
          onClick={onDismiss}
          title="Dismiss"
        >
          ×
        </button>
      </div>
      {error.detail && (
        <div className="mt-1 font-mono text-xs break-words">{error.detail}</div>
      )}
    </div>
  );
}
