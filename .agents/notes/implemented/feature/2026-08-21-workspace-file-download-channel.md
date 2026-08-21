# Agent Note: Workspace-file GET download channel

Status: implemented

English | [中文](2026-08-21-workspace-file-download-channel.zh.md)

## Problem

Tool cards in the SPA carry `locations` — file paths a tool read or wrote inside the session's workspace. A user viewing a transcript wants to download one of those files to inspect it locally, but the API had no way to hand a workspace file to the browser. The existing download surface, `GET /api/session.export`, only streams the session log ZIP; every other API method is a POST RPC with a JSON envelope, unsuitable for a plain browser download the native download manager can consume. A workspace file also has a security dimension the session-log export does not: the path comes from the client, so a naive read is one `../` or symlink away from streaming any file on the host.

## Decision

A second host-only download channel, mirroring `session.export`: `GET /api/workspace.file?sessionId=…&path=…` streams one regular file from the named session's workspace directory as an `application/octet-stream` attachment (`content-length` from the stat; `content-disposition` names the file's basename with both an ASCII `filename` fallback and an RFC 5987 `filename*=UTF-8''…` ext-value so a non-ASCII name survives the header). `HEAD` returns the same status and headers with the body cancelled, matching the `session.export` preflight shape. The carrier route (`toFetchHandler`) parses the query params through `workspaceFileQuerySchema` (`{ sessionId, path: min(1) }`, the domain's one `sessionIdSchema` brand cast), answering 400 on a malformed query; `ApiProxy.downloads.workspaceFile` implements the read.

**Containment is the security core.** The session's own cwd is the root, resolved by `resolveSessionCwd` without creating or resuming an agent — the live-session header (`ctx.get('sessions')?.get(id)?.header.cwd`) when attached, else the persisted header from `sessionPersistence.inspect(id).meta.cwd`, the same two sources the skills domain and `ensureSession` already read. An unknown or unreadable session, or one with no recorded cwd, answers 404 before any filesystem access. `streamWorkspaceFile` then resolves the requested path (absolute used as-is, relative joined to the root) and `realpath`-canonicalizes BOTH the root and the requested file, so a symlink inside the workspace cannot escape it; the canonical file must equal the canonical root or start with `canonicalRoot + sep`. Outside → 403. A missing file (realpath/stat ENOENT) or a non-regular file (directory, fifo, …) → 404. Only then are bytes streamed, via `node:fs` `createReadStream(path, { signal })` bridged to a web `ReadableStream` with `Readable.toWeb`, so request abort and consumer cancellation destroy the read.

**Why this is safe without auth.** Reachability is the deployment's trust fence: the API carries no auth, and a reachable client can already exfiltrate any workspace file by prompting the agent to read it. A workspace-CONTAINED download therefore widens nothing the client could not already obtain; the containment check exists only to stop the new channel from becoming an arbitrary host-file read outside the workspace.

## Alternatives considered

**A POST RPC method returning file bytes in a JSON envelope.** Every other domain method is a unary POST RPC, so this was the default shape. Rejected: a browser download wants a plain GET the native download manager can follow to a `content-disposition` attachment; base64-in-JSON would bloat the transfer, hold the whole file in one V8 string, and still need a client step to turn it back into a download. `session.export` already set the no-envelope GET-download precedent for exactly this reason, and the new channel reuses it.

**Sanitizing the basename the way `session.export` sanitizes its filename.** `sessionLogZipFilename` neutralizes a session id to a safe segment (`[^A-Za-z0-9_-]` → `_`) because a session id has no meaningful non-ASCII content. A real workspace filename does: mangling `résumé.pdf` to `r_sum_.pdf` degrades the download. Rejected in favor of a proper `content-disposition` builder — ASCII `filename` fallback plus RFC 5987 `filename*` — which keeps the exact name for modern clients while staying header-safe, the "non-ASCII must not break the header" goal the sanitizer only half meets.

**Resolving cwd through `readRaw` like `session.export`.** The log export reads the artifact and requires `supportsRawArtifacts`. The workspace-file read needs only the cwd, which every served session records in its header; reusing the lighter `sessions`/`inspect` cwd sources avoids coupling the file download to a persistence capability it does not use, so a SQLite-backed deployment (no raw artifacts) can still serve workspace files.

## Consequences

The SPA can link a tool-card location straight to `GET /api/workspace.file`, and the browser downloads the file with its real name. The channel is not model-visible and emits no session event, so no snapshot fixture and no `SESSION_FORMAT_VERSION` bump are involved. It costs a second no-envelope route the carrier must keep in step with the RPC fence (both GET-download routes sit above the POST-only guard), and a `stat` on an already-`realpath`'d out-of-containment file runs before the 403 — acceptable because `realpath` already touched that path and only metadata, never content, is read before containment is proven.
