"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarDays, FolderOpen, LayoutDashboard, Lock, Menu, MessageCircle, Search, Settings, Upload, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn, initials } from "@/lib/utils";
import { activeNavItem, type NavIconKey, type NavItem } from "@/lib/nav";
import { Logo } from "@/components/brand";
import { AssistantFab } from "@/components/assistant/assistant-fab";
import { IconButton } from "@/components/ui/button";
import { IconThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { useLocale } from "@/components/locale-provider";

/**
 * Nav icons live here, on the client side of the boundary: the server sends an
 * icon *key*, and this map turns it back into a component. The same key is
 * resolved against the i18n dictionary for the label.
 */
const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  documents: FolderOpen,
  upload: Upload,
  family: Users,
  reminders: Bell,
  calendar: CalendarDays,
  assistant: MessageCircle,
  vault: Lock,
  settings: Settings,
};

export type ShellUser = { name: string; email: string };

/**
 * The signed-in frame: a fixed sidebar on desktop, a slide-over drawer below
 * lg. Pages supply their own heading, so the top bar only carries the things
 * that are useful everywhere - search, upload and the account menu.
 *
 * Everything is laid out with logical utilities (start/end, ps/pe, ms/me) so
 * the whole frame mirrors correctly when the document switches to RTL for Urdu.
 */
export function AppShell({
  user,
  nav,
  banner,
  footer,
  children,
}: {
  user: ShellUser;
  nav: NavItem[];
  banner?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useLocale();

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const current = activeNavItem(pathname, nav);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-raised"
      >
        {t.common.skipToContent}
      </a>

      <Sidebar nav={nav} user={user} footer={footer} className="fixed inset-y-0 start-0 z-30 hidden lg:flex" />

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t.common.menu}>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t.common.closeMenu}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <Sidebar
            nav={nav}
            user={user}
            footer={footer}
            onClose={() => setDrawerOpen(false)}
            className="animate-fade-up absolute inset-y-0 start-0 flex w-[17rem] max-w-[85vw] shadow-raised"
          />
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col lg:ps-64">
        <header className="sticky top-0 z-20 border-b border-ink-200/80 bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <IconButton
              label={t.common.openMenu}
              className="-ms-2 lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-5" aria-hidden="true" />
            </IconButton>

            <Link href="/dashboard" className="lg:hidden">
              <Logo compact />
              <span className="sr-only">FamilyVault AI</span>
            </Link>

            <span className="hidden min-w-0 text-sm font-medium text-ink-500 lg:block">
              {current ? t.nav[current.labelKey] : "FamilyVault AI"}
            </span>

            <div className="ms-auto flex items-center gap-2">
              <QuickSearch className="hidden md:block" />

              <LocaleToggle />

              <IconThemeToggle />

              <Link
                href="/upload"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-800 md:h-9"
              >
                <Upload className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t.common.upload}</span>
                <span className="sm:hidden">{t.common.add}</span>
              </Link>

              <span
                className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-accent sm:flex"
                title={user.email}
                aria-hidden="true"
              >
                {initials(user.name) || initials(user.email)}
              </span>
            </div>
          </div>

          <div className="md:hidden">
            <QuickSearch className="px-4 pb-3 sm:px-6" />
          </div>
        </header>

        {banner ? <div className="px-4 pt-4 sm:px-6 lg:px-8">{banner}</div> : null}

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
        </main>

        <footer className="border-t border-ink-200/70 px-4 py-4 text-xs text-ink-400 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
            <p>{t.common.footerSecure}</p>
            <p>
              <Link href="/settings" className="hover:text-ink-600 hover:underline">
                {t.common.systemStatus}
              </Link>
            </p>
          </div>
        </footer>
      </div>

      <AssistantFab />
    </div>
  );
}

function Sidebar({
  nav,
  user,
  footer,
  className,
  onClose,
}: {
  nav: NavItem[];
  user: ShellUser;
  footer: ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLocale();

  // The assistant is reached through the floating button, not this list.
  const items = nav.filter((item) => item.href !== "/assistant");

  return (
    <aside
      className={cn(
        "w-64 flex-col border-e border-ink-200/80 bg-surface",
        className,
      )}
      aria-label={t.common.sidebar}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Link href="/dashboard" onClick={onClose}>
          <Logo />
        </Link>
        {onClose ? (
          <IconButton label={t.common.closeMenu} className="lg:hidden" onClick={onClose}>
            <X className="size-5" aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label={t.common.mainNav}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = NAV_ICONS[item.icon];

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-accent ring-1 ring-inset ring-brand-100"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              <Icon
                className={cn(
                  "size-4.5 shrink-0 transition-colors",
                  active ? "text-accent" : "text-ink-400 group-hover:text-ink-600",
                )}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{t.nav[item.labelKey]}</span>
              {item.badge ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.7rem] font-semibold tabular-nums",
                    active ? "bg-brand-600 text-white" : "bg-amber-100 text-amber-900",
                  )}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-ink-100 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-ink-50"
            aria-hidden="true"
          >
            {initials(user.name) || initials(user.email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink-900">{user.name}</span>
            <span className="block truncate text-xs text-ink-500">{user.email}</span>
          </span>
        </div>
        {footer}
      </div>
    </aside>
  );
}

/** Submits to the documents list, which reads its query from the URL. */
function QuickSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const { t } = useLocale();

  return (
    <form
      className={cn("relative w-full max-w-xs", className)}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const q = term.trim();
        router.push(q ? `/documents?q=${encodeURIComponent(q)}` : "/documents");
      }}
    >
      <label htmlFor="shell-search" className="sr-only">
        {t.common.search}
      </label>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden="true"
      />
      <input
        id="shell-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t.common.searchPlaceholder}
        className="h-9 w-full rounded-lg border border-ink-200 bg-ink-50/60 ps-9 pe-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors hover:border-ink-300 focus:border-brand-500 focus:bg-surface focus:outline-none"
      />
    </form>
  );
}
