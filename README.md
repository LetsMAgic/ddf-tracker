# Die drei ??? – Folgen-Tracker

Eine installierbare, offline-fähige Progressive Web App zum Tracken, Bewerten und Entdecken der Hörspielfolgen von **Die drei ???**.

**Aktuelle Version: 16.2**

## Leitidee

Der Tracker beantwortet nicht nur die Frage „Welche Folgen habe ich gehört?“, sondern vor allem:

> Welche Folge passt gerade zu mir – und warum?

Aus deinen Bewertungen entsteht lokal auf deinem Gerät ein persönliches Geschmacksprofil. Daraus werden nachvollziehbare Empfehlungen, ähnliche Folgen und Hörpläne erzeugt.

## Funktionen

- Hörstatus, Hörverlauf, Notizen und vierstufige Bewertung
- persönliche Empfehlungen mit Begründung und Profilstärke
- Suche nach Titel, Nummer, Figuren, Handlung, Kapiteln, Themen und Autoren
- Community-Ranking und persönliche Bewertungsübersicht
- Schnellbewertung mit echter Rückgängig-Funktion
- eigene und kuratierte Playlists
- Smart-Playlist-Vorschau vor dem Speichern
- „Als Nächstes“-Warteschlange
- Backup-Export und sicherer Import mit Vorschau, Zusammenführen oder Ersetzen
- drei Katalogansichten: **Kompakt**, **Details** und **Cover**
- Streaminglinks für Spotify, Apple Music, BookBeat, Amazon Music, YouTube Music, Deezer und Amazon
- teilbares Hörprofil als PNG-Grafik
- installierbar und nach dem ersten Laden weitgehend offline nutzbar

## Cover-Modus

Die Coverbilder werden nicht in diesem Repository gespeichert. Die App übernimmt ausschließlich offizielle Cover-URLs, die in den Metadaten von [dreimetadaten.de](https://dreimetadaten.de/) hinterlegt sind. Bevorzugt wird die offizielle Quelle von dreifragezeichen.de, ersatzweise das offizielle Apple-Music-Cover.

Dadurch bleibt das Repository klein. Ohne Internetverbindung oder bei nicht erreichbaren Bildquellen zeigt die App automatisch einen ruhigen Platzhalter. Die Ansichten **Kompakt** und **Details** funktionieren unabhängig von den Covern.

## Streaming

Unter **Einstellungen → Bevorzugter Streamingdienst** wird festgelegt, welcher Anbieter als Hauptaktion erscheint. In der Folgendetailansicht werden weitere für die jeweilige Folge vorhandene Anbieter platzsparend unter **Weitere Anbieter** zusammengefasst.

## Teilbare Statistik

Im persönlichen Hörprofil erzeugt **Statistik als Bild teilen** eine 1080 × 1350 Pixel große PNG-Grafik mit:

- Gesamtfortschritt
- Anzahl der Bewertungen
- Hörstunden und Wiederholungen
- Bewertungsverteilung
- bevorzugtem Thema, Autor und prägender Figur
- persönlichen Favoriten

Private Notizen und einzelne Hörzeitpunkte erscheinen nicht im Bild.

## Installation

Die App läuft direkt über GitHub Pages. Auf iPhone und iPad lässt sie sich in Safari über **Teilen → Zum Home-Bildschirm** installieren. Auf unterstützten Desktop- und Android-Browsern erscheint eine entsprechende Installationsoption.

## Daten und Datenschutz

Es gibt kein Benutzerkonto und kein eigenes Backend. Persönliche Daten liegen ausschließlich lokal in IndexedDB:

- Bewertungen und Hörstatus
- persönliche Notizen
- Playlists und Warteschlange
- Hörverlauf
- Einstellungen und Empfehlungsfeedback

Regelmäßige JSON-Backups werden empfohlen, insbesondere vor einem Gerätewechsel oder dem Löschen von Browserdaten.

## Technischer Aufbau

Die App verwendet bewusst Vanilla JavaScript ohne Framework und ohne Build-Schritt. Alle Laufzeitdateien liegen direkt im Hauptverzeichnis des Repositorys:

```text
index.html
style.css
app.js
app-controller.js
core.js
catalog.js
recommendations.js
playlists.js
backup.js
sw.js
manifest.json
episodes-seed.js
episodes.json
```

Der lokale Seed ermöglicht den Offline-Start. Ergänzende Metadaten werden höchstens monatlich von dreimetadaten.de aktualisiert und anschließend lokal zwischengespeichert.

## Datenquellen und Hinweise

Metadaten wie Beschreibungen, Laufzeiten, Kapitel, Sprecherrollen, Cover- und Streaminglinks werden mit freundlicher Unterstützung der öffentlich bereitgestellten Datensammlung von [dreimetadaten.de](https://dreimetadaten.de/) ergänzt. Die kuratierten Bewertungen, Empfehlungen, Tags, prägenden Figuren und Playlists sind Bestandteil dieses Projekts.

## Rechtlicher Hinweis

Dies ist ein **inoffizielles, nicht-kommerzielles Fanprojekt** und steht in keiner Verbindung zu Sony Music Entertainment, EUROPA, dem KOSMOS Verlag oder den beteiligten Autorinnen, Autoren und Illustratorinnen bzw. Illustratoren.

„Die drei ???“, zugehörige Marken, Titel, Cover und Illustrationen gehören den jeweiligen Rechteinhabern. Dieses Repository enthält keine Kopien der Coverdateien; die App zeigt lediglich externe, in den Metadaten hinterlegte offizielle Bildquellen an.
