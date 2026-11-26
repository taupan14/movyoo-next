// hooks/useProgression.ts
// Hook untuk fetch dan manage progression state di frontend.
// Dipakai di semua halaman yang perlu menampilkan XP, level, atau trigger award.

"use client";

import { useState, useCallback } from "react";
import type {
  ProgressionWithLevel,
  XpSource,
  AwardResult,
  CompletedChallenge,
  AchievementProgress,
  AwardMeta,
} from "@/types/progression";

interface AwardResponse {
  success: boolean;
  awards: AwardResult[];
  completed_challenges: CompletedChallenge[];
  achievement_updates: AchievementProgress[];
  progression: ProgressionWithLevel;
}

interface UseProgressionReturn {
  progression: ProgressionWithLevel | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchProgression: () => Promise<void>;
  award: (
    source: XpSource,
    options?: {
      ref_id?: number;
      meta?: AwardMeta;
      onLevelUp?: (
        oldLevel: number,
        newLevel: number,
        unlocks: string[],
      ) => void;
      onChallengeComplete?: (challenges: CompletedChallenge[]) => void;
      onAchievementUnlock?: (achievements: AchievementProgress[]) => void;
    },
  ) => Promise<AwardResponse | null>;
}

export function useProgression(): UseProgressionReturn {
  const [progression, setProgression] = useState<ProgressionWithLevel | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgression = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/progression/me");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to fetch progression");
      }
      const data: ProgressionWithLevel = await res.json();
      setProgression(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const award = useCallback(
    async (
      source: XpSource,
      options?: {
        ref_id?: number;
        meta?: AwardMeta;
        onLevelUp?: (
          oldLevel: number,
          newLevel: number,
          unlocks: string[],
        ) => void;
        onChallengeComplete?: (challenges: CompletedChallenge[]) => void;
        onAchievementUnlock?: (achievements: AchievementProgress[]) => void;
      },
    ): Promise<AwardResponse | null> => {
      setIsMutating(true);
      try {
        const res = await fetch("/api/progression/award", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            ref_id: options?.ref_id,
            meta: options?.meta,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          console.error("[useProgression.award] error:", data.error);
          return null;
        }

        const data: AwardResponse = await res.json();

        // Update progression state lokal
        if (data.progression) {
          setProgression(data.progression);
        }

        // Callbacks
        const levelUpAward = data.awards.find((a) => a.leveled_up);
        if (levelUpAward && options?.onLevelUp) {
          options.onLevelUp(
            levelUpAward.old_level,
            levelUpAward.new_level,
            levelUpAward.unlocks,
          );
        }

        if (
          data.completed_challenges.length > 0 &&
          options?.onChallengeComplete
        ) {
          options.onChallengeComplete(data.completed_challenges);
        }

        const newlyUnlocked = data.achievement_updates.filter(
          (a) => a.unlocked && !a.already_unlocked,
        );
        if (newlyUnlocked.length > 0 && options?.onAchievementUnlock) {
          options.onAchievementUnlock(newlyUnlocked);
        }

        return data;
      } catch (err) {
        console.error("[useProgression.award]", err);
        return null;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  return { progression, isLoading, isMutating, error, fetchProgression, award };
}
