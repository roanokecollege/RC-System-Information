import si from "systeminformation";
import fs from "fs";
import os from "os";
import path from "path";
import { BrowserWindow, net } from "electron/main";
import { ipcWebContentsSend } from "./util.js";

const MIN_POLLING_INTERVAL = 3000;
const MAX_POLLING_INTERVAL = 15000;
// Below this load, poll at MIN_POLLING_INTERVAL. Above it, back off linearly
// up to MAX_POLLING_INTERVAL at LOAD_BACKOFF_CEILING, so the app itself adds
// less overhead exactly when the machine is already under pressure.
const LOAD_BACKOFF_FLOOR = 0.6;
const LOAD_BACKOFF_CEILING = 0.9;
const STORAGE_POLLING_INTERVAL = 30000;

/* =========================
   CONFIG (STRICT)
========================= */

const CONFIG = {
  PUBLIC_IP_ENDPOINT: process.env.PUBLIC_IP_ENDPOINT,
  SEND_REPORT_ENDPOINT: process.env.SEND_REPORT_ENDPOINT,
  AUTH_TOKEN: process.env.AUTH_TOKEN,
};

/* =========================
   ENV VALIDATION
========================= */

function validateEnv() {
  const missing = (
    ["AUTH_TOKEN", "PUBLIC_IP_ENDPOINT", "SEND_REPORT_ENDPOINT"] as const
  ).filter((k) => !CONFIG[k]);
  if (missing.length)
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

validateEnv();

/* =========================
   HELPERS
========================= */

function formatNetworkSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1_000_000) {
    return `${(bytesPerSecond / 1_000_000).toFixed(2)} MB/s`;
  } else if (bytesPerSecond >= 1_000) {
    return `${(bytesPerSecond / 1_000).toFixed(2)} KB/s`;
  } else {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;

  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/* =========================
   LIVE RESOURCE LOOP
========================= */

// Linearly backs off from MIN_POLLING_INTERVAL to MAX_POLLING_INTERVAL as
// load rises from LOAD_BACKOFF_FLOOR to LOAD_BACKOFF_CEILING.
function nextPollingInterval(cpuUsage: number, ramUsage: number): number {
  const load = Math.max(cpuUsage, ramUsage);
  if (load <= LOAD_BACKOFF_FLOOR) return MIN_POLLING_INTERVAL;
  if (load >= LOAD_BACKOFF_CEILING) return MAX_POLLING_INTERVAL;

  const t = (load - LOAD_BACKOFF_FLOOR) / (LOAD_BACKOFF_CEILING - LOAD_BACKOFF_FLOOR);
  return MIN_POLLING_INTERVAL + t * (MAX_POLLING_INTERVAL - MIN_POLLING_INTERVAL);
}

export function pullResources(mainWindow: BrowserWindow) {
  let cachedStorageUsage = 0;

  async function pollStorage() {
    if (mainWindow.isDestroyed()) return;
    const fsData = await si.fsSize();
    const disk = fsData[0];
    cachedStorageUsage = disk ? disk.use / 100 : 0;
  }

  async function poll(): Promise<Statistics | null> {
    if (mainWindow.isDestroyed()) return null;

    const [cpu, mem, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.networkStats(),
    ]);

    const cpuUsage = cpu.currentLoad / 100;
    const ramUsage = (mem.total - mem.available) / mem.total;
    const netStats = net[0];

    const stats: Statistics = {
      cpuUsage,
      ramUsage,
      storageUsage: cachedStorageUsage,
      netUp: netStats?.tx_sec ?? 0,
      netDown: netStats?.rx_sec ?? 0,
    };

    ipcWebContentsSend("statistics", mainWindow.webContents, stats);
    return stats;
  }

  const storageInterval = setInterval(() => {
    if (mainWindow.isDestroyed()) {
      clearInterval(storageInterval);
      return;
    }
    pollStorage();
  }, STORAGE_POLLING_INTERVAL);

  async function scheduleNextPoll() {
    if (mainWindow.isDestroyed()) {
      clearInterval(storageInterval);
      return;
    }

    const stats = await poll();
    const delay = stats
      ? nextPollingInterval(stats.cpuUsage, stats.ramUsage)
      : MIN_POLLING_INTERVAL;

    setTimeout(scheduleNextPoll, delay);
  }

  // Fire immediately so UI doesn't wait for the first cycle
  pollStorage();
  scheduleNextPoll();
}

/* =========================
   STATIC DATA
========================= */

export async function getStaticData(): Promise<StaticData> {
  const [disk, mem, cpu, osInfo, systemInfo, time] = await Promise.all([
    si.fsSize(),
    si.mem(),
    si.cpu(),
    si.osInfo(),
    si.system(),
    si.time(),
  ]);

  const totalStorage = disk[0]?.size
    ? Math.floor(disk[0].size / 1_000_000_000)
    : 0;

  const totalMemoryGB = Math.floor(mem.total / 1_000_000_000);

  const cpuModel = cpu.manufacturer + " " + cpu.brand;

  const computerName = os.hostname();

  const { localIp, wifiMac, ethernetMac, publicIp } = await getFullNetworkData();

  const infoFiles = getInfoFileData();

  const { manufacturer, model, serial } = systemInfo;

  return {
    totalStorage,
    cpuModel,
    totalMemoryGB,

    computerName,
    localIp,
    publicIp,
    wifiMac,
    ethernetMac,

    infoFiles,

    osType: osInfo.platform,
    osVersion: `${osInfo.distro} ${osInfo.release}`,
    osArch: osInfo.arch,

    uptime: time.uptime,

    loggedUser: os.userInfo().username,

    deviceManufacturer: manufacturer,
    deviceModel: model,
    deviceSerial: serial,
  };
}

/* =========================
   NETWORK INFO
========================= */

async function getNetworkInfo() {
  const ifaces = await si.networkInterfaces();
  const list = Array.isArray(ifaces) ? ifaces : [ifaces];

  let wifiMac = "N/A";
  let ethernetMac = "N/A";
  let localIp = "N/A";

  for (const iface of list) {
    if (iface.virtual || iface.internal) continue;

    if (iface.type === "wireless" && wifiMac === "N/A") {
      wifiMac = iface.mac || "N/A";
      if (localIp === "N/A" && iface.ip4) localIp = iface.ip4;
    }

    if (iface.type === "wired" && ethernetMac === "N/A") {
      ethernetMac = iface.mac || "N/A";
      if (iface.ip4) localIp = iface.ip4; // prefer wired IP
    }
  }

  // Fallback using os module if si returned nothing useful
  if (localIp === "N/A") {
    for (const addrs of Object.values(os.networkInterfaces())) {
      const match = addrs?.find((a) => a.family === "IPv4" && !a.internal);
      if (match) { localIp = match.address; break; }
    }
  }

  return { wifiMac, ethernetMac, localIp };
}

/* =========================
   PUBLIC IP (CACHED + SECURE)
========================= */

let cachedPublicIp: string | null = null;
let publicIpPromise: Promise<string> | null = null;

async function getPublicIp(): Promise<string> {
  if (cachedPublicIp) return cachedPublicIp;
  if (publicIpPromise) return publicIpPromise;

  publicIpPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const ipUrl = new URL(CONFIG.PUBLIC_IP_ENDPOINT!);

      const res = await net.fetch(ipUrl.toString(), {
        signal: controller.signal,
        headers: {
          "x-auth-token": CONFIG.AUTH_TOKEN!,
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Public IP endpoint returned ${res.status}`);
      }

      const text = await res.text();

      try {
        const json = JSON.parse(text);
        cachedPublicIp = json.ip ?? "N/A";
      } catch {
        cachedPublicIp = text.trim();
      }

      return cachedPublicIp ?? "N/A";
    } catch (err) {
      console.error("[IP] failed:", err instanceof Error ? err.message : err);
      return "N/A";
    } finally {
      publicIpPromise = null;
    }
  })();

  return publicIpPromise;
}

async function getFullNetworkData() {
  const { localIp, wifiMac, ethernetMac } = await getNetworkInfo();
  const publicIp = await getPublicIp();

  return { localIp, wifiMac, ethernetMac, publicIp };
}

/* =========================
   INFO FILES (SANITIZED)
========================= */

function getInfoFileData(): InfoFilesObject {
  let infoPath: string;

  if (process.platform === "win32") {
    infoPath = "C:/info";
  } else {
    infoPath = path.join(os.homedir(), "info");
  }

  if (!fs.existsSync(infoPath)) {
    return {
      rcTag: "",
      department: "",
      assignedLocationBuilding: "",
      assignedLocationRoom: "",
      localAccount: "",
      ownerFirstName: "",
      ownerLastName: "",
      ownerEmail: "",
      usageType: "",
      yearModel: "",
    };
  }

  const readFile = (fileName: string) => {
    const fullPath = path.join(infoPath, fileName);
    if (!fs.existsSync(fullPath)) return "";
    return fs.readFileSync(fullPath, "utf-8").replace(/\r?\n/g, " ").trim();
  };

  return {
    rcTag: readFile("RCTag.txt"),
    department: readFile("Department.txt"),
    assignedLocationBuilding: readFile("AssignedLocationBuilding.txt"),
    assignedLocationRoom: readFile("AssignedLocationRoom.txt"),
    localAccount: readFile("LocalAccount.txt"),
    ownerFirstName: readFile("OwnerFirstName.txt"),
    ownerLastName: readFile("OwnerLastName.txt"),
    ownerEmail: readFile("OwnerEmail.txt"),
    usageType: readFile("UsageType.txt"),
    yearModel: readFile("YearModel.txt"),
  };
}

/* =========================
   REPORT BUILDER
========================= */

export function buildFullItReport(data: StaticData, stats: Statistics): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 12px;font-weight:600;color:#6b7280;white-space:nowrap;width:160px">${label}</td>
      <td style="padding:6px 12px;color:#111827">${value || "—"}</td>
    </tr>`;

  const section = (title: string, rows: string) => `
    <tr><td colspan="2" style="padding:18px 12px 4px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${title}</div>
    </td></tr>
    ${rows}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:32px auto">
    <tr>
      <td style="background:#872046;padding:0 20px;border-radius:8px 8px 0 0;text-align:center;line-height:1.2">
        <div style="color:#fff;font-size:24px;font-weight:700;margin:0">RC System Diagnostic Report</div>
        <div style="color:#fff;font-size:16px;margin:0">${data.computerName} &mdash; ${data.loggedUser}</div>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;border-radius:0 0 8px 8px;padding:8px 12px 20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${section("Device", `
            ${row("Manufacturer", data.deviceManufacturer)}
            ${row("Model", data.deviceModel)}
            ${row("Serial Number", data.deviceSerial)}
            ${row("Year Model", data.infoFiles.yearModel)}
            ${row("RC Tag", data.infoFiles.rcTag)}
          `)}
          ${section("System", `
            ${row("Computer Name", data.computerName)}
            ${row("Logged User", data.loggedUser)}
            ${row("Local Account", data.infoFiles.localAccount)}
            ${row("OS", `${data.osType} ${data.osVersion} (${data.osArch})`)}
            ${row("Uptime", formatUptime(data.uptime))}
          `)}
          ${section("Owner", `
            ${row("Name", `${data.infoFiles.ownerFirstName} ${data.infoFiles.ownerLastName}`)}
            ${row("Email", data.infoFiles.ownerEmail)}
            ${row("Department", data.infoFiles.department)}
            ${row("Usage Type", data.infoFiles.usageType)}
            ${row("Location", `${data.infoFiles.assignedLocationBuilding} ${data.infoFiles.assignedLocationRoom}`)}
          `)}
          ${section("Network", `
            ${row("WiFi MAC", data.wifiMac)}
            ${row("Ethernet MAC", data.ethernetMac)}
            ${row("Local IP", data.localIp)}
            ${row("Public IP", data.publicIp)}
            ${row("Network Up", formatNetworkSpeed(stats.netUp))}
            ${row("Network Down", formatNetworkSpeed(stats.netDown))}
          `)}
          ${section("Hardware", `
            ${row("CPU", data.cpuModel)}
            ${row("CPU Usage", `${Math.round(stats.cpuUsage * 100)}%`)}
            ${row("RAM", `${data.totalMemoryGB} GB total`)}
            ${row("RAM Usage", `${Math.round(stats.ramUsage * 100)}%`)}
            ${row("Storage", `${data.totalStorage} GB total`)}
            ${row("Storage Usage", `${Math.round(stats.storageUsage * 100)}%`)}
          `)}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:12px;text-align:center;color:#9ca3af;font-size:11px">
        Roanoke College Information Technology &mdash; RC System Dashboard
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* =========================
   SEND REPORT (SECURE)
========================= */

export async function sendReportToApi(
  data: StaticData,
  stats: Statistics,
  code: string,
): Promise<void> {
  const reportText = buildFullItReport(data, stats);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await net.fetch(CONFIG.SEND_REPORT_ENDPOINT!, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-auth-token": CONFIG.AUTH_TOKEN!,
      },
      body: JSON.stringify({
        subject: `RC System Diagnostic Report - ${data.loggedUser} (${data.computerName})`,
        body: reportText,
        code,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Send-report endpoint returned ${res.status}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
