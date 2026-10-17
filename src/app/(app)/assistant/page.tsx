import Link from "next/link";
import { BotMessageSquare, Info } from "lucide-react";

import { ApiRequestError } from "@/lib/api";
import { aiStatus } from "@/lib/ai/provider";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";
import { listAssistantHistory } from "@/lib/services/assistant";
import { countDocuments, getDocumentForUser } from "@/lib/services/documents";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata = { title: "Assistant" };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const params = await searchParams;

  const [history, documentCount] = await Promise.all([
    listAssistantHistory(user.id),
    countDocuments(user.id),
  ]);

  const ai = aiStatus();
  const question = first(params.q).slice(0, 1000);
  const focus = await resolveFocus(first(params.doc), user.id);

  return (
    <>
      <PageHeader
        title={t.assistant.title}
        description={`${t.assistant.description} ${t.assistant.emptyBody}`}
        icon={BotMessageSquare}
      />

      {focus ? (
        <Alert tone="info" title={format(t.assistant.focusTitle, { title: focus.title })}>
          {t.assistant.focusBody}{" "}
          <Link href={`/documents/${focus.id}`} className="font-medium underline">
            {t.assistant.openDocument}
          </Link>
          .
        </Alert>
      ) : null}

      <AssistantChat
        initialTurns={history.map((turn) => ({
          id: turn.id,
          role: turn.role,
          content: turn.content,
          sources: turn.sources,
          engine: turn.engine,
          createdAt: turn.createdAt.toISOString(),
        }))}
        documentCount={documentCount}
        engineLabel={ai.label}
        autoAsk={question.length >= 3 ? question : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t.assistant.howTitle}
            icon={<Info className="size-4.5" aria-hidden="true" />}
          />
          <CardBody>
            <ol className="space-y-2.5 text-sm leading-relaxed text-ink-600">
              <li>
                <span className="font-medium text-ink-900">{t.assistant.how1Title}</span>{" "}
                {t.assistant.how1Body}
              </li>
              <li>
                <span className="font-medium text-ink-900">{t.assistant.how2Title}</span>{" "}
                {t.assistant.how2Body}
              </li>
              <li>
                <span className="font-medium text-ink-900">{t.assistant.how3Title}</span>{" "}
                {t.assistant.how3Local}
              </li>
              <li>
                <span className="font-medium text-ink-900">{t.assistant.how4Title}</span>{" "}
                {t.assistant.how4Body}
              </li>
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.assistant.examplesTitle} />
          <CardBody>
            <ul className="space-y-2 text-sm leading-relaxed text-ink-600">
              {t.assistant.examples.map((example) => (
                <li key={example} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span>{example}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/** The `?doc=` link from a document page is a hint, not a requirement. */
async function resolveFocus(
  id: string,
  userId: string,
): Promise<{ id: string; title: string } | null> {
  if (!id) return null;

  try {
    const doc = await getDocumentForUser(id, userId);
    return { id: doc.id, title: doc.title };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}
