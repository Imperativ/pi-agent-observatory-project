# Agent Observatory — prüfbarer Zwischenstand

Stand: nach Wiederaufnahme des Handoffs; diese Datei hält **tatsächlich ausgeführte** lokale Prüfungen fest, keine Produktabnahme. Projekt: `D:/imp-projekte/Pi-Dashboard`, Node `v25.8.1`, npm `11.12.1`, Chrome unter `C:/Program Files/Google/Chrome/Application/chrome.exe`. Browserprüfungen verwenden eine temporäre Statusdatei **innerhalb des Projekts**, einen isolierten Loopback-Server und schließen beides nach dem Lauf.

| Befehl | Beobachtetes Ergebnis |
| --- | --- |
| `npm run check` | 15 JS-Dateien syntaxgeprüft; DOM-Senken-Guard, Sample, Schema-JSON, Konfiguration gültig (nach Anlage des Browser-Skripts). |
| `npm test` | 69 bestanden, 0 fehlgeschlagen (58 Contract, 4 HTTP/Server, 7 Store). |
| `npm run schema:check` | Ajv strict kompiliert; Beispiel, Minimalquelle, Negativfälle und Drift-Check bestanden. |
| `npm run status:validate` | Beispiel gültig, `schemaVersion=1.0`, `dataset=sample`. |
| `npm run smoke` | `npm start -- --port 0`: acht freigegebene HTTP-Routen 200, private Routen/Origin/Schreibmethode blockiert. |
| `npm run test:browser` | Lokaler Chrome/Playwright: Beispiel, neun Bereiche, Aktivitätsfilter/Details, Tastaturöffnung, Theme-Umschaltung, Polling, Retention bei beschädigter Quelle, veraltete/fehlende/ungültige Quellzeit, DOM-Injektion und Secret-Redaktion in HTTP-Status und DOM (inkl. `--access-token`), axe WCAG A/AA (ausgewählte WCAG-2/2.1-Tags), Mobilbreite 390px und ungefangene Browserfehler geprüft; kein Befund im letzten ausgeführten Lauf. |
| `npm audit --offline` | 0 bekannte Vulnerabilities gemäß lokal verfügbarer Audit-Daten; **kein** Online-Audit-Nachweis. |
| `git diff --check` | Keine Whitespace-Fehler beim Zwischenstandslauf. |

Ein kontrollierter Test mit `fetchFn`-Fehler `Status token=DEMO_SECRET` bestätigte außerdem, dass der fremde Text nicht in `state.error` erscheint. Der unabhängige Read-only-Review fand anschließend eine andere Lücke: `--access-token DEMO_SECRET_VALUE` in `checks[].evidence.command` wurde unredigiert übertragen; außerdem formatierte die UI `2025-02-30` trotz unbekannter Aktualität als März-Datum. Beide Befunde wurden reproduziert, korrigiert und mit Contract-/Browserchecks erneut geprüft. Eingehende Statuswerte werden am Server- und DOM-Rand redigiert; das ist weiterhin keine vollständige DLP-Attestierung.

## Abdeckung und Grenzen

- Der Browserlauf prüft semantische Interaktion und ausgewählte axe-Regeln automatisch; **keine** vollständige manuelle Tastatur-/Screenreader-/visuelle Kontrastprüfung an echten Geräten oder weiteren Browsern. Dark/Light wurde durch Umschalten und Farbvergleich geprüft, der axe-Lauf erfolgte im Standardmodus.
- Das Browser-Skript nutzt kontrollierte lokale Fixtures, keine tatsächliche Pi-Agenten-Telemetrie. Es wurden keine echten Werte für Modell, Token, Kosten oder Agentenrechte ausgelesen.
- Online-Integrationen sind absichtlich nicht implementiert; deshalb keine Online-Timeout-/API-/Badge-Prüfung. Der Offline-Kern kontaktiert kein Internet.
- Die README dokumentiert eine Vorlage für atomare Updates; ein echter produktiver, minimierter `agent-status.json` wurde nicht erstellt oder ausgeführt.
- Der unabhängige Read-only-Review ist erfolgt; eine abschließende manuelle Abnahme bleibt offen. Bei Weiterarbeit alle Befehle erneut ausführen und Befunde dokumentieren.
