import { Trophy } from "lucide-react";
import { FESTIVAL_META } from "@/types/constants";
import {
  festivalStatusColor,
  festivalStatusLabel,
  formatDateRange,
} from "@/utils/festival-utils";
import type { FestivalHomeCard } from "@/types/home";

interface FestivalBannerCardProps {
  card: FestivalHomeCard;
  locale: string;
  onClick: () => void;
  isActive: boolean;
}

export function FestivalBannerCard({
  card,
  locale,
  onClick,
  isActive,
}: FestivalBannerCardProps) {
  const { festival, latestEdition } = card;
  const meta = FESTIVAL_META[festival.slug] ?? FESTIVAL_META["cannes"];

  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-[200px] lg:w-[240px] rounded-2xl overflow-hidden transition-all duration-300 hover-lift group text-left border-b-2 mt-2
  ${
    isActive
      ? "border-primary shadow-lg shadow-primary/20"
      : "border-transparent ring-1 ring-white/10"
  }`}
    >
      {/* Background: banner image atau gradient fallback */}
      <div className="absolute inset-0">
        {festival.banner_path ? (
          <img
            src={festival.banner_path}
            alt={festival.short_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${meta.gradient}`} />
        )}
        <div className={`absolute inset-0 bg-gradient-to-b ${meta.gradient}`} />
      </div>

      {/* Konten */}
      <div className="relative p-4 flex flex-col justify-between h-[130px]">
        {/* Baris atas: flag + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xl">{meta.flag}</span>
            <span className={`text-[10px] font-medium`}>
              {festival.location.split(",")[1]?.trim() ?? festival.location}
              {/* {festival.location} */}
            </span>
          </div>
          {latestEdition && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${festivalStatusColor(latestEdition.status)} mt-1`}
            >
              {festivalStatusLabel(latestEdition.status, locale)}
            </span>
          )}
        </div>

        {/* Nama festival */}
        <div>
          <p className="text-xs text-white/60 mb-0.5">
            {latestEdition
              ? `${latestEdition.edition_number ? `Ke-${latestEdition.edition_number} · ` : ""}${latestEdition.year}`
              : ""}
          </p>
          <h3 className="text-sm font-bold text-primary/90 leading-tight line-clamp-2">
            {festival.short_name}
          </h3>
          {/* Award utama */}
          <div className={`flex items-center gap-1 mt-1`}>
            <Trophy className="w-3 h-3 flex-shrink-0" />
            <span className="text-[10px] font-medium">{meta.award}</span>
          </div>
        </div>
      </div>

      {/* Tanggal di bagian bawah */}
      {latestEdition?.date_start && (
        <div className="relative px-4 pb-3">
          <p className="text-[10px] text-white/50">
            {formatDateRange(
              latestEdition.date_start,
              latestEdition.date_end,
              locale,
            )}
          </p>
        </div>
      )}
    </button>
  );
}
