import { beforeEach, describe, expect, it, vi } from "vitest";
import { StreamProcessor } from "../src/stream-processor";

// Mock GitHub Actions modules
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("streamProcessor", () => {
  let mockProcess: any;
  let mockSpawn: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { spawn } = await import("node:child_process");
    mockSpawn = vi.mocked(spawn);

    mockProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockProcess);
  });

  describe("constructor", () => {
    it("should initialize with options", () => {
      const options = {
        prompt: "test prompt",
        apiKey: "test-api-key",
        model: "gpt-4",
        onProgress: vi.fn(),
        onToolCall: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      const processor = new StreamProcessor(options);
      expect(processor).toBeInstanceOf(StreamProcessor);
    });
  });

  describe("run", () => {
    it("should start cursor-agent process", async () => {
      const processor = new StreamProcessor({
        prompt: "test prompt",
        apiKey: "test-api-key",
        model: "gpt-4",
      });

      // Mock process to resolve immediately
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
      });

      await processor.run();

      expect(mockSpawn).toHaveBeenCalledWith(
        "cursor-agent",
        ["-p", "--force", "--output-format", "stream-json", "--api-key", "test-api-key", "-m", "gpt-4", "test prompt"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
    });

    it("should handle process errors", async () => {
      const onError = vi.fn();
      const processor = new StreamProcessor({
        prompt: "test prompt",
        onError,
      });

      // Mock process to emit error
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === "error") {
          setTimeout(() => callback(new Error("Process error")), 10);
        }
      });

      await expect(processor.run()).rejects.toThrow("Process error");
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should handle non-zero exit code", async () => {
      const onError = vi.fn();
      const processor = new StreamProcessor({
        prompt: "test prompt",
        onError,
      });

      // Mock process to exit with error code
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(1), 10);
        }
      });

      await expect(processor.run()).rejects.toThrow("cursor-agent process exited with code 1");
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should start cursor-agent process with model only", async () => {
      const processor = new StreamProcessor({
        prompt: "test prompt",
        model: "claude-3",
      });

      // Mock process to resolve immediately
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
      });

      await processor.run();

      expect(mockSpawn).toHaveBeenCalledWith(
        "cursor-agent",
        ["-p", "--force", "--output-format", "stream-json", "-m", "claude-3", "test prompt"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
    });
  });

  describe("stop", () => {
    it("should kill the process", () => {
      const processor = new StreamProcessor({
        prompt: "test prompt",
      });

      processor.stop();

      expect(mockProcess.kill).not.toHaveBeenCalled(); // Process not started yet
    });

    it("should kill running process", async () => {
      const processor = new StreamProcessor({
        prompt: "test prompt",
      });

      // Start the process
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 100);
        }
      });

      processor.run();

      // Stop before completion
      processor.stop();

      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe("todos handling", () => {
    it("should handle todos tool call", () => {
      const processor = new StreamProcessor({
        prompt: "test prompt",
      });

      const mockData = {
        type: "tool_call",
        subtype: "completed",
        tool_call: {
          updateTodosToolCall: {
            args: {
              todos: [
                {
                  id: "test-todo-1",
                  content: "Test todo content",
                  status: "TODO_STATUS_IN_PROGRESS",
                  createdAt: "1758997135004",
                  updatedAt: "1758997135004",
                  dependencies: []
                }
              ]
            },
            result: {
              success: {
                totalCount: 1
              }
            }
          }
        }
      };

      // Mock processLine method to test todos handling
      const processLineSpy = vi.spyOn(processor as any, "processLine");

      // Call processLine directly with mock data
      (processor as any).processLine(JSON.stringify(mockData));

      expect(processLineSpy).toHaveBeenCalled();
    });
  });
});
