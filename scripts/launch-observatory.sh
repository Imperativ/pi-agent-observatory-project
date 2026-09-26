#!/usr/bin/env bash
# ==============================================================================
# Pi Agent Observatory Launcher
# Öffnet Konsole mit 2 Tabs:
#   Tab 1: Dashboard-Server (npm start)
#   Tab 2: Pi Agent mit Live-Extension in fish
# ==============================================================================

DIR="/home/imp/Dokumente/imp-projekte/pi-dashboard"
TABS_FILE="$DIR/scripts/konsole-tabs.txt"

# Optional: Nach 1.2 Sekunden Browser mit dem lokalen Dashboard öffnen
(
  sleep 1.2
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:3000" >/dev/null 2>&1 || true
  fi
) &

# Konsole mit beiden Tabs starten
exec /usr/bin/konsole --workdir "$DIR" --tabs-from-file "$TABS_FILE"
