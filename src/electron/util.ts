import { ipcMain, WebContents, WebFrameMain} from "electron/main";
import { getUIPath } from './pathResolver.js';
import { pathToFileURL } from "url";

export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function ipcMainHandle<Key extends keyof EventPayloadMapping, Payload = undefined>(
  key: Key,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    payload: Payload
  ) => Promise<EventPayloadMapping[Key]> | EventPayloadMapping[Key]
) {
  ipcMain.handle(key, (event, payload: Payload) => {
    if (!event.senderFrame) {
      throw new Error("No sender frame");
    }

    validateEventFrame(event.senderFrame);
    return handler(event, payload);
  });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key]
) {
  webContents.send(key, payload);
}

export function validateEventFrame(frame: WebFrameMain) {
  if (isDev() && new URL(frame.url).host === 'localhost:5123') {
    return;
  }

  if (frame.url !== pathToFileURL(getUIPath()).toString()) {
    throw new Error ('Malicious Event')
  }
}
