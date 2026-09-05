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

// Everything is read as text (raw: false) so leading zeros and long digit
// strings (phone, CCCD) are never rounded or truncated.
function readCustomers(filePath, columnMap) {
  const wb = XLSX.readFile(filePath, { cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rows.length) return { customers: [], headers: [] };

  const headers = Object.keys(rows[0]);
  const map = {
    fullName: pickColumn(rows[0], columnMap.fullName, ["họ và tên", "họ tên", "ho ten", "name"]),
    phone: pickColumn(rows[0], columnMap.phone, ["số điện thoại", "sđt", "sdt", "phone"]),
    idCard: pickColumn(rows[0], columnMap.idCard, ["cccd/gplx", "cccd", "gplx", "cmnd"]),
    carModel: pickColumn(rows[0], columnMap.carModel, ["dòng xe lái thử", "dòng xe", "dong xe", "xe"]),
  };

  const clean = (v) => String(v ?? "").trim();
  const digits = (v) => clean(v).replace(/[^\d]/g, "");

  const customers = rows
    .map((r, i) => ({
      index: i + 1,
      fullName: clean(map.fullName ? r[map.fullName] : ""),
      phone: map.phone ? digits(r[map.phone]) : "",
      idCard: map.idCard ? clean(r[map.idCard]) : "",
      carModel: clean(map.carModel ? r[map.carModel] : "").toUpperCase(),
      status: "pending",
      message: "",
    }))
    .filter((c) => c.fullName || c.phone);

  customers.forEach((c, i) => (c.index = i + 1));
  return { customers, headers, map };
}

module.exports = { readCustomers };
