# Lehren

Vorfälle mit Datum und Zahlen, aus denen eine Regel entstanden ist. Die **Regel**
steht in [`../CLAUDE.md`](../CLAUDE.md) oder im zuständigen
[Spezifikationsabschnitt](spec/README.md); hier steht, **was passiert ist**.

Diese Datei wird **nicht routinemäßig gelesen**. Sie ist da, wenn eine Regel
fragwürdig erscheint oder jemand sie umgehen will: Dann steht hier, was sie
gekostet hat.

Eine Sache zieht sich durch fast alles, was hier steht: **Im Aggregat sieht man
die Wirkung, nicht die Ursache.** Fast jeder Befund kam aus einer einzelnen
Zeile, einem Bildschirmfoto oder dem Nutzer – nicht aus einer Summe.

---

## Lesekosten

**13.09.2026 – die Anwendung war einen Tag tot.** Die Sammlungsansicht las ohne
Indizes **160 000 Zeilen je Seite**, sortiert nach „zuletzt gespielt" **741 000**.
Der Free Tier erlaubt 5 Millionen gelesene Zeilen am Tag; danach antwortet jede
Abfrage bis Mitternacht UTC mit `D1_ERROR`. Migration 0008 legte die Indizes auf
die Fremdschlüssel, Migration 0011 den in 0008 übersehenen nach. Dieselben
Abfragen lesen seither 2 000 bis 5 000 Zeilen.
→ Regel: jeder Fremdschlüssel hat einen Index, in **derselben** Migration wie die
Tabelle.

**28.09.2026 – die Indexregel war zu eng gefasst.** `game.sort_title` ist kein
Fremdschlüssel, trug deshalb keinen Index, und die Abfrage, mit der jeder
Titelabgleich sein Release sucht (`releasesNachSchluessel`), war ein Tabellenscan:
**480 gelesene Zeilen je einzelnem Abgleich** statt vier – 303-mal je Nacht im
Spielzeit-Schritt (≈ 145 000), 730-mal je Kaufliste-Durchlauf (≈ 350 000).
Aufgefallen an `rows_read_24h = 1 335 628` **ohne** Import. Migration 0025.
→ Regel: **jede** Spalte, über die in einer Schleife gesucht wird, braucht einen
Index, auch wenn sie kein Fremdschlüssel ist.

**Und der Wächter hatte ein blindes Feld.** `test/lesekosten.spec.ts` maß bis
dahin ausschließlich Leseansichten. Ein Sync-Schritt, der je Eintrag eine
Abfrage macht, lief deshalb acht Tage lang ungemessen.
→ Regel: Schreibschritte kommen genauso in die Messung wie Listenabfragen.

**01.10.2026 – gemessen wird die Route, nicht die Abfrage.** Der Dashboard-Feed
stand mit **183 Zeilen** in der Messung und las in Wahrheit **18 500**: Die Route
machte eine zweite Abfrage („ist die Erstbefüllung durch?"), die mit
`COUNT(*) FROM trophy` den ganzen Bestand zählte – bei jedem Öffnen des
Dashboards, und zusätzlich am Ende jeder der 108 Portionen der Erstbefüllung
(≈ 2 Mio.). Zusammen **4,16 von 5 Mio.** gelesenen Zeilen an einem Tag; der
Hinweis kam vom Nutzer. `offeneListen()` beantwortet dieselbe Frage aus
`trophy_progress` (431 Zeilen), die Feed-Route liest jetzt **607 statt 18 500**.
→ Regel: Wer eine Route misst, zählt **alles**, was sie tut. Eine Frage nach „ist
etwas offen?" beantwortet die kleine Tabelle, nicht die große.

**02.10.2026 (Nachtrag 21b) – der Leerlauf zählt mit.** Die Auswahl des
Store-Schritts las im **Leerlauf** 430 Zeilen und lief in jedem der 36 Aufrufe
des PSN-Fensters mit: Die Nacht stieg von 54 000 auf **69 444**. Ursache war
`… OR physical_release_status = 'nein'` auf einer Spalte ohne Index. Jetzt eine
CTE aus zwei Index-Lookups plus ein Teilindex (Migration 0032): **4 statt 430**
im Leerlauf, 341 statt 90 mit Arbeit, je Nacht 2 840 statt 12 760. Gefunden hat
es die Lesekosten-Messung **nach** dem Deploy, weil sie um den Leerlauf erweitert
worden war.

**Stufe 15 – `OR` über zwei Spalten in einer Unterabfrage.** Beide Spalten waren
indiziert, und SQLite wich trotzdem auf `idx_plan_offen` aus und las alle
Einträge der Art je Zeile: **12 000 statt 3 200** gelesene Zeilen.
→ Regel: zwei Unterabfragen (`NOT EXISTS … AND NOT EXISTS …`) oder eine `UNION`
zweier Index-Lookups mit den Filtern **innerhalb** der Teilabfragen.

**Stufe 16 – Keyset statt `(? IS NULL OR id < ?)`.** Mit dem Bind las die zweite
Seite des Änderungsprotokolls **2 052 statt 51 Zeilen**.
→ Regel: eine optionale Bedingung gehört als eigener Text ins Statement.

**24.09.2026 – fünf Terme, nicht sechs.** Fünf `UNION ALL`-Teile gehen, sechs
antworten mit `too many terms in compound SELECT` (SQLITE_ERROR 7500) – gemessen
gegen Produktion **und** lokale D1. Eine Zählertabelle als ein großes
`UNION ALL` ist damit ausgeschlossen; `SUM(bedingung)` und `GROUP BY` in einem
Batch (`src/db/stats.ts`).

**18.09.2026 – 100 gebundene Werte je Statement.** `/api/games` mit `limit=200`
antwortete in der Produktion mit `500`, weil `IN (?,…)` über eine ganze Seite das
Bind-Limit sprengt. `limit` wird seither auf 100 gekappt statt mit `D1_ERROR` zu
antworten.

---

## Wenn mehrere Maßnahmen zugleich ausgeliefert werden

**23.09.2026 – der Bind war es nicht.** Als der nächtliche IGDB-Schritt zwei
Nächte schwieg (Stufe 18b), war der gebundene Datums-Modifier in
`datetime('now', ?)` einer von **drei** Verdächtigen, und alle drei wurden
zugleich geändert. Danach stand er in der Spezifikation als gemessene Ursache.
Er war es nicht: Die auswählende Abfrage (`zumAuffrischen`) band weiterhin, weil
die Umstellung von 18b nur die **Zählabfrage der Statusanzeige** getroffen hatte
– und frischte trotzdem jede Nacht auf (49 Spiele am 23.09.2026). Belegt sind
die beiden anderen Maßnahmen: der fehlende Stempel für Spiele, die IGDB nicht
zurückgibt, und das fehlende `try/catch` um die IGDB-Schritte. Seit Stufe 18d
steht der Modifier überall als Text – als Stil, nicht als Erklärung eines
Ausfalls.

→ **Die größere Lehre:** Werden mehrere Maßnahmen gegen einen Fehler zugleich
ausgeliefert, ist hinterher **keine** davon belegt. Was als Vermutung gebaut
wurde, wird auch als Vermutung aufgeschrieben.

---

## Ein Schritt, der ruht, sagt warum

**27.09.2026 – vier Tage unbemerkt, 210 Einträge weg.** Der Kauflisten-Schritt
schrieb für Erfolg **und** Fehler dieselbe Marke `{fertigAm}` in `app_setting`.
Ein auf der ersten Seite gescheiterter Lauf sah damit aus wie ein vollständiger
und legte sich selbst für sieben Tage still – vier Tage unentdeckt, und in der
Produktion fehlten 210 Berechtigungen. Behoben in 18e mit `{fehlerAm}`.
→ Regel: Erfolg und Fehler dürfen nie dieselbe Marke hinterlassen. Gilt für jeden
periodischen Schritt mit Frist.

**27.09.2026 – die Nebenwirkung hing am Auslöser statt am Schritt.** Das
Wegräumen eines alten `fehler` am Zugang stand in `cronSchritt`. Der Knopf
„Kaufliste jetzt abrufen" holte daraufhin 210 Berechtigungen, und in den
Einstellungen stand weiter „Fehler beim letzten Versuch".
→ Regel: Wer einen zweiten Weg zu einem Schritt baut, erbt dessen Wirkung sonst
nicht – die Wirkung gehört an den Schritt.

**01.10.2026 (Stufe 18f) – derselbe Fall, eine Stufe später.** In der Nacht zum
01.10. bekam die zweite Spielzeit-Seite `403`; der Schritt schrieb `-1`, und
**179 von 379 Titeln** blieben einen Tag ohne frische Spielzeit, während 20
Aufrufe des Fensters leer liefen. 18e hatte denselben Fall für den Sync gelöst;
dieser Schritt war älter und hatte die Einsicht nie bekommen.

**01.10.2026 – vier Anläufe am Portionsknopf, und die naheliegende Vermutung war
falsch.** Der Knopf für die Einzeltrophäen hielt beim ersten echten Durchlauf
bei **126 von 431** Listen an, beim zweiten nach zwei Portionen bei **154**. Beide
Zahlen passten zu einem Ratenlimit mit noch offenem Fenster – belegt war es
nicht, und es stand als Vermutung da. Erst weil der dritte Versuch seinen
**Ausgang aufschrieb** (Zahl, Zeitpunkt und Grund in `app_setting`, das Neuladen
überlebend), war er erklärbar: Eine Portion mit 14 Listen und 401 Trophäen lief
sauber durch, danach kam keine Anfrage mehr an, und die Oberfläche wartete still
weiter. Kein Ratenlimit – `fetch` wartet von sich aus unbegrenzt, und die Portion
war nach der **falschen Grenze** geschnitten (14 Listen ≈ zehn Sekunden in einer
Anfrage, abgeleitet aus den 50 erlaubten Fremdanfragen statt aus der Dauer). Jetzt
`AbortSignal.timeout(30 s)` und **vier** Listen je Portion. Dazu drei Fehler in
der Oberfläche: ein fehlgeschlagener `fetch` sprang an jeder Meldung vorbei
heraus, Fortschritt und Meldung standen über bzw. mehrere Bildschirme unter dem
Knopf statt daneben, und der Fortschritt zählte die Listen *dieses* Durchlaufs
und begann nach einem Abbruch wieder bei null, obwohl schon 168 von 431 geholt
waren. Ohne die Aufzeichnung wäre die falsche Vermutung gebaut worden.

**29.09.2026 – NPSSO und Refresh-Token sind gemeinsam gestorben.** Der Nachtlauf
scheiterte um 03:00 im NPSSO-Rückfall – erreichbar nur, wenn Sony vorher den
Refresh-Token abgelehnt hat, obwohl dessen `refresh_expires_at` noch auf den
06.10. stand. Das NPSSO war **25 Tage** alt. Beides ist gemessen; **warum** der
Refresh-Token vor seiner Frist fiel, ist es nicht. Naheliegend, aber unbelegt:
ein Hängen an der NPSSO-Sitzung, aus der er stammt. Der Cron hat sich dabei genau
wie entworfen verhalten – ein Versuch, dann 35 stille Aufrufe.

**27.09.2026 – die Egress-Vermutung ist widerlegt.** Der Ausfall der Kaufliste
in 18c war mit „Cloudflares Egress gegen `web.np.playstation.com`" erklärt
worden. Derselbe Worker erreicht den Host; die Kaufliste antwortet einwandfrei
(730 Einträge, gemessen am 27.09.2026). Was die Nacht zum 23.09.2026 zum
Scheitern brachte, **bleibt unerklärt** – wäre aber ab jetzt am nächsten Morgen
zu sehen.

---

## Im Aggregat sieht man die Wirkung, nicht die Ursache

**02.10.2026 (Stufe 20) – das Lesen der 79 Zeilen fand fünf Fehlgriffe.** Der
Abgleich hätte 79 Releases automatisch auf `physical_release_status = 'ja'`
gesetzt. **Jede Kennzahl sprach dafür:** Auf den 197 unabhängig durch IGDB
belegten Discs griff dieselbe Regel 180-mal, und die Fehlgriffe aus der
Vorab-Messung waren alle beseitigt. Das Lesen der 79 Zeilen fand fünf weitere –
ein Einwort-Titel in einem längeren Namen („Journey" → *Robinson: The Journey*),
ein Nachfolger („SteamWorld Dig" → *Dig 2*), ein PS2-Angebot, und zwei, die gar
keine Disc waren: ein **Konto für 261 €** und ein **Trophäen-Dienst für 226 €**.
Keiner war in einer Summe sichtbar, und eine Stichprobe hätte sie auch nur
zufällig getroffen. Vier neue Bedingungen beseitigen alle fünf und kosten einen
belegten und vier unbekannte Treffer.
→ Regel: Wer einen Schritt baut, der Nutzerdaten ohne Rückfrage ändert, legt die
**vollständige Liste des ersten Laufs** vor – dem Nutzer, und sich selbst.

**02.10.2026 (Stufe 21) – dieselbe Regel beim Store, drei Fallen.** Auch hier
sprach jede Kennzahl für den ersten Entwurf, und die Fehler standen in keiner
Summe: Bei Abo-Titeln ist der aktive Knopf die **PS-Plus-Werbung** (Baldur's
Gate stand mit 0,00 € statt 48,99 €, betroffen 17 von 57 Titeln), eine Seite
trägt zwölf bis vierzehn Blöcke und mehrere einen Kaufknopf **ohne** Preis
(Horizon: 50 111 gegen 62 420), und ein ungeschützter Rückfall nahm eine
**Demo für 0,25 €** (Kitchen `[demo]`).

**03.10.2026 (Nachtrag 21c) – gefunden hat es der Nutzer, nicht die Messung.**
Bei *Outcast: Second Contact* wurde die **Deluxe Edition** genommen – 49,99 statt
14,99 €, Faktor 3,3. Beide Produkte tragen denselben Titelschlüssel, weil
„deluxe edition" weggekürzt wird, und innerhalb der Treffergruppe stand Sonys
Standardprodukt vorn. Jetzt gewinnt dort der kürzeste Name. Gegen alle 57 Treffer
gemessen: **genau ein Fall.** Gefunden hat ihn der Nutzer beim Durchsehen der
Liste.

**Und die Folge, die dabei übersehen wurde:** Ein einmal gesetztes
`psn_product_id` wird von keinem automatischen Prozess erneut aufgelöst. Nach
21c stand bei *Outcast* deshalb weiter die Deluxe Edition, weil der billige Weg
sie nie wieder prüft. Der Satz „der Nachtlauf schreibt den Wert heute Nacht
selbst um" war falsch.
→ Regel: Wer eine Auswahlregel korrigiert, sagt dazu, dass **Altbestand sie nicht
sieht**, und baut einen Weg, sie zurückzunehmen (beim Store: Feld leeren löst
sofort neu auf).

---

## Rendern findet, was Lesen nicht findet

**Stufe 19 – drei Fehler, beim Lesen des Codes unsichtbar:** ausgeblendete
Navigationspunkte, die doch erschienen; eine Knopfreihe, die dem Titel 66 Pixel
ließ; fünf Symbolknöpfe in einer 171 px breiten Kachel.

**Stufe 19a – vier weitere:** doppelte Überschriften durch die Regelreihenfolge,
eine Marke am falschen Knopf mangels `position: relative`, „Invalid Date" (die
Funktion `datum()` kannte ISO und den blanken Tag, aber nicht SQLites
Schreibweise mit Leerzeichen), und eine Tafel, die oben auf der Seite statt unter
ihrem Knopf aufging.

**Stufe 19b – drei Klassenkollisionen in einer Stufe.** `App.css` hat über 3 600
Zeilen, und drei neue Namen trafen auf bestehende:

- `.deckel` ist der Cover-Platzhalter mit Seitenverhältnis und 1,6 rem Schrift –
  und machte die zugedeckte Trophäe zu einem leeren Kasten.
- `.chips` ist die Filterleiste der Sammlung, ragt mit negativen Rändern heraus
  und bringt eine Linie mit – in der Trophäenliste ragte die links heraus und
  hörte rechts mitten im Kasten auf.
- `.stufe` war Tabellenzeile (19a) **und** Trophäenzeichen (19c); die spätere
  Regel gewann, machte die Tabellenzeilen inline und die farbigen
  Verhältnisbalken unsichtbar. Die Zeichen heißen jetzt `.stufenzeichen`.

Gefunden hat alle drei der Nutzer, nicht das Rendern – im Bild sieht man die
Wirkung, nicht die Ursache.
→ Regel: Vor jedem neuen Klassennamen in `App.css` danach greppen; wer eine
bestehende Klasse mitbenutzt, prüft ihre Regeln **ganz**, nicht nur die Farbe.
Ein Klassenname ist eine Zusage über seinen Kontext.

**01.10.2026 – der Asset-Hash beweist nur, dass es ankommt, nicht dass es
wirkt.** `main` hatte **zwei** `max-width`-Regeln an derselben Auswahl – eine aus
Stufe 5, eine aus der Gestaltungslinie von Stufe 19. Geändert wurde die erste,
gewirkt hat die zweite: Die 80 rem blieben wirkungslos, das Layout blieb bei
64 rem, und der gemeldete Fehler war am nächsten Tag unverändert da. Gemeldet,
gebaut, deployt, Hash geprüft – und geprüft war nur der Hash. Jetzt trägt die
ältere Regel keinen Deckel mehr; bei 1920 px endet die Kopfzeilen-Linie bei
1 705 und der Feed bei 1 697.
→ Regel: Bei einer Gestaltungsänderung gehört das **Bild** zur Prüfung, nicht die
Prüfsumme.

**27.09.2026 – dreimal falsch erklärt, bis es gemessen war.**
`min-height: 100dvh` auf `body` machte mit `viewport-fit=cover` jede Seite um die
sicheren Bereiche zu hoch: **854 gegen 800** auf dem Gerät des Nutzers, 54 px
Überhang. Vorher ging `viewport-fit=cover` auf Verdacht live und war es nicht;
erst Bildschirmfoto und Pixelmessung zeigten, dass der Strich außerhalb der Seite
liegt. **`env(safe-area-inset-*)` ist headless null, auf dem Handy nicht** –
nachstellbar ist die Geometrie nur, indem die `env()`-Regeln im Browser durch
feste Pixelwerte ersetzt werden. Deshalb gibt es jetzt den Block **„Anzeige"** in
den Einstellungen, der Fenster, Bildschirm, sichere Bereiche und Überhang dort
ausliest, wo sie gelten. Im selben Zug: Im Spieldetail lagen **112 px** unter dem
letzten Element, weil die Ansicht zusätzlich zu `main` noch einmal polsterte.

**Dass etwas genau passt, ist kein Bestand.** In 19c hatte die Wortspalte eines
Knopfes exakt die Breite ihres Textes (49 px), und auf dem Gerät fehlte trotzdem
ein Pixel.
→ Regel: immer drei Breiten rendern – **360 × 800** (das Gerät des Nutzers),
390 × 844 und 1280 × 900. Was bei 390 *gerade eben* passt, schneidet bei 360 ab.

**01.10.2026 – jede Zahl über tausend war betroffen.** Das Tausendertrennzeichen
ist ein Leerraum und damit eine Umbruchstelle: Bei 360 px wurde aus „2 348" ein
„2" über einem „348". Die Zahl trägt jetzt `white-space: nowrap`.

**02.10.2026 (Stufe 20e) – das eine Bedienelement, das die Linie nicht
mitmachte.** Die Sortierung war in fünf Listen ein natives `<select>` – das
einzige Steuerelement, das die Gestaltungslinie aus Stufe 19 nicht mitmachte, und
die Richtung ließ sich gar nicht wählen. Aufgefallen ist es dem Nutzer.
→ Regel: **Ein neues Bedienelement ist fast immer schon da.** Vorher in der
Anwendung nach einem gleichartigen suchen: verankertes Menü
(`.menueanker` + `.menuetafel`), Chip mit Tafel (`Chips`), Auswahltafel
(`ZustandTafel`, `QuellenTafel`). Native Felder bleiben richtig, wo sie ein
**Formular** bedienen.

**02.10.2026 – ein umgekehrter Vergleicher stellt „unbekannt" nach vorn.** Der
erste Entwurf der Sortierrichtung kehrte den Vergleicher um, und absteigend
standen prompt die Releases *ohne* Preis vorn.
→ Regel: Die Richtung gehört **in** den Vergleicher hinein, nicht um ihn herum.

**Eine neue Ansicht bekommt vorher einen Prototyp.** In Stufe 19 und 19a
entstanden die tragenden Entscheidungen beide Male erst im Bild; 19a lief über
sieben Fassungen, 19c über drei Prototypen und sechs Runden am Gerät, die
Trophäenliste über vier Rückmeldungen. In Stufe 19a war die **Desktop-Fassung**
des Dashboards schlicht vergessen, bis der Nutzer danach fragte.

---

## Berichten

**21f – gefilterte Testausgabe.** `npm test | tail -3` schnitt die Zeile mit den
Fehlschlägen weg, und 21f ging mit **sieben roten Tests** in einen Commit. Die
Zusammenfassung steht nicht immer am Ende.
→ Regel: auf `Test Files`/`Tests` greppen oder ungefiltert lesen.

**Stufe 21 – die nachgebaute Abfrage.** Für den Bericht „neun Einträge warten
noch" war die Auswahl des Schritts von Hand nachgebaut und dabei dessen eigene
Ausnahme vergessen. In Wahrheit waren acht davon dauerhaft ausgenommen und nur
einer offen.
→ Regel: Wer berichtet, was ein Schritt tun wird, führt **dessen** Abfrage aus.

**29.09.2026 – „der neueste Lauf" war der vorherige.** Direkt nach dem Push hat
GitHub den neuen Lauf oft noch nicht angelegt, und `gh run list --limit 1`
liefert dann den vorherigen. So wurde ein grüner Deploy gemeldet, während die
Migration gar nicht angewendet war – aufgefallen ist es erst, weil die neue
Tabelle in der Produktion fehlte.
→ Regel: `gh run list --json databaseId,headSha` und die Zeile nehmen, deren
`headSha` zu `git rev-parse HEAD` passt. (Für Logs `gh api
repos/ermerp/trophytracker/actions/jobs/<job-id>/logs` – `gh run view --log`
liefert in Version 2.46 stillschweigend nichts.)

**22.09.2026 – auch ein GET kann schreiben.** `GET /api/scan/:ean/online`
vermerkte den gefundenen Titel am offenen Scan und veränderte so beim **Prüfen**
echte Daten.
→ Regel: Vor dem Prüfen in den Code sehen und mit Wegwerf-Daten arbeiten, nie
mit echten.

---

## Migrationen, Export, Sicherung

**Stufe 19b – ein Test fand es, bevor es irgendwo hinkam.** Der Vollexport
sortierte jede Tabelle mit `ORDER BY rowid`, und eine `WITHOUT ROWID`-Tabelle hat
keine: Der ganze Export antwortete mit `500`. Gefunden beim Bauen, nicht in der
Produktion.
→ Regel: Eine neue Tabelle gehört zugleich in `EXPORT_TABELLEN` oder
`NICHT_EXPORTIERT` **und** braucht einen Blick auf `EXPORT_ORDNUNG`.

**14.09.2026 – der Dump ließ sich nicht unverändert einspielen.**
`wrangler d1 execute --file=backup.sql` gegen eine frische Datenbank scheiterte:
`d1 export` schreibt in `sqlite_master`-Reihenfolge, und `release` stand an
Dump-Zeile 1515, während `INSERT INTO "physical_copy"` schon in Zeile 467 kam –
neun Tabellen verweisen auf `release`. Der Fehler steckte **seit Stufe 3** im
Backup und wäre ohne die Probe erst im Ernstfall aufgefallen. Probe: Dump
910 717 Byte, 1 762 `INSERT`-Anweisungen.
→ Regel: Die Wiederherstellung wird geprobt, nicht angenommen (`scripts/dump-ordnen.mjs`).

**23.09.2026 – 2,31 von 3,26 MB waren Rohantworten, die nie jemand löschte.**
`psn_raw_response` wuchs mit jedem Lauf und wanderte über `d1 export` in jede
wöchentliche Sicherung. Stufe 18d baute einen Aufräumschritt: die jüngsten drei
Läufe und alles Nichtnormalisierte bleiben.
→ Regel: Roh abgelegt wird nur, wo alle drei Merkmale zusammentreffen – teurer
Abruf, komplexe Normalisierung, **einzige** Aufzeichnung.

**01.10.2026 – eine neue Tabelle fehlte im Sicherungsabgleich.**
`scripts/sicherung-pruefen.sh` kannte `psn_zugang` nicht; eine abgeschnittene
neue Tabelle wäre nicht aufgefallen.

**Stufe 16 – `meta.changes` über den Batch.** `PlanRepository.erledigen` gab die
Summe über den ganzen Batch zurück, und damit zählten die Protokollzeilen mit.
→ Regel: Rückgabewerte aus `meta.changes` kommen nur von der eigentlichen
Änderung.

**Views und ihre Basistabellen.** Gemessen gegen SQLite 3.46.1:
`RENAME COLUMN` schreibt die View-Definition selbst um, aber ein
Tabellen-Neuaufbau (`DROP TABLE` + `RENAME TO`) und `DROP COLUMN` scheitern laut
mit `error in view …`. Der Neuaufbau ist SQLites Standardweg für jede
Constraint- oder Typänderung – ohne vorheriges Droppen der Views in **derselben**
Migration ist er nicht ausführbar, und in der Pipeline wäre das ein roter Deploy
mit halb angewendeter Migration. Und: Bei `SELECT *` wächst die Ergebnismenge
einer View nach einem `ADD COLUMN` lautlos mit, während die Definition in
`sqlite_master` unverändert bleibt – der eine Fall, in dem SQLite still
danebengreift.

---

## Das Dokument hat sich dreimal selbst korrigiert

Jedes Mal war eine Zahl in der Spezifikation falsch, und jedes Mal war der Grund
derselbe: Sie war gerechnet und nicht gemessen, oder sie zählte nur einen Teil.

**28.09.2026 – „die Nacht rund 54 000 Zeilen".** Das war die Summe der
**Leerlauf**-Aufrufe; die arbeitenden waren nie gemessen. Es waren gut **200 000**,
mit einer Spitze von 1 335 628.

**24.09.2026 – „siebzehn Aufrufe je Nacht".** Die Bilanz in 10.1 zählte Spielzeit
und Besitz mit je einem Aufruf, während 7.7 für dieselben Schritte zwei und
fünfzehn nennt. Es sind **einunddreißig** – und zusammen mit einer
Kaufliste-Nacht und den gemeinsam fälligen IGDB-Stempeln (368 der 477 Spiele
trugen den 22.09.2026) wären es **37 von 36** Aufrufen. Das war der Anlass, das
Cron-Fenster zu teilen.

**02.10.2026 – „`psn_product_id`, bei 0 von 490 gefüllt".** Die Vorbedingung in
7.4 las sich wie eine Sperre für Stufe 21. Gemessen war sie keine: IGDB nennt
eine Concept-Id, die Concept-Seite trennt daraus die Plattformen, und das
Ergebnis füllt die Spalte selbst.

→ Regel: Was berichtet wird, kommt aus der Sache selbst, nicht aus einem Ersatz.

---

## Entwürfe, die das Messen gekippt hat

**Stufe 20 – drei Entwürfe in einer Messung.** 980 Abfragen über alle 490
Releases haben gekippt: (1) Die Plattform kommt aus eBays strukturiertem Aspekt
statt aus dem Titel – Händler nennen sie dort gar nicht, der erste Messlauf fand
**0 von 90** Händlerangeboten. (2) Die Schwelle für fremde Worte skaliert mit der
Titellänge statt flach zu sein – eine flache Grenze von drei Zusatzworten ließ
zwei Fehlgriffe desselben Musters stehen. (3) **Wikidata ist als Quelle für „nur
digital" verworfen** – 20 % Fehlrate (48 von 235) gegen die belegten Discs.

**29.09.2026 – Sony sagt 60 Tage, gehalten hat der Zugang 25.** `expires_in`
nennt 5 182 926 Sekunden (~60 Tage); der Zugang vom 04.09.2026 hielt 25 Tage.
Deshalb wird nach **Alter** gewarnt, ab 18 Tagen, nicht nach Sonys Zahl – und
deshalb zeichnet `psn_zugang` auf, statt zu schätzen.

**Der Kopierschritt lässt sich nicht abschaffen, nur kürzen** (gemessen am
29.09.2026). Sony spiegelt die fremde Origin und erlaubt Anmeldedaten, CORS steht
also offen; trotzdem kam `403`, während dieselbe Adresse im selben Browser direkt
den Wert lieferte. Der Browser hängt das Cookie bei fremder Herkunft nicht an
(`SameSite`), und ein neues Tab ist wegen der Same-Origin-Policy ebenso zu.

**Der erste Entwurf der finalen Reihenfolge war falsch.** Er stellte die
Oberflächenprüfung **vor** die Finalisierung der Sammlung. Der Nutzer hat
eingewandt, dass sich die Arbeitsansichten danach nicht mehr prüfen lassen, weil
ihnen das Material fehlt.

---

## Warum es für „nur digital" keine Quelle gibt

Nicht aus Mangel an Recherche, sondern weil es die Tatsache nicht gibt (gemessen
am 02.10.2026): Wikidatas Vertriebsformat liegt bei **20 %** der belegten Discs
falsch, IGDBs `external_games.media` ist zu 90 % leer (1 447 ohne Wert, 128
physisch, 34 digital, nur 12 Spiele betroffen), MobyGames kostet 9,99 $/Monat.
Vor allem aber ist „nur digital" **keine stabile Tatsache**: Limited Run hat über
160 digitale Titel nachträglich auf Disc gebracht, 20 bis 30 je Zyklus, darunter
drei aus dieser Sammlung.

Was sich bauen lässt, ist eine **begründete Abwesenheit**: Findet eBay in der
Plattform-Kategorie gar kein Angebot, trifft das bei bekannten Discs nur zu 3 %
zu (8 von 235). Das steht als Hinweis in der Lückenansicht, nicht als Wert in der
Spalte.

---

## Warum es keine offenen Scans mehr gibt

Stufe 17 legte einen unbekannten Barcode als **offenen Scan** ab, Stufe 17b holte
dazu nachts einen Titel bei upcitemdb, Ansicht `/scans` arbeitete sie ab.
Gemessen an 56 Codes des PS3-Regals kannte die Quelle 35, davon führten 22 zu
genau einem Spiel. Der Nutzer hat das am 21.09.2026 abgeschafft, und seine
Begründung ist die Lehre:

> *Es ist mir unmöglich, jetzt noch herauszufinden, welche Spiele es waren.*

Ein Code ohne seine Hülle lässt sich später nicht mehr zuordnen – genau die
Erfahrung, die zur Live-Auflösung geführt hat. Seit der Scanner Titel sofort
liefert (eBay, sonst upcitemdb) und „Spiel anlegen" im selben Fenster steht, gibt
es nichts mehr zu vertagen: Wer gerade nicht zuordnen kann, überspringt und
scannt die Disc später erneut.
