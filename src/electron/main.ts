import "./load-env.js";
import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut } from "electron";

// Prevents GPU-related crashes on machines with problematic drivers (e.g. AMD)
app.disableHardwareAcceleration();
import path from "path";

import { isDev, ipcMainHandle } from "./util.js";
import {
  getStaticData,
  pullResources,
  sendReportToApi,
} from "./resourceManager.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

/* =========================
   TRAY SETUP
========================= */
function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "Tray_Icon_16.png")
    : path.join(app.getAppPath(), "assets", "Tray_Icon_16.png");

  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.error("❌ Tray icon failed to load:", iconPath);
  }

  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Hide App",
      click: () => {
        mainWindow?.hide();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("RC System Dashboard");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (!mainWindow) return;

    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/* =========================
   APP READY
========================= */
app.on("ready", () => {
  mainWindow = new BrowserWindow({
    title: "RC System Dashboard",
    webPreferences: {
      preload: app.isPackaged
        ? path.join(process.resourcesPath, "dist-electron", "preload.cjs")
        : getPreloadPath(),

      // 🔒 SECURITY LOCKDOWN
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev()) {
    mainWindow.loadURL("http://localhost:5123/");
  } else {
    mainWindow.loadFile(getUIPath());
  }

  // 🔒 Prevent navigation / new windows
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  pullResources(mainWindow);

  createTray();

  globalShortcut.register("CommandOrControl+Shift+I", () => {
    mainWindow?.webContents.toggleDevTools();
  });

  /* =========================
     IPC (SECURED)
  ========================= */

  ipcMainHandle("getStaticData", async () => {
    return getStaticData();
  });

  ipcMainHandle("sendToIT", async (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }

    const { data, stats, code } = payload as {
      data: StaticData;
      stats: Statistics;
      code: string;
    };

    if (!data || !stats) {
      throw new Error("Missing data or stats");
    }

    if (typeof stats.cpuUsage !== "number") {
      throw new Error("Invalid stats format");
    }

    if (typeof code !== "string") {
      throw new Error("Missing code");
    }

    try {
      await sendReportToApi(data, stats, code);
      return { success: true };
    } catch (err) {
      console.error("Failed to send report to API:", err);
      return { success: false, error: String(err) };
    }
  });

  /* =========================
     WINDOW BEHAVIOR
  ========================= */

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
});

/* =========================
   CLEAN EXIT
========================= */

app.on("before-quit", () => {
  isQuitting = true;
  tray?.destroy();
});
