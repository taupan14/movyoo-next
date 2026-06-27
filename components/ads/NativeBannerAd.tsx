import { ADS_CONFIG } from "@/lib/ads/config";
import AdUnit from "./AdUnit";

interface NativeBannerAdProps {
  className?: string;
}

/**
 * Native Banner Ad dari Adsterra.
 *
 * Penempatan yang direkomendasikan:
 * - Di antara section konten (setelah hero, sebelum list film)
 * - Di tengah halaman explore / browse
 * - Di bawah detail film sebelum "Film Terkait"
 *
 * Hindari: di atas fold (above-the-fold), di dalam modal, di antara item list yang rapat.
 */
export default function NativeBannerAd({
  className = "",
}: NativeBannerAdProps) {
  if (!ADS_CONFIG.enabled || !ADS_CONFIG.scripts.nativeBanner) return null;

  return (
    <div className={`my-6 ${className}`}>
      <p className="text-[10px] text-muted-foreground/60 mb-1.5 px-1 tracking-wide uppercase">
        Sponsored
      </p>
      <AdUnit
        scriptSrc={ADS_CONFIG.scripts.nativeBanner}
        containerId={ADS_CONFIG.containerId.nativeBanner}
        minHeight={90}
        className="w-full rounded-xl overflow-hidden"
      />
    </div>
  );
}
