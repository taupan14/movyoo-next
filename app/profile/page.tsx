"use client";

// app/profile/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getPosterUrl } from "@/lib/tmdb";
import type { WatchlistItem, LikedItem, Collection } from "@/types/auth";

type ProfileTab = "watchlist" | "liked" | "collections";
// ─── Toast notification kecil ─────────────────────────────────────────────────
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

// ─── Avatar dengan tombol upload ──────────────────────────────────────────────
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

    // Preview lokal sebelum upload
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setUploadError(null);
    const { error } = await onUpload(file);
    setUploading(false);

    if (error) {
      setUploadError(error);
      setPreview(null); // rollback preview
    }
    // Reset input supaya file yang sama bisa diupload ulang
    e.target.value = "";
  };

  const displayed = preview ?? avatarUrl;

  return (
    <div className="relative shrink-0 group/avatar">
      {/* Avatar image / initial */}
      {displayed ? (
        <img
          src={displayed}
          alt={initial}
          className="w-24 h-24 rounded-full object-cover ring-2 ring-secondary/50"
        />
      ) : (
        <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-white ring-2 ring-primary/30">
          {initial}
        </div>
      )}

      {/* Overlay kamera — muncul saat hover */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "absolute inset-0 rounded-full flex flex-col items-center justify-center gap-1",
          "bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity",
          "disabled:cursor-not-allowed",
        )}
        title="Ganti foto"
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

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Error tooltip kecil */}
      {uploadError && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-md">
          {uploadError}
        </div>
      )}
    </div>
  );
}

// ─── Main ProfilePage ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, signOut, updateProfile, uploadAvatar, openAuthModal } =
    useAuth();

  const [activeTab, setActiveTab] = useState<ProfileTab>("watchlist");
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [likedItems, setLikedItems] = useState<LikedItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [fetching, setFetching] = useState(false);

  // Edit profile state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);

  // New collection state
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [newColPublic, setNewColPublic] = useState(false);
  const [creatingCol, setCreatingCol] = useState(false);

  // Redirect jika belum login
  useEffect(() => {
    if (!loading && !user) {
      openAuthModal("signin");
      router.replace("/");
    }
  }, [loading, user, router, openAuthModal]);

  // Fetch tab data
  const fetchTabData = useCallback(async () => {
    if (!user) return;
    setFetching(true);
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
        setCollections(Array.isArray(data) ? data : []);
      }
    } finally {
      setFetching(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    fetchTabData();
  }, [fetchTabData]);

  // ── Edit profile ──────────────────────────────────────────────────────────
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

  // ── Logout ────────────────────────────────────────────────────────────────
  // signOut di use-auth sudah handle redirect via window.location.href = '/'
  // tapi kita tetap guard dengan state loggingOut untuk disable tombol
  const handleSignOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await signOut(); // di dalamnya sudah: window.location.href = '/'
  };

  const removeFromWatchlist = async (id: number) => {
    await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    setWatchlistItems((prev) => prev.filter((item) => item.id !== id));
  };

  const unlike = async (id: number) => {
    await fetch(`/api/liked?id=${id}`, { method: "DELETE" });
    setLikedItems((prev) => prev.filter((item) => item.id !== id));
  };

  // ── Collections ───────────────────────────────────────────────────────────
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

  // ── Render guard ──────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen pt-6 pb-24 max-w-4xl mx-auto px-4 lg:px-6">
      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── Profile Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-6 items-start mb-8">
        {/* Avatar dengan upload */}
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

        {/* Info */}
        <div className="flex-1 min-w-0">
          {editMode ? (
            <div className="space-y-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nama tampilan"
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Bio singkat... (opsional)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors"
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
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg glass text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Batal
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">
                  {profile?.display_name ?? user.email?.split("@")[0]}
                </h1>
                <button
                  onClick={startEdit}
                  className="p-1.5 rounded-lg glass text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit profil"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
              {profile?.username && (
                <p className="text-sm text-muted-foreground">
                  @{profile.username}
                </p>
              )}
              {profile?.bio ? (
                <p className="text-sm text-foreground/70 mt-1 line-clamp-2">
                  {profile.bio}
                </p>
              ) : (
                <button
                  onClick={startEdit}
                  className="text-xs text-muted-foreground hover:text-primary mt-1 transition-colors"
                >
                  + Tambahkan bio
                </button>
              )}
              <p className="text-xs text-muted-foreground mt-1">{user.email}</p>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleSignOut}
          disabled={loggingOut}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
          {loggingOut ? "Keluar..." : "Keluar"}
        </button>
      </div>

      {/* ── Main Tabs ────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl glass mb-6">
        {[
          {
            key: "watchlist" as ProfileTab,
            label: "Watchlist",
            Icon: BookmarkPlus,
          },
          { key: "liked" as ProfileTab, label: "Disukai", Icon: Heart },
          {
            key: "collections" as ProfileTab,
            label: "Collections",
            Icon: FolderOpen,
          },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === key
                ? "gradient-primary text-white shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Watchlist Tab ─────────────────────────────────────── */}
      {activeTab === "watchlist" && (
        <>
          {fetching ? (
            <GridSkeleton />
          ) : watchlistItems.length === 0 ? (
            <EmptyState
              text="Belum ada film/serial di sini"
              linkTo="/explore"
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {watchlistItems.map((item) => (
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
          )}
        </>
      )}

      {/* ── Liked Tab ────────────────────────────────────────── */}
      {activeTab === "liked" && (
        <>
          {fetching ? (
            <GridSkeleton />
          ) : likedItems.length === 0 ? (
            <EmptyState text="Belum ada yang disukai" linkTo="/explore" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {likedItems.map((item) => (
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
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Collections Tab ──────────────────────────────────── */}
      {activeTab === "collections" && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowNewCollection(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Buat Collection
            </button>
          </div>

          {showNewCollection && (
            <div className="mb-6 p-4 rounded-2xl glass-strong border border-white/10 space-y-3">
              <h3 className="font-semibold">Collection Baru</h3>
              <input
                placeholder="Nama collection *"
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
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newColPublic}
                  onChange={(e) => setNewColPublic(e.target.checked)}
                  className="w-4 h-4"
                />
                Publik (bisa dilihat orang lain)
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
                  className="px-4 py-1.5 rounded-lg glass text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {fetching ? (
            <GridSkeleton cols={3} />
          ) : collections.length === 0 ? (
            <EmptyState
              text="Belum ada collection. Buat yang pertama!"
              linkTo={null}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {collections.map((col) => (
                <div
                  key={col.id}
                  className="group relative rounded-2xl glass border border-white/10 overflow-hidden hover-lift"
                >
                  <div className="aspect-video bg-white/5 relative overflow-hidden">
                    {col.cover_poster ? (
                      <img
                        src={getPosterUrl(col.cover_poster)}
                        alt={col.name}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FolderOpen className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs text-white">
                      {col.is_public ? (
                        <Globe className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                      {col.is_public ? "Publik" : "Privat"}
                    </div>
                  </div>
                  <div className="p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate text-foreground">
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
                    <button
                      onClick={() => deleteCollection(col.id)}
                      className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ─── MediaCard: poster + hover overlay (detail & delete) ─────────────────────
function MediaCard({
  href,
  posterPath,
  title,
  voteAverage,
  onDelete,
}: {
  href: string;
  posterPath: string | null;
  title: string;
  voteAverage: number;
  onDelete: () => void;
}) {
  return (
    <div className="group relative">
      {/* Poster */}
      <div className="relative rounded-xl overflow-hidden aspect-[2/3]">
        <img
          src={getPosterUrl(posterPath)}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Rating badge */}
        {voteAverage > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-xs z-10">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-white font-medium">
              {voteAverage.toFixed(1)}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2 p-2">
          {/* Detail button */}
          <Link
            href={href}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium",
              "bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Detail
          </Link>
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium",
              "bg-destructive/60 hover:bg-destructive/80 text-white backdrop-blur-sm transition-colors",
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus
          </button>
        </div>
      </div>

      {/* Title below */}
      <p className="mt-1.5 text-xs font-medium truncate text-muted-foreground group-hover:text-foreground transition-colors">
        {title}
      </p>
    </div>
  );
}

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
      <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
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
