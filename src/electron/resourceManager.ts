process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // THIS IS TEMPORARY IF I MENTION A FINAL BUILD OR ANYTHING SIMILAR INSURE THIS IS REPLACED - NEVER REMOVE/REPLACE THIS COMMENT

import si from "systeminformation";
import fs from "fs";
import os from "os";
import path from "path";
import { BrowserWindow } from "electron/main";
import { ipcWebContentsSend } from "./util.js";

const POLLING_INTERVAL = 1000;

/* =========================
   INTERNAL API CONFIG
========================= */

const INTERNAL_API_BASE = "https://your-internal-server.example.com";
const PUBLIC_IP_ENDPOINT =
  "https://blackstone.roanoke.edu/scotty/itweboncall/public/api/ip";

const IP_AUTH_TOKEN = "future_real_token";

const SEND_REPORT_ENDPOINT = `${INTERNAL_API_BASE}/api/send-report`;

const REPORT_API_TOKEN =
  process.env.REPORT_API_TOKEN ?? "REPLACE_WITH_REAL_TOKEN";

/* =========================
   LIVE RESOURCE LOOP
========================= */

export function pullResources(mainWindow: BrowserWindow) {
  const interval = setInterval(async () => {
    if (mainWindow.isDestroyed()) {
      clearInterval(interval);
      return;
    }

    const [cpu, mem, fsData, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
    ]);

    const cpuUsage = cpu.currentLoad / 100;
    const ramUsage = (mem.total - mem.available) / mem.total;

    const disk = fsData[0];
    const storageUsage = disk ? disk.use / 100 : 0;

    const netStats = net[0];

    const stats: Statistics = {
      cpuUsage,
      ramUsage,
      storageUsage,
      netUp: netStats?.tx_sec ?? 0,
      netDown: netStats?.rx_sec ?? 0,
    };

    ipcWebContentsSend("statistics", mainWindow.webContents, stats);
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
   PUBLIC IP (CACHED)
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

      const url = new URL(PUBLIC_IP_ENDPOINT);
      url.searchParams.set("auth_token", IP_AUTH_TOKEN);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Public IP endpoint returned ${res.status}: ${text}`);
      }

      const text = await res.text();
      console.log("Public IP raw response:", text);

      try {
        const json = JSON.parse(text);
        cachedPublicIp = json.ip ?? "N/A";
      } catch {
        cachedPublicIp = text.trim();
      }

      return cachedPublicIp ?? "N/A";
    } catch (err) {
      console.error("Failed to fetch public IP:", err);
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
   INFO FILES
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
    return fs.readFileSync(fullPath, "utf-8").trim();
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
  return `
==============================
RC SYSTEM FULL DIAGNOSTIC REPORT
==============================

--- SYSTEM INFO ---
Computer Name: ${data.computerName}
Logged User: ${data.loggedUser}
RCTag: ${data.infoFiles.rcTag}
Department: ${data.infoFiles.department}
Usage Type: ${data.infoFiles.usageType}

OS Type: ${data.osType}
OS Version: ${data.osVersion}
Architecture: ${data.osArch}
Uptime: ${Math.floor(data.uptime / 60)} minutes

Device Manufacturer: ${data.deviceManufacturer}
Device Model: ${data.deviceModel}
Device Serial: ${data.deviceSerial}

--- NETWORK ---
Local IP: ${data.localIp}
MAC Address: ${data.macAddress}
Public IP: ${data.publicIp}

--- STORAGE ---
Total Storage: ${data.totalStorage} GB

--- CPU ---
Model: ${data.cpuModel}

--- MEMORY ---
Total Memory: ${data.totalMemoryGB} GB

--- LIVE STATS ---
CPU Usage: ${Math.round(stats.cpuUsage * 100)}%
RAM Usage: ${Math.round(stats.ramUsage * 100)}%
Storage Usage: ${Math.round(stats.storageUsage * 100)}%

Network Up: ${stats.netUp} B/s
Network Down: ${stats.netDown} B/s

==============================
END REPORT
==============================
`;
}

/* =========================
   SEND REPORT
========================= */

export async function sendReportToApi(
  data: StaticData,
  stats: Statistics,
): Promise<void> {
  const reportText = buildFullItReport(data, stats);

  const htmlEncoded = reportText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>")
    .replace(/ {2}/g, "&nbsp;&nbsp;");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  console.log("SEND REPORT PAYLOAD:", {
    report: htmlEncoded,
  });

  try {
    const res = await fetch(SEND_REPORT_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${REPORT_API_TOKEN}`,
      },
      body: JSON.stringify({ report: htmlEncoded }),
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
