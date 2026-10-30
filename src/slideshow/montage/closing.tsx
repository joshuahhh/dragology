import { useSlideShown } from "../slide";
import {
  ClosingMontageSlide,
  MONTAGE_PLAN_TIMED,
  MontagePlayer,
} from "./MontageCanvas";
import {
  ClosingVariantSlide,
  VariantMontagePlayer,
} from "./variants/VariantMontage";
import type { VariantId } from "./variants/variants";

/**
 * Which montage the closing slides show: the grid of cards ("grid"), or one
 * of the variants (compare them at #/montage-variants).
 */
export const CLOSING_MONTAGE: "grid" | VariantId = "flow-pan";

/** With a variant: whether the groups light up in turn as they're named */
export const CLOSING_MONTAGE_GROUPS = true;

/** The closing montage, as the close's first slide */
export function ClosingMontage() {
  return CLOSING_MONTAGE === "grid" ? (
    <ClosingMontageSlide />
  ) : (
    <ClosingVariantSlide
      variant={CLOSING_MONTAGE}
      groups={CLOSING_MONTAGE_GROUPS}
    />
  );
}

/** The montage pulled all the way back, behind the last slide's card */
export function ClosingMontageBackdrop() {
  const shown = useSlideShown();
  const last = MONTAGE_PLAN_TIMED.length - 1;
  return CLOSING_MONTAGE === "grid" ? (
    <MontagePlayer plan={MONTAGE_PLAN_TIMED} step={last} paused={!shown} />
  ) : (
    <VariantMontagePlayer
      variant={CLOSING_MONTAGE}
      step={last}
      paused={!shown}
      caption={false}
    />
  );
}
