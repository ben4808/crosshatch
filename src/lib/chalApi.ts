/** Dev-server path forwarded to chal-api's /api routes (see setupProxy.js). */
const LOCAL_CHAL_API = "/chal-api";
const AWS_CHAL_API = "https://cruzi.net/api";

/** Matches chal-api's /makeAICall socket timeout. */
export const CHAL_API_TIMEOUT_MS = 2 * 60 * 1000;

function isLocalHost(): boolean {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
}

/** Local CRA proxy; AWS chal-api when served from GitHub Pages or another host. */
export const CHAL_API = isLocalHost() ? LOCAL_CHAL_API : AWS_CHAL_API;

function chalApiSignal(signal?: AbortSignal | null): AbortSignal | undefined {
    const timeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(CHAL_API_TIMEOUT_MS)
        : undefined;
    if (!timeout) return signal ?? undefined;
    if (!signal) return timeout;
    if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);

    const controller = new AbortController();
    const abortFrom = (source: AbortSignal) => {
        if (!controller.signal.aborted) controller.abort(source.reason);
    };
    if (signal.aborted) abortFrom(signal);
    else signal.addEventListener("abort", () => abortFrom(signal), { once: true });
    timeout.addEventListener("abort", () => abortFrom(timeout), { once: true });
    return controller.signal;
}

/** fetch against chal-api. Waits up to CHAL_API_TIMEOUT_MS, and still honors a caller abort signal. */
export function chalFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${CHAL_API}${path}`, {
        ...init,
        signal: chalApiSignal(init.signal),
    });
}
