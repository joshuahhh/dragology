import { ComponentType } from "react";
import { DemoSettingsBar, DemoSettingsProvider } from "../demo/ui";
import { useTitle } from "../useTitle";
import * as Components from "./components";
import { LiveEditor } from "./LiveEditor";
import { MDXPage } from "./MDXPage";

// Import all .mdx files from docs directory
const mdxFiles = import.meta.glob<{ default: ComponentType }>("./*.mdx", {
  eager: true,
});

export function DocsPage({ slug }: { slug: string }) {
  useTitle(`${slug} — Dragology`);
  // Convert slug to file path
  const filePath = `./${slug}.mdx`;
  const mdxModule = mdxFiles[filePath];

  if (!mdxModule) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Page Not Found
          </h1>
          <p className="text-gray-600 mb-4">
            Could not find documentation for "{slug}"
          </p>
          <a href="#/" className="text-blue-600 hover:text-blue-800 underline">
            ← Back to home
          </a>
        </div>
      </div>
    );
  }

  const Content = mdxModule.default;

  return (
    <DemoSettingsProvider>
      <MDXPage components={{ ...Components, LiveEditor }}>{Content}</MDXPage>
      <DemoSettingsBar only={["showDebugOverlay"]} />
    </DemoSettingsProvider>
  );
}
