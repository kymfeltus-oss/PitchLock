# Pitch Lock

**Canonical folder:** `C:\Users\kymfe\Downloads\PitchLock` — keep all Pitch Lock work here (this is the repo to open in Cursor / connect to Vercel).

Standalone multi-tenant app: pitch / investor room (NDA, deck embed, scheduling, go-live — built incrementally). **Not** the Parable Investments site.

## Local dev

```bash
npm install
npm run dev
```

- Marketing root: [http://localhost:3000](http://localhost:3000)
- Tenant surface: [http://localhost:3000/w/demo](http://localhost:3000/w/demo) (after you run SQL and seed `demo`)

## Supabase

1. Create a **new** Supabase project for this product only.
2. In the SQL editor, run migrations in order: **`20260423120000_init_multi_tenant.sql`**, **`20260423133000_workspace_white_label.sql`**, **`20260423140000_deck_audit_watermark.sql`**, **`20260423160000_pitch_portal_core.sql`**, **`20260423170000_legal_templates_nda_logs.sql`**.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, **`SESSION_JWT_SECRET`** (≥16 chars), **`ADMIN_DEV_PASSWORD`**, **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`** (or `NEXT_PUBLIC_INVESTOR_CONTACT_EMAIL`), and optionally **`NEXT_PUBLIC_SITE_URL`**, **`NEXT_PUBLIC_LEGAL_BRAND_NAME`**, **`OWNER_ALERT_EMAIL`**, **`SUPABASE_EDGE_NDA_AUTOMATION=1`** after deploying the Edge function.

After migrations, fetch the demo pitch id for links:

```sql
select id, public_code from public.pitches where public_code = 'demo-live';
```

## Investor pitch portal (`/pitch/[id]`)

Modular layout:

- **`src/components/white-label/`** — cinematic shell (`WhiteLabelRoot`, `CinematicPanel`, `GlassButton`, `PitchSurfaceContext`).
- **`src/lib/webrtc/PitchRoomClient.ts`** — custom WebRTC stub; replace with signaling + tracks.
- **`src/app/pitch/[id]/`** — investor gate (`/gate`) and war room (`/room`).
- **`src/app/admin/`** — founder dashboard (dev login) and session links.

**Flow:** investor opens **`/pitch/{uuid}/gate`**, signs NDA → API stores **`nda_signatures`**, creates **`pitch_sessions`** + **`pitch_deck_state`**, sets an **httpOnly `jose` JWT** cookie (configure **`SESSION_JWT_SECRET`**). **`/pitch/{uuid}/room`** hosts deck + controls; hosts slide changes via **`POST /api/pitch/.../deck`** (founder cookie **`pr_found`** from **`POST /api/admin/login`**). Deck sync today is **short polling** (~900ms); swap for Realtime or WebSockets when you scale.

**NDA gate:** cinematic UI at **`/pitch/{id}/gate`** (neon `#00f2ff`, step indicator, scroll-tracked legal text from **`legal_templates`**). Signature must **match full name** (case-insensitive). On success: row in **`nda_logs`** (+ **`nda_signatures`**), **24h** httpOnly JWT cookie, redirect to **`/pitch/{id}/start`** (middleware-enforced). **Resend** emails + **PDF** attachment; owner email includes a **read-through** link: **`/nda-review/{nda_log_id}?t={token}`**. Optional **`supabase/functions/nda-automation`** — enable with **`SUPABASE_EDGE_NDA_AUTOMATION=1`** and `supabase functions deploy nda-automation`.

**PDF + duplicate pipeline:** primary path is the Next **`POST /api/pitch/.../nda/sign`** handler; the Edge function is an optional second stage.

**Recording:** **`POST /api/pitch/.../recording/complete`** creates a **`recordings`** row with a private storage key stub. Wire SFU egress / compositor uploads, then set **`status`** to `ready`. **RLS** on `recordings` / `nda_signatures` allows **authenticated workspace members** only; investors never read those tables directly—use **signed URLs** from trusted API code.

## API

- `GET /api/workspaces/[slug]` — public JSON for a workspace (no full NDA body).

## White-label (`/w/[slug]`)

Each workspace row drives the shell: **`name`**, optional **`logo_url`**, **`primary_color`** (hex like `#2563eb`), **`tagline`**, plus embed/scheduling URLs. Browser tab title uses the tenant **`name`**.

- **No product branding** in the tenant shell by default.
- Optional **“Powered by …”** footer: set workspace **`show_powered_by`** to `true` in Supabase **and** set `NEXT_PUBLIC_SHOW_PLATFORM_FOOTER=true` plus `NEXT_PUBLIC_PLATFORM_NAME` in env.

Run migration `20260423133000_workspace_white_label.sql` after the init migration so `tagline` / `show_powered_by` exist.

## Security & compliance (deck)

Run migration **`20260423140000_deck_audit_watermark.sql`** after the above. It adds:

- **`deck_watermark_enabled`** on `workspaces` (default on): repeating overlay on **`/w/[slug]/deck`** with *Viewing for [name]*, optional email, and a UTC timestamp (deters casual screenshots; cannot fully prevent capture).
- **`deck_view_sessions`** and **`deck_audit_events`**: session start, tab visibility, throttled heartbeats (~15s server-side), optional `slide_hint` events for future embed integrations.
- **`audit_dashboard_token`**: read-only founder view at **`/w/[slug]/security?token=YOUR_TOKEN`**. After migration, run `select slug, audit_dashboard_token from workspaces;` in Supabase to copy the token (treat like a password).

**Deck URL:** set `deck_embed_url` to an **HTTPS** embeddable link (Gamma “Share → Embed”, Google Slides publish, etc.). Third-party iframes do not expose per-slide dwell time unless you add a provider-specific integration and call `POST /api/tenants/[slug]/deck/audit` with `action: "slide_hint"`.

## Repo

Open this folder as its own Cursor workspace. Use a separate git remote from any Parable repo.
