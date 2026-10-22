← [Inhaltsverzeichnis](README.md) · [15 Repository und Deployment](15-repository-deployment.md)

## 15. Repository, Deployment und Zugriffsschutz – Kosten und Teilen

### 15.4 Kostenmodell und Schutz vor ungewollten Kosten

Alle genutzten Dienste liegen im Free-Tier. Entscheidend ist, **wie** Cloudflare
mit dem Überschreiten umgeht: Die Free-Pläne rechnen nicht in eine Überziehung
hinein, sondern blocken hart.

| Dienst | Free-Grenze | Bei Überschreitung |
|---|---|---|
| Workers | 100.000 Anfragen/Tag | Fehler 1027 bzw. 429, keine Abrechnung |
| Workers (Fremdanfragen) | 50 je Aufruf | weitere `fetch` schlagen fehl – gegen die Dokumentation geprüft am 01.10.2026 |
| Workers Static Assets | im Workers-Kontingent | 429 statt Auslieferung |
| D1 | 5 GB, 5 Mio. gelesene / 100.000 geschriebene Zeilen pro Tag | Abfragen schlagen fehl, keine Abrechnung |
| Zero Trust Access | 50 Sitze | Weitere Nutzer werden abgewiesen |

Der Wechsel in einen Bezahlmodus ist damit immer eine **ausdrückliche Handlung**
(Upgrade-Klick), kein Nebeneffekt von Nutzung. Für eine Single-User-Anwendung
sind die Grenzen ohnehin um Größenordnungen entfernt: ein Sitz von 50, und ein
Trophäen-Sync erzeugt einige hundert Anfragen, nicht hunderttausend. Die 72 Cron-Aufrufe je
Nacht (10.1, zwei Einträge von fünf erlaubten) zählen als Anfragen. **Gemessen am 01.10.2026:
116 040 gelesene und 799 geschriebene Zeilen in 24 Stunden**; die Rechnung aus den Einzelkosten und
die jüngsten 24-Stunden-Messungen stehen in 10.1 („Die Lesekosten sinken mit der Aufteilung"). **Die CPU-Grenze je Aufruf dagegen hält kein Cron-Schritt ein** (10.1, „Was ein
Aufruf wirklich an CPU kostet"). Von den beiden Grenzen ist die **Schreibgrenze** die
engere, sobald eine Stufe den Bestand einmal durchschreibt: Stufe 19b käme mit 18 355 Trophäen
auf rund 37 000 Schreibungen (7.7).

Nicht abgedeckt von dieser Zusicherung sind Dienste, die es gar keinen Free-Tier
gibt – wer später etwa Workers Paid für Cron-Häufigkeiten oder R2 hinzunimmt,
trifft diese Entscheidung bewusst. Für den in Abschnitt 2 beschriebenen Stack
ist das nicht nötig.

### 15.5 Was das Teilen wert ist

Das Repo ist ohne deine Daten vollständig nachvollziehbar: Schema, Migrations, Matching-Logik und die Anbindungen sind der interessante Teil, die Sammlung ist es nicht. Wer das Projekt nachbauen will, legt eine eigene D1-Datenbank an und trägt sein eigenes NPSSO ein.

Sinnvoll für die README: Setup-Anleitung, Liste der benötigten Secrets, der Wiederherstellungsablauf aus 14.3 und ein ausdrücklicher Hinweis darauf, dass die PSN-Anbindung inoffiziell ist.
