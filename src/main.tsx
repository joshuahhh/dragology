import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes } from "react-router-dom";
import { autoRoute } from "./autoRoute";
import { DemoPage } from "./demo/DemoPage";
import { SingleDemoPage } from "./demo/SingleDemoPage";
import { DocsIndexPage } from "./docs/DocsIndexPage";
import "./index.css";
import { IndexPage } from "./IndexPage";
import { NaturalNeighborTestPage } from "./NaturalNeighborTestPage";
import { SingleStudyPage } from "./study/SingleStudyPage";
import { StudyPage } from "./study/StudyPage";

// We load this one lazily so it gets split into a separate bundle;
// it's got Monaco, Babel, Prettier, etc.
const DocsPage = React.lazy(() =>
  import("./docs/DocsPage").then((m) => ({ default: m.DocsPage })),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense>
        <Routes>
          {autoRoute("/", IndexPage)}
          {autoRoute("/study", StudyPage)}
          {autoRoute("/study/:id", SingleStudyPage)}
          {autoRoute("/docs", DocsIndexPage)}
          {autoRoute("/docs/:slug", DocsPage)}
          {autoRoute("/demos", DemoPage)}
          {autoRoute("/demos/:id", SingleDemoPage)}
          {autoRoute("/natural-neighbor", NaturalNeighborTestPage)}
        </Routes>
      </Suspense>
    </HashRouter>
  </React.StrictMode>,
);
