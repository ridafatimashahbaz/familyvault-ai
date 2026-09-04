import { Router } from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";

const router = Router();

// GET /api/family — list current user's family members
router.get("/", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("family_members")
    .select("*")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: "Failed to load family members." });
  res.json({ familyMembers: data });
});

// POST /api/family — { name, relationship }
router.post("/", async (req, res) => {
  const { name, relationship } = req.body || {};
  if (!name?.trim() || !relationship?.trim()) {
    return res.status(400).json({ error: "Name and relationship are required." });
  }

  const { data, error } = await supabaseAdmin
    .from("family_members")
    .insert({ user_id: req.userId, name: name.trim(), relationship: relationship.trim() })
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Failed to add family member." });
  res.status(201).json({ familyMember: data });
});

// DELETE /api/family/:id
router.delete("/:id", async (req, res) => {
  const { error } = await supabaseAdmin
    .from("family_members")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);

  if (error) return res.status(500).json({ error: "Failed to delete family member." });
  res.json({ success: true });
});

export default router;
