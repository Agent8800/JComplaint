const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const {
  initDb,
  createComplaint,
  listComplaintsByMonth,
  updateStatus,
  updateComplaint
} = require("./src/db");

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    backgroundColor: "#f6f8fc",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "src", "index.html"));
}

app.whenReady().then(() => {
  initDb(app.getPath("userData"));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------- IPC ----------------
ipcMain.handle("complaint:create", async (_event, payload) => {
  return createComplaint(payload);
});

ipcMain.handle("complaint:listByMonth", async (_event, { monthYYYYMM, status, location }) => {
  return listComplaintsByMonth({ monthYYYYMM, status, location });
});

ipcMain.handle("complaint:updateStatus", async (_event, { id, status }) => {
  return updateStatus({ id, status });
});

ipcMain.handle("complaint:update", async (_event, payload) => {
  return updateComplaint(payload);
});

// ---------------- EXPORT EXCEL ----------------
ipcMain.handle("report:exportXlsx", async (_event, { monthYYYYMM, status, location }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export Monthly Report (Excel)",
      defaultPath: `complaints_${monthYYYYMM}.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }]
    });
    if (canceled || !filePath) return { ok: false, message: "Canceled" };

    const res = listComplaintsByMonth({ monthYYYYMM, status, location });
    if (!res.ok) return res;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Complaint Register";
    const ws = wb.addWorksheet(`Report ${monthYYYYMM}`);

    ws.columns = [
      { header: "Complaint No", key: "complaint_no", width: 30 },
      { header: "Name", key: "name", width: 18 },
      { header: "Mobile", key: "mobile", width: 14 },
      { header: "Location", key: "location", width: 14 },
      { header: "Department", key: "department", width: 16 },
      { header: "Product", key: "product", width: 16 },
      { header: "Serial Number", key: "serial_number", width: 18 },
      { header: "Problem", key: "problem", width: 42 },
      { header: "Status", key: "status", width: 12 },
      { header: "Created At", key: "created_at", width: 22 },
      { header: "Completed At", key: "completed_at", width: 22 }
    ];

    ws.insertRow(1, [
      `Month: ${monthYYYYMM} | Total: ${res.summary.total} | Pending: ${res.summary.pending} | Complete: ${res.summary.complete}`
    ]);
    ws.mergeCells("A1:K1");
    ws.getRow(1).font = { bold: true };

    ws.getRow(2).font = { bold: true };
    ws.autoFilter = "A2:K2";

    for (const r of res.rows) {
      ws.addRow({
        complaint_no: r.complaint_no,
        name: r.name,
        mobile: r.mobile,
        location: r.location,
        department: r.department,
        product: r.product,
        serial_number: r.serial_number,
        problem: r.problem || "",
        status: r.status,
        created_at: r.created_at,
        completed_at: r.completed_at || ""
      });
    }

    await wb.xlsx.writeFile(filePath);
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, message: `Excel export error: ${e.message}` };
  }
});

// ---------------- EXPORT PDF (A4 HORIZONTAL / LANDSCAPE) ----------------
ipcMain.handle("report:exportPdf", async (_event, { monthYYYYMM, status, location }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export Monthly Report (PDF - A4 Horizontal)",
      defaultPath: `complaints_${monthYYYYMM}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (canceled || !filePath) return { ok: false, message: "Canceled" };

    const res = listComplaintsByMonth({ monthYYYYMM, status, location });
    if (!res.ok) return res;

    // A4 landscape width = 842pt. With margin 24 left/right => available width = 842 - 48 = 794pt
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape", // HORIZONTAL
      margin: 24
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const filterText = [
      `Month: ${monthYYYYMM}`,
      status ? `Status: ${status}` : "Status: All",
      location && String(location).trim().length ? `Location: ${location}` : "Location: All"
    ].join("   |   ");

    doc.fillColor("#111").font("Helvetica-Bold").fontSize(16).text("Monthly Complaint Report");
    doc.moveDown(0.2);
    doc.fillColor("#334155").font("Helvetica").fontSize(10).text(filterText);
    doc.fillColor("#334155").fontSize(10).text(
      `Total: ${res.summary.total}   Pending: ${res.summary.pending}   Complete: ${res.summary.complete}`
    );
    doc.moveDown(0.8);

    // EXACT widths sum = 794 (fits A4 landscape with margin 24)
    const cols = [
      { label: "Complaint No", w: 140 },
      { label: "Name", w: 70 },
      { label: "Mobile", w: 70 },
      { label: "Location", w: 60 },
      { label: "Department", w: 65 },
      { label: "Product", w: 70 },
      { label: "Serial", w: 70 },
      { label: "Problem", w: 200 }, // wraps (multi-line)
      { label: "Status", w: 49 }
    ];

    const startX = doc.page.margins.left;
    let y = doc.y;

    const tableWidth = cols.reduce((a, c) => a + c.w, 0);
    const bottomY = doc.page.height - doc.page.margins.bottom;

    function drawHeader() {
      const headerH = 18;

      doc.save();
      doc.fillColor("#f1f5f9").rect(startX, y, tableWidth, headerH).fill();
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111");

      let x = startX;
      for (const c of cols) {
        doc.text(c.label, x + 3, y + 4, { width: c.w - 6 });
        x += c.w;
      }

      doc.strokeColor("#cbd5e1").lineWidth(1)
        .moveTo(startX, y + headerH)
        .lineTo(startX + tableWidth, y + headerH)
        .stroke();

      y += headerH;
    }

    function ensureSpace(heightNeeded) {
      if (y + heightNeeded > bottomY) {
        doc.addPage();
        y = doc.y;
        drawHeader();
      }
    }

    function drawRow(values) {
      doc.font("Helvetica").fontSize(9).fillColor("#111");

      // Row height based on wrapped text (Problem column)
      let maxH = 0;
      for (let i = 0; i < cols.length; i++) {
        const text = values[i] == null ? "" : String(values[i]);
        const h = doc.heightOfString(text, { width: cols[i].w - 6 });
        if (h > maxH) maxH = h;
      }
      const rowH = Math.max(16, maxH + 6);

      ensureSpace(rowH);

      let x = startX;
      for (let i = 0; i < cols.length; i++) {
        const text = values[i] == null ? "" : String(values[i]);
        doc.text(text, x + 3, y + 3, { width: cols[i].w - 6 });
        x += cols[i].w;
      }

      doc.strokeColor("#e2e8f0").lineWidth(1)
        .moveTo(startX, y + rowH)
        .lineTo(startX + tableWidth, y + rowH)
        .stroke();

      y += rowH;
    }

    drawHeader();

    for (const r of res.rows) {
      drawRow([
        r.complaint_no,
        r.name,
        r.mobile,
        r.location,
        r.department,
        r.product,
        r.serial_number,
        r.problem || "",
        r.status
      ]);
    }

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, message: `PDF export error: ${e.message}` };
  }
});
