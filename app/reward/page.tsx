// app/reward/page.tsx
import { RewardClient } from "@/components/reward-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reward Store – Movyoo",
  description:
    "Tukar poin Movyoo-mu dengan merchandise, voucher, pengalaman eksklusif, dan hadiah digital menarik lainnya.",
};

export default function RewardPage() {
  return <RewardClient />;
}
