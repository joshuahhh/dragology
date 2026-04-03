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

const QR_SIZE = 23 * 3;

export function Lens({
  zoom,
  children,
  cursorScale,
}: {
  zoom: number;
  children: ReactNode;
  cursorScale?: number;
}) {
  const qrSrc = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(JSON.stringify({ cursorScale }));
    qr.make();
    return qr.createDataURL(1, 1);
  }, [cursorScale]);
  // const qrSrc = qrA;
  const qrSize = QR_SIZE / zoom;
  return (
    <div
      style={{
        zoom,
        paddingLeft: qrSize,
        paddingRight: qrSize,
        width: "fit-content",
      }}
    >
      <div style={{ position: "relative", outline: "1px solid #ccc" }}>
        {children}
        <img
          src={qrSrc}
          style={{
            position: "absolute",
            top: 0,
            left: -qrSize,
            width: qrSize,
            height: qrSize,
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
        <img
          src={qrSrc}
          style={{
            position: "absolute",
            bottom: 0,
            right: -qrSize,
            width: qrSize,
            height: qrSize,
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
      </div>
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
