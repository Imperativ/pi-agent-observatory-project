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
- **HTTP-Server (`server.mjs`):**
  - Standardmäßig Loopback auf `127.0.0.1:3000` (Port ist frei).
  - RFC1918-LAN-Modus nur opt-in via `--host`.
  - Strikte CSP, Origin- und Routing-Allowlist.
- **UI (HTML/CSS/JS):**
  - 9 Abschnitte, zentraler Status, Hell/Dunkel-Theme, barrierefrei nach WCAG A/AA (axe-core verifiziert).
  - Grafische Quota-Balken für 5h- und Wochen-Limits für ChatGPT und Gemini.

## Bestätigte Prüfungen (in dieser Sitzung verifiziert)

- `npm run check`: Syntax-Check von 23 JS-Dateien erfolgreich; DOM-Senken-Guard und Schemakonformität bestätigt.
- `npm test`: **89 von 89 Tests bestanden** (inklusive neuer Testsuite für direkte OpenAI- und Google-Quota-Transformer).
- `npm run schema:check`: Ajv-Schema-Kompilierung im Strict-Modus und Negativtests bestanden.
- `npm run status:validate`: Sample-JSON ist schema-konform.
- `npm run smoke`: Serverstart mit Loopback, Routing-Allowlist und Origin-Blockierung verifiziert.
- `npm run test:browser`: Playwright E2E-Lauf (Chromium) inklusive Accessibility (axe WCAG A/AA), Key-Redaktions-Checks, Live-Lebenszeichen, Responsive Design (1200/768/390px) bestanden.
- **Live-Endpunktprüfung:** Direkter Abruf von OpenAI- und Google-Quotas mit echten Tokens im Terminal erfolgreich getestet und in `agent-status.json` geschrieben.

## Strategischer Fahrplan für die Wiederaufnahme

1. **Pi-Live-Erweiterung (`pi-dashboard-extension.mjs`):**
   - Optionaler periodischer Quota-Abgleich während aktiver Pi-Sitzungen (z. B. alle 5 Minuten oder bei `agent_end`).
   - Hook an `after_provider_response` für passive Erfassung von HTTP-Rate-Limit-Headern bei Standard-API-Aufrufen.
2. **Timeline & Filter:**
   - Weiterentwicklung der Activity-Timeline und interaktiver Filter.
3. **Anonymisierter Export:**
   - Export-Funktion für Diagnose-Snapshots ohne Geheimnisse/Tokens.

---

## Anweisung zur Wiederaufnahme

Bei Start einer neuen Sitzung:
1. Verzeichnis betreten: `cd /home/imp/Dokumente/imp-projekte/pi-dashboard`
2. Git-Status und Branch prüfen: `git status --short --branch && git branch --show-current` (muss auf `antiG-work` sein)
3. Handoff lesen: `cat HANDOFF.md`
4. Test-Suite ausführen: `npm test && npm run check && npm run schema:check && npm run smoke`
5. Quota-Status prüfen/aktualisieren: `npm run quota:direct` oder `npm run quota:sync`
