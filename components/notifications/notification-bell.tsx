"use client";

/**
 * components/notifications/notification-bell.tsx — FILE BARU
 *
 * Ikon lonceng dengan badge unread count. Klik → /notifications.
 * Dipakai di navigation.tsx (desktop sidebar & mobile top bar).
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { startLoader } from "@/components/page-loader";

export function NotificationBell({ size = "md" }: { size?: "sm" | "md" }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  const dim = size === "sm" ? "w-9 h-9" : "w-11 h-11";
  const iconDim = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    fetchUnread();
    // Polling ringan tiap 60 detik — cukup untuk kasus ini tanpa realtime
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Refresh count tiap kali balik dari halaman notifikasi
  useEffect(() => {
    if (pathname !== "/notifications") fetchUnread();
  }, [pathname, fetchUnread]);

  if (!user) return null;

  return (
    <button
      onClick={() => {
        if (pathname !== "/notifications") startLoader();
        router.push("/notifications");
      }}
      className={cn(
        dim,
        "relative rounded-xl flex items-center justify-center transition-all duration-200",
        "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
      title="Notifikasi"
    >
      <Bell className={iconDim} />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
