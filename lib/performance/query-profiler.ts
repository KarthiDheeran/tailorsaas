import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";

type RequestProfileContext = {
  requestId: string;
  route: string;
  caller: string;
  startedAt: number;
  sequence: number;
  totalDbDurationMs: number;
  callsByFunction: Map<string, number>;
};

export type QueryProfileState = { fallbackUsed: boolean };

export type QueryProfileOptions = {
  functionName: string;
  tableOrRpc: string;
};

const requestProfileStorage = new AsyncLocalStorage<RequestProfileContext>();

function diagnosticsEnabled() {
  return process.env.PERFORMANCE_DIAGNOSTICS === "true";
}

function createRequestId() {
  return crypto.randomUUID();
}

function readRequestMetadata() {
  try {
    const requestHeaders = headers();
    return {
      requestId: requestHeaders.get("x-performance-request-id") ?? createRequestId(),
      route: requestHeaders.get("x-performance-route") ?? "unknown",
    };
  } catch {
    return { requestId: createRequestId(), route: "non-request" };
  }
}

function payloadBytesApprox(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

function rowCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  return value === null || value === undefined ? 0 : 1;
}

/** Diagnostics-only AsyncLocalStorage context for a Server Action/workflow. */
export async function withPerformanceContext<T>(caller: string, work: () => Promise<T>) {
  if (!diagnosticsEnabled() || requestProfileStorage.getStore()) return work();

  const metadata = readRequestMetadata();
  const context: RequestProfileContext = {
    ...metadata,
    caller,
    startedAt: performance.now(),
    sequence: 0,
    totalDbDurationMs: 0,
    callsByFunction: new Map(),
  };

  return requestProfileStorage.run(context, async () => {
    try {
      return await work();
    } finally {
      const serverMs = performance.now() - context.startedAt;
      console.info(
        `[DATA PERF REQUEST] ${JSON.stringify({
          requestId: context.requestId,
          route: context.route,
          caller: context.caller,
          queryCount: context.sequence,
          totalDbDurationMs: Number(context.totalDbDurationMs.toFixed(1)),
          serverWorkflowMs: Number(serverMs.toFixed(1)),
        })}`
      );
    }
  });
}

/** Profiles a data-function call without serializing or logging business data. */
export async function profileDataFunction<T>(
  options: QueryProfileOptions,
  work: (state: QueryProfileState) => Promise<T>
): Promise<T> {
  if (!diagnosticsEnabled()) return work({ fallbackUsed: false });

  if (!requestProfileStorage.getStore()) {
    return withPerformanceContext(`unscoped:${options.functionName}`, () =>
      profileDataFunction(options, work)
    );
  }

  const context = requestProfileStorage.getStore()!;
  const sequence = ++context.sequence;
  const priorCalls = context.callsByFunction.get(options.functionName) ?? 0;
  context.callsByFunction.set(options.functionName, priorCalls + 1);
  const state: QueryProfileState = { fallbackUsed: false };
  const startedAt = performance.now();

  try {
    const value = await work(state);
    const durationMs = performance.now() - startedAt;
    context.totalDbDurationMs += durationMs;
    console.info(
      `[DATA PERF] ${JSON.stringify({
        timestamp: new Date().toISOString(), requestId: context.requestId,
        route: context.route, caller: context.caller, function: options.functionName,
        tableOrRpc: options.tableOrRpc, callSequence: sequence,
        durationMs: Number(durationMs.toFixed(1)), rowCount: rowCount(value),
        payloadBytesApprox: payloadBytesApprox(value), duplicateInRequest: priorCalls > 0,
        fallbackUsed: state.fallbackUsed, status: "success", error: null,
      })}`
    );
    return value;
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    context.totalDbDurationMs += durationMs;
    console.info(
      `[DATA PERF] ${JSON.stringify({
        timestamp: new Date().toISOString(), requestId: context.requestId,
        route: context.route, caller: context.caller, function: options.functionName,
        tableOrRpc: options.tableOrRpc, callSequence: sequence,
        durationMs: Number(durationMs.toFixed(1)), rowCount: 0, payloadBytesApprox: 0,
        duplicateInRequest: priorCalls > 0, fallbackUsed: state.fallbackUsed,
        status: "error", error: error instanceof Error ? error.name : "UnknownError",
      })}`
    );
    throw error;
  }
}
