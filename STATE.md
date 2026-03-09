# a11y-crawler (WCAG Crawler) - Current State

**Last Updated:** 2026-03-09
**Status:** Active Development
**Priority:** High

## Active Decisions
- Monorepo with pnpm workspaces: packages/server (Node.js, Express, Playwright, axe-core) + packages/client (React, Vite, Zustand)
- 4-phase scan pipeline: Crawling -> Scanning -> Analyzing (Dedup) -> Reporting
- 3-layer deduplication: crawler redirect check, scanner body fingerprint, Phase 4/4.5 content-duplicate detection
- SQLite via better-sqlite3 (synchronous, no ORM)
- Deploy: Docker on Railway (server), Vercel (client)

## Current Focus
- Dedup system refinement and edge case hardening
- Integration test coverage (being added)
- Phase 4.5 issue-signature fallback validation

## Blockers
- None

## Recent Changes
- Smart deduplication system completed (3-layer + Phase 4.5 issue-signature fallback)
- Body fingerprint fallback for sites without `<main>` element
- Per-page axe-core timeout with Promise.race (60s)
- Region fingerprint extraction timeout (10s)

## Tech Debt
- Integration tests needed for full dedup pipeline
- Multiple edge cases require regression tests: redirect dupes, framework suffixes (.action/.do/.jsf), query param variants, content-identical pages
- Scanner memory management could be improved (sequential browser close)
- Socket.IO pingTimeout at 120s is a workaround, not a fix
