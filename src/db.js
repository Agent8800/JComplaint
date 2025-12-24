const path = require("path");
const Database = require("better-sqlite3");

let db;

function initDb(userDataPath) {
  const dbPath = path.join(userDataPath, "complaints.sqlite3");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_no TEXT NOT NULL UNIQUE,

      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      location TEXT NOT NULL,
      location_code TEXT NOT NULL,
      department TEXT NOT NULL,
      product TEXT NOT NULL,
      serial_number TEXT NOT NULL,

      status TEXT NOT NULL CHECK(status IN ('Pending','Complete')),
      created_at TEXT NOT NULL,
      completed_at TEXT,

      date_key TEXT NOT NULL,      -- YYYYMMDD
      month_key TEXT NOT NULL,     -- YYYYMM
      seq INTEGER NOT NULL         -- per location_code + date_key
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_month ON complaints(month_key);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_locdate ON complaints(location_code, date_key);
  `);
}

// Helpers
function pad(n, width) {
  const s = String(n);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

function nowIso() {
  return new Date().toISOString();
}

function dateKeyYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1, 2);
  const day = pad(d.getDate(), 2);
  return `${y}${m}${day}`;
}

function monthKeyYYYYMM(d = new Date()) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1, 2);
  return `${y}${m}`;
}

function toLocationCode(location) {
  const cleaned = (location || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned.length ? cleaned.slice(0, 12) : "LOC";
}

function validate(payload) {
  const required = ["name", "mobile", "location", "department", "product", "serial_number"];
  for (const k of required) {
    if (!payload[k] || String(payload[k]).trim().length === 0) {
      return `Missing: ${k}`;
    }
  }
  const mobile = String(payload.mobile).replace(/\s+/g, "");
  if (!/^[0-9]{7,15}$/.test(mobile)) return "Mobile must be 7–15 digits";
  return null;
}

function nextSeq({ location_code, date_key }) {
  const row = db
    .prepare(`SELECT MAX(seq) AS maxSeq FROM complaints WHERE location_code = ? AND date_key = ?`)
    .get(location_code, date_key);
  const maxSeq = row?.maxSeq || 0;
  return maxSeq + 1;
}

function buildComplaintNo({ date_key, location_code, seq }) {
  // As requested: JIPL/DTC + current date + /Location/ + serial
  // Example: JIPL/DTC20251224/DELHI/0001
  return `JIPL/DTC${date_key}/${location_code}/${pad(seq, 4)}`;
}

// CRUD
function createComplaint(payload) {
  const err = validate(payload);
  if (err) return { ok: false, message: err };

  const created = new Date();
  const date_key = dateKeyYYYYMMDD(created);
  const month_key = monthKeyYYYYMM(created);
  const location_code = toLocationCode(payload.location);
  const seq = nextSeq({ location_code, date_key });
  const complaint_no = buildComplaintNo({ date_key, location_code, seq });

  const stmt = db.prepare(`
    INSERT INTO complaints
      (complaint_no, name, mobile, location, location_code, department, product, serial_number,
       status, created_at, completed_at, date_key, month_key, seq)
    VALUES
      (@complaint_no, @name, @mobile, @location, @location_code, @department, @product, @serial_number,
       @status, @created_at, @completed_at, @date_key, @month_key, @seq)
  `);

  try {
    const info = stmt.run({
      complaint_no,
      name: String(payload.name).trim(),
      mobile: String(payload.mobile).replace(/\s+/g, ""),
      location: String(payload.location).trim(),
      location_code,
      department: String(payload.department).trim(),
      product: String(payload.product).trim(),
      serial_number: String(payload.serial_number).trim(),
      status: "Pending",
      created_at: nowIso(),
      completed_at: null,
      date_key,
      month_key,
      seq
    });

    return { ok: true, id: info.lastInsertRowid, complaint_no };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function listComplaintsByMonth({ monthYYYYMM, status, location }) {
  const where = ["month_key = ?"];
  const params = [monthYYYYMM];

  if (status && (status === "Pending" || status === "Complete")) {
    where.push("status = ?");
    params.push(status);
  }

  if (location && String(location).trim().length) {
    const code = toLocationCode(location);
    where.push("location_code = ?");
    params.push(code);
  }

  const rows = db.prepare(`
    SELECT id, complaint_no, name, mobile, location, department, product, serial_number,
           status, created_at, completed_at
    FROM complaints
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
  `).all(...params);

  const pending = rows.filter(r => r.status === "Pending").length;
  const complete = rows.filter(r => r.status === "Complete").length;

  return { ok: true, rows, summary: { pending, complete, total: rows.length } };
}

function updateStatus({ id, status }) {
  if (!id) return { ok: false, message: "Missing id" };
  if (!["Pending", "Complete"].includes(status)) return { ok: false, message: "Invalid status" };

  const completed_at = status === "Complete" ? nowIso() : null;

  const info = db.prepare(`
    UPDATE complaints
    SET status = ?, completed_at = ?
    WHERE id = ?
  `).run(status, completed_at, id);

  return { ok: info.changes === 1 };
}

function escapeCsv(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportMonthToCsv({ monthYYYYMM, status, location }) {
  const result = listComplaintsByMonth({ monthYYYYMM, status, location });
  if (!result.ok) return "error\n";

  const header = [
    "ComplaintNo","Name","Mobile","Location","Department","Product","SerialNumber",
    "Status","CreatedAt","CompletedAt"
  ];

  const lines = [header.join(",")];

  for (const r of result.rows) {
    lines.push([
      r.complaint_no, r.name, r.mobile, r.location, r.department, r.product, r.serial_number,
      r.status, r.created_at, r.completed_at || ""
    ].map(escapeCsv).join(","));
  }

  return lines.join("\n");
}

module.exports = {
  db: () => db,
  initDb,
  createComplaint,
  listComplaintsByMonth,
  updateStatus,
  exportMonthToCsv
};
