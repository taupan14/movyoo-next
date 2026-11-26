/**
 * lib/review-replies-db.ts
 * Sama seperti article-reviews-db.ts: user_id → auth.users, jadi
 * profile HARUS di-fetch terpisah, tidak bisa embedded select.
 */

import { supabase } from "./supabase";

export interface ReplyProfile {
  display_name: string | null;
  avatar_url: string | null;
}

export interface ReviewReply {
  id: number;
  review_id: number;
  user_id: string;
  parent_reply_id: number | null;
  content: string;
  mentioned_user_ids: string[];
  is_deleted: boolean;
  created_at: string;
  profile: ReplyProfile;
}

export async function fetchReviewReplies(
  reviewId: number,
): Promise<ReviewReply[]> {
  const { data, error } = await supabase
    .from("review_replies")
    .select(
      "id, review_id, user_id, parent_reply_id, content, mentioned_user_ids, is_deleted, created_at",
    )
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[review-replies-db] fetchReviewReplies:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map((r: any) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [
      p.id,
      { display_name: p.display_name, avatar_url: p.avatar_url },
    ]),
  );

  return data.map((r: any) => ({
    id: r.id,
    review_id: r.review_id,
    user_id: r.user_id,
    parent_reply_id: r.parent_reply_id,
    content: r.content,
    mentioned_user_ids: r.mentioned_user_ids ?? [],
    is_deleted: r.is_deleted,
    created_at: r.created_at,
    profile: profileMap.get(r.user_id) ?? {
      display_name: null,
      avatar_url: null,
    },
  }));
}

// ─── Bangun tree dari flat list — untuk nested reply penuh ─────────────
export function buildReplyTree(
  flat: ReviewReply[],
): (ReviewReply & { children: any[] })[] {
  const map = new Map<number, ReviewReply & { children: any[] }>();
  const roots: (ReviewReply & { children: any[] })[] = [];

  flat.forEach((r) => map.set(r.id, { ...r, children: [] }));

  flat.forEach((r) => {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}
