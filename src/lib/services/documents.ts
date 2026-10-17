import type { Document as DocumentModel, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { ApiRequestError } from "@/lib/api";
import { categoryOf, type CategoryKey, CATEGORIES, CATEGORY_KEYS, MAX_TEXT_EDIT_CHARS } from "@/lib/constants";
import { toDateKey } from "@/lib/pipeline/dates";
import { formatDate, safeParseJson, titleFromFilename } from "@/lib/utils";
import { sha256 } from "@/lib/security/crypto";
import {
  deleteDocumentFile,
  makeStorageKey,
  readDocumentFile,
  saveDocumentFile,
} from "@/lib/security/storage";
import { validateUpload, type DetectedFile } from "@/lib/security/upload";
import { processDocument } from "@/lib/pipeline/process";
import {
  buildExtractedData,
  type DateDecisionAction,
  DATE_ROLES,
  type ExtractedData,
  isIsoDate,
  parseExtractedData,
  reviewedDate,
} from "@/lib/pipeline/extracted-data";
import type { RetrievalDoc } from "@/lib/ai/retrieval";

/**
 * All document reads and writes go through here so that ownership is enforced
 * in exactly one place: every query is scoped by userId.
 */

export type DocumentWithRelations = DocumentModel & {
  familyMember: { id: string; name: string; relation: string } | null;
  tags: { tag: { id: string; name: string } }[];
};

const documentInclude = {
  familyMember: { select: { id: true, name: true, relation: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.DocumentInclude;

export type DocumentListItem = DocumentWithRelations & {
  isExpired: boolean;
  daysToExpiry: number | null;
};

export type DocumentFilters = {
  userId: string;
  query?: string;
  category?: string;
  docType?: string;
  familyMemberId?: string;
  status?: string;
  expiry?: "expired" | "expiring" | "valid" | "none" | "tracked";
  sort?: "newest" | "oldest" | "name" | "expiry" | "size";
  limit?: number;
  offset?: number;
};

function expiryWhere(expiry: DocumentFilters["expiry"]): Prisma.DocumentWhereInput | null {
  const now = new Date();
  const warningEnd = new Date(now.getTime() + env().EXPIRY_WARNING_DAYS * 86_400_000);

  switch (expiry) {
    case "expired":
      return { expiryDate: { lt: now } };
    case "expiring":
      return { expiryDate: { gte: now, lte: warningEnd } };
    case "valid":
      return { expiryDate: { gt: warningEnd } };
    case "none":
      return { expiryDate: null };
    case "tracked":
      return { expiryDate: { not: null } };
    default:
      return null;
  }
}

function orderBy(sort: DocumentFilters["sort"]): Prisma.DocumentOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "name":
      return [{ title: "asc" }];
    case "expiry":
      // Nulls sort last so documents without an expiry do not crowd the list.
      return [{ expiryDate: "asc" }, { createdAt: "desc" }];
    case "size":
      return [{ sizeBytes: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

export async function listDocuments(
  filters: DocumentFilters,
): Promise<{ items: DocumentListItem[]; total: number }> {
  const where: Prisma.DocumentWhereInput = { userId: filters.userId };

  const query = filters.query?.trim();
  if (query) {
    where.OR = [
      { title: { contains: query } },
      { ocrText: { contains: query } },
      { notes: { contains: query } },
      { extractedData: { contains: query } },
      { summary: { contains: query } },
      { originalName: { contains: query } },
      { familyMember: { name: { contains: query } } },
      { tags: { some: { tag: { name: { contains: query } } } } },
    ];
  }

  if (filters.category && CATEGORY_KEYS.includes(filters.category as CategoryKey)) {
    where.category = filters.category;
  }
  if (filters.docType) where.docType = filters.docType;
  if (filters.familyMemberId) where.familyMemberId = filters.familyMemberId;
  if (filters.status) where.status = filters.status;

  const expiryClause = expiryWhere(filters.expiry);
  if (expiryClause) Object.assign(where, expiryClause);

  const [rows, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      include: documentInclude,
      orderBy: orderBy(filters.sort),
      take: Math.min(filters.limit ?? 50, 200),
      skip: filters.offset ?? 0,
    }),
    prisma.document.count({ where }),
  ]);

  const now = Date.now();
  const items = rows.map((row) => decorate(row, now));

  return { items, total };
}

function decorate(row: DocumentWithRelations, now: number): DocumentListItem {
  const daysToExpiry = row.expiryDate
    ? Math.round((new Date(row.expiryDate).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
    : null;

  return { ...row, daysToExpiry, isExpired: daysToExpiry !== null && daysToExpiry < 0 };
}

export async function getDocumentForUser(
  id: string,
  userId: string,
): Promise<DocumentListItem> {
  const row = await prisma.document.findFirst({
    where: { id, userId },
    include: documentInclude,
  });

  if (!row) throw new ApiRequestError(404, "Document not found");
  return decorate(row, Date.now());
}

/** Loads the encrypted file and returns plaintext bytes. Ownership-checked. */
export async function getDocumentFile(
  id: string,
  userId: string,
): Promise<{ buffer: Buffer; document: DocumentListItem }> {
  const document = await getDocumentForUser(id, userId);
  const buffer = await readDocumentFile(document.storageKey);
  return { buffer, document };
}

export type UploadInput = {
  userId: string;
  filename: string;
  buffer: Buffer;
  familyMemberId?: string | null;
  title?: string | null;
  notes?: string | null;
  tags?: string[];
};

export type UploadOutcome = {
  document: DocumentListItem;
  warnings: string[];
};

/**
 * Validates, encrypts, stores and processes an upload.
 *
 * Processing is synchronous so the response already contains the
 * classification, fields and summary. If any analysis stage throws, the file
 * is kept and the document is marked `failed` with the reason, rather than
 * losing the user's upload.
 */
export async function uploadDocument(input: UploadInput): Promise<UploadOutcome> {
  const check = validateUpload(input.filename, input.buffer.length, input.buffer);
  if (!check.ok) throw new ApiRequestError(415, check.message);

  if (input.familyMemberId) {
    const member = await prisma.familyMember.findFirst({
      where: { id: input.familyMemberId, userId: input.userId },
    });
    if (!member) throw new ApiRequestError(422, "That family member does not belong to your account");
  }

  const warnings: string[] = [];
  const digest = sha256(input.buffer);

  const duplicate = await prisma.document.findFirst({
    where: { userId: input.userId, sha256: digest },
    select: { id: true, title: true },
  });
  if (duplicate) {
    warnings.push(
      `An identical file is already in your vault as "${duplicate.title}". This copy was stored separately.`,
    );
  }

  const storageKey = makeStorageKey(input.userId, check.detected.extension);
  const { encrypted } = await saveDocumentFile(storageKey, input.buffer);

  if (!encrypted) {
    warnings.push(
      "DOCUMENT_ENCRYPTION_KEY is not set, so this file was stored without encryption at rest.",
    );
  }

  const title = input.title?.trim() || titleFromFilename(check.filename);

  const member = input.familyMemberId
    ? await prisma.familyMember.findFirst({
        where: { id: input.familyMemberId, userId: input.userId },
        select: { name: true },
      })
    : null;

  const created = await prisma.document.create({
    data: {
      userId: input.userId,
      familyMemberId: input.familyMemberId ?? null,
      originalName: check.filename,
      storageKey,
      mimeType: check.detected.mimeType,
      extension: check.detected.extension,
      sizeBytes: input.buffer.length,
      sha256: digest,
      encrypted,
      title,
      notes: input.notes?.trim() || null,
      status: "processing",
      ocrStatus: "processing",
    },
    include: documentInclude,
  });

  await syncTags(input.userId, created.id, input.tags ?? []);

  try {
    const result = await processDocument({
      buffer: input.buffer,
      filename: check.filename,
      detected: check.detected,
      memberName: member?.name ?? null,
    });

    warnings.push(...result.warnings);

    const updated = await prisma.document.update({
      where: { id: created.id },
      data: {
        status: "ready",
        errorMessage: null,
        processedAt: new Date(),
        ocrText: result.text || null,
        ocrStatus: result.ocrStatus,
        ocrEngine: result.ocrEngine,
        ocrConfidence: result.ocrConfidence,
        docType: result.classification.docType,
        category: result.classification.category,
        classificationConfidence: result.classification.confidence,
        classificationSource: result.classification.source,
        extractedData: JSON.stringify(
          buildExtractedData(
            {
              fields: result.fields,
              classification: result.classification,
              pageCount: result.pageCount,
              pagesRead: result.pagesRead,
              labelledDates: result.labelledDates,
            },
            null,
          ),
        ),
        summary: result.summary,
        summarySource: result.summarySource,
        issueDate: result.dates.issueDate,
        expiryDate: result.dates.expiryDate,
        expirySource: result.dates.expirySource,
        noExpiry: result.dates.noExpiry,
      },
      include: documentInclude,
    });

    return { document: decorate(updated, Date.now()), warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    console.error("[documents] processing failed", error);

    const failed = await prisma.document.update({
      where: { id: created.id },
      data: {
        status: "failed",
        errorMessage: message,
        ocrStatus: "failed",
        // Still classify from the file name so the document is not lost.
        docType: "other",
        category: categoryOf("other"),
      },
      include: documentInclude,
    });

    return {
      document: decorate(failed, Date.now()),
      warnings: [...warnings, `Analysis failed: ${message}. The file is stored and can be reprocessed.`],
    };
  }
}

export async function reprocessDocument(id: string, userId: string): Promise<UploadOutcome> {
  const existing = await prisma.document.findFirst({ where: { id, userId }, include: documentInclude });
  if (!existing) throw new ApiRequestError(404, "Document not found");

  const buffer = await readDocumentFile(existing.storageKey);

  const detected: DetectedFile = {
    mimeType: existing.mimeType,
    extension: existing.extension,
    kind: existing.mimeType === "application/pdf" ? "pdf" : "image",
    ocrCapable: existing.mimeType !== "image/heic",
    previewCapable: !["image/heic", "image/tiff"].includes(existing.mimeType),
  };

  await prisma.document.update({
    where: { id },
    data: { status: "processing", errorMessage: null, ocrStatus: "processing" },
  });

  try {
    const previous = parseExtractedData(existing.extractedData);

    const result = await processDocument({
      buffer,
      filename: existing.originalName,
      detected,
      memberName: existing.familyMember?.name ?? null,
    });

    const keptWarnings = [...result.warnings];

    // A hand-corrected transcription is the user's work, not the reader's.
    // Re-running OCR must not throw it away.
    const keepUserText = previous.textEdited && result.text.length > 0;
    if (keepUserText) {
      keptWarnings.push(
        "You had corrected the extracted text, so your version was kept. This fresh read found " +
          `${result.text.length.toLocaleString()} characters - save the text yourself if you want ` +
          "to replace your correction with it.",
      );
    }

    const expiryDecision = reviewedDate(previous, "expiry");
    const issueDecision = reviewedDate(previous, "issue");

    let expiryDate = result.dates.expiryDate;
    let expirySource = result.dates.expirySource;
    let noExpiry = result.dates.noExpiry;

    if (expiryDecision?.kind === "date") {
      if (
        result.dates.expiryDate &&
        toDateKey(result.dates.expiryDate) !== toDateKey(expiryDecision.date)
      ) {
        keptWarnings.push(
          `Kept the expiry date you confirmed (${formatDate(expiryDecision.date)}); ` +
            `this fresh read suggests ${formatDate(result.dates.expiryDate)}.`,
        );
      }
      expiryDate = expiryDecision.date;
      expirySource = "confirmed by you";
      noExpiry = false;
    } else if (expiryDecision?.kind === "none") {
      expiryDate = null;
      expirySource = null;
      keptWarnings.push(
        "You had marked the detected expiry date as a misread, so this document is left without one.",
      );
    }

    const issueDate = issueDecision?.kind === "date" ? issueDecision.date : result.dates.issueDate;

    // A category the user picked by hand outranks the reader's opinion.
    const manualCategory = existing.classificationSource === "manual";
    if (manualCategory) {
      keptWarnings.push(
        `Kept your category choice (${existing.docType}); the reader suggested "${result.classification.docType}".`,
      );
    }

    const updated = await prisma.document.update({
      where: { id },
      data: {
        status: "ready",
        errorMessage: null,
        processedAt: new Date(),
        ocrText: keepUserText ? existing.ocrText : result.text || null,
        ocrStatus: result.ocrStatus,
        ocrEngine: result.ocrEngine,
        ocrConfidence: result.ocrConfidence,
        docType: manualCategory ? existing.docType : result.classification.docType,
        category: manualCategory ? existing.category : result.classification.category,
        classificationConfidence: manualCategory ? existing.classificationConfidence : result.classification.confidence,
        classificationSource: manualCategory ? existing.classificationSource : result.classification.source,
        extractedData: JSON.stringify(
          buildExtractedData(
            {
              fields: result.fields,
              classification: result.classification,
              pageCount: result.pageCount,
              pagesRead: result.pagesRead,
              labelledDates: result.labelledDates,
            },
            previous,
          ),
        ),
        summary: result.summary,
        summarySource: result.summarySource,
        issueDate,
        expiryDate,
        expirySource,
        noExpiry,
      },
      include: documentInclude,
    });

    return { document: decorate(updated, Date.now()), warnings: keptWarnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reprocessing failed";
    await prisma.document.update({
      where: { id },
      data: { status: "failed", errorMessage: message, ocrStatus: "failed" },
    });
    throw new ApiRequestError(500, message);
  }
}

/** Ids of failed documents, oldest first, capped so one request stays bounded. */
export async function listFailedDocumentIds(userId: string, limit = 10): Promise<string[]> {
  const rows = await prisma.document.findMany({
    where: { userId, status: "failed" },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  return rows.map((row) => row.id);
}

export async function deleteDocument(id: string, userId: string): Promise<void> {
  const existing = await prisma.document.findFirst({
    where: { id, userId },
    select: { storageKey: true },
  });
  if (!existing) throw new ApiRequestError(404, "Document not found");

  // Row first, then the file: a crash in between leaves an orphaned encrypted
  // blob, never a database row pointing at a missing file.
  await prisma.document.delete({ where: { id } });
  await deleteDocumentFile(existing.storageKey);
}

export async function updateDocument(
  id: string,
  userId: string,
  patch: {
    title?: string;
    notes?: string | null;
    docType?: string;
    familyMemberId?: string | null;
    expiryDate?: Date | null;
    issueDate?: Date | null;
    noExpiry?: boolean;
    tags?: string[];
    text?: string;
    dateReview?: { key: string; action: DateDecisionAction; iso?: string };
  },
): Promise<DocumentListItem> {
  const existing = await prisma.document.findFirst({
    where: { id, userId },
    select: { id: true, extractedData: true },
  });
  if (!existing) throw new ApiRequestError(404, "Document not found");

  if (patch.familyMemberId) {
    const member = await prisma.familyMember.findFirst({
      where: { id: patch.familyMemberId, userId },
      select: { id: true },
    });
    if (!member) throw new ApiRequestError(422, "That family member does not belong to your account");
  }

  const extracted = parseExtractedData(existing.extractedData);
  let extractedChanged = false;

  const data: Prisma.DocumentUncheckedUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim().slice(0, 200) || "Untitled";
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  if (patch.docType !== undefined) {
    data.docType = patch.docType;
    data.category = categoryOf(patch.docType);
    data.classificationSource = "manual";
    data.classificationConfidence = 1;
  }
  if (patch.familyMemberId !== undefined) data.familyMemberId = patch.familyMemberId;
  if (patch.expiryDate !== undefined && !patch.dateReview) {
    data.expiryDate = patch.expiryDate;
    data.expirySource = patch.expiryDate ? "manual" : null;
    // Typed by hand, so it must survive the next re-analyse. Recorded as a
    // decision instead of being left for the reader to rediscover.
    if (patch.expiryDate) {
      extracted.reviewed[`expiry:${toDateKey(patch.expiryDate)}:manual`] = {
        action: "expiry",
        iso: toDateKey(patch.expiryDate),
        decidedAt: new Date().toISOString(),
      };
    } else {
      extracted.reviewed["expiry:cleared:manual"] = {
        action: "ignored",
        decidedAt: new Date().toISOString(),
      };
    }
    extractedChanged = true;
  }
  if (patch.issueDate !== undefined) data.issueDate = patch.issueDate;
  if (patch.noExpiry !== undefined) data.noExpiry = patch.noExpiry;

  if (patch.text !== undefined) {
    if (patch.text.length > MAX_TEXT_EDIT_CHARS) {
      throw new ApiRequestError(
        422,
        `That text is too long to save (${patch.text.length.toLocaleString()} characters; the limit is ${MAX_TEXT_EDIT_CHARS.toLocaleString()}).`,
      );
    }
    data.ocrText = patch.text.trim() || null;
    extracted.textEdited = true;
    extractedChanged = true;
  }

  if (patch.dateReview) {
    applyDateReview(extracted, data, patch.dateReview);
    extractedChanged = true;
  }

  if (extractedChanged) data.extractedData = JSON.stringify(extracted);

  const updated = await prisma.document.update({ where: { id }, data, include: documentInclude });

  if (patch.tags) await syncTags(userId, id, patch.tags);

  const withTags = patch.tags
    ? await prisma.document.findFirstOrThrow({ where: { id }, include: documentInclude })
    : updated;

  return decorate(withTags, Date.now());
}

const MAX_DATE_DECISIONS = 60;

/**
 * Records the user's decision about one detected date.
 *
 * The key (`role:iso:page`) is the app's own identifier for a date it found, so
 * it is validated rather than trusted: a decision attached to a role that does
 * not exist would be invisible to the review UI and to the next re-analyse.
 * Confirming a date keeps it where the reader found it; only issue and expiry
 * have columns of their own, and an explicit "use as expiry" moves any date —
 * an appointment date, a renewal date — into the reminder.
 */
function applyDateReview(
  extracted: ExtractedData,
  data: Prisma.DocumentUncheckedUpdateInput,
  review: { key: string; action: DateDecisionAction; iso?: string },
): void {
  const [role, keyIso] = review.key.split(":");

  if (review.key.length > 120 || !role || !(DATE_ROLES as string[]).includes(role)) {
    throw new ApiRequestError(422, "That date is not one this app detected.");
  }

  if (review.action === "ignored") {
    // A decision on this key may have been the one driving the expiry reminder,
    // so rejecting it has to take the reminder with it.
    const drivesExpiry = role === "expiry" || extracted.reviewed[review.key]?.action === "expiry";
    extracted.reviewed[review.key] = { action: "ignored", decidedAt: new Date().toISOString() };

    if (drivesExpiry) {
      data.expiryDate = null;
      data.expirySource = null;
      data.noExpiry = true;
    } else if (role === "issue") {
      data.issueDate = null;
    }
    return;
  }

  const iso = review.iso ?? keyIso;
  if (!iso || !isIsoDate(iso)) throw new ApiRequestError(422, "Enter a valid date, or leave it blank.");

  // Filed under the key of the date this app detected, so the review UI finds
  // the user's answer again; the corrected value lives in the decision itself.
  extracted.reviewed[review.key] = {
    action: review.action,
    ...(review.iso ? { iso: review.iso } : {}),
    decidedAt: new Date().toISOString(),
  };

  // Kept as UTC midnight so a later read in any timezone reports the same
  // calendar day the user settled on.
  const date = new Date(`${iso}T00:00:00.000Z`);

  // "Use as the expiry date" is an expiry decision whatever heading the date was
  // found under, and the reminder columns have to say so.
  if (review.action === "expiry" || role === "expiry") {
    data.expiryDate = date;
    data.expirySource = "confirmed by you";
    data.noExpiry = false;
  }
  if (role === "issue") data.issueDate = date;

  const keys = Object.keys(extracted.reviewed);
  if (keys.length > MAX_DATE_DECISIONS) {
    for (const key of keys
      .sort((a, b) => extracted.reviewed[a]!.decidedAt.localeCompare(extracted.reviewed[b]!.decidedAt))
      .slice(0, keys.length - MAX_DATE_DECISIONS)) {
      delete extracted.reviewed[key];
    }
  }
}

async function syncTags(userId: string, documentId: string, names: string[]): Promise<void> {
  const cleaned = [...new Set(names.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0))].slice(0, 20);

  await prisma.documentTag.deleteMany({ where: { documentId } });
  if (cleaned.length === 0) return;

  for (const name of cleaned) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
    });
    await prisma.documentTag.create({ data: { documentId, tagId: tag.id } });
  }
}

/** Tags with usage counts, for the filter panel and the upload autocomplete. */
export async function listTags(userId: string): Promise<{ name: string; count: number }[]> {
  const rows = await prisma.tag.findMany({
    where: { userId },
    include: { _count: { select: { documents: true } } },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({ name: row.name, count: row._count.documents }));
}

export async function getExpiringDocuments(userId: string, withinDays?: number) {
  const days = withinDays ?? env().EXPIRY_WARNING_DAYS;
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86_400_000);

  const rows = await prisma.document.findMany({
    where: { userId, expiryDate: { lte: horizon } },
    include: documentInclude,
    orderBy: { expiryDate: "asc" },
  });

  return rows.map((row) => decorate(row, Date.now()));
}

/** Documents the user has explicitly marked as never expiring. */
export async function countUntrackedExpiries(userId: string): Promise<number> {
  return prisma.document.count({ where: { userId, expiryDate: null, noExpiry: true } });
}

/** Every document that carries an expiry date, for the calendar and the .ics feed. */
export async function getDocumentsWithExpiry(userId: string) {
  const rows = await prisma.document.findMany({
    where: { userId, expiryDate: { not: null } },
    include: documentInclude,
    orderBy: { expiryDate: "asc" },
  });

  return rows.map((row) => decorate(row, Date.now()));
}

/**
 * Everything the reminders page will list: already expired plus expiring inside
 * the warning window. Counted rather than loaded because the app shell needs it
 * for the navigation badge on every page.
 */
export async function countExpiring(userId: string, withinDays?: number): Promise<number> {
  const days = withinDays ?? env().EXPIRY_WARNING_DAYS;
  const horizon = new Date(Date.now() + days * 86_400_000);
  return prisma.document.count({ where: { userId, expiryDate: { lte: horizon } } });
}

/** Unfiltered vault size, so a filtered list can report "N of M match". */
export async function countDocuments(userId: string): Promise<number> {
  return prisma.document.count({ where: { userId } });
}

export type DashboardStats = {
  totalDocuments: number;
  totalSizeBytes: number;
  expired: number;
  expiringSoon: number;
  processing: number;
  failed: number;
  members: number;
  byCategory: { category: CategoryKey; label: string; count: number }[];
  byDocType: { docType: string; count: number }[];
  recent: DocumentListItem[];
};

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const now = new Date();
  const horizon = new Date(now.getTime() + env().EXPIRY_WARNING_DAYS * 86_400_000);

  const [totalDocuments, totalSize, expired, expiringSoon, processing, failed, members, categoryGroups, typeGroups, recentRows] =
    await Promise.all([
      prisma.document.count({ where: { userId } }),
      prisma.document.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
      prisma.document.count({ where: { userId, expiryDate: { lt: now } } }),
      prisma.document.count({ where: { userId, expiryDate: { gte: now, lte: horizon } } }),
      prisma.document.count({ where: { userId, status: "processing" } }),
      prisma.document.count({ where: { userId, status: "failed" } }),
      prisma.familyMember.count({ where: { userId, archived: false } }),
      prisma.document.groupBy({ by: ["category"], where: { userId }, _count: { _all: true } }),
      prisma.document.groupBy({ by: ["docType"], where: { userId }, _count: { _all: true }, orderBy: { _count: { docType: "desc" } }, take: 6 }),
      prisma.document.findMany({
        where: { userId },
        include: documentInclude,
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  return {
    totalDocuments,
    totalSizeBytes: totalSize._sum.sizeBytes ?? 0,
    expired,
    expiringSoon,
    processing,
    failed,
    members,
    byCategory: CATEGORY_KEYS.map((category) => ({
      category,
      label: CATEGORIES[category].label,
      count: categoryGroups.find((g) => g.category === category)?._count._all ?? 0,
    })).filter((entry) => entry.count > 0),
    byDocType: typeGroups.map((g) => ({ docType: g.docType, count: g._count._all })),
    recent: recentRows.map((row) => decorate(row, Date.now())),
  };
}

/** Materialises the user's vault into the shape the retrieval engine expects. */
export async function getRetrievalDocs(userId: string): Promise<RetrievalDoc[]> {
  const rows = await prisma.document.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      docType: true,
      category: true,
      summary: true,
      extractedData: true,
      ocrText: true,
      issueDate: true,
      expiryDate: true,
      createdAt: true,
      familyMember: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    docType: row.docType,
    category: row.category as CategoryKey,
    memberName: row.familyMember?.name ?? null,
    summary: row.summary,
    fields: safeParseJson<{ fields?: Record<string, string> }>(row.extractedData, {}).fields ?? {},
    text: row.ocrText ?? "",
    issueDate: row.issueDate,
    expiryDate: row.expiryDate,
    createdAt: row.createdAt,
  }));
}
