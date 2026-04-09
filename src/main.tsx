import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes } from "react-router-dom";
import { autoRoute } from "./autoRoute";
import { DemoPage } from "./demo/DemoPage";
import { SingleDemoPage } from "./demo/SingleDemoPage";
import "./index.css";
import { FiguresPage } from "./figures/FiguresPage";
import { NaturalNeighborTestPage } from "./NaturalNeighborTestPage";
import { StudioPage } from "./studio/StudioPage";
import { SingleStudyPage } from "./study/SingleStudyPage";
import { StudyPage } from "./study/StudyPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        {autoRoute("/", FiguresPage)}
        {autoRoute("/study", StudyPage)}
        {autoRoute("/study/:id", SingleStudyPage)}
        {autoRoute("/demos", DemoPage)}
        {autoRoute("/demos/:id", SingleDemoPage)}
        {autoRoute("/natural-neighbor", NaturalNeighborTestPage)}
        {autoRoute("/studio", StudioPage)}
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
