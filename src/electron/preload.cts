const electron = require("electron");

/* =========================
   EXPOSED API
========================= */

electron.contextBridge.exposeInMainWorld("electron", {
  subscribeStatistics: (callback: (statistics: any) => void) => {
    return ipcOn("statistics", callback);
  },

  getStaticData: () => ipcInvoke("getStaticData"),

  /* =========================
     SEND TO IT
  ========================= */
  sendToIT: (payload: any) => ipcInvoke("sendToIT", payload),
} satisfies Window["electron"]);

/* =========================
   IPC INVOKE (Renderer → Main)
========================= */

function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key,
  payload?: any
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key, payload);
}

/* =========================
   IPC LISTENER (Main → Renderer stream)
========================= */

function ipcOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  callback: (payload: EventPayloadMapping[Key]) => void
) {
  const cb = (_: Electron.IpcRendererEvent, payload: any) => {
    callback(payload);
  };

  electron.ipcRenderer.on(key, cb);

  return () => {
    electron.ipcRenderer.off(key, cb);
  };
}
