import Link from "next/link";
import { getProfileUrl } from "@/lib/tmdb";
import { SectionHeaderHome } from "@/components/section-header";
import type { PopularCastMember } from "@/types/home";

interface PopularCastSectionProps {
  cast: PopularCastMember[];
  locale: string;
}

export function PopularCastSection({ cast, locale }: PopularCastSectionProps) {
  if (!cast.length) return null;

  const sectionTitle =
    locale === "id" ? "Pemeran Terpopuler Saat Ini" : "Most Popular Cast";

  return (
    <section className="animate-slide-up mb-8">
      <SectionHeaderHome title={sectionTitle} />
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 mx-1 px-4 lg:px-6">
        {cast.map((person) => (
          <Link
            key={person.person_id}
            href={`/person/${person.person_id}`}
            className="flex-shrink-0 w-[100px] lg:w-[120px] group"
          >
            <div className="relative rounded-xl overflow-hidden hover-lift card-shine">
              <div className="aspect-[3/4]">
                <img
                  src={getProfileUrl(person.profile_path)}
                  alt={person.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-white/70 line-clamp-1">
                  {person.known_for}
                </p>
              </div>
            </div>
            <p className="mt-1.5 text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {person.name}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {person.known_for}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
