import { arch, platform } from "node:os";
import path from "node:path";
import process from "node:process";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import { StreamProcessor } from "./stream-processor";

export interface SetupCursorAgentOptions {
  version?: string;
  prompt?: string;
  apiKey?: string;
  model?: string;
}

export class CursorAgentSetup {
  private options: SetupCursorAgentOptions;

  constructor(options: SetupCursorAgentOptions = {}) {
    this.options = {
      version: options.version || "latest",
      prompt: options.prompt || process.env.CURSOR_PROMPT || "",
      apiKey: options.apiKey || process.env.CURSOR_API_KEY || "",
      model: options.model || "auto",
    };
  }

  private getPlatform(): string {
    const currentPlatform = platform();
    switch (currentPlatform) {
      case "darwin":
        return "darwin";
      case "linux":
        return "linux";
      default:
        throw new Error(`Unsupported platform: ${currentPlatform}. Cursor Agent CLI only supports macOS and Linux.`);
    }
  }

  async installCursorAgent(): Promise<string> {
    try {
      const currentPlatform = this.getPlatform();
      const currentArch = arch();
      const version = this.options.version || "latest";

      // Check if already cached
      let toolPath = tc.find("cursor-agent", version, currentArch);

      if (toolPath) {
        core.info(`Found cached Cursor Agent CLI at: ${toolPath}`);
        core.addPath(toolPath);
        core.setOutput("cursor-agent-path", toolPath);

        // Get version
        try {
          const { stdout } = await exec.getExecOutput("cursor-agent", ["--version"]);
          core.info(`Cursor Agent CLI version: ${stdout.trim()}`);
          core.setOutput("cursor-agent-version", stdout.trim());
        } catch {
          core.warning("Could not get Cursor Agent CLI version");
        }

        return toolPath;
      }

      core.info(`Installing Cursor Agent CLI on ${currentPlatform}...`);

      // Use the official installation script
      const installScript = `curl https://cursor.com/install -fsS | bash`;

      core.info("Running Cursor Agent CLI installation script...");
      await exec.exec("bash", ["-c", installScript]);

      core.addPath(path.join(process.env.HOME ?? "", ".local/bin"));

      // Find the installed cursor-agent binary
      const agentPath = await io.which("cursor-agent");
      if (!agentPath) {
        throw new Error("Cursor Agent CLI not found in PATH after installation");
      }

      core.info(`Cursor Agent CLI found at: ${agentPath}`);

      // Cache the tool
      toolPath = await tc.cacheFile(
        agentPath,
        "cursor-agent",
        "cursor-agent",
        version
      );

      // Add to PATH
      core.addPath(toolPath);

      core.info(`Cursor Agent CLI cached and installed successfully to: ${toolPath}`);
      core.setOutput("cursor-agent-path", toolPath);

      // Get version
      try {
        const { stdout } = await exec.getExecOutput("cursor-agent", ["--version"]);
        core.info(`Cursor Agent CLI version: ${stdout.trim()}`);
        core.setOutput("cursor-agent-version", stdout.trim());
      } catch {
        core.warning("Could not get Cursor Agent CLI version");
      }

      return toolPath;
    } catch (error) {
      core.setFailed(`Failed to install Cursor Agent CLI: ${error}`);
      throw error;
    }
  }

  async runCursorAgent(): Promise<void> {
    try {
      const { prompt } = this.options;

      if (!prompt) {
        core.warning("No prompt provided. Set CURSOR_PROMPT environment variable or use prompt input.");
        return;
      }

      core.info(`Running Cursor Agent CLI with prompt: ${prompt.substring(0, 100)}...`);

      const processor = new StreamProcessor({
        prompt,
        apiKey: this.options.apiKey,
        model: this.options.model,
        onComplete: (result) => {
          core.info(`Processing completed: ${result.toolCount} tools used, ${result.accumulatedText.length} characters generated`);
        },
        onError: (error) => {
          core.error(`Stream processing error: ${error.message}`);
        }
      });

      await processor.run();
    } catch (error) {
      core.setFailed(`Cursor Agent CLI execution failed: ${error}`);
      throw error;
    }
  }

  async run(): Promise<void> {
    try {
      core.info("Starting Cursor Agent CLI setup...");

      await this.installCursorAgent();

      core.info("Cursor Agent CLI setup completed successfully!");

      await this.runCursorAgent();
    } catch (error) {
      core.setFailed(`Cursor Agent CLI setup failed: ${error}`);
      throw error;
    }
  }
}

// Main function for GitHub Action
export async function main(): Promise<void> {
  const version = core.getInput("version") || "latest";
  const prompt = core.getInput("prompt") || process.env.CURSOR_PROMPT || "";
  const apiKey = core.getInput("api-key") || process.env.CURSOR_API_KEY || "";
  const model = core.getInput("model") || "auto";

  const setup = new CursorAgentSetup({ version, prompt, apiKey, model });
  await setup.run();
}
