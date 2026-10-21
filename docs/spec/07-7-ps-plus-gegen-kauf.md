← [Inhaltsverzeichnis](README.md)

## 7.7 PSN jenseits der Trophäen – gekauft oder PS+

Fortsetzung von [7.7](07-7-psn-weitere-daten.md) (Messung, Umfang, Grenzen).

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
