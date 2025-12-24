const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  createComplaint: (payload) => ipcRenderer.invoke("complaint:create", payload),
  listByMonth: (params) => ipcRenderer.invoke("complaint:listByMonth", params),
  updateStatus: (params) => ipcRenderer.invoke("complaint:updateStatus", params),
  exportCsv: (params) => ipcRenderer.invoke("report:exportCsv", params)
});
