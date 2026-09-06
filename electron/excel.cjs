const XLSX = require("xlsx");

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function pickColumn(row, wanted, fallbacks) {
  const keys = Object.keys(row);
  const candidates = [wanted, ...(fallbacks || [])].filter(Boolean).map(norm);
  for (const c of candidates) {
    const hit = keys.find((k) => norm(k) === c);
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = keys.find((k) => norm(k).includes(c));
    if (hit) return hit;
  }
  return null;
}

const clean = (v) => String(v ?? "").trim();

// Phone / CCCD are ALWAYS strings. Excel numeric cells can surface as
// "401234567890.00" or "4.01234567890e+11" — both are repaired here, and
// leading zeros are preserved because cells are read with raw: false.
function cleanDigitString(value) {
  let s = clean(value).replace(/\u00a0/g, "").replace(/\s+/g, "");
  if (!s) return "";
  // Scientific notation from a numeric cell: restore the full integer.
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = BigInt(Math.round(n)).toString();
  }
  s = s.replace(/,/g, "");
  // Drop a trailing decimal part only when it is all zeros (Excel artefact).
  s = s.replace(/\.0+$/, "");
  return s;
}

// Keeps letters (some GPLX contain them) but strips Excel's ".00" artefact.
function cleanIdString(value) {
  const s = clean(value).replace(/\u00a0/g, "");
  if (/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s.replace(/\s/g, ""))) return cleanDigitString(s);
  return s.replace(/\.0+$/, "");
}

function cleanPhone(value) {
  return cleanDigitString(value).replace(/[^\d+]/g, "");
}

function normalizeCarModel(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function readCustomers(filePath, columnMap) {
  const wb = XLSX.readFile(filePath, { cellDates: false, cellText: true, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rows.length) return { customers: [], headers: [], map: {}, missing: Object.keys(columnMap) };

  const headers = Object.keys(rows[0]);
  const map = {
    fullName: pickColumn(rows[0], columnMap.fullName, ["họ và tên", "họ tên", "ho ten", "name"]),
    phone: pickColumn(rows[0], columnMap.phone, ["số điện thoại", "sđt", "sdt", "phone"]),
    idCard: pickColumn(rows[0], columnMap.idCard, ["cccd/gplx", "cccd", "gplx", "cmnd"]),
    carModel: pickColumn(rows[0], columnMap.carModel, ["dòng xe lái thử", "dòng xe", "dong xe", "xe"]),
  };
  const missing = Object.keys(map).filter((k) => !map[k]);

  const customers = rows
    .map((r, i) => ({
      index: i + 1,
      fullName: clean(map.fullName ? r[map.fullName] : ""),
      phone: map.phone ? cleanPhone(r[map.phone]) : "",
      idCard: map.idCard ? cleanIdString(r[map.idCard]) : "",
      carModel: normalizeCarModel(map.carModel ? r[map.carModel] : ""),
      status: "pending",
      message: "",
    }))
    .filter((c) => c.fullName || c.phone);

  customers.forEach((c, i) => (c.index = i + 1));
  return { customers, headers, map, missing };
}

module.exports = { readCustomers, cleanDigitString, cleanIdString, cleanPhone, normalizeCarModel };
