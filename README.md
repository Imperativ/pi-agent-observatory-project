# Agent Observatory — Windows-11-Dashboard mit optionaler Pi-Live-Anbindung

**Plattform:** Dieses Dashboard wurde unter **Windows 11** entwickelt und ist für **Windows 11** vorgesehen. Die dokumentierten Start- und Integrationswege beziehen sich auf diese Zielplattform.

Ein lokal oder im eigenen LAN nutzbares, nur lesendes Dashboard für **bereitgestellte** Agenten-Snapshots. Ohne ausdrücklich gestartete Pi-Extension erkennt es keinen laufenden Agenten. Der Dashboard-Server liest ausschließlich lokale JSON-Quellen aus dem Projektverzeichnis und bleibt damit technisch unabhängig von einem spezifischen Betriebssystem oder einer im Hintergrund laufenden Pi-Instanz.

## Version 1 — erste Release-Variante

Diese erste Version ist bewusst als **leicht nutzbarer lokale Release** gedacht: ein einfaches Projekt, das auf einem Rechner ausgecheckt oder als ZIP entpackt wird, ohne spezielle Build- oder Installer-Logik zu benötigen.

- **Ziel:** Einfache lokale Nutzung mit dem ROH_58-/Pi-Harness-Setup, ohne den Endanwender mit OS-spezifischen Installationsschritten zu überladen.
- **Laufzeit:** Node.js >= 22, kein Build-Prozess für den Server nötig.
- **Auslieferung:** Die Projektdateien können als ZIP/GitHub-Release heruntergeladen werden. Ein EXE ist nicht nötig, weil das Dashboard als Node.js-Anwendung läuft und auf allen relevanten Systemen mit derselben Projektstruktur verwendet werden kann.
- **Erwarteter Startpfad:** Projektordner öffnen, dann `npm start`; danach im Browser `http://127.0.0.1:4318/`.
- **Optional live:** Für laufende Pi-Sitzungen zusätzlich `pi --extension ./pi-dashboard-extension.mjs` im Projektordner starten.
- **Scope:** Das Dashboard ist für die Nutzung mit **ROH_58 und dem Pi-Harness** konzipiert; es erwartet kein separates Host-Setup oder eine besondere Persona-Umgebung.
- **Einschränkung:** Die Start- und Launcher-Skripte in `scripts/` sind eher Convenience-Helper und nicht die eigentliche Logik; der Kern des Projekts ist der Node.js-Server und die Pi-Extension, die plattformunabhängig agieren.

## Start und Prüfungen

Voraussetzung: Node.js >= 22; für den Offline-Server sind weder `npm install` noch ein Build erforderlich. Im Projektordner:

```sh
npm start
```

Öffnen Sie `http://127.0.0.1:4318/` im Browser (nicht `index.html` über `file://`). Ohne zusätzliche Option bindet der Server ausschließlich an `127.0.0.1`; bei belegtem Port: `npm start -- --port 4319` oder `npm start -- --host 192.168.1.27`.

**Optional für ein vertrautes LAN:** Ermitteln Sie die private IPv4-Adresse **des Server-Rechners** (beispielsweise `192.168.1.27`; dies ist nur ein Beispiel, nicht die geprüfte Adresse dieses Rechners) und starten Sie den Server mit der LAN-Option:

```sh
npm start -- --host 192.168.1.27
```

**Optional live mit Pi-Harness:**

```sh
cd /pfad/zum/projekt
pi --extension "$PWD/pi-dashboard-extension.mjs"
```

Danach im Browser die gleiche URL laden. Wenn der Server bereits läuft, aktualisiert sich die Observability automatisch.

**Prüfungen / Validierung:**

```sh
npm run status:validate
npm run status:validate -- agent-status.json
npm run check
npm test
npm run schema:check
```

`status:validate` prüft ohne Argument das Beispiel; mit Pfad eine Statusdatei **innerhalb des Projektordners**. `npm run schema:check` benötigt die Entwicklungsabhängigkeit `ajv` (`npm install` im Projektordner).

## CachyOS/KDE: aktueller Startweg

Der Branch `antiG-work` enthält einen auf die aktuelle CachyOS-Arbeitsstation zugeschnittenen Starter. Voraussetzungen sind Node.js >= 22, npm, Pi im `PATH`, KDE Konsole, fish und `xdg-open`. Einzelheiten siehe unten im Abschnitt „CachyOS/KDE: aktueller Startweg“.

```sh
cd /home/imp/Dokumente/imp-projekte/pi-dashboard
npm ci
```

Danach startet ein Aufruf beide benötigten Prozesse und öffnet das Dashboard:

```sh
./scripts/launch-observatory.sh
```

Der Starter öffnet KDE Konsole mit zwei Tabs aus `scripts/konsole-tabs.txt`:

1. `scripts/start-server.sh` startet den lokalen Server auf `http://127.0.0.1:4318/`.
2. `scripts/start-pi.sh` wartet kurz und startet Pi mit `pi-dashboard-extension.mjs`.
3. `xdg-open` öffnet parallel das Dashboard im Standardbrowser. Nach dem Beenden von Server oder Pi bleibt der jeweilige fish-Tab zur Diagnose geöffnet.

Die vier Starterdateien enthalten derzeit absichtlich den absoluten Pfad `/home/imp/Dokumente/imp-projekte/pi-dashboard`. Bei einem anderen Checkout-Pfad müssen `scripts/launch-observatory.sh`, `scripts/start-server.sh`, `scripts/start-pi.sh` und `scripts/konsole-tabs.txt` angepasst werden.

```sh
chmod +x scripts/launch-observatory.sh scripts/start-server.sh scripts/start-pi.sh
```

Manueller Fallback in zwei Terminals:

```sh
# Terminal 1
cd /home/imp/Dokumente/imp-projekte/pi-dashboard
npm start

# Terminal 2
cd /home/imp/Dokumente/imp-projekte/pi-dashboard
pi --extension "$PWD/pi-dashboard-extension.mjs"
```

Anschließend `http://127.0.0.1:4318/` öffnen. Der CachyOS-Starter beginnt bewusst eine neue Pi-Sitzung. Soll stattdessen die letzte Sitzung dieses Arbeitsverzeichnisses fortgesetzt werden, Pi nach Bedarf mit `--continue` starten.

## Zuletzt umgesetzt (`CachyOS` → `antiG-work`)

- **Adeptus Mechanicus Kommandozentrum (Opus Machina · ROH_58):** Authentische Tech-Priest-Ästhetik (Martian Crimson, Antique Brass, Adamantine Slate, binharische Ticker, Credo Omnissiah).
- **Navigation (Variante 1 — Sticky-Pill-Leiste):** Horizontale Leiste mit Zahnrad-Badges (`⚙ 01` bis `⚙ 09`), dynamischen Status-Indikatorpunkten (Glüh-Effekte bei Anomalien oder Quota-Warnungen).
- **Interaktive Aktions-Schaltflächen (`POST /api/action`):**
  - ⚡ *Litanei des Lösens (Fix it)* in der Blocker-Kachel, in Sektion 09 sowie direkt an individuellen Blocker-/Issue-Karten.
  - 🔄 *OpenAI Limit-Reset einlösen* (Abruf der Bonus-Credits, Bestätigungsdialog, Einlösen via Wham API mit automatischem Quota-Refresh).
  - 📡 *Noosphären-Sync* (Manueller Quota-Sofortabruf).
  - 🛑 *Not-Halt (Agenten-Abbruch)* im Header und in der Aktionsleiste.
  - 🧹 *Speicher-Pneumatik (Compact)* in Sektion 06.
  - 📦 *Skill / Extension installieren* in Sektion 03 inklusive Direktlink zu `pi.dev/packages`.
- **Kontingente:** Strikt auf Google und OpenAI fokussiert.
- Direkter Quota-Abruf für OpenAI und Google aus den lokalen Pi-OAuth-Daten; Browser-Scraping bleibt als Fallback verfügbar.
- Automatischer Quota-Abgleich beim Start der Pi-Extension, danach alle fünf Minuten sowie nach abgeschlossenen Agentenläufen; Provider-Rate-Limit-Header werden zusätzlich passiv ausgewertet.
- Erweiterte Aktivitäts-Timeline mit Sortierung, Auf-/Zuklappen, Filter-Reset und relativen Zeitangaben.
- Anonymisierter Diagnose-Export über die UI sowie per `npm run export:diagnostics` oder `npm run export:stdout`.
- CachyOS/KDE-Starter mit getrennten Konsole-Tabs für Server und Pi-Live-Sitzung; der Zielport ist `4318`.

## Datenquelle und Format

Ohne `agent-status.json` liefert `/status.json` die versionierte `agent-status.example.json` als **`dataset: "sample"`**, nicht als Live-Telemetrie. Optional erzeugt `npm run status:init` exklusiv eine neue Beispielstatus-Datei, ohne vorhandene Daten zu überschreiben.

Eine eigene JSON-Quelle beginnt beispielsweise so (weitere Felder: `agent-status.example.json`, `agent-status.schema.json`, `CONTRACT.md`):

```json
{
  "schemaVersion": "1.0",
  "dataset": "live",
  "observedAt": "2026-01-01T12:00:00Z",
  "assignment": {
    "state": {
      "value": "working",
      "source": "Eigener freigegebener Status-Exporter",
      "observedAt": "2026-01-01T12:00:00Z",
      "verification": "self_reported"
    }
  },
  "activity": [],
  "artifacts": [],
  "checks": [],
  "issues": []
}
```

Die Uhrzeiten im Beispiel sind **nur Formatbeispiele**, keine aktuelle Messung. `schemaVersion` ist exakt `"1.0"`; `dataset` ist `sample` oder `live` und bedeutet **Quelle**, nicht unabhängige Pseudonymisierung. Die Eigenschaft `observedAt` ist die Zeitstempel-Angabe der Quelle, nicht die Zeit des Browser-Aufrufs.

## Pi-Agenten live beobachten (opt-in)

In einem Terminal den Dashboard-Server mit `npm start` im Projektordner starten. In einem **zweiten** Terminal Pi mit der Projekt-Extension starten, beispielsweise aus dem Arbeitsverzeichnis der eigenen lokalen Kopie:

```sh
cd /pfad/zum/projekt
pi --extension "$PWD/pi-dashboard-extension.mjs"
```

Der gezeigte Windows-Pfad ist nur ein Beispiel aus einer Entwicklungsumgebung; ersetzen Sie ihn durch den absoluten Pfad zu Ihrer eigenen Projektkopie. `--continue` nur verwenden, wenn die letzte Sitzung dieses Arbeitsverzeichnisses fortgesetzt werden soll. Eine bereits laufende Pi-Instanz nicht gleichzeitig mit derselben Sitzung noch einmal starten.

Die Extension schreibt alle drei Sekunden einen validierten, atomar ersetzten `agent-status.json` mit Lebenszeichen, Agentenzustand (`in Arbeit`, `wartet`, `bereit` oder `fehlgeschlagen`), ausgewählten Arbeitsdetails, Verzeichnis- und Branch-Informationen sowie optionalen Quota-/Token-Werten. Es gibt nur **einen** Live-Writer je Dashboard-Statusdatei. Er hält `agent-status.lock` während der Pi-Sitzung; der manuelle JSONL-Exporter darf währenddessen nicht schreiben. Nach einem Absturz oder bei einem Wechsel der Sitzung bleibt die Sperre bestehen, bis die jeweilige Datei sauber geschlossen ist.

### Modell, Anbieter und Kontingente auf den ersten Blick

- **Modell & Anbieter:** Werden direkt im Kopfbereich (Modell-Badge) und in der ersten Kachel der vierreihigen Übersicht („Aktives Modell & Anbieter“) unmittelbar ohne Scrollen angezeigt.
- **OpenAI-/Google-Quotas:** Wenn Kontingente vorliegen, zeigt das Dashboard grafische Fortschrittsbalken mit verbleibenden Prozentwerten und Reset-Zeitangaben in der Übersicht sowie in Bereich 05. Die bevorzugte direkte Synchronisierung läuft über `npm run quota:sync` oder `pi`-Befehl `/limits sync`.
- **Browser-Fallback:** Scheitert der Direktsync, kann Playwright ein dauerhaftes Profil unter `~/.config/pi-agent-observatory/quota-browser-profile` verwenden. Einmalig anmelden mit `npm run quota:login [openai|google]` (sichtbares Browserfenster).
- **Pi-Integration:** `/limits sync` stößt den Sync aus der mit der Extension gestarteten Pi-Sitzung an. Zusätzlich synchronisiert die Extension beim Sitzungsstart, standardmäßig alle fünf Minuten sowie nach Agenten-Events.
- **Manuelle Vorgabe:** `/limits <5h-%> <Woche-%> [Reset-Zeit]`, zum Beispiel `/limits 85 60 "18:00 UTC"`; zurücksetzen mit `/limits reset`. Ohne laufende Extension steht `npm run status:limits -- --5h 85 --weekly 60 --reset-5h "18:00 UTC"` bereit.

## Optionaler lokaler Pi-JSONL-Export (minimal)

Der Exporter `scripts/generate-pi-status.mjs` liest **nur eine ausdrücklich ausgewählte** Pi-Sitzungsdatei (JSONL). Er sucht keine laufenden Agenten und prüft keine Live-Aktivität. Standardmäßig wird das Privathaushalts-Verzeichnis `~/.pi/agent/sessions` benutzt; ein eigener `--session-root` kann begrenzte Freigaben definieren.

```sh
npm run status:pi -- --session "<absoluter-Pfad-zur-Sitzung.jsonl>" --dry-run
npm run status:pi -- --session "<absoluter-Pfad-zur-Sitzung.jsonl>" --write
npm run status:validate -- agent-status.json
```

Bei einem eigenen Session-Verzeichnis beiden Exportaufrufen `--session-root "<absolutes-Verzeichnis>"` hinzufügen. **Nur nach Freigabe der Quelle** `--write` ausführen: Es ersetzt eine bestehende `agent-status.json` mit einem streng validierten, anonymisierten Live-Snapshot eines verfügbaren Pi-Session-Exports.

Ungültige/unvollständige JSONL-Dateien, unbekannte Sitzungsformate, rohe v1-Sitzungen (Pi migriert diese beim Laden), Datei-Symlinks und Quellen außerhalb des freigegebenen Verzeichnisses werden abgelehnt. Keine Rohdaten oder Pfade werden in Fehlermeldungen breitgestellt.

## Herkunft, Aktualität und Nachweise

Jeder optionale Skalar oder jede Werteliste ist eine Messung `{value, source, observedAt, verification}`. `verification` ist `verified`, `self_reported`, `unverified` oder `unavailable`; „verifiziert“ bedeutet dabei, dass ein externer oder autorisierter Nachweis vorliegt. Für Quotas und Provider-Details wird ein solcher Nachweis ausdrücklich aus den lokalen Pi-Daten bzw. API-Headern übernommen.

Fortschritt nur als `{completed, total, basis}` mit `total > 0`, `0 <= completed <= total` und expliziter Berechnungsbasis angeben. `activity` ist ein beschreibender Verlauf, kein Prüfnachweis. Audits verlangen die getrennte Liste `checks` mit Source, exitCode und Timestamp.

## Neun Informationsbereiche

1. **Identität:** Name, Provider, Modell/Version, Sitzung und Laufzeit.
2. **Auftrag:** Ziel, Schritt, gemeldeter Zustand und begründeter Fortschritt.
3. **Fähigkeiten:** Werkzeuge, Skills, Subagenten und verfügbare Schnittstellen.
4. **Umgebung:** Arbeitsverzeichnis, Repository, Branch, Betriebssystem, Laufzeiten und Ausführungsmodus.
5. **Rechte & Grenzen:** Lese-/Schreibbereiche, Netzwerk, Freigaben, Beschränkungen und fehlende Zugänge — ausschließlich gemeldete Angaben.
6. **Kontext & Verbrauch:** Fenster, Tokens, Kosten und Limits, nur wenn tatsächlich erfasst.
7. **Aktivität:** datierte Ereignisse mit Kategorie, Status und Herkunft; lokale Suche in Zusammenfassung/Kategorie sowie kombinierbare Kategorie-/Statusfilter.
8. **Artefakte & Prüfungen:** gemeldete Dateien/Änderungen sowie getrennte Ausführungsnachweise.
9. **Probleme & nächste Schritte:** Risiken, Blocker, Fehler und Folgeaktionen mit Quelle.

Die Übersicht vor den Bereichen fasst Status, Auftrag, Probleme und beide Zeitstempel zusammen. Die Renderer-Implementierung enthält Listen, Aktivitätssuche/-filter und Prüfnachweise für die jeweiligen Bereiche.

## Atomare Updates durch einen Agenten und Aktions-Endpunkt

Für Status-Snapshots gibt es keine allgemeine HTTP-Schreib-API: der Server überschreibt `agent-status.json` nicht unkontrolliert. Nur ein ausdrücklich autorisierter lokaler Agent/Exporter soll seine Quelle in einer atomaren Datei-Operation ersetzen. Ein `POST /api/action` akzeptiert nur die vorgesehenen erlaubten Aktionen (z. B. `fix_issue`, `abort_agent`, `compact_context`, `sync_quota`) und verhindert so einen unkontrollierten Schreibfluss.

**Nie** `agent-status.json` an Ort und Stelle manuell bearbeiten; der Server könnte einen halben JSON-Stand lesen. Die Vorlage unten prüft `agent-status.lock` **nicht**: während die Pi-Live-Extension läuft, muss keine manuelle Korrektur via Editor erfolgen.

Für einen eigenen Aktualisierer: Quelle vorbereiten, `parseStatus` aus `src/contract.mjs` aufrufen, `dataset === "live"` und `observedAt` prüfen, normalisiertes JSON in eine **eindeutige temporäre Datei** schreiben, danach atomar nach `agent-status.json` umbenennen und `agent-status.lock` freigeben.

```js
import {readFile, writeFile, rename, unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {parseStatus} from './src/contract.mjs';

if (!process.argv[2]) throw new Error('Pfad zur freigegebenen Quelle fehlt');
const source = parseStatus(await readFile(process.argv[2], 'utf8'));
if (source.dataset !== 'live' || !source.observedAt) throw new Error('Live-Datensatz mit Quellzeit erforderlich');
const target = resolve('agent-status.json');
const temporary = resolve(`agent-status.${randomUUID()}.tmp`);
await writeFile(temporary, JSON.stringify(source, null, 2) + '\n', {flag: 'wx', mode: 0o600});
try {
  parseStatus(await readFile(temporary, 'utf8'));
  await rename(temporary, target);
} finally {
  await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
```

Im Projektordner ausführen: `node update-status-local.mjs <Pfad-zur-freigegebenen-Quelle.json>`, anschließend `npm run status:validate -- agent-status.json` und `/status.json` kontrollieren. Um die Laufzeit des Servers nicht zu gefährden, statt Rohdaten direkt zu überschreiben nur atomare Übergabe mit validiertem Snapshot nutzen.

## Konfiguration

`config.json` enthält ausschließlich ganzzahlige Millisekundenwerte: `pollIntervalMs: 3000` (500–60000), `staleAfterMs: 120000` (1000–86400000), `clockSkewMs: 5000` (0–60000) und `timeoutMs: 5000` (100–60000). Der Server validiert diese Werte im Startpfad und lehnt invalides JSON oder falsche Bereiche mit `422` ab.

## Datenschutz und Vertrauensgrenzen

Dashboard-Server: standardmäßig Loopback, LAN-Bindung nur mit expliziter privater IPv4-Adresse; schreibgeschützte Routen-Allowlist, `GET`/`HEAD`, Host-/Origin-/Cross-Site-Prüfung, kein CORS, keine dynamische Remote-API-Erweiterung ohne ausdrückliche Auswahl. Jede Datenerhebung ist passiv, lokal und nur auf explizit freigegebene Quellen beschränkt.

**Store-Fehlergrenze:** Regressionstests prüfen fremde `fetchFn`-Fehler mit `Status token=DEMO_SECRET` sowie manipulierte HTTP-Status-/Content-Type-Werte direkt in `state.error`. Ein fehlgeschlagener Store-Sicherheitstest darf nicht als erfolgreiche Prüfung im Renderer durchgehen; die Daten fließen nur als definierte Messungen ein.

## Fehlersuche und Folgeumfang

- Kein Styling/HTTP 422 bei `/styles.css`: Route und Datei `styles.css` prüfen; einen erfolgreichen Browserlauf nicht aus einem HTTP-Status allein ableiten.
- Keine Live-Werte: `dataset` und Dateiname prüfen; bei fehlender Live-Datei erscheint absichtlich `sample`. `npm run status:init` erstellt zunächst nur eine Sample-Kopie.
- HTTP 422 bei `/status.json`: Vorhandene Datei auf JSON, Version `1.0`, Struktur, Größe und Datumsangaben prüfen; `npm run status:validate -- agent-status.json`. Keine stille Rückkehr auf das Beispiel, wenn eine echte Quelle vorhanden ist.
- HTTP 422 bei `/config.json`: `config.json` auf Ganzzahlen und Wertebereiche prüfen; dann Seite erneut laden.
- Altes Datum trotz erfolgreichem Abruf: `observedAt` der **Quelle** aktualisieren, nicht nur den Browser neu laden.
- Port belegt: mit `npm start -- --port 4319` einen anderen Port wählen. Der CachyOS-Launcher und sein Browser-Aufruf sind derzeit fest auf `4318` eingestellt und müssen bei einer Portänderung entsprechend angepasst werden.
- CachyOS-Launcher startet nicht: Ausführungsrechte, die absoluten Pfade, `/usr/bin/konsole`, `/usr/bin/fish`, `pi` im `PATH` und ein erfolgreiches `npm ci` prüfen. Die Skripte öffnen GUI-Prozesse und sind daher bewusst nur auf Linux/KDE ausgelegt.
- Quota-Sync schlägt fehl: zuerst `npm run quota:direct`; bei fehlenden/abgelaufenen lokalen Pi-Anmeldedaten den Provider in Pi neu authentifizieren oder den Browser-Fallback mit `npm run quota:login`/`npm run quota:sync` nutzen.
- Fehlgeschlagener Store-Sicherheitstest: keine Secrets in Fehlertexte liefern; Store-Grenze muss unabhängig vom Renderer repariert und erneut geprüft werden (nicht als bestandenen Check ausgeben).

**Explizit zurückgestellt:** weitere Online-Anreicherung außerhalb des dokumentierten Quota-Syncs, öffentliche APIs/Badges, automatische Pi-Logsuche oder Integration ohne ausdrücklich gestartete Pi-Extension.

