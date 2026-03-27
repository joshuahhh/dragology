import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTitle } from "../useTitle";
import { Demo, listedDemos, unlistedDemos } from "./registry";
import { tagMatches } from "./tags";
import { DemoCard, DemoSettingsBar, DemoSettingsProvider, DemoTag } from "./ui";

function hasTag(demo: Demo, filter: string) {
  return demo.tags?.some((tag) => tagMatches(tag, filter));
}

export function DemoPage() {
  useTitle("Demos — Dragology");
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get("tag");
  const [showHidden, setShowHidden] = useState(false);

  const onTagClick = (label: string) =>
    setSearchParams(tagFilter === label ? {} : { tag: label }, {
      replace: false,
    });

  const visibleListedDemos = showHidden
    ? listedDemos
    : listedDemos.filter((d) => !d.hideByDefault);
  const filteredDemos = tagFilter
    ? visibleListedDemos.filter((d) => hasTag(d, tagFilter))
    : visibleListedDemos;
  const visibleUnlisted = showHidden
    ? unlistedDemos
    : unlistedDemos.filter((d) => !d.hideByDefault);
  const filteredUnlisted = tagFilter
    ? visibleUnlisted.filter((d) => hasTag(d, tagFilter))
    : visibleUnlisted;
  const hiddenCount =
    listedDemos.filter((d) => d.hideByDefault).length +
    unlistedDemos.filter((d) => d.hideByDefault).length;

  return (
    <DemoSettingsProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="py-10 px-5 max-w-3xl mx-auto w-full">
          <Link
            to="/"
            className="inline-block mb-4 text-sm text-gray-600 hover:text-gray-800 no-underline"
          >
            ← Back to home
          </Link>
          <h1 className="text-3xl font-normal text-gray-800">Demos</h1>
        </div>
        {tagFilter && (
          <div className="sticky top-0 left-0 right-0 z-10 flex justify-center pointer-events-none py-2">
            <div className="pointer-events-auto bg-white border border-gray-200 flex items-center gap-2 py-1.5 px-3 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <span className="text-sm text-gray-400">Filtering by</span>
              <DemoTag tag={tagFilter} />
              <button
                onClick={() => setSearchParams({})}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                clear
              </button>
            </div>
          </div>
        )}
        {filteredUnlisted.length > 0 && (
          <>
            <div className="flex flex-col gap-5 px-5 pb-5 max-w-3xl mx-auto w-full">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Unlisted
              </h2>
              {filteredUnlisted.map((demo) => (
                <div
                  key={demo.id}
                  id={demo.id}
                  className={
                    demo.hideByDefault ? "ring-2 ring-red-300 rounded-lg" : ""
                  }
                >
                  <DemoCard demo={demo} linkTitle onTagClick={onTagClick} />
                </div>
              ))}
            </div>
            <hr className="border-gray-200 w-full mb-5" />
          </>
        )}
        <div className="flex flex-col gap-5 px-5 pb-5 max-w-3xl mx-auto flex-1 w-full">
          {filteredUnlisted.length > 0 && (
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
              Listed
            </h2>
          )}
          {filteredDemos.map((demo) => (
            <div
              key={demo.id}
              id={demo.id}
              className={
                demo.hideByDefault ? "ring-2 ring-red-300 rounded-lg" : ""
              }
            >
              <DemoCard demo={demo} linkTitle onTagClick={onTagClick} />
            </div>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="px-5 pb-5 max-w-3xl mx-auto w-full">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
              />
              Show hidden demos ({hiddenCount})
            </label>
          </div>
        )}
        <div className="pb-14" />
        <DemoSettingsBar />
      </div>
    </DemoSettingsProvider>
  );
}
