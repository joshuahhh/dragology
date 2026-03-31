import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import { demosById } from "../demo/registry";
import { DemoCard, DemoSettingsBar, DemoSettingsProvider } from "../demo/ui";

const figuredemos = [
  "ring-of-beads",
  "interval-graph",
  "canvas-of-lists-nested",
  "tessellation",
  "nool-tree",
  "order-preserving",
  "node-wires",
  "spec-workshop",
] as const;

const figureLabels: Record<string, string> = {
  "ring-of-beads": "A — Alex's Ring of Beads",
  "interval-graph": "B — Alex's Scheduler",
  "canvas-of-lists-nested": "C — Lists in Lists",
  "tessellation": "D — Tactile Tessellations",
  "nool-tree": "E — Animate Algebra",
  "order-preserving": "F — Twisted Trees",
  "node-wires": "G — Noodles and Nodes",
  "spec-workshop": "H — Drag-Spec Workshop",
};

export function FiguresPage() {
  useTitle("Paper Figures — Declarative Dragging");
  return (
    <DemoSettingsProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="py-10 px-5 max-w-3xl mx-auto w-full">
          <Link
            to="/"
            className="inline-block mb-4 text-sm text-gray-600 hover:text-gray-800 no-underline"
          >
            ← Back to home
          </Link>
          <h1 className="text-3xl font-normal text-gray-800">
            Paper Figures
          </h1>
          <p className="text-gray-500 mt-2">
            Interactive versions of Figure 2 (A–H) from the paper.
          </p>
        </div>
        <div className="flex flex-col gap-5 px-5 pb-5 max-w-3xl mx-auto flex-1 w-full">
          {figureDetails.map(({ id, demo, label }) => (
            <div key={id} id={id}>
              <h2 className="text-lg font-medium text-gray-700 mb-2">
                {label}
              </h2>
              <DemoCard demo={demo} linkTitle />
            </div>
          ))}
        </div>
        <div className="pb-14" />
        <DemoSettingsBar />
      </div>
    </DemoSettingsProvider>
  );
}

const figureDetails = figuredemos.map((id) => {
  const demo = demosById.get(id);
  if (!demo) throw new Error(`Figure demo "${id}" not found`);
  return { id, demo, label: figureLabels[id] };
});
