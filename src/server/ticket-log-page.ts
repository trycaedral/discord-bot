import type { TicketTranscriptRow, TranscriptMessage } from "../db/client.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function renderMessage(msg: TranscriptMessage): string {
  const avatar = msg.authorAvatarUrl
    ? `<img class="avatar" src="${escapeHtml(msg.authorAvatarUrl)}" alt="" />`
    : `<div class="avatar avatar-fallback">${escapeHtml(msg.authorDisplayName.slice(0, 1).toUpperCase())}</div>`;

  const attachments = msg.attachments.length
    ? `<div class="attachments">${msg.attachments
        .map(
          (url) =>
            `<a class="attachment" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url.split("/").pop() ?? url)}</a>`,
        )
        .join("")}</div>`
    : "";

  const botBadge = msg.isBot ? `<span class="badge">BOT</span>` : "";
  const content = msg.content
    ? `<div class="content">${escapeHtml(msg.content)}</div>`
    : `<div class="content content-empty">(components only)</div>`;

  return `
    <div class="message">
      ${avatar}
      <div class="message-body">
        <div class="message-header">
          <span class="author">${escapeHtml(msg.authorDisplayName)}</span>
          ${botBadge}
          <span class="timestamp">${formatTimestamp(msg.createdAt)}</span>
        </div>
        ${content}
        ${attachments}
      </div>
    </div>`;
}

export function renderTicketLogPage(ticket: TicketTranscriptRow): string {
  const entries = ticket.transcriptJson ?? [];
  const closedAt = ticket.closedAt
    ? formatTimestamp(ticket.closedAt.toISOString())
    : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Ticket ${escapeHtml(ticket.id)} — Caedral</title>
<style>
  :root {
    --paper: #f5f2ea;
    --ink: #1a1a1a;
    --ink-muted: #565248;
    --sand: #d4c5a9;
    --line: #e4dbc9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }
  .header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 24px; }
  .header h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { color: var(--ink-muted); font-size: 13px; line-height: 1.6; }
  .meta span { display: inline-block; margin-right: 16px; }
  .thread { display: flex; flex-direction: column; gap: 18px; }
  .message { display: flex; gap: 12px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
  .avatar-fallback {
    display: flex; align-items: center; justify-content: center;
    background: var(--sand); color: var(--ink); font-weight: 600; font-size: 14px;
  }
  .message-body { min-width: 0; flex: 1; }
  .message-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .author { font-weight: 600; font-size: 14px; }
  .timestamp { color: var(--ink-muted); font-size: 12px; }
  .badge {
    background: var(--ink); color: var(--paper); font-size: 10px; font-weight: 700;
    padding: 1px 6px; border-radius: 3px; letter-spacing: 0.03em;
  }
  .content { font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .content-empty { color: var(--ink-muted); font-style: italic; }
  .attachments { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
  .attachment { color: var(--ink-muted); font-size: 13px; text-decoration: underline; }
  .empty-state { color: var(--ink-muted); font-size: 14px; padding: 40px 0; text-align: center; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Ticket transcript</h1>
      <div class="meta">
        <span><strong>Category</strong> · ${escapeHtml(ticket.category)}</span>
        <span><strong>Status</strong> · ${escapeHtml(ticket.status)}</span>
        <span><strong>Closed</strong> · ${escapeHtml(closedAt)}</span>
      </div>
    </div>
    <div class="thread">
      ${entries.length ? entries.map(renderMessage).join("\n") : `<div class="empty-state">No messages recorded for this ticket.</div>`}
    </div>
  </div>
</body>
</html>`;
}
