← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md)

## 16. Betriebswarnungen und Nachtläufe

Ausgelagert aus [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md), weil die Datei sonst über 15 KB läge.

#### Stufe 18m: Betriebswarnungen in der App (gebaut am 18.10.2026)

Anforderung des Nutzers vom 17.10.2026: im Alltag mitbekommen, wenn die Automatik Probleme hat; vor
20g. Entscheidungen vom 18.10.2026. **Keine Migration, kein Eingriff in den Cron.** **Die Fakten
schreibt der Cron, das Urteil entsteht beim Lesen:** `GET /api/betrieb/warnungen` liest `cron_stand`
([10-1-cron-verlauf.md](10-1-cron-verlauf.md)), die zwei jüngsten Nacht-Syncs, Status und
Ablaufzeiten des Zugangs (nie das Geheimnis), die kürzeste gemessene Lebensdauer aus `psn_zugang`,
den Sicherungsstand und `fehlerAm` der Kaufliste in **einem** Batch aus Bausteinen
(`src/db/betrieb.ts`); `urteile` in `src/domain/betrieb.ts` fällt das Urteil, rein und ohne Uhr.
Gespeichert wird nichts: Eine Warnung verschwindet, sobald ihre Fakten sie nicht mehr tragen, und ein
ganz ausgefallener Cron fällt gerade deshalb auf. Die drei Warnungen, die bis 18m das Frontend aus
drei Antworten zusammensetzte, kommen von hier. **Kosten, gemessen als Route im Stand nach einer
Nacht** (`test/lesekosten.spec.ts`): ein D1-Aufruf, **11** gelesene Zeilen je Öffnen des Dashboards (10 bis 18n; die eine dazu ist der älteste Auffrischstempel).
Die CPU der Route wird nach dem Deploy an `workersInvocationsAdaptive` gemessen.

| Regel | Stufe |
|---|---|
| Ein Bereich – PSN oder Wartung – seit über **26 h** ohne vermerkten Ausgang, die Store-Action (20j) und die Markt-Action (seit 20i-c) seit über **30 h** (Normalabstand 24 h plus größte beobachtete Verspätung 5 h 30, Entscheidungen vom 22. und 23.10.2026 – ihr Rückfall liegt nur zwei Stunden nach dem Hauptlauf, 26 reichten nicht); fehlt der Stand ganz, eine Warnung | rot |
| Zugang abgelaufen – **sofort**, unabhängig von der Zahl der Nächte; ein Sync, der daran scheitert, wird nicht zusätzlich gemeldet | rot |
| Zugang endet in ≤ **3** / ≤ **14** Kalendertagen (Ortszeit) – das frühere von Sonys Ankündigung und „eingetragen + kürzeste gemessene Lebensdauer" (7.1) | rot / zur Kenntnis |
| Nacht-Sync gescheitert, jünger als 24 h: **zwei aufeinanderfolgende UTC-Nächte** / eine | rot / zur Kenntnis |
| Sicherung älter als acht Tage oder keine (14.2) | rot |
| Kette ohne Ausgang, gemeldet in den letzten 24 h – und ein Lauf der Markt- oder Store-Action, der seit über einer Stunde begonnen ist und keinen Ausgang hat (20i, 20j) | zur Kenntnis |
| Letzter Ausgang eines Bereichs mit Meldung, jünger als 24 h (außer dem schon gemeldeten Sync) | zur Kenntnis |
| Kaufliste mit `fehlerAm` von heute oder gestern | zur Kenntnis |
| Markt-Action: jüngster Ausgang ohne Meldung mit `geprueft = 0` **und** seit über **30 h** kein Lauf mit `geprueft > 0` (`markt_geprueft`, 20i-b; 26 h bis 20i-c) – ein einzelner leerer Lauf ist der normale Rückfall um 22:17; nach einem Tag müsste bei zwölf Stunden Frist alles fällig sein. Ein Ausgang ohne `geprueft` (vor 20i-b) schweigt | zur Kenntnis |
| Store-Action (`store_leer`, 20j): dasselbe mit **30 h**; `store_geprueft` setzt **auch ein leerer Lauf ohne Meldung, nach dem nichts fällig ist** – das liest die Ausgangs-Route selbst. Sonst meldete die Warnung nach einem Probelauf am Nachmittag sicher: Er stempelt alles, beide Abendläufe finden nichts, der nächste prüfende kommt nach gut 33 h. **Sicherheitsnetz** (Rückfrage des Nutzers vom 22.10.2026): „nichts fällig" kommt aus derselben Auswahl wie die Lage – liefert sie durch einen Fehler immer 0, gälte jeder leere Lauf als auf dem Stand. Deshalb meldet `store_leer` auch, wenn der **älteste Prüfstempel** der Ziele älter als **42 h** ist (12 h Frist + 30 h: seit über 30 h fällig und nicht geprüft) – aus einer eigenen Abfrage ohne gemeinsamen Text mit der Auswahl (`AELTESTER_STEMPEL`: offene Absichten ohne gekaufte Berechtigung, ohne Stempel ab dem Anlegen der Absicht; die `nein`-Releases ohne Absicht deckt sie nicht ab). 30 h auf den Stempel selbst hätten nach dem Probelauf angeschlagen (33,5 h). Defektprobe am 22.10.2026: Auswahl auf 0 gesetzt – die Warnung kommt; ohne das Netz bleibt sie aus | zur Kenntnis |
| IGDB-Auffrischen hängt hinterher (`auffrischen_stau`, 18n): der älteste Auffrischstempel der verknüpften Spiele ist älter als **11 Tage** (Entscheidung des Nutzers vom 24.10.2026). Im Normalbetrieb ist er 7–8 Tage alt; ein voller Stau ist mit der Grenze ([10.1](10-1-cron-schritte.md) Schritt 12) knapp unter 10 Tagen abgebaut, mit einer ausgefallenen Nacht knapp unter 11 – erst zwei Ausfälle oder eine kaputte Grenze reichen darüber (ein Test hält die Summe für jede Bestandsgröße bis 3 000). Eigene Abfrage über den Teilindex aus Migration 0036 (`AELTESTER_AUFFRISCH_STEMPEL`), nicht die Auswahl des Schritts; Defektprobe am 24.10.2026: ohne den Index liest die Route 440 statt 11 Zeilen | zur Kenntnis |
| Schritt nach Fensterschluss nicht fertig (`offen > 0`), bei Markt- und Store-Action nach ihrem Ausgang | zur Kenntnis, **scharf seit 20i** – bis dahin ruhte die Regel, weil die Wartung jede Nacht mit Rest schloss (`offen=18` am 18.10.) |

**Das Zugangsende ist nicht Sonys Datum** (Entscheidung des Nutzers vom 18.10.2026, nachdem der Plan
7.1 übersehen hatte): Sony kündigte rund 60 Tage an, der erste Zugang hielt 25. Für den Zugang vom
29.09.2026 heißt das „hält vermutlich bis um den 24.10.", Sony nennt den 28.11. Die Einstellungen
lesen dieselbe Rechnung. Zeiten und Daten im Satz stehen in Ortszeit (Europe/Berlin). **Kurze Fehler,
die sich im nächsten Aufruf selbst beheben, zeigt 18m nicht:** `cron_stand` hält je Bereich nur den
letzten Ausgang (Nachtrag 18m-b, unten) – mit den Ausnahmen `markt_geprueft` aus 20i-b und `store_geprueft` aus 20j.

**Bekannte Lücke im Sicherheitsnetz der Store-Action** (vermerkt am 22.10.2026): Der älteste
Prüfstempel kommt aus den offenen Absichten. Releases mit `physical_release_status = 'nein'` **ohne**
offene Absicht gehören zum Zuschnitt (7.4), werden vom Netz aber nicht gesehen – bleiben nur sie
ungeprüft und sagt die Auswahl fälschlich „nichts fällig", kommt keine Warnung. Heute steht bei
keinem Release ein `nein` (7.4); die Lücke wächst, sobald Block B der Lückenansicht abgearbeitet ist.

**Darstellung, am Prototyp entschieden:** Rot steht als Block auf der Seite – er ersetzt den gelben
Block – und oben in der Tafel; „zur Kenntnis" still, ohne eigenen Farbton, nur hinter der Glocke; die
Glocke zählt die höchste Stufe, seit dem 20.10.2026 in der Rangfolge Rot vor Gelb (Posten) vor Grau (Kenntnis). Einzelheiten in 13.2; der Preisalarm aus 20g bekommt eine eigene
Gruppe, **nicht in Gold** ([20g](16-2-offene-stufen.md)).

#### Nach 18m vorgemerkt: Nachtrag 18m-b, Fehler je Nacht

Vorgabe des Nutzers vom 18.10.2026, als eigener Nachtrag statt in 18k, damit 18k allein die
Spielzeit misst. Der Ausgangs-Batch zählt je Bereich unter `cron_stand` die **Fehler in dieser
Nacht** mit; eine spätere Regel kann dann Häufungen zeigen. Zurückgesetzt wird beim ersten Aufruf
eines neuen UTC-Tags, im selben `json_set` und ohne den Stand vorher zu lesen – kein zusätzlicher
D1-Aufruf. Ein Abbruch durch die Laufzeit erreicht den Zähler nicht; den zeigt weiter die Kette
ohne Ausgang.

#### Offen nach 20i: Nachtläufe bis 05:00 UTC

Vorgabe des Nutzers vom 17.10.2026: Die Nachtläufe sollen spätestens um **05:00 UTC** fertig sein,
damit sie in Sommer- wie Winterzeit vor 7 Uhr abgeschlossen sind (7 Uhr Sommerzeit ist 05:00 UTC).
**Eigener Nachtrag nach 20i**, damit die Messungen von 18j bis 20i nicht mit einem Zeitwechsel
zusammenfallen. Zwei Prüffragen:

1. **Welche Schritte hängen am UTC-Datum („heute")?** Bekannt: `syncFaellig` (ein Versuch je Nacht),
   der Spielzeit-Stand, Level- und Jahre-Stand, die Tagesfristen. Ginge ein Fenster über Mitternacht
   UTC, oder bleibt nur 00:00–05:00 UTC? Über Mitternacht verteilte sich die PSN-Kette auf zwei
   „heute".
2. **Reicht die Kapazität – 60 statt 72 Aufrufe, Kaufliste-Nächte eingerechnet –, sobald 18j bis 20i
   gebaut sind?** Heute braucht eine Kaufliste-Nacht 64 bis 73. Kleinere Portionen (18l: ein Release
   je Aufruf) heißen mehr Aufrufe, nicht weniger; die Frage hängt mit „Cron je Minute" zusammen.
   **Gemessen am 18.10.2026:** Eine Kaufliste-Nacht belegt das PSN-Fenster **voll** (36 von 36, der
   Store fertig im letzten Aufruf), und der Lage-Batch liest je Wartungsaufruf rund 2 590 Zeilen –
   mit Cron je Minute rund 466 000 je Nacht (oben).
