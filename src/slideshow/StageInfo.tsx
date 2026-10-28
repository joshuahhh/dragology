import { type RefObject, useEffect, useReducer } from "react";
import { type AudienceFeed } from "./audienceFeed";

/**
 * A little panel for the presenter: how many pixels the stage gets at each
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

  return (
    <div className="rounded bg-black/70 px-2 py-1 text-xs text-gray-300 tabular-nums select-text">
      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="pr-3 text-gray-500">{label}</td>
              <td className="text-right">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function size(w: number, h: number) {
  return `${Math.round(w)}×${Math.round(h)}`;
}
