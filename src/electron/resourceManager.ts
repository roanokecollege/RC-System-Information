import si from "systeminformation";
import fs from "fs";
import os from "os";
import path from "path";
import { BrowserWindow, net } from "electron/main";
import { ipcWebContentsSend } from "./util.js";

const POLLING_INTERVAL = 3000;
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

export function pullResources(mainWindow: BrowserWindow) {
  let cachedStorageUsage = 0;

  async function pollStorage() {
    if (mainWindow.isDestroyed()) return;
    const fsData = await si.fsSize();
    const disk = fsData[0];
    cachedStorageUsage = disk ? disk.use / 100 : 0;
  }

  async function poll() {
    if (mainWindow.isDestroyed()) return;

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
  }

  // Fire immediately so UI doesn't wait for the first interval
  pollStorage();
  poll();

  const storageInterval = setInterval(() => {
    if (mainWindow.isDestroyed()) {
      clearInterval(storageInterval);
      return;
    }
    pollStorage();
  }, STORAGE_POLLING_INTERVAL);

  const interval = setInterval(() => {
    if (mainWindow.isDestroyed()) {
      clearInterval(interval);
      clearInterval(storageInterval);
      return;
    }
    poll();
  }, POLLING_INTERVAL);
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

  const { localIp, macAddress, publicIp } = await getFullNetworkData();

  const infoFiles = getInfoFileData();

  const { manufacturer, model, serial } = systemInfo;

  return {
    totalStorage,
    cpuModel,
    totalMemoryGB,

    computerName,
    localIp,
    publicIp,
    macAddress,

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

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];
    if (!netInterface) continue;

    for (const net of netInterface) {
      if (net.family === "IPv4" && !net.internal) {
        return {
          localIp: net.address,
          macAddress: net.mac,
        };
      }
    }
  }

  return {
    localIp: "N/A",
    macAddress: "N/A",
  };
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
  const { localIp, macAddress } = getNetworkInfo();
  const publicIp = await getPublicIp();

  return { localIp, macAddress, publicIp };
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
  return `==============================
RC SYSTEM FULL DIAGNOSTIC REPORT
==============================

--- DEVICE ---
Manufacturer:     ${data.deviceManufacturer}
Model:            ${data.deviceModel}
Serial Number:    ${data.deviceSerial}
Year Model:       ${data.infoFiles.yearModel}
RC Tag:           ${data.infoFiles.rcTag}

--- SYSTEM ---
Computer Name:    ${data.computerName}
Logged User:      ${data.loggedUser}
Local Account:    ${data.infoFiles.localAccount}
OS:               ${data.osType} ${data.osVersion} (${data.osArch})
Uptime:           ${formatUptime(data.uptime)}

--- OWNER ---
Name:             ${data.infoFiles.ownerFirstName} ${data.infoFiles.ownerLastName}
Email:            ${data.infoFiles.ownerEmail}
Department:       ${data.infoFiles.department}
Usage Type:       ${data.infoFiles.usageType}
Location:         ${data.infoFiles.assignedLocationBuilding} ${data.infoFiles.assignedLocationRoom}

--- NETWORK ---
MAC Address:      ${data.macAddress}
Local IP:         ${data.localIp}
Public IP:        ${data.publicIp}
Network Up:       ${formatNetworkSpeed(stats.netUp)}
Network Down:     ${formatNetworkSpeed(stats.netDown)}

--- HARDWARE ---
CPU:              ${data.cpuModel}
CPU Usage:        ${Math.round(stats.cpuUsage * 100)}%
RAM:              ${data.totalMemoryGB} GB total
RAM Usage:        ${Math.round(stats.ramUsage * 100)}%
Storage:          ${data.totalStorage} GB total
Storage Usage:    ${Math.round(stats.storageUsage * 100)}%

==============================`;
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
        body: reportText.replace(/\n/g, "<br>"),
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
