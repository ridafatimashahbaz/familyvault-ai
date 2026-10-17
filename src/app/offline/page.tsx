import { OfflineView } from "@/components/offline/offline-view";

export const metadata = { title: "Offline" };

/**
 * Deliberately outside the signed-in shell and free of any server-side data:
 * the browser can keep a copy of this page and decrypt the device's own saved
 * snapshot into it. It never touches the session or the database.
 */
export default function OfflinePage() {
  return <OfflineView />;
}
