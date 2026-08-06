# Die drei ??? – Folgen-Tracker 16.0

Version 16 poliert die App in drei Richtungen: schnellere Bedienung, nachvollziehbarere Empfehlungen und eine wartbare modulare Codebasis.

## Direkt sichtbare Änderungen

- Einführung von 28 auf 3 Schritte verkürzt
- Schnellbewertungsmodus für bekannte Folgen
- verständliche Passungsstufen plus Match-Score und Profilstärke
- „Heute nicht“, dauerhaft ausblenden und „Mehr/Weniger davon“
- abwechslungsreichere Empfehlungen durch Diversitätsabzüge
- „Mein Ranking“ als ehrliche Ansicht „Meine Bewertungen“
- kompakte und ausführliche Folgekarten
- aktive Filterchips, Jahres-, Notiz- und Mehrfachhören-Filter
- feste Aktionen und Vor-/Zurück-Navigation in Folgendetails
- echte „Als Nächstes“-Warteschlange mit Reihenfolge
- Playlist-Fortschritt und Smart-Playlist-Planer
- Backup-Vorschau, Zusammenführen, Ersetzen und Sicherheitsbackup
- Backup-Erinnerung nach vielen Änderungen oder 30 Tagen
- Diagnoseansicht und kontrolliertes Service-Worker-Update

## Technische Änderungen

Die bisherige große `app.js` wurde ohne Framework und ohne Build-Zwang in native ES-Module aufgeteilt:

```text
app.js
js/
  app-controller.js
  backup.js
  catalog.js
  core.js
  playlists.js
  recommendations.js
```

Die vorhandene IndexedDB bleibt bei `ddf-tracker`, Version 1, Object Store `kv`, Schlüssel `appState`. Daten aus Version 15 werden beim ersten Start normalisiert und um neue Einstellungen ergänzt.

## Diese Dateien ersetzen

- `index.html`
- `style.css`
- `app.js`
- `sw.js`
- `manifest.json`
- `README.md`

## Diese Ordner neu hinzufügen

- `js/`
- `scripts/`
- `tests/`
- `.github/workflows/`

Außerdem neu:

- `package.json`
- `playwright.config.js`

## Diese Dateien unverändert behalten

- `episodes.json`
- `episodes-seed.js`
- `FEATURED_CHARACTERS.md`
- `icon.svg`
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`

## Veröffentlichung

1. Vorher in der laufenden Version 15 ein JSON-Backup exportieren.
2. Den Inhalt dieses Pakets in die Wurzel des GitHub-Repositories kopieren.
3. Bestehende Dateien überschreiben, neue Ordner übernehmen.
4. `episodes.json`, `episodes-seed.js` und die Icons nicht löschen.
5. Commit und Push auf `main`.
6. Die installierte PWA einmal vollständig schließen und erneut öffnen. Die Service-Worker-Brücke übernimmt den Wechsel von Cache 15 auf 16.

## Lokale Prüfung

```bash
npm install
npm test
npm run test:browser
```

`npm test` prüft Syntax, Modulstruktur, HTML-Referenzen, Katalogdaten und die Identität von `episodes.json` und `episodes-seed.js`. Die Playwright-Tests prüfen Desktop Chromium und iPhone-Layout.

## Katalogpflege

`episodes.json` ist künftig die manuell gepflegte Quelle. Danach lässt sich die Offline-Datei automatisch erzeugen:

```bash
npm run catalog:build
npm run catalog:validate
```

## Bewusst nicht eingebaut

Kein Konto, kein Backend, keine Cloud-Synchronisierung, keine generierten Cover und keine aufdringliche Gamification. Die App bleibt eine lokale, offline-fähige PWA.
