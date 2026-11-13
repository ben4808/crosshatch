/* eslint-disable */
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const http = require("http");
const https = require("https");

const CHAL_API_URL = (process.env.CHAL_API_URL || "http://localhost:3002").replace(/\/+$/, "");
/** Matches chal-api's /makeAICall socket timeout. Longer than Node fetch's old 30s header timeout. */
const CHAL_API_TIMEOUT_MS = 2 * 60 * 1000;

function forwardToChalApi(targetUrl, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const lib = url.protocol === "https:" ? https : http;
    const headers = { Accept: "application/json" };
    if (body != null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 502,
            contentType: response.headers["content-type"] || "application/json",
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.setTimeout(CHAL_API_TIMEOUT_MS, () => {
      req.destroy(new Error(`chal-api timed out after ${CHAL_API_TIMEOUT_MS / 1000}s`));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

/** Forward /chal-api/* to chal-api's /api/* (DB and AI calls). */
function handleChalApiRoutes(app) {
  app.use("/chal-api", async (req, res) => {
    req.setTimeout(CHAL_API_TIMEOUT_MS);
    res.setTimeout(CHAL_API_TIMEOUT_MS);
    try {
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const upstream = await forwardToChalApi(
        `${CHAL_API_URL}/api${req.url}`,
        req.method,
        hasBody ? JSON.stringify(req.body || {}) : undefined,
      );
      res.statusCode = upstream.statusCode;
      res.setHeader("Content-Type", upstream.contentType);
      res.end(upstream.body);
    } catch (err) {
      console.error("chal-api proxy error:", err);
      if (res.writableEnded) return;
      sendJson(res, 502, {
        error: `chal-api is unreachable at ${CHAL_API_URL}: ${err && err.message ? err.message : String(err)}`,
      });
    }
  });
}

const MAGIC_LIST_PATH = "C:\\Users\\ben_z\\Desktop\\crossword_lists\\list.enc";

/** Serve the encrypted Magic Crossword word list from disk (browsers can't read C:\ paths). */
function handleMagicListRoute(app) {
  app.get("/magic-list/list.enc", (req, res) => {
    require("fs").readFile(MAGIC_LIST_PATH, (err, data) => {
      if (err) {
        console.error("magic list read error:", err);
        sendJson(res, 404, { error: `Couldn't read ${MAGIC_LIST_PATH}: ${err.message}` });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(data);
    });
  });
}

module.exports = function (app) {
  const express = require("express");
  // Cross-origin isolation on first load (matches public/coi-serviceworker.js) so the
  // fill workers can share the word index via SharedArrayBuffer.
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  handleMagicListRoute(app);
  handleChalApiRoutes(app);
};
