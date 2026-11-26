// app/api/upload/article-cover/route.ts — FILE BARU
// POST multipart/form-data dengan field "file" → upload ke bucket "articles"

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "contributor" && profile?.role !== "admin") {
    return NextResponse.json({ error: "Bukan kontributor" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "File harus berupa gambar" }, { status: 400 });
  if (file.size > 3 * 1024 * 1024)
    return NextResponse.json({ error: "Ukuran maksimal 3 MB" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("articles")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data: urlData } = supabase.storage.from("articles").getPublicUrl(path);

  return NextResponse.json({ cover_path: urlData.publicUrl });
}
