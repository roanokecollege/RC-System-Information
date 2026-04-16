import { app, BrowserWindow } from "electron";
import { isDev, ipcMainHandle } from "./util.js";
import { getStaticData, pullResources, sendReportToApi } from "./resourceManager.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";

app.on("ready", () => {
  const mainWindow = new BrowserWindow({
    title: "RC System Dashboard",
    webPreferences: {
      preload: getPreloadPath(),
      // contextIsolation is ON by default in modern Electron — do not disable it.
      // nodeIntegration is OFF by default — do not enable it.
    },
  });

  if (isDev()) {
    mainWindow.loadURL("http://localhost:5123/");
  } else {
    mainWindow.loadFile(getUIPath());
  }

  pullResources(mainWindow);

  ipcMainHandle("getStaticData", () => {
    return getStaticData();
  });

  /* =========================
     SEND TO IT — API RELAY
     required the user to be logged into Outlook. The report is now sent
     directly from the main process via an authenticated POST to your
     internal email relay API.
  ========================= */
  ipcMainHandle<"sendToIT", SendToITPayload>("sendToIT", async (_event, { data, stats }) => {
    try {
      await sendReportToApi(data, stats);
      return { success: true };
    } catch (err) {
      console.error("Failed to send report to API:", err);
      return { success: false, error: String(err) };
    }
  });
});
