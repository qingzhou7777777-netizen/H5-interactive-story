import type { LandingStoryCatalog } from "./landing-story-catalog";

interface StoryHeroCardProps {
  catalog: LandingStoryCatalog;
  onEnter: () => void;
}

function PlayIcon({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`${compact ? "size-8 border-black/10 bg-zinc-950 text-white shadow-none" : "size-12 border-white/25 bg-white/15 text-white shadow-lg shadow-black/30"} grid shrink-0 place-items-center rounded-full border backdrop-blur-xl`}
    >
      <span
        className={`${compact ? "ml-0.5 border-y-[5px] border-l-[8px]" : "ml-1 border-y-[7px] border-l-[11px]"} h-0 w-0 border-y-transparent border-l-current`}
      />
    </span>
  );
}

export function StoryHeroCard({ catalog, onEnter }: StoryHeroCardProps) {
  return (
    <article className="group relative isolate h-full min-h-0 overflow-hidden rounded-[1.4rem] border border-white/45 bg-white/15 shadow-2xl shadow-indigo-950/20">
      {catalog.heroPosterUrl ? (
        <img
          alt={`${catalog.storyTitle}封面`}
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.015]"
          src={catalog.heroPosterUrl}
        />
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col justify-between p-[clamp(1.75rem,2vw,3rem)]">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-white/85 backdrop-blur-xl">
            <span className="size-1.5 rounded-full bg-rose-400 shadow-[0_0_10px_#fb7185]" />
            本周主推
          </span>
          <button
            aria-label={`播放并进入${catalog.storyTitle}`}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            type="button"
            onClick={onEnter}
          >
            <PlayIcon />
          </button>
        </div>

        <div>
          <h2 className="max-w-[48rem] text-[clamp(2rem,10vw,3rem)] font-black leading-[0.98] tracking-[-0.055em] text-white drop-shadow-[0_3px_14px_rgba(35,23,65,0.85)] md:text-[clamp(2.75rem,3vw,4.5rem)]">
            开启专属的恋爱互动
          </h2>
          <div className="mt-5 flex items-center gap-3">
            <button
              aria-label="开始体验开启专属的恋爱互动"
              className="inline-flex w-full max-w-64 items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-sm font-black text-zinc-950 shadow-xl shadow-indigo-950/25 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.98]"
              type="button"
              onClick={onEnter}
            >
              <PlayIcon compact />
              开始体验
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
