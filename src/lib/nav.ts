/**
 * Navigation model.
 *
 * This is a plain module (not a client component) so the server layout can
 * build the list with a real reminder count and hand it to the client shell.
 *
 * Icons are stored as string keys rather than React components: the list
 * crosses the server/client boundary, and component references cannot be
 * serialised. The client shell maps each key back to a lucide icon. The same
 * key doubles as the label lookup in the i18n dictionary, so a nav entry only
 * has to be named once.
 */

export type NavIconKey =
  | "dashboard"
  | "documents"
  | "upload"
  | "family"
  | "reminders"
  | "calendar"
  | "assistant"
  | "vault"
  | "settings";

export type NavItem = {
  href: string;
  labelKey: NavIconKey;
  icon: NavIconKey;
  badge?: number;
};

export function navItems(expiringCount: number): NavItem[] {
  return [
    { href: "/dashboard", labelKey: "dashboard", icon: "dashboard" },
    { href: "/documents", labelKey: "documents", icon: "documents" },
    { href: "/upload", labelKey: "upload", icon: "upload" },
    { href: "/family", labelKey: "family", icon: "family" },
    {
      href: "/reminders",
      labelKey: "reminders",
      icon: "reminders",
      badge: expiringCount > 0 ? expiringCount : undefined,
    },
    { href: "/calendar", labelKey: "calendar", icon: "calendar" },
    { href: "/assistant", labelKey: "assistant", icon: "assistant" },
    { href: "/vault", labelKey: "vault", icon: "vault" },
    { href: "/settings", labelKey: "settings", icon: "settings" },
  ];
}

/** Matches the deepest nav entry for the current path, used for page titles. */
export function activeNavItem(pathname: string, items: NavItem[]): NavItem | undefined {
  const matches = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length);

  return matches[0];
}
