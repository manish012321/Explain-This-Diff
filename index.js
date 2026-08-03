import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { DIFF_EXPLAINER_SYSTEM_PROMPT } from "./prompts.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post("/explain", async (req, res) => {
  const { diffText } = req.body;

  if (!diffText || diffText.trim().length === 0) {
    return res.status(400).json({ error: "No diff text provided" });
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
    res.json({ summary });
  } catch (err) {
    console.error("Groq API error:", err.message);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});