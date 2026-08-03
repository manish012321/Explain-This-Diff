import express from "express";
import cors from "cors";
import crypto from "crypto";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { DIFF_EXPLAINER_SYSTEM_PROMPT } from "./prompts.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---------- Simple in-memory cache ----------
// Key: SHA-256 hash of the diff text. Value: { summary, cachedAt }.
// This is intentionally simple (a Map, no external DB) — fine for a
// single-server portfolio project. A production version at scale would
// use Redis so the cache survives restarts and is shared across instances.
const summaryCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function hashDiff(diffText) {
  return crypto.createHash("sha256").update(diffText).digest("hex");
}

function getCached(hash) {
  const entry = summaryCache.get(hash);
  if (!entry) return null;

  const isExpired = Date.now() - entry.cachedAt > CACHE_TTL_MS;
  if (isExpired) {
    summaryCache.delete(hash);
    return null;
  }

  return entry.summary;
}

function setCached(hash, summary) {
  summaryCache.set(hash, { summary, cachedAt: Date.now() });
}

app.post("/explain", async (req, res) => {
  const { diffText } = req.body;

  if (!diffText || diffText.trim().length === 0) {
    return res.status(400).json({ error: "No diff text provided" });
  }

  const hash = hashDiff(diffText);

  const cachedSummary = getCached(hash);
  if (cachedSummary) {
    console.log(`Cache hit for diff ${hash.slice(0, 8)}...`);
    return res.json({ summary: cachedSummary, cached: true });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: DIFF_EXPLAINER_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: diffText,
        },
      ],
    });

    const summary = completion.choices[0].message.content;
    setCached(hash, summary);

    res.json({ summary, cached: false });
  } catch (err) {
    console.error("Groq API error:", err.message);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});