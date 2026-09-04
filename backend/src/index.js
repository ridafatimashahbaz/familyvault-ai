import "dotenv/config";
import express from "express";
import cors from "cors";

import { requireAuth } from "./middleware/auth.js";
import { isSupabaseConfigured } from "./supabaseAdmin.js";
import { isAiConfigured } from "./services/aiService.js";

import familyRoutes from "./routes/family.js";
import documentsRoutes from "./routes/documents.js";
import aiRoutes from "./routes/ai.js";
import demoRoutes from "./routes/demo.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "apikey",
      "x-client-info",
    ],
  })
);

app.options("*", cors());app.use(express.json());

// Health check — used to verify the backend deployed correctly.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    supabaseConfigured: isSupabaseConfigured(),
    aiConfigured: isAiConfigured(),
  });
});

// Everything under /api/family, /api/documents, /api/ai, /api/demo requires a valid Supabase session.
app.use("/api/family", requireAuth, familyRoutes);
app.use("/api/documents", requireAuth, documentsRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/demo", requireAuth, demoRoutes);

// 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Central error handler — guarantees the process never crashes on an
// unhandled route error (e.g. multer file-type rejection).
app.use((err, req, res, next) => {
  console.error("[unhandled error]", err);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

app.listen(PORT, () => {
  console.log(`FamilyVault AI backend running on port ${PORT}`);
  if (!isSupabaseConfigured()) console.warn("⚠ Supabase is NOT configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (!isAiConfigured()) console.warn("⚠ AI is NOT configured — set ANTHROPIC_API_KEY. App will still run with fallback behavior.");
});
