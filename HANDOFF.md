# Übergabe / Zwischenstand — Pi Agent Observatory

## Auftrag, Autorisierung und Speicherort

Der Magos hat die Erstellung eines aktualisierten Handoffs und die Sicherung auf GitHub im neuen Branch `antiG-work` angeordnet, um die Arbeiten nahtlos fortzusetzen.
- **Projektverzeichnis:** `/home/imp/Dokumente/imp-projekte/pi-dashboard` (CachyOS Linux)
- **Git Remote:** `origin` -> `https://github.com/Imperativ/pi-agent-observatory-project.git`
- **Aktiver Entwicklungsbranch:** `antiG-work` (abgeleitet von `CachyOS`)
- **Regel:** Vor jedem Push `origin` prüfen. Jeder geprüfte Meilenstein wird sauber committet und gepusht.

## Aktueller Implementierungsstand

- **Offline-v1 Kernarchitektur:** Versioniertes Sample/Schema, Contract-Normalisierung, Herkunftsangaben (Provenance), strikte Redaktion vertraulicher Daten (Secrets/Credentials in CLI-Befehlen und HTTP-Status). Keine externen Laufzeitabhängigkeiten im Server/Frontend.
- **Direct Fast-Sync Quota-Adapter (`scripts/browser-quota-sync.mjs`):**
  - **OpenAI (ChatGPT Plus / Codex Backend):** Fragt in ~200 ms direkt `https://chatgpt.com/backend-api/wham/usage` über die vorhandene OAuth-Sitzung aus `~/.pi/agent/auth.json` ab (`openai-codex`). Liefert 5h-Fenster (18000 s), Wochenlimit (604800 s) und verbleibende Bonus-Credits.
  - **Google (Gemini & Antigravity):** Fragt in ~250 ms direkt `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels` ab und extrahiert `remainingFraction` sowie den ISO-Reset-Zeitpunkt.
  - **Automatische Token-Erneuerung:** Erkennt abgelaufene Tokens und erneuert sie bei Bedarf automatisch über den Google OAuth Token Endpoint bzw. Pi Bearer CLI.
  - **Ausfallsicherheit / Fallback:** `runSync()` nutzt standardmäßig zuerst die schnelle Direkt-API. Falls keine lokalen OAuth-Tokens vorliegen, erfolgt ein nahtloser Fallback auf den Playwright Chromium Browser-Scraper.
  - **CLI-Steuerung:** `npm run quota:sync` (bevorzugt Direktsync mit Browser-Fallback), `npm run quota:direct` (erzwingt direkten API-Abruf) oder `node scripts/browser-quota-sync.mjs sync [openai|google|auto] [--direct|--browser] [--json]`.
- **Opt-in Pi-Live-Modus (`pi-dashboard-extension.mjs`):**
  - Meldet Lebenszeichen, Lifecycle-Zustände, Modell-/Provider-Metadaten und Kontext-Auslastung via atomarem Writer (`scripts/live-pi-writer.mjs`).
  - `/limits`-Befehl in Pi integriert; `/limits sync` nutzt den neuen schnellen Direkt-Sync.
  - **Passive Rate-Limit-Erfassung:** Hook an `after_provider_response` extrahiert Rate-Limit-Header (Anthropic, OpenAI, IETF-Draft) in Echtzeit und aktualisiert die Kontingente im Dashboard.
  - **Automatischer Quota-Sync:** Periodischer Abgleich im Hintergrund (alle 5 Min.) sowie automatischer Sync bei `agent_settled` / `agent_end` mit Cooldown.
- **Timeline & Interaktive Filter (`src/render.mjs`, `styles.css`):**
  - **Visuelle Timeline:** Verbundene Schiene mit statusabhängigen Indikator-Punkten (blau für *working*, gelb für *waiting*, rot für *failed*, grün für *completed*).
  - **Sortieroption:** Umschaltbar zwischen *Neueste zuerst* (Standard) und *Älteste zuerst* (Chronologischer Ablauf).
  - **Schnellaktionen:** "Alle aufklappen" / "Alle zuklappen" und "Filter zurücksetzen" (wird dynamisch eingeblendet, sobald Filter aktiv sind).
  - **Relative Zeitanzeige:** Berechnung von relativen Zeiten ("gerade eben", "vor X Min./Std.") zusätzlich zum formatierten absoluten Zeitstempel.
- **Anonymisierter Diagnose-Export (`src/export.mjs`, `scripts/export-diagnostics.mjs`):**
  - **Datenschutz & Geheimnisschutz:** Vollständige Filterung aller sensiblen Tokens, Passwörter, Bearer-Header und API-Keys via `redact()`.
  - **Pfadanonymisierung:** Automatische Maskierung systemspezifischer Benutzerpfade (`/home/<user>`, `C:\Users\<user>`).
  - **UI-Download:** Ein Klick auf "Diagnose-Export" im Header lädt einen formatierten Snapshot als JSON herunter.
  - **CLI-Werkzeug:** `npm run export:diagnostics` oder `npm run export:stdout` für Terminal-Export.
- **HTTP-Server (`server.mjs`):**
  - Standardmäßig Loopback auf `127.0.0.1:3000` (Port ist frei).
  - RFC1918-LAN-Modus nur opt-in via `--host`.
  - Strikte CSP, Origin- und Routing-Allowlist (inkl. `/src/export.mjs`).
- **UI (HTML/CSS/JS):**
  - 9 Abschnitte, zentraler Status, Hell/Dunkel-Theme, barrierefrei nach WCAG A/AA (axe-core verifiziert).
  - Grafische Quota-Balken für 5h- und Wochen-Limits für ChatGPT und Gemini.

## Bestätigte Prüfungen (in dieser Sitzung verifiziert)

- `npm run check`: Syntax-Check von **26 JS-Dateien** erfolgreich; DOM-Senken-Guard und Schemakonformität bestätigt.
- `npm test`: **94 von 94 Tests bestanden** (inklusive neuer Testsuites für Diagnose-Export, Header-Parsing und Live-Lifecycle-Hooks).
- `npm run schema:check`: Ajv-Schema-Kompilierung im Strict-Modus und Negativtests bestanden.
- `npm run status:validate`: Sample-JSON ist schema-konform.
- `npm run smoke`: Serverstart mit Loopback, Routing-Allowlist (inkl. `/src/export.mjs`) und Origin-Blockierung verifiziert.
- `npm run test:browser`: Playwright E2E-Lauf (Chromium) inklusive Accessibility (axe WCAG A/AA), Key-Redaktions-Checks, Live-Lebenszeichen, Timeline-Steuerung, Filter-Reset und Diagnose-Download bei allen Breakpoints (1200/768/390px) bestanden.
- **Live-Endpunktprüfung:** Direkter Abruf von OpenAI- und Google-Quotas mit echten Tokens im Terminal erfolgreich getestet und in `agent-status.json` geschrieben.

## Strategischer Fahrplan / Nächste Schritte

1. **Optionale Pi-Dashboard Features:**
   - Visualisierung von Token-Trends im Zeitverlauf bei längeren Sitzungen.
   - Optionale Benachrichtigungstöne oder Desktop-Notifications bei `failed`-Status.
2. **Paketierung:**
   - Vorbereitung eines systemd-User-Services für automatischen Hintergrundstart des Observatoriums auf CachyOS.

---

## Anweisung zur Wiederaufnahme

Bei Start einer neuen Sitzung:
1. Verzeichnis betreten: `cd /home/imp/Dokumente/imp-projekte/pi-dashboard`
2. Git-Status und Branch prüfen: `git status --short --branch && git branch --show-current` (muss auf `antiG-work` sein)
3. Handoff lesen: `cat HANDOFF.md`
4. Test-Suite ausführen: `npm test && npm run check && npm run schema:check && npm run smoke && npm run test:browser`
5. Quota-Status prüfen/aktualisieren: `npm run quota:direct` oder `npm run quota:sync`
