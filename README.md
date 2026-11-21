# School Report Management System

Status: school administration, teacher mark entry and review, results, and report-card generation are implemented.

## Setup (first run)
1. The deployment's public Supabase URL and publishable key are configured in `lib/supabase/public-config.ts`. The publishable key is public by design; row-level security remains enforced by Supabase. Keep the service-role key in `.env.local` or the hosting provider's private server-side environment.
2. Auth settings: disable public sign-ups (Authentication, Providers, Email, turn off "Allow new users to sign up").
3. Run all migrations in order: `supabase link --project-ref <ref>` then `supabase db push`
   (`001_core_schema.sql` through `006_assessment_weights.sql`). This also creates the private `student-photos`, `school-assets`, and `report-archives` buckets.
4. Install: `npm install` (config files tsconfig, next, tailwind and postcss are included).
5. Create the first school and administrator (SQL editor, replace placeholders):
   - Authentication, Users, "Add user" with email and password.
   - `insert into schools (name) values ('Your School') returning id;`
   - `insert into profiles (id, full_name) values ('<auth user id>', 'Admin Name');`
   - `insert into school_memberships (school_id, user_id, role) values ('<school id>', '<auth user id>', 'school_admin');`
   - `insert into school_settings (school_id) values ('<school id>');`
6. Run checks: `npm run typecheck && npm test`. Then `npm run dev` and sign in at /login.

## Assessment and report-card setup
- Run migration `006_assessment_weights.sql` before using the assessment configuration or generating reports with configurable weights.
- In **Admin → Academic years**, add the actual assessment components used in each term, then set their labels and relative weights. No separate exam is assumed. A report-card term can contain up to four components to preserve readable assessment columns on one A4 page.
- Configure annual term weights there as well. A third-term report includes the first-, second-, and third-term comparison plus the weighted annual average and position. Earlier term cards omit results from future terms.
- Report generation requires approved marks for official cards. Provisional previews may show submitted marks but do not save official results.

## Production local-admin sign-in (optional)
- Supabase Auth is recommended. To opt in to local sign-in on a private deployment, set `LOCAL_AUTH_ENABLED=true` and `LOCAL_AUTH_ROLE=school_admin` in the hosting provider's private environment settings.
- Also set `LOCAL_AUTH_EMAIL`, a unique `LOCAL_AUTH_PASSWORD` of at least 16 characters, a randomly generated `LOCAL_AUTH_SECRET` of at least 32 characters, and `LOCAL_AUTH_SCHOOL_ID` to an existing school's UUID.
- Configure only `SUPABASE_SERVICE_ROLE_KEY` there for privileged server-side operations. The public URL and publishable key are loaded from `lib/supabase/public-config.ts`; no Vercel public environment variables are required. The service-role key must remain server-only. Never put passwords, signing secrets, or service-role keys in GitHub or `NEXT_PUBLIC_*` variables.
- Production refuses local login when these settings are incomplete and accepts only the `school_admin` role. After setting variables, trigger a fresh deployment. Rotate the password and signing secret if they are exposed.

## Notes
- Files import with `.ts` extensions (allowed by the included tsconfig). Tests run with plain Node 22: `npm test` (no install needed for engine, results and report tests).
- Local PDF generation: Chrome or Edge is detected automatically on Windows; otherwise set `CHROME_PATH` in `.env.local` to the browser executable. On Vercel `@sparticuz/chromium` is used.
- Pages use plain Tailwind elements; shadcn/ui components can replace them later.

## Run order
Apply migrations 001 through 006 in numeric order, then create academic years, classes, subjects (assign with coefficients and groups), students, teachers, and assignments. To connect a different Supabase project, update the URL and publishable key together in `lib/supabase/public-config.ts`.

## Deploy
Push to GitHub, import in Vercel, configure the private server-side service-role key, then deploy.
PDF generation uses `puppeteer-core` with `@sparticuz/chromium` in a Node serverless route (set a generous `maxDuration`).
