const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const file = () => path.join(app.getPath("userData"), "checkpoint.json");

const keyOf = (c) => `${c.phone || ""}|${c.idCard || ""}|${(c.fullName || "").toLowerCase()}`;

function load() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return { completed: {} };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2), "utf8");
}

function isCompleted(customer) {
  return Boolean(load().completed[keyOf(customer)]);
}

function markCompleted(customer) {
  const data = load();
  data.completed[keyOf(customer)] = { at: new Date().toISOString(), name: customer.fullName };
  save(data);
}

function reset() {
  save({ completed: {} });
}

function completedKeys() {
  return Object.keys(load().completed);
}

module.exports = { isCompleted, markCompleted, reset, completedKeys, keyOf };
