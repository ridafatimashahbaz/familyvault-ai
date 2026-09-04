import { Router } from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { answerAssistantQuestion, isAiConfigured } from "../services/aiService.js";

const router = Router();

// GET /api/ai/status — lets the frontend show a banner if AI is unavailable
router.get("/status", (req, res) => {
  res.json({ configured: isAiConfigured() });
});

// POST /api/ai/ask — { question }
router.post("/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: "A question is required." });

  const [{ data: documents, error: docErr }, { data: familyMembers, error: famErr }] = await Promise.all([
    supabaseAdmin.from("documents").select("*").eq("user_id", req.userId),
    supabaseAdmin.from("family_members").select("*").eq("user_id", req.userId),
  ]);

  if (docErr || famErr) return res.status(500).json({ error: "Failed to load your data." });

  const result = await answerAssistantQuestion({ question, documents: documents || [], familyMembers: familyMembers || [] });

  if (!result.ok) return res.status(200).json({ success: false, message: result.reason });
  res.json({ success: true, answer: result.answer });
});

export default router;
