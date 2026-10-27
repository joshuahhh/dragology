import { STAGE_H, STAGE_W } from "./slide";
import { slides } from "./slides";

/**
 * Every content slide at once, each on a half-size stage, for
 * snapshot-slides.sh to screenshot. (Video slides are left out: the outline
 * shows their frames directly.)
 */
export function SlideshowSnapshotPage() {
  return (
    <div>
      {slides.map((s, i) =>
        "content" in s ? (
          <div
            key={i}
            data-slide={i + 1}
            className="bg-white flex flex-col"
            style={{
              position: "relative",
              width: STAGE_W,
              height: STAGE_H,
              zoom: 0.5,
              contain: "layout paint",
            }}
          >
            <div className="flex-1 min-h-0" style={{ display: "grid" }}>
              <div
                style={{
                  gridArea: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                {s.content}
              </div>
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
