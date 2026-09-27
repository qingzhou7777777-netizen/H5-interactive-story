import { Navigate, Route, Routes } from "react-router-dom";

import { StoryPage } from "../pages/StoryPage/StoryPage";
import { useAnalyticsLifecycle } from "../analytics/use-analytics-lifecycle";
import { LandingPage } from "../pages/LandingPage/LandingPage";
import { StoryMapPage } from "../pages/StoryMapPage/StoryMapPage";

export function App() {
  useAnalyticsLifecycle();
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/story" element={<StoryPage />} />
      <Route path="/story-map/:chapterCode" element={<StoryMapPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
