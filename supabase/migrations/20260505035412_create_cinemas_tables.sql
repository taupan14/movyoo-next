/*
  # Create cinemas and cinema_movies tables

  1. New Tables
    - `cinemas`
      - `id` (uuid, primary key)
      - `name` (text, cinema name e.g. "XXI Grand Indonesia")
      - `chain` (text, chain brand: "XXI", "CGV", "Cinepolis")
      - `city` (text, city name)
      - `address` (text, full address)
      - `lat` (numeric, latitude)
      - `lng` (numeric, longitude)
      - `google_maps_url` (text, link to Google Maps)
      - `booking_url` (text, link to booking site)
      - `source` (text, data source: "21cineplex" or "cgv")
      - `external_id` (text, ID from source website)
      - `created_at` (timestamp)
    - `cinema_movies`
      - `id` (uuid, primary key)
      - `cinema_id` (uuid, FK to cinemas)
      - `title` (text, movie title)
      - `genre` (text, genre string)
      - `duration` (text, e.g. "106min")
      - `age_rating` (text, e.g. "D17+")
      - `format` (text, e.g. "2D", "IMAX 2D")
      - `source` (text, "21cineplex" or "cgv")
      - `show_date` (date, date of showing)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Public read access for all users (cinema data is public)
    - Only service role can insert/update/delete
*/

CREATE TABLE IF NOT EXISTS cinemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  chain text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text DEFAULT '',
  lat numeric NOT NULL DEFAULT 0,
  lng numeric NOT NULL DEFAULT 0,
  google_maps_url text DEFAULT '',
  booking_url text DEFAULT '',
  source text DEFAULT '',
  external_id text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cinemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cinemas"
  ON cinemas FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS cinema_movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cinema_id uuid REFERENCES cinemas(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  genre text DEFAULT '',
  duration text DEFAULT '',
  age_rating text DEFAULT '',
  format text DEFAULT '2D',
  source text DEFAULT '',
  show_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cinema_movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cinema movies"
  ON cinema_movies FOR SELECT
  TO anon, authenticated
  USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cinemas_city ON cinemas(city);
CREATE INDEX IF NOT EXISTS idx_cinemas_chain ON cinemas(chain);
CREATE INDEX IF NOT EXISTS idx_cinema_movies_cinema_id ON cinema_movies(cinema_id);
CREATE INDEX IF NOT EXISTS idx_cinema_movies_show_date ON cinema_movies(show_date);
