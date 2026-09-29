import { json, bad, requireAdmin, cleanProperty, publicShape } from "../../_lib.js";

const load = async (env, id) =>
  env.DB.prepare("SELECT * FROM properties WHERE id = ? OR ref = ?")
    .bind(id, id).first();

/** GET /api/properties/:id — عام، مع كل الصور بالترتيب. */
export async function onRequestGet({ params, request, env }) {
  const row = await load(env, params.id);
  if (!row) return bad("غير موجود", 404);

  const admin = request.headers.get("cf-access-authenticated-user-email");
  if (!row.published && !admin) return bad("غير موجود", 404);

  const { results } = await env.DB.prepare(
    "SELECT id, key, width, height, position, alt FROM images WHERE property_id = ? ORDER BY position"
  ).bind(row.id).all();

  const images = results.map((i) => ({ ...i, url: `/r/${i.key}` }));
  return json(publicShape(row, images));
}

/** PATCH /api/properties/:id — تعديل. */
export async function onRequestPatch({ params, request, env }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.res;

  const row = await load(env, params.id);
  if (!row) return bad("غير موجود", 404);

  let body;
  try { body = await request.json(); } catch { return bad("صيغة غير صحيحة"); }

  // تبديل سريع للحالة أو النشر دون إرسال النموذج كاملاً
  if (body.__toggle) {
    const f = body.__toggle;
    if (!["published", "status", "sort_order", "show_price"].includes(f))
      return bad("حقل غير مسموح");
    const updated = await env.DB
      .prepare(`UPDATE properties SET ${f} = ?, updated_at = datetime('now')
                WHERE id = ? RETURNING *`)
      .bind(body.value, row.id).first();
    return json(updated);
  }

  const parsed = cleanProperty({ ...row, ...body });
  if (parsed.error) return bad(parsed.error);
  const v = parsed.value;
  const cols = Object.keys(v);

  const updated = await env.DB.prepare(
    `UPDATE properties SET ${cols.map((c) => `${c} = ?`).join(", ")},
     updated_at = datetime('now') WHERE id = ? RETURNING *`
  ).bind(...cols.map((c) => v[c]), row.id).first();

  return json(updated);
}

/** DELETE /api/properties/:id — يحذف الصور من R2 أيضاً حتى لا تتراكم. */
export async function onRequestDelete({ params, request, env }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.res;

  const row = await load(env, params.id);
  if (!row) return bad("غير موجود", 404);

  const { results } = await env.DB
    .prepare("SELECT key FROM images WHERE property_id = ?").bind(row.id).all();
  for (const img of results) {
    try { await env.BUCKET.delete(img.key); } catch { /* الحذف من القاعدة أهم */ }
  }

  await env.DB.prepare("DELETE FROM properties WHERE id = ?").bind(row.id).run();
  return json({ ok: true, deleted: row.ref });
}
