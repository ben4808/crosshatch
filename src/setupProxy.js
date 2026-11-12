/* eslint-disable */
const {
  sqlQuery,
  getEntriesForClassification,
  updateEntryClassifications,
  addEntryTags,
  deleteEntryTags,
  deleteEntries,
} = require("cruzi-db");

const MANUAL_TAGS = {
  displayText: "manual_display",
  baseForm: "manual_base_form",
  classification: "manual_classification",
  unityBucket: "manual unity",
  familiarityBucket: "manual familiarity",
  qualityBucket: "manual quality",
  crosswordBucket: "manual crossword",
};

const UNPLEASANT_TAGS = {
  Vulgar: "vulgar",
  Sensitive: "sensitive",
  Gross: "gross",
};

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
  pushIfChanged("baseForm", original && original.baseForm, updated.baseForm);
  pushIfChanged("classification", original && original.classification, updated.classification);
  pushIfChanged("unityBucket", original && original.unityBucket, updated.unityBucket);
  pushIfChanged("familiarityBucket", original && original.familiarityBucket, updated.familiarityBucket);
  pushIfChanged("qualityBucket", original && original.qualityBucket, updated.qualityBucket);
  pushIfChanged("crosswordBucket", original && original.crosswordBucket, updated.crosswordBucket);

  return tags;
}

function flagTag(row, tag) {
  return {
    entry: row.entry,
    lang: row.lang,
    tag,
  };
}

function applyUnpleasantChange(original, row, adds, deletes) {
  if (!row.entry || !row.lang) return;
  const oldVal = original && original.unpleasant ? original.unpleasant : "";
  const newVal = row.unpleasant || "";
  if (oldVal === newVal) return;
  deletes.push(flagTag(row, UNPLEASANT_TAGS.Vulgar));
  deletes.push(flagTag(row, UNPLEASANT_TAGS.Sensitive));
  deletes.push(flagTag(row, UNPLEASANT_TAGS.Gross));
  const newTag = UNPLEASANT_TAGS[newVal];
  if (newTag) adds.push(flagTag(row, newTag));
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

/** Keep letters, numbers, and periods. Periods match any letter or number. */
function entryPatternToRegex(raw) {
  const cleaned = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, "");
  if (!cleaned) return null;
  let regex = "^";
  for (const ch of cleaned) {
    regex += ch === "." ? "[A-Z0-9]" : ch;
  }
  return regex + "$";
}

function optionalPositiveInt(value, label, max) {
  if (value == null || String(value).trim() === "") return { value: null };
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || (max != null && n > max)) {
    const limit = max != null ? ` up to ${max}` : "";
    return { error: `${label} must be a positive whole number${limit}` };
  }
  return { value: n };
}

function handleExplorerRoutes(app) {
  app.post("/api/explorer/entries", async (req, res) => {
    try {
      const body = req.body || {};
      const length = optionalPositiveInt(body.length, "Length");
      if (length.error) {
        sendJson(res, 400, { error: length.error });
        return;
      }
      const pageSize = optionalPositiveInt(
        body.pageSize == null || String(body.pageSize).trim() === "" ? 100 : body.pageSize,
        "Results per page",
        1000,
      );
      if (pageSize.error || pageSize.value == null) {
        sendJson(res, 400, { error: pageSize.error || "Results per page is required" });
        return;
      }
      const pageParsed = optionalPositiveInt(
        body.page == null || String(body.page).trim() === "" ? 1 : body.page,
        "Page",
      );
      if (pageParsed.error || pageParsed.value == null) {
        sendJson(res, 400, { error: pageParsed.error || "Page is required" });
        return;
      }

      const reviewedRaw = body.humanReviewed == null ? "both" : String(body.humanReviewed).trim().toLowerCase();
      let humanReviewed = null;
      if (reviewedRaw === "yes") humanReviewed = true;
      else if (reviewedRaw === "no") humanReviewed = false;
      else if (reviewedRaw !== "both" && reviewedRaw !== "") {
        sendJson(res, 400, { error: "Human reviewed must be both, yes, or no" });
        return;
      }

      const buckets = Array.isArray(body.familiarityBuckets)
        ? body.familiarityBuckets.map((bucket) => String(bucket).trim()).filter(Boolean)
        : [];

      const pattern = entryPatternToRegex(body.pattern);
      const offset = (pageParsed.value - 1) * pageSize.value;

      // Count stays available when the requested page is past the last row.
      const rows = await sqlQuery(false, `
        WITH filtered AS (
          SELECT
            e."entry" AS entry,
            COALESCE(NULLIF(btrim(e.display_text), ''), e."entry") AS display_text
          FROM "entry" e
          WHERE e.lang = 'en'
            AND ($1::int IS NULL OR e."length" = $1::int)
            AND ($2::text IS NULL OR e."entry" ~ $2)
            AND (
              $3::jsonb IS NULL
              OR jsonb_array_length($3::jsonb) = 0
              OR e.familiarity_bucket IN (SELECT jsonb_array_elements_text($3::jsonb))
            )
            AND ($4::boolean IS NULL OR e.human_reviewed = $4::boolean)
        )
        SELECT page.entry, page.display_text, counted.total_count
        FROM (SELECT COUNT(*)::int AS total_count FROM filtered) counted
        LEFT JOIN LATERAL (
          SELECT entry, display_text
          FROM filtered
          ORDER BY entry
          LIMIT $5::int OFFSET $6::int
        ) page ON true
      `, [
        { name: "length", value: length.value },
        { name: "pattern", value: pattern },
        { name: "buckets", value: buckets.length ? buckets : null },
        { name: "humanReviewed", value: humanReviewed },
        { name: "limit", value: pageSize.value },
        { name: "offset", value: offset },
      ]);

      const total = rows.length ? Number(rows[0].total_count) : 0;
      sendJson(res, 200, {
        entries: rows.filter((row) => row.entry != null).map((row) => ({
          entry: row.entry,
          displayText: row.display_text,
        })),
        total,
        page: pageParsed.value,
        pageSize: pageSize.value,
      });
    } catch (err) {
      console.error("explorer entries error:", err);
      sendJson(res, 500, { error: err && err.message ? err.message : String(err) });
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
          baseForm: row.baseForm || null,
          displayText: row.displayText || null,
          classification: row.classification || null,
          unityBucket: row.unityBucket || null,
          familiarityBucket: row.familiarityBucket || null,
          qualityBucket: row.qualityBucket || null,
          crosswordBucket: row.crosswordBucket || null,
          humanReviewed: !!row.isReviewed,
        });
        tags.push(...collectManualTags(original, row));
        applyUnpleasantChange(original, row, flagAdds, flagDeletes);
      }

      await updateEntryClassifications(updates);
      await deleteEntryTags(flagDeletes);
      await addEntryTags([...tags, ...flagAdds]);
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
  handleMagicListRoute(app);
  handleClassifyRoutes(app);
  handleExplorerRoutes(app);
  handleChalApiRoutes(app);
};
