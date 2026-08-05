# SmartAttend (IC181 Attendance System)

Production QR + GPS attendance system for IIT Mandi course IC181. React + TypeScript + Vite + Tailwind, backed by Supabase (Postgres, Auth, Edge Functions, Realtime, Storage).

## Git

- Remote: `origin` → https://github.com/PrabhathLolugu/IC181_Attendance.git, branch `main`.
- Auth: no credential helper is configured on this machine, so plain `git push` fails with "could not read Username". Push using the token stored in `.env.deploy` (gitignored, never commit it):
  ```
  git push https://$(grep GITHUB_TOKEN .env.deploy | cut -d= -f2)@github.com/PrabhathLolugu/IC181_Attendance.git main
  ```
  Never write the raw token into a tracked file, commit message, or `.claude/settings.json` — only read it from `.env.deploy` at push time.
- **Commit and push are pre-authorized for this repo.** After finishing a meaningful chunk of work (a feature, fix, or migration), stage the relevant files, commit with a descriptive message, and push to `origin/main` without stopping to ask first. Still use judgment on staging (never `git add -A` blindly — review what's included) and never force-push or rewrite history without explicit confirmation.
- At the start of a new session, check `git status` / `git log origin/main..HEAD`. If commits exist locally that never made it to GitHub (this has happened before — work got committed but not pushed), push them immediately before doing anything else.

## Deploys

- Supabase project ref: `lrxfulaqokfjtxzdznvk`.
- Env vars for migrations/deploys live in `.env.deploy` (gitignored). Load them with `set -a && source .env.deploy && set +a` before any script that needs them — a plain `source` does not export vars to child processes.
- `student-check`, `student-enroll`, `attendance-submit`, `override-code-redeem` are the 4 public-facing Edge Functions and must be deployed with `--no-verify-jwt`. Redeploying any of them without repeating that flag silently re-enables JWT verification and breaks student self-service. After any deploy touching these, verify via the Management API:
  ```
  curl -s "https://api.supabase.com/v1/projects/lrxfulaqokfjtxzdznvk/functions" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
  ```
- Migrations live in `supabase/migrations/`, applied via `scripts/run-migration.mjs`.
- `scripts/verify-rounds.mjs` is a standing regression test (rounds attendance-credit logic + course isolation). Safe to run anytime — uses collision-proof `ZTEST-`/`ZTESTSTU-` prefixes and cleans up after itself. Run it after touching attendance-percentage logic.

## Data model notes

- Courses are isolated by a `courseName` selector (top bar course picker, persisted in `localStorage`). Sessions, attendance stats, and grade categories are all scoped by `course_name`; the student roster and staff accounts are shared globally across courses.
- IC181 is the real, live course — treat its data as production. Use the course picker to create a separate test/demo course for any experimentation rather than adding test data directly under IC181.
