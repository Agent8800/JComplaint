const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const { db, initDb, createComplaint, listComplaintsByMonth, updateStatus, exportMonthToCsv } = require("./src/db");

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: "#0b1020",
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

// IPC
ipcMain.handle("complaint:create", async (_event, payload) => {
  return createComplaint(payload);
});

ipcMain.handle("complaint:listByMonth", async (_event, { monthYYYYMM, status, location }) => {
  return listComplaintsByMonth({ monthYYYYMM, status, location });
});

ipcMain.handle("complaint:updateStatus", async (_event, { id, status }) => {
  return updateStatus({ id, status });
});

ipcMain.handle("report:exportCsv", async (_event, { monthYYYYMM, status, location }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export Monthly Report (CSV)",
    defaultPath: `complaints_${monthYYYYMM}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (canceled || !filePath) return { ok: false, message: "Canceled" };

  const csv = exportMonthToCsv({ monthYYYYMM, status, location });
  fs.writeFileSync(filePath, csv, "utf-8");
  return { ok: true, filePath };
});
