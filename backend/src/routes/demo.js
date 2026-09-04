import { Router } from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";

const router = Router();

// POST /api/demo/seed — populates a few obviously-labelled demo rows.
// Skips seeding if the user already has any data, so it's safe to call
// more than once (e.g. a "Load Demo Data" button in Settings).
router.post("/seed", async (req, res) => {
  const { count } = await supabaseAdmin
    .from("family_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", req.userId);

  if (count && count > 0) {
    return res.json({ seeded: false, message: "You already have data — demo seed skipped." });
  }

  const members = [
    { user_id: req.userId, name: "Ahmed (Father)", relationship: "Father" },
    { user_id: req.userId, name: "Sana (Mother)", relationship: "Mother" },
    { user_id: req.userId, name: "You", relationship: "Self" },
    { user_id: req.userId, name: "Ayesha (Sister)", relationship: "Sister" },
  ];

  const { data: insertedMembers, error: memberErr } = await supabaseAdmin
    .from("family_members")
    .insert(members)
    .select();

  if (memberErr) return res.status(500).json({ error: "Failed to seed family members." });

  const byRelation = Object.fromEntries(insertedMembers.map((m) => [m.relationship, m.id]));
  const today = new Date();
  const inDays = (n) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10);

  const documents = [
    {
      user_id: req.userId,
      family_member_id: byRelation["Father"],
      name: "Ahmed - Passport (Demo)",
      category: "Passport",
      summary: "Demo sample: Pakistani passport, valid for travel.",
      extracted_data: { Name: "Ahmed Khan", "Document Number": "AB1234567", "Issuing Authority": "Directorate of Immigration" },
      expiry_date: inDays(28),
      analysis_status: "done",
      is_demo: true,
    },
    {
      user_id: req.userId,
      family_member_id: byRelation["Mother"],
      name: "Sana - CNIC (Demo)",
      category: "CNIC / ID Card",
      summary: "Demo sample: National identity card.",
      extracted_data: { Name: "Sana Khan", "Document Number": "35202-1234567-8" },
      expiry_date: inDays(400),
      analysis_status: "done",
      is_demo: true,
    },
    {
      user_id: req.userId,
      family_member_id: byRelation["Self"],
      name: "Educational Certificate (Demo)",
      category: "Educational Certificate",
      summary: "Demo sample: Bachelor's degree certificate.",
      extracted_data: { Name: "You", "Issuing Authority": "COMSATS University" },
      expiry_date: null,
      analysis_status: "done",
      is_demo: true,
    },
    {
      user_id: req.userId,
      family_member_id: byRelation["Sister"],
      name: "Ayesha - Birth Certificate (Demo)",
      category: "Birth Certificate",
      summary: "Demo sample: Birth registration certificate.",
      extracted_data: { Name: "Ayesha Khan" },
      expiry_date: null,
      analysis_status: "done",
      is_demo: true,
    },
    {
      user_id: req.userId,
      family_member_id: byRelation["Father"],
      name: "Ahmed - Insurance Document (Demo)",
      category: "Insurance Document",
      summary: "Demo sample: Health insurance policy document.",
      extracted_data: { "Policy Holder": "Ahmed Khan" },
      expiry_date: inDays(10),
      analysis_status: "done",
      is_demo: true,
    },
  ];

  const { error: docErr } = await supabaseAdmin.from("documents").insert(documents);
  if (docErr) return res.status(500).json({ error: "Failed to seed demo documents." });

  res.json({ seeded: true, message: "Demo data added." });
});

export default router;
