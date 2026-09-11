// Browser request accounting, kept independent of React for concurrency tests.
export function createRequestActivity() {
  let pending = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => pending,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    begin() {
      pending += 1;
      emit();
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        pending -= 1;
        emit();
      };
    },
  };
}

const activityKey = Symbol.for("tailorsaas.request-activity-store");
export const requestActivity: ReturnType<typeof createRequestActivity> =
  typeof window === "undefined" ? createRequestActivity() :
    Reflect.get(window, activityKey) ?? createRequestActivity();
if (typeof window !== "undefined") Reflect.set(window, activityKey, requestActivity);

export function isVisibleRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  origin: string,
  supabaseUrl?: string
) {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input), origin);
  const headers = new Headers(init?.headers ?? request?.headers);
  // Speculative Next.js navigation should not interrupt the current screen.
  if (headers.has("next-router-prefetch") || headers.get("purpose") === "prefetch") return false;
  if (url.origin === origin) {
    return url.pathname.startsWith("/api/") || headers.has("next-action") || headers.has("rsc");
  }
  if (supabaseUrl && url.origin === new URL(supabaseUrl).origin) {
    return /\/(rest|storage|auth|functions)\/v1\//.test(url.pathname);
  }
  return false;
}

export function createTrackedFetch(
  fetcher: typeof fetch,
  activity: ReturnType<typeof createRequestActivity>,
  shouldTrack: (input: RequestInfo | URL, init?: RequestInit) => boolean
): typeof fetch {
  return async (input, init) => {
    if (!shouldTrack(input, init)) return fetcher(input, init);
    const finish = activity.begin();
    try {
      const response = await fetcher(input, init);
      // Fetch resolves at headers; Server Actions/RSC can still be streaming.
      // Drain a clone without changing the body used by Next.js/the caller.
      if (response.body && !response.headers.get("content-type")?.startsWith("text/event-stream")) {
        const reader = response.clone().body!.getReader();
        void (async () => {
          try {
            while (!(await reader.read()).done) { /* discard observed chunks */ }
          } catch {
            // The caller owns error handling. Accounting must always settle.
          } finally {
            reader.releaseLock();
            finish();
          }
        })();
      } else {
        finish();
      }
      return response;
    } catch (error) {
      finish();
      throw error;
    }
  };
}
