//#region src/index.d.ts
interface SetupCursorAgentOptions {
  version?: string;
  prompt?: string;
  apiKey?: string;
  model?: string;
}
declare class CursorAgentSetup {
  private options;
  constructor(options?: SetupCursorAgentOptions);
  private getPlatform;
  installCursorAgent(): Promise<string>;
  runCursorAgent(): Promise<void>;
  run(): Promise<void>;
}
declare function main(): Promise<void>;
//#endregion
export { CursorAgentSetup, SetupCursorAgentOptions, main };