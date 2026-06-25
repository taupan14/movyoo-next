// components/profile/CollectionItemsModal.tsx
"use client";

import { useEffect, useRef } from "react";
import { X, Trash2, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const TMDB_BASE = "https://image.tmdb.org/t/p/w185";

export interface CollectionItem {
  item_id: number;
  media_type: "movie" | "tv";
  movie_id: number | null;
  series_id: number | null;
  title: string;
  poster_path: string | null;
  release_year: number | null;
  genres: string[];
  added_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  collectionId: number;
  collectionName: string;
  items: CollectionItem[];
  onItemDeleted: (itemId: number) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CollectionItemsModal({
  open,
  onClose,
  collectionId,
  collectionName,
  items,
  onItemDeleted,
  showToast,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Tutup dengan Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock scroll saat modal terbuka
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleDelete(item: CollectionItem) {
    try {
      const res = await fetch(
        `/api/collections/${collectionId}/items?item_id=${item.item_id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error ?? "Gagal menghapus item", "error");
        return;
      }
      onItemDeleted(item.item_id);
      showToast(`"${item.title}" dihapus dari koleksi`, "success");
    } catch {
      showToast("Terjadi kesalahan, coba lagi", "error");
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center",
        "transition-all duration-200",
        open
          ? "bg-black/70 backdrop-blur-sm pointer-events-auto"
          : "bg-transparent backdrop-blur-none pointer-events-none",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={cn(
          "w-full max-w-lg bg-[#13131a] border border-white/[0.08] rounded-t-2xl",
          "flex flex-col max-h-[75dvh]",
          "transition-transform duration-300 ease-out-expo",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {collectionName}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {items.length} item
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-3 py-2.5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground/30">
              <FolderOpen className="w-8 h-8" />
              <p className="text-xs">Koleksi ini masih kosong</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {items.map((item) => (
                <li
                  key={item.item_id}
                  className="flex items-center gap-3 py-2.5"
                >
                  {/* Poster */}
                  <div className="w-9 h-[54px] rounded-[4px] overflow-hidden shrink-0 bg-white/[0.06]">
                    {item.poster_path && (
                      <img
                        src={`${TMDB_BASE}${item.poster_path}`}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground/85 truncate">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {item.release_year ?? "—"} · Ditambahkan{" "}
                      {formatDate(item.added_at)}
                    </p>
                    {item.genres.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {item.genres.map((g) => (
                          <span
                            key={g}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-muted-foreground/50"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(item)}
                    className="w-7 h-7 rounded-lg shrink-0 border border-white/[0.06] flex items-center justify-center text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/25 transition-all duration-150"
                    title="Hapus dari koleksi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
