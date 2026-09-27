#!/usr/bin/env fish
cd /home/imp/Dokumente/imp-projekte/pi-dashboard
echo "============================================="
echo "  Pi Agent Observatory Server"
echo "  URL: http://127.0.0.1:4318"
echo "============================================="
npm start
# Falls npm start beendet wird, bleibt die fish-Shell interaktiv geöffnet:
exec fish
