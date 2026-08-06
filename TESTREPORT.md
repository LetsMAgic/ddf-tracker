# Testbericht – Version 16.2

Prüfdatum: 6. August 2026

## Ergebnis

Die für Version 16.2 geänderten Dateien haben die durchgeführten statischen, Daten- und Browserprüfungen bestanden.

## Durchgeführte Prüfungen

### JavaScript und Module

- Syntaxprüfung aller JavaScript-Dateien mit Node.js
- erfolgreicher Import des vollständigen Modulgraphen aus `core.js`, `catalog.js`, `recommendations.js`, `playlists.js`, `backup.js` und `app-controller.js`
- Prüfung der neuen Einstellungen `cover` und aller sieben Streaminganbieter
- Prüfung der Rückfallwerte bei ungültigen alten Einstellungen

### Katalog und Metadaten

- `episodes.json` und `episodes-seed.js` enthalten beide 254 identische, eindeutige Einträge
- Normalisierung eines repräsentativen dreimetadaten-Datensatzes geprüft:
  - deutsche Feldnamen
  - Laufzeit in Millisekunden
  - Kapitelobjekte
  - Sprechrollen
  - offizielle Cover-URLs
  - Spotify, Apple Music, BookBeat, Amazon Music, Amazon, YouTube Music und Deezer
- vorhandene kuratierte Titel und Rocky-Beach-Wertungen werden beim Zusammenführen nicht überschrieben

### HTML-Verknüpfungen

- statische Element-IDs und die aus JavaScript angesprochenen Oberflächenelemente wurden gegengeprüft
- neue Bedienelemente für Cover-Modus, Streamingauswahl und Statistikfreigabe sind vorhanden

### Browser-Integration

Automatisierter Chromium-Test in einem mobilen Viewport von 390 × 844 Pixeln mit einem isolierten Testkatalog:

- App startet ohne JavaScript- oder Konsolenfehler
- Cover-Raster rendert zweispaltig
- externe Cover werden lazy geladen
- fehlende Cover behalten einen sichtbaren Platzhalter
- Folgendetailansicht bündelt sechs alternative Anbieter unter „Weitere Anbieter“
- bevorzugter Streamingdienst erscheint als Hauptaktion
- Profilgrafik wird als gültige PNG-Datei erzeugt
- erzeugte Testgrafik: 1080 × 1350 Pixel, rund 1,18 MB

Der Browsertest verwendet absichtlich Mock-Metadaten und einen temporären In-Memory-Speicher, damit keine persönlichen Daten oder externen Dienste verändert werden.

## Unverändert regressionsrelevant

Die folgenden bereits in Version 16.1 vorhandenen Abläufe wurden durch die Änderungen nicht umgebaut:

- Empfehlungslogik und Bewertungsmodell
- Schnellbewertung samt Zurück-Funktion
- Smart-Playlist-Vorschau vor Speichern oder Übernahme
- Backup-Vorschau, Zusammenführen und Ersetzen
- Warteschlange und persönliche Playlists
- PWA-Updatebanner und Datenmigration

## Grenzen der Prüfung

Die Verfügbarkeit einzelner Cover- und Streaminglinks hängt von externen Anbietern ab und kann sich ändern. Nach der Veröffentlichung sollte deshalb zusätzlich ein kurzer Test auf dem tatsächlich genutzten iPhone erfolgen:

1. Metadaten aktualisieren.
2. Cover-Ansicht öffnen.
3. eine Folge mit mehreren Anbietern öffnen.
4. Statistikbild über das iOS-Teilen-Menü teilen.
5. App einmal vollständig schließen und erneut offline öffnen.
