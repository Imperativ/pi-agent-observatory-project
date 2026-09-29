# Übergabe / Projektstand — Pi Agent Observatory · Opus Machina ROH_58

## 1. Auftrag, Autorisierung und Speicherort

Das Projekt vereint zwei synergetische Säulen:
1. **Das Web-Dashboard:** Interaktives Adeptus Mechanicus Kommandozentrum (Opus Machina · ROH_58) mit 9 liturgischen Sektionen, Quota-Verwaltung (Google/OpenAI), Not-Halt und Aktions-Riten.
2. **Die Telegram Remote Bridge:** Abhörsichere, transaktionale Fernsteuerung für den lokalen Pi-Coding-Agenten via Outbound-Long-Polling (Bot API) ohne offene Ports oder Webhooks.

- **Projektverzeichnis:** `/home/imp/Dokumente/imp-projekte/pi-dashboard` (CachyOS Linux)
- **Git Remote:** `origin` -> `https://github.com/Imperativ/pi-agent-observatory-project.git`
- **Aktiver Branch:** `main` (synchron mit `origin/main`)
- **Letzter Stand:** Slice 1 und Slice 2 der Telegram-Bridge vollständig entworfen; Dashboard v1 produktionsreif und verifiziert.
- **Artefakt-Isolation:** Der Planungs- und Entwurfsordner `.rpiv/` ist dauerhaft in `.gitignore` eingetragen und verbleibt strikt lokal auf dem Entwicklungsrechner.

---

## 2. Aktueller Implementierungs- & Designstand

### Säule 1: Adeptus Mechanicus Dashboard (Produktionsreif auf `main`)
- **Backend & Aktionen (`POST /api/action` & `pi-dashboard-extension.mjs`):**
  - Loopback- und Same-Origin-Validierung (`allowedHosts`, `Origin`, `sec-fetch-site`).
  - ⚡ *Litanei des Lösens (Fix it):* Schreibt Aktionen nach `agent-actions.json` zur direkten Abarbeitung durch Pi.
  - 🔄 *OpenAI Limit-Reset einlösen:* Guthabenabfrage via Wham-API & Einlösung von Bonus-Credits.
  - 📡 *Noosphären-Sync:* Sofortabruf von Quotas on-demand.
  - 🛑 *Not-Halt (Agenten-Abbruch):* Sofortiges Beenden via `pi.abort()`.
  - 🧹 *Speicher-Pneumatik (Compact):* Kontext-Kompaktierung via `pi.compact()`.
  - 📦 *Skill / Extension installieren:* Inline-Modal mit Regex-Paketnamensvalidierung (`pi install <pkg>`).
- **UI & Ästhetik:**
  - Martian Crimson (`#9b1d20`), Antique Brass (`#c89b3c`), Adamantine Slate (`#0c0d10`).
  - Horizontale Sticky-Pill-Navigationsleiste (`⚙ 01` bis `⚙ 09`) mit dynamischen Glüh-Indikatoren.
  - Grimdark Asset Kit (Bronze-Schädel-Medaillon, Reinheitssiegel, CAD-Blueprints, Kühllamellen-Plinthe).
  - Strikte DOM-Sicherheit (keine unsicheren Senken wie `innerHTML`, `#dashboard img === 0`).
  - Barrierefreiheit: 100% WCAG 2.1 AA auf allen Breakpoints (1200px, 768px, 390px, Dark/Light-Theme).

### Säule 2: Telegram Remote Bridge (Architektur & Slice-Fortschritt)
- **Gesamtarchitektur:**
  - Kommuniziert ausschließlich über ausgehende HTTPS-Requests (`getUpdates`, `sendMessage`) zur Telegram Bot API.
  - Volle Betreiberautorität: Befehle des fest konfigurierten Nutzers (`Message.from.id` im privaten 1:1-Chat) besitzen dieselbe operative Berechtigung wie die lokale Konsole.
  - Lokale SQLite-Datenbank (`node:sqlite`) unter `~/.config/pi-dashboard/bridge.db` (Dateirechte `0600`).
  - Dashboard-Privacy: Keine Konversationsinhalte oder Telegram-Prompts gelangen in `agent-status.json` oder `/status.json`.

- **Slice 1: Core Store, Telegram Ingress & Authorization (Design vollständig):**
  - Transaktionales SQLite-Schema (`meta`, `tasks`, `history`, `questions`, `outbox_chunks`).
  - Atomare Offset-Fortschreibung bei Inbound-Updates.
  - Ingress-Router mit striktem User-Allowlisting und Typklassifizierung.
  - Supervised Polling Loop (`poller.mjs`) mit Crash-Recovery und Backoff.
  - Outbox-Chunker: Aufteilung in Blöcke <= 4096 UTF-16 Zeichen unter Erhalt von Markdown-Codeblöcken (` ``` `).
  - Retry-Scheduler: Bounded Retries (5 Versuche über max. 15 Minuten: 15s, 60s, 180s, 660s).

- **Slice 2: Pi RPC Supervision & Lifecycle Control (Design vollständig):**
  - **`src/telegram/pi-rpc-client.mjs`:** Byte-genaues JSONL-Framing (Split nur bei `\n`, CRLF-Trimming, Schutz vor `U+2028`/`U+2029`). Asynchrone Request-Response-Korrelation (`rpc-<uuid>`) mit Timeouts. Vollständiges Event-Streaming (`agent_start`, `agent_settled`, `turn_end`, `message_update`, etc.).
  - **`src/telegram/supervisor.mjs`:** Steuert exakt eine Pi-Kindinstanz (`pi --mode rpc --session-dir <cwd> --continue`). Stderr-Ringpuffer (50 Zeilen) für exakte Fehlerdiagnose ohne Vermischung mit stdout-JSONL. 5s Readiness-Probe via `getState()`. Graceful Shutdown (`stdin.end()` ➔ `SIGTERM` ➔ `SIGKILL`). Automatischer Wiederanlauf nach Crash.
  - **`src/telegram/dispatcher.mjs`:** Transaktionale Abarbeitung aus SQLite-Queue (`tasks` ➔ `DISPATCHING`). Sequentieller Dispatch, Warten auf `agent_settled`, Abruf von `getLastAssistantText()`, Einspeisung in Outbox-Chunks und Abschluss (`COMPLETED`).
  - **Lifecycle-Befehle:** `/stop` (Abort & Wait for Idle), `/restart` (Supervisor-Neustart mit `--continue`), `/new` (Frische Sitzung), `/continue` (Sitzungsstatusprüfung), `/status` (Aggregierte Uptime, Token/Kontext, Queue).
  - **Crash-Sicherheit & `UNCERTAIN`:** Bricht Pi während eines laufenden Auftrags ab, wechselt der Task verbindlich in `UNCERTAIN` (kein blindes Auto-Retry wegen potenzieller Nebenwirkungen in Shell/Dateisystem). Alarmierung via Telegram mit Stderr-Auszug.

---

## 3. Bestätigte Qualitäts- & Testprüfungen

- `npm test`: **97 von 97 Tests bestanden** (100%).
- `npm run check`: **27 JavaScript-Dateien syntaxgeprüft**; DOM-Senken-Guard, Schema-Validierung und Konformität bestätigt.
- `npm run schema:check`: Ajv-Schema-Kompilierung im Strict-Modus und Negativtests bestanden.
- `npm run status:validate`: Validierung erfolgreich.
- `npm run smoke`: Serverstart mit Loopback, Routing-Allowlist und Origin-Blockierung verifiziert.
- `npm run test:browser`: Playwright E2E-Lauf (Chromium) inklusive Barrierefreiheit (Axe-Core WCAG A/AA) vollständig bestanden.

---

## 4. Nächste anstehende Schritte

1. **Slice 3: Interactive Prompt Answering & Dashboard Privacy Isolation:**
   - Anpassung `pi-dashboard-extension.mjs`: Stummschaltung des Status-Writers bei gesetztem Flag `PI_BRIDGE_MANAGED=1`.
   - RPC UI Handler: Automatische Genehmigung von `confirm`-Abfragen für den autorisierten Betreiber.
   - Weiterleitung von interaktiven Fragen (`select`, `input`, Fragen-Tools) an Telegram und Rückspeisung via `extension_ui_response`.
2. **Slice 4: Guided Setup, systemd --user Service & Host-Integration:**
   - Interaktives Setup-Skript (`scripts/setup-telegram.mjs`) mit Token-Validierung via `getMe`.
   - Erstellung von `~/.config/pi-dashboard/telegram.env` mit Modus `0600`.
   - `systemd --user` Service-Unit mit `UMask=0077` und `KillMode=control-group`.
3. **Code-Umsetzung & Verifikation der Slices:**
   - Implementierung der Komponenten in `src/telegram/` und Ausführung der Testsuite `test/telegram-*.test.mjs`.

---

## 5. Anweisung zur Wiederaufnahme

Bei Start einer neuen Sitzung:
1. Verzeichnis betreten: `cd /home/imp/Dokumente/imp-projekte/pi-dashboard`
2. Git-Status prüfen: `git status --short --branch` (muss auf `main` sein)
3. Handoff lesen: `cat HANDOFF.md`
4. Test-Suite ausführen: `npm test && npm run check`
5. Nahtlos mit Slice 3 oder der Implementierung von Slice 1/2 fortfahren.
