import { json, bad, requireAdmin } from "../_lib.js";

const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 3 * 1024 * 1024; // 3MB — الواجهة تصغّر الصورة قبل الإرسال

/** POST /api/upload — يرفع صورة إلى R2 ويربطها بعقار. */
export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.res;

  const form = await request.formData();
  const file = form.get("file");
  const propertyId = Number(form.get("property_id"));
  if (!file || typeof file === "string") return bad("لا يوجد ملف");
  if (!Number.isFinite(propertyId)) return bad("رقم العقار مفقود");
  if (!OK_TYPES.has(file.type)) return bad("الصيغة غير مدعومة — JPG أو PNG أو WebP");
  if (file.size > MAX) return bad("الصورة كبيرة جداً");

  const prop = await env.DB.prepare("SELECT id, ref FROM properties WHERE id = ?")
    .bind(propertyId).first();
  if (!prop) return bad("العقار غير موجود", 404);

  const ext = file.type === "image/png" ? "png"
            : file.type === "image/webp" ? "webp" : "jpg";
  const key = `${prop.ref}/${crypto.randomUUID()}.${ext}`;

  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  const pos = await env.DB
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM images WHERE property_id = ?")
    .bind(prop.id).first();

  const row = await env.DB.prepare(
    `INSERT INTO images (property_id, key, width, height, position, alt)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(prop.id, key, Number(form.get("width")) || null,
         Number(form.get("height")) || null, pos?.n ?? 0,
         (form.get("alt") || "").slice(0, 200) || null).first();

  return json({ ...row, url: `/r/${key}` }, 201);
}

/** DELETE /api/upload?id=12 — يحذف صورة واحدة. */
export async function onRequestDelete({ request, env }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.res;

  const id = Number(new URL(request.url).searchParams.get("id"));
  const img = await env.DB.prepare("SELECT * FROM images WHERE id = ?").bind(id).first();
  if (!img) return bad("غير موجود", 404);

  try { await env.BUCKET.delete(img.key); } catch { /* تجاهل */ }
  await env.DB.prepare("DELETE FROM images WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

/** PATCH /api/upload — إعادة ترتيب الصور؛ الأولى تصبح الغلاف. */
export async function onRequestPatch({ request, env }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.res;

  const { order } = await request.json();           // [imageId, imageId, ...]
  if (!Array.isArray(order)) return bad("ترتيب غير صحيح");

  const stmt = env.DB.prepare("UPDATE images SET position = ? WHERE id = ?");
  await env.DB.batch(order.map((id, i) => stmt.bind(i, id)));
  return json({ ok: true });
}
