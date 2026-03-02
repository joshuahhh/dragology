import { ReactNode } from "react";

/**
 * Button to open a file in an editor. Only visible in Vite's dev mode.
 */
export function OpenInEditor({
  relativePath,
  className,
  children,
}: {
  relativePath: string;
  className?: string;
  children: ReactNode;
}) {
  if (!import.meta.env.DEV) return null;
  return (
    <button
      onClick={() => fetch(`/__open-in-editor?file=${relativePath}`)}
      className={className}
    >
      {children}
    </button>
  );
}
