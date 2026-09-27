
```markdown
# Adeptus Mechanicus / Cyber-Gothic UI Design System

Dies ist das vollständige technische Asset-Paket zur Implementierung des Agenten-Dashboards im visuellen Stil des Adeptus Mechanicus (Kombination aus Cyberpunk-HUD und sakraler Gotik).

Es enthält Design-Tokens (CSS-Variablen), globale Stile, HTML/CSS-Komponenten-Snippets, SVG-Vektoren und eine finale Instruktionsvorlage für den Coding-Agenten.

---

## 1. Setup & Fonts (`index.html` Head)

Binde diese Google Fonts in den `<head>` deiner HTML-Datei ein:

```html
<link rel="preconnect" href="[https://fonts.googleapis.com](https://fonts.googleapis.com)">
<link rel="preconnect" href="[https://fonts.gstatic.com](https://fonts.gstatic.com)" crossorigin>
<link href="[https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Share+Tech+Mono&display=swap](https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Share+Tech+Mono&display=swap)" rel="stylesheet">

```

---

## 2. Design Tokens & Globale Stile (`theme.css`)

Definiere die Kernfarben und den CRT-Hintergrundeffekt:

```css
:root {
  /* --- Farbschema --- */
  /* Hintergrund */
  --bg-void: #050705;
  --bg-surface: #0a100b;
  --bg-surface-elevated: #0f1911;

  /* Primärfarben (Matrix / Phosphor) */
  --matrix-green: #00ff41;
  --matrix-green-dim: #008f26;
  --matrix-green-glow: rgba(0, 255, 65, 0.35);

  /* Sakrale Akzente (Omnissiah Bronze / Kupfer) */
  --sacred-bronze: #c59b27;
  --sacred-bronze-dim: #6d5415;
  --sacred-bronze-glow: rgba(197, 155, 39, 0.3);

  /* Status-Farben */
  --status-crit: #ff2a2a;
  --status-warn: #e67e22;

  /* --- Typografie --- */
  --font-mono: 'Share Tech Mono', monospace; /* Fließtext, Werte, Code */
  --font-gothic: 'Cinzel Decorative', Georgia, serif; /* Überschriften, Titel */

  /* --- Ränder --- */
  --border-width: 1.5px;
}

/* --- Globaler CRT-Scanline & Background Effekt --- */
body {
  background-color: var(--bg-void);
  color: var(--matrix-green);
  font-family: var(--font-mono);
  margin: 0;
  padding: 20px;
  /* Vektor-Raster-Hintergrund */
  background-image: 
    linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Subtiler CRT Scanlines Overlay */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 2px
  );
  z-index: 9999;
}

```

---

## 3. UI-Komponenten Snippets

### A. Modular Panel (Container)

*Beschreibung: Hauptcontainer mit 45-Grad-abgeflachten Ecken (`clip-path`) und sakralem Kupfer-Header.*

#### HTML

```html
<div class="mech-panel">
  <div class="mech-panel-header">
    <span class="mech-corner-bracket"></span>
    <h3 class="mech-title">COGNITIO-SUBROUTINE // 01</h3>
    <span class="mech-badge">ONLINE</span>
  </div>
  <div class="mech-panel-body">
    <p>System bereit zur Gebetsabfolge. Keine Häresie im Speicherbereich detektiert.</p>
    <div class="binary-stream">01001111 01001101 01001110 01001001</div>
  </div>
  <div class="mech-panel-footer">
    <span>HEX: 0x8FA4</span>
    <span>LITANIE DER WAHRNEHMUNG</span>
  </div>
</div>

```

#### CSS

```css
.mech-panel {
  background: var(--bg-surface);
  border: var(--border-width) solid var(--sacred-bronze-dim);
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.9), inset 0 0 8px rgba(0, 255, 65, 0.05);
  position: relative;
  /* Komplexe polygonale Form (abgeschrägte Ecken) */
  clip-path: polygon(
    0 12px, 12px 0,
    calc(100% - 12px) 0, 100% 12px,
    100% calc(100% - 12px), calc(100% - 12px) 100%,
    12px 100%, 0 calc(100% - 12px)
  );
  margin-bottom: 20px;
}

.mech-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-elevated);
  border-bottom: var(--border-width) solid var(--sacred-bronze);
  padding: 8px 16px;
}

.mech-title {
  font-family: var(--font-gothic);
  color: var(--sacred-bronze);
  margin: 0;
  font-size: 1rem;
  letter-spacing: 1.5px;
  text-shadow: 0 0 6px var(--sacred-bronze-glow);
}

.mech-badge {
  background: rgba(0, 255, 65, 0.15);
  border: 1px solid var(--matrix-green);
  color: var(--matrix-green);
  font-size: 0.75rem;
  padding: 2px 6px;
  text-shadow: 0 0 4px var(--matrix-green-glow);
}

.mech-panel-body {
  padding: 16px;
  color: var(--matrix-green);
  font-size: 0.9rem;
}

.mech-panel-footer {
  display: flex;
  justify-content: space-between;
  border-top: 1px dashed var(--sacred-bronze-dim);
  padding: 6px 16px;
  font-size: 0.7rem;
  color: var(--sacred-bronze-dim);
}

```

### B. HUD Metrik-Widget (Stat Box)

*Beschreibung: Kompakter Indikator mit Chamfer-Ecke und segmentiertem Micro-Balken.*

#### HTML

```html
<div class="mech-stat-widget">
  <div class="stat-top">
    <span class="stat-label">KERN-TEMPERATUR</span>
    <span class="stat-index">[02]</span>
  </div>
  <div class="stat-value">64.8<span class="stat-unit">°C</span></div>
  <div class="stat-bar-wrapper">
    <div class="stat-bar-fill" style="width: 65%;"></div>
  </div>
</div>

```

#### CSS

```css
.mech-stat-widget {
  background: rgba(5, 12, 6, 0.85);
  border: 1px solid var(--matrix-green-dim);
  border-left: 4px solid var(--matrix-green);
  padding: 12px 14px;
  /* Chamfer cut (nur unten rechts) */
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
  width: 220px;
}

.stat-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--matrix-green-dim);
}

.stat-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--matrix-green);
  text-shadow: 0 0 8px var(--matrix-green-glow);
  margin: 6px 0;
}

.stat-unit {
  font-size: 0.9rem;
  color: var(--sacred-bronze);
  margin-left: 4px;
}

.stat-bar-wrapper {
  height: 6px;
  background: rgba(0, 255, 65, 0.1);
  border: 1px solid var(--matrix-green-dim);
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: var(--matrix-green);
  box-shadow: 0 0 8px var(--matrix-green);
}

```

### C. Mechanicus Terminal Button

*Beschreibung: Interaktiver Button mit doppelter Abschrägung.*

#### HTML

```html
<button class="mech-btn">
  <span class="btn-text">INITIALISIERE RITUS</span>
</button>

```

#### CSS

```css
.mech-btn {
  background: transparent;
  color: var(--sacred-bronze);
  border: 1.5px solid var(--sacred-bronze);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: bold;
  letter-spacing: 1px;
  padding: 10px 22px;
  cursor: pointer;
  position: relative;
  text-transform: uppercase;
  /* Doppelt abgeschrägte Ecken (oben links, unten rechts) */
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  transition: all 0.2s ease-in-out;
}

.mech-btn:hover {
  background: var(--sacred-bronze);
  color: var(--bg-void);
  box-shadow: 0 0 12px var(--sacred-bronze);
}

.mech-btn:active {
  transform: scale(0.98);
}

```

### D. Segmentierter Ladebalken ("Rite Progress")

*Beschreibung: Mechanische Fortschrittsanzeige.*

#### HTML

```html
<div class="mech-stepped-progress">
  <div class="progress-segment active"></div>
  <div class="progress-segment active"></div>
  <div class="progress-segment active"></div>
  <div class="progress-segment active"></div>
  <div class="progress-segment"></div>
  <div class="progress-segment"></div>
</div>

```

#### CSS

```css
.mech-stepped-progress {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--matrix-green-dim);
  background: var(--bg-void);
  width: fit-content;
}

.progress-segment {
  width: 14px;
  height: 20px;
  background: rgba(0, 255, 65, 0.08);
  border: 1px solid rgba(0, 255, 65, 0.2);
}

.progress-segment.active {
  background: var(--matrix-green);
  box-shadow: 0 0 6px var(--matrix-green-glow);
}

```

---

## 4. Dekorative Vektor-Elemente (SVG)

### Deko-Zahnrad mit HUD-Zielkreis

*Beschreibung: Dieses Vektor-Element kann direkt als SVG in Ecken platziert oder als Hintergrundmuster verwendet werden.*

#### SVG Markup

```html
<div class="mech-cog-ornament">
  <svg width="60" height="60" viewBox="0 0 100 100" fill="none" stroke="currentColor">
    <!-- Äußerer gestrichelter HUD-Ring -->
    <circle cx="50" cy="50" r="46" stroke="var(--sacred-bronze-dim)" stroke-dasharray="4 6" stroke-width="1.5" />
    <!-- Innerer Ring (Green) -->
    <circle cx="50" cy="50" r="38" stroke="var(--matrix-green-dim)" stroke-width="1" />
    <!-- Vektor-Zahnrad (Bronze) -->
    <path d="M46 16 h8 v6 h-8 z M46 78 h8 v6 h-8 z M16 46 h6 v8 h-6 z M78 46 h6 v8 h-6 z M27 27 l6 6 l-4 4 l-6 -6 z M67 67 l6 6 l-4 4 l-6 -6 z M27 73 l-6 -6 l4 -4 l6 6 z M73 27 l6 -6 l-4 -4 l-6 6 z" fill="var(--sacred-bronze)" />
    <!-- Zentraler Bronze Ring -->
    <circle cx="50" cy="50" r="18" stroke="var(--sacred-bronze)" stroke-width="2" />
    <!-- Zentraler Kern (Green) -->
    <circle cx="50" cy="50" r="6" fill="var(--matrix-green)" />
  </svg>
</div>

```

---

## 5. Finale Prompt-Vorlage für den Coding-Agenten

Kopiere diesen Prompt und gib ihn deinem Agenten (z.B. Cursor, Claude Dev), um das Dashboard zu bauen:

---

```markdown
Implementiere eine Dashboard-Ansicht im vollständigen "Adeptus Mechanicus / Cyber-Gothic" Design unter Verwendung der bereitgestellten technischen Assets.

Befolge strikt diese Design-Regeln:
1.  **Farbpalette:**
    *   Hintergrund: Absolutes Schwarz (#050705).
    *   Primäre Daten & Text: Matrix-Phosphorgrün (#00FF00 / #00ff41) mit subtilem Text-Glow (`text-shadow: 0 0 5px rgba(0,255,65,0.4)`).
    *   Ränder, Panel-Titel & sakrale Akzente: Altes Kupfer/Bronze (#c59b27 und #6d5415).
2.  **Typografie:**
    *   Dashboard-Titel, Panel-Header und wichtige Ritus-Bezeichnungen: 'Cinzel Decorative' (sakraler Kult-Stil).
    *   Fließtext, Werte, Labels, Binärcodes und Tabellen: 'Share Tech Mono' (Monospace Terminal).
3.  **UI-Formen:**
    *   Keine runden Ecken (`border-radius: 0`). Verwende 45-Grad-abgeschrägte Ecken via `clip-path` (wie in den Snippets definiert).
    *   Fülle leere Bereiche mit künstlicher Komplexität: Subtile vertikale Binärcode-Streifen, Hex-Codes und HUD-Brackets.
4.  **Komponenten:** Setze die bereitgestellten CSS-Variablen und Komponenten-Snippets (Panels, Stat-Widgets, Buttons, Progress Bars) für das Layout ein.

```

```

```
