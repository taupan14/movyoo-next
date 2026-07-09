// lib/moderation.ts — FILE BARU
//
// Filter kata kunci sederhana untuk menjaga rating konten sebelum artikel
// kontributor langsung dipublish (tanpa review admin).
//
// PENTING: ini bukan solusi sempurna (belum menangani typo, leetspeak,
// variasi bahasa daerah, dll). Anggap sebagai lapisan pertama saja.
// Tambahkan/kurangi kata di bawah sesuai kebutuhan kamu.

const BLOCKED_WORDS: Record<string, string[]> = {
  kata_kasar: [
    "anjing",
    "bangsat",
    "bajingan",
    "kontol",
    "memek",
    "goblok",
    "tolol",
    "asu",
    "babi",
    "kampret",
    "brengsek",
    "keparat",
    "bego",
  ],
  konten_dewasa: [
    "porno",
    "bokep",
    "seks bebas",
    "telanjang bulat",
    "konten dewasa",
    "cabul",
    "esek-esek",
  ],
  narkoba_alkohol: [
    "narkoba",
    "sabu",
    "sabu-sabu",
    "ganja",
    "ekstasi",
    "heroin",
    "kokain",
    "minuman keras",
    "miras",
    "mabuk-mabukan",
  ],
  judi: [
    "judi online",
    "situs judi",
    "slot gacor",
    "slot online",
    "taruhan bola",
    "casino online",
    "kasino online",
    "togel",
    "bandar judi",
    "judi bola",
  ],
};

export interface ModerationFlag {
  category: keyof typeof BLOCKED_WORDS | string;
  word: string;
}

export interface ModerationResult {
  passed: boolean;
  flagged: ModerationFlag[];
}

/**
 * Cek beberapa field teks sekaligus (title, excerpt, body, dll).
 * Case-insensitive, substring match sederhana.
 */
export function moderateText(
  ...texts: (string | null | undefined)[]
): ModerationResult {
  const combined = texts.filter(Boolean).join(" \n ").toLowerCase();
  const flagged: ModerationFlag[] = [];

  for (const [category, words] of Object.entries(BLOCKED_WORDS)) {
    for (const word of words) {
      if (combined.includes(word.toLowerCase())) {
        flagged.push({ category, word });
      }
    }
  }

  return { passed: flagged.length === 0, flagged };
}

/** Pesan ramah untuk ditampilkan ke kontributor saat artikel ditolak filter */
export function moderationMessage(result: ModerationResult): string {
  if (result.passed) return "";
  const categories = Array.from(
    new Set(result.flagged.map((f) => f.category)),
  );
  const labelMap: Record<string, string> = {
    kata_kasar: "kata-kata kasar",
    konten_dewasa: "konten dewasa",
    narkoba_alkohol: "narkoba/minuman keras",
    judi: "perjudian",
  };
  const labels = categories.map((c) => labelMap[c] ?? c).join(", ");
  return `Artikel terdeteksi mengandung unsur: ${labels}. Silakan revisi dulu sebelum dipublish. Kamu tetap bisa menyimpannya sebagai draft.`;
}
