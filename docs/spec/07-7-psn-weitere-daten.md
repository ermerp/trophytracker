← [Inhaltsverzeichnis](README.md)

## 7.7 PSN jenseits der Trophäen (gemessen am 21.09.2026, Stufen 18c und 19b)

Die Anbindung nutzt bis Stufe 18 nur einen einzigen Endpunkt: die Trophäenliste. Das Konto gibt mehr her. **Vor dem Bauen gemessen** (Skript im Scratchpad gegen das echte Konto, ins Repository kamen nur Zahlen), damit der Zuschnitt auf Fakten steht und nicht auf Vermutungen.

### Was es gibt

| Endpunkt | Inhalt | Bewertung |
|---|---|---|
| `GET /api/trophy/v1/users/me/trophyTitles` | Trophäenlisten mit Fortschritt | **genutzt seit Stufe 2** – `trophy_progress` |
| `GET /api/gamelist/v2/users/me/titles` | gespielte Titel mit `playDuration`, `playCount`, `firstPlayedDateTime`, `lastPlayedDateTime`, `category`, `concept` | **Stufe 18c** |
| `getPurchasedGameList` (GraphQL, `web.np.playstation.com`) | gekaufte und über PS+ verfügbare Titel mit `platform`, `titleId`, `productId`, `conceptId`, `entitlementId`, `isActive`, `subscriptionService` | **Stufe 18c** |
| `GET /api/trophy/v1/npCommunicationIds/{id}/trophyGroups/all/trophies` | Definition jeder Trophäe: Name, Beschreibung, Symbol, Art, versteckt, DLC-Gruppe | **Stufe 19b** – `npServiceName` ist Pflicht, sonst 404 (gemessen 01.10.2026) |
| `GET /api/trophy/v1/users/me/npCommunicationIds/{id}/trophyGroups/all/trophies` | je Trophäe `earned`, Zeitpunkt, Seltenheit weltweit (`trophyEarnedRate`) | **Stufe 19b** |
| `GET /api/trophy/v1/npCommunicationIds/{id}/trophyGroups` | Hauptspiel und DLC-Gruppen mit Zählern | **Stufe 19b** |
| `GET /api/trophy/v1/users/me/trophySummary` | Trophäen-Level und Zähler je Stufe | **Stufe 19b** – die Zähler je Stufe baut 19a ohne PSN als Summe über `trophy_progress`; nur das **Level** braucht diesen Abruf |
| Profil, Freunde, Präsenz, Region, Geräte | Sozial- und Kontodaten | **nicht gebraucht** – eine Sammlungsverwaltung für eine Person braucht sie nicht, und jede weitere Abfrage ist eine weitere Bruchstelle |

### Was die Messung ergab

| | Einträge | eindeutig in der Sammlung | mehrdeutig | ohne Treffer |
|---|---|---|---|---|
| Gespielte Titel (Spielzeit) | 379 | **284** | 0 | 95 |
| Käufe und PS+-Titel | 730 | **247** | 0 | 483 |

Der Abgleich läuft über `titelSchluessel` gegen `game.sort_title` – dieselbe Normalisierung wie überall (7.2) – und braucht dort einen Index, sonst ist jede der 303 bzw. 730 Abfragen je Nacht ein Tabellenscan über alle Spiele (Migration 0025, Abschnitt 2). Die 95 gespielten Titel ohne Treffer sind überwiegend gar keine Spiele (Streaming-Apps) oder Titel, deren Eintrag in der Sammlung eine Jahreszahl zur Unterscheidung trägt („Red Dead Redemption (2010)"); die 483 Käufe ohne Treffer sind PS+-Katalogtitel, die nie gespielt wurden. **Beides bleibt bewusst liegen** – Entscheidung des Nutzers vom 21.09.2026: Der Abgleich ergänzt nur, was die Sammlung schon kennt, und importiert nichts.

`subscriptionService` beantwortet die Frage „gekauft oder über PS+" **im Datensatz selbst**: gemessen 117 `NONE` (gekauft) gegenüber 613 `PS_PLUS`. Damit ist keine Heuristik nötig; das Feld entspricht `digital_entitlement.quelle` (`kauf` / `plus`).

### Drei harte Grenzen

- **Spielzeit gibt es nur für PS4 und PS5.** Alle Kategorien der Antwort sind `ps4_*` oder `ps5_*`; Sony erfasst Spielzeit erst seit der PS4. Rund 137 der 431 Trophäenlisten des Nutzers sind PS3 oder Vita – für sie bleibt das Feld **dauerhaft leer**. Nach Abschnitt 3 ist das ein „unbekannt", niemals eine 0, und es darf keine Sortierung entstehen, die Unbekanntes als „wenig gespielt" einreiht.
- **Digitale PS3-Käufe fehlen.** Die Kaufliste lieferte 554 PS4- und 176 PS5-Einträge, keinen einzigen PS3-Eintrag – obwohl die Abfrage `ps3` mitverlangt. Ein fehlender Eintrag heißt deshalb **nie** „nicht besessen"; der Abgleich darf ausschließlich hinzufügen und niemals etwas entfernen, das der Nutzer selbst erfasst hat.
- **Alles davon ist inoffiziell**, die GraphQL-Kaufliste noch stärker als die Trophäen-API. Jeder neue Abruf ist eine weitere Stelle, die brechen kann; es gilt dieselbe Regel wie für den Sync (Abschnitt 17): Ein Fehler lässt vorhandene Daten stehen und macht die Anwendung nie unbenutzbar.

### Umfang und warum das die Grenzen nicht sprengt

Die Sammlung umfasst 18 355 definierte Trophäen in 431 Listen (11 168 erspielt, gemessen am 01.10.2026). Eine Stichprobe (PS3-Titel, 66 Trophäen) ergab 22,3 kB für die Definitionen, 9,1 kB für den eigenen Stand, 1,4 kB für die Gruppen. **Alle 431 Listen hängen an einem Release** – es gibt keine Liste, zu der die Anzeige keinen Ort hätte.

Das ist für D1 unkritisch **beim Speichern** – die Datenbank liegt bei **1,79 MB** von 5 GB (gemessen am 01.10.2026; hier standen bis dahin 2,6 MB, der Aufräumschritt aus 18d hat die Rohablage abgetragen). Kritisch wäre nur das Lesen, und das bleibt es nicht: Mit einem Index auf der Trophäenliste sind die Trophäen *eines* Spiels rund 43 gelesene Zeilen, nicht 18 000 (Abschnitt 2).

**Die engere Grenze ist nicht das Lesen, sondern das Schreiben:** D1 erlaubt **100 000
geschriebene Zeilen am Tag** (15.4), und Index-Schreibungen zählen mit. 18 355 Trophäen in einer
Tabelle mit einem Index sind rund **37 000 Schreibungen** – an einem Tag, an dem sonst 799 anfallen
(gemessen am 01.10.2026). Eine Erstbefüllung am Stück verbraucht gut ein Drittel des Tagesbudgets,
ein zweiter Durchlauf am selben Tag zwei Drittel, ein dritter nähme der Anwendung das Schreiben. Die
Lesegrenze war beim

Beim Holen gilt derselbe Entwurf wie beim Sync (Entscheidung des Nutzers vom 21.09.2026, in drei
Punkten entschieden am 01.10.2026):

1. **Einmal füllen, gestaffelt – nachts und auf Knopfdruck.** Je Liste zwei Abrufe (Definitionen,
   eigener Stand) und bei den 18 % mit DLC ein dritter für die Gruppennamen – gemessen am
   01.10.2026 rund **940 Anfragen** für den Bestand. Eine Liste je Cron-Aufruf, Fortschritt
   in der Datenbank. Dazu ein **Portionsknopf** in den Einstellungen, der dieselbe Arbeit im
   Vordergrund in Portionen durchläuft, mit Pause zwischen den Portionen und Abbruch bei `429`
   (Entscheidung des Nutzers vom 01.10.2026). **Höchstens ein Durchlauf je Tag** – wegen der
   Schreibgrenze, nicht wegen PSN.

   **Seit der Messung vom 01.10.2026 ist der Knopf der Hauptweg, nicht die Abkürzung** (Frage des
   Nutzers): Die ganze Erstbefüllung dauert rund vier Minuten, nicht drei Wochen. Ein einziger
   Aufruf schafft sie trotzdem nicht – 50 Fremdanfragen je Aufruf sind die Grenze, 940 brauchen
   mindestens 19 –, also treibt die Oberfläche die Portionen, und für den Nutzer sieht es aus wie
   ein Knopfdruck. Der nächtliche Schritt bleibt, aber als **Netz und Nachführung**, nicht als
   geplante Dauer: Er fragt „nächste Liste ohne Trophäen" – dieselbe Abfrageform wie „nächste
   geänderte Liste", die er für den Dauerbetrieb ohnehin braucht. Die Rechnung „rund 19 Nächte"
   ist damit keine Erwartung mehr, sondern nur noch die Antwort auf „was, wenn der Knopf nie
   gedrückt wird".
2. **Danach nur bei Änderung.** Welche Liste sich verändert hat, stellt der Sync seit Stufe 13 ohnehin fest (`neue_trophaeen`, `dlc_erweitert`). Nur diese Titel werden nachgeholt; im Dauerbetrieb sind das wenige Abrufe je Woche.
3. **Keine Rohablage** (Entscheidung des Nutzers vom 01.10.2026) – die Antworten werden direkt
   normalisiert. Begründung und Maßstab stehen jetzt bei der Regel selbst statt als Ausnahme
   dahinter: Rohablage gibt es für den Trophäen-**Sync**, weil dort teurer Abruf, komplexe
   Normalisierung und einzige Aufzeichnung zusammentreffen. Hier trifft keines davon zu – je
   Liste ein eigener, jederzeit wiederholbarer Abruf, Normalisierung ist Feldkopieren –, und die
   grob **9 MB** Rohtext (hochgerechnet aus der Stichprobe) wären das Fünffache der ganzen
   Datenbank und gingen über `d1 export` in jede wöchentliche Sicherung (14.2). Genau dafür
   musste 18d einen Aufräumschritt bauen.

**Die freie Kapazität ist gemessen, nicht gerechnet.** Im PSN-Fenster bleiben nach Sync und
Spielzeit **23 der 36 Aufrufe** frei – `cron_verlauf` zeigt für die Nächte zum 30.09.2026 und zum
01.10.2026 beide Male `nichts ×23` nach dreizehn Aufrufen Arbeit. An einer Kaufliste-Nacht sind es
8, also gut 146 je Woche. Bei einer Liste je Aufruf bräuchte die Erstbefüllung damit **rund drei
Wochen**; der Portionsknopf ist der Weg, sie nicht abwarten zu müssen.

**Gruppen und Trophäen-Level gehören in dieselbe Stufe** (Entscheidung des Nutzers vom
01.10.2026). Die Gruppe ist die Voraussetzung dafür, dass „was fehlt mir noch zu Platin" bei
Spielen mit DLC stimmt: Platin hängt am Hauptspiel, DLC-Trophäen zählen nicht dazu. Die
**Zugehörigkeit** jeder Trophäe kommt dabei ohne eigenen Abruf mit – sie steht als
`trophyGroupId` schon in den Definitionen. Der dritte Endpunkt (`trophyGroups`) liefert nur die
**Namen** der Gruppen und ihre Zähler und wird deshalb nur für die Listen geholt, deren
Definitionen mehr als eine Gruppe nannten. Das Trophäen-Level aus `trophySummary` ist ein
einzelner Abruf je Lauf und schließt die Lücke, die 19a ausdrücklich offen gelassen hat (13);
dasselbe gilt für das echte „letztes Platin", das erst mit dem Zeitpunkt je Trophäe entsteht.

### Was daraus folgt

- Die Spielzeit gehört als Feld an das Release beziehungsweise die Trophäenliste, nicht an das Spiel: Sie kommt je Titel-Id von Sony. Anzeige im Spieldetail und als Sortierkriterium der Listen (5.2); Titel ohne Spielzeit stehen dabei am Ende (entschieden und gebaut in Stufe 18c).
- Der digitale Besitz aus PSN ist **Fremddatum** und braucht eine Herkunftsspalte an `digital_entitlement`, wie `physical_source` bei der Disc-Fassung (Abschnitt 3): Was der Nutzer selbst erfasst hat, darf ein automatischer Lauf nie überschreiben.

### Gekauft oder PS+ – wie damit umzugehen ist (Entscheidungen des Nutzers vom 22.09.2026)

**Nur zwei Zustände, und `kauf` schlägt `plus`.** Liefert PSN einen Titel sowohl als Kauf (`NONE`) als auch über das Abo (`PS_PLUS`), gilt `kauf`: Gekauftes bleibt, da ist das Abo gleichgültig. Ob ein PS+-Titel **dauerhaft** eingesammelt wurde (Monatsspiel) oder nur **zeitweise** im Katalog liegt, wird bewusst **nicht** unterschieden – für die Frage „kann ich das gerade spielen, ohne es zu kaufen" ist der Unterschied ohne Belang, und PSN benennt ihn im Datensatz ohnehin nicht.

**PS+ ist eine Momentaufnahme, kein Besitz.** Der Katalog wechselt monatlich; ein Titel, der heute `plus` ist, kann nächsten Monat fehlen. Deshalb gilt für die PSN-erkannten Einträge:

| Art | Verhalten |
|---|---|
| `kauf` (PSN erkannt) | einmal erkannt, **bleibt** – ein Kauf verfällt nicht |
| `plus` (PSN erkannt) | **wird bei jedem vollständigen Lauf als Ganzes ersetzt** – was PSN nicht mehr nennt, verschwindet |
| beliebig (vom Nutzer erfasst) | **nie angefasst**, weder ergänzt noch entfernt (Herkunftsspalte) |

Das Ersetzen greift **nur nach einem vollständigen Lauf**: Alle Seiten geholt, Gesamtzahl plausibel. Bricht der Abruf ab oder antwortet PSN unvollständig, bleibt der alte Stand stehen – lieber ein veralteter Eintrag als ein fälschlich gelöschter. Ein Teil-Ergebnis darf nie zu einem Löschen führen.

**Rohdaten werden hier nicht abgelegt** (Entscheidung des Nutzers vom 22.09.2026), mit derselben Begründung wie bei IGDB: Beide Abrufe sind klein (zusammen rund 17 Anfragen), jederzeit neu abrufbar, und der Cron holt sie ohnehin regelmäßig. Die Normalisierung ist ein Feldkopieren plus Titelabgleich; wird sie später verbessert, genügt der nächste Lauf. **Das war hier bis zum 01.10.2026 als „die eine Ausnahme von der Regel aus 7.1“ ausgewiesen – falsch beschrieben, nicht falsch entschieden:** Mit derselben Begründung liegen seit 19b auch die Einzeltrophäen ohne Rohablage, und damit ist es kein Ausnahmenpaar mehr, sondern ein Maßstab mit drei Merkmalen (teurer Abruf, komplexe Normalisierung, einzige Aufzeichnung). Er trifft auf genau einen Abruf zu: die Trophäenseiten des Syncs.

**Ein erkannter Kauf erledigt einen Wunsch nur bei „nur digital"** (Entscheidung des Nutzers vom 22.09.2026). Wer von Hand Besitz erfasst, weiß, was er getan hat – dort schließt der Eintrag Kauf und Wunsch ohne Rückfrage (Abschnitt 5). Meldet dagegen PSN einen digitalen Kauf, könnte der Wunsch der **Disc** gelten. Deshalb greift das Erledigen ausschließlich, wenn `release.physical_release_status = 'nein'` ist; bei `ja` oder `unbekannt` bleibt der Eintrag offen. Beim Bau am 22.09.2026 traf das auf **kein einziges** Release zu – die Regel wird erst mit einem von Hand gesetzten `nein` wirksam – automatische Quellen setzen nie `nein` (Abschnitt 3) –, und genau deshalb steht sie schon jetzt fest.

**Rhythmus:** Die ganze Kaufliste sind rund 15 Abfragen (730 Einträge à 50). Das ist so wenig, dass es keinen eigenen Zeitplan braucht – ein Durchlauf je Woche im Cron genügt und kostet den Bruchteil einer Nacht. Ein monatlicher Sonderweg wäre mehr Verwaltung als Gewinn und würde den Katalogwechsel trotzdem nur zufällig treffen.
**Der Ausfall in der Produktion und was ihn verdeckte (27.09.2026, Stufe 18e).** Von diesem Weg
stand in der Produktion **nichts**: `digital_entitlement` hielt 8 Zeilen, alle `herkunft='nutzer'`.
Gemessen am 27.09.2026 gegen das echte Konto, rein lesend: Die Kaufliste **antwortet einwandfrei** –
Status 200, 730 Einträge, 50 je Seite, `subscriptionService` mit `PS_PLUS`/`NONE`. Auch Zugang und
Titelabgleich sind in Ordnung. **Was den Fehler vier Tage verdeckte, ist belegt: Erfolg und Fehler
schrieben dieselbe Marke** – `{"fertigAm":"2026-09-23"}` entstand nach einem vollständigen Durchlauf
wie nach einer gescheiterten Seite, und weil eine erfolgreiche erste Seite `{start:50,…}`
hinterlassen hätte, kann die Marke nur heißen: Der erste Durchlauf überhaupt scheiterte auf seiner
**ersten** Seite und legte den Schritt für sieben Tage still. Stufe 18e behebt das mit `{fehlerAm}`
statt `{fertigAm}`, dem Statuscode in der Meldung und `POST /api/sync/besitz` für den Handlauf.
**Warum die Nacht zum 23.09.2026 scheiterte, bleibt unerklärt** – die Egress-Vermutung ist widerlegt
(derselbe Worker erreicht denselben Endpunkt), und der Verlauf war längst überschrieben. Die Stufe
hat nicht die Ursache behoben, sondern die Blindheit ([lehren.md](../lehren.md)).

**Gemessen auf Release-Ebene am 22.09.2026, beim Bau – das ist die Erwartung, nicht das Ergebnis:** Von den 379 gelieferten Einträgen sind 303 Spiele – die übrigen 76 sind Streaming-Apps und Unbestimmtes und fallen heraus, bevor etwas gespeichert wird. **236 davon bekommen ein Release**, 67 bleiben ohne Zuordnung liegen (die Plattform muss mitpassen, deshalb weniger als die 284 des Titelabgleichs). Die Kaufliste ergibt **56 Kauf- und 160 PS+-Einträge**; 514 Einträge betreffen Spiele, die die Sammlung nicht kennt.

**Der Handlauf am 27.09.2026 ist durchgelaufen** und hat die Frage zur Hälfte beantwortet: **54 `kauf`- und 156 `plus`-Einträge** (erwartet waren 56 und 160; die Differenz ist der Katalogwechsel) mit `herkunft='psn'`, 210 Zeilen `berechtigung_angelegt` mit Quelle `sync`, Stand `{"fertigAm":"2026-09-27"}`. Kein `plan_entry` wurde dabei erledigt, wie vorhergesagt: Kein Release steht auf `physical_release_status = 'nein'`.

- Jeder dieser Schreiber protokolliert mit Quelle `sync` (8.5).
