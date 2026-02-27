import { Link, useSearchParams } from "react-router-dom";
import { Demo, listedDemos, unlistedDemos } from "./registry";
import { tagMatches } from "./tags";
import { DemoCard, DemoSettingsBar, DemoSettingsProvider, DemoTag } from "./ui";

function hasTag(demo: Demo, filter: string) {
  return demo.tags?.some((tag) => tagMatches(tag, filter));
}

export function DemoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get("tag");

  const onTagClick = (label: string) =>
    setSearchParams(tagFilter === label ? {} : { tag: label }, {
      replace: false,
    });

  const filteredDemos = tagFilter
    ? listedDemos.filter((d) => hasTag(d, tagFilter))
    : listedDemos;
  const filteredUnlisted = tagFilter
    ? unlistedDemos.filter((d) => hasTag(d, tagFilter))
    : unlistedDemos;

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
          <div className="flex items-center gap-2 px-5 pb-3 max-w-3xl mx-auto w-full">
            <span className="text-sm text-gray-400">Filtering by</span>
            <DemoTag tag={tagFilter} />
            <button
              onClick={() => setSearchParams({})}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              clear
            </button>
          </div>
        )}
        {filteredUnlisted.length > 0 && (
          <>
            <div className="flex flex-col gap-5 px-5 pb-5 max-w-3xl mx-auto w-full">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Unlisted
              </h2>
              {filteredUnlisted.map((demo) => (
                <div key={demo.id} id={demo.id}>
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
            <div key={demo.id} id={demo.id}>
              <DemoCard demo={demo} linkTitle onTagClick={onTagClick} />
            </div>
          ))}
        </div>
        <DemoSettingsBar />
      </div>
    </DemoSettingsProvider>
  );
}
