import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ApiRequestError } from "@/lib/api";
import { RELATIONS } from "@/lib/constants";

/**
 * Family member profiles.
 *
 * The vault is a single account per household: one login owns every document,
 * and members are the labels those documents are filed under. Every query here
 * is scoped by userId, matching the documents service.
 */

export const familyMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter at least 2 characters")
    .max(80, "Keep the name under 80 characters"),
  relation: z.enum(RELATIONS).default("other"),
  birthDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null))
    .refine((value) => !value || !Number.isNaN(value.getTime()), "Enter a valid date")
    .refine((value) => !value || value <= new Date(), "Birth date cannot be in the future"),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type FamilyMemberWithCount = {
  id: string;
  name: string;
  relation: string;
  birthDate: Date | null;
  notes: string | null;
  archived: boolean;
  createdAt: Date;
  documentCount: number;
};

function shape(member: {
  id: string;
  name: string;
  relation: string;
  birthDate: Date | null;
  notes: string | null;
  archived: boolean;
  createdAt: Date;
  _count?: { documents: number };
}): FamilyMemberWithCount {
  return {
    id: member.id,
    name: member.name,
    relation: member.relation,
    birthDate: member.birthDate,
    notes: member.notes,
    archived: member.archived,
    createdAt: member.createdAt,
    documentCount: member._count?.documents ?? 0,
  };
}

const memberInclude = { _count: { select: { documents: true } } } as const;

export async function listFamilyMembers(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<FamilyMemberWithCount[]> {
  const rows = await prisma.familyMember.findMany({
    where: { userId, ...(options.includeArchived ? {} : { archived: false }) },
    include: memberInclude,
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });

  return rows.map(shape);
}

export async function createFamilyMember(
  userId: string,
  input: unknown,
): Promise<FamilyMemberWithCount> {
  const parsed = familyMemberSchema.parse(input);

  try {
    const created = await prisma.familyMember.create({
      data: {
        userId,
        name: parsed.name,
        relation: parsed.relation,
        birthDate: parsed.birthDate,
        notes: parsed.notes ?? null,
      },
      include: memberInclude,
    });
    return shape(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiRequestError(409, `You already have a family member called "${parsed.name}"`);
    }
    throw error;
  }
}

export const familyMemberPatchSchema = familyMemberSchema.partial().extend({
  archived: z.boolean().optional(),
});

export async function updateFamilyMember(
  id: string,
  userId: string,
  input: unknown,
): Promise<FamilyMemberWithCount> {
  const parsed = familyMemberPatchSchema.parse(input);

  await assertOwned(id, userId);

  try {
    const updated = await prisma.familyMember.update({
      where: { id },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.relation !== undefined ? { relation: parsed.relation } : {}),
        ...(parsed.birthDate !== undefined ? { birthDate: parsed.birthDate } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes ?? null } : {}),
        ...(parsed.archived !== undefined ? { archived: parsed.archived } : {}),
      },
      include: memberInclude,
    });
    return shape(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiRequestError(409, `You already have a family member called "${parsed.name}"`);
    }
    throw error;
  }
}

/**
 * Deletes a profile. Documents are kept and simply become unfiled, because the
 * schema sets familyMemberId to null on delete - losing a profile must never
 * cost the user a document.
 */
export async function deleteFamilyMember(id: string, userId: string): Promise<void> {
  await assertOwned(id, userId);
  await prisma.familyMember.delete({ where: { id } });
}

async function assertOwned(id: string, userId: string): Promise<void> {
  const found = await prisma.familyMember.findFirst({ where: { id, userId }, select: { id: true } });
  if (!found) throw new ApiRequestError(404, "Family member not found");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
