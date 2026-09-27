import type { StoryChoice } from "@interactive-story/story-core";
import { useEffect, useState } from "react";

interface VideoChoiceOverlayProps {
  choices: readonly StoryChoice[];
  pendingChoiceId: string | null;
  onChoice: (choice: StoryChoice) => void;
}

export function VideoChoiceOverlay({
  choices,
  pendingChoiceId,
  onChoice,
}: VideoChoiceOverlayProps) {
  const [renderedChoices, setRenderedChoices] = useState(choices);

  useEffect(() => {
    if (choices.length > 0) {
      setRenderedChoices(choices);
    }
  }, [choices]);

  if (renderedChoices.length === 0) {
    return null;
  }

  const isVisible = choices.length > 0;

  const columns =
    renderedChoices.length === 2
      ? "grid-cols-2"
      : renderedChoices.length === 3
        ? "grid-cols-3"
        : "grid-cols-2 lg:grid-cols-4";

  return (
    <div
      aria-hidden={!isVisible}
      className={`${isVisible ? "visible opacity-100" : "pointer-events-none invisible opacity-0"} absolute inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-slate-950/35 via-transparent to-transparent px-[clamp(0.75rem,4vw,4rem)] pb-[clamp(3.5rem,9vw,8rem)] transition-opacity duration-150`}
    >
      <div
        aria-label="剧情选择"
        className={`${columns} grid w-full max-w-5xl gap-2 sm:gap-3 lg:gap-5`}
        role="group"
      >
        {renderedChoices.map((choice) => (
          <button
            key={choice.id}
            aria-label={choice.label}
            className="group min-h-10 rounded-full border border-white/50 bg-gradient-to-r from-rose-400/80 via-fuchsia-500/75 to-violet-500/80 px-2 py-2 text-center text-[clamp(0.68rem,2vw,1rem)] font-bold leading-tight text-white shadow-[0_14px_45px_rgba(88,28,135,0.35)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-white/80 hover:from-rose-300/90 hover:via-fuchsia-400/90 hover:to-violet-400/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:translate-y-0 disabled:cursor-wait disabled:opacity-60 sm:min-h-14 sm:px-6 sm:py-3"
            disabled={!isVisible || pendingChoiceId !== null}
            tabIndex={isVisible ? 0 : -1}
            type="button"
            onClick={() => {
              if (isVisible) {
                onChoice(choice);
              }
            }}
          >
            <span>{choice.label}</span>
            {pendingChoiceId === choice.id ? (
              <span aria-hidden="true" className="ml-2 inline-block animate-pulse">
                …
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
