import { RefObject, useState } from "react";

export function CopyStateButton({
  stateRef,
}: {
  stateRef: RefObject<unknown>;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors cursor-pointer"
      onClick={() => {
        const state = stateRef.current;
        if (state == null) return;
        navigator.clipboard.writeText(JSON.stringify(state, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "copied" : "copy state"}
    </button>
  );
}
