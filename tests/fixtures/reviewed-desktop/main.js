const path = require("path");
const { app, BrowserWindow, session } = require("electron");
const { startRpcServer } = require("./backend");
const { loadWindowState, saveWindowState } = require("./storage/windowState");
const { createAppMenu } = require("./services/menu");
const crypto = require("crypto");

let rpcPort = 38741;
let rpcSessionToken = null;
let rpcServer = null;
let rpcServerPromise = null;

async function ensureRpcServer() {
  if (rpcServerPromise) {
    return rpcServerPromise;
  }

  rpcServerPromise = (async () => {
    rpcSessionToken =
      crypto.randomBytes(32)
        .toString("hex");

    const {
      server,
      port,
    } = await startRpcServer({
      port: rpcPort,
      sessionToken:
        rpcSessionToken,
    });

    rpcServer = server;
    rpcPort = port;

    return {
      server,
      port,
    };
  })();

  try {
    return await rpcServerPromise;
  } catch (error) {
    rpcServerPromise = null;
    rpcServer = null;

    throw error;
  }
}

async function createWindow() {
  // Start JSON-RPC server first
  await ensureRpcServer();

 const state = await loadWindowState();

const win = new BrowserWindow({
  title: "PL Creators Suite Beta",
  width: state.width,
  height: state.height,
  x: state.x,
  y: state.y,
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
  // keep all your existing options here
});

win.webContents.setWindowOpenHandler(
  () => ({
    action:
      "deny",
  }),
);

win.webContents.on(
  "will-navigate",
  (
    event,
  ) => {
    event.preventDefault();
  },
);

win.webContents.on(
  "will-attach-webview",
  (
    event,
  ) => {
    event.preventDefault();
  },
);

createAppMenu({
  onNewProject: () => {
    win.webContents.send("pl-menu-action", "menu:new-project");
  },
  onOpenProject: () => {
    win.webContents.send("pl-menu-action", "menu:open-project");
  },
  onImportProject: () => {
    win.webContents.send("pl-menu-action", "menu:import-project");
  },
  onExportProject: () => {
    win.webContents.send("pl-menu-action", "menu:export-project");
  },
});

if (state.isMaximized) {
  win.maximize();
}

win.on("close", async () => {
  try {
    await saveWindowState(win);
  } catch (
    error
  ) {
    console.warn(
      "Failed to save widow state:",
      error,
    );
  }
});

  // Pass port to renderer via query param (dev)
  if (app.isPackaged) {
    win.loadFile(path.join(app.getAppPath(), "apps/renderer/dist/index.html"), {
      query: {
        rpcPort: String(rpcPort),
        rpcToken: rpcSessionToken,
      },
    });
  } else {
    win.loadURL(
      `http://localhost:5173?rpcPort=${rpcPort}&rpcToken=${encodeURIComponent(
        rpcSessionToken,
      )}`
    );
  }
  }

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowedPermissions = new Set([]);

      callback(allowedPermissions.has(permission));
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on(
  "will-quit",
  () => {
    if (rpcServer) {
      rpcServer.close();
      rpcServer = null;
    }

    rpcServerPromise = null;
  },
);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

