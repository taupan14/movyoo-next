// ─── Skeleton Components ──────────────────────────────────────────────────────

export function HeroSkeleton() {
  return (
    <section className="relative h-[70vh] lg:h-[80vh] -mt-14 lg:mt-0 overflow-hidden bg-card/50 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="relative h-full flex items-end pb-12 lg:pb-16 px-4 lg:px-8">
        <div className="max-w-2xl w-full space-y-3">
          <div className="h-4 w-24 rounded-md bg-white/10" />
          <div className="h-10 w-3/4 rounded-lg bg-white/10" />
          <div className="h-4 w-full rounded-md bg-white/10" />
          <div className="h-4 w-2/3 rounded-md bg-white/10" />
          <div className="flex gap-3 mt-6">
            <div className="h-12 w-36 rounded-xl bg-white/10" />
            <div className="h-12 w-28 rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function RowSkeleton() {
  return (
    <section className="mb-8">
      <div className="h-5 w-40 rounded-md bg-white/10 mx-4 lg:mx-6 mb-3 animate-pulse" />
      <div className="flex gap-3 overflow-hidden px-4 lg:px-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-[140px] lg:w-[160px] flex-shrink-0 aspect-[2/3] rounded-xl bg-white/10 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}

export function TrendingRowSkeleton() {
  return (
    <section className="mb-8">
      <div className="h-5 w-40 rounded-md bg-white/10 mx-4 lg:mx-6 mb-3 animate-pulse" />
      <div className="flex overflow-hidden px-4 lg:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0" style={{ width: 120 }}>
            <div className="w-[80px] ml-auto aspect-[2/3] rounded-xl bg-white/10 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function CastRowSkeleton() {
  return (
    <section className="mb-8">
      <div className="h-5 w-48 rounded-md bg-white/10 mx-4 lg:mx-6 mb-3 animate-pulse" />
      <div className="flex gap-4 overflow-hidden px-4 lg:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[100px] lg:w-[120px]">
            <div className="aspect-[3/4] rounded-xl bg-white/10 animate-pulse" />
            <div className="mt-2 h-3 w-3/4 rounded bg-white/10 animate-pulse" />
            <div className="mt-1 h-3 w-1/2 rounded bg-white/10 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function QuickActionsSkeleton() {
  return (
    <section className="mb-8 px-4 lg:px-6">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-2 p-4 rounded-xl glass animate-pulse"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10" />
            <div className="h-3 w-14 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </section>
  );
}
