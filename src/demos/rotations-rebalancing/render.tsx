import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import { Pos } from "./bst";

export const NODE_R = 15;

/**
 * A round key node: circle plus centered label. Used for BST nodes,
 * deck cards, and heap nodes so that a key looks the same wherever
 * it lives (which lets the interpolation engine carry it between
 * places).
 */
export function keyCircle({
  id,
  pos,
  label,
  fill,
  stroke,
  textFill = "#111",
  strokeWidth = 2,
  dragged = false,
  extra,
}: {
  id: string;
  pos: Pos;
  label: string | number;
  fill: string;
  stroke: string;
  textFill?: string;
  strokeWidth?: number;
  dragged?: boolean;
  extra?: Record<string, unknown>;
}): Svgx {
  return (
    <g
      id={id}
      transform={translate(pos.x, pos.y)}
      dragologyZIndex={dragged ? "/1" : false}
      {...extra}
    >
      <circle
        r={NODE_R}
        fill={fill}
        stroke={dragged ? "#f59e0b" : stroke}
        strokeWidth={dragged ? 3 : strokeWidth}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        fill={textFill}
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

export function edgeLine(id: string, a: Pos, b: Pos, stroke = "#94a3b8"): Svgx {
  return (
    <line
      id={id}
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={stroke}
      strokeWidth={2}
      dragologyZIndex={-1}
    />
  );
}

/** A small clickable text button drawn inside the SVG. */
export function svgButton(
  id: string,
  pos: Pos,
  label: string,
  onClick: () => void,
): Svgx {
  return (
    <g
      id={id}
      transform={translate(pos.x, pos.y)}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={0}
        y={0}
        width={label.length * 6.5 + 14}
        height={20}
        rx={4}
        fill="#f1f5f9"
        stroke="#cbd5e1"
      />
      <text
        x={7}
        y={10}
        dominantBaseline="central"
        fontSize={11}
        fill="#475569"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

export function caption(id: string, pos: Pos, text: string): Svgx {
  return (
    <text
      id={id}
      transform={translate(pos.x, pos.y)}
      fontSize={12}
      fill="#64748b"
      fontStyle="italic"
    >
      {text}
    </text>
  );
}
