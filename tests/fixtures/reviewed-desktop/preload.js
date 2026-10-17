const { contextBridge, ipcRenderer } = require("electron");

const allowedMenuChannels = new Set([
  "menu:new-project",
  "menu:open-project",
  "menu:import-project",
  "menu:export-project",
]);

const plMenuApi = Object.freeze({
  onMenuAction(callback) {
    if (typeof callback !== "function") return undefined;

    const handler = (_event, channel) => {
      if (!allowedMenuChannels.has(channel)) return;
      callback(channel);
    };

    ipcRenderer.on("pl-menu-action", handler);

    return () => {
      ipcRenderer.removeListener("pl-menu-action", handler);
    };
  },
});

contextBridge.exposeInMainWorld("plMenu", plMenuApi);
