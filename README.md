# Agent Observatory — Windows-11-Dashboard mit optionaler Pi-Live-Anbindung

**Plattform:** Dieses Dashboard wurde unter **Windows 11** entwickelt und ist für **Windows 11** vorgesehen. Die dokumentierten Start- und Integrationswege beziehen sich auf diese Zielplattform. Andere Betriebssysteme sind für diesen Stand nicht als unterstützte Zielplattform geprüft; aus der Nutzung plattformübergreifender Technik folgt keine Linux-Freigabe. Eine auf **Arch Linux** spezialisierte Version ist für einen **separaten, noch anzulegenden Branch** vorgesehen. Dieser Branch und seine Anpassungen sind nicht Bestandteil des aktuellen Stands.

Ein lokal oder im eigenen LAN nutzbares, nur lesendes Dashboard für **bereitgestellte** Agenten-Snapshots. Ohne ausdrücklich gestartete Pi-Extension erkennt es keinen laufenden Agenten; es sendet keine Daten an einen Onlinedienst. Nutzung durch einen einzelnen Besitzer ist vorgesehen; der LAN-Modus hat jedoch **keine Anmeldung** und ist von anderen Geräten im gleichen Netz erreichbar. **Zwischenstand:** HTTP- und automatisierte Browsertests wurden durchgeführt; eine manuelle visuelle und vollständige Tastatur-Abnahme steht noch aus. Reproduzierbare Ergebnisse und offene Punkte stehen in `VERIFICATION.md` und `HANDOFF.md`.

## Start und Prüfungen

Voraussetzung: Node.js >= 22; für den Offline-Server sind weder `npm install` noch ein Build erforderlich. Im Projektordner:

```sh
npm start
```

Öffnen Sie `http://127.0.0.1:4318/` im Browser (nicht `index.html` über `file://`). Ohne zusätzliche Option bindet der Server ausschließlich an `127.0.0.1`; bei belegtem Port: `npm start -- --port 4319`. Beenden mit `Ctrl+C`.

**Optional für ein vertrautes LAN:** Ermitteln Sie die private IPv4-Adresse **des Server-Rechners** (beispielsweise `192.168.1.27`; dies ist nur ein Beispiel, nicht die geprüfte Adresse dieses Geräts). Starten Sie zum Beispiel `npm start -- --host 192.168.1.27` (Adresse durch die tatsächlich ermittelte eigene IPv4 ersetzen). Im Browser eines anderen LAN-Geräts dann die angezeigte Adresse öffnen, im Beispiel `http://192.168.1.27:4318/`. `--port 4319` ist kombinierbar. Zulässig sind nur `10.x.x.x`, `172.16–31.x.x` und `192.168.x.x`; kein `0.0.0.0`, öffentlicher Hostname oder öffentliches Interface. Beim Start muss die gewählte Adresse auf dem Rechner vorhanden sein. Lokale Tests prüfen die Host-/Origin-Regeln, **nicht** die tatsächliche Erreichbarkeit von einem zweiten Gerät oder die Router-/Firewall-Konfiguration.

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

## Pi-Agenten live beobachten (opt-in)

In einem Terminal den Dashboard-Server mit `npm start` im Projektordner starten. In einem **zweiten** Terminal Pi mit der Projekt-Extension starten, beispielsweise aus dem Arbeitsverzeichnis der gewünschten Pi-Sitzung:

```sh
pi --extension "D:/imp-projekte/Pi-Dashboard/pi-dashboard-extension.mjs" --continue
```

Der gezeigte Windows-Pfad ist ein Beispiel aus der Entwicklungsumgebung; ersetzen Sie ihn durch den absoluten Pfad zu Ihrer eigenen Projektkopie. `--continue` nur verwenden, wenn die letzte Sitzung dieses Arbeitsverzeichnisses fortgesetzt werden soll. Eine bereits laufende Pi-Instanz nicht gleichzeitig mit derselben Sitzung nochmals starten: erst regulär beenden, dann fortsetzen. Alternativ Pi ohne `--continue` mit der Extension neu starten. Die Extension wird **nur für diese Pi-Instanz** geladen; weder globale Pi-Einstellungen noch andere Prozesse werden automatisch verändert. Das Dashboard unter `http://127.0.0.1:4318/` öffnen, oder den dokumentierten privaten LAN-Host wählen. Die Pi-Instanz selbst benötigt weiterhin ihre eigene Modell-/Netzwerkverbindung; der Dashboard-Server bleibt rein lokal.

Die Extension schreibt alle drei Sekunden einen validierten, atomar ersetzten `agent-status.json` mit Lebenszeichen, Agentenzustand (`in Arbeit`, `wartet`, `bereit` oder `fehlgeschlagen`), ausgewähltem Anbieter (nur fest bekannte Namen), erkannter **Modellfamilie statt roher Modell-ID**, bekannten aktiven Standard-Werkzeugnamen (kein vollständiges Custom-Tool-Inventar), Pi-Laufmodus und — sofern von Pi erfasst — Kontextfenster sowie **geschätzter** Belegung. Sie übernimmt **keine** Prompts, Tool-Argumente/-Ausgaben, rohe Modell-IDs oder benutzerdefinierte Tool-Namen, Credentials, Sitzungs-IDs, Dateipfade, Token-Gesamtsummen, Kosten oder ausgeführte Prüfnachweise. Nicht erhobene Werte bleiben „Nicht verfügbar“. Bei regulärem Pi-Ende erscheint „Pi-Sitzung beendet“; fehlt ein Lebenszeichen länger als zwölf Sekunden, zeigt das Dashboard statt eines alten Arbeitsstatus „Pi-Verbindung unterbrochen“. Das ist keine Garantie, dass ein abgestürzter Prozess korrekt beendet wurde.

Es gibt nur **einen** Live-Writer je Dashboard-Statusdatei. Er hält `agent-status.lock` während der Pi-Sitzung; der manuelle JSONL-Exporter darf währenddessen nicht schreiben. Nach einem Absturz kann die Sperre verwaisen: nur wenn sicher kein Live-Writer mehr läuft, `agent-status.lock` manuell entfernen. Der aktuelle Pi-Prozess nimmt die Extension nicht rückwirkend auf; die Aktivierung muss dort erfolgen, wo die gewünschte Sitzung gestartet wird. Automatische Tests nutzen synthetische Events; zusätzlich wurde Start/Ende einer isolierten Pi-RPC-Instanz **ohne Modellanfrage** erfolgreich geprüft. Ein echter Agentenlauf in der gewünschten produktiven Sitzung steht noch aus.

### Modell auf den ersten Blick & ChatGPT-Account-Limits (5h / Wöchentlich)

- **Modell & Anbieter:** Werden direkt im Kopfbereich (Modell-Badge) und in der ersten Kachel der vierreihigen Übersicht („Aktives Modell & Anbieter“) unmittelbar ohne Scrollen angezeigt.
- **ChatGPT-Quotas (5-Stunden- und wöchentliches Limit):** Wenn OpenAI als Provider aktiv ist oder Quotas übergeben wurden, zeigt das Dashboard zwei grafische Fortschrittsbalken mit verbleibenden Prozentwerten und Reset-Zeitangaben (sowohl in der Übersicht als auch in Bereich 06 „Kontext & Verbrauch“).
- **Warum keine automatische Online-Abfrage von `chatgpt.com/settings/usage?tab=overview`?**
  OpenAI stellt die persönlichen Kontoquotas aus den ChatGPT-Web-Einstellungen **nicht** über eine offene Programmierschnittstelle bereit. Die Seite liegt hinter Cloudflare-Bot-Schutz und erfordert eine aktive Browser-Web-Sitzung (`__Secure-next-auth.session-token`). Der Dashboard-Server ist zudem strikt offline ausgelegt und sendet keine Netzwerkanfragen ins Internet.
- **Quotas bequem einspeisen:**
  1. *Direkt in Pi:* In der mit der Extension gestarteten Pi-Sitzung `/limits <5h-%> <Woche-%> [Reset-Zeit]` eingeben, z.B. `/limits 85 60 "18:00 UTC"`. Die Extension aktualisiert die Statusdatei sofort. Zurücksetzen mit `/limits reset`.
  2. *Über die Kommandozeile:* Ohne laufende Extension `npm run status:limits -- --5h 85 --weekly 60 --reset-5h "18:00 UTC"` ausführen.

## Optionaler lokaler Pi-JSONL-Export (minimal)

Der Exporter `scripts/generate-pi-status.mjs` liest **nur eine ausdrücklich ausgewählte** Pi-Sitzungsdatei (JSONL). Er sucht keine laufenden Agenten und prüft keine Live-Aktivität. Standardmäßig sind nur Dateien unter `~/.pi/agent/sessions/` zulässig; bei bewusst anders konfiguriertem Pi-Sitzungsverzeichnis `--session-root` als absoluten Pfad angeben. Die ausgewählte `.jsonl` muss ebenfalls ein absoluter Pfad zu einer regulären Datei innerhalb dieses Verzeichnisses sein. Syntax: zuerst ohne Änderung prüfen, dann ausdrücklich schreiben:

```sh
npm run status:pi -- --session "<absoluter-Pfad-zur-Sitzung.jsonl>" --dry-run
npm run status:pi -- --session "<absoluter-Pfad-zur-Sitzung.jsonl>" --write
npm run status:validate -- agent-status.json
```

Bei einem eigenen Session-Verzeichnis beiden Exportaufrufen `--session-root "<absolutes-Verzeichnis>"` hinzufügen. **Nur nach Freigabe der Quelle** `--write` ausführen: Es ersetzt eine bestehende `agent-status.json` nach Validierung atomar; vorher sichern, falls deren Inhalte erhalten bleiben sollen. Die Ausgabe enthält nur `dataset: "live"` (tatsächliche lokale Quelle, **kein** Beleg für einen noch laufenden Agenten), den Zeitstempel des letzten vollständig gespeicherten JSONL-Eintrags und die feste Bezeichnung „Pi-Sitzung (anonymisiert)“. Alle anderen Messungen und Listen bleiben nicht verfügbar; insbesondere werden weder Zustand/Fortschritt, Sitzungspfad/ID, Prompts, Tool-Daten, Modell, Tokens, Kosten noch bestandene Checks aus dem Log übernommen. Ein wiederholter Aufruf ist nötig, um einen neuen Snapshot zu erzeugen; auch dann ist der Zeitstempel der Quelle maßgeblich. Kein automatischer Dateiwächter oder Schreibzugang über HTTP.

Ungültige/unvollständige JSONL-Dateien, unbekannte Sitzungsformate, rohe v1-Sitzungen (Pi migriert diese beim Laden), Datei-Symlinks und Quellen außerhalb des freigegebenen Verzeichnisses werden abgewiesen; Verzeichnis-Symlinks sind nur zulässig, wenn ihr aufgelöstes Ziel innerhalb der Freigabe liegt. Limit 16 MiB. Das Skript schreibt erst in eine eindeutige `.tmp`-Datei und verwendet `agent-status.lock` für **diesen** Exporter; fremde Writer müssen weiterhin koordiniert werden. Nach einem Absturz kann eine verwaiste Lock-Datei zurückbleiben: erst feststellen, dass kein Exporter mehr läuft, dann `agent-status.lock` manuell entfernen. Status, temporäre und Lock-Dateien sind ignoriert; Dateirechte auf Windows hängen zusätzlich von den lokalen ACLs ab. Nur synthetische Fixtures wurden für den Exporter getestet; keine produktive Session wurde exportiert. Ein Session-Log kann sensible Inhalte enthalten: niemals roh hochladen oder öffentlich committen.

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
7. **Aktivität:** datierte Ereignisse mit Kategorie, Status und Herkunft; lokale Suche in Zusammenfassung/Kategorie sowie kombinierbare Kategorie-/Statusfilter.
8. **Artefakte & Prüfungen:** gemeldete Dateien/Änderungen sowie getrennte Ausführungsnachweise.
9. **Probleme & nächste Schritte:** Risiken, Blocker, Fehler und Folgeaktionen mit Quelle.

Die Übersicht vor den Bereichen fasst Status, Auftrag, Probleme und beide Zeitstempel zusammen. Die Renderer-Implementierung enthält Listen, Aktivitätssuche/-filter und Prüfnachweise für die Bereiche 7–9; die automatisierte Browserprüfung ist in `VERIFICATION.md` beschrieben. Keiner der Bereiche ist eine automatische Pi-Inspektion.

## Atomare Updates durch einen Agenten

Es gibt keine Schreib-API. Nur ein ausdrücklich autorisierter lokaler Agent/Exporter soll einen vollständigen, datensparsamen Snapshot erzeugen. **Nie** `agent-status.json` an Ort und Stelle bearbeiten; der Server könnte einen halben JSON-Stand lesen. Die Vorlage unten prüft `agent-status.lock` **nicht**: während die Pi-Live-Extension läuft, darf sie nicht verwendet werden. Bei weiteren Schreibern zusätzlich einen einzigen Writer oder eine externe Sperre vereinbaren; atomare Umbenennung allein schützt nicht vor konkurrierenden Updates.

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

Server: standardmäßig Loopback, LAN-Bindung nur mit expliziter privater IPv4-Adresse; schreibgeschützte Routen-Allowlist, `GET`/`HEAD`, Host-/Origin-/Cross-Site-Prüfung, kein CORS, restriktive CSP und keine fremden Netzwerkanfragen. Im LAN gibt es **keine Authentifizierung und kein TLS**: Host-/Origin-Prüfungen sind keine Zugriffskontrolle für andere LAN-Geräte. Nur in einem vertrauten Netz mit passend auf das private Netz begrenzter Firewall-Freigabe verwenden, keine Router-Portweiterleitung/Internetfreigabe aktivieren und keine Geheimnisse in Statusdaten aufnehmen. Eine private Bind-Adresse allein beweist keine Nichterreichbarkeit über falsch konfigurierte Weiterleitungen. Keine beliebigen Workspace-Dateien oder rohe Status-/Beispieldateien über HTTP. JSON wird serverseitig normalisiert/redigiert und vor DOM-Ausgabe erneut redigiert; das ist **keine vollständige DLP-Garantie**. Quellen, Freitext, Dateipfade, Sitzungsbezeichner, Aktivität und Check-Befehle vor dem Schreiben minimieren; niemals API-Keys, Passwörter, Cookies, Tokens, Umgebungsvariablen, private Logs oder vollständige Prompts aufnehmen. Auch lokaler Browserzugriff und lokale Dateien sind keine Geheimnisablage.

**Store-Fehlergrenze:** Regressionstests prüfen fremde `fetchFn`-Fehler mit `Status token=DEMO_SECRET` sowie manipulierte HTTP-Status-/Content-Type-Werte direkt in `state.error`. Ein fehlgeschlagener Test gilt als Sicherheitsbefund, selbst wenn ein zusätzlicher Render-Redaktionsschritt die Anzeige absichert. Der lokale Testlauf belegt nur diese geprüften Fälle, keine umfassende DLP-Garantie.

## Fehlersuche und Folgeumfang

- Kein Styling/HTTP 422 bei `/styles.css`: Route und Datei `styles.css` prüfen; einen erfolgreichen Browserlauf nicht aus einem HTTP-Status allein ableiten.
- Keine Live-Werte: `dataset` und Dateiname prüfen; bei fehlender Live-Datei erscheint absichtlich `sample`. `npm run status:init` erstellt zunächst nur eine Sample-Kopie.
- HTTP 422 bei `/status.json`: Vorhandene Datei auf JSON, Version `1.0`, Struktur, Größe und Datumsangaben prüfen; `npm run status:validate -- agent-status.json`. Keine stille Rückkehr auf das Beispiel.
- HTTP 422 bei `/config.json`: `config.json` auf Ganzzahlen und Wertebereiche prüfen; dann Seite erneut laden.
- Altes Datum trotz erfolgreichem Abruf: `observedAt` der **Quelle** aktualisieren, nicht nur den Browser neu laden.
- Port belegt: mit `npm start -- --port 4319` einen anderen Port wählen. Bei LAN-Zugriffsproblemen die tatsächliche IPv4 des Server-Rechners, den im Startprotokoll genannten Host/Port und die lokale Firewall für das private Netz prüfen; ohne `--host` ist nur `http://127.0.0.1:<Port>/` erreichbar.
- Fehlgeschlagener Store-Sicherheitstest: keine Secrets in Fehlertexte liefern; Store-Grenze muss unabhängig vom Renderer repariert und erneut geprüft werden (nicht als bestandenen Check ausgeben).

**Explizit zurückgestellt:** Online-Anreicherung, externe APIs/Badges, Credentials-Adapter, automatische Pi-Logsuche oder Integration ohne explizit gestartete Extension, Fernsteuerung, Cloud-Speicher, externe Telemetrie und Multi-Agent-Flottenfunktionen. Der Dashboard-Server liest weiterhin nur die lokale Statusquelle.
