// components/profile/CollectionStackedCover.tsx
import { FolderOpen, Award } from "lucide-react";

const TMDB_BASE = "https://image.tmdb.org/t/p/w185";

const STACK_TRANSFORMS = [
  "-rotate-[8deg] -translate-x-[44px] translate-y-[2px] z-[1]",
  "-rotate-[3deg] -translate-x-[14px] -translate-y-[4px] z-[2]",
  "rotate-[3deg] translate-x-[18px] -translate-y-[2px] z-[3]",
  "rotate-[9deg] translate-x-[50px] translate-y-[2px] z-[4]",
];

interface Props {
  items: { poster_path?: string | null | undefined; title?: string }[];
  isAchievement?: boolean;
}

export function CollectionStackedCover({ items, isAchievement }: Props) {
  const posters = items.filter((i) => i.poster_path).slice(0, 4);

  if (!posters.length) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {isAchievement ? (
          <Award className="w-10 h-10 text-amber-400/30" />
        ) : (
          <FolderOpen className="w-10 h-10 text-muted-foreground/20" />
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {posters.map((item, i) => (
        <div
          key={i}
          className={`absolute w-[62px] rounded-[4px] overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.6)] ${STACK_TRANSFORMS[i]}`}
        >
          <img
            src={`${TMDB_BASE}${item.poster_path}`}
            alt={item.title}
            className="w-full aspect-[2/3] object-cover block"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.background =
                "rgba(255,255,255,0.06)";
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      ))}
    </div>
  );
}
