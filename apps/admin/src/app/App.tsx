import { Navigate, Route, Routes } from "react-router-dom";

import { AdminShell } from "../components/AdminShell";
import { ChapterDetailPage } from "../features/chapters/ChapterDetailPage";
import { ChapterListPage } from "../features/chapters/ChapterListPage";
import { VideoAssetPage } from "../features/video-assets/VideoAssetPage";
import { AnalyticsDashboardPage } from "../features/analytics/AnalyticsDashboardPage";

export function App() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<Navigate replace to="/analytics" />} />
        <Route path="analytics" element={<AnalyticsDashboardPage />} />
        <Route path="video-assets" element={<VideoAssetPage />} />
        <Route path="chapters" element={<ChapterListPage />} />
        <Route path="chapters/:chapterCode" element={<ChapterDetailPage />} />
        <Route path="*" element={<Navigate replace to="/analytics" />} />
      </Route>
    </Routes>
  );
}
