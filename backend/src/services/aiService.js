import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

let client = null;
export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
function getClient() {
  if (!client && isAiConfigured()) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const DOCUMENT_CATEGORIES = [
  "CNIC / ID Card",
  "Passport",
  "Birth Certificate",
  "Educational Certificate",
  "Medical Document",
  "Property Document",
  "Insurance Document",
  "Other",
];

const SYSTEM_PROMPT = `You are a document analysis assistant inside a private family document
manager. You will be shown the text (or image) content of ONE document.

Respond with STRICT JSON ONLY — no markdown fences, no commentary, matching exactly this shape:
{
  "category": one of ${JSON.stringify(DOCUMENT_CATEGORIES)},
  "summary": "1-2 plain sentence summary of what this document is",
  "extracted_data": { "Name": "...", "Document Number": "...", "Issue Date": "...", "Issuing Authority": "..." },
  "expiry_date": "YYYY-MM-DD" or null
}

Rules:
- Only include a field in extracted_data if you can actually see it in the document. Never invent values.
- expiry_date must be null if no expiry/valid-until date is present in the document.
- If the text is unreadable/empty/not a real document, use category "Other", a summary saying so, empty extracted_data, and null expiry_date.
- Output nothing except the JSON object.`;

function safeParseJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Analyze a document. Accepts EITHER extracted text (from a PDF) OR an
 * image (base64 + mediaType) for image uploads. Never throws — always
 * returns a { ok, ... } shape so callers can store a graceful fallback.
 */
export async function analyzeDocument({ text, imageBase64, imageMediaType, fileName }) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      reason: "AI analysis is temporarily unavailable (no API key configured). You can still view and manage this document.",
    };
  }

  const anthropic = getClient();

  const userContent = [];
  if (imageBase64 && imageMediaType) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: imageMediaType, data: imageBase64 },
    });
    userContent.push({ type: "text", text: `Analyze this document image. File name: ${fileName || "unknown"}` });
  } else {
    const trimmed = (text || "").slice(0, 15000);
    if (!trimmed.trim()) {
      return {
        ok: false,
        reason: "No readable text could be extracted from this file. You can still view and manage this document.",
      };
    }
    userContent.push({
      type: "text",
      text: `Analyze this document. File name: ${fileName || "unknown"}\n\nDocument text:\n"""\n${trimmed}\n"""`,
    });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const parsed = textBlock ? safeParseJson(textBlock.text) : null;

    if (!parsed) {
      return { ok: false, reason: "AI analysis returned an unexpected response. Please try again." };
    }

    return {
      ok: true,
      category: DOCUMENT_CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      extracted_data: parsed.extracted_data && typeof parsed.extracted_data === "object" ? parsed.extracted_data : {},
      expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiry_date) ? parsed.expiry_date : null,
    };
  } catch (err) {
    console.error("[aiService] analyzeDocument failed:", err?.message || err);
    return { ok: false, reason: "AI analysis failed unexpectedly. You can still view and manage this document." };
  }
}

/**
 * Lightweight, context-based Q&A over the user's own document data.
 * We pass a compact JSON list of the user's documents/family members as
 * context — no vector DB, no RAG pipeline, well within hackathon scope.
 */
export async function answerAssistantQuestion({ question, documents, familyMembers }) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      reason: "The AI Assistant is temporarily unavailable (no API key configured).",
    };
  }
  const anthropic = getClient();

  const context = {
    today: new Date().toISOString().slice(0, 10),
    family_members: familyMembers.map((f) => ({ id: f.id, name: f.name, relationship: f.relationship })),
    documents: documents.map((d) => ({
      name: d.name,
      category: d.category,
      family_member: familyMembers.find((f) => f.id === d.family_member_id)?.name || "Unassigned",
      summary: d.summary,
      expiry_date: d.expiry_date,
      extracted_data: d.extracted_data,
    })),
  };

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        "You are FamilyVault AI's assistant. Answer the user's question ONLY using the JSON data " +
        "provided below about their family members and documents. Be concise and direct. If the data " +
        "doesn't contain the answer, say so plainly instead of guessing.\n\nDATA:\n" +
        JSON.stringify(context),
      messages: [{ role: "user", content: question }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return { ok: true, answer: textBlock?.text?.trim() || "I couldn't generate an answer for that." };
  } catch (err) {
    console.error("[aiService] answerAssistantQuestion failed:", err?.message || err);
    return { ok: false, reason: "The AI Assistant failed to respond. Please try again." };
  }
}
