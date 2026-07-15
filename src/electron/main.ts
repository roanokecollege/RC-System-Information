import "./load-env.js";
import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, screen } from "electron";
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

/* =========================
   TRAY SETUP
========================= */
function createTray() {
  const trayIconFile = process.platform === "darwin" ? "Tray_Icon_24.png" : "Tray_Icon_32.png";
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets", trayIconFile)
    : path.join(app.getAppPath(), "assets", trayIconFile);

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
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip("RC System Dashboard");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

/* =========================
   APP READY
========================= */
app.on("ready", () => {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const MIN_WIDTH = 960;
  const MIN_HEIGHT = 728;

  mainWindow = new BrowserWindow({
    title: "RC System Dashboard",
    width: Math.max(Math.round(screenWidth / 2), MIN_WIDTH),
    height: Math.max(Math.round(screenHeight / 2), MIN_HEIGHT),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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

});

/* =========================
   CLEAN EXIT
========================= */

app.on("before-quit", () => {
  tray?.destroy();
});

/* =========================
   GPU CRASH FALLBACK
========================= */

app.on("child-process-gone", (_event, details) => {
  if (details.type === "GPU" && !process.argv.includes("--disable-gpu")) {
    app.relaunch({ args: [...process.argv.slice(1), "--disable-gpu"] });
    app.exit(0);
  }
});
