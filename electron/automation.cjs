const path = require("path");
const { app } = require("electron");
const checkpoint = require("./checkpoint.cjs");
const { calculateSchedulingTime, addDays, toDmsDate, parseTime, formatMinutes } = require("./time.cjs");

let chromium = null;
function getChromium() {
  if (!chromium) chromium = require("playwright").chromium;
  return chromium;
}

const profileDir = () => path.join(app.getPath("userData"), "dms-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class PageClosedError extends Error {}

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

  step(message) {
    this.log(`  → ${message}`);
  }

  /* ---------------- browser / page lifecycle ---------------- */

  pageAlive() {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  async disposeStale() {
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    this.context = null;
    this.page = null;
  }

  async openBrowser(config) {
    // A live context does NOT imply a live page — always check both.
    if (this.pageAlive()) {
      await this.page.bringToFront().catch(() => {});
      return;
    }
    if (this.context) {
      this.log("Trang đã bị đóng, khởi tạo lại trình duyệt.", "warn");
      await this.disposeStale();
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
    this.page.on("close", () => {
      this.emit("browser", { open: false });
    });
    await this.page.goto(config.dmsUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    this.emit("browser", { open: true });
    this.log("Đã mở trình duyệt DMS. Vui lòng đăng nhập thủ công nếu chưa đăng nhập.");
  }

  async ensurePage(config) {
    if (this.pageAlive()) return this.page;
    this.log("Phát hiện page/context đã đóng — đang phục hồi trình duyệt.", "warn");
    await this.disposeStale();
    await this.openBrowser(config);
    if (!this.pageAlive()) throw new PageClosedError("Không thể phục hồi trình duyệt.");
    return this.page;
  }

  assertAlive() {
    if (!this.pageAlive()) throw new PageClosedError("Trang DMS đã bị đóng giữa quá trình xử lý.");
  }

  async closeBrowser() {
    await this.disposeStale();
  }

  async waitIfPaused() {
    while (this.paused && !this.stopped) await sleep(300);
  }

  /* ---------------- low level helpers ---------------- */

  loc(selector) {
    this.assertAlive();
    return this.page.locator(selector).first();
  }

  async visible(selector, timeout) {
    const el = this.loc(selector);
    await el.waitFor({ state: "visible", timeout });
    return el;
  }

  async fillText(selector, value, timeout, label) {
    const el = await this.visible(selector, timeout);
    await el.click();
    await el.fill("");
    await el.type(String(value), { delay: 20 });
    await el.press("Tab").catch(() => {});
    const got = (await el.inputValue().catch(() => "")).trim();
    if (got !== String(value).trim()) {
      // one retry with fill(), some Dynamics controls reformat on blur
      await el.click();
      await el.fill(String(value));
      await el.press("Tab").catch(() => {});
      const again = (await el.inputValue().catch(() => "")).trim();
      if (again !== String(value).trim()) {
        throw new Error(`${label} không nhận đúng giá trị (mong đợi "${value}", nhận "${again}")`);
      }
    }
    return true;
  }

  // Dynamics lookup: type the query, press Enter, verify the selected tag.
  async fillLookup({ inputSelector, selectedSelector, query, expected, timeout, label, optionSelector }) {
    const input = await this.visible(inputSelector, timeout);
    await input.click();
    await input.fill("");
    await input.type(String(query), { delay: 40 });
    await sleep(600);
    await input.press("Enter");

    const check = async () => {
      if (!selectedSelector) return "";
      const tag = this.page.locator(selectedSelector).first();
      if (!(await tag.isVisible().catch(() => false))) return "";
      return ((await tag.getAttribute("title").catch(() => null)) || (await tag.innerText().catch(() => "")) || "").trim();
    };

    const deadline = Date.now() + timeout;
    let selected = "";
    while (Date.now() < deadline) {
      selected = await check();
      if (selected) break;
      await sleep(300);
    }

    // Fallback: only if keyboard selection did not work.
    if (!selected && optionSelector) {
      const option = this.page.locator(optionSelector).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click().catch(() => {});
        selected = await check();
      }
    }

    if (!selected) throw new Error(`Không chọn được ${label} với từ khoá "${query}"`);
    if (expected && !selected.toLowerCase().includes(String(expected).toLowerCase())) {
      throw new Error(`${label} chọn sai: "${selected}" (mong đợi chứa "${expected}")`);
    }
    return selected;
  }

  async setDateTimeField({ dateSelector, timeSelector, date, time, timeout, label }) {
    if (dateSelector && date) {
      await this.fillText(dateSelector, toDmsDate(date), timeout, `${label} - ngày`).catch(async (e) => {
        throw new Error(String(e.message || e));
      });
    }
    const el = await this.visible(timeSelector, timeout);
    await el.click();
    await el.fill("");
    await el.type(String(time), { delay: 40 });
    await sleep(400);
    await el.press("Enter").catch(() => {});
    await el.press("Tab").catch(() => {});

    const deadline = Date.now() + timeout;
    let current = "";
    while (Date.now() < deadline) {
      current = (await el.inputValue().catch(() => "")).trim();
      if (parseTime(current) !== null && formatMinutes(parseTime(current)) === formatMinutes(parseTime(time))) {
        return current;
      }
      await sleep(300);
    }
    throw new Error(`${label} không nhận ${time} (hiện tại: "${current || "trống"}")`);
  }

  async readTimeField(selector, timeout) {
    const el = await this.visible(selector, timeout);
    return (await el.inputValue().catch(() => "")).trim();
  }

  /* ---------------- workflow steps ---------------- */

  async openNewRecord(config) {
    const s = config.selectors;
    await this.ensurePage(config);
    if (config.newFormUrl) {
      await this.page.goto(config.newFormUrl, { waitUntil: "domcontentloaded" });
    } else if (config.openNewFormSelector) {
      const btn = await this.visible(config.openNewFormSelector, config.timeouts.action);
      await btn.click();
    }
    await this.visible(s.formOpen || s.fullName, config.timeouts.action);
    this.step("Form tạo mới đã mở");
  }

  async fillCustomerInfo(customer, config) {
    const s = config.selectors;
    const t = config.timeouts.action;
    await this.fillText(s.fullName, customer.fullName, t, "Họ và tên");
    this.step(`Điền họ tên: ${customer.fullName}`);
    await this.fillText(s.phone, customer.phone, t, "Số điện thoại");
    this.step(`Điền SĐT: ${customer.phone}`);
    await this.fillText(s.idCard, customer.idCard, t, "CCCD/GPLX");
    this.step(`Điền CCCD/GPLX: ${customer.idCard}`);
  }

  async fillSurveyId(config, settings) {
    const s = config.selectors;
    if (!s.surveyIdInput) throw new Error("Thiếu selector Survey ID trong cấu hình");
    const selected = await this.fillLookup({
      inputSelector: s.surveyIdInput,
      selectedSelector: s.surveyIdSelectedText,
      optionSelector: s.lookupResultItem,
      query: settings.surveyIdQuery || "te",
      expected: settings.surveyIdExpected || "",
      timeout: config.timeouts.action,
      label: "Survey ID",
    });
    this.step(`Survey ID: "${settings.surveyIdQuery}" + Enter → ${selected}`);
  }

  async fillStartDateTime(config, settings) {
    const s = config.selectors;
    await this.setDateTimeField({
      dateSelector: settings.startDate ? s.startDateInput : "",
      timeSelector: s.startTimeInput,
      date: settings.startDate,
      time: settings.startTime,
      timeout: config.timeouts.action,
      label: "Giờ bắt đầu",
    });
    if (settings.startDate) this.step(`Ngày bắt đầu: ${toDmsDate(settings.startDate)}`);
    this.step(`Giờ bắt đầu: ${settings.startTime}`);
  }

  async fillDuration(config, settings) {
    const s = config.selectors;
    if (!s.durationInput) throw new Error("Thiếu selector Khoảng thời gian trong cấu hình");
    const minutes = Number(settings.durationMinutes) || 30;
    const label = `${minutes} phút`;
    const el = await this.visible(s.durationInput, config.timeouts.action);
    const tag = await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => "");
    if (tag === "select") {
      await el.selectOption({ label }).catch(async () => el.selectOption(String(minutes)));
    } else {
      await el.click();
      await el.fill("");
      await el.type(label, { delay: 40 });
      await sleep(500);
      await el.press("Enter").catch(() => {});
      await el.press("Tab").catch(() => {});
    }
    const got = (await el.inputValue().catch(() => "")).trim();
    if (got && !got.replace(/\s/g, "").includes(String(minutes))) {
      throw new Error(`Khoảng thời gian không nhận ${label} (hiện tại: "${got}")`);
    }
    this.step(`Thời lượng: ${label}`);
  }

  async selectResource(customer, config) {
    const s = config.selectors;
    const query = config.carToResource[customer.carModel];
    if (!query) throw new Error(`Không có mapping nguồn lực cho dòng xe "${customer.carModel}"`);
    const selected = await this.fillLookup({
      inputSelector: s.resourceInput,
      selectedSelector: s.resourceSelectedText,
      optionSelector: s.lookupResultItem,
      query,
      expected: query,
      timeout: config.timeouts.action,
      label: "Nguồn lực",
    });
    this.step(`Nguồn lực: "${query}" + Enter → ${selected}`);
    return selected;
  }

  async openSchedulingTab(config) {
    const s = config.selectors;
    if (!s.schedulingTab) throw new Error("Thiếu selector tab Scheduling trong cấu hình");
    const tab = await this.visible(s.schedulingTab, config.timeouts.action);
    await tab.click();
    await this.visible(s.estimatedArrivalTimeInput, config.timeouts.action);
    this.step("Chuyển sang tab Scheduling");
  }

  async updateSchedulingTime(config, settings) {
    const s = config.selectors;
    const { time: expected, dayOffset } = calculateSchedulingTime(settings.startTime, settings.durationMinutes);
    const current = await this.readTimeField(s.estimatedArrivalTimeInput, config.timeouts.action);
    this.step(`Scheduling mặc định: ${current || "trống"}`);

    const date = settings.startDate && dayOffset ? addDays(settings.startDate, dayOffset) : settings.startDate;
    await this.setDateTimeField({
      dateSelector: date ? s.estimatedArrivalDateInput : "",
      timeSelector: s.estimatedArrivalTimeInput,
      date,
      time: expected,
      timeout: config.timeouts.action,
      label: "Scheduling (Thời gian Đến Dự tính)",
    });
    this.step(`Scheduling mới: ${expected}${dayOffset ? " (ngày kế tiếp)" : ""}`);
    return expected;
  }

  async validateForm(customer, config, expectedScheduling) {
    const s = config.selectors;
    const t = config.timeouts.action;
    const missing = [];
    const readValue = async (sel) => {
      if (!sel) return "";
      const el = this.page.locator(sel).first();
      if (!(await el.isVisible().catch(() => false))) return "";
      return (await el.inputValue().catch(() => "")).trim();
    };

    if (!(await readValue(s.fullName))) missing.push("Họ và tên");
    if (!(await readValue(s.phone))) missing.push("Số điện thoại");
    if (!(await readValue(s.idCard))) missing.push("CCCD/GPLX");
    const scheduling = await readValue(s.estimatedArrivalTimeInput);
    if (parseTime(scheduling) === null || formatMinutes(parseTime(scheduling)) !== expectedScheduling) {
      missing.push(`Scheduling (mong đợi ${expectedScheduling}, hiện tại "${scheduling}")`);
    }
    const resourceTag = s.resourceSelectedText
      ? await this.page
          .locator(s.resourceSelectedText)
          .first()
          .innerText()
          .catch(() => "")
      : "";
    if (!String(resourceTag).trim()) missing.push("Nguồn lực");
    if (missing.length) throw new Error(`Thiếu/sai dữ liệu bắt buộc: ${missing.join(", ")}`);
    void t;
    this.step("Kiểm tra dữ liệu form: hợp lệ");
  }

  /* ---------------- save & close ---------------- */

  async isFormClosed(config) {
    if (!this.pageAlive()) throw new PageClosedError("Trang DMS đã bị đóng khi đang lưu.");
    const s = config.selectors;
    if (s.formOpen) {
      const count = await this.page.locator(s.formOpen).count().catch(() => 0);
      if (count === 0) return true;
      const visible = await this.page
        .locator(s.formOpen)
        .first()
        .isVisible()
        .catch(() => false);
      if (!visible) return true;
      return false;
    }
    if (s.formClosed) {
      return await this.page
        .locator(s.formClosed)
        .first()
        .isVisible()
        .catch(() => false);
    }
    return false;
  }

  async waitForFormClosed(config, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.isFormClosed(config)) return true;
      const err = await this.readError(config);
      if (err) return false;
      await sleep(400);
    }
    return false;
  }

  async readError(config) {
    const sel = config.selectors.errorMessage;
    if (!sel || !this.pageAlive()) return "";
    const loc = this.page.locator(sel).first();
    if (!(await loc.isVisible().catch(() => false))) return "";
    return (await loc.innerText().catch(() => "")).trim();
  }

  // Maximum 2 clicks, decided by real page state — never by a fixed sleep.
  async saveAndCloseWithRetry(config) {
    const s = config.selectors;
    const t = config.timeouts;

    const clickSave = async () => {
      const btn = await this.visible(s.saveAndClose, t.action);
      await btn.click({ timeout: t.action });
    };

    await clickSave();
    this.step("Lưu & đóng lần 1");
    if (await this.waitForFormClosed(config, t.formClose)) {
      this.step("Form đã đóng");
      return "Lưu thành công (lần 1)";
    }

    const err1 = await this.readError(config);
    if (err1) throw new Error(`Lỗi từ DMS: ${err1}`);

    this.step("Form chưa đóng");
    await this.page.waitForLoadState("networkidle", { timeout: t.stabilize }).catch(() => {});
    await clickSave();
    this.step("Lưu & đóng lần 2");
    if (await this.waitForFormClosed(config, t.formClose)) {
      this.step("Form đã đóng");
      return "Lưu thành công (lần 2)";
    }

    const err2 = await this.readError(config);
    throw new Error(err2 ? `Lỗi từ DMS: ${err2}` : "Form chưa đóng sau 2 lần Lưu & đóng");
  }

  /* ---------------- per customer ---------------- */

  async processCustomer(customer, config, settings) {
    await this.ensurePage(config);
    await this.openNewRecord(config);
    await this.fillCustomerInfo(customer, config);
    await this.fillSurveyId(config, settings);
    await this.fillStartDateTime(config, settings);
    await this.fillDuration(config, settings);
    await this.selectResource(customer, config);
    await this.openSchedulingTab(config);
    const expectedScheduling = await this.updateSchedulingTime(config, settings);
    await this.validateForm(customer, config, expectedScheduling);
    return await this.saveAndCloseWithRetry(config);
  }

  /* ---------------- runner ---------------- */

  resolveSettings(config, override) {
    const base = config.run || {};
    const s = { ...base, ...(override || {}) };
    if (!s.startTime) throw new Error("Chưa chọn giờ bắt đầu.");
    if (!s.durationMinutes) s.durationMinutes = 30;
    return s;
  }

  async run(customers, config, { testOnly = false, settings: override } = {}) {
    if (this.running) throw new Error("Automation đang chạy.");
    this.running = true;
    this.stopped = false;
    this.paused = false;
    this.emit("state", { running: true, paused: false });

    try {
      const settings = this.resolveSettings(config, override);
      const { time: schedPreview } = calculateSchedulingTime(settings.startTime, settings.durationMinutes);
      this.log(
        `Cấu hình lần chạy: ngày ${settings.startDate || "(giữ mặc định của DMS)"} · giờ ${settings.startTime} · ${settings.durationMinutes} phút · Scheduling ${schedPreview}`,
      );

      await this.openBrowser(config);
      const queue = testOnly ? customers.slice(0, 1) : customers;
      const total = queue.length;
      let n = 0;

      for (const customer of queue) {
        n += 1;
        if (this.stopped) {
          this.log("Đã dừng theo yêu cầu.", "warn");
          break;
        }
        await this.waitIfPaused();
        if (this.stopped) break;

        if (!testOnly && checkpoint.isCompleted(customer)) {
          this.emit("customer", { index: customer.index, status: "success", message: "Đã hoàn thành trước đó" });
          this.log(`[${n}/${total}] ${customer.fullName}: bỏ qua (đã thành công trước đó).`);
          continue;
        }

        this.emit("customer", { index: customer.index, status: "processing", message: "Đang xử lý" });
        this.log(`[${n}/${total}] ${customer.fullName}`);

        try {
          const message = await this.processCustomer(customer, config, settings);
          if (!testOnly) checkpoint.markCompleted(customer);
          this.emit("customer", { index: customer.index, status: "success", message });
          this.log(`  → SUCCESS - ${message}`, "success");
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          this.emit("customer", { index: customer.index, status: "error", message: msg });
          this.log(`  → ERROR: ${msg}`, "error");
          if (e instanceof PageClosedError) {
            this.log("Trình duyệt/trang đã đóng — dừng automation, checkpoint được giữ nguyên.", "error");
          }
          break;
        }
      }
    } catch (e) {
      this.log(`Lỗi: ${e && e.message ? e.message : String(e)}`, "error");
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

module.exports = { Runner, profileDir, PageClosedError };
