import type { SetupCursorAgentOptions } from "../src";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CursorAgentSetup } from "../src";

// Mock GitHub Actions modules
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  warning: vi.fn(),
  getInput: vi.fn(),
  addPath: vi.fn(),
}));

vi.mock("@actions/exec", () => ({
  exec: vi.fn(),
  getExecOutput: vi.fn(),
}));

vi.mock("@actions/io", () => ({
  which: vi.fn(),
}));

vi.mock("@actions/tool-cache", () => ({
  find: vi.fn(),
  cacheFile: vi.fn(),
}));

vi.mock("../src/stream-processor", () => ({
  StreamProcessor: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  })),
}));

vi.mock("node:os", () => ({
  platform: vi.fn(() => "linux"),
  arch: vi.fn(() => "x64"),
}));

describe("cursorAgentSetup", () => {
  let cursorAgentSetup: CursorAgentSetup;
  let mockOptions: SetupCursorAgentOptions;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOptions = {
      version: "latest",
      prompt: "",
      apiKey: "",
      model: "auto",
    };
    cursorAgentSetup = new CursorAgentSetup(mockOptions);

    // Reset platform mock to linux for most tests
    const { platform } = await import("node:os");
    vi.mocked(platform).mockReturnValue("linux");
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      const setup = new CursorAgentSetup();
      expect(setup).toBeInstanceOf(CursorAgentSetup);
    });

    it("should initialize with custom options", () => {
      const customOptions = {
        version: "latest",
      };
      const setup = new CursorAgentSetup(customOptions);
      expect(setup).toBeInstanceOf(CursorAgentSetup);
    });
  });

  describe("getPlatform", () => {
    it("should return linux for Linux platform", async () => {
      const { platform } = await import("node:os");
      vi.mocked(platform).mockReturnValue("linux");

      const setup = new CursorAgentSetup();
      const result = (setup as any).getPlatform();
      expect(result).toBe("linux");
    });

    it("should return darwin for macOS platform", async () => {
      const { platform } = await import("node:os");
      vi.mocked(platform).mockReturnValue("darwin");

      const setup = new CursorAgentSetup();
      const result = (setup as any).getPlatform();
      expect(result).toBe("darwin");
    });

    it("should throw error for unsupported platform", async () => {
      const { platform } = await import("node:os");
      vi.mocked(platform).mockReturnValue("win32");

      const setup = new CursorAgentSetup();
      expect(() => (setup as any).getPlatform()).toThrow("Unsupported platform: win32. Cursor Agent CLI only supports macOS and Linux.");
    });
  });

  describe("installCursorAgent", () => {
    it("should install Cursor Agent CLI successfully", async () => {
      const { exec, getExecOutput } = await import("@actions/exec");
      const { which } = await import("@actions/io");
      const { find, cacheFile } = await import("@actions/tool-cache");
      const { setOutput, addPath } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("");
      vi.mocked(exec).mockResolvedValue(0);
      vi.mocked(which).mockResolvedValue("/home/user/.local/bin/cursor-agent");
      vi.mocked(cacheFile).mockResolvedValue("/opt/cursor-agent");
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "1.0.0",
        stderr: "",
        exitCode: 0,
      });

      const result = await cursorAgentSetup.installCursorAgent();

      expect(find).toHaveBeenCalledWith("cursor-agent", "latest", "x64");
      expect(exec).toHaveBeenCalledWith("bash", ["-c", "curl https://cursor.com/install -fsS | bash"]);
      expect(cacheFile).toHaveBeenCalledWith("/home/user/.local/bin/cursor-agent", "cursor-agent", "cursor-agent", "latest");
      expect(addPath).toHaveBeenCalledWith("/opt/cursor-agent");
      expect(setOutput).toHaveBeenCalledWith("cursor-agent-path", "/opt/cursor-agent");
      expect(setOutput).toHaveBeenCalledWith("cursor-agent-version", "1.0.0");
      expect(result).toBe("/opt/cursor-agent");
    });

    it("should use cached Cursor Agent CLI if available", async () => {
      const { find } = await import("@actions/tool-cache");
      const { getExecOutput } = await import("@actions/exec");
      const { setOutput, addPath } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("/opt/cached-cursor-agent");
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "1.0.0",
        stderr: "",
        exitCode: 0,
      });

      const result = await cursorAgentSetup.installCursorAgent();

      expect(find).toHaveBeenCalledWith("cursor-agent", "latest", "x64");
      expect(addPath).toHaveBeenCalledWith("/opt/cached-cursor-agent");
      expect(setOutput).toHaveBeenCalledWith("cursor-agent-path", "/opt/cached-cursor-agent");
      expect(setOutput).toHaveBeenCalledWith("cursor-agent-version", "1.0.0");
      expect(result).toBe("/opt/cached-cursor-agent");
    });

    it("should handle installation failure", async () => {
      const { find } = await import("@actions/tool-cache");
      const { exec } = await import("@actions/exec");
      const { setFailed } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("");
      vi.mocked(exec).mockRejectedValue(new Error("Installation failed"));

      await expect(cursorAgentSetup.installCursorAgent()).rejects.toThrow("Installation failed");
      expect(setFailed).toHaveBeenCalledWith("Failed to install Cursor Agent CLI: Error: Installation failed");
    });

    it("should handle case when cursor-agent not found in PATH", async () => {
      const { find } = await import("@actions/tool-cache");
      const { exec } = await import("@actions/exec");
      const { which } = await import("@actions/io");
      const { setFailed } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("");
      vi.mocked(exec).mockResolvedValue(0);
      vi.mocked(which).mockResolvedValue("");

      await expect(cursorAgentSetup.installCursorAgent()).rejects.toThrow("Cursor Agent CLI not found in PATH after installation");
      expect(setFailed).toHaveBeenCalledWith("Failed to install Cursor Agent CLI: Error: Cursor Agent CLI not found in PATH after installation");
    });

    it("should handle version command failure gracefully", async () => {
      const { find } = await import("@actions/tool-cache");
      const { exec, getExecOutput } = await import("@actions/exec");
      const { which } = await import("@actions/io");
      const { warning } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("");
      vi.mocked(exec).mockResolvedValue(0);
      vi.mocked(which).mockResolvedValue("/home/user/.local/bin/cursor-agent");
      vi.mocked(getExecOutput).mockRejectedValue(new Error("Version command failed"));

      await cursorAgentSetup.installCursorAgent();

      expect(warning).toHaveBeenCalledWith("Could not get Cursor Agent CLI version");
    });
  });

  describe("run", () => {
    it("should run successfully", async () => {
      const { find } = await import("@actions/tool-cache");
      const { getExecOutput } = await import("@actions/exec");
      const { info } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("/opt/cached-cursor-agent");
      vi.mocked(getExecOutput).mockResolvedValue({
        stdout: "1.0.0",
        stderr: "",
        exitCode: 0,
      });

      await cursorAgentSetup.run();

      expect(info).toHaveBeenCalledWith("Starting Cursor Agent CLI setup...");
      expect(info).toHaveBeenCalledWith("Cursor Agent CLI setup completed successfully!");
    });

    it("should handle run failure", async () => {
      const { find } = await import("@actions/tool-cache");
      const { exec } = await import("@actions/exec");
      const { setFailed } = await import("@actions/core");

      vi.mocked(find).mockReturnValue("");
      vi.mocked(exec).mockRejectedValue(new Error("Installation failed"));

      await expect(cursorAgentSetup.run()).rejects.toThrow("Installation failed");
      expect(setFailed).toHaveBeenCalledWith("Cursor Agent CLI setup failed: Error: Installation failed");
    });

    it("should warn when no prompt is provided", async () => {
      const { warning } = await import("@actions/core");

      const setup = new CursorAgentSetup({
        version: "latest",
        prompt: ""
      });

      await setup.runCursorAgent();

      expect(warning).toHaveBeenCalledWith(
        "No prompt provided. Set CURSOR_PROMPT environment variable or use prompt input."
      );
    });

    it("should use StreamProcessor when prompt is provided", async () => {
      const { StreamProcessor } = await import("../src/stream-processor");
      const mockProcessor = {
        run: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      };
      vi.mocked(StreamProcessor).mockReturnValue(mockProcessor as any);

      const setup = new CursorAgentSetup({
        version: "latest",
        prompt: "test prompt"
      });

      await setup.runCursorAgent();

      expect(StreamProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "test prompt",
          apiKey: "",
          model: "auto",
        })
      );
      expect(mockProcessor.run).toHaveBeenCalled();
    });
  });
});
