import {
  CalendarClock,
  FileSearch,
  Lock,
  ScanText,
  Sparkles,
  Tags,
  Upload,
} from "lucide-react";

import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { encryptionStatus } from "@/lib/security/crypto";
import { ACCEPTED_EXTENSIONS } from "@/lib/security/upload";
import { listFamilyMembers } from "@/lib/services/family-members";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { UploadForm } from "@/components/documents/upload-form";

export const metadata = { title: "Upload" };

type RawParams = Record<string, string | string[] | undefined>;

const PIPELINE = [
  {
    icon: Lock,
    title: "Checked and stored",
    body: "The real file type is read from its bytes, not its name, then the file is encrypted and written to disk.",
  },
  {
    icon: ScanText,
    title: "Text is read",
    body: "Scans and photos go through OCR. PDFs use their embedded text layer first, which is faster and more accurate.",
  },
  {
    icon: FileSearch,
    title: "Type is identified",
    body: "The text and file name are matched against the document taxonomy, and a confidence score is recorded.",
  },
  {
    icon: Tags,
    title: "Details are extracted",
    body: "Names, numbers and dates are pulled out into fields you can edit, and everything becomes searchable.",
  },
  {
    icon: Sparkles,
    title: "A summary is written",
    body: "A short plain-language summary is generated so you can tell documents apart without opening them.",
  },
  {
    icon: CalendarClock,
    title: "Expiry is tracked",
    body: "Any expiry date found is stored, and the document joins your reminders before it runs out.",
  },
] as const;

export default async function UploadPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireUser();
  const members = await listFamilyMembers(user.id);

  const params = await searchParams;
  const wanted = Array.isArray(params.member) ? params.member[0] : params.member;
  const defaultMemberId = members.find((member) => member.id === wanted)?.id ?? "";

  const encrypted = encryptionStatus() !== "plaintext";

  return (
    <>
      <PageHeader
        title="Upload documents"
        description="Drop in a photo, scan or PDF. FamilyVault reads the text, works out what the document is, pulls out the key details and starts tracking any expiry date."
        icon={Upload}
      />

      {!encrypted ? (
        <Alert tone="warning" title="This vault is not fully set up yet">
          Documents are not being encrypted. Please ask the person who set up this app to finish
          the security setup before storing anything important.
        </Alert>
      ) : null}

      <UploadForm
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          relation: member.relation,
        }))}
        maxUploadMb={env().MAX_UPLOAD_MB}
        extensions={ACCEPTED_EXTENSIONS}
        defaultMemberId={defaultMemberId}
      />

      <Card>
        <CardHeader
          title="What happens to each file"
          description="Every step runs on your own server, so your files stay private."
          icon={<Sparkles className="size-4.5" aria-hidden="true" />}
        />
        <CardBody>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((step) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-accent ring-1 ring-brand-100">
                  <step.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{step.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </>
  );
}
