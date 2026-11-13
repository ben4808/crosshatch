/* eslint-disable */
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const CHAL_API_URL = (process.env.CHAL_API_URL || "http://localhost:3002").replace(/\/+$/, "");

/** Forward /chal-api/* to chal-api's /api/* (DB and AI calls). */
function handleChalApiRoutes(app) {
  app.use("/chal-api", async (req, res) => {
    try {
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const response = await fetch(`${CHAL_API_URL}/api${req.url}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: hasBody ? JSON.stringify(req.body || {}) : undefined,
      });
      res.statusCode = response.status;
      res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error("chal-api proxy error:", err);
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
