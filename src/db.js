const Database = require("better-sqlite3");

let db;

const PENDING = "Pending";
const COMPLETED = "Completed";

function sanitizeToken(s) {
  s = (s || "").trim().toUpperCase();
  s = s.replaceAll("/", "-");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[^A-Z0-9\-]/g, "");
  return s || "NA";
}
function yyyymmdd(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function dbInit(dbPath) {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_no TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      location TEXT NOT NULL,
      department TEXT NOT NULL,
      product TEXT NOT NULL,
      serial_no TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      details TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_created ON complaints(created_at);
    CREATE INDEX IF NOT EXISTS idx_status ON complaints(status);
  `);
}

function nextSequence(locToken, deptToken, day) {
  const prefix = `JIPL/${locToken}/${day}/${deptToken}/`;
  const row = db
    .prepare(`SELECT complaint_no FROM complaints WHERE complaint_no LIKE ? ORDER BY complaint_no DESC LIMIT 1`)
    .get(prefix + "%");

  if (!row) return 1;
  const last = row.complaint_no;
  const seq = parseInt(last.split("/").pop(), 10);
  return Number.isFinite(seq) ? seq + 1 : 1;
}

function createComplaint(payload) {
  const now = new Date();
  const day = yyyymmdd(now);
  const locToken = sanitizeToken(payload.location);
  const deptToken = sanitizeToken(payload.department);

  const seq = nextSequence(locToken, deptToken, day);
  const complaintNo = `JIPL/${locToken}/${day}/${deptToken}/${String(seq).padStart(4, "0")}`;

  const stmt = db.prepare(`
    INSERT INTO complaints
    (complaint_no, created_at, name, mobile, location, department, product, serial_no, status, completed_at, details)
    VALUES
    (@complaint_no, @created_at, @name, @mobile, @location, @department, @product, @serial_no, @status, @completed_at, @details)
  `);

  stmt.run({
    complaint_no: complaintNo,
    created_at: now.toISOString().slice(0, 19).replace("T", " "),
    name: payload.name.trim(),
    mobile: payload.mobile.trim(),
    location: payload.location.trim(),
    department: payload.department.trim(),
    product: payload.product.trim(),
    serial_no: payload.serial_no.trim(),
    status: PENDING,
    completed_at: null,
    details: (payload.details || "").trim()
  });

  return { complaint_no: complaintNo };
}

function listComplaints(filters) {
  const status = filters?.status || "All";
  const from = filters?.from || null; // "YYYY-MM-DD"
  const to = filters?.to || null;     // "YYYY-MM-DD"
  const search = (filters?.search || "").trim();

  const where = [];
  const params = {};

  if (status === PENDING || status === COMPLETED) {
    where.push("status = @status");
    params.status = status;
  }
  if (from) {
    where.push("date(created_at) >= date(@from)");
    params.from = from;
  }
  if (to) {
    where.push("date(created_at) <= date(@to)");
    params.to = to;
  }
  if (search) {
    where.push(`(
      complaint_no LIKE @s OR name LIKE @s OR mobile LIKE @s OR location LIKE @s OR
      department LIKE @s OR product LIKE @s OR serial_no LIKE @s
    )`);
    params.s = `%${search}%`;
  }

  const sql = `
    SELECT complaint_no, created_at, name, mobile, location, department, product, serial_no, status, completed_at, details
    FROM complaints
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY datetime(created_at) DESC
  `;

  return db.prepare(sql).all(params);
}

function updateComplaint(payload) {
  const completedAt = payload.status === COMPLETED
    ? (payload.completed_at || new Date().toISOString().slice(0, 19).replace("T", " "))
    : null;

  db.prepare(`
    UPDATE complaints SET
      name=@name, mobile=@mobile, location=@location, department=@department,
      product=@product, serial_no=@serial_no, status=@status, completed_at=@completed_at, details=@details
    WHERE complaint_no=@complaint_no
  `).run({
    complaint_no: payload.complaint_no,
    name: payload.name.trim(),
    mobile: payload.mobile.trim(),
    location: payload.location.trim(),
    department: payload.department.trim(),
    product: payload.product.trim(),
    serial_no: payload.serial_no.trim(),
    status: payload.status,
    completed_at: completedAt,
    details: (payload.details || "").trim()
  });

  return { ok: true };
}

function monthlyReport({ year, month, status = "All" }) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1); // exclusive

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const params = { from: fromStr, to: toStr };
  const statusClause = (status === PENDING || status === COMPLETED) ? "AND status=@status" : "";
  if (statusClause) params.status = status;

  const items = db.prepare(`
    SELECT complaint_no, created_at, name, mobile, location, department, product, serial_no, status, completed_at, details
    FROM complaints
    WHERE date(created_at) >= date(@from)
      AND date(created_at) <  date(@to)
      ${statusClause}
    ORDER BY datetime(created_at) DESC
  `).all(params);

  const pending = items.filter(x => x.status === PENDING).length;
  const completed = items.filter(x => x.status === COMPLETED).length;
  return { pending, completed, items };
}

module.exports = { dbInit, createComplaint, listComplaints, updateComplaint, monthlyReport };
