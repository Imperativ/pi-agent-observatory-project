# Übergabe / Zwischenstand — Pi Agent Observatory (Adeptus Mechanicus Edition)

## Auftrag, Autorisierung und Speicherort

Der Magos hat das Dashboard von einem passiven Status-Viewer in ein interaktives **Adeptus Mechanicus Kommandozentrum (Opus Machina · ROH_58)** transformiert und auf GitHub im Branch `antiG-work` abgesichert.
- **Projektverzeichnis:** `/home/imp/Dokumente/imp-projekte/pi-dashboard` (CachyOS Linux)
- **Git Remote:** `origin` -> `https://github.com/Imperativ/pi-agent-observatory-project.git`
- **Aktiver Entwicklungsbranch:** `antiG-work`
- **Verbindliche Design-Leitlinien:** Authentische Tech-Priest-Ästhetik (Martian Crimson `#9b1d20`, Antique Brass `#c89b3c`, Adamantine Slate `#0c0d10`, Sacred Binharic Streamer, 9 Canticles), strikte Barrierefreiheit (WCAG 2.1 AA auf allen Breakpoints), strikte DOM-Sicherheit (keine unsicheren DOM-Senken wie `innerHTML`).

## Aktueller Implementierungsstand

1. **Gemini Notebook Rohdaten-Extraktion (`docs/adeptus-mechanicus-raw.txt`):**
   - 64 KiB vollständiger Lore-Korpus aus Google Gemini Notebook (`ROH_58`, Universal Laws, binharic liturgical phrasing) über Chromium Remote Debugging Protocol (CDP) extrahiert und archiviert.

2. **Interaktives Kommandozentrum (`POST /api/action` & `pi-dashboard-extension.mjs`):**
   - **Sicherer Backend-Endpunkt:** Loopback- und Same-Origin-Validierung (`allowedHosts`, `Origin`, `sec-fetch-site`).
   - ⚡ **"Litanei des Lösens (Fix it)":** Verfügbar in der Hero Blocker/Fehler-Kachel, in Sektion 09 und direkt an individuellen Blocker-/Issue-Einträgen. Schreibt Aktionsbefehle an `agent-actions.json`, die von der laufenden Pi-Extension per `pi.sendUserMessage()` direkt verarbeitet werden.
   - 🔄 **OpenAI Limit-Reset einlösen:** Fragt verbleibende Bonus-Credits via OpenAI Wham API ab (`get_reset_credits`), bietet einen modalen Bestätigungsdialog mit Guthabenanzeige und löst 1 Credit via `POST /backend-api/wham/rate-limit-reset-credits/consume` ein (`reset_openai_quota`), gefolgt von sofortiger Quota-Aktualisierung.
   - 📡 **Noosphären-Sync:** Manueller Sofortabruf der Quotas (Google & OpenAI) on-demand.
   - 🛑 **Not-Halt (Agenten-Abbruch):** Prominenter Not-Halt-Knopf im Header (`#btn-abort-header`) sowie in der Aktionsleiste; triggert `pi.abort()`.
   - 🧹 **Speicher-Pneumatik (Compact):** Kontext-Kompaktierungsbefehl in Sektion 06 (`card-usage`), triggert `pi.compact()`.
   - 📦 **Skill / Extension installieren:** Inline-Modal-Dialog in Sektion 03 (`card-capabilities`) mit Regex-Paketnamensvalidierung (`^[a-zA-Z0-9@/._-]+$`) und Ausführung von `pi install <pkg>`, ergänzt durch Direktlink 🌐 "pi.dev/packages durchstöbern ↗".
   - 🔔 **Liturgisches Aktions-Banner (`.action-toast`):** Informiert über Erfolg, Wartezustand oder Fehler ausgeführter Riten mit automatischem Dismiss.

3. **Navigation — Variante 1: Sticky-Pill-Leiste:**
   - Prominente horizontale Navigationsleiste (`nav.section-nav.sticky-nav`) mit Zahnrad-Symbolen (`⚙ 01` bis `⚙ 09`) und liturgischen Kurztiteln.
   - **Dynamische Status-Indikatoren (`.pill-dot[data-state]`):** Roter Glüheffekt bei Blockern/Anomalien, bernsteinfarbener Glüheffekt bei Quota-Warnungen, pulsierendes Grün bei aktiver Arbeit.
   - **Zielkarten-Fokus:** Sanftes Scrollen mit aufmerksamkeitsstarkem Hervorhebungsblitz (`@keyframes card-flash`).
   - **Axe Contrast Timing Fix:** Vermeidung von Farb-/Hintergrund-Transitions auf `.nav-pill`, wodurch Themeswitching verzögerungsfrei und 100% WCAG-konform erfolgt.

4. **Kontingente (Quotas):**
   - Strikt auf die beiden freigegebenen Anbieter **Google** und **OpenAI** begrenzt.

5. **Grimdark Adeptus Mechanicus Asset Kit & Design:**
   - **Medaillon (`assets/skull-cog-medallion.jpg`):** Massives Bronze- und Schwarzgusseisen-Zahnrad mit Grünspan-Patina, bionischem Halbschädel und grün leuchtender Sensor-Linse im Header.
   - **Reinheitssiegel (`assets/purity-seal.jpg`):** Physisches rotes Wachssiegel mit Opus-Machina-Prägung und Pergament-Gebetsbändern an der Hero-Kachel und Canticle 09.
   - **Schematiken / Blueprints:**
     - Canticle 02: Cranial Cogitator Schematik (`assets/schematic-skull.jpg`) mit CAD-Vektorbemaßung, Synapsenmatrix und Titankern.
     - Canticle 05: Oculus Mechanicus Sensor-Array (`assets/schematic-eye.jpg`) mit asphärischer Linsenarchitektur und Nervenbündelkabelbaum.
   - **Chassis-Plinthe (`assets/mech-footer-plinth.svg`):** Maschinengusseiserner Sockel mit 45°-Kühllamellen, Zahnrad-Fassung und eingraviertem Credo Omnissiah.
   - **Design & Layout:** 45-Grad abgeschrägte Ecken (`clip-path`), Ecken-Nietanker (`.card-rivet`), CRT-Scanlines & Koordinatengitter, Google Fonts `Cinzel Decorative` & `Share Tech Mono`.
   - **DOM-Sicherheit:** Alle Grafiken im `#dashboard` werden als CSS-Hintergrundbilder gerendert, um den Sicherheitscheck (`#dashboard img === 0`) strikt einzuhalten.

6. **Server & Launcher (`server.mjs`, `scripts/launch-observatory.sh`):**
   - Bindet standardmäßig an `127.0.0.1:4318`.
   - Serviert binäre und SVG-Assets über gesicherte Routen-Allowlist.
   - Startskripte öffnen KDE Konsole-Tabs für Server und Pi-Sitzung.

## Bestätigte Prüfungen

- `npm test`: **97 von 97 Tests bestanden** (100%).
- `npm run check`: **27 JavaScript-Dateien syntaxgeprüft**; DOM-Senken-Guard (kein `innerHTML`, `outerHTML`, etc.) und Schemakonformität bestätigt.
- `npm run schema:check`: Ajv-Schema-Kompilierung im Strict-Modus und Negativtests bestanden.
- `npm run status:validate`: Validierung erfolgreich.
- `npm run smoke`: Serverstart mit Loopback, Routing-Allowlist und Origin-Blockierung verifiziert.
- `npm run test:browser`: Playwright E2E-Lauf (Chromium) inklusive Barrierefreiheit (Axe-Core WCAG A/AA), Breakpoints 1200px, 768px, 390px, Dark- und Light-Theme vollständig bestanden.

---

## Anweisung zur Wiederaufnahme

Bei Start einer neuen Sitzung:
1. Verzeichnis betreten: `cd /home/imp/Dokumente/imp-projekte/pi-dashboard`
2. Git-Status und Branch prüfen: `git status --short --branch && git branch --show-current` (muss auf `antiG-work` sein)
3. Handoff lesen: `cat HANDOFF.md`
4. Test-Suite ausführen: `npm test && npm run check && npm run smoke`

