import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../useTitle";
import { demosById } from "./registry";
import { DemoCard, DemoSettingsBar, DemoSettingsProvider } from "./ui";

export function SingleDemoPage({ id }: { id: string }) {
  useTitle(`${id} — Dragology`);
  const [searchParams] = useSearchParams();
  const minimal = searchParams.has("minimal");
  const navigate = useNavigate();
  const demo = demosById.get(id);

  if (!demo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="text-center py-10 px-5 max-w-3xl mx-auto">
          <h1 className="text-3xl font-normal text-gray-800">Demo not found</h1>
          <div className="mt-5">
            <Link
              to="/demos"
              className="text-blue-600 text-sm hover:text-blue-700"
            >
              &larr; Back to all demos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (minimal) {
    return <MinimalDemo Component={demo.Component} />;
  }

  return (
    <DemoSettingsProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="py-10 px-5 max-w-3xl mx-auto w-full">
          <Link
            to="/demos"
            className="inline-block mb-4 text-sm text-gray-600 hover:text-gray-800 no-underline"
          >
            ← Back to all demos
          </Link>
        </div>
        <div className="flex flex-col gap-5 px-5 pb-5 max-w-3xl mx-auto flex-1 w-full">
          <div
            className={
              demo.hideByDefault ? "ring-2 ring-red-300 rounded-lg" : ""
            }
          >
            <DemoCard
              demo={demo}
              onTagClick={(tag) =>
                navigate(`/demos?tag=${encodeURIComponent(tag)}`)
              }
            />
          </div>
        </div>
        <div className="pb-14" />
        <DemoSettingsBar />
      </div>
    </DemoSettingsProvider>
  );
}

function MinimalDemo({ Component }: { Component: React.ComponentType }) {
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "d") setShowSettings((s) => !s);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <DemoSettingsProvider persist={false}>
      <div className="p-[5px]">
        <Component />
      </div>
      {showSettings && <DemoSettingsBar compact />}
    </DemoSettingsProvider>
  );
}
