import qrcode from "qrcode-generator";
import { ReactNode, useMemo } from "react";
import { useTitle } from "../useTitle";
import { CanvasOfListsNestedSection } from "./CanvasOfListsNestedSection";
import { IntervalGraphSection } from "./IntervalGraphSection";
import { NodeWiresSection } from "./NodeWiresSection";
import { NoolTreeSection } from "./NoolTreeSection";
import { OrderPreservingSection } from "./OrderPreservingSection";
import { RingOfBeadsSection } from "./RingOfBeadsSection";
import { SpecWorkshopSection } from "./SpecWorkshopSection";
import { StudySection } from "./StudySection";
import { TeaserSection } from "./TeaserSection";
import { TessellationSection } from "./TessellationSection";

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
}: {
  zoom: number;
  children: ReactNode;
  cursorScale?: number;
  filenamePrefix?: string;
}) {
  const { qrSrc, moduleCount } = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(JSON.stringify({ cursorScale, filenamePrefix }));
    qr.make();
    return {
      qrSrc: qr.createDataURL(1, QR_MARGIN),
      moduleCount: qr.getModuleCount(),
    };
  }, [cursorScale, filenamePrefix]);
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
      <IntervalGraphSection />
      <Divider />
      <CanvasOfListsNestedSection />
      <Divider />
      <NodeWiresSection />
      <Divider />
      <TessellationSection />
      <Divider />
      <SpecWorkshopSection />
      <Divider />
      <NoolTreeSection />
      <Divider />
      <OrderPreservingSection />
      <Divider />
      <StudySection />
    </div>
  );
};
