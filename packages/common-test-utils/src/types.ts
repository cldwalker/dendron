import { DEngineClientV2, WorkspaceOpts } from "@dendronhq/common-all";

export type TestResult = {
  actual: any;
  expected: any;
  msg?: string;
};

export type EngineOpt = {
  engine: DEngineClientV2;
};

export type SetupHookFunction<T = any> = (
  opts: {
    engine?: DEngineClientV2;
  } & WorkspaceOpts
) => Promise<T>;

export type PreSetupHookFunction<T = any> = (opts: WorkspaceOpts) => Promise<T>;

export type PreSetupCmdHookFunction<T = any> = (
  opts: Pick<WorkspaceOpts, "wsRoot">
) => Promise<T>;

export type PostSetupHookFunction<T = any> = (
  opts: {
    engine: DEngineClientV2;
  } & WorkspaceOpts
) => Promise<T>;
