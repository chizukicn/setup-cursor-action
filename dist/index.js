import { arch, platform } from "node:os";
import process from "node:process";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import { spawn } from "node:child_process";

//#region src/stream-processor.ts
var StreamProcessor = class {
	options;
	accumulatedText = "";
	toolCount = 0;
	startTime = Date.now();
	process = null;
	constructor(options) {
		this.options = options;
	}
	async run() {
		return new Promise((resolve, reject) => {
			core.info("🚀 Starting stream processing...");
			const args = [
				"-p",
				"--force",
				"--output-format",
				"stream-json"
			];
			if (this.options.apiKey) args.push("--api-key", this.options.apiKey);
			if (this.options.model) args.push("-m", this.options.model);
			args.push(this.options.prompt);
			this.process = spawn("cursor-agent", args, { stdio: [
				"ignore",
				"pipe",
				"pipe"
			] });
			let buffer = "";
			this.process.stdout?.on("data", (chunk) => {
				buffer += chunk.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				lines.forEach((line) => this.processLine(line));
			});
			this.process.stderr?.on("data", (data) => {
				process.stderr.write(data.toString());
			});
			this.process.on("error", (err) => {
				core.error(`Failed to start cursor-agent process: ${err}`);
				this.options.onError?.(err);
				reject(err);
			});
			this.process.on("close", (code) => {
				if (buffer.trim()) this.processLine(buffer);
				if (code !== 0) {
					const error = /* @__PURE__ */ new Error(`cursor-agent process exited with code ${code}`);
					core.error(`cursor-agent process exited with code ${code}`);
					this.options.onError?.(error);
					reject(error);
				} else resolve();
			});
		});
	}
	stop() {
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
	}
	processLine(line) {
		if (!line.trim()) return;
		let data;
		try {
			data = JSON.parse(line);
		} catch {
			return;
		}
		const type = data.type || "";
		const subtype = data.subtype || "";
		switch (type) {
			case "system":
				if (subtype === "init") {
					const model = data.model || "unknown";
					core.info(`🤖 Using model: ${model}`);
				}
				break;
			case "assistant": {
				const content = data.message?.content?.[0]?.text || "";
				this.accumulatedText += content;
				process.stdout.write(content);
				this.options.onProgress?.(content);
				break;
			}
			case "tool_call":
				if (subtype === "started") {
					this.toolCount += 1;
					if (data.tool_call?.writeToolCall) {
						const path = data.tool_call.writeToolCall.args?.path || "unknown";
						core.info(`\n🔧 Tool #${this.toolCount}: Creating ${path}`);
						this.options.onToolCall?.({
							type: "started",
							toolType: "write",
							path
						});
					} else if (data.tool_call?.readToolCall) {
						const path = data.tool_call.readToolCall.args?.path || "unknown";
						core.info(`\n📖 Tool #${this.toolCount}: Reading ${path}`);
						this.options.onToolCall?.({
							type: "started",
							toolType: "read",
							path
						});
					} else if (data.tool_call?.updateTodosToolCall) {
						const todos = data.tool_call.updateTodosToolCall.args?.todos || [];
						core.info(`\n📝 Tool #${this.toolCount}: Updating ${todos.length} todos`);
						this.options.onToolCall?.({
							type: "started",
							toolType: "todos",
							todos
						});
					}
				} else if (subtype === "completed") {
					if (data.tool_call?.shellToolCall) {
						const call = data.tool_call.shellToolCall;
						const cmd = call.args?.parsingResult?.executableCommands?.[0]?.fullText || "unknown command";
						const execTime = call.result?.success?.executionTime || call.result?.failure?.executionTime || 0;
						core.info(`\n🔧 Tool call completed (shell)`);
						core.info(`📝 Command:\n  ${cmd}`);
						core.info(`⏱ Execution time:\n  ${execTime} ms`);
						const toolInfo = {
							type: "completed",
							toolType: "shell",
							command: cmd,
							executionTime: execTime,
							result: {
								success: !!call.result?.success,
								stdout: call.result?.success?.stdout || call.result?.failure?.stdout,
								stderr: call.result?.success?.stderr || call.result?.failure?.stderr,
								exitCode: call.result?.failure?.exitCode
							}
						};
						if (call.result?.success) {
							const successInfo = call.result.success;
							if (successInfo.stdout && successInfo.stdout.trim() || successInfo.stderr && successInfo.stderr.trim()) {
								core.info(`✅ Execution result:`);
								if (successInfo.stdout && successInfo.stdout.trim()) core.info(`  Stdout: ${successInfo.stdout}`);
								if (successInfo.stderr && successInfo.stderr.trim()) core.info(`  Stderr:\n    ${successInfo.stderr.replace(/\n/g, "\n    ")}`);
							}
						} else if (call.result?.failure) {
							const failureInfo = call.result.failure;
							if (failureInfo.exitCode && failureInfo.exitCode !== 0 || failureInfo.stdout && failureInfo.stdout.trim() || failureInfo.stderr && failureInfo.stderr.trim()) {
								core.info(`❌ Execution result:`);
								if (failureInfo.exitCode && failureInfo.exitCode !== 0) core.info(`  Exit Code: ${failureInfo.exitCode}`);
								if (failureInfo.stdout && failureInfo.stdout.trim()) core.info(`  Stdout: ${failureInfo.stdout}`);
								if (failureInfo.stderr && failureInfo.stderr.trim()) core.info(`  Stderr:\n    ${failureInfo.stderr.replace(/\n/g, "\n    ")}`);
							}
						}
						this.options.onToolCall?.(toolInfo);
					} else if (data.tool_call?.readToolCall) {
						const call = data.tool_call.readToolCall;
						const path = call.args?.path || "unknown path";
						const errorMessage = call.result?.error?.errorMessage;
						core.info(`\n📖 Tool call completed (read file)`);
						core.info(`📝 File path:\n  ${path}`);
						const toolInfo = {
							type: "completed",
							toolType: "read",
							path,
							result: {
								success: !errorMessage,
								totalLines: call.result?.success?.totalLines,
								errorMessage
							}
						};
						if (errorMessage) core.info(`❌ Execution result:\n  Error message: ${errorMessage}`);
						else {
							const totalLines = call.result?.success?.totalLines ?? 0;
							core.info(`✅ Execution result: Read ${totalLines} lines`);
						}
						this.options.onToolCall?.(toolInfo);
					} else if (data.tool_call?.updateTodosToolCall) {
						const call = data.tool_call.updateTodosToolCall;
						const todos = call.args?.todos || [];
						const result = call.result?.success;
						core.info(`\n📝 Tool call completed (update todos)`);
						core.info(`📋 Todos count: ${todos.length}`);
						const toolInfo = {
							type: "completed",
							toolType: "todos",
							todos,
							result: {
								success: !!result,
								totalCount: result?.totalCount
							}
						};
						if (result) {
							core.info(`✅ Execution result: Updated ${result.totalCount} todos`);
							todos.forEach((todo, index) => {
								const status = todo.status.replace("TODO_STATUS_", "").toLowerCase();
								core.info(`  ${index + 1}. [${status}] ${todo.content}`);
							});
						} else core.info(`❌ Execution result: Failed to update todos`);
						this.options.onToolCall?.(toolInfo);
					}
				}
				break;
			case "result": {
				const duration = data.duration_ms || 0;
				const endTime = Date.now();
				const totalTime = Math.floor((endTime - this.startTime) / 1e3);
				const result = {
					duration,
					totalTime,
					toolCount: this.toolCount,
					accumulatedText: this.accumulatedText
				};
				core.info(`\n\n🎯 Completed in ${duration}ms (total ${totalTime}s)`);
				core.info(`📊 Final statistics: ${this.toolCount} tools, generated ${this.accumulatedText.length} characters`);
				this.options.onComplete?.(result);
				break;
			}
		}
	}
};

//#endregion
//#region src/index.ts
var CursorAgentSetup = class {
	options;
	constructor(options = {}) {
		this.options = {
			version: options.version || "latest",
			prompt: options.prompt || process.env.CURSOR_PROMPT || "",
			apiKey: options.apiKey || process.env.CURSOR_API_KEY || "",
			model: options.model || "auto"
		};
	}
	getPlatform() {
		const currentPlatform = platform();
		switch (currentPlatform) {
			case "darwin": return "darwin";
			case "linux": return "linux";
			default: throw new Error(`Unsupported platform: ${currentPlatform}. Cursor Agent CLI only supports macOS and Linux.`);
		}
	}
	async installCursorAgent() {
		try {
			const currentPlatform = this.getPlatform();
			const currentArch = arch();
			const version = this.options.version || "latest";
			let toolPath = tc.find("cursor-agent", version, currentArch);
			if (toolPath) {
				core.info(`Found cached Cursor Agent CLI at: ${toolPath}`);
				core.addPath(toolPath);
				core.setOutput("cursor-agent-path", toolPath);
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
			const installScript = `curl https://cursor.com/install -fsS | bash`;
			core.info("Running Cursor Agent CLI installation script...");
			await exec.exec("bash", ["-c", installScript]);
			const agentPath = await io.which("cursor-agent");
			if (!agentPath) throw new Error("Cursor Agent CLI not found in PATH after installation");
			core.info(`Cursor Agent CLI found at: ${agentPath}`);
			toolPath = await tc.cacheFile(agentPath, "cursor-agent", "cursor-agent", version);
			core.addPath(toolPath);
			core.info(`Cursor Agent CLI cached and installed successfully to: ${toolPath}`);
			core.setOutput("cursor-agent-path", toolPath);
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
	async runCursorAgent() {
		try {
			const { prompt } = this.options;
			if (!prompt) {
				core.warning("No prompt provided. Set CURSOR_PROMPT environment variable or use prompt input.");
				return;
			}
			core.info(`Running Cursor Agent CLI with prompt: ${prompt.substring(0, 100)}...`);
			await new StreamProcessor({
				prompt,
				apiKey: this.options.apiKey,
				model: this.options.model,
				onComplete: (result) => {
					core.info(`Processing completed: ${result.toolCount} tools used, ${result.accumulatedText.length} characters generated`);
				},
				onError: (error) => {
					core.error(`Stream processing error: ${error.message}`);
				}
			}).run();
		} catch (error) {
			core.setFailed(`Cursor Agent CLI execution failed: ${error}`);
			throw error;
		}
	}
	async run() {
		try {
			core.info("Starting Cursor Agent CLI setup...");
			await this.installCursorAgent();
			core.info("Cursor Agent CLI setup completed successfully!");
			if (this.options.prompt) await this.runCursorAgent();
		} catch (error) {
			core.setFailed(`Cursor Agent CLI setup failed: ${error}`);
			throw error;
		}
	}
};
async function main() {
	const version = core.getInput("version") || "latest";
	const prompt = core.getInput("prompt") || process.env.CURSOR_PROMPT || "";
	const apiKey = core.getInput("api-key") || process.env.CURSOR_API_KEY || "";
	const model = core.getInput("model") || "auto";
	await new CursorAgentSetup({
		version,
		prompt,
		apiKey,
		model
	}).run();
}

//#endregion
export { CursorAgentSetup, main };