// Time helpers. Never do string maths on "HH:mm" — always go through minutes.

const TIME_RE = /^(\d{1,2})\s*[:hH.]\s*(\d{1,2})/;

function parseTime(value) {
  const m = TIME_RE.exec(String(value || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

const pad = (n) => String(n).padStart(2, "0");

function formatMinutes(total) {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

// schedulingTime = startTime + duration / 2
function calculateSchedulingTime(startTime, durationMinutes) {
  const start = parseTime(startTime);
  if (start === null) throw new Error(`Giờ bắt đầu không hợp lệ: "${startTime}"`);
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Thời lượng không hợp lệ: "${durationMinutes}"`);
  }
  const total = start + Math.round(duration / 2);
  return { time: formatMinutes(total), dayOffset: Math.floor(total / 1440) };
}

// Adds whole days to a date string without timezone drift.
function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// Dynamics VN locale shows dd/MM/yyyy.
function toDmsDate(dateStr) {
  const [y, m, d] = String(dateStr).split("-");
  if (!y || !m || !d) return String(dateStr);
  return `${pad(Number(d))}/${pad(Number(m))}/${y}`;
}

module.exports = { parseTime, formatMinutes, calculateSchedulingTime, addDays, toDmsDate };
