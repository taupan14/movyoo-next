// ─── Core Media Types ─────────────────────────────────────────────────────────

export interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  genre_ids?: number[];
  popularity?: number;
  overview?: string;
  overview_id?: string;
  overview_alt?: string;
  tmdb_id?: number;
}

export interface TvSeries {
  id: number;
  tmdb_id: number;
  name: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date?: string;
  popularity?: number;
  overview?: string;
  overview_en?: string;
  number_of_seasons?: number;
}

export interface PopularCastMember {
  person_id: number;
  name: string;
  profile_path: string | null;
  total_appearances: number;
  avg_popularity: number;
  known_for: string;
  titles: string[];
}

// ─── Home Data ────────────────────────────────────────────────────────────────

export interface HomeData {
  trending: Movie[];
  nowPlaying: Movie[];
  upcoming: Movie[];
  popular: Movie[];
  indonesianMovies: Movie[];
  indonesianPopularMovies: Movie[];
  // netflixTrending: Movie[];
  // disneyTrending: Movie[];
  onAirSeries: TvSeries[];
  popularSeries: TvSeries[];
  trendingSeries: TvSeries[];
  popularCast: PopularCastMember[];
}

// ─── Festival Types ───────────────────────────────────────────────────────────

export interface FestivalEdition {
  id: number;
  festival_id: number;
  edition_number: number | null;
  year: number;
  date_start: string | null;
  date_end: string | null;
  status: "upcoming" | "ongoing" | "completed";
  theme: string | null;
  total_films: number | null;
}

export interface FestivalItem {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  short_name: string;
  location: string;
  country_code: string;
  website_url: string | null;
  logo_path: string | null;
  banner_path: string | null;
  accent_color: string;
  founded_year: number | null;
  description: string | null;
  description_en: string | null;
}

export interface FestivalHomeCard {
  festival: FestivalItem;
  latestEdition: FestivalEdition | null;
}

export interface FestivalLineupItem {
  id: number;
  movie_id: number | null;
  external_title: string | null;
  director: string | null;
  country: string | null;
  is_oscar_contender: boolean;
  is_world_premiere: boolean;
  is_winner: boolean;
  poster_path: string | null;
  synopsis: string | null;
  section: { id: number; name: string; name_en: string; slug: string } | null;
  movie?: {
    id: number;
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    release_date: string | null;
  } | null;
}

export interface FestivalWinner {
  id: number;
  person_name: string | null;
  is_winner: boolean;
  special_mention: string | null;
  lineup?: {
    id: number;
    external_title: string | null;
    director: string | null;
    poster_path: string | null;
    movie?: {
      id: number;
      tmdb_id: number;
      title: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
    } | null;
  } | null;
}

export interface FestivalAward {
  id: number;
  slug: string;
  name: string;
  name_en: string;
  sort_order: number;
  winners: FestivalWinner[];
}

export interface FestivalBuzzItem {
  id: number;
  source: string;
  headline: string;
  headline_id: string | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  buzz_score: number | null;
  tags: string[];
}

export interface FestivalDetail {
  festival: FestivalItem;
  edition: FestivalEdition;
  sections: {
    id: number;
    name: string;
    name_en: string;
    slug: string;
    is_competition: boolean;
  }[];
  lineup: FestivalLineupItem[];
  // awards: FestivalAward[];
  buzz: FestivalBuzzItem[];
  oscarContenders: FestivalLineupItem[];
}

export interface FestivalsData {
  festivals: FestivalHomeCard[];
  oscarContenders: FestivalLineupItem[];
}
