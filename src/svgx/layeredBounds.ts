import { emptyBounds, getGlobalBounds, unionBounds } from "./bounds";
import { LayeredSvgx } from "./layers";

export function getLayeredBounds(layered: LayeredSvgx) {
  return [...layered.byId.values()].reduce(
    (bounds, element) =>
      unionBounds(
        bounds,
        getGlobalBounds(element, element.props.transform ?? ""),
      ),
    emptyBounds,
  );
}
