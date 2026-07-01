"use client";

// app/profile/page.tsx

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookmarkPlus,
  Heart,
  FolderOpen,
  Star,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  LogOut,
  Globe,
  Lock,
  Loader2,
  Camera,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Search,
  Trophy,
  Zap,
  Ticket,
  ChevronRight,
  Shield,
  Pencil,
  ListPlus,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useProgression } from "@/hooks/use-progression";
import type { WatchlistItem, LikedItem, Collection } from "@/types/auth";
import type { AchievementWithProgress } from "@/types/progression";
import { motion } from "framer-motion";
// page.tsx
import { CollectionStackedCover } from "@/components/profile/stacked-cover";
import { CollectionItemsModal } from "@/components/profile/collection-items-modal";
import type { CollectionItem } from "@/components/profile/collection-items-modal";

import NativeBannerAd from "@/components/ads/NativeBannerAd";

// Inline helper — lib/tmdb.ts akan dihapus kedepannya
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";
function getPosterUrl(path: string | null, size = "w500"): string {
  if (!path) return "https://placehold.co/500x750/1a1a2e/eee?text=No+Poster";
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

type ProfileTab = "watchlist" | "liked" | "collections";

// ─── Rank config ──────────────────────────────────────────────────────────────
const RANK_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Audience: {
    bg: "bg-slate-500/20",
    text: "text-slate-300",
    border: "border-slate-500/30",
  },
  "Movie Explorer": {
    bg: "bg-emerald-500/20",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
  },
  Cinephile: {
    bg: "bg-blue-500/20",
    text: "text-blue-300",
    border: "border-blue-500/30",
  },
  "Film Buff": {
    bg: "bg-violet-500/20",
    text: "text-violet-300",
    border: "border-violet-500/30",
  },
  Critic: {
    bg: "bg-amber-500/20",
    text: "text-amber-300",
    border: "border-amber-500/30",
  },
  Curator: {
    bg: "bg-orange-500/20",
    text: "text-orange-300",
    border: "border-orange-500/30",
  },
  Archivist: {
    bg: "bg-rose-500/20",
    text: "text-rose-300",
    border: "border-rose-500/30",
  },
  "Festival Judge": {
    bg: "bg-pink-500/20",
    text: "text-pink-300",
    border: "border-pink-500/30",
  },
  "Cinema Legend": {
    bg: "bg-yellow-500/20",
    text: "text-yellow-300",
    border: "border-yellow-500/30",
  },
  Icon: {
    bg: "bg-primary/20",
    text: "text-primary",
    border: "border-primary/30",
  },
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div
      className={cn(
        "fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100]",
        "flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium",
        "animate-in slide-in-from-bottom-4 fade-in duration-200",
        type === "success"
          ? "bg-green-500/20 border border-green-500/30 text-green-400"
          : "bg-destructive/20 border border-destructive/30 text-destructive",
      )}
    >
      {type === "success" ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0" />
      )}
      {msg}
    </div>
  );
}

// ─── Avatar upload ────────────────────────────────────────────────────────────
function AvatarUpload({
  avatarUrl,
  initial,
  onUpload,
}: {
  avatarUrl: string | null | undefined;
  initial: string;
  onUpload: (file: File) => Promise<{ error: string | null }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    setUploadError(null);
    const { error } = await onUpload(file);
    setUploading(false);
    if (error) {
      setUploadError(error);
      setPreview(null);
    }
    e.target.value = "";
  };

  const displayed = preview ?? avatarUrl;

  return (
    <div className="relative shrink-0 group/avatar">
      {displayed ? (
        <img
          src={displayed}
          alt={initial}
          className="w-24 h-24 rounded-2xl object-cover ring-2 ring-primary/10"
        />
      ) : (
        <div className="w-24 h-24 rounded-2xl gradient-primary flex items-center justify-center text-3xl font-bold text-white">
          {initial}
        </div>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-1",
          "bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity",
        )}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : (
          <Camera className="w-6 h-6 text-white" />
        )}
        {!uploading && (
          <span className="text-[10px] text-white font-medium">Ganti</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      {uploadError && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-md">
          {uploadError}
        </div>
      )}
    </div>
  );
}

// ─── FilmStrip XP Bar ─────────────────────────────────────────────────────────
// Signature element: progress bar berbentuk frame film
function FilmStripBar({
  percent,
  xpProgress,
  xpNeeded,
}: {
  percent: number;
  xpProgress: number;
  xpNeeded: number;
}) {
  const SEGMENTS = 20;
  const filled = Math.round((percent / 100) * SEGMENTS);

  return (
    <div className="space-y-3">
      {/* Strip */}
      <div className="relative h-7 rounded-sm overflow-hidden bg-white/5 border border-white/10">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 gradient-primary transition-all duration-500 ease-out rounded-sm"
          style={{ width: `${percent}%` }}
        />

        {/* Segment dividers */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: SEGMENTS - 1 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-black/10" />
          ))}
          <div className="flex-1" />
        </div>

        {/* Label kiri — XP */}
        <div className="absolute inset-y-0 left-3 flex items-center">
          <span className="text-[11px] font-medium text-white/90 tabular-nums">
            {xpProgress.toLocaleString()} XP
          </span>
        </div>

        {/* Label kanan — persentase */}
        <div className="absolute inset-y-0 right-3 flex items-center">
          <span className="text-[11px] font-medium text-white/50 tabular-nums">
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      {/* Label bawah */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{xpProgress.toLocaleString()} XP dikumpulkan</span>
        <span className="text-primary font-medium">
          {xpNeeded > 0
            ? `${xpNeeded.toLocaleString()} XP lagi`
            : "Level maksimal"}
        </span>
      </div>
    </div>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border",
        "bg-white/[0.03] flex-1",
        color,
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="text-sm font-bold leading-none">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ─── Achievement Badge ────────────────────────────────────────────────────────
function AchievementBadge({ ach }: { ach: AchievementWithProgress }) {
  const isUnlocked = ach.is_unlocked;
  // const isUnlocked = true;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border min-w-[72px] bg-white/[0.03]",
        isUnlocked ? "border-primary/10" : "border-white/8",
      )}
    >
      <div
        className={cn(
          "text-xl leading-none",
          !isUnlocked && "grayscale opacity-30",
        )}
      >
        {ach.is_secret && !isUnlocked ? "🔒" : (ach.icon ?? "🏆")}
      </div>
      <div
        className={cn(
          "text-[9px] text-center leading-tight font-medium max-w-[64px] truncate",
          isUnlocked ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {ach.display_name}
      </div>
      {!isUnlocked && (
        <div className="w-full h-0.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-primary/40 rounded-full"
            style={{
              width: `${Math.min(100, (ach.progress / (ach.target || 1)) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Add to Collection Modal ──────────────────────────────────────────────────
function AddToCollectionModal({
  mediaType,
  movieId,
  seriesId,
  collections,
  onClose,
  onAdded,
}: {
  mediaType: "movie" | "tv";
  movieId?: number;
  seriesId?: number;
  collections: Collection[];
  onClose: () => void;
  onAdded: (colName: string) => void;
}) {
  const [adding, setAdding] = useState<number | null>(null);

  const addToCollection = async (colId: number, colName: string) => {
    setAdding(colId);
    await fetch(`/api/collections/${colId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: mediaType,
        movie_id: movieId,
        series_id: seriesId,
      }),
    });
    setAdding(null);
    onAdded(colName);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#141420] border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <h3 className="font-semibold text-sm">Tambahkan ke Koleksi</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {collections.filter((c) => !(c as any).is_achievement).length ===
          0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              Belum ada koleksi. Buat dulu di tab Collections.
            </p>
          ) : (
            collections
              .filter((c) => !(c as any).is_achievement)
              .map((col) => (
                <button
                  key={col.id}
                  onClick={() => addToCollection(col.id, col.name)}
                  disabled={adding === col.id}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <span>{col.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {col.item_count} item
                    </span>
                  </div>
                  {adding === col.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MediaCard ────────────────────────────────────────────────────────────────
function MediaCard({
  href,
  posterPath,
  title,
  voteAverage,
  onDelete,
  onAddToCollection,
}: {
  href: string;
  posterPath: string | null;
  title: string;
  voteAverage: number;
  onDelete: () => void;
  onAddToCollection?: () => void;
}) {
  return (
    <div className="group relative">
      <div className="relative rounded-xl overflow-hidden aspect-[2/3]">
        <img
          src={getPosterUrl(posterPath)}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {voteAverage > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-xs z-10">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-white font-medium">
              {voteAverage.toFixed(1)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1.5 p-2">
          <Link
            href={href}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-white/20 hover:bg-white/30 text-white transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" /> Detail
          </Link>
          {onAddToCollection && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onAddToCollection();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/40 hover:bg-emerald-500/60 text-white transition-colors"
            >
              <ListPlus className="w-3 h-3" /> Ke Koleksi
            </button>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-destructive/50 hover:bg-destructive/70 text-white transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Hapus
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-xs font-medium truncate text-muted-foreground group-hover:text-foreground transition-colors">
        {title}
      </p>
    </div>
  );
}

// ─── Edit Collection Modal ────────────────────────────────────────────────────
function EditCollectionModal({
  col,
  onClose,
  onSaved,
}: {
  col: Collection;
  onClose: () => void;
  onSaved: (updated: Collection) => void;
}) {
  const [name, setName] = useState(col.name);
  const [desc, setDesc] = useState(col.description ?? "");
  const [isPublic, setIsPublic] = useState(col.is_public);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/collections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: col.id,
        name: name.trim(),
        description: desc,
        is_public: isPublic,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok)
      onSaved({
        ...col,
        name: name.trim(),
        description: desc,
        is_public: isPublic,
      });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#141420] border border-white/10 p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Edit Koleksi</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama koleksi *"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Deskripsi (opsional)"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="w-4 h-4"
          />
          Publik
        </label>
        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg gradient-primary text-white text-sm disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Simpan
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 text-sm text-muted-foreground hover:text-foreground"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function GridSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 gap-4 md:grid-cols-${cols}`}
    >
      {Array.from({ length: cols * 2 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] rounded-xl bg-white/5" />
          <div className="h-3 rounded mt-2 bg-white/5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text, linkTo }: { text: string; linkTo: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <BookmarkPlus className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
      {linkTo && (
        <Link
          href={linkTo}
          className="mt-4 px-5 py-2 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Jelajahi Film
        </Link>
      )}
    </div>
  );
}

// ─── Main ProfilePage ─────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, signOut, updateProfile, uploadAvatar, openAuthModal } =
    useAuth();
  const {
    progression,
    isLoading: progLoading,
    fetchProgression,
  } = useProgression();

  const [activeTab, setActiveTab] = useState<ProfileTab>("watchlist");
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [likedItems, setLikedItems] = useState<LikedItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>(
    [],
  );
  const [fetching, setFetching] = useState(false);

  // Edit profile
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal logout
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [modalCol, setModalCol] = useState<Collection | null>(null);
  const [colItems, setColItems] = useState<Record<number, CollectionItem[]>>(
    {},
  );

  // Toast
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Logout
  const [loggingOut, setLoggingOut] = useState(false);

  // New collection
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [newColPublic, setNewColPublic] = useState(false);
  const [creatingCol, setCreatingCol] = useState(false);

  // Add to collection modal
  const [addToColTarget, setAddToColTarget] = useState<{
    mediaType: "movie" | "tv";
    movieId?: number;
    seriesId?: number;
  } | null>(null);

  // Edit collection modal
  const [editColTarget, setEditColTarget] = useState<Collection | null>(null);

  // Redirect jika belum login
  useEffect(() => {
    if (!loading && !user) {
      openAuthModal("signin");
      router.replace("/");
    }
  }, [loading, user, router, openAuthModal]);

  // Fetch achievements (untuk section badges)
  useEffect(() => {
    if (!user) return;
    fetchProgression();
    fetch("/api/achievements")
      .then((r) => r.json())
      .then((d) => setAchievements(d.achievements ?? []))
      .catch(() => {});
  }, [user]);

  // Fetch tab data
  const fetchTabData = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    setSearchQuery("");
    try {
      if (activeTab === "watchlist") {
        const res = await fetch("/api/watchlist");
        const data = await res.json();
        setWatchlistItems(Array.isArray(data) ? data : []);
      } else if (activeTab === "liked") {
        const res = await fetch("/api/liked");
        const data = await res.json();
        setLikedItems(Array.isArray(data) ? data : []);
      } else if (activeTab === "collections") {
        const res = await fetch("/api/collections");
        const data = await res.json();
        // console.log("Fetched collections:", data);
        const fetched: Collection[] = data;
        setCollections(fetched);

        // simpan items map
        const itemsMap: Record<number, CollectionItem[]> = {};
        fetched.forEach((c) => {
          itemsMap[c.id] = (c as any).items ?? [];
        });
        setColItems(itemsMap);
      }
    } finally {
      setFetching(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    fetchTabData();
  }, [fetchTabData]);

  // Filter by search
  const filteredWatchlist = useMemo(
    () =>
      watchlistItems.filter((i) =>
        i.title?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [watchlistItems, searchQuery],
  );

  const filteredLiked = useMemo(
    () =>
      likedItems.filter((i) =>
        i.title?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [likedItems, searchQuery],
  );

  const filteredCollections = useMemo(
    () =>
      collections.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [collections, searchQuery],
  );

  // Unlocked achievements untuk badges
  const unlockedAchs = useMemo(
    () => achievements.filter((a) => a.is_unlocked).slice(0, 8),
    [achievements],
  );

  // ── Edit profile ────────────────────────────────────────────────────────────
  const startEdit = () => {
    setEditName(user?.profile?.display_name ?? "");
    setEditBio(user?.profile?.bio ?? "");
    setEditError(null);
    setEditMode(true);
  };

  const saveProfile = async () => {
    const trimName = editName.trim();
    if (!trimName) return setEditError("Nama tidak boleh kosong");
    setSaving(true);
    setEditError(null);
    const { error } = await updateProfile({
      display_name: trimName,
      bio: editBio.trim() || (null as any),
    });
    setSaving(false);
    if (error) {
      setEditError(error);
      return;
    }
    setEditMode(false);
    showToast("Profil berhasil disimpan ✓");
  };

  const handleSignOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
      // signOut() sudah handle redirect ke "/", jadi tidak perlu apa-apa di sini
    } catch (err) {
      console.error("[profile] Sign out failed:", err);
      setLoggingOut(false);
      setShowLogoutConfirm(false);
      showToast("Gagal keluar. Coba lagi.", "error");
    }
  };

  const removeFromWatchlist = async (id: number) => {
    await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    setWatchlistItems((prev) => prev.filter((i) => i.id !== id));
    showToast("Dihapus dari watchlist");
  };

  const unlike = async (id: number) => {
    await fetch(`/api/liked?id=${id}`, { method: "DELETE" });
    setLikedItems((prev) => prev.filter((i) => i.id !== id));
    showToast("Dihapus dari liked");
  };

  const createCollection = async () => {
    if (!newColName.trim()) return;
    setCreatingCol(true);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newColName.trim(),
        description: newColDesc,
        is_public: newColPublic,
      }),
    });
    const data = await res.json();
    setCreatingCol(false);
    if (res.ok) {
      setCollections((prev) => [{ ...data, item_count: 0 }, ...prev]);
      setShowNewCollection(false);
      setNewColName("");
      setNewColDesc("");
      showToast("Collection berhasil dibuat");
    } else {
      showToast(data.error ?? "Gagal membuat collection", "error");
    }
  };

  const deleteCollection = async (id: number) => {
    await fetch(`/api/collections?id=${id}`, { method: "DELETE" });
    setCollections((prev) => prev.filter((c) => c.id !== id));
    showToast("Collection dihapus");
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const profile = user.profile;
  const avatarLetter = (profile?.display_name ??
    user.email ??
    "U")[0].toUpperCase();
  const rankName = progression?.rank_name ?? "Audience";
  const rankColor = RANK_COLORS[rankName] ?? RANK_COLORS["Audience"];

  function handleItemDeleted(colId: number, itemId: number) {
    setColItems((prev) => ({
      ...prev,
      [colId]: (prev[colId] ?? []).filter((i) => i.item_id !== itemId),
    }));
    setCollections((prev) =>
      prev.map((c) =>
        c.id === colId ? { ...c, item_count: (c.item_count ?? 1) - 1 } : c,
      ),
    );
    // sync ke modal yang sedang terbuka
    if (modalCol?.id === colId) {
      setModalCol((prev) =>
        prev ? { ...prev, item_count: (prev.item_count ?? 1) - 1 } : prev,
      );
    }
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Modals */}
      {addToColTarget && (
        <AddToCollectionModal
          {...addToColTarget}
          collections={collections}
          onClose={() => setAddToColTarget(null)}
          onAdded={(name) => showToast(`Ditambahkan ke ${name}`)}
        />
      )}
      {editColTarget && (
        <EditCollectionModal
          col={editColTarget}
          onClose={() => setEditColTarget(null)}
          onSaved={(updated) => {
            setCollections((prev) =>
              prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
            );
            showToast("Koleksi diperbarui");
          }}
        />
      )}

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-background border border-white/10 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-destructive" />
              </div>
            </div>

            {/* Text */}
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-sm text-foreground">
                Keluar dari akun?
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Kamu harus login kembali untuk mengakses watchlist, koleksi, dan
                progress-mu.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-white/5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleSignOut();
                }}
                disabled={loggingOut}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/20 border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/30 transition-colors disabled:opacity-50"
              >
                {loggingOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                {loggingOut ? "Keluar..." : "Ya, keluar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero Section ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Ambient glow background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-primary/10 blur-[80px]" />
          <div className="absolute -top-10 right-0 w-60 h-60 rounded-full bg-violet-500/8 blur-[60px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 lg:px-6 pt-8 pb-6">
          {/* Top row: avatar + info + logout */}
          <div className="flex gap-4 sm:gap-6 items-start mb-6">
            <AvatarUpload
              avatarUrl={profile?.avatar_url}
              initial={avatarLetter}
              onUpload={async (file) => {
                const result = await uploadAvatar(file);
                if (!result.error) showToast("Foto profil diperbarui ✓");
                else showToast(result.error, "error");
                return result;
              }}
            />

            <div className="flex-1 min-w-0 pt-1">
              {editMode ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama tampilan"
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  />
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Bio singkat..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
                  />
                  {editError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {editError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg gradient-primary text-white text-sm disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(false);
                        setEditError(null);
                      }}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" /> Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                      {profile?.display_name ?? user.email?.split("@")[0]}
                    </h1>
                    {/* Rank badge */}
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                        rankColor.bg,
                        rankColor.text,
                        rankColor.border,
                      )}
                    >
                      {rankName}
                    </span>
                    <button
                      onClick={startEdit}
                      className="p-1.5 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {profile?.username && (
                    <p className="text-xs text-muted-foreground mb-0.5">
                      @{profile.username}
                    </p>
                  )}
                  {profile?.bio ? (
                    <p className="text-sm text-foreground/70 line-clamp-2">
                      {profile.bio}
                    </p>
                  ) : (
                    <button
                      onClick={startEdit}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      + Tambahkan bio
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {user.email}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              disabled={loggingOut}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {loggingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {loggingOut ? "Keluar..." : "Keluar"}
              </span>
            </button>
          </div>

          {/* Progression section */}
          {!progLoading && progression && (
            <div className="space-y-3">
              {/* Level info + XP bar */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Level</span>
                    <span className="text-2xl font-bold text-foreground">
                      {progression.level}
                    </span>
                    {!progression.is_max_level && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {progression.level + 1}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {progression.total_xp.toLocaleString()} XP total
                  </span>
                </div>
                <FilmStripBar
                  percent={progression.progress_percent}
                  xpProgress={progression.xp_progress}
                  xpNeeded={progression.xp_needed}
                />
              </div>

              {/* Stat pills */}
              <div className="flex gap-2">
                <StatPill
                  icon={Zap}
                  value={progression.points.toLocaleString()}
                  label="Point"
                  color="border-amber-500/20 text-amber-300"
                />
                <StatPill
                  icon={Ticket}
                  value={progression.lucky_tickets}
                  label="Tickets"
                  color="border-emerald-500/20 text-emerald-300"
                />
                <StatPill
                  icon={Trophy}
                  value={achievements.filter((a) => a.is_unlocked).length}
                  label="Achievement"
                  color="border-cyan-500/20 text-cyan-300"
                />
              </div>
            </div>
          )}

          {/* Achievement badges horizontal scroll */}
          {unlockedAchs.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Achievement Progress
                </span>
                <Link
                  href="/achievements"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Lihat semua <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {achievements
                  .filter((a) => !a.is_secret || a.is_unlocked)
                  .slice(0, 12)
                  .map((ach) => (
                    <AchievementBadge key={ach.key} ach={ach} />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs + Content ───────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 lg:px-6">
        {/* Tab bar + search */}
        <div className="flex items-center gap-2 mb-5 sticky top-14 lg:top-0 z-30 py-2 bg-background/80 backdrop-blur-xl">
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/8 flex-1">
            {(
              [
                {
                  key: "watchlist" as ProfileTab,
                  label: "Watchlist",
                  Icon: BookmarkPlus,
                },
                {
                  key: "liked" as ProfileTab,
                  label: "Disukai",
                  Icon: Heart,
                },
                {
                  key: "collections" as ProfileTab,
                  label: "Koleksi",
                  Icon: FolderOpen,
                },
              ] as const
            ).map(({ key, label, Icon }) => {
              const isActive = activeTab === key;

              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-medium"
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeProfileTab"
                      className="absolute inset-0 rounded-lg gradient-primary shadow-lg shadow-primary/20"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}

                  <span
                    className={cn(
                      "relative z-10 flex items-center gap-1.5 transition-colors",
                      isActive
                        ? "text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Watchlist Tab ──────────────────────────────────────────────────── */}
        {activeTab === "watchlist" &&
          (fetching ? (
            <GridSkeleton />
          ) : filteredWatchlist.length === 0 ? (
            <EmptyState
              text={
                searchQuery ? "Tidak ditemukan" : "Belum ada film di watchlist"
              }
              linkTo={searchQuery ? null : "/explore"}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {filteredWatchlist.map((item) => (
                <MediaCard
                  key={item.id}
                  href={
                    item.media_type === "movie"
                      ? `/movie/${item.tmdb_id}`
                      : `/tv/${item.tmdb_id}`
                  }
                  posterPath={item.poster_path ?? null}
                  title={item.title ?? ""}
                  voteAverage={item.vote_average ?? 0}
                  onDelete={() => removeFromWatchlist(item.id)}
                />
              ))}
            </div>
          ))}

        {/* ── Liked Tab ─────────────────────────────────────────────────────── */}
        {activeTab === "liked" &&
          (fetching ? (
            <GridSkeleton />
          ) : filteredLiked.length === 0 ? (
            <EmptyState
              text={searchQuery ? "Tidak ditemukan" : "Belum ada yang disukai"}
              linkTo={searchQuery ? null : "/swipe"}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {filteredLiked.map((item) => (
                <MediaCard
                  key={item.id}
                  href={
                    item.media_type === "movie"
                      ? `/movie/${item.movie_id}`
                      : `/tv/${item.series_id}`
                  }
                  posterPath={item.poster_path ?? null}
                  title={item.title ?? ""}
                  voteAverage={item.vote_average ?? 0}
                  onDelete={() => unlike(item.id)}
                  onAddToCollection={() =>
                    setAddToColTarget({
                      mediaType: item.media_type as "movie" | "tv",
                      movieId: item.movie_id ?? undefined,
                      seriesId: item.series_id ?? undefined,
                    })
                  }
                />
              ))}
            </div>
          ))}

        {/* ── Collections Tab ───────────────────────────────────────────────── */}
        {activeTab === "collections" && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-muted-foreground">
                {collections.length} koleksi
              </span>
              <button
                onClick={() => setShowNewCollection(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-white text-xs font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" /> Buat Koleksi
              </button>
            </div>

            {/* New collection form */}
            {showNewCollection && (
              <div className="mb-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 animate-in slide-in-from-top-2 duration-200">
                <h3 className="font-semibold text-sm">Koleksi Baru</h3>
                <input
                  placeholder="Nama koleksi *"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                />
                <textarea
                  placeholder="Deskripsi (opsional)"
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newColPublic}
                    onChange={(e) => setNewColPublic(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Publik
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={createCollection}
                    disabled={creatingCol || !newColName.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg gradient-primary text-white text-sm disabled:opacity-50"
                  >
                    {creatingCol ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Buat
                  </button>
                  <button
                    onClick={() => {
                      setShowNewCollection(false);
                      setNewColName("");
                      setNewColDesc("");
                    }}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            {fetching ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-2xl bg-white/5 aspect-video"
                  />
                ))}
              </div>
            ) : filteredCollections.length === 0 ? (
              <EmptyState
                text={
                  searchQuery
                    ? "Tidak ditemukan"
                    : "Belum ada koleksi. Buat yang pertama!"
                }
                linkTo={null}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredCollections.map((col) => {
                  const isAchievement = (col as any).is_achievement;
                  return (
                    <div
                      key={col.id}
                      className="group relative rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden hover:border-white/15 transition-colors"
                    >
                      {/* Cover */}
                      <div
                        className="aspect-video bg-white/5 relative overflow-hidden cursor-pointer"
                        onClick={() => {
                          setModalCol(col);
                        }}
                      >
                        <CollectionStackedCover
                          items={colItems[col.id] ?? []}
                          isAchievement={isAchievement}
                        />
                        {/* Badges */}
                        <div className="absolute top-2 left-2 flex gap-1">
                          {isAchievement && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/80 text-[10px] text-white font-medium">
                              <Award className="w-2.5 h-2.5" /> Achievement
                            </span>
                          )}
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] text-white">
                          {col.is_public ? (
                            <Globe className="w-2.5 h-2.5" />
                          ) : (
                            <Lock className="w-2.5 h-2.5" />
                          )}
                          {col.is_public ? "Publik" : "Privat"}
                        </div>
                      </div>

                      {/* Info + actions */}
                      <div className="p-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">
                            {col.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {col.item_count ?? 0} item
                          </p>
                          {col.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {col.description}
                            </p>
                          )}
                        </div>
                        {/* Edit / Delete — hanya untuk koleksi user biasa */}
                        {!isAchievement && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => setEditColTarget(col)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteCollection(col.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {modalCol && (
              <CollectionItemsModal
                open={!!modalCol}
                onClose={() => setModalCol(null)}
                collectionId={modalCol.id}
                collectionName={modalCol.name}
                items={colItems[modalCol.id] ?? []}
                onItemDeleted={(itemId) =>
                  handleItemDeleted(modalCol.id, itemId)
                }
                showToast={showToast}
              />
            )}
          </>
        )}
      </div>
      <NativeBannerAd className="px-4" />
    </div>
  );
}
