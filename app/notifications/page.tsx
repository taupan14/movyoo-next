"use client";

/**
 * app/notifications/page.tsx — FILE BARU
 * Daftar notifikasi user (contributor approved/rejected, dll).
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Loader2,
  PenLine,
  XCircle,
  BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { startLoader } from "@/components/page-loader";
import type { AppNotification } from "@/types/contributor";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function iconForType(type: AppNotification["type"]) {
  switch (type) {
    case "contributor_approved":
      return <PenLine className="w-4 h-4 text-emerald-400" />;
    case "contributor_rejected":
      return <XCircle className="w-4 h-4 text-destructive" />;
    default:
      return <Bell className="w-4 h-4 text-primary" />;
  }
}

export default function NotificationsPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      openAuthModal("signin");
      router.replace("/");
    }
  }, [authLoading, user, router, openAuthModal]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user, fetchNotifications]);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  async function markOneRead(n: AppNotification) {
    if (n.is_read) return;
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
    );
    fetch(`/api/notifications/${n.id}`, { method: "PATCH" }).catch(() => {});
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-6 pb-24 max-w-5xl mx-auto px-4 lg:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Notifikasi</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} notifikasi belum dibaca`
              : "Semua notifikasi sudah dibaca"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            {markingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            Tandai semua dibaca
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <BellOff className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Belum ada notifikasi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const content = (
              <div
                onClick={() => markOneRead(n)}
                className={cn(
                  "flex gap-3 p-4 rounded-2xl border transition-colors cursor-pointer",
                  n.is_read
                    ? "bg-card border-border"
                    : "bg-primary/5 border-primary/30",
                )}
              >
                <div className="shrink-0 w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                  {iconForType(n.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                    )}
                  </div>
                  {n.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {n.message}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </div>
            );

            return n.link ? (
              <Link
                key={n.id}
                href={n.link}
                onClick={() => {
                  markOneRead(n);
                  startLoader();
                }}
                className="block"
              >
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </main>
  );
}
