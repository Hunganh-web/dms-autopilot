const path = require("path");
const { app } = require("electron");
const checkpoint = require("./checkpoint.cjs");

let chromium = null;
function getChromium() {
  if (!chromium) chromium = require("playwright").chromium;
  return chromium;
}

const profileDir = () => path.join(app.getPath("userData"), "dms-profile");

class Runner {
  constructor(emit) {
    this.emit = emit;
    this.context = null;
    this.page = null;
    this.paused = false;
    this.stopped = false;
    this.running = false;
  }

  log(message, level = "info") {
    this.emit("log", { message, level, at: new Date().toISOString() });
  }

  async openBrowser(config) {
    if (this.context) {
      await this.page?.bringToFront().catch(() => {});
      return;
    }
    const launch = async (channel) =>
      getChromium().launchPersistentContext(profileDir(), {
        headless: false,
        channel: channel || undefined,
        viewport: null,
        args: ["--start-maximized"],
      });

    try {
      this.context = await launch(config.browserChannel || "chrome");
    } catch {
      this.log("Không tìm thấy Chrome, dùng Chromium của Playwright.", "warn");
      this.context = await launch(null);
    }

    this.context.on("close", () => {
      this.context = null;
      this.page = null;
      this.emit("browser", { open: false });
    });

    this.page = this.context.pages()[0] || (await this.context.newPage());
    await this.page.goto(config.dmsUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    this.emit("browser", { open: true });
    this.log("Đã mở trình duyệt DMS. Vui lòng đăng nhập thủ công nếu chưa đăng nhập.");
  }

  async closeBrowser() {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
  }

  async waitIfPaused() {
    while (this.paused && !this.stopped) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  async fill(selector, value, timeout) {
    if (!selector || !value) return;
    const el = this.page.locator(selector).first();
    await el.waitFor({ state: "visible", timeout });
    await el.click();
    await el.fill("");
    await el.type(String(value), { delay: 25 });
  }

  async selectOption(triggerSelector, optionTemplate, value, timeout) {
    if (!triggerSelector || !value) return;
    const trigger = this.page.locator(triggerSelector).first();
    await trigger.waitFor({ state: "visible", timeout });
    const tag = await trigger.evaluate((n) => n.tagName.toLowerCase()).catch(() => "");
    if (tag === "select") {
      await trigger.selectOption({ label: String(value) }).catch(async () => {
        await trigger.selectOption(String(value));
      });
      return;
    }
    await trigger.click();
    const option = this.page
      .locator((optionTemplate || "").replace("{value}", String(value)))
      .first();
    await option.waitFor({ state: "visible", timeout });
    await option.click();
  }

  async openNewForm(config) {
    const s = config.selectors;
    if (config.newFormUrl) {
      await this.page.goto(config.newFormUrl, { waitUntil: "domcontentloaded" });
    } else if (config.openNewFormSelector) {
      const btn = this.page.locator(config.openNewFormSelector).first();
      await btn.waitFor({ state: "visible", timeout: config.timeouts.action });
      await btn.click();
    }
    await this.page
      .locator(s.formOpen || s.fullName)
      .first()
      .waitFor({ state: "visible", timeout: config.timeouts.action });
  }

  // Success is decided only by real page state, never by a fixed delay.
  async formIsClosed(config) {
    const s = config.selectors;
    if (s.formOpen) {
      const openCount = await this.page.locator(s.formOpen).count().catch(() => 0);
      if (openCount === 0) return true;
      const visible = await this.page
        .locator(s.formOpen)
        .first()
        .isVisible()
        .catch(() => false);
      if (!visible) return true;
    }
    if (s.formClosed) {
      const listVisible = await this.page
        .locator(s.formClosed)
        .first()
        .isVisible()
        .catch(() => false);
      if (listVisible && !s.formOpen) return true;
    }
    return false;
  }

  async waitFormClosed(config) {
    const deadline = Date.now() + config.timeouts.formClose;
    while (Date.now() < deadline) {
      if (await this.formIsClosed(config)) return true;
      const err = await this.readError(config);
      if (err) return false;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  async readError(config) {
    const sel = config.selectors.errorMessage;
    if (!sel) return "";
    const loc = this.page.locator(sel).first();
    if (!(await loc.isVisible().catch(() => false))) return "";
    return (await loc.innerText().catch(() => "")).trim();
  }

  async processCustomer(customer, config) {
    const s = config.selectors;
    const t = config.timeouts;
    const resource = config.carToResource[customer.carModel] || "";

    await this.openNewForm(config);
    await this.fill(s.fullName, customer.fullName, t.action);
    await this.fill(s.phone, customer.phone, t.action);
    await this.fill(s.idCard, customer.idCard, t.action);
    await this.selectOption(s.carModel, s.carModelOption, customer.carModel, t.action);
    if (resource) {
      await this.selectOption(s.resource, s.resourceOption, resource, t.action);
    } else {
      this.log(`Không có mapping nguồn lực cho dòng xe "${customer.carModel}".`, "warn");
    }

    // Attempt 1 of maximum 2 "Lưu & đóng" clicks.
    await this.page.locator(s.saveAndClose).first().click({ timeout: t.action });
    if (await this.waitFormClosed(config)) return { ok: true, message: "Lưu thành công (lần 1)" };

    let err = await this.readError(config);
    if (err) return { ok: false, message: `Lỗi từ DMS: ${err}` };

    this.log("Form vẫn mở, chờ giao diện ổn định rồi thử Lưu & đóng lần 2.", "warn");
    await this.page
      .waitForLoadState("networkidle", { timeout: t.stabilize })
      .catch(() => {});
    await this.page.locator(s.saveAndClose).first().waitFor({ state: "visible", timeout: t.action });
    await this.page.locator(s.saveAndClose).first().click({ timeout: t.action });
    if (await this.waitFormClosed(config)) return { ok: true, message: "Lưu thành công (lần 2)" };

    err = await this.readError(config);
    return { ok: false, message: err ? `Lỗi từ DMS: ${err}` : "Form không đóng sau 2 lần Lưu & đóng" };
  }

  async run(customers, config, { testOnly = false } = {}) {
    if (this.running) throw new Error("Automation đang chạy.");
    this.running = true;
    this.stopped = false;
    this.paused = false;
    this.emit("state", { running: true, paused: false });

    try {
      await this.openBrowser(config);
      const queue = testOnly ? customers.slice(0, 1) : customers;

      for (const customer of queue) {
        if (this.stopped) {
          this.log("Đã dừng theo yêu cầu.", "warn");
          break;
        }
        await this.waitIfPaused();
        if (this.stopped) break;

        if (!testOnly && checkpoint.isCompleted(customer)) {
          this.emit("customer", { index: customer.index, status: "success", message: "Đã hoàn thành trước đó" });
          this.log(`#${customer.index} ${customer.fullName}: bỏ qua (đã thành công trước đó).`);
          continue;
        }

        this.emit("customer", { index: customer.index, status: "processing", message: "" });
        this.log(`#${customer.index} ${customer.fullName} - bắt đầu nhập liệu.`);

        try {
          const result = await this.processCustomer(customer, config);
          if (result.ok) {
            if (!testOnly) checkpoint.markCompleted(customer);
            this.emit("customer", { index: customer.index, status: "success", message: result.message });
            this.log(`#${customer.index} ${customer.fullName}: THÀNH CÔNG - ${result.message}`, "success");
          } else {
            this.emit("customer", { index: customer.index, status: "error", message: result.message });
            this.log(`#${customer.index} ${customer.fullName}: LỖI - ${result.message}. Dừng automation.`, "error");
            break;
          }
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          this.emit("customer", { index: customer.index, status: "error", message: msg });
          this.log(`#${customer.index} ${customer.fullName}: LỖI NGHIÊM TRỌNG - ${msg}. Dừng automation.`, "error");
          break;
        }
      }
    } finally {
      this.running = false;
      this.paused = false;
      this.emit("state", { running: false, paused: false });
      this.log("Kết thúc phiên automation.");
    }
  }

  pause() {
    if (this.running) {
      this.paused = true;
      this.emit("state", { running: true, paused: true });
      this.log("Đã tạm dừng.", "warn");
    }
  }

  resume() {
    if (this.running) {
      this.paused = false;
      this.emit("state", { running: true, paused: false });
      this.log("Tiếp tục chạy.");
    }
  }

  stop() {
    if (this.running) {
      this.stopped = true;
      this.paused = false;
      this.log("Yêu cầu dừng...", "warn");
    }
  }
}

module.exports = { Runner, profileDir };
