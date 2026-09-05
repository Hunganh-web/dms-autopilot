import { useEffect, useState } from "react";
import type { Config } from "./types";

const selectorLabels: Record<string, string> = {
  fullName: "Ô Họ tên",
  phone: "Ô Số điện thoại",
  idCard: "Ô CCCD/GPLX",
  carModel: "Chọn dòng xe",
  carModelOption: "Option dòng xe (dùng {value})",
  resource: "Chọn nguồn lực",
  resourceOption: "Option nguồn lực (dùng {value})",
  saveAndClose: "Nút Lưu & đóng",
  formOpen: "Xác nhận form đang mở",
  formClosed: "Xác nhận form đã đóng / màn hình danh sách",
  errorMessage: "Thông báo lỗi",
};

const excelLabels: Record<string, string> = {
  fullName: "Cột Họ và tên",
  phone: "Cột Số điện thoại",
  idCard: "Cột CCCD/GPLX",
  carModel: "Cột Dòng xe lái thử",
};

export default function Settings({
  config,
  onSaved,
}: {
  config: Config | null;
  onSaved: (c: Config) => void;
}) {
  const [draft, setDraft] = useState<Config | null>(config);
  const [mapText, setMapText] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setDraft(config);
    if (config)
      setMapText(
        Object.entries(config.carToResource)
          .map(([k, v]) => `${k} = ${v}`)
          .join("\n"),
      );
  }, [config]);

  if (!draft) return <p className="hint">Đang tải cấu hình...</p>;

  const set = (patch: Partial<Config>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    const carToResource: Record<string, string> = {};
    mapText
      .split("\n")
      .map((l) => l.split(/=|→|->/))
      .forEach((parts) => {
        if (parts.length >= 2) {
          const k = parts[0].trim().toUpperCase();
          const v = parts.slice(1).join("=").trim();
          if (k && v) carToResource[k] = v;
        }
      });
    const next = await window.dms.saveConfig({ ...draft, carToResource });
    onSaved(next);
    setSaved("Đã lưu cấu hình.");
    setTimeout(() => setSaved(""), 2500);
  };

  return (
    <>
      <div className="card">
        <h2>Kết nối DMS</h2>
        <div className="grid2">
          <div>
            <label>URL DMS</label>
            <input value={draft.dmsUrl} onChange={(e) => set({ dmsUrl: e.target.value })} />
          </div>
          <div>
            <label>URL form tạo mới (nếu có)</label>
            <input value={draft.newFormUrl || ""} onChange={(e) => set({ newFormUrl: e.target.value })} />
          </div>
          <div>
            <label>Selector nút mở form tạo mới</label>
            <input
              value={draft.openNewFormSelector || ""}
              onChange={(e) => set({ openNewFormSelector: e.target.value })}
            />
          </div>
          <div>
            <label>Kênh trình duyệt (chrome / để trống dùng Chromium)</label>
            <input value={draft.browserChannel || ""} onChange={(e) => set({ browserChannel: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Selector DMS</h2>
        <div className="grid2">
          {Object.keys(selectorLabels).map((key) => (
            <div key={key}>
              <label>{selectorLabels[key]}</label>
              <input
                value={draft.selectors[key] || ""}
                onChange={(e) => set({ selectors: { ...draft.selectors, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Mapping cột Excel</h2>
        <div className="grid2">
          {Object.keys(excelLabels).map((key) => (
            <div key={key}>
              <label>{excelLabels[key]}</label>
              <input
                value={draft.excelColumns[key] || ""}
                onChange={(e) => set({ excelColumns: { ...draft.excelColumns, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Mapping dòng xe → nguồn lực</h2>
        <textarea rows={7} value={mapText} onChange={(e) => setMapText(e.target.value)} />
        <p className="hint">Mỗi dòng một cặp, ví dụ: VF3 = Nguồn lực VF3</p>
      </div>

      <div className="card">
        <h2>Thời gian chờ (ms)</h2>
        <div className="grid2">
          <div>
            <label>Chờ thao tác</label>
            <input
              value={draft.timeouts.action}
              onChange={(e) => set({ timeouts: { ...draft.timeouts, action: Number(e.target.value) || 0 } })}
            />
          </div>
          <div>
            <label>Chờ form đóng</label>
            <input
              value={draft.timeouts.formClose}
              onChange={(e) => set({ timeouts: { ...draft.timeouts, formClose: Number(e.target.value) || 0 } })}
            />
          </div>
          <div>
            <label>Chờ giao diện ổn định</label>
            <input
              value={draft.timeouts.stabilize}
              onChange={(e) => set({ timeouts: { ...draft.timeouts, stabilize: Number(e.target.value) || 0 } })}
            />
          </div>
        </div>
      </div>

      <div className="row">
        <button className="primary" onClick={save}>
          Lưu cấu hình
        </button>
        <button
          onClick={async () => {
            const next = await window.dms.resetConfig();
            onSaved(next);
          }}
        >
          Khôi phục mặc định
        </button>
        <span className="sub">{saved}</span>
      </div>
    </>
  );
}
