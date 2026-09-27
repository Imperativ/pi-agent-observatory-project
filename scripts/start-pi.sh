#!/usr/bin/env fish
cd /home/imp/Dokumente/imp-projekte/pi-dashboard
echo "============================================="
echo "  Pi Agent mit Live-Extension"
echo "============================================="
# Kurzer Moment, damit der Dashboard-Server zuerst erreichbar ist
sleep 1.2
pi --extension /home/imp/Dokumente/imp-projekte/pi-dashboard/pi-dashboard-extension.mjs
# Falls Pi beendet wird (/quit), bleibt die fish-Shell interaktiv geöffnet:
exec fish
