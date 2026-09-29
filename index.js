import { json, bad, requireAdmin, cleanProperty, publicShape, nextRef }
  from "../../_lib.js";

/** GET /api/properties — عام. فلترة + ترقيم صفحات + صورة واحدة لكل عقار. */
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const admin = request.headers.get("cf-access-authenticated-user-email");

  const where = [];
  const bind = [];

  // الزائر يرى المنشور فقط؛ الأدمن يرى كل شيء
  if (!admin) { where.push("published = 1"); }
  else if (u.searchParams.get("all") !== "1") { where.push("published = 1"); }

  // المباع يُخفى افتراضياً عن الزوار دون حذف بياناته
  if (!admin && u.searchParams.get("status") !== "all") {
    where.push("status != 'sold'");
  }

  const type = u.searchParams.get("type");
  if (type && type !== "all") { where.push("type = ?"); bind.push(type); }

  const area = u.searchParams.get("area");
  if (area && area !== "all") { where.push("area_name = ?"); bind.push(area); }

  const beds = Number(u.searchParams.get("beds"));
  if (Number.isFinite(beds) && beds > 0) { where.push("bedrooms >= ?"); bind.push(beds); }

  const minSize = Number(u.searchParams.get("min_size"));
  if (Number.isFinite(minSize) && minSize > 0) {
    where.push("COALESCE(size_m2, land_m2) >= ?"); bind.push(minSize);
  }

  const q = (u.searchParams.get("q") || "").trim();
  if (q) {
    where.push("(title_ar LIKE ? OR area_name LIKE ? OR ref LIKE ?)");
    const like = "%" + q + "%";
    bind.push(like, like, like);
  }

  const limit = Math.min(Number(u.searchParams.get("limit")) || 24, 60);
  const page = Math.max(Number(u.searchParams.get("page")) || 1, 1);
  const offset = (page - 1) * limit;

  const clause = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM properties ${clause}`)
    .bind(...bind).first();

  // صورة الغلاف فقط — تحميل كل الصور هنا يبطّئ الشبكة بلا فائدة
  const { results } = await env.DB.prepare(
    `SELECT p.*, (SELECT key FROM images i WHERE i.property_id = p.id
                  ORDER BY i.position LIMIT 1) AS cover
     FROM properties p ${clause}
     ORDER BY p.sort_order DESC, p.id DESC
     LIMIT ? OFFSET ?`
  ).bind(...bind, limit, offset).all();

  const items = results.map((r) => {
    const shaped = publicShape(r);
    shaped.cover = r.cover ? `/r/${r.cover}` : null;
    return shaped;
  });

  return json({ items, page, limit, total: total?.n ?? 0 },
    200, admin ? {} : { "cache-control": "public, max-age=60" });
}

/** POST /api/properties — إنشاء. محمي بـ Cloudflare Access. */
export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.res;

  let body;
  try { body = await request.json(); } catch { return bad("صيغة غير صحيحة"); }

  const parsed = cleanProperty(body);
  if (parsed.error) return bad(parsed.error);
  const v = parsed.value;

  const last = await env.DB
    .prepare("SELECT COALESCE(MAX(id), 0) AS n FROM properties").first();
  const ref = nextRef((last?.n ?? 0) + 1);

  const cols = Object.keys(v);
  const res = await env.DB.prepare(
    `INSERT INTO properties (ref, created_by, ${cols.join(", ")})
     VALUES (?, ?, ${cols.map(() => "?").join(", ")}) RETURNING *`
  ).bind(ref, auth.email, ...cols.map((c) => v[c])).first();

  return json(res, 201);
}
