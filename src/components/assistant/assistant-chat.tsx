"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BotMessageSquare, Eraser, Send, Sparkles, User } from "lucide-react";

import { apiFetch, describeError } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/toast";
import { useLocale } from "@/components/locale-provider";
import { MicButton, speechErrorMessage } from "@/components/voice/mic-button";
import { SpeakButton } from "@/components/voice/speak-button";
import { VoiceHelp } from "@/components/voice/voice-help";
import { useSpeechRecognition } from "@/components/voice/use-speech-recognition";
import { classifyIntent, INTENT_QUESTIONS } from "@/lib/voice/intent";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "@/lib/voice/speech";

/** Native names, so the picker reads the same in either UI language. */
const SPEECH_LANGUAGE_LABELS: Record<SpeechLanguage, string> = {
  en: "English",
  ur: "اردو",
  pa: "پنجابی",
};

export type AssistantSource = {
  id: string;
  title: string;
  docTypeLabel: string;
  memberName: string | null;
  score: number;
  snippet: string;
};

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: AssistantSource[];
  engine: string | null;
  createdAt: string;
};

type AskResult = {
  question: ChatTurn;
  answer: ChatTurn;
  searched: number;
  engine: "local";
};

/**
 * Chat over the user's own vault.
 *
 * The answer is assembled on the server from retrieved documents, so this
 * component only sends a question and renders what comes back, including the
 * sources it was built from — an answer you cannot check is not much use for
 * something as consequential as a passport number.
 */
export function AssistantChat({
  initialTurns,
  documentCount,
  engineLabel,
  autoAsk,
}: {
  initialTurns: ChatTurn[];
  documentCount: number;
  engineLabel: string;
  autoAsk?: string;
}) {
  const toast = useToast();
  const { t, translate, locale } = useLocale();
  const suggestions = t.assistant.examples;

  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState<number | null>(null);
  const [speechLanguage, setSpeechLanguage] = useState<SpeechLanguage>(locale === "ur" ? "ur" : "en");
  const [heard, setHeard] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const askedRef = useRef<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, asking]);

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || asking) return;

    setInput("");
    setHeard(null);
    setAsking(true);
    setError(null);

    // Shown immediately so the conversation does not look frozen during OCR-heavy retrieval.
    const pendingId = `pending-${Date.now()}`;
    const pending: ChatTurn = {
      id: pendingId,
      role: "user",
      content: question,
      sources: [],
      engine: null,
      createdAt: new Date().toISOString(),
    };
    setTurns((current) => [...current, pending]);

    try {
      const result = await apiFetch<AskResult>("/api/assistant", {
        method: "POST",
        body: { question },
      });

      setTurns((current) => [...current.filter((turn) => turn.id !== pendingId), result.question, result.answer]);
      setSearched(result.searched);
    } catch (caught) {
      setTurns((current) => current.filter((turn) => turn.id !== pendingId));
      setInput(question);
      setError(describeError(caught));
    } finally {
      setAsking(false);
      inputRef.current?.focus();
    }
  }

  // A link from the dashboard or a document page arrives with the question in the URL.
  useEffect(() => {
    if (!autoAsk || askedRef.current === autoAsk) return;
    askedRef.current = autoAsk;
    void ask(autoAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk]);

  // Speech is understood on the device; see use-speech-recognition.
  const recognition = useSpeechRecognition({
    language: speechLanguage,
    onResult: (transcript) => {
      // A short spoken instruction becomes an action; anything else is dictated
      // into the box for the person to review before sending.
      const mapped = INTENT_QUESTIONS[classifyIntent(transcript)];
      if (mapped) void ask(mapped);
      else {
        setInput(transcript);
        setHeard(transcript);
        inputRef.current?.focus();
      }
    },
  });

  async function clear() {
    setClearing(true);
    try {
      await apiFetch("/api/assistant", { method: "DELETE" });
      setTurns([]);
      setSearched(null);
      toast.success(t.assistant.cleared);
    } catch (caught) {
      toast.error(describeError(caught));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex min-h-[32rem] flex-col rounded-card border border-ink-200/80 bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-accent ring-1 ring-brand-100">
            <BotMessageSquare className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{t.assistant.chatTitle}</p>
            <p className="truncate text-xs text-ink-500">
              {documentCount === 0
                ? t.assistant.noDocs
                : searched !== null
                  ? translate(t.assistant.searchedSummary, { found: searched, total: documentCount })
                  : translate(t.assistant.searchingSummary, { count: documentCount })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="neutral" icon={<Sparkles className="size-3" aria-hidden="true" />}>
            {engineLabel}
          </Badge>
          {turns.length > 0 ? (
            <IconButton label={t.assistant.clearConversation} onClick={clear} disabled={clearing || asking}>
              {clearing ? <Spinner className="size-4" /> : <Eraser className="size-4" aria-hidden="true" />}
            </IconButton>
          ) : null}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {turns.length === 0 ? (
          <EmptyState
            icon={BotMessageSquare}
            title={t.assistant.emptyTitle}
            description={documentCount === 0 ? t.assistant.emptyNoDocs : t.assistant.emptyBody}
            action={
              documentCount > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={asking}
                      onClick={() => void ask(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              ) : null
            }
          />
        ) : (
          turns.map((turn) => <Bubble key={turn.id} turn={turn} />)
        )}

        {asking ? (
          <div className="flex items-center gap-2 text-sm text-ink-500" aria-live="polite">
            <Spinner className="size-4" />
            {t.assistant.reading}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <div className="border-t border-ink-100 px-4 py-3 sm:px-5">
        {error ? (
          <Alert tone="danger" className="mb-3">
            {error}
          </Alert>
        ) : null}
        {recognition.error ? (
          <Alert tone="warning" className="mb-3">
            {speechErrorMessage(recognition.error, t)}
          </Alert>
        ) : null}

        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className="sr-only">{t.voice.speakLanguage}</span>
            <select
              value={speechLanguage}
              onChange={(event) => setSpeechLanguage(event.target.value as SpeechLanguage)}
              className="h-8 rounded-lg border border-ink-200 bg-surface px-2 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
            >
              {SPEECH_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {SPEECH_LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          <VoiceHelp onDeviceAvailable={recognition.canUseOnDevice} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(input);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="assistant-question" className="sr-only">
            {t.assistant.inputLabel}
          </label>
          <textarea
            id="assistant-question"
            ref={inputRef}
            rows={1}
            value={input}
            disabled={asking}
            maxLength={1000}
            placeholder={documentCount === 0 ? t.assistant.inputNoDocs : t.assistant.placeholder}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(input);
              }
            }}
            className="max-h-40 min-h-10 flex-1 resize-y rounded-lg border border-ink-300 bg-surface px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors hover:border-ink-400 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink-50"
          />
          <MicButton
            listening={recognition.listening}
            requesting={recognition.requesting}
            working={recognition.working}
            progress={recognition.progress}
            supported={recognition.supported}
            disabled={asking}
            onToggle={recognition.toggle}
          />
          <Button
            type="submit"
            loading={asking}
            disabled={!input.trim() || documentCount === 0}
            icon={asking ? undefined : <Send className="size-4 flip-rtl" aria-hidden="true" />}
          >
            {t.assistant.ask}
          </Button>
        </form>

        {heard && !asking ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-accent" aria-live="polite">
            <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
            {translate(t.voice.transcriptReady, { text: heard })}
          </p>
        ) : null}

        <p className="mt-2 text-xs text-ink-400">{t.assistant.hintLine}</p>
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  const { t, translate } = useLocale();

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "flex max-w-[85%] flex-row-reverse gap-2.5" : "flex max-w-[85%] gap-2.5"}>
        <span
          className={
            isUser
              ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"
              : "flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"
          }
        >
          {isUser ? (
            <User className="size-4" aria-hidden="true" />
          ) : (
            <BotMessageSquare className="size-4" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 space-y-2">
          <div
            className={
              isUser
                ? "rounded-2xl rounded-tr-sm bg-brand-700 px-3.5 py-2.5 text-sm leading-relaxed text-white"
                : "rounded-2xl rounded-tl-sm border border-ink-200 bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink-800"
            }
          >
            <p className="whitespace-pre-wrap break-words">{turn.content}</p>
          </div>

          {!isUser && turn.sources.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                {translate(t.assistant.fromCount, { count: turn.sources.length })}
              </p>
              <ul className="space-y-1.5">
                {turn.sources.map((source) => (
                  <li key={source.id}>
                    <Link
                      href={`/documents/${source.id}`}
                      className="block rounded-lg border border-ink-200 bg-ink-50/70 px-3 py-2 transition-colors hover:border-brand-300 hover:bg-brand-50"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-xs font-semibold text-ink-900">
                          {source.title}
                        </span>
                        <span className="text-xs text-ink-500">{source.docTypeLabel}</span>
                        {source.memberName ? (
                          <span className="text-xs text-ink-500">· {source.memberName}</span>
                        ) : null}
                      </span>
                      {source.snippet ? (
                        <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-ink-600">
                          {source.snippet}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <span>{formatDateTime(turn.createdAt)}</span>
            {!isUser && turn.engine ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{turn.engine}</span>
              </>
            ) : null}
            {!isUser ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <SpeakButton
                  id={`${turn.id}-en`}
                  text={turn.content}
                  language="en"
                  label={SPEECH_LANGUAGE_LABELS.en}
                />
                <SpeakButton
                  id={`${turn.id}-ur`}
                  text={turn.content}
                  language="ur"
                  label={SPEECH_LANGUAGE_LABELS.ur}
                />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
