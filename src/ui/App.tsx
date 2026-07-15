import { useEffect, useState } from "react";
import "./App.css";

type Stats = {
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
  netUp: number;
  netDown: number;
};

type StaticData = {
  computerName: string;
  wifiMac: string;
  ethernetMac: string;
  localIp: string;
  publicIp: string;
  infoFiles: {
    rcTag: string;
    localAccount: string;
    department: string;
    assignedLocationBuilding: string;
    assignedLocationRoom: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    usageType: string;
    yearModel: string;
  };
  totalStorage: number;
  cpuModel: string;
  totalMemoryGB: number;
  osType: string;
  osVersion: string;
  osArch: string;
  uptime: number;
  loggedUser: string;
  deviceManufacturer: string;
  deviceModel: string;
  deviceSerial: string;
};

type SendStatus = "idle" | "prompting" | "sending" | "success" | "error";

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [data, setData] = useState<StaticData | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [code, setCode] = useState("");

  useEffect(() => {
    const unsub = window.electron.subscribeStatistics(setStats);
    window.electron.getStaticData().then(setData);

    const match = window.matchMedia("(prefers-color-scheme: dark)");
    setDarkMode(match.matches);

    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    match.addEventListener("change", handler);

    return () => {
      unsub();
      match.removeEventListener("change", handler);
    };
  }, []);

  if (!stats || !data) return <div className="loading">Loading...</div>;

  const cpu = Math.round(stats.cpuUsage * 100);
  const ram = Math.round(stats.ramUsage * 100);
  const storage = Math.round(stats.storageUsage * 100);

  function handleSendToIT() {
    if (!data || !stats || sendStatus === "sending") return;
    setCode("");
    setSendStatus("prompting");
  }

  async function handleCodeSubmit() {
    if (!data || !stats) return;
    setSendStatus("sending");
    try {
      const result = await window.electron.sendToIT({ data, stats, code });
      setSendStatus(result.success ? "success" : "error");
    } catch {
      setSendStatus("error");
    }
    setTimeout(() => setSendStatus("idle"), 4000);
  }

  const sendLabel =
    sendStatus === "sending"
      ? "Sending…"
      : sendStatus === "success"
        ? "Sent ✓"
        : sendStatus === "error"
          ? "Failed ✗"
          : "Send To IT";


  return (
    <div className={`app ${darkMode ? "dark" : "light"}`}>
      {/* HEADER */}
      <h1 className="dashboard-title">RC System Dashboard</h1>

      {/* SYSTEM INFO */}
      <section className="card system-info">
        <h2>System Info</h2>

        <Info label="Computer Name" value={data.computerName} />
        <Info label="Serial Number" value={data.deviceSerial} />
        <Info label="RC Tag" value={data.infoFiles.rcTag} />
        <Info label="Current User" value={data.loggedUser} />
        <Info label="Local Account" value={data.infoFiles.localAccount} />
        <Info
          label="Operating System"
          value={`${data.osType} ${data.osVersion} (${data.osArch})`}
        />
      </section>

      {/* NETWORK */}
      <section className="card">
        <h2>Network</h2>
        {data.wifiMac !== "N/A" && <Info label="WiFi MAC" value={data.wifiMac} />}
        {data.ethernetMac !== "N/A" && <Info label="Ethernet MAC" value={data.ethernetMac} />}
        <Info label="Local IP" value={data.localIp} />
        <Info label="Public IP" value={data.publicIp} />
        <div className="network-speed">
          <span>⬆ {formatSpeed(stats.netUp)}</span>
          <span>⬇ {formatSpeed(stats.netDown)}</span>
        </div>
      </section>

      {/* PERFORMANCE + SEND */}
      <section className="card">
        <h2>Performance</h2>

        <Bar label="CPU" value={cpu} />
        <Bar label="RAM" value={ram} />
        <Bar label="Storage" value={storage} />

        <div className="storage-detail">
          Total Storage: {data.totalStorage} GB
        </div>

        <div className="send-it-container">
          <button
            className={`send-it send-it--${sendStatus}`}
            disabled={sendStatus === "sending" || sendStatus === "prompting"}
            onClick={handleSendToIT}
          >
            {sendLabel}
          </button>
        </div>
      </section>

      {/* CODE MODAL */}
      {sendStatus === "prompting" && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-label">Enter your code</p>
            <input
              className="modal-input"
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCodeSubmit();
                if (e.key === "Escape") setSendStatus("idle");
              }}
              placeholder="Code"
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setSendStatus("idle")}>
                Cancel
              </button>
              <button className="modal-submit" onClick={handleCodeSubmit}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

/* ---------------- UI COMPONENTS ---------------- */

function Bar({ label, value }: { label: string; value: number }) {
  const fillClass =
    value >= 85 ? "fill fill--danger" : value >= 65 ? "fill fill--warning" : "fill";

  return (
    <div className="bar-block">
      <div className="bar-header">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="bar">
        <div className={fillClass} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span className="label">{label}</span>
      <span className="value">{value || "—"}</span>
    </div>
  );
}

function formatSpeed(bytesPerSec: number) {
  const kb = bytesPerSec / 1024;
  const mb = kb / 1024;

  if (mb >= 1) return `${mb.toFixed(2)} MB/s`;
  if (kb >= 1) return `${kb.toFixed(1)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}
