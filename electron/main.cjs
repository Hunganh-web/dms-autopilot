const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { loadConfig, saveConfig, resetConfig, userConfigPath } = require("./config.cjs");
const { readCustomers } = require("./excel.cjs");
const checkpoint = require("./checkpoint.cjs");
const { Runner } = require("./automation.cjs");

let win = null;
let runner = null;

const emit = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(`dms:${channel}`, payload);
};

function getRunner() {
  if (!runner) runner = new Runner(emit);
  return runner;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    title: "DMS Auto Tool",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist-electron", "renderer", "index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await runner?.closeBrowser().catch(() => {});
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:save", (_e, config) => saveConfig(config));
ipcMain.handle("config:reset", () => resetConfig());

ipcMain.handle("excel:pick", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Chọn file Excel danh sách khách hàng",
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xls", "xlsm"] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const config = loadConfig();
  const { customers, headers } = readCustomers(filePath, config.excelColumns);
  const completed = new Set(checkpoint.completedKeys());
  customers.forEach((c) => {
    if (completed.has(checkpoint.keyOf(c))) {
      c.status = "success";
      c.message = "Đã hoàn thành trước đó";
    }
  });
  return { filePath, fileName: path.basename(filePath), customers, headers };
});

ipcMain.handle("browser:open", async () => {
  await getRunner().openBrowser(loadConfig());
  return true;
});

ipcMain.handle("run:start", async (_e, customers) => {
  getRunner().run(customers, loadConfig()).catch((err) => emit("log", { message: String(err.message || err), level: "error" }));
  return true;
});

ipcMain.handle("run:test", async (_e, customers) => {
  getRunner()
    .run(customers, loadConfig(), { testOnly: true })
    .catch((err) => emit("log", { message: String(err.message || err), level: "error" }));
  return true;
});

ipcMain.handle("run:pause", () => (getRunner().pause(), true));
ipcMain.handle("run:resume", () => (getRunner().resume(), true));
ipcMain.handle("run:stop", () => (getRunner().stop(), true));
ipcMain.handle("checkpoint:reset", () => (checkpoint.reset(), true));
ipcMain.handle("checkpoint:count", () => checkpoint.completedKeys().length);
ipcMain.handle("config:path", () => userConfigPath());
