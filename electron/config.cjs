const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const defaultsPath = () => {
  const packaged = path.join(process.resourcesPath || "", "config.json");
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "..", "config.json");
};

const userConfigPath = () => path.join(app.getPath("userData"), "config.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function loadConfig() {
  const defaults = readJson(defaultsPath()) || {};
  const user = readJson(userConfigPath());
  if (!user) return defaults;
  return {
    ...defaults,
    ...user,
    selectors: { ...(defaults.selectors || {}), ...(user.selectors || {}) },
    excelColumns: { ...(defaults.excelColumns || {}), ...(user.excelColumns || {}) },
    carToResource: { ...(defaults.carToResource || {}), ...(user.carToResource || {}) },
    timeouts: { ...(defaults.timeouts || {}), ...(user.timeouts || {}) },
  };
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(userConfigPath()), { recursive: true });
  fs.writeFileSync(userConfigPath(), JSON.stringify(config, null, 2), "utf8");
  return loadConfig();
}

function resetConfig() {
  try {
    fs.unlinkSync(userConfigPath());
  } catch {
    /* ignore */
  }
  return loadConfig();
}

module.exports = { loadConfig, saveConfig, resetConfig, userConfigPath };
