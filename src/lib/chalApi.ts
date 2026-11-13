/** Dev-server path forwarded to chal-api's /api routes (see setupProxy.js). */
const LOCAL_CHAL_API = "/chal-api";
const AWS_CHAL_API = "https://cruzi.net/api";

function isLocalHost(): boolean {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
}

/** Local CRA proxy; AWS chal-api when served from GitHub Pages or another host. */
export const CHAL_API = isLocalHost() ? LOCAL_CHAL_API : AWS_CHAL_API;
