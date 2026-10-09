← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – offene Stufen

### Offen aus Stufe 20

Zwei Nachträge sind angelegt und **bewusst vertagt**, weil in beiden eine
Entscheidung des Nutzers fehlt. Sie stehen hier vollständig, damit die offenen
Punkte beim Planen vorliegen.

#### 20f – Preisverlauf als Diagramm

**Preisverlauf als Diagramm** (wie Idealo oder SteamDB), zwei getrennte Reihen je Release — die ruhige Händlerkurve und die springende Marktkurve; mit Stufe 21 käme der Store-Preis als dritter Kanal dazu, der nach Abschnitt 6 **nie** mit dem Gebrauchtpreis verrechnet werden darf

**Offen, und bewusst vertagt:** Am 02.10.2026 gab es genau *einen* Punkt je Release. Noch zu entscheiden sind (a) **wie verdichtet wird** — Vorschlag war „Tageswerte 90 Tage, danach ein Wert je Woche", entschieden ist nichts —, (b) der daraus folgende **Speicherverbrauch** und (c) die **Auslastung des Wartungsfensters**, die mit dem täglichen Takt von ~8 auf ~33 von 36 Aufrufen steigt. Alle drei bespricht der Nutzer, bevor gebaut wird

#### 20g – Preisalarm und Angebotskorrektur

**Preisalarm und Angebotskorrektur** – die Glocke in der Kopfzeile meldet, und ein falsches Angebot lässt sich zurücknehmen

**Offen, und bewusst vertagt:** Die Regel ist nicht entschieden. Zur Wahl stehen **relativ** („meldet, wenn der Preis 20 % unter seinem 30-Tage-Median liegt", greift ohne Zutun für alle offenen Absichten) und **absolut** („melde mir X unter 15 €", präziser, verlangt je Eintrag eine Eingabe); beides nebeneinander wäre möglich. Setzt 20f voraus, weil eine Grundlinie gebraucht wird. **Dazu gehört „ungültiges Angebot“** (Idee des Nutzers vom 02.10.2026): Wer einen Preis anklickt und sieht, dass das Angebot nicht taugt – sein Beispiel war *11-11: Memories Retold* für 6,98 €, im Angebotstitel „Nur Disc“ –, soll es verwerfen können: Das Angebot wird dauerhaft übergangen, sein Punkt aus dem Verlauf gestrichen und das nächstgünstigere sofort nachgeladen. Das ist dieselbe Regel wie bei Zuordnungen – was halb- oder vollautomatisch entsteht, muss sich zurücknehmen lassen (CLAUDE.md) –, nur bisher nicht für Preise. Technisch trägt es: eBay liefert zu jedem Angebot eine Kennung (`legacyItemId`), die auch in der URL steckt. Gebraucht werden eine Spalte dafür an `market_offer`, eine Liste verworfener Kennungen je Release, ein Filter in `guenstigstesGeprueft` und eine Route, die verwirft und sofort neu abruft. **Zu entscheiden, wenn die Stufe geplant wird:** ob `price_snapshot` die Kennung mitführt – nur dann lässt sich genau der Punkt löschen, der von diesem Angebot stammt, statt „alle Punkte mit diesem Preis“; und ob die Korrektur **vor** 20f gehört, weil jedes Falschangebot bis dahin weitere falsche Punkte in den Verlauf schreibt, den 20f dann zeichnet

### Die finalen Stufen

Fünf Stufen zum Abschluss, **bewusst ohne Nummer** (Entscheidung des Nutzers vom 02.10.2026): Es ist offen, ob weitere Funktionsstufen dazukommen. Sie laufen in dieser Reihenfolge, nachdem die Funktionsstufen abgeschlossen sind; die Nummern 1–5 gelten nur innerhalb dieses Blocks.

**Warum diese Reihenfolge.** Der erste Entwurf stellte die Oberflächenprüfung vor die Finalisierung der Sammlung. Der Nutzer hat eingewandt, dass ihm dann das Material fehlt – und das sticht. Die 22 Ansichten zerfallen nämlich in zwei Gruppen, die **entgegengesetzte** Datenlagen brauchen:

- **Arbeitsansichten** (`/scannen`, `/import`, `/pruefliste`, `/zuordnung`, `/ohne-zuordnung`, `/igdb`, `/pruefen`, Block B der Lücken) brauchen offenes Material. Nach der Finalisierung lassen sie sich gar nicht mehr ernsthaft prüfen, ohne Arbeit zu erfinden – zehn ungelesene Wunschlisten und 157 offene Disc-Fragen sind das letzte echte Material.
- **Leseansichten** (`/start`, `/sammlung`, `/spiel/:id`, die vier Listen, `/erscheint-bald`, `/trophaeen`, `/aenderungen`, `/einstellungen`) sehen auf unvollständigen Daten falsch aus.

Deshalb trägt Stufe 1 die Usability-Arbeit an den Arbeitsansichten mit, und Stufe 2 beschränkt sich auf die Leseansichten. So wird keine Ansicht auf der falschen Datenlage beurteilt.

#### 1. Die Sammlung finalisieren

Alles erfassen, was fehlt – per Barcode oder von Hand (Stand 02.10.2026: 53 Discs erfasst) –, die restlichen **zehn von dreizehn** Wunschlisten importieren, und die Datensätze gemeinsam durchgehen.

**Vor dem Import der zehn Listen zu entscheiden:** Der Import prüft keinen Besitz – ein erledigter Wunsch blockiert nicht, eine alte Liste legt ihn also neu an (8.2). Bisher nie eingetreten, aber mit zehn Listen wahrscheinlich; die beiden Haken sind, dass ein Wunsch am **Release** hängt (PS4 gekauft schließt PS5 gewünscht nicht aus) und dass eine PS+-Berechtigung kein Besitz ist (7.7).

**Beginnt mit einem Prüfbericht, nicht mit dem Aufräumen:** eine Handvoll Abfragen, die jede Art von Lücke benennt und zählt (am 02.10.2026: 183 Releases mit unbekannter Disc-Fassung, 59 Spiele ohne Trophäenliste, 1 ohne IGDB-Eintrag, dazu veraltete Sortierschlüssel und Einträge ohne Zuordnung). Das macht aus „validieren" eine endliche Liste. Teile davon gibt es als Ansicht (`/pruefen`, `/abweichungen`, `/ohne-zuordnung`), zusammengefasst sind sie nirgends.

**Die Frage nach den Schnittfassungen wird hier erneut geprüft** (Wunsch des Nutzers vom 08.10.2026). Er möchte grundsätzlich die ungeschnittenen Fassungen. Am 08.10.2026 war keine Quelle dafür zu haben – schnittberichte.com sperrt `ClaudeBot` und `anthropic-ai`, die USK bewertet nur die eingereichte Fassung (7.4). Das einzige verwertbare Signal ist die Store-Verfügbarkeit, und die gilt nur für PS4 und PS5: Über die ganze Sammlung gemessen fand sie **genau einen** Fall (Dying Light). Die Lücke sitzt bei **PS3 und Vita** – den Jahrgängen, in denen deutsche Schnittfassungen am häufigsten waren, und für die der Web-Store gar keine Seiten führt. Sobald die Sammlung vollständig ist, lohnt die Frage einmal neu: Wie viele Titel betrifft es überhaupt, gibt es inzwischen eine benutzbare Quelle, und reicht sonst ein Feld von Hand? Vorher ist jede Antwort eine Schätzung auf unvollständigem Bestand.

**Die Usability der Arbeitsansichten gehört hierher** – und zwar *bevor* die jeweilige Arbeit getan wird, nicht danach.

**„Gemeinsam korrigieren" heißt weiterhin: Nutzerdaten ändert nur der Nutzer, in der Anwendung** (Entscheidung vom 18.09.2026). Wo ein Weg fehlt, wird er gebaut. Erster Kandidat ist eine **Sammelaktion in Block B**: 113 der 157 offenen Releases tragen den Befund „eBay kennt kein Angebot" (3 % gemessene Fehlrate) und wären einzeln 113 Klicks. Ein „alle übernehmen" mit der Möglichkeit, vorher einzelne herauszunehmen, ist dasselbe Muster wie „Alle erfassen" bei den Scans oder „Alle übernehmen" im Wunschlisten-Import – keine Umgehung der Regel, sondern ihre Erfüllung. Eine Ausnahme, bei der der Assistent direkt schreibt, ist erwogen und verworfen: Das Änderungsprotokoll bekäme die falsche Quelle, und `physical_release_status = 'nein'` ist nach Abschnitt 3 definitionsgemäß die Entscheidung des Nutzers – die Daten würden über sich selbst lügen.

#### 2. Oberfläche und Bedienbarkeit

Die **Leseansichten** final durchgehen, in allen drei Breiten, dazu drei Dinge, die im Alltag selten vorkommen und deshalb oft falsch sind:

- **Leere Zustände** – jede Liste mit null Einträgen.
- **Offline** – die PWA hält alle Leseansichten vor; systematisch geprüft wurde das zuletzt in Stufe 18, vor Dashboard, Trophäenliste, Spieldetail-Umbau und Preisen.
- **Das Gerät des Nutzers** für die sicheren Bereiche. `env(safe-area-inset-*)` ist headless null – in 19c wurde dasselbe Verhalten dreimal falsch erklärt, bevor es gemessen war.

**Abgrenzung zu den Tests:** Die 786 automatischen Tests prüfen Verhalten und laufen bei jedem Deploy. Was sie nicht sehen können, ist, ob etwas **auffindbar** ist – und genau das war am 02.10.2026 dreimal der Fehler (Block B ließ sich nicht öffnen, die Preissortierung war nicht zu finden, das native Auswahlfeld passte nicht ins Bild). Keiner davon wäre je rot geworden. Die Handprüfung richtet sich deshalb auf Auffindbarkeit, Verständlichkeit und Wegelänge, nicht auf Funktion.

Ergebnis ist eine **Checkliste im Repository**, damit ein zweiter Durchgang vergleichbar ist.

#### 3. Refactoring

Effizienz, Redundanz, Netz- und Fensterauslastung, toter Code. Bekannte Altlasten: `unresolved_scan` trägt 12 Zeilen und ist seit Stufe 17d funktionslos; `/api/imports/feed` ist mit dem AWIN-Feed entfallen; `test/cron.spec.ts` und `test/lesekosten.spec.ts` rechnen das Wartungsfenster mit 24 statt 36 Aufrufen (10.1).

**„Verhält sich noch genauso" braucht Zahlen, nicht nur grüne Tests.** Die Tests prüfen Verhalten, `test/lesekosten.spec.ts` prüft Kosten – und die sind hier der eigentliche Vertrag. Ein Refactoring, das eine Abfrage schöner macht und dabei den Index verliert, ist grün und trotzdem ein Ausfall. Also dieselben Messungen vorher und nachher, Zahl gegen Zahl.

**In kleinen Merges**, jeder mit `git revert -m 1` einzeln zurücknehmbar – die `--no-ff`-Konvention trägt das bereits.

**Feedback einer fremden KI ist ausdrücklich erwünscht, aber als Hinweisliste**, nicht als Vorlage: Ein Außenstehender kennt die Grenzen dieses Projekts nicht (10 ms CPU je Aufruf, 5 Millionen gelesene Zeilen am Tag, 50 Fremdanfragen je Aufruf, fünf Terme in einem zusammengesetzten SELECT). Vieles, was allgemein sauberer heißt, wäre hier falsch. Jeder Punkt wird gegen die Regeln in CLAUDE.md gemessen – als Anstoß für eigene Ideen taugt er trotzdem.

#### 4. Wiederherstellungsprobe

Die letzte war am **14.09.2026** und hat einen echten Fehler gefunden (14.3). Seitdem ist die Datenbank von 1,79 auf **8,47 MB** gewachsen, der Dump auf 12,6 MB, und es sind drei Tabellen und sechs Migrationen dazugekommen. Eine Sicherung, die nie gegen den gewachsenen Bestand geprobt wurde, ist nur scheinbar eine Sicherung – und sie ist das Einzige zwischen dem Nutzer und dem Verlust seiner Bewertungen: Die Trophäen kämen aus PSN zurück, seine Entscheidungen nicht (Risikotabelle, Abschnitt 17).

#### 5. Außendarstellung auf GitHub

Die README ist heute ein **Betriebshandbuch von 1 550 Zeilen**; wer das Projekt zum ersten Mal sieht, findet darin nicht, was es ist. Sie wird geteilt: README als Schaufenster, der Betrieb nach `docs/`. Dazu Unterkapitel für FAQ, Einrichtung und Architektur.

**Bildschirmfotos sind eine Datenschutzfrage.** Das Repository ist öffentlich, echte Bilder zeigen die Sammlung des Nutzers. Dafür gibt es `scripts/testdaten.mjs` mit erfundenen Zeilen – genau daraus entstehen die Bilder. Dieselbe Regel wie beim Datenbank-Dump.

**Die Spezifikation ist das Interessanteste am Projekt** – fast 3 000 Zeilen Entscheidungen *mit Begründung*, verworfene Quellen samt Messung, Entwürfe, die an Zahlen gescheitert sind. Sie gehört ins Schaufenster, nicht in den Keller. Für die KI-Seite bleibt **CLAUDE.md die eine Quelle**; sie wird im README verlinkt, nicht dupliziert – zwei Dateien, die dasselbe sagen wollen, laufen auseinander.
