import type { LandingStoryCard } from "./landing-story-catalog";

interface StoryPosterCardProps {
  story: LandingStoryCard;
  onEnter: () => void;
}

export function StoryPosterCard({ story, onEnter }: StoryPosterCardProps) {
  return (
    <button
      aria-label={`进入剧情${story.title}`}
      className="group block h-full min-h-0 min-w-0 overflow-hidden text-left focus-visible:outline-none"
      type="button"
      onClick={onEnter}
    >
      <article className="h-full min-h-0 overflow-hidden">
        <div className="relative h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-lg shadow-black/25 ring-0 transition duration-300 group-hover:-translate-y-1 group-hover:border-white/25 group-focus-visible:ring-2 group-focus-visible:ring-rose-300 sm:rounded-2xl">
          {story.posterUrl ? (
            <img
              alt={`${story.title}剧情封面`}
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
              src={story.posterUrl}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/85" />
          <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[8px] font-semibold tracking-[0.1em] text-white/85 backdrop-blur-xl sm:left-3 sm:top-3 sm:px-2.5 sm:text-[9px]">
            {story.tag}
          </span>
          <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full border border-white/20 bg-black/40 shadow-lg shadow-black/30 backdrop-blur-xl transition group-hover:scale-110 group-hover:bg-white group-hover:text-black sm:bottom-3 sm:right-3 sm:size-10">
            <span
              aria-hidden="true"
              className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-current sm:border-y-[6px] sm:border-l-[9px]"
            />
          </span>
        </div>
      </article>
    </button>
  );
}
