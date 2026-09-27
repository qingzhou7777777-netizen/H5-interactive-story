export function LandingCatalogSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在加载互动剧情" className="h-full animate-pulse">
      <div className="grid h-full grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="h-[calc(100dvh-8rem)] min-h-[36rem] rounded-[1.4rem] border border-white/25 bg-white/20 md:h-auto md:min-h-0" />
        <div className="grid h-[min(75dvh,44rem)] min-h-[32rem] grid-cols-2 grid-rows-2 gap-3 md:h-auto md:min-h-0 sm:gap-5">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="min-h-0 rounded-xl bg-white/[0.055] sm:rounded-2xl"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
