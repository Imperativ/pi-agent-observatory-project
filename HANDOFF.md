# Übergabe / bewusste Pause — Pi Agent Observatory

## Auftrag, Autorisierung und Speicherort

Der Magos hat die Erstellung eines aktualisierten Handoffs und die Sicherung auf GitHub angeordnet, um die Sitzung zu einem späteren Zeitpunkt nahtlos fortzusetzen.
- **Projektverzeichnis:** `D:/imp-projekte/Pi-Dashboard`
- **Git Remote:** `origin` -> `https://github.com/Imperativ/pi-agent-observatory-project.git` (Branch `main`)
- **Regel:** Vor jedem Push `origin` prüfen. Jeder geprüfte Projektpunkt wird separat committet und gepusht.

## Aktueller Implementierungsstand

- **Zielplattform:** Unter Windows 11 entwickelt und für Windows 11 vorgesehen. Andere Betriebssysteme sind für diesen Stand nicht als Zielplattform abgenommen. Eine Arch-Linux-spezialisierte Version soll in einem separaten, noch anzulegenden Branch entstehen; keine Arch-Linux-Freigabe für `main` behaupten.
- **Offline-v1 Architektur:** Versioniertes Sample/Schema, Contract-Normalisierung, Herkunftsangaben (Provenance), Redaktion vertraulicher Daten (Secrets/Credentials in CLI-Befehlen und HTTP-Status). Optionaler manueller Pi-JSONL-Exporter übernimmt ausschließlich anonymisierte Metadaten.
- **Opt-in Pi-Live-Modus:** `pi-dashboard-extension.mjs` meldet Lebenszeichen, Pi-Lifecycle-Zustand, bekannten Anbieter/Modellfamilie (keine rohe Modell-ID), bekannte Standard-Werkzeugnamen und bei Verfügbarkeit Kontextschätzung über einen exklusiven, atomaren Writer (`scripts/live-pi-writer.mjs`). Zusätzlich: gültiger Pi-Sitzungs-/Agentenlaufstart, feste Lifecycle-Ereignisse, numerische Token-Summen aus dem aktiven Zweig, aktive Shell-/Dateiwerkzeuge und lokale Node-/Windows-Build-Angaben. Arbeitsverzeichnis und lokales Git-Repository/Branch nur mit `PI_DASHBOARD_INCLUDE_WORKSPACE=1` veröffentlichen (LAN ist ohne Anmeldung). Keine Prompts, Sitzungspfade/-IDs, Berechtigungsannahmen oder Kontoquoten aus diesen Messungen ableiten. Manuelle Quota-Zeit bleibt über Heartbeats erhalten. Ohne Pi-Extension bleibt die Sample-/Datei-Logik unverändert; isolierter Pi-RPC-Start/Ende erfolgreich, produktiver Agentenlauf noch nicht abgenommen.
- **HTTP-Server:** Standardmäßig Loopback; expliziter RFC1918-IPv4-LAN-Modus per `--host` für den einzelnen Besitzer. Routing-Allowlist, Host/Origin/CSP-Schutz, redigierter Status, Sample-Fallback. LAN-Modus hat keine Anmeldung/TLS; Firewall und Router-Konfiguration sind nicht geprüft.
- **Store & Refresh:** Polling, Timeout-Handling, Retention des letzten validen Snapshots bei Fehler.
- **UI (HTML/CSS/JS):** 9 Abschnitte, zentraler Status, Hell/Dunkel-Theme, A11y-Grundgerüst (WCAG A/AA via axe-core in Playwright verifiziert). Modell & Anbieter prominent auf den ersten Blick im Kopfbereich und in der Übersichtskachel; grafische Quota-Meters für ChatGPT/OpenAI-Limits (5h- und Weekly-Limit).
- **Dokumentation & Verträge:** `CONTRACT.md`, `README.md`, `VERIFICATION.md`, `HANDOFF.md` und `TELEMETRY.md`; letztere trennt Sitzungsnutzung von Account-/API-Quoten und beschreibt nur geplante, nicht implementierte externe Adapter.

## Bestätigte Prüfungen (in der aktuellen Sitzung re-validiert)

- `npm run check`: Syntax-Check von 23 JS-Dateien erfolgreich.
- `npm test`: **90 von 90 Tests bestanden** (59 Contract, 6 Browser-Quota-Sync, 8 Live-Tests, 5 Exporter, 5 HTTP/Server und 7 Store).
- `npm run schema:check`: Ajv-Schema-Kompilierung und Negativtest-Suite erfolgreich.
- `npm run status:validate`: Sample-JSON ist schema-konform.
- `npm run smoke`: Standard-Loopback-Serverstart über `npm start -- --port 0` mit Allowlist- & Routing-Regeln verifiziert; LAN-Host/Origin separat mit simulierten HTTP-Anfragen geprüft, keine Abnahme über ein zweites Gerät.
- `npm run test:browser`: Playwright E2E-Lauf (Chromium) inklusive Accessibility (axe WCAG A/AA), Key-Redaktions-Checks, Live-Lebenszeichen (aktiv/veraltet/beendet), Modell-auf-den-ersten-Blick, grafischer ChatGPT-Limits, Layout-/A11y-Prüfungen bei 1200/768/390px, Dunkelmodus und `prefers-reduced-motion` erfolgreich. Manuelle Abnahme bleibt offen.
- `git status`: Vor Commit/Push den aktuellen Arbeitsbaum erneut prüfen; die letzte Baseline war `98a56f7` auf `main`.

## Strategischer Fahrplan für die Wiederaufnahme (Nächste Phasen)

### Phase 1: Härtung & Live-Daten-Adapter (v1 Finalisierung)
1. **Multi-Device & A11y Härtung:**
   - Automatisierte Prüfungen für `prefers-reduced-motion` und 1200/768/390px in `scripts/browser-check.mjs` ergänzt und bestanden.
   - **Offen:** Manuelle Screenreader-, Tastatur- und visuelle Abnahme an realen Geräten.
2. **Minimaler Pi-Status-Generator (`scripts/generate-pi-status.mjs`):**
   - Implementiert: explizite JSONL-Auswahl, begrenztes Lesen, Whitelist-Metadaten, `--dry-run`/`--write`, atomarer Schreibpfad und synthetische Regressionstests.
   - **Offen:** kontrollierte Abnahme mit einer ausdrücklich durch `--extension` gestarteten echten Pi-Instanz sowie einem zweiten LAN-Gerät. Aktive Pi-Erkennung erfolgt nur für diese Instanz, keine automatische Sitzungssuche; weitere Live-Werte erst nach eigener Herkunftsprüfung.

### Phase 2: Feature-Erweiterungen (v1.1 / v2)
3. **Interaktive Activity-Timeline & Filter:**
   - Status- und Kategorie-Filter sowie Suche in Zusammenfassung/Kategorie im UI vorhanden und im Browsertest geprüft.
   - **Offen:** weitergehende Timeline-Interaktion nach konkreter Spezifikation.
4. **Anonymisierter Snapshot-Export:**
   - **Offen:** Export-Schaltfläche `("Snapshot anonymisiert herunterladen")` für Diagnose-Zwecke; Datenschutzgrenzen und ausdrückliche Freigabe vor Einführung klären.

---

## Empfohlene Sub-Agenten-Aufteilung für die Wiederaufnahme

Für die Fortführung der Arbeiten stehen folgende spezialisierte Sub-Agenten bereit:

1. **`Agent Alpha` (UI & Accessibility):**
   - *Fokus:* `index.html`, `styles.css`, `scripts/browser-check.mjs`.
   - *Aufgabe:* A11y-Schärfung, Viewport-Matrix, `prefers-reduced-motion`.
2. **`Agent Beta` (Live-Data Adapter):**
   - *Fokus:* `scripts/generate-pi-status.mjs`, `agent-status.schema.json`.
   - *Aufgabe:* Lokaler Log-Parser für anonymisierte Pi-Session-Snapshots.
3. **`Agent Gamma` (Security & Redaction Auditor):**
   - *Fokus:* `server.mjs`, `app.mjs`, `test/contract.test.mjs`.
   - *Aufgabe:* Adversarial Fuzzing & Redaktions-Engine-Prüfung.
4. **`Agent Delta` (Timeline & Analytics):**
   - *Fokus:* `app.mjs`, `index.html`, `styles.css`.
   - *Aufgabe:* Activity-Timeline, Filter-System und Snapshot-Export.

---

## Anweisung zur Wiederaufnahme

Bei Start einer neuen Sitzung:
1. Verzeichnis betreten: `cd D:/imp-projekte/Pi-Dashboard`
2. Git-Status und Remote verifizieren: `git status --short --branch && git remote get-url origin`
3. Handoff lesen: `read HANDOFF.md`
4. Test-Suite ausführen: `npm test && npm run check && npm run schema:check && npm run smoke && npm run test:browser`
5. Die Arbeit anhand des oben stehenden Sub-Agenten-Fahrplans fortsetzen.
