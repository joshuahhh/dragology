import qrcode from "qrcode-generator";
import { ReactNode, useMemo } from "react";
import { useTitle } from "../useTitle";
import { AnimateAlgebraSection } from "./AnimateAlgebraSection";
import { DragSpecDesignerSection } from "./DragSpecDesignerSection";
import { ListsInListsSection } from "./ListsInListsSection";
import { NodesAndNoodlesSection } from "./NodesAndNoodlesSection";
import { RingOfBeadsSection } from "./RingOfBeadsSection";
import { SchedulerSection } from "./SchedulerSection";
import { StickyNotesSection } from "./StickyNotesSection";
import { StudySection } from "./StudySection";
import { TactileTessellationsSection } from "./TactileTessellationsSection";
import { TeaserSection } from "./TeaserSection";
import { TwistedTreesSection } from "./TwistedTreesSection";

export function Section({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="min-h-screen flex flex-col px-16 py-24">
      <h2 className="text-sm font-medium uppercase tracking-widest text-gray-400 mb-8">
        {title}
      </h2>
      {children}
    </section>
  );
}

const QR_DISPLAY_CELL_SIZE = 3;
const QR_MARGIN = 1;

export function Lens({
  zoom,
  children,
  cursorScale,
  filenamePrefix,
  belowLeftQr,
}: {
  zoom: number;
  children: ReactNode;
  cursorScale?: number;
  filenamePrefix?: string;
  belowLeftQr?: ReactNode;
}) {
  const effectiveCursorScale = cursorScale ?? zoom;
  const { qrSrc, moduleCount } = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(
      JSON.stringify({ cursorScale: effectiveCursorScale, filenamePrefix }),
    );
    qr.make();
    return {
      qrSrc: qr.createDataURL(1, QR_MARGIN),
      moduleCount: qr.getModuleCount(),
    };
  }, [effectiveCursorScale, filenamePrefix]);
  const qrPixels = (moduleCount + QR_MARGIN * 2) * QR_DISPLAY_CELL_SIZE;
  const qrImg = (style: React.CSSProperties) => (
    <img
      src={qrSrc}
      style={{
        position: "absolute",
        width: qrPixels,
        height: qrPixels,
        pointerEvents: "none",
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        width: "fit-content",
        paddingLeft: qrPixels,
        paddingRight: qrPixels,
      }}
    >
      {qrImg({ top: 0, left: 0 })}
      {belowLeftQr && (
        <div
          style={{
            position: "absolute",
            top: qrPixels,
            left: 0,
            width: qrPixels,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {belowLeftQr}
        </div>
      )}
      <div style={{ zoom, outline: "1px solid #ccc" }}>{children}</div>
      {qrImg({ bottom: 0, right: 0 })}
    </div>
  );
}

function Divider() {
  return <hr className="border-t border-gray-200 m-0" />;
}

export const StudioPage = () => {
  useTitle("Studio — Dragology");
  return (
    <div className="bg-white min-h-screen text-gray-700">
      <TeaserSection />
      <Divider />
      <RingOfBeadsSection />
      <Divider />
      <SchedulerSection />
      <Divider />
      <ListsInListsSection />
      <Divider />
      <NodesAndNoodlesSection />
      <Divider />
      <TactileTessellationsSection />
      <Divider />
      <DragSpecDesignerSection />
      <Divider />
      <AnimateAlgebraSection />
      <Divider />
      <TwistedTreesSection />
      <Divider />
      <StudySection />
      <Divider />
      <StickyNotesSection />
    </div>
  );
};
