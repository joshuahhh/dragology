import { ReactNode } from "react";
import { useTitle } from "../useTitle";
import { CanvasOfListsNestedSection } from "./CanvasOfListsNestedSection";
import { IntervalGraphSection } from "./IntervalGraphSection";
import { NodeWiresSection } from "./NodeWiresSection";
import { NoolTreeSection } from "./NoolTreeSection";
import { OrderPreservingSection } from "./OrderPreservingSection";
import qrA from "./qr_A.png";
import { RingOfBeadsSection } from "./RingOfBeadsSection";
import { SpecWorkshopSection } from "./SpecWorkshopSection";
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

const QR_SIZE = 23 * 2;

export function Lens({
  zoom,
  children,
}: {
  zoom: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        zoom,
        paddingLeft: QR_SIZE,
        paddingRight: QR_SIZE,
        width: "fit-content",
      }}
    >
      <div style={{ position: "relative", outline: "1px solid #ccc" }}>
        {children}
        <img
          src={qrA}
          style={{
            position: "absolute",
            top: 0,
            left: -QR_SIZE,
            width: QR_SIZE,
            height: QR_SIZE,
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
        <img
          src={qrA}
          style={{
            position: "absolute",
            bottom: 0,
            right: -QR_SIZE,
            width: QR_SIZE,
            height: QR_SIZE,
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
    </div>
  );
};
