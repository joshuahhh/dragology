import { useEffect, useState } from "react";
import { slideFileUrl } from "../../slide";

// The variants mount a video per tile in view, and on a repeating canvas
// that can mean a hundred at once, several of each clip. Streamed, they
// starve each other of connections and most never start, so each clip is
// fetched once, whole, a few at a time, and every tile of it plays the copy
// in memory.

const urls = new Map<string, string>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let running = 0;
const CONCURRENCY = 4;

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const file = queue.shift()!;
    running++;
    fetch(slideFileUrl(file))
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then((blob) => urls.set(file, URL.createObjectURL(blob)))
      // fall back to streaming it
      .catch(() => urls.set(file, slideFileUrl(file)))
      .finally(() => {
        running--;
        listeners.forEach((l) => l());
        pump();
      });
  }
}

/** Start fetching clips (each only once), in the order given */
export function loadClips(files: string[]) {
  for (const f of files) if (!urls.has(f) && !queue.includes(f)) queue.push(f);
  pump();
}

/** A clip's in-memory URL, once it's fetched */
export function clipUrl(file: string): string | undefined {
  return urls.get(file);
}

/** Fetch these clips, re-rendering as each arrives */
export function useClipsLoaded(files: string[]) {
  const [, setCount] = useState(0);
  const key = files.join("|");
  useEffect(() => {
    const l = () => setCount((c) => c + 1);
    listeners.add(l);
    loadClips(files);
    return () => void listeners.delete(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
