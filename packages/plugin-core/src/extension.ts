import { getStage } from "@dendronhq/common-all";
import * as vscode from "vscode";
import { CONFIG } from "./constants";
import { Logger } from "./logger";
import { VSCodeUtils } from "./utils";
import { DendronWorkspace } from "./workspace";


// === Main
// this method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  const ctx = "activate";
  const { logPath, extensionPath, extensionUri, storagePath, globalStoragePath } = context;
  // setup logging

  Logger.configure(context, "debug");
  Logger.debug({ ctx, logPath, extensionPath, extensionUri, storagePath, globalStoragePath });
  console.log("active", logPath, extensionPath);

  if (DendronWorkspace.isActive()) {
    const ws = new DendronWorkspace(context);
    ws.L.info({ ctx, logPath, extensionPath, extensionUri, storagePath, globalStoragePath });
    ws.L.info({ ctx, msg: "isActive" });
    ws.reloadWorkspace().then(() => {
      Logger.debug({ ctx, msg: "engine Initialized" });
      const wsState = context.globalState.get(`wsInit:${ws.config.get(CONFIG.ROOT_DIR)}`);
      if (!wsState) {
        ws.showWelcome();
        context.globalState.update(`wsInit:${ws.config.get(CONFIG.ROOT_DIR)}`, true);
      }
    });
  }
  if (VSCodeUtils.isDebuggingExtension() || getStage() === "test") {
    Logger.output?.show(true);
    // TODO: check for cmd
    // const fullLogPath = FileUtils.escape(path.join(logPath, 'dendron.log'));
    // TODO
    // const cmd = `/usr/local/bin/code-insiders ${fullLogPath}`;
    // execa.command(cmd);
    // vscode.window.showInformationMessage(`logs at ${fullLogPath}`);
  }
}

// this method is called when your extension is deactivated
export function deactivate() {
  const ctx = "deactivate";
  const { DendronWorkspace } = require("./workspace");
  DendronWorkspace.instance().L.info({ ctx });
}
