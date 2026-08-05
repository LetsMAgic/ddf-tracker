# Testprotokoll – Folgen-Tracker 15.0

## Schwerpunkt

Version 15 wurde auf den schnellsten Kernablauf geprüft:

1. App öffnen
2. ohne Scrollen „Passende Folge finden“ antippen
3. eine verfügbare, standardmäßig ungehörte Empfehlung erhalten
4. Folge direkt beim bevorzugten Musikdienst öffnen oder Details ansehen

## Automatisierte Prüfungen

- JavaScript-Syntax von `app.js` und `sw.js`
- 254 eindeutige Katalogeinträge
- identischer Inhalt in `episodes.json` und `episodes-seed.js`
- keine doppelten HTML-IDs
- Startseiten-CTA im ersten sichtbaren Bereich bei 320 × 568, 390 × 844, 430 × 932 und 1024 × 900 Pixeln
- kein horizontaler Seitenüberlauf auf den geprüften Breiten
- Empfehlung ohne vorhandene Bewertungen
- Empfehlung nach Import des echten Backups vom 05.08.2026
- Übernahme von Apple Music als bevorzugtem Dienst aus dem Backup
- Öffnen und Schließen der Empfehlungsdetails
- Öffnen und Schließen des Hörprofils mit anschließender Scrollfreigabe
- Folgen-Tab mit maximal 32 zunächst gerenderten Karten
- Suche nach „Feuriges Auge“
- Anzeige „Rama Sidri Rhandur · Gabriel White“ statt Tante Mathilda und Onkel Titus
- Ranking-, Listen- und Einstellungsansicht nach Backup-Import
- verschachtelter Ablauf Playlist → Folge → Folge schließen → Playlist schließen ohne verbleibenden Scroll-Lock
- erster Tutorialschritt führt direkt über den Hauptbutton zur Empfehlung
- keine JavaScript-Seitenfehler oder Konsolenwarnungen im Testablauf

## Empfehlungslogik

Geprüft wurden:

- Ausschluss nicht verfügbarer beziehungsweise noch unvollständiger Katalogeinträge
- ungehörte Folgen als Standardpool
- positive Gewichtung von Super- und Plus-Bewertungen
- deutliche Abwertung ähnlicher Folgen bei Minus-Bewertungen
- Berücksichtigung von Autor, Ära, Themen, Laufzeit, Community-Wertung und prägender Figur
- Normalisierung sehr häufiger Merkmale, damit allgemeine Begriffe nicht jede Empfehlung dominieren
- leichte Zufallsvariation innerhalb der besten Kandidaten statt immer derselben Folge

## Prägende Figuren

Für alle 245 derzeit veröffentlichten Story-Einträge wurde mindestens eine fallprägende Figur hinterlegt. Allgemeine Standardrollen wie Justus, Peter, Bob, Erzähler, Tante Mathilda oder Onkel Titus werden nicht automatisch als Kartenlabel benutzt. Sie bleiben weiterhin über die vollständige Besetzung auffindbar und in der Detailansicht erhalten.

Die reine Musikveröffentlichung „Die Originalmusik“ besitzt bewusst keine Figurenangabe und wird nicht als Hörspiel empfohlen. Bei den noch unveröffentlichten Folgen 241–248 wurde kein Name erfunden.

## Grenzen der Testumgebung

Die Oberfläche wurde in Chromium mit simulierten mobilen Viewports und lokaler IndexedDB geprüft. Die endgültige Installation, der echte Speicherverbrauch und die Übergabe an die nativen Apple-Music-/Spotify-Apps müssen nach dem GitHub-Update einmal direkt in der iOS-PWA geprüft werden.
