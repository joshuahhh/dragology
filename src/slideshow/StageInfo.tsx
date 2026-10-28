import { type RefObject, useEffect, useReducer } from "react";
import { type AudienceFeed } from "./audienceFeed";

/**
 * For the presenter's control panel: how many pixels the stage gets at each
 * step on its way to the audience. The audience's stage can be no sharper
 * than the smallest of them.
 */
export function StageInfo({
  stageRef,
  feed,
}: {
  stageRef: RefObject<HTMLElement | null>;
  feed: AudienceFeed;
}) {
  // Sizes change without telling React (zooms, the capture, the other
  // window), so just check now and then
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, []);

  const rows: [string, string][] = [];
  const r = stageRef.current?.getBoundingClientRect();
  if (r) {
    const dpr = window.devicePixelRatio;
    rows.push(["Stage here", size(r.width * dpr, r.height * dpr)]);
  }
  const settings = feed.stream?.getVideoTracks()[0]?.getSettings();
  if (settings) {
    const { width, height, frameRate } = settings;
    const rate = frameRate ? ` @ ${Math.round(frameRate)} fps` : "";
    rows.push([
      "Capture",
      width && height ? `${size(width, height)}${rate}` : `?${rate}`,
    ]);
    if (feed.crop && width && height) {
      rows.push([
        "Stage in capture",
        size(feed.crop.w * width, feed.crop.h * height),
      ]);
    }
  }
  if (feed.audienceFrameSize) {
    const { w, h } = feed.audienceFrameSize;
    rows.push(["Frames received", size(w, h)]);
  }
  if (feed.audienceSize) {
    rows.push([
      "Audience stage",
      size(feed.audienceSize.w, feed.audienceSize.h),
    ]);
  }

  if (rows.length === 0) return <div className="text-zinc-500">Not shown</div>;
  return (
    <table className="w-full tabular-nums select-text">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td className="pr-3">{label}</td>
            <td className="text-right text-zinc-200">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function size(w: number, h: number) {
  return `${Math.round(w)}×${Math.round(h)}`;
}
