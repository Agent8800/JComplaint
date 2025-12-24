const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  createComplaint: (payload) => ipcRenderer.invoke("complaint:create", payload),
  listByMonth: (params) => ipcRenderer.invoke("complaint:listByMonth", params),
  updateStatus: (params) => ipcRenderer.invoke("complaint:updateStatus", params),
  updateComplaint: (payload) => ipcRenderer.invoke("complaint:update", payload),

  exportXlsx: (params) => ipcRenderer.invoke("report:exportXlsx", params),
  exportPdf: (params) => ipcRenderer.invoke("report:exportPdf", params)
});
