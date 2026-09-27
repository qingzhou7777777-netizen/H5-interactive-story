import type { ChapterDto } from "@interactive-story/api-contracts";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLandingAnalytics } from "../../analytics/use-landing-analytics";
import { isStaticDeployment } from "../../config/deployment-mode";
import { fallbackStoryContent } from "../../features/story-content/fallback-story-content";
import { fetchChapterContent } from "../../features/story-content/story-content-api";
import {
  getStoryProgressKey,
  LOCAL_STORY_PROGRESS_KEY,
} from "../../features/story-runtime/useStoryEngine";
import { LandingCatalogSkeleton } from "./LandingCatalogSkeleton";
import { StoryHeroCard } from "./StoryHeroCard";
import { StoryPosterCard } from "./StoryPosterCard";
import {
  buildLandingStoryCatalog,
  buildStaticLandingStoryCatalog,
} from "./landing-story-catalog";

const featuredChapterCode = "chapter-01";

export function LandingPage() {
  const staticDeployment = isStaticDeployment();
  const navigate = useNavigate();
  const { trackCtaClick } = useLandingAnalytics();
  const [chapter, setChapter] = useState<ChapterDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (staticDeployment) {
      setError(null);
      return;
    }

    const controller = new AbortController();
    void fetchChapterContent(featuredChapterCode, controller.signal)
      .then((content) => {
        setChapter(content);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "内容加载失败");
      });
    return () => controller.abort();
  }, [staticDeployment]);

  const catalog = useMemo(
    () =>
      staticDeployment
        ? buildStaticLandingStoryCatalog(fallbackStoryContent)
        : chapter
          ? buildLandingStoryCatalog(chapter)
          : null,
    [chapter, staticDeployment],
  );

  const enterStory = () => {
    trackCtaClick();

    try {
      window.localStorage.removeItem(LOCAL_STORY_PROGRESS_KEY);
      if (chapter) {
        window.localStorage.removeItem(
          getStoryProgressKey(`${chapter.story.code}:${chapter.code}`),
        );
      }
    } catch {
      // 隐私模式可能禁用 localStorage；不因此阻断剧情入口。
    }

    const fullscreenTarget = document.getElementById("root") ?? document.documentElement;
    if (!document.fullscreenElement && fullscreenTarget.requestFullscreen) {
      void fullscreenTarget.requestFullscreen().catch(() => {
        // 浏览器可能因权限或平台限制拒绝全屏；剧情入口仍然保持可用。
      });
    }

    navigate("/story");
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#d8a7d2] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_0%_100%,rgba(248,178,202,0.96)_0%,transparent_58%),radial-gradient(circle_at_100%_0%,rgba(117,165,227,0.92)_0%,transparent_58%),linear-gradient(135deg,#d8a7d2_0%,#adabdc_100%)]" />
      <div className="relative flex min-h-dvh w-full max-w-none flex-col px-[3vw] pb-[clamp(1.5rem,2vw,2.5rem)] pt-[clamp(1.25rem,2vw,2.5rem)] md:h-dvh md:overflow-hidden">
        <header className="mb-[clamp(1.25rem,2vw,2rem)] flex items-center justify-between">
          <div
            aria-label="心动手记"
            className="relative aspect-[1127/341] w-[clamp(10.5rem,14vw,17rem)] shrink-0 overflow-hidden"
            role="img"
          >
            <img
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute left-[-11%] top-[-127%] w-[111.3%] max-w-none select-none"
              src="/brand/heartbeat-logo.png"
            />
          </div>
          <div className="flex items-center gap-[clamp(2rem,3vw,4rem)]">
            <nav
              aria-label="内容分类"
              className="hidden items-center gap-[clamp(1.5rem,2vw,3rem)] text-[clamp(0.75rem,0.8vw,1rem)] font-semibold text-slate-700/70 md:flex"
            >
              <span className="text-slate-950">推荐</span>
              <span>互动剧情</span>
              <span>本周热门</span>
            </nav>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/25 px-[clamp(0.75rem,1vw,1.25rem)] py-[clamp(0.5rem,0.6vw,0.75rem)] text-[clamp(0.625rem,0.7vw,0.875rem)] font-medium text-slate-700 shadow-sm backdrop-blur-xl">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              正在热映
            </span>
          </div>
        </header>

        {catalog ? (
          <section
            aria-labelledby="recommended-stories-heading"
            className="flex min-h-0 flex-1 flex-col"
          >
            <h1 id="recommended-stories-heading" className="sr-only">
              选择你想进入的故事
            </h1>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-[clamp(1rem,1.4vw,2rem)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="h-[calc(100dvh-8rem)] min-h-[36rem] md:h-auto md:min-h-0">
                <StoryHeroCard catalog={catalog} onEnter={enterStory} />
              </div>

              <div className="grid h-[min(75dvh,44rem)] min-h-[32rem] grid-cols-2 grid-rows-2 gap-[clamp(1rem,1.4vw,2rem)] overflow-hidden md:h-full md:min-h-0">
                {catalog.cards.map((story) => (
                  <StoryPosterCard key={story.id} story={story} onEnter={enterStory} />
                ))}
              </div>
            </div>
          </section>
        ) : error ? (
          <section
            role="alert"
            className="grid min-h-[31rem] place-items-center rounded-[2rem] border border-white/45 bg-white/25 px-8 text-center shadow-xl shadow-indigo-950/10 backdrop-blur-xl"
          >
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-rose-400/10 text-rose-300">
                !
              </span>
              <h1 className="mt-5 text-xl font-bold">剧情暂时无法加载</h1>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <button
                className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950"
                type="button"
                onClick={() => window.location.reload()}
              >
                重新加载
              </button>
            </div>
          </section>
        ) : (
          <LandingCatalogSkeleton />
        )}

      </div>
    </main>
  );
}
