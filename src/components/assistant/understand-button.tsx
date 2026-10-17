import { Sparkles } from "lucide-react";

import { explainQuestion } from "@/lib/ai/prompts";
import { LinkButton } from "@/components/ui/button";

/**
 * "Understand it" — sends the document to the assistant with an explain
 * question, so a person can ask the AI to read a paper for them rather than
 * working through the raw fields themselves.
 */
export function UnderstandButton({ id, title }: { id: string; title: string }) {
  const href = `/assistant?doc=${encodeURIComponent(id)}&q=${encodeURIComponent(explainQuestion(title))}`;

  return (
    <LinkButton
      href={href}
      variant="secondary"
      size="sm"
      icon={<Sparkles className="size-4" aria-hidden="true" />}
    >
      Understand it
    </LinkButton>
  );
}
