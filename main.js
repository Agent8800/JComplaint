const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const os = require("os");

const { dbInit, createComplaint, listComplaints, updateComplaint, monthlyReport } = require("./src/db");
const { exportExcel, exportPdf } = require("./src/export");

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 720,
    backgroundColor: "#F6F7FB",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    },
    icon: path.join(__dirname, "assets", "jipl.ico")
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath("userData"), "complaints.db");
  dbInit(dbPath);
  createWindow();
});

ipcMain.handle("complaint:create", (e, payload) => createComplaint(payload));
ipcMain.handle("complaint:list", (e, filters) => listComplaints(filters));
ipcMain.handle("complaint:update", (e, payload) => updateComplaint(payload));
ipcMain.handle("report:monthly", (e, args) => monthlyReport(args));

ipcMain.handle("export:excel", async (e, { rows, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${defaultName}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }]
  });
  if (canceled || !filePath) return { ok: false };
  await exportExcel(filePath, rows);
  return { ok: true, filePath };
});

ipcMain.handle("export:pdf", async (e, { rows, title, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${defaultName}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });
  if (canceled || !filePath) return { ok: false };
  await exportPdf(filePath, title, rows);
  return { ok: true, filePath };
});
