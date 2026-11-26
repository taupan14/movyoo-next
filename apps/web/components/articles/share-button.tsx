"use client";

/**
 * components/articles/share-button.tsx — UPDATED
 * - Share text: judul saja (tidak pakai excerpt)
 * - Tambah platform: WhatsApp, X, Telegram, Facebook, copy link
 * - Desain dropdown lebih profesional
 */

import { useState } from "react";
import { Share2, Link2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  title: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://movyoo.id";

// ── Platform config ───────────────────────────────────────────────────────────

function getShareTargets(url: string, title: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return [
    {
      id: "whatsapp",
      label: "WhatsApp",
      color: "text-green-400",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      href: `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`,
    },
    {
      id: "twitter",
      label: "X (Twitter)",
      color: "text-foreground",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    },
    {
      id: "telegram",
      label: "Telegram",
      color: "text-sky-400",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      ),
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      color: "text-blue-400",
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ShareButton({ slug, title }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url = `${SITE_URL}/articles/${slug}`;
  const targets = getShareTargets(url, title);

  async function handleNativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        // Native share: hanya title + url, tanpa deskripsi panjang
        await navigator.share({ title, url });
      } catch {
        // user cancelled — no-op
      }
      return;
    }
    setOpen((v) => !v);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={handleNativeShare}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        aria-label="Bagikan artikel"
      >
        <Share2 className="w-3.5 h-3.5" />
        Bagikan
      </button>

      {/* Desktop dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-2xl bg-popover border border-border shadow-xl overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold text-foreground">
                Bagikan artikel
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                {title}
              </p>
            </div>

            {/* Platform list */}
            <div className="py-1">
              {targets.map((t) => (
                <a
                  key={t.id}
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <span className={cn("shrink-0", t.color)}>{t.icon}</span>
                  <span className="text-xs text-muted-foreground hover:text-foreground">
                    {t.label}
                  </span>
                </a>
              ))}
            </div>

            {/* Copy link */}
            <div className="border-t border-border py-1">
              <button
                onClick={copyLink}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={cn(
                    "text-xs transition-colors",
                    copied ? "text-green-400" : "text-muted-foreground",
                  )}
                >
                  {copied ? "Link berhasil disalin!" : "Salin link"}
                </span>
              </button>

              {/* URL preview */}
              <div className="mx-4 mb-2 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border">
                <p className="text-[10px] text-muted-foreground/70 truncate">
                  {url}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
