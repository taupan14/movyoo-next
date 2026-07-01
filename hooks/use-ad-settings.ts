// hooks/use-ad-settings.ts
//
// Re-export dari AdsProvider supaya import path lama
// (`@/hooks/use-ad-settings`) tetap jalan tanpa perlu update semua
// komponen yang sudah pakai hook ini.
//
// Logic sebenarnya sekarang ada di components/ads/AdsProvider.tsx —
// data di-resolve sekali di server (lib/ads/get-ad-flags.ts) dan
// didistribusikan lewat React Context, bukan fetch ulang di client.

export { useAdSettings } from "@/components/ads/AdsProvider";
