"use client";

import { useEffect, useMemo, useState } from "react";

import type { VaultDocumentSummary } from "@vault/documents";
import {
  WARNING_DAYS,
  markSeen,
  planReminders,
  readSeenLedger,
  reminderHeadline,
  unseen,
  upcomingConfirmed,
} from "@vault/reminders";

/**
 * What needs attention in this vault, worked out on this device.
 *
 * The honest limit is stated instead of hidden: this app has no server and no
 * push service, so it can only raise something while it is open. A date nobody
 * has confirmed is listed under "check first" and never becomes a reminder.
 */
export function ExpiryAlerts({ documents, onReview }: { documents: VaultDocumentSummary[]; onReview: (id: string) => void }) {
  const plan = useMemo(() => planReminders(documents), [documents]);
  const upcoming = useMemo(() => upcomingConfirmed(documents), [documents]);
  const fresh = useMemo(() => unseen(plan.alerts, readSeenLedger()), [plan]);
  const [notices, setNotices] = useState<"default" | "granted" | "denied" | "unavailable">(() =>
    typeof Notification === "undefined" ? "unavailable" : Notification.permission,
  );

  useEffect(() => {
    if (fresh.length === 0) return;
    markSeen(fresh);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const alert of fresh) void new Notification("FamilyVault", { body: reminderHeadline(alert), tag: alert.key });
    }
  }, [fresh]);

  if (!plan.alerts.length && !plan.needsChecking.length && !upcoming.length) return null;

  return (
    <section className="card">
      <h2>What needs attention</h2>

      {fresh.length ? (
        <ul className="list">
          {fresh.map((alert) => (
            <li className="row" key={alert.key}>
              <div className="row-main">
                <p className="row-title">{reminderHeadline(alert)}</p>
                <p className="row-meta">
                  {alert.owner ? `${alert.owner} · ` : ""}
                  {alert.expiryDate} · confirmed by you
                </p>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onReview(alert.documentId)}>
                  Open it
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.alerts.length && !fresh.length ? (
        <p className="small muted">
          Nothing new to tell you. {plan.alerts.length} date{plan.alerts.length === 1 ? "" : "s"} in your vault
          {plan.alerts.length === 1 ? " is" : "s are"} inside the {WARNING_DAYS}-day window and you have already
          been shown {plan.alerts.length === 1 ? "it" : "them"}.
        </p>
      ) : null}

      {plan.needsChecking.length ? (
        <>
          <p className="small">Check these dates against the original before they can remind you:</p>
          <ul className="list">
            {plan.needsChecking.map((item) => (
              <li className="row" key={item.documentId}>
                <div className="row-main">
                  <p className="row-title">{item.name}</p>
                  <p className="row-meta">{item.expiryDate} · not confirmed yet</p>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onReview(item.documentId)}>
                    Check it
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {upcoming.length ? (
        <p className="small muted">
          Calm for now: {upcoming.map((item) => `${item.name} (${item.expiryDate})`).join(", ")}.
        </p>
      ) : null}

      {notices === "unavailable" ? null : (
        <div className="row-actions">
          {notices === "granted" ? (
            <p className="small muted">This device lets the app show a notice while it is open.</p>
          ) : notices === "denied" ? (
            <p className="small muted">
              Notices are turned off for this app in your browser settings, so it can only show reminders here on
              the screen.
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void Notification.requestPermission().then((permission) => setNotices(permission));
              }}
            >
              Let the app show a notice
            </button>
          )}
          <p className="small muted">
            FamilyVault has no server and no account, so it cannot wake a phone that is closed. It can only tell
            you while the app is open on this device — most families tick the dates again each week when they
            open it.
          </p>
        </div>
      )}
    </section>
  );
}
