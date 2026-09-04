import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { analyzeDocument, DOCUMENT_CATEGORIES } from "../services/aiService.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type. Please upload a PDF, PNG, JPG or WEBP file."));
    }
    cb(null, true);
  },
});

const BUCKET = "documents";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function withStatus(doc) {
  const days = daysUntil(doc.expiry_date);
  let expiry_status = "none";
  if (days !== null) {
    if (days < 0) expiry_status = "Expired";
    else if (days <= 30) expiry_status = "Expiring Soon";
    else expiry_status = "Active";
  }
  return { ...doc, days_until_expiry: days, expiry_status };
}

// GET /api/documents?search=&category=&family_member_id=
router.get("/", async (req, res) => {
  const { search, category, family_member_id } = req.query;

  let query = supabaseAdmin.from("documents").select("*").eq("user_id", req.userId);

  if (category) query = query.eq("category", category);
  if (family_member_id) query = query.eq("family_member_id", family_member_id);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
  console.error("[documents] load failed:", error);
  return res.status(500).json({ error: error.message });
}

  res.json({ documents: data.map(withStatus) });
});

// GET /api/documents/:id/url — signed URL to view the file
router.get("/:id/url", async (req, res) => {
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .select("file_path")
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .single();

  if (docErr || !doc) return res.status(404).json({ error: "Document not found." });

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60 * 10); // 10 minutes

  if (error) return res.status(500).json({ error: "Failed to generate file URL." });
  res.json({ url: data.signedUrl });
});

// POST /api/documents — multipart upload: file, name, category, family_member_id
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

    const { name, category, family_member_id } = req.body || {};
    const safeCategory = DOCUMENT_CATEGORIES.includes(category) ? category : "Other";
    const filePath = `${req.userId}/${randomUUID()}-${req.file.originalname}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadErr) {
      console.error("[documents] storage upload failed:", uploadErr.message);
      return res.status(500).json({ error: "File upload to storage failed." });
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: req.userId,
        family_member_id: family_member_id || null,
        name: name?.trim() || req.file.originalname,
        category: safeCategory,
        file_path: filePath,
        file_type: req.file.mimetype,
        file_size: req.file.size,
        analysis_status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[documents] insert failed:", error.message);
      return res.status(500).json({ error: "Failed to save document metadata." });
    }

    res.status(201).json({ document: withStatus(data) });
  } catch (err) {
    console.error("[documents] upload route error:", err);
    res.status(500).json({ error: err.message || "Upload failed unexpectedly." });
  }
});

// POST /api/documents/:id/analyze — run AI analysis (with graceful fallback)
router.post("/:id/analyze", async (req, res) => {
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .single();

  if (docErr || !doc) return res.status(404).json({ error: "Document not found." });

  await supabaseAdmin.from("documents").update({ analysis_status: "analyzing" }).eq("id", doc.id);

  try {
    const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(doc.file_path);

    if (downloadErr) throw new Error("Could not read file from storage.");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let analysis;

    if (doc.file_type === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      analysis = await analyzeDocument({ text: parsed.text, fileName: doc.name });
    } else {
      analysis = await analyzeDocument({
        imageBase64: buffer.toString("base64"),
        imageMediaType: doc.file_type,
        fileName: doc.name,
      });
    }

    if (!analysis.ok) {
      await supabaseAdmin
        .from("documents")
        .update({ analysis_status: "unavailable" })
        .eq("id", doc.id);
      return res.status(200).json({ success: false, message: analysis.reason });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("documents")
      .update({
        category: analysis.category,
        summary: analysis.summary,
        extracted_data: analysis.extracted_data,
        expiry_date: analysis.expiry_date,
        analysis_status: "done",
      })
      .eq("id", doc.id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: "Failed to save analysis results." });

    res.json({ success: true, document: withStatus(updated) });
  } catch (err) {
    console.error("[documents] analyze route error:", err);
    await supabaseAdmin.from("documents").update({ analysis_status: "failed" }).eq("id", doc.id);
    res.status(200).json({
      success: false,
      message: "AI analysis is temporarily unavailable. You can still view and manage this document.",
    });
  }
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res) => {
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("file_path")
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .single();

  if (doc?.file_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([doc.file_path]);
  }

  const { error } = await supabaseAdmin
    .from("documents")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);

  if (error) return res.status(500).json({ error: "Failed to delete document." });
  res.json({ success: true });
});

export default router;
