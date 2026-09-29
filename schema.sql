-- واجهة جو — قاعدة بيانات العقارات
-- التشغيل:  npx wrangler d1 execute wajha-properties --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS properties (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ref           TEXT    NOT NULL UNIQUE,          -- WJ-001 — يُرسل مع رسالة الواتساب
  type          TEXT    NOT NULL,                 -- land | villa | apartment
  status        TEXT    NOT NULL DEFAULT 'available', -- available | reserved | sold
  published     INTEGER NOT NULL DEFAULT 0,       -- 0 = مسودة، لا تظهر للزوار

  title_ar      TEXT    NOT NULL,
  title_en      TEXT,
  city          TEXT    NOT NULL DEFAULT 'عمّان',
  area_name     TEXT    NOT NULL,                 -- المنطقة: دابوق، خلدا، ...

  size_m2       INTEGER,                          -- مساحة البناء أو الأرض
  land_m2       INTEGER,                          -- مساحة الأرض للفلل
  bedrooms      INTEGER,
  bathrooms     INTEGER,
  floor_no      INTEGER,
  age_years     INTEGER,

  -- السعر مخزَّن دائماً، ويظهر فقط إذا show_price = 1
  price         INTEGER,
  currency      TEXT    NOT NULL DEFAULT 'JOD',
  show_price    INTEGER NOT NULL DEFAULT 0,

  description_ar TEXT,
  description_en TEXT,
  features      TEXT    NOT NULL DEFAULT '[]',    -- JSON: ["مصعد","تدفئة"]

  sort_order    INTEGER NOT NULL DEFAULT 0,       -- الأعلى يظهر أولاً
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT
);

CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  key         TEXT    NOT NULL,                   -- مفتاح الملف في R2
  width       INTEGER,
  height      INTEGER,
  position    INTEGER NOT NULL DEFAULT 0,         -- 0 = الصورة الرئيسية
  alt         TEXT
);

-- الاستعلام الشائع: العقارات المنشورة، مفلترة بالنوع والمنطقة
CREATE INDEX IF NOT EXISTS idx_props_live
  ON properties (published, status, type, area_name, sort_order DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_images_prop ON images (property_id, position);

-- سجل الاستفسارات: يُكتب عند ضغط زر الواتساب، ليُعرف أي عقار يولّد طلبات
CREATE TABLE IF NOT EXISTS enquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  ref         TEXT,
  source      TEXT,                               -- whatsapp | email
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enq_prop ON enquiries (property_id, created_at DESC);
