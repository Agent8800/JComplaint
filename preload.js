const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  createComplaint: (payload) => ipcRenderer.invoke("complaint:create", payload),
  listComplaints: (filters) => ipcRenderer.invoke("complaint:list", filters),
  updateComplaint: (payload) => ipcRenderer.invoke("complaint:update", payload),
  monthlyReport: (args) => ipcRenderer.invoke("report:monthly", args),
  exportExcel: (args) => ipcRenderer.invoke("export:excel", args),
  exportPdf: (args) => ipcRenderer.invoke("export:pdf", args)
});
