# reixo — TODO

> Format: `[ ]` = pending · `[x]` = done · `[~]` = in progress · `[!]` = blocked

---

## 🔴 Critical — Fix before next release

_(none currently — no critical security or data-loss issues found)_

---

## 🟠 High — Fix this sprint

- [x] **[BUG] Task Queue — No Backpressure / Unbounded Memory** (`src/utils/queue.ts`)
  - `add()` has no size limit — a buggy caller or draining offline queue can enqueue millions of tasks
  - Exhausts memory with no warning or rejection
  - Fix: add `maxQueueSize` option, reject with clear error once exceeded

---

## 🟡 Medium — Next cycle

- [x] **[DX] Missing Type Exports for Custom Transport Implementors** (`src/index.ts`)
  - `HTTPRequestFunction` and other extension types are not exported from package root
  - Users implementing custom transports have no way to import the type: `import type { HTTPRequestFunction } from 'reixo'` fails
  - Fix: add missing types to main export surface

- [x] **[CONFIG] `exactOptionalPropertyTypes: false` in tsconfig** (`tsconfig.json`)
  - Allows `{ timeout: undefined }` to satisfy `{ timeout?: number }` — causes subtle bugs
  - Users passing `undefined` for optional fields expect them to be ignored
  - Fix: set `"exactOptionalPropertyTypes": true` (requires conditional spreads at assignment sites)

- [x] **[CODE] Queue Error Events Typed as `unknown`** (`src/utils/queue.ts`)
  - `task:error` emits `{ id: string; error: unknown }` — callers can't handle safely without casting
  - Fix: use `Error` type or a typed discriminated union for error events

- [x] **[DX] `sideEffects: false` — verify it's set** (`package.json`)
  - Confirm `"sideEffects": false` is present so bundlers can tree-shake subpath imports
  - Each subpath (`reixo/graphql`, `reixo/ws`, etc.) should only pull what's needed

- [x] **[DX] Result API not shown first in README** (`README.md`)
  - Early examples use try/catch — contradicts the core value prop of the library
  - Fix: make `if (result.ok) / else` the very first code block in Quick Start

---

## 🔵 Low — Backlog

- [x] **[CI] Release job uses Node 22, engines says `>=20`** (`.github/workflows/ci.yml`)
  - Release should test against minimum supported version (Node 20) for consistency
  - Fix: change release job to `node-version: '20'`

- [x] **[CI] No `npm ci` cache in workflows** (`.github/workflows/`)
  - `actions/setup-node` missing `cache: 'npm'` — slow installs on every run
  - Fix: add `cache: 'npm'` to all workflow Node setup steps

- [ ] **[CLEANUP] Remove stale `todos/` and `todo.md`** (repo root)
  - Old planning docs committed to git — should be cleaned up
  - Run: `git rm -r todos/ && git rm todo.md`

- [ ] **[CLEANUP] Remove `SECURITY.md` boilerplate** (repo root)
  - File contains only GitHub's default template text — never filled in
  - Either write a real security policy or delete it

- [ ] **[CLEANUP] Remove committed `playground/dist/`** (repo root)
  - Build artifact that should never have been committed
  - Now in `.gitignore` going forward — but existing committed version needs: `git rm -r playground/dist/`

---

## ✅ Done

- [x] Added subpath exports — `reixo/graphql`, `reixo/ws`, `reixo/sse`, `reixo/mock` (v2.2.0)
- [x] `playground/dist/` added to `.gitignore`
- [x] Added `lint:fix`, `lint:check`, `format:check`, `typecheck`, `check`, `ci`, `validate`, `test:ci` scripts
- [x] Updated `prepublishOnly` to run full `validate`
- [x] `lint` script fixed — no longer auto-fixes (was incorrectly running `--fix`)
- [x] CI quality job: auto-fix formatting + lint, commit-back on PRs only
- [x] CI release job: `git fetch origin && git reset --hard origin/main` to fix "local branch behind remote"
- [x] Docs hero badge + footer version made dynamic (fetched from npm registry on load)
- [x] Docs JSON-LD `version` + `softwareVersion` updated dynamically
- [x] Docs GitHub stars shown dynamically in nav
- [x] Docs "Docs" nav link added (matching logixia pattern)
- [x] Version updated: v2.1.14 → v2.2.0 → v2.2.1 (semantic-release)
