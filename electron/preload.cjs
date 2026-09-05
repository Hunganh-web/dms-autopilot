const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dms", {
  pickExcel: () => ipcRenderer.invoke("excel:pick"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  resetConfig: () => ipcRenderer.invoke("config:reset"),
  openDms: () => ipcRenderer.invoke("browser:open"),
  start: (customers) => ipcRenderer.invoke("run:start", customers),
  testOne: (customers) => ipcRenderer.invoke("run:test", customers),
  pause: () => ipcRenderer.invoke("run:pause"),
  resume: () => ipcRenderer.invoke("run:resume"),
  stop: () => ipcRenderer.invoke("run:stop"),
  resetCheckpoint: () => ipcRenderer.invoke("checkpoint:reset"),
  checkpointCount: () => ipcRenderer.invoke("checkpoint:count"),
  on: (channel, handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on(`dms:${channel}`, listener);
    return () => ipcRenderer.removeListener(`dms:${channel}`, listener);
  },
});
