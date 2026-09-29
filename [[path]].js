/** GET /r/<key> — يقدّم صور العقارات من R2 عبر شبكة Cloudflare.
 *  الملفات غير قابلة للتعديل (اسم فريد لكل رفع) لذا تُخزَّن مؤقتاً لسنة. */
export async function onRequestGet({ params, env, request }) {
  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  // يوفّر النقل عند إعادة الزيارة
  const etag = obj.httpEtag;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", etag);
  h.set("cache-control", "public, max-age=31536000, immutable");
  h.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers: h });
}
