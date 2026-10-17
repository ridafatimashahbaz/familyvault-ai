import type { ReactNode } from "react";
import Link from "next/link";
import { Download, HardDrive, KeyRound, Lock, Palette, Settings, ShieldCheck, User } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getDashboardStats } from "@/lib/services/documents";
import { getProfile } from "@/lib/services/users";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { OfflineSnapshotCard } from "@/components/offline/offline-snapshot-card";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  const [profile, stats] = await Promise.all([getProfile(user.id), getDashboardStats(user.id)]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account, your preferences, and how your documents are kept safe."
        icon={Settings}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Appearance"
            description="Choose a light or dark theme — it is remembered on this device"
            icon={<Palette className="size-4.5" aria-hidden="true" />}
          />
          <CardBody>
            <ThemeToggle />
          </CardBody>
        </Card>

        <OfflineSnapshotCard />

        <Card>
          <CardHeader
            title="Install the app"
            description="Add FamilyVault to your phone, tablet or computer"
            icon={<Download className="size-4.5" aria-hidden="true" />}
          />
          <CardBody className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-600">
              FamilyVault opens full-screen with its own icon on any device — no app store needed.
              Use this on every device you want it on.
            </p>
            <LinkButton href="/install" variant="secondary" size="sm">
              See how to install
            </LinkButton>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Profile"
            description="One account covers the whole household"
            icon={<User className="size-4.5" aria-hidden="true" />}
          />
          <CardBody>
            <ProfileForm
              name={profile.name}
              email={profile.email}
              memberSince={formatDateTime(profile.createdAt)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Password"
            description="Keep your account safe with a strong, unique password"
            icon={<KeyRound className="size-4.5" aria-hidden="true" />}
          />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Your vault"
            description="What you have stored so far"
            icon={<HardDrive className="size-4.5" aria-hidden="true" />}
          />
          <CardBody className="space-y-4">
            <dl className="space-y-2.5 text-sm">
              <Row label="Documents">
                {stats.totalDocuments} {stats.totalDocuments === 1 ? "document" : "documents"}
              </Row>
              <Row label="Storage used">{formatBytes(stats.totalSizeBytes)}</Row>
              <Row label="Family members">{stats.members}</Row>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Privacy and security"
            description="How your documents are protected"
            icon={<ShieldCheck className="size-4.5" aria-hidden="true" />}
          />
          <CardBody className="space-y-3 text-sm leading-relaxed text-ink-600">
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              Every document is encrypted as it is saved, so it never stays on disk as an open file.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                These documents are read by the app itself — on this server, never sold and never
                sent to anyone else — so it can search inside them, sort them and summarise them.
                Files in your{" "}
                <Link
                  className="font-medium text-accent underline-offset-2 hover:underline"
                  href="/vault"
                >
                  private vault
                </Link>{" "}
                are different: they are locked inside your browser before they are stored, and the
                app cannot read their names or their contents.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              Files are checked by what they actually contain, not by their name, so anything unsafe
              is refused.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink-800">{children}</dd>
    </div>
  );
}
