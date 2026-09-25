# Agent Observatory — lokaler Offline-v1-Zwischenstand

Ein lokales, nur lesendes Dashboard für **bereitgestellte** Agenten-Snapshots. Es erkennt keinen laufenden Agenten selbst und sendet keine Daten an einen Onlinedienst. **Zwischenstand:** HTTP- und automatisierte Browsertests wurden durchgeführt; eine manuelle visuelle und vollständige Tastatur-Abnahme steht noch aus. Reproduzierbare Ergebnisse und offene Punkte stehen in `VERIFICATION.md` und `HANDOFF.md`.

## Start und Prüfungen

Voraussetzung: Node.js >= 22; für den Offline-Server sind weder `npm install` noch ein Build erforderlich. Im Projektordner:

```sh
npm start
```

Öffnen Sie `http://127.0.0.1:4318/` im Browser (nicht `index.html` über `file://`). Der Server bindet ausschließlich an `127.0.0.1`; bei belegtem Port: `npm start -- --port 4319`. Beenden mit `Ctrl+C`.

```sh
npm run status:validate
npm run status:validate -- agent-status.json
npm run check
npm test
npm run schema:check
```

`status:validate` prüft ohne Argument das Beispiel; mit Pfad eine Statusdatei **innerhalb des Projektordners**. `npm run schema:check` benötigt die Entwicklungsabhängigkeit `ajv` (`npm install` bei Bedarf); die anderen Offline-Laufzeitpfade benötigen keine Laufzeitpakete. `npm run smoke` prüft die lokalen HTTP-Routen; `npm run test:browser` benötigt zusätzlich installierte Entwicklungsabhängigkeiten (`playwright-core`, `axe-core`) und einen lokalen Chrome-/Edge-/Chromium-Browser, gegebenenfalls via `BROWSER_PATH`. Tatsächliche Testläufe sind in `VERIFICATION.md` protokolliert; ein Statusfeld `checks.status="passed"` darf niemals allein aus diesem README abgeleitet werden.

## Datenquelle und Format

Ohne `agent-status.json` liefert `/status.json` die versionierte `agent-status.example.json` als **`dataset: "sample"`**, nicht als Live-Telemetrie. Optional erzeugt `npm run status:init` exklusiv eine ignorierte `agent-status.json` aus dem Beispiel; es überschreibt nichts und die Kopie bleibt `sample`, bis ein echter Snapshot sie ersetzt. Eine vorhandene, kaputte Live-Datei führt zu einem Fehler statt zu heimlichem Sample-Fallback. `/status.json` überträgt ausschließlich normalisierte/redigierte Daten, nicht die rohe Datei; `/config.json` liefert validierte Einstellungen.

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

Die Uhrzeiten im Beispiel sind **nur Formatbeispiele**, keine aktuelle Messung. `schemaVersion` ist exakt `"1.0"`; `dataset` ist `sample` oder `live` und bedeutet **Quelle**, nicht unabhängige Prüfung oder Aktualität. Zeitangaben benötigen ISO-8601 mit expliziter Zeitzone. Fehlende optionale Messungen bleiben unbekannt (`value: null`, `verification: "unavailable"`), statt Modell, Rechte, Token, Kosten oder Fortschritt zu erraten. Fehlende Listen bedeuten „nicht verfügbar“; explizit leere Listen bedeuten „keine Einträge gemeldet“. Der Runtime-Parser kann optionale fehlerhafte Einzelwerte auf „unavailable“ herabstufen und Warnungen anzeigen, verwirft unbekannte Felder und weist fehlerhafte Strukturen zurück. Grenzen: maximal 256 KiB Quelle, 2000 Zeichen pro Text und 100 Einträge pro Liste; Kürzungen erzeugen Warnungen.

## Herkunft, Aktualität und Nachweise

Jeder optionale Skalar oder jede Werteliste ist eine Messung `{value, source, observedAt, verification}`. `verification` ist `verified`, `self_reported`, `unverified` oder `unavailable`; „verified“ bleibt **eine Quellenbehauptung**, keine externe Attestierung. Ohne gültige Herkunft wird eine vermeintlich geprüfte Messung herabgestuft. Halten Sie Quellen möglichst konkret und datensparsam. `observedAt` an der Wurzel ist die maßgebliche Quellzeit für Freshness; erfolgreiche Abrufzeit (`fetchedAt`) ist nur ein zweiter, lokaler Transportzeitstempel und erneuert die Quellzeit **nicht**. Zu alte, fehlende oder unplausibel zukünftige Quellzeit wird als veraltet/unbekannt ausgewiesen; der letzte gültige Snapshot bleibt nach Abruffehlern erhalten.

Fortschritt nur als `{completed, total, basis}` mit `total > 0`, `0 <= completed <= total` und expliziter Berechnungsbasis angeben. `activity` ist ein beschreibender Verlauf, kein Prüfnachweis. Eine Prüfung in `checks` gilt nur mit `status: "passed"`, wenn `evidence` einen nichtleeren `command`, ganzzahligen `exitCode: 0`, gültiges `finishedAt` und eine nichtleere `source` enthält. Das Dashboard attestiert die tatsächliche Ausführung nicht. Kosten brauchen in `source` eine ausdrücklich genannte Einheit; fehlende Verbrauchsdaten bleiben unbekannt.

## Neun Informationsbereiche

1. **Identität:** Name, Provider, Modell/Version, Sitzung und Laufzeit.
2. **Auftrag:** Ziel, Schritt, gemeldeter Zustand und begründeter Fortschritt.
3. **Fähigkeiten:** Werkzeuge, Skills, Subagenten und verfügbare Schnittstellen.
4. **Umgebung:** Arbeitsverzeichnis, Repository, Branch, Betriebssystem, Laufzeiten und Ausführungsmodus.
5. **Rechte & Grenzen:** Lese-/Schreibbereiche, Netzwerk, Freigaben, Beschränkungen und fehlende Zugänge — ausschließlich gemeldete Angaben.
6. **Kontext & Verbrauch:** Fenster, Tokens, Kosten und Limits, nur wenn tatsächlich erfasst.
7. **Aktivität:** datierte Ereignisse mit Kategorie, Status und Herkunft.
8. **Artefakte & Prüfungen:** gemeldete Dateien/Änderungen sowie getrennte Ausführungsnachweise.
9. **Probleme & nächste Schritte:** Risiken, Blocker, Fehler und Folgeaktionen mit Quelle.

Die Übersicht vor den Bereichen fasst Status, Auftrag, Probleme und beide Zeitstempel zusammen. Die Renderer-Implementierung enthält Listen, Aktivitätsfilter und Prüfnachweise für die Bereiche 7–9; die automatisierte Browserprüfung ist in `VERIFICATION.md` beschrieben. Keiner der Bereiche ist eine automatische Pi-Inspektion.

## Atomare Updates durch einen Agenten

Es gibt keine Schreib-API. Nur ein ausdrücklich autorisierter lokaler Agent/Exporter soll einen vollständigen, datensparsamen Snapshot erzeugen. **Nie** `agent-status.json` an Ort und Stelle bearbeiten; der Server könnte einen halben JSON-Stand lesen. Bei mehreren Schreibern zusätzlich einen einzigen Writer oder eine externe Sperre vereinbaren; atomare Umbenennung allein schützt nicht vor konkurrierenden Updates.

Für einen eigenen Aktualisierer: Quelle vorbereiten, `parseStatus` aus `src/contract.mjs` aufrufen, `dataset === "live"` und `observedAt` prüfen, normalisiertes JSON in eine **eindeutige temporäre Datei im selben Projektordner** schreiben, die geschriebene Datei nochmals parsen und erst danach auf `agent-status.json` umbenennen. Schlägt eine Stufe fehl, temporäre Datei entfernen und den letzten gültigen Stand belassen. Die Vorlage unten in der Projektwurzel als **lokales, nicht mitgeliefertes** `update-status-local.mjs` speichern; nur eine vertrauenswürdige, bereits freigegebene Quelldatei übergeben. Die lokale Hilfsdatei nicht committen und nach Gebrauch entfernen.

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

Im Projektordner ausführen: `node update-status-local.mjs <Pfad-zur-freigegebenen-Quelle.json>`, anschließend `npm run status:validate -- agent-status.json` und `/status.json` kontrollieren. Umbenennung innerhalb eines Dateisystems vermeidet sichtbare Teilstände; bei Dateisperren/Fehlern bleibt eine Korrektur nötig. `agent-status.json` und passende `agent-status.*.tmp` sind per `.gitignore` ausgeschlossen; prüfen Sie sensible Quell-/Hilfsdateien vor jedem Commit trotzdem selbst.

## Konfiguration

`config.json` enthält ausschließlich ganzzahlige Millisekundenwerte: `pollIntervalMs: 3000` (500–60000), `staleAfterMs: 120000` (1000–86400000), `clockSkewMs: 5000` (0–60000) und `timeoutMs: 5000` (100–60000). Polling nutzt `cache: no-store`, höchstens eine Store-Anfrage gleichzeitig und bricht bei Timeout ab. Der Browser lädt die Konfiguration vor dem Status; eine ungültige Konfiguration verhindert den regulären Start statt ungeprüfte Defaultwerte zu benutzen. Änderungen an `config.json` erfordern ein erneutes Laden der Seite, keinen Neubau der Anwendung. Ein Fehler beim Statusabruf darf Quellzeit und zuletzt erfolgreich geladenen Snapshot nicht zurücksetzen.

## Datenschutz und Vertrauensgrenzen

Server: Loopback, schreibgeschützte Routen-Allowlist, `GET`/`HEAD`, Host-/Origin-/Cross-Site-Prüfung, kein CORS, restriktive CSP und keine fremden Netzwerkanfragen. Keine beliebigen Workspace-Dateien oder rohe Status-/Beispieldateien über HTTP. JSON wird serverseitig normalisiert/redigiert und vor DOM-Ausgabe erneut redigiert; das ist **keine vollständige DLP-Garantie**. Quellen, Freitext, Dateipfade, Sitzungsbezeichner, Aktivität und Check-Befehle vor dem Schreiben minimieren; niemals API-Keys, Passwörter, Cookies, Tokens, Umgebungsvariablen, private Logs oder vollständige Prompts aufnehmen. Auch lokaler Browserzugriff und lokale Dateien sind keine Geheimnisablage.

**Store-Fehlergrenze:** Regressionstests prüfen fremde `fetchFn`-Fehler mit `Status token=DEMO_SECRET` sowie manipulierte HTTP-Status-/Content-Type-Werte direkt in `state.error`. Ein fehlgeschlagener Test gilt als Sicherheitsbefund, selbst wenn ein zusätzlicher Render-Redaktionsschritt die Anzeige absichert. Der lokale Testlauf belegt nur diese geprüften Fälle, keine umfassende DLP-Garantie.

## Fehlersuche und Folgeumfang

- Kein Styling/HTTP 422 bei `/styles.css`: Route und Datei `styles.css` prüfen; einen erfolgreichen Browserlauf nicht aus einem HTTP-Status allein ableiten.
- Keine Live-Werte: `dataset` und Dateiname prüfen; bei fehlender Live-Datei erscheint absichtlich `sample`. `npm run status:init` erstellt zunächst nur eine Sample-Kopie.
- HTTP 422 bei `/status.json`: Vorhandene Datei auf JSON, Version `1.0`, Struktur, Größe und Datumsangaben prüfen; `npm run status:validate -- agent-status.json`. Keine stille Rückkehr auf das Beispiel.
- HTTP 422 bei `/config.json`: `config.json` auf Ganzzahlen und Wertebereiche prüfen; dann Seite erneut laden.
- Altes Datum trotz erfolgreichem Abruf: `observedAt` der **Quelle** aktualisieren, nicht nur den Browser neu laden.
- Port belegt: mit `npm start -- --port 4319` einen anderen Loopback-Port wählen; bei Zugriffsproblemen `http://127.0.0.1:<Port>/` und lokale Richtlinien prüfen.
- Fehlgeschlagener Store-Sicherheitstest: keine Secrets in Fehlertexte liefern; Store-Grenze muss unabhängig vom Renderer repariert und erneut geprüft werden (nicht als bestandenen Check ausgeben).

**Explizit zurückgestellt:** Online-Anreicherung, externe APIs/Badges, Credentials-Adapter, automatische Pi-SDK-/Log-Integration, Fernsteuerung, Cloud-Speicher, Telemetrie und Multi-Agent-Flottenfunktionen. Offline-v1 liest nur die bewusst bereitgestellte lokale Statusquelle.
