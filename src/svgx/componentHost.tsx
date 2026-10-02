import React, {
  cloneElement,
  createContext,
  createElement,
  ReactNode,
  useContext,
} from "react";
import { createPortal } from "react-dom";
import {
  assertNoDragologyKeyOnComponent,
  isComponentElement,
  isValidSvgx,
  Svgx,
} from ".";
import { LayeredSvgx } from "./layers";
import { getPath } from "./path";

// Dragology never calls the component elements in a draggable's tree
// (<NoteWidget />, as opposed to <g>); React mounts each one once.
// Dragology rebuilds and rearranges the SVG it draws freely (layers
// re-stack, drags float, idle and dragging trees differ), so a
// component rendered in place would be remounted all the time.
// Instead, each one is portaled into a container element that we own
// and keep for as long as the component lives, and the container is
// moved into a placeholder wherever the component currently appears.
// Moving a DOM node doesn't disturb React.

type GrabHandler = (e: React.PointerEvent) => void;

type HostedComponent = {
  key: string;
  element: Svgx;
  /** Inside a foreignObject, so the container must be HTML. */
  html: boolean;
  /** onPointerDown of the nearest ancestor that starts a drag. */
  grab: GrabHandler | undefined;
};

type HostedComponentContextValue = { grab: GrabHandler | undefined };

const HostedComponentContext =
  createContext<HostedComponentContextValue | null>(null);

/**
 * For a component rendered inside a draggable. Returns a pointerdown
 * handler that starts a drag on the nearest enclosing element with
 * `dragologyOnDrag`, so part of the component can act as a drag
 * handle. (Pointer events inside a component don't otherwise reach
 * the draggable.) Does nothing during a drag or outside a draggable.
 */
export function useDragHandle(): GrabHandler {
  const ctx = useContext(HostedComponentContext);
  return (e) => ctx?.grab?.(e);
}

const SVG_NS = "http://www.w3.org/2000/svg";

export class ComponentHost {
  private containers = new Map<string, { el: Element; html: boolean }>();
  private refCallbacks = new Map<string, (node: Element | null) => void>();
  private retained = new Map<string, HostedComponent>();

  /**
   * Replaces component elements in each layer with placeholders, and
   * returns the portals that render them. With `keepAbsent`,
   * components missing from this frame stay mounted (off-screen), so
   * a drag preview that omits one doesn't destroy its state.
   */
  frame(
    layered: LayeredSvgx,
    keepAbsent: boolean,
  ): { layered: LayeredSvgx; portals: ReactNode } {
    const current = new Map<string, HostedComponent>();
    const byId = new Map(
      [...layered.byId].map(([id, layer]) => [
        id,
        {
          ...layer,
          element: this.walk(layer.element, "", false, undefined, current),
        },
      ]),
    );

    const hosted = keepAbsent
      ? new Map([...this.retained, ...current])
      : current;
    this.retained = hosted;
    for (const key of [...this.containers.keys()]) {
      if (!hosted.has(key)) {
        this.containers.delete(key);
        this.refCallbacks.delete(key);
      }
    }

    const portals = [...hosted.values()].map((component) =>
      createPortal(
        <HostedComponentContext.Provider value={{ grab: component.grab }}>
          {stripDragologyProps(component.element)}
        </HostedComponentContext.Provider>,
        this.container(component),
        component.key,
      ),
    );
    return { layered: { ...layered, byId }, portals };
  }

  private container(component: HostedComponent): Element {
    const existing = this.containers.get(component.key);
    if (existing && existing.html === component.html) return existing.el;
    let el: Element;
    if (component.html) {
      el = document.createElement("div");
      (el as HTMLElement).style.display = "contents";
    } else {
      el = document.createElementNS(SVG_NS, "g");
    }
    this.containers.set(component.key, { el, html: component.html });
    return el;
  }

  /** Stable per key, so React doesn't detach and reattach every frame. */
  private refCallback(key: string): (node: Element | null) => void {
    let cb = this.refCallbacks.get(key);
    if (!cb) {
      cb = (node) => {
        const container = this.containers.get(key)?.el;
        if (node && container && container.parentNode !== node) {
          node.appendChild(container);
        }
      };
      this.refCallbacks.set(key, cb);
    }
    return cb;
  }

  private walk(
    node: Svgx,
    pathHere: string,
    html: boolean,
    grab: GrabHandler | undefined,
    out: Map<string, HostedComponent>,
  ): Svgx {
    // Paths match assignPaths where it went; inside foreignObjects
    // (where it doesn't go) we continue the same scheme.
    const path = getPath(node) ?? pathHere;

    if (isComponentElement(node)) {
      const key = path;
      out.set(key, { key, element: node, html, grab });
      return html
        ? createElement("div", {
            key: node.key,
            ref: this.refCallback(key),
            style: { display: "contents" },
          })
        : createElement("g", { key: node.key, ref: this.refCallback(key) });
    }

    const { children, onPointerDown, dragologyOnDrag } = node.props;
    if (children === undefined) return node;
    // Only a handler that DraggableRenderer attached for a drag, not
    // one the author wrote.
    const childGrab =
      dragologyOnDrag && onPointerDown ? (onPointerDown as GrabHandler) : grab;
    const childHtml = html || node.type === "foreignObject";

    let unkeyedIndex = 0;
    let changed = false;
    // Number elements across nested arrays in order, like
    // React.Children.toArray does, so paths are the same whether or not
    // an earlier pass flattened these children.
    const walkChild = (child: ReactNode): ReactNode => {
      if (Array.isArray(child)) {
        const mapped = child.map(walkChild);
        if (mapped.some((c, i) => c !== child[i])) return mapped;
        return child;
      }
      if (!isValidSvgx(child)) return child;
      assertNoDragologyKeyOnComponent(child);
      const step = child.props.dragologyKey ?? String(unkeyedIndex++);
      const result = this.walk(
        child,
        path + step + "/",
        childHtml,
        childGrab,
        out,
      );
      if (result !== child) changed = true;
      return result;
    };
    const newChildren = walkChild(children);
    return changed ? cloneElement(node, undefined, newChildren) : node;
  }
}

function stripDragologyProps(element: Svgx): Svgx {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(element.props)) {
    if (k === "data-path" || k.startsWith("dragology")) continue;
    props[k] = v;
  }
  return createElement(element.type, props);
}
