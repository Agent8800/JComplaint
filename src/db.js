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
      department_code TEXT,
      product TEXT NOT NULL,
      serial_number TEXT NOT NULL,
      problem TEXT,

      status TEXT NOT NULL CHECK(status IN ('Pending','Complete')),
      created_at TEXT NOT NULL,
      completed_at TEXT,

      date_key TEXT NOT NULL,      -- YYYYMMDD
      month_key TEXT NOT NULL,     -- YYYYMM
      seq INTEGER NOT NULL         -- per location_code + department_code + date_key
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_month ON complaints(month_key);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_locdeptdate ON complaints(location_code, department_code, date_key);
  `);

  // Migrations for older DBs
  const cols = db.prepare("PRAGMA table_info(complaints)").all().map(r => r.name);

  if (!cols.includes("department_code")) {
    db.exec(`ALTER TABLE complaints ADD COLUMN department_code TEXT;`);
  }
  if (!cols.includes("problem")) {
    db.exec(`ALTER TABLE complaints ADD COLUMN problem TEXT;`);
  }

  db.exec(`
    UPDATE complaints
    SET department_code = UPPER(REPLACE(REPLACE(TRIM(department), ' ', ''), '/', ''))
    WHERE department_code IS NULL OR TRIM(department_code) = '';
  `);
}

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

function toCode(value, fallback) {
  const cleaned = (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned.length ? cleaned.slice(0, 12) : fallback;
}

function validateCreate(payload) {
  const required = ["name", "mobile", "location", "department", "product", "serial_number", "problem"];
  for (const k of required) {
    if (!payload[k] || String(payload[k]).trim().length === 0) return `Missing: ${k}`;
  }
  const mobile = String(payload.mobile).replace(/\s+/g, "");
  if (!/^[0-9]{7,15}$/.test(mobile)) return "Mobile must be 7–15 digits";
  return null;
}

function validateEdit(payload) {
  if (!payload.id) return "Missing id";
  if (payload.mobile) {
    const mobile = String(payload.mobile).replace(/\s+/g, "");
    if (!/^[0-9]{7,15}$/.test(mobile)) return "Mobile must be 7–15 digits";
  }
  if (payload.status && !["Pending", "Complete"].includes(payload.status)) return "Invalid status";
  if (payload.problem != null && String(payload.problem).trim().length === 0) return "Problem cannot be empty";
  return null;
}

function nextSeq({ location_code, department_code, date_key }) {
  const row = db.prepare(`
    SELECT MAX(seq) AS maxSeq
    FROM complaints
    WHERE location_code = ? AND department_code = ? AND date_key = ?
  `).get(location_code, department_code, date_key);

  const maxSeq = row?.maxSeq || 0;
  return maxSeq + 1;
}

// REQUIRED FORMAT: JIPL/LOCATION/YYYYMMDD/DEPARTMENT/0001
function buildComplaintNo({ location_code, date_key, department_code, seq }) {
  return `JIPL/${location_code}/${date_key}/${department_code}/${pad(seq, 4)}`;
}

function createComplaint(payload) {
  const err = validateCreate(payload);
  if (err) return { ok: false, message: err };

  const created = new Date();
  const date_key = dateKeyYYYYMMDD(created);
  const month_key = monthKeyYYYYMM(created);

  const location_code = toCode(payload.location, "LOC");
  const department_code = toCode(payload.department, "DEPT");

  const seq = nextSeq({ location_code, department_code, date_key });
  const complaint_no = buildComplaintNo({ location_code, date_key, department_code, seq });

  const stmt = db.prepare(`
    INSERT INTO complaints
      (complaint_no, name, mobile, location, location_code, department, department_code, product, serial_number, problem,
       status, created_at, completed_at, date_key, month_key, seq)
    VALUES
      (@complaint_no, @name, @mobile, @location, @location_code, @department, @department_code, @product, @serial_number, @problem,
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
      department_code,
      product: String(payload.product).trim(),
      serial_number: String(payload.serial_number).trim(),
      problem: String(payload.problem).trim(),
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
    const code = toCode(location, "LOC");
    where.push("location_code = ?");
    params.push(code);
  }

  const rows = db.prepare(`
    SELECT id, complaint_no, name, mobile, location, department, product, serial_number, problem,
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

// Edit complaint (complaint_no / location / department stay locked)
function updateComplaint(payload) {
  const err = validateEdit(payload);
  if (err) return { ok: false, message: err };

  const current = db.prepare(`SELECT * FROM complaints WHERE id = ?`).get(payload.id);
  if (!current) return { ok: false, message: "Not found" };

  const nextStatus = payload.status ?? current.status;
  const completed_at = nextStatus === "Complete" ? (current.completed_at || nowIso()) : null;

  const info = db.prepare(`
    UPDATE complaints
    SET
      name = ?,
      mobile = ?,
      product = ?,
      serial_number = ?,
      problem = ?,
      status = ?,
      completed_at = ?
    WHERE id = ?
  `).run(
    String(payload.name ?? current.name).trim(),
    String(payload.mobile ?? current.mobile).replace(/\s+/g, ""),
    String(payload.product ?? current.product).trim(),
    String(payload.serial_number ?? current.serial_number).trim(),
    String(payload.problem ?? current.problem ?? "").trim(),
    nextStatus,
    completed_at,
    payload.id
  );

  return { ok: info.changes === 1 };
}

module.exports = {
  initDb,
  createComplaint,
  listComplaintsByMonth,
  updateStatus,
  updateComplaint
};
