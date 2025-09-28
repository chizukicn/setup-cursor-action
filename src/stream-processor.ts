import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import process from "node:process";
import * as core from "@actions/core";

// 定义流数据的类型接口
interface StreamData {
  type?: string;
  subtype?: string;
  model?: string;
  message?: {
    content?: Array<{
      text?: string;
    }>;
  };
  tool_call?: {
    writeToolCall?: {
      args?: {
        path?: string;
      };
    };
    readToolCall?: {
      args?: {
        path?: string;
      };
      result?: {
        success?: {
          totalLines?: number;
        };
        error?: {
          errorMessage?: string;
        };
      };
    };
    shellToolCall?: {
      args?: {
        parsingResult?: {
          executableCommands?: Array<{
            fullText?: string;
          }>;
        };
      };
      result?: {
        success?: {
          stdout?: string;
          stderr?: string;
          executionTime?: number;
        };
        failure?: {
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          executionTime?: number;
        };
      };
    };
    updateTodosToolCall?: {
      args?: {
        todos?: Array<{
          id: string;
          content: string;
          status: string;
          createdAt: string;
          updatedAt: string;
          dependencies: string[];
        }>;
      };
      result?: {
        success?: {
          totalCount?: number;
        };
      };
    };
  };
  duration_ms?: number;
}

export interface StreamProcessorOptions {
  prompt: string;
  apiKey?: string;
  model?: string;
  onProgress?: (content: string) => void;
  onToolCall?: (toolInfo: ToolCallInfo) => void;
  onComplete?: (result: ProcessingResult) => void;
  onError?: (error: Error) => void;
}

export interface ToolCallInfo {
  type: "started" | "completed";
  toolType: "write" | "read" | "shell" | "todos";
  path?: string;
  command?: string;
  executionTime?: number;
  todos?: Array<{
    id: string;
    content: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    dependencies: string[];
  }>;
  result?: {
    success?: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    totalLines?: number;
    errorMessage?: string;
    totalCount?: number;
  };
}

export interface ProcessingResult {
  duration: number;
  totalTime: number;
  toolCount: number;
  accumulatedText: string;
}

export class StreamProcessor {
  private options: StreamProcessorOptions;
  private accumulatedText = "";
  private toolCount = 0;
  private startTime = Date.now();
  private process: ChildProcess | null = null;

  constructor(options: StreamProcessorOptions) {
    this.options = options;
  }

  async run(): Promise<void> {
    return new Promise((resolve, reject) => {
      core.info("🚀 Starting stream processing...");

      // spawn cursor-agent，忽略 stdin，stdout/stderr 可读
      const args = ["-p", "--force", "--output-format", "stream-json"];
      if (this.options.apiKey) {
        args.push("--api-key", this.options.apiKey);
      }
      if (this.options.model) {
        args.push("-m", this.options.model);
      }
      args.push(this.options.prompt);

      this.process = spawn(
        "cursor-agent",
        args,
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      // 缓冲 stdout 流，支持不换行的 JSON 输出
      let buffer = "";
      this.process.stdout?.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n"); // 尝试按行切分
        buffer = lines.pop() || ""; // 留下最后一行（可能不完整）
        lines.forEach((line) => this.processLine(line));
      });

      // 实时打印 stderr
      this.process.stderr?.on("data", (data) => {
        process.stderr.write(data.toString());
      });

      this.process.on("error", (err) => {
        core.error(`Failed to start cursor-agent process: ${err}`);
        this.options.onError?.(err);
        reject(err);
      });

      // 进程退出时处理剩余缓冲
      this.process.on("close", (code) => {
        if (buffer.trim()) {
          this.processLine(buffer);
        }
        if (code !== 0) {
          const error = new Error(`cursor-agent process exited with code ${code}`);
          core.error(`cursor-agent process exited with code ${code}`);
          this.options.onError?.(error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  // 定义类型接口
  private processLine(line: string): void {
    if (!line.trim()) {
      return;
    }
    let data: StreamData;
    try {
      data = JSON.parse(line);
    } catch {
      // 非 JSON 忽略
      return;
    }

    const type = data.type || "";
    const subtype = data.subtype || "";

    switch (type) {
      case "system": {
        if (subtype === "init") {
          const model = data.model || "unknown";
          core.info(`🤖 Using model: ${model}`);
        }
        break;
      }

      case "assistant": {
        const content = data.message?.content?.[0]?.text || "";
        this.accumulatedText += content;
        process.stdout.write(content);
        this.options.onProgress?.(content);
        break;
      }

      case "tool_call":{
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

            const toolInfo: ToolCallInfo = {
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
              if ((successInfo.stdout && successInfo.stdout.trim()) || (successInfo.stderr && successInfo.stderr.trim())) {
                core.info(`✅ Execution result:`);
                if (successInfo.stdout && successInfo.stdout.trim()) {
                  core.info(`  Stdout: ${successInfo.stdout}`);
                }
                if (successInfo.stderr && successInfo.stderr.trim()) {
                  core.info(`  Stderr:\n    ${successInfo.stderr.replace(/\n/g, "\n    ")}`);
                }
              }
            } else if (call.result?.failure) {
              const failureInfo = call.result.failure;
              if ((failureInfo.exitCode && failureInfo.exitCode !== 0) || (failureInfo.stdout && failureInfo.stdout.trim()) || (failureInfo.stderr && failureInfo.stderr.trim())) {
                core.info(`❌ Execution result:`);
                if (failureInfo.exitCode && failureInfo.exitCode !== 0) {
                  core.info(`  Exit Code: ${failureInfo.exitCode}`);
                }
                if (failureInfo.stdout && failureInfo.stdout.trim()) {
                  core.info(`  Stdout: ${failureInfo.stdout}`);
                }
                if (failureInfo.stderr && failureInfo.stderr.trim()) {
                  core.info(`  Stderr:\n    ${failureInfo.stderr.replace(/\n/g, "\n    ")}`);
                }
              }
            }

            this.options.onToolCall?.(toolInfo);
          } else if (data.tool_call?.readToolCall) {
            const call = data.tool_call.readToolCall;
            const path = call.args?.path || "unknown path";
            const errorMessage = call.result?.error?.errorMessage;

            core.info(`\n📖 Tool call completed (read file)`);
            core.info(`📝 File path:\n  ${path}`);

            const toolInfo: ToolCallInfo = {
              type: "completed",
              toolType: "read",
              path,
              result: {
                success: !errorMessage,
                totalLines: call.result?.success?.totalLines,
                errorMessage
              }
            };

            if (errorMessage) {
              core.info(`❌ Execution result:\n  Error message: ${errorMessage}`);
            } else {
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

            const toolInfo: ToolCallInfo = {
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
              todos.forEach((todo, index: number) => {
                const status = todo.status.replace("TODO_STATUS_", "").toLowerCase();
                core.info(`  ${index + 1}. [${status}] ${todo.content}`);
              });
            } else {
              core.info(`❌ Execution result: Failed to update todos`);
            }

            this.options.onToolCall?.(toolInfo);
          }
        }
        break;
      }
      case "result": {
        const duration = data.duration_ms || 0;
        const endTime = Date.now();
        const totalTime = Math.floor((endTime - this.startTime) / 1000);

        const result: ProcessingResult = {
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
}
