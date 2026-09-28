import { demo } from "../../demo";
import { DemoNotes } from "../../demo/ui";
import { BalancedPanel } from "./balanced";
import { HeapPanel } from "./heap";
import { SplayPanel } from "./splay";
import { TwoThreePanel } from "./two-three";

// # Rotations & Rebalancing
//
// A data-structure playground where drags are the primitive
// operations. Each panel is a pure render function plus a way of
// computing candidate states; the textbook animations (rotations,
// splits, sift-ups) fall out of interpolating between them.

function Section({
  title,
  children,
  notes,
}: {
  title: string;
  notes: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-md font-medium italic mb-1">{title}</h3>
      <DemoNotes>{notes}</DemoNotes>
      {children}
    </div>
  );
}

export default demo(
  () => (
    <div>
      <Section
        title="Splay tree"
        notes={
          <>
            Drag any non-root node <b>upward</b>. Each splay step (zig, zig-zig,
            zig-zag) is a <span className="font-mono">d.between</span> from the
            current tree to the tree one step later, with a chained snap radius,
            so a single drag to the root plays out as a sequence of rotations.
            Nodes are laid out by in-order rank, so rotations only move nodes
            vertically.
          </>
        }
      >
        <SplayPanel />
      </Section>

      <Section
        title="AVL / red-black tree"
        notes={
          <>
            Drag a key from the deck into the tree. The drop preview is the tree{" "}
            <i>after</i> insertion and rebalancing — rotations (and, for
            red-black, recolorings) included. Move the key away to cancel.
          </>
        }
      >
        <BalancedPanel />
      </Section>

      <Section
        title="2-3 tree"
        notes={
          <>
            Drag a key into a full leaf and watch the split propagate upward:
            the middle key is pushed into the parent, which may split in turn.
            Nodes created by splits use{" "}
            <span className="font-mono">dragologyEmergeFrom</span> to grow out
            of the node they split from.
          </>
        }
      >
        <TwoThreePanel />
      </Section>

      <Section
        title="Binary heap"
        notes={
          <>
            Drag a value from the deck to append it to the heap, then drag it{" "}
            <b>up past its parent</b> to sift it up (each swap is a chained{" "}
            <span className="font-mono">d.between</span>). Drag a node down past
            its larger child to sift down. Drag the root into the tray to
            extract the max. The array view below stays in sync because it is
            the same state rendered twice.
          </>
        }
      >
        <HeapPanel />
      </Section>
    </div>
  ),
  {
    tags: [
      "d.between",
      "d.fixed",
      "d.closest",
      "d.dropTarget",
      "spec.withSnapRadius [chain]",
      "spec.withFloating",
      "spec.whenFar",
      "dragologyEmergeFrom",
      "data structures",
    ],
  },
);
