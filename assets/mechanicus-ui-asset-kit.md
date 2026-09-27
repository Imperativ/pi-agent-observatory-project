# Adeptus Mechanicus / Cyber-Gothic — Überarbeiteter Asset-Katalog

Nach deinem Feedback wurden die Grafiken von Grund auf neu als **hochdetaillierte, erwachsene Grimdark-Artworks** im authentischen Warhammer 40.000 / Adeptus Mechanicus-Stil gestaltet.

---

## 1. Referenz & Stilabgleich

![Referenz: Mechanicus UI-Richtlinien](/home/imp/.gemini/antigravity/brain/d87529ed-2e5a-4c4f-99fa-23866ac67ea1/.user_uploaded/media_1790422833514.jpg)

---

## 2. Die neu erstellten Grafiken

````carousel
![Opus Machina Medaillon](/home/imp/.gemini/antigravity/brain/d87529ed-2e5a-4c4f-99fa-23866ac67ea1/skull_cog_medallion_1790423523319.jpg)
<!-- slide -->
![Oculus Mechanicus Schematik](/home/imp/.gemini/antigravity/brain/d87529ed-2e5a-4c4f-99fa-23866ac67ea1/bionic_eye_schematic_1790423543519.jpg)
<!-- slide -->
![Cranial-Cogitator Schematik](/home/imp/.gemini/antigravity/brain/d87529ed-2e5a-4c4f-99fa-23866ac67ea1/cranial_cogitator_schematic_1790423569303.jpg)
<!-- slide -->
![Sakrales Reinheitssiegel](/home/imp/.gemini/antigravity/brain/d87529ed-2e5a-4c4f-99fa-23866ac67ea1/purity_seal_prop_1790423588915.jpg)
````

---

### A. Opus Machina Medaillon (`assets/skull-cog-medallion.jpg`)
* **Stil:** Schweres, massives Bronze- und Schwarzgusseisen-Zahnrad mit Grünspan-Patina und Sechskantschrauben.
* **Schädel:** Anatomisch exakter gealterter Knochenschädel links, nahtlos verschmolzen mit einer biomechanischen Titan- und Messingplatte rechts.
* **Sensorik:** Ein tief im Okulargehäuse sitzendes, intensiv phosphorgrün glühendes Ziellinsenauge mit feinem HUD-Fadenkreuz.
* **Sakrale Plakette:** Unten eingraviert: *"DEUS EX MECHANICUS DOMINI OMNISSIAH"*.

---

### B. Oculus Mechanicus Schematik (`assets/schematic-eye.jpg`)
* **Stil:** Hochpräzises technisches CAD-Schnittbild / Konstruktionszeichnung eines bionischen Augapfels.
* **Konstruktion:**
  * Pergament-Spruchband mit Frakturschrift: *"SPECIFICATIO OCULUS MECHANICUS"*.
  * Mehrstufige asphärische Linsengruppen mit Ray-Tracing-Strahlenverlauf.
  * Mechanische Irisblende mit Getriebeübersetzung.
  * Rechnergestützte retinale Sensormatrix.
  * Austretender Nervenkabelbaum mit Metallgeflecht und Sockelanschluss zum Cranial-Schädel-Bus.
  * Exakte Bemaßungen, Winkelbögen (`145.2°`) und Toleranzen.

---

### C. Cranial-Cogitator Schematik (`assets/schematic-skull.jpg`)
* **Stil:** Militärisch-sakrales technisches Datenblatt des Servitor-Schädelmoduls MK-IV (*"AUTORISIERUNG: OMNISSIAH"*).
* **Konstruktion:**
  * Laser-scharfe Phosphorgrün-Vektoren auf tiefschwarzem Rasterhintergrund.
  * Schnitt durch den Schädelknochen mit freigelegtem Primär-Cogitator-Kern (`TITANIUM GRADE-AM`).
  * Synapsen-Flux-Matrix und Goldlegierungs-Leiterbahnen.
  * Ziel-Okular-Reticle, Halsgelenk-Kabelsteuerung und Verankerungswinkel.
  * Originalgetreue deutsche Beschriftungen und Binärblöcke.

---

### D. Sakrales Reinheitssiegel (`assets/purity-seal.jpg`)
* **Stil:** Fotorealistisches physisches Requisit.
* **Elemente:**
  * Tiefrotes Siegelwachs mit natürlichem Glanz und Tropfspuren.
  * Zentraler Schädel- und Zahnrad-Prägestempel mit integriertem Binärcode.
  * Zwei herabhängende, gealterte Pergamentbänder mit ausgefransten Rändern und gotischer Liturgie sowie Binärversen (*01001111 01001101*).

---

## 3. Technische Einbindung im System
* Alle 4 Grafiken wurden mit ImageMagick web-optimiert (unter 210 KB je Bild, gestochen scharfe 800×800 bzw. 600×900 Auflösung).
* [`server.mjs`](file:///home/imp/Dokumente/imp-projekte/pi-dashboard/server.mjs) unterstützt binäres Streaming für diese Assets mit `image/jpeg`.
* Automatisierte Servertests in [`test/server.test.mjs`](file:///home/imp/Dokumente/imp-projekte/pi-dashboard/test/server.test.mjs) verifizieren die Bereitstellung (97/97 Tests grün).
