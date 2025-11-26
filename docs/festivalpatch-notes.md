# Festivalpatch app – project notes

## Doel

Tool om sneller een festivalpatch te maken:
- Globale bibliotheek met kanaalnamen (Kick In, Snare Top, Lead Vox, …).
- Per event (festival/optreden) kan ik kanaaltjes aanvinken.
- App maakt daar een gesorteerde festivalpatch van: Ch 1 → N.
- Later: per band een matrix (X = kanaal niet in gebruik, naam = wel in gebruik).

Stack:
- Next.js (app router)
- Supabase (Postgres)
- Deployment later via Vercel

## Datamodel (Supabase)

### Tabel: categories
- `id` (uuid, pk)
- `user_id` (uuid, nu null)
- `name` (text) – bv. Drums, Bass, Guitars, Keys, Vocals, FX / Playback, Other
- `sort_order` (int)
- `color` (text, hex)
- timestamps

### Tabel: canonical_channels
- `id` (uuid, pk)
- `user_id` (uuid)
- `category_id` (uuid → categories.id)
- `name` (text) – bv. Kick In, Kick Out, Lead Vox, …
- `default_order` (int) – volgorde binnen categorie
- `is_active` (bool)
- timestamps

### Tabel: events
- `id` (uuid, pk)
- `user_id` (uuid)
- `name` (text) – bv. Testfestival
- `event_date` (date)
- `location` (text)
- `notes` (text)
- timestamps

### Tabel: bands
- `id` (uuid, pk)
- `event_id` (uuid → events.id)
- `name` (text)
- `sort_order` (int) – volgorde op de dag
- `start_time` (time, optioneel)
- `end_time` (time, optioneel)
- timestamps

### Tabel: patch_channels
- `id` (uuid, pk)
- `event_id` (uuid → events.id)
- `channel_number` (int) – 1, 2, 3, …
- `canonical_channel_id` (uuid → canonical_channels.id)
- `custom_name` (text, optioneel)
- `notes` (text, optioneel)
- timestamps
- unique(event_id, channel_number)

### Tabel: band_channel_usage (nog niet gebouwd in UI)
- `id` (uuid, pk)
- `band_id` (uuid → bands.id)
- `patch_channel_id` (uuid → patch_channels.id)
- `is_used` (bool)
- `label` (text, optioneel)
- timestamps
- unique(band_id, patch_channel_id)

## Huidige UI / pagina’s

### /debug/categories
- Haalt alle `categories` op en toont naam + kleur.

### /debug/channels
- Haalt `categories` + `canonical_channels` op.
- Toont per categorie de lijst canonical channels met `default_order`.

### /debug/events
- Haalt `events` + `bands` op.
- Toont per event de bands in `sort_order` met tijden.

### /festival/patch
- Haalt eerste event (nu: Testfestival).
- Haalt `categories` + `canonical_channels`.
- Toont per categorie een rij checkboxes (globale kanaallijst).
- Houdt `selectedChannelIds` in state.

- Onder de checkboxes:
  - Festivalpatch preview:
    - Sorteert geselecteerde kanalen op `category.sort_order` + `default_order`.
    - Toont tabel:
      - Ch (index + 1)
      - Kanaalnaam (canonical_channels.name)

- Knop **"Opslaan als festivalpatch"**:
  - Verwijdert bestaande `patch_channels` voor dit event.
  - Insert nieuwe `patch_channels`:
    - `event_id`
    - `channel_number` (1…N)
    - `canonical_channel_id`

## Volgende stappen / TODO

- UI voor matrix per band:
  - per `patch_channel` kolommen: Band 1, Band 2, Headliner
  - klik in cel:
    - `is_used` togglen (true/false)
    - bij true later optioneel `label` invullen (anders festivalnaam tonen).

- Pagina om bestaand event te kiezen (i.p.v. automatisch eerste event).
- Eenvoudige export (HTML/PDF) van festivalpatch + matrix.
- Later:
  - Login / multi-user (user_id echt gebruiken).
  - Meerdere stages per event (extra tabel `stages`).
  - Desk-specifieke exports (M32/SQ6/etc).