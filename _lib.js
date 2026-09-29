// أدوات مشتركة لكل نقاط الـAPI

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
               "cache-control": "no-store", ...extra },
  });

export const bad = (msg, status = 400) => json({ error: msg }, status);

/**
 * Cloudflare Access يتحقق من الهوية على الحافة قبل وصول الطلب إلى هنا.
 * الترويسة أدناه يضعها Access ولا يمكن تزويرها من الخارج لأن Access
 * يزيل أي نسخة يرسلها العميل. هذا فحص ثانٍ للتأكد من أن الحماية مفعّلة فعلاً:
 * لو نُشرت الدالة بدون سياسة Access، لن تصل الترويسة وسيُرفض الطلب
 * بدلاً من أن تُترك اللوحة مفتوحة للجميع.
 */
export function requireAdmin(request) {
  const email = request.headers.get("cf-access-authenticated-user-email");
  if (!email) return { ok: false, res: bad("غير مصرّح", 401) };
  return { ok: true, email };
}

const TYPES = new Set(["land", "villa", "apartment"]);
const STATUSES = new Set(["available", "reserved", "sold"]);

const int = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** ينظّف المدخلات ويُرجع كائناً آمناً للكتابة، أو رسالة خطأ. */
export function cleanProperty(b) {
  if (!TYPES.has(b.type)) return { error: "نوع العقار غير صحيح" };
  if (b.status && !STATUSES.has(b.status)) return { error: "الحالة غير صحيحة" };
  const title = (b.title_ar || "").trim();
  if (title.length < 3) return { error: "العنوان بالعربية مطلوب" };
  const area = (b.area_name || "").trim();
  if (!area) return { error: "المنطقة مطلوبة" };

  let features = [];
  try {
    const raw = Array.isArray(b.features) ? b.features : JSON.parse(b.features || "[]");
    features = raw.filter((x) => typeof x === "string").map((x) => x.trim()).slice(0, 30);
  } catch { features = []; }

  return {
    value: {
      type: b.type,
      status: b.status || "available",
      published: b.published ? 1 : 0,
      title_ar: title.slice(0, 200),
      title_en: (b.title_en || "").trim().slice(0, 200) || null,
      city: (b.city || "عمّان").trim().slice(0, 80),
      area_name: area.slice(0, 120),
      size_m2: int(b.size_m2),
      land_m2: int(b.land_m2),
      bedrooms: int(b.bedrooms),
      bathrooms: int(b.bathrooms),
      floor_no: int(b.floor_no),
      age_years: int(b.age_years),
      price: int(b.price),
      currency: (b.currency || "JOD").slice(0, 8),
      show_price: b.show_price ? 1 : 0,
      description_ar: (b.description_ar || "").trim().slice(0, 4000) || null,
      description_en: (b.description_en || "").trim().slice(0, 4000) || null,
      features: JSON.stringify(features),
      sort_order: int(b.sort_order) || 0,
    },
  };
}

/** يُخفي السعر عن الزوار ما لم يُسمح بعرضه لهذا العقار تحديداً. */
export function publicShape(row, images = []) {
  const out = { ...row, images };
  if (!row.show_price) { out.price = null; out.currency = null; }
  delete out.created_by;
  try { out.features = JSON.parse(row.features || "[]"); } catch { out.features = []; }
  return out;
}

export const nextRef = (n) => "WJ-" + String(n).padStart(3, "0");
