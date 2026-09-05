import { useEffect, useMemo, useRef, useState } from "react";
import type { Config, Customer, LogEntry, Status } from "./types";
import Settings from "./Settings";

const statusLabel: Record<Status, string> = {
  pending: "Chờ",
  processing: "Đang xử lý",
  success: "Thành công",
  error: "Lỗi",
};

export default function App() {
  const [tab, setTab] = useState<"main" | "settings">("main");
  const [fileName, setFileName] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.dms.getConfig().then(setConfig);
    window.dms.checkpointCount().then(setDoneCount);
    const offLog = window.dms.on("log", (e: LogEntry) => setLogs((l) => [...l.slice(-500), e]));
    const offState = window.dms.on("state", (s: { running: boolean; paused: boolean }) => {
      setRunning(s.running);
      setPaused(s.paused);
      window.dms.checkpointCount().then(setDoneCount);
    });
    const offCustomer = window.dms.on(
      "customer",
      (u: { index: number; status: Status; message: string }) =>
        setCustomers((cs) =>
          cs.map((c) => (c.index === u.index ? { ...c, status: u.status, message: u.message } : c)),
        ),
    );
    return () => {
      offLog();
      offState();
      offCustomer();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const stats = useMemo(() => {
    const success = customers.filter((c) => c.status === "success").length;
    const error = customers.filter((c) => c.status === "error").length;
    return { total: customers.length, success, error, processed: success + error };
  }, [customers]);

  const pickFile = async () => {
    const res = await window.dms.pickExcel();
    if (!res) return;
    setFileName(res.fileName);
    setCustomers(res.customers);
    setLogs((l) => [
      ...l,
      { message: `Đã đọc ${res.customers.length} khách hàng từ ${res.fileName}`, at: new Date().toISOString() },
    ]);
  };

  const pendingList = () => customers.filter((c) => c.status !== "success");

  const start = async () => {
    setCustomers((cs) => cs.map((c) => (c.status === "error" ? { ...c, status: "pending", message: "" } : c)));
    await window.dms.start(customers);
  };

  return (
    <div className="app">
      <header>
        <h1>DMS AUTO TOOL</h1>
        <span className="sub">Tự động nhập đăng ký lái thử từ Excel vào DMS</span>
        <nav>
          <button className={`ghost ${tab === "main" ? "active" : ""}`} onClick={() => setTab("main")}>
            Chính
          </button>
          <button className={`ghost ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            Cài đặt
          </button>
        </nav>
      </header>

      <main>
        {tab === "settings" ? (
          <Settings config={config} onSaved={setConfig} />
        ) : (
          <>
            <div className="card">
              <h2>1. Dữ liệu &amp; trình duyệt</h2>
              <div className="row">
                <button className="blue" onClick={pickFile} disabled={running}>
                  Chọn file Excel
                </button>
                <button onClick={() => window.dms.openDms()}>MỞ DMS</button>
                <span className="sub">
                  {fileName ? `File: ${fileName}` : "Chưa chọn file"} · Tổng khách hàng: {stats.total}
                </span>
              </div>
              <p className="hint">
                Bấm MỞ DMS để mở trình duyệt với profile được lưu lại, tự đăng nhập DMS một lần, sau đó chạy automation.
              </p>
            </div>

            <div className="card">
              <h2>2. Điều khiển</h2>
              <div className="row">
                <button onClick={() => window.dms.testOne(pendingList())} disabled={running || !customers.length}>
                  TEST 1 KHÁCH
                </button>
                <button className="primary" onClick={start} disabled={running || !customers.length}>
                  BẮT ĐẦU
                </button>
                <button onClick={() => window.dms.pause()} disabled={!running || paused}>
                  TẠM DỪNG
                </button>
                <button onClick={() => window.dms.resume()} disabled={!running || !paused}>
                  TIẾP TỤC
                </button>
                <button className="danger" onClick={() => window.dms.stop()} disabled={!running}>
                  DỪNG
                </button>
                <button
                  onClick={async () => {
                    await window.dms.resetCheckpoint();
                    setDoneCount(0);
                    setLogs((l) => [...l, { message: "Đã xoá checkpoint.", level: "warn" }]);
                  }}
                  disabled={running}
                >
                  Xoá checkpoint ({doneCount})
                </button>
              </div>
              <div className="progress">
                <div style={{ width: `${stats.total ? (stats.processed / stats.total) * 100 : 0}%` }} />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="stats">
                  <div className="stat">
                    <b>{stats.total}</b>
                    <span>Tổng khách</span>
                  </div>
                  <div className="stat">
                    <b style={{ color: "var(--ok)" }}>{stats.success}</b>
                    <span>Thành công</span>
                  </div>
                  <div className="stat">
                    <b style={{ color: "var(--err)" }}>{stats.error}</b>
                    <span>Lỗi</span>
                  </div>
                </div>
                <span className="sub" style={{ marginLeft: "auto" }}>
                  {running ? (paused ? "Đang tạm dừng" : "Đang chạy") : "Đang chờ"}
                </span>
              </div>
            </div>

            <div className="card">
              <h2>3. Danh sách khách hàng</h2>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Họ tên</th>
                      <th>SĐT</th>
                      <th>CCCD/GPLX</th>
                      <th>Dòng xe</th>
                      <th>Trạng thái</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ color: "var(--muted)" }}>
                          Chưa có dữ liệu. Hãy chọn file Excel.
                        </td>
                      </tr>
                    )}
                    {customers.map((c) => (
                      <tr key={c.index}>
                        <td>{c.index}</td>
                        <td>{c.fullName}</td>
                        <td>{c.phone}</td>
                        <td>{c.idCard}</td>
                        <td>{c.carModel}</td>
                        <td>
                          <span className={`badge ${c.status}`}>{statusLabel[c.status]}</span>
                        </td>
                        <td style={{ whiteSpace: "normal", color: "var(--muted)" }}>{c.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2>4. Log realtime</h2>
              <div className="logs" ref={logRef}>
                {logs.map((l, i) => (
                  <div key={i} className={l.level}>
                    <span className="time">{l.at ? new Date(l.at).toLocaleTimeString("vi-VN") : ""}</span>
                    {l.message}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
