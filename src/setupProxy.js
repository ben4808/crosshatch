/* eslint-disable */
const {
  getEntriesForClassification,
  updateEntryClassifications,
  addEntryTags,
  deleteEntryTags,
  deleteEntries,
} = require("cruzi-db");

const MANUAL_TAGS = {
  displayText: "manual_display",
  classification: "manual_classification",
  unityBucket: "manual unity",
  familiarityBucket: "manual familiarity",
  qualityBucket: "manual quality",
};

const CROSSWORDESE_TAG = "crosswordese";
const SENSITIVE_TAG = "sensitive";
const VULGAR_TAG = "vulgar";

function textVal(value) {
  return value == null ? "" : String(value);
}

function collectManualTags(original, updated) {
  const tags = [];
  if (!updated.entry || !updated.lang) return tags;

  const pushIfChanged = (field, originalValue, newValue) => {
    const oldText = textVal(originalValue);
    const newText = textVal(newValue);
    if (oldText !== newText) {
      tags.push({
        entry: updated.entry,
        lang: updated.lang,
        tag: MANUAL_TAGS[field],
        value: `${oldText} -> ${newText}`,
      });
    }
  };

  pushIfChanged("displayText", original && original.displayText, updated.displayText);
  pushIfChanged("classification", original && original.classification, updated.classification);
  pushIfChanged("unityBucket", original && original.unityBucket, updated.unityBucket);
  pushIfChanged("familiarityBucket", original && original.familiarityBucket, updated.familiarityBucket);
  pushIfChanged("qualityBucket", original && original.qualityBucket, updated.qualityBucket);

  return tags;
}

function flagTag(row, tag) {
  return {
    entry: row.entry,
    lang: row.lang,
    tag,
  };
}

function applyFlagTagChange(original, row, field, tag, adds, deletes) {
  const wasSet = original ? original[field] === true : false;
  const isSet = !!row[field];
  if (wasSet === isSet) return;
  if (isSet) adds.push(flagTag(row, tag));
  else deletes.push(flagTag(row, tag));
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const CHAL_API_URL = (process.env.CHAL_API_URL || "http://localhost:3002").replace(/\/+$/, "");

/** Forward /chal-api/* to chal-api's /api/* (Magic Puzzle DB and AI calls). */
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

function handleClassifyRoutes(app) {
  app.post("/api/classify/entries", async (req, res) => {
    try {
      const fillWords = Array.isArray(req.body && req.body.fillWords) ? req.body.fillWords : [];
      const entries = await getEntriesForClassification(fillWords);
      sendJson(res, 200, { entries });
    } catch (err) {
      console.error("classify entries error:", err);
      sendJson(res, 500, { error: err && err.message ? err.message : String(err) });
    }
  });

  app.post("/api/classify/save", async (req, res) => {
    try {
      const originals = Array.isArray(req.body && req.body.originals) ? req.body.originals : [];
      const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
      const originalById = new Map(originals.map((row) => [row.rowId || row.fillWord, row]));

      const updates = [];
      const tags = [];
      const flagAdds = [];
      const flagDeletes = [];
      for (const row of rows) {
        if (!row.entry || !row.lang) continue;
        const original = originalById.get(row.rowId) || originalById.get(row.fillWord);
        updates.push({
          entry: row.entry,
          lang: row.lang,
          baseForm: null,
          displayText: row.displayText || null,
          classification: row.classification || null,
          unityBucket: row.unityBucket || null,
          familiarityBucket: row.familiarityBucket || null,
          qualityBucket: row.qualityBucket || null,
          isVulgar: !!row.isVulgar,
          humanReviewed: !!row.isReviewed,
        });
        tags.push(...collectManualTags(original, row));
        applyFlagTagChange(original, row, "isCrosswordese", CROSSWORDESE_TAG, flagAdds, flagDeletes);
        applyFlagTagChange(original, row, "isVulgar", VULGAR_TAG, flagAdds, flagDeletes);
        applyFlagTagChange(original, row, "isSensitive", SENSITIVE_TAG, flagAdds, flagDeletes);
      }

      await updateEntryClassifications(updates);
      await addEntryTags([...tags, ...flagAdds]);
      await deleteEntryTags(flagDeletes);
      sendJson(res, 200, {
        updated: updates.length,
        tags: tags.length,
        flagAdds: flagAdds.length,
        flagDeletes: flagDeletes.length,
      });
    } catch (err) {
      console.error("classify save error:", err);
      sendJson(res, 500, { error: err && err.message ? err.message : String(err) });
    }
  });

  app.post("/api/classify/delete", async (req, res) => {
    try {
      const entry = req.body && req.body.entry ? String(req.body.entry).trim() : "";
      const lang = req.body && req.body.lang ? String(req.body.lang).trim() : "en";
      if (!entry) {
        sendJson(res, 400, { error: "Entry is required" });
        return;
      }
      const deleted = await deleteEntries([{ entry, lang }]);
      sendJson(res, 200, { deleted });
    } catch (err) {
      console.error("classify delete error:", err);
      sendJson(res, 500, { error: err && err.message ? err.message : String(err) });
    }
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
  handleClassifyRoutes(app);
  handleChalApiRoutes(app);
};
