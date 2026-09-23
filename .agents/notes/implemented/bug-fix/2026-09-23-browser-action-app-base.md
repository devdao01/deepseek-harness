# Agent Note: Browser action URLs preserve the application base

Status: implemented

English | [中文](2026-09-23-browser-action-app-base.zh.md)

## Problem

Sub-path frontends publish `__DSH_APP_BASE__`, but native file actions, application discovery/icons, and Session ZIP downloads can address the domain root and receive 404 responses.

## Decision

The three consumers resolve their browser URLs against the absolute application base using the same leading-slash removal and trailing-slash normalization as file uploads. Without the base, they retain their existing origin behavior. Delivery state keys remain Session coordinates; only outgoing requests are rebased. Export preflight and browser download share the resolved URL.

## Alternatives considered

**A shared plugin export.** Importing another feature plugin's runtime helper would violate client layering. A new utility package would expand this focused URL correction into package and build changes.

**Proxy routes at the domain root.** Root aliases would couple deployments and allow applications mounted under different prefixes to compete for the same routes.

## Consequences

The helpers remain local, with a small amount of repeated URL normalization. Focused browser tests cover root deployment and prefixed bases with and without trailing slashes, metadata, open/reveal, application icons and launches, and export preflight/download URLs. The change does not alter Session events or model-visible output.
