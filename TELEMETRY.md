# Datenquellen und Account-Telemetrie (Windows 11)

## Bereits umgesetzt

Die **ausdrücklich gestartete** Pi-Extension liefert nur beobachtete und belegbare Daten. Sie schreibt Sitzungs-/Agentenstart, feste Lifecycle-Ereignisse, bekannten Anbieter und Modellfamilie, aktivierte Standardwerkzeuge, Shell-/Dateiwerkzeug-Indikatoren, Pi-Laufmodus, Node.js-Version, unter Windows den erkennbaren OS-Build, Kontextfenster/-schätzung sowie Eingabe-/Ausgabe-Tokens aus dem aktiven Pi-Sitzungszweig. Weder letztere noch der Kontextwert sind **accountweite Limits**. Ohne nutzbare Usage-Einträge bleibt der Zähler unbekannt. `identity.startedAt` ermöglicht eine lokale Laufzeitberechnung; `assignment.startedAt` bezeichnet nur den letzten Agentenlauf.

Standardmäßig werden **keine** Pfade oder Git-Daten veröffentlicht. Wer `PI_DASHBOARD_INCLUDE_WORKSPACE=1` **vor dem Start von Pi** setzt, gibt Arbeitsverzeichnis sowie lokale Git-Wurzel/Branch frei; es wird keine Remote-URL abgefragt. Der LAN-Modus hat keine Anmeldung. Entfernen Sie die Umgebungsvariable nach dem Start wieder und prüfen Sie die Statusdatei, bevor Sie LAN-Zugriff erlauben.

`goal`, `step`, `progress`, Skills, Browser/Netzwerk, konkrete Freigaben, Artefakte und bestandene Checks werden nicht aus Prompts, Dateinamen, Werkzeugnamen oder Prozessrechten erraten. Für diese Felder kann ein **separater, ausdrücklich autorisierter** Agent einen minimierten Snapshot nach dem Vertrag in `README.md` schreiben; während der Live-Extension nicht parallel schreiben (`agent-status.lock`). Checks benötigen die vorgeschriebenen Ausführungsnachweise. Ein `null` ist besser als ein falscher Wert.

## Account-Quoten: drei verschiedene Begriffe

1. **Pi-Sitzungsverbrauch:** Nur Token dieses aktiven lokalen Zweigs. Kein verbleibendes Nachrichtenlimit und kein Konto-Zähler.
2. **ChatGPT-Abo-Kontingent:** In der ChatGPT-Kontoseite sichtbare 5h-/Wochenwerte; derzeit nur per **manueller** `/limits`-Eingabe (bei laufender Extension) oder `npm run status:limits` (ohne Writer) erfassbar. Der Messwert behält die Zeit der Eingabe, auch wenn der Pi-Heartbeat später aktualisiert wird. Die CLI erneuert dabei einen älteren Pi-Snapshot nicht.
3. **OpenAI-API-/Google-Gemini-API-Nutzung und Cloud-Quoten:** Je nach Produkt, Projekt und Berechtigung separat verfügbar; nicht mit ChatGPT Plus/Pro oder der privaten Gemini-Web-App gleichzusetzen. API-Verbrauch kann niemals ohne Weiteres in ein ChatGPT-5h-Restlimit umgerechnet werden.

## Optionale künftige Adapter (nicht implementiert)

- **Offizielle API-/Cloud-Metriken:** Ein separat gestarteter, explizit autorisierter Prozess könnte Anbieter-/Projekt-Usage über offizielle Schnittstellen abfragen. Nur die minimal benötigte Leseberechtigung verwenden; keine Admin-Keys im Browser, Dashboard-Server, Status-JSON, Git oder in Logs ablegen. Zeitfenster, Einheit, Projekt und Quelle in der Messung vermerken. Fehlende Quota-Reset-Information bleibt unbekannt. Vor Implementation API-Dokumentation, Berechtigungen, Kosten und Datenmodell für das konkrete Konto prüfen.
- **Benutzergeführter lokaler Import:** Ein vom Benutzer freigegebener Screenshot/Text der eigenen Usage-Seite könnte auf Windows 11 lokal ausgelesen und bestätigt werden, *ohne* Browser-Cookies oder Passwörter ins Projekt zu übertragen. Der extrahierte Wert wäre eine manuell bestätigte Momentaufnahme und müsste Quellzeit, Einheit und Produkt enthalten. OCR/Seitenlayout ist fehleranfällig; keine unbestätigten Werte übernehmen. **Nicht implementiert.**
- **Browserautomation des eigenen Profils:** Möglich nur nach ausdrücklicher Freigabe, mit Schutz der bestehenden Sitzung und unter Beachtung der Anbieterbedingungen. Keine Umgehung von Bot-Schutz, keine Extraktion von Session-Tokens, kein Hintergrund-Scraping. **Nicht implementiert und kein verlässlicher Ersatz für eine offizielle API.**

Eine automatische, vertrauenswürdige Abfrage des **ChatGPT-Abolimits** oder des privaten **Gemini-Web-Kontos** ist in diesem Stand nicht belegt. Der Dashboard-Server sendet weiterhin keine Internetanfragen. Vor einer späteren Verbindung muss das UI Anbieter/Produkt und Quotenfenster korrekt unterscheiden: die bestehenden Balken heißen ausdrücklich ChatGPT-5h/Woche und dürfen nicht mit fremden API-Metriken befüllt werden.
