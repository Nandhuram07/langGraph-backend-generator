/**
 * Tool: open_in_ide
 *
 * Opens a local directory in the user's IDE.
 * Supports VS Code (default), Cursor, and WebStorm.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
const execAsync = promisify(exec);
const IDE_COMMANDS = {
    vscode: "code",
    cursor: "cursor",
    webstorm: "webstorm",
};
export async function openInIde(input) {
    const { projectPath, ide = "vscode" } = input;
    if (!fs.existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
    }
    const cmd = IDE_COMMANDS[ide];
    if (!cmd) {
        throw new Error(`Unsupported IDE: "${ide}". Supported: vscode, cursor, webstorm`);
    }
    // Verify the CLI command is available
    try {
        await execAsync(`${cmd} --version`);
    }
    catch {
        throw new Error(`"${cmd}" CLI not found. ` +
            (ide === "vscode"
                ? `Open VS Code → Command Palette → "Shell Command: Install 'code' command in PATH"`
                : `Ensure the ${ide} CLI is installed and on your PATH.`));
    }
    // Open the project — fire-and-forget (IDE opens asynchronously)
    exec(`${cmd} "${projectPath}"`, (err) => {
        if (err)
            console.error(`[open-ide] Failed to open: ${err.message}`);
    });
    return {
        message: `Opened ${projectPath} in ${ide}`,
        projectPath,
        ide,
    };
}
