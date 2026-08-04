# Drei ??? Folgen-Tracker

Dieses Paket enthält eine mobile-first Browser-App mit IndexedDB, Suche, Filter, Bewertung, Tags, Empfehlungen, Export und Import.

## Dateien
- `index.html` – Einstieg
- `style.css` – Layout
- `app.js` – Logik
- `manifest.json` – PWA-Metadaten
- `sw.js` – Offline-Cache
- `data/episodes.json` – Folgenkatalog
- `icons/` – App-Icons

## iPhone-Hinweis
Am zuverlässigsten läuft eine PWA, wenn die Dateien über einen kleinen statischen Webserver oder eine gehostete HTTPS-Seite bereitgestellt werden. Als reine lokale Datei funktioniert die App ebenfalls, aber die Service-Worker-Installation kann je nach iOS-Einschränkung begrenzt sein.

## Backup
Der Export erzeugt eine JSON-Datei mit:
- gehörten Folgen
- Bewertung Plus/Neutral/Minus
- eigene Tags
- Notizen
- zuletzt verwendeten Filtern

Der Import liest genau dieses Format wieder ein.

## Rocky-Beach-Ranking
Das externe Ranking ist als optionales Feld vorgesehen. Die App kann einen importierten Katalog mit `rockyRanking`-Werten nutzen, ohne dass deine eigenen Bewertungen überschrieben werden.
