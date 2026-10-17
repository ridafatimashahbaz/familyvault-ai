import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ApiRequestError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { answerQuestion, type AssistantSource } from "@/lib/ai/assistant";
import { safeParseJson } from "@/lib/utils";
import { getRetrievalDocs } from "./documents";

/**
 * Assistant conversations.
 *
 * The answer is always produced from the user's own retrieved documents, and
 * both sides of the exchange are persisted so the chat survives a reload.
 */

export const askSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Ask a slightly longer question")
    .max(1000, "Keep the question under 1000 characters"),
});

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: AssistantSource[];
  engine: string | null;
  createdAt: Date;
};

const HISTORY_LIMIT = 40;

export async function listAssistantHistory(userId: string): Promise<ChatTurn[]> {
  const rows = await prisma.assistantMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT * 4,
  });

  return rows.slice(-HISTORY_LIMIT).map(toTurn);
}

export async function askAssistant(
  userId: string,
  question: string,
): Promise<{ question: ChatTurn; answer: ChatTurn; searched: number; engine: "local" }> {
  const limit = rateLimit(`assistant:${userId}`, 30, 10 * 60_000);
  if (!limit.ok) {
    throw new ApiRequestError(
      429,
      "That is a lot of questions. Please wait a few minutes before asking again.",
    );
  }

  const [docs, members] = await Promise.all([
    getRetrievalDocs(userId),
    prisma.familyMember.findMany({
      where: { userId, archived: false },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const result = await answerQuestion({
    question,
    docs,
    memberNames: members.map((m) => m.name),
  });

  // Written as a pair so a crash between the two still leaves a coherent transcript.
  const [questionRow, answerRow] = await prisma.$transaction([
    prisma.assistantMessage.create({
      data: { userId, role: "user", content: question },
    }),
    prisma.assistantMessage.create({
      data: {
        userId,
        role: "assistant",
        content: result.answer,
        sources: JSON.stringify({ sources: result.sources, engine: result.engine, provider: result.provider }),
      },
    }),
  ]);

  return {
    question: toTurn(questionRow),
    answer: toTurn(answerRow),
    searched: result.searched,
    engine: result.engine,
  };
}

export async function clearAssistantHistory(userId: string): Promise<void> {
  await prisma.assistantMessage.deleteMany({ where: { userId } });
}

type StoredMessage = {
  id: string;
  role: string;
  content: string;
  sources: string | null;
  createdAt: Date;
};

function toTurn(row: StoredMessage): ChatTurn {
  const parsed = safeParseJson<{ sources?: AssistantSource[]; engine?: string }>(row.sources, {});

  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    sources: parsed.sources ?? [],
    engine: parsed.engine ?? null,
    createdAt: row.createdAt,
  };
}
