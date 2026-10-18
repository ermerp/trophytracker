← [Inhaltsverzeichnis](README.md)

## 16. Umsetzungsreihenfolge – CPU-Grenze und Betrieb

Teil von Abschnitt 16.2 (die übrigen offenen Teile: [16-2-offene-stufen.md](16-2-offene-stufen.md)),
aufgeteilt am 17.10.2026, weil die Datei die Grenze von rund 15 KB überschritt.

#### Offen: die CPU-Grenze

Seit dem 10.10.2026 bricht die Laufzeit Cron-Aufrufe an der 10-ms-Grenze ab; kein Schritt bleibt
darunter, auch der Leerlauf nicht. **Gemessen ist seit Stufe 18h, wohin die CPU geht: in die
D1-Aufrufe** (rund 0,7 ms je Abfrage des echten Codes, ein Batch kostet je Anweisung ein
Zwanzigstel), nicht ins Rechnen ([10.1](10-1-cron.md), „Was ein Aufruf wirklich an CPU kostet").
Der Bezahlplan ist ausgeschlossen (Entscheidung des Nutzers vom 16.10.2026).

**Und wo der Aufruf läuft:** Die Nacht zum 17.10.2026 zeigte, dass das CPU-Niveau mit dem Standort
des Crons wandert – vom 10. bis 16.10. lief jeder Aufruf in Singapur, davor in Newark, am 17.10.
verstreut über die USA ([10.1](10-1-cron.md)). **Nächte werden deshalb nur je Standort verglichen.**
Ob sich der Standort festlegen lässt, wird erst **nach 18j bis 18l** recherchiert (Entscheidung des
Nutzers vom 17.10.2026).

**Was daraus je Schritt folgt** – gerechnet mit den gemessenen Einzelkosten:

- **Leerlauf – gebaut in 18j:** zwei D1-Aufrufe statt zehn (Wartung) bzw. 16 (PSN, gemessen in 18h vor 18i), ein
  Lese- und ein Schreib-Batch ([10.1](10-1-cron.md), „Ein Lese- und ein Schreib-Batch"). Vorher 7–11 ms
  mit echter D1 in der Messung von 18h. **Gemessen in der Nacht zum 18.10.2026** (alle 72 Aufrufe
  `success`, keiner ohne Ausgang): Wartungs-Leerlauf 4,1–7,5 ms, Median 4,8 (n = 12; SJC 4,5 gegen
  10,9–12,9 am 17.10., EWR 4,1–5,5, DFW 4,4–7,5) – die Vermutung von 3–6 ms trifft im Median, drei
  von zwölf lagen darüber, alle unter 10. **Den PSN-Leerlauf gab es nicht:** In einer Kaufliste-Nacht
  belegt die Arbeit alle 36 Aufrufe (Sync 11, Spielzeit 2, Besitz 15, Level 1, Store 7, der Store
  fertig im letzten); Vergleichswerte vom 17.10.: EWR 11,5 ms, IAD ~16, ATL ~17, ORD ~13,5. Sync,
  Store und Markt blieben je Standort unverändert – 18j spart den Rahmen, nicht die Arbeit. **Die
  zwei D1-Aufrufe sind in der Produktion nicht zählbar** (die D1-Analytics zählen Anweisungen, als
  Stichprobe; D1 zählt nicht als `subrequests`): In den Leerlauf-Minuten kamen nur die zwölf
  Anweisungsarten der beiden Batches vor. Die Zahl selbst hält `test/cron-lage.spec.ts`.
- **Spielzeit** (217 Abfragen je Seite): der Abgleich je Titel als **ein Batch** statt 200
  einzelner Abfragen; dann rund 5 ms D1 plus 6 ms Rechnen für 200 Titel. Die Seitengröße ist im
  Code einstellbar (`GESPIELTE_JE_SEITE`); bei 100 Titeln läge eine Seite um 8 ms.
- **Sync** (5–6 Abfragen, ein Batch mit 104 Anweisungen): rund 4 ms D1, 3 ms Rechnen, dazu die
  echte Seite aus dem Netz – grenzwertig.
- **Store** (je Release ein Batch, die Seite als Strom): rund 1 ms D1 plus 3 ms Lesen je Release;
  **ein Release je Aufruf** trägt, zehn nicht. Am Stück zu lesen wäre billiger, aber dann wird die
  ganze Seite geholt (380 KB bis 1,4 MB, 7.4).
- **Gebrauchtpreise:** Die Grundlast eines Aufrufs (vier Abfragen, Sammlung laden und
  vorbereiten) liegt schon bei 5–8 ms, jedes Release kostet 3–4 ms mehr (94 ms für 20 mit echter D1). **Trägt auch mit einem
  Release je Aufruf nicht.** Die Sammlung auf Modulebene zu halten bringt nichts – **kein**
  Cron-Aufruf traf in der Messung eine warme Instanz (0 von 28 im Minutentakt). Denkbar bleibt,
  den vorbereiteten Wortindex **als eine Zeile** abzulegen (eine Abfrage statt 479 Titel zerlegen) –
  das wäre Berechnetes, das gespeichert wird, und damit eine Entscheidung des Nutzers wie bei
  „Trophäen je Jahr" (7.7). Sonst ist der Schritt der Kandidat für GitHub Actions.

**Cron je Minute** (`* * * * *` ist erlaubt): 180 statt 36 Aufrufe je Fenster, je Konto sind fünf
Einträge erlaubt, zwei sind belegt. Selbst wenn jeder Aufruf als Anfrage zählt, sind es rund 540
am Tag gegen 100 000. Eine Änderung am Cron braucht bis zu 15 Minuten, bis sie wirkt. Der
Leerlauf der Wartung läse dann fünfmal so viele Zeilen je Nacht: Der Lage-Batch liest in der
Produktion rund **2 590** Zeilen je Wartungsaufruf, **in jedem**, nicht nur im Leerlauf (gemessen am
18.10.2026, unten) – bei 180 Aufrufen rund **466 000** je Nacht statt 93 000. **Es hilft nur
Schritten, die je Aufruf unter 10 ms bleiben** – also erst nach den Änderungen oben.

**Zu entscheiden:** je Schritt, welcher Weg – Abfragen bündeln, kleinere Portion mit Cron je Minute,
Wortindex als Zeile, oder GitHub Actions. Für GitHub Actions ist vorab zu prüfen, ob PSN die
Adressen von GitHub abweist, wie es für die Kaufliste und Cloudflares Adressen vermutet wird (7.7).

**Die Reihenfolge der Nachträge** (Entscheidung des Nutzers vom 16.10.2026), jeder einzeln
zurücknehmbar und einzeln gemessen: **18i** Token-Erneuerung im PSN-Leerlauf (gebaut, 10.1
Schritt 7) → **18j** Ablauf: ein Lese- und ein Schreib-Batch je Cron-Aufruf, gemessen am Leerlauf
(gebaut am 17.10.2026) → **18k** Spielzeit mit `IN`-Listen und **18l** Store-Leser (ein
Release je Aufruf, Bytes sammeln und einmal dekodieren statt je Stück zu suchen; ganz am Stück
wäre bei 380 KB bis 1,4 MB je Seite teurer) – beide in derselben Nacht, aber eine Nacht nach 18j,
damit ihre Wirkung nicht mit der Grundlast vermischt → nachmessen → **20i** Markt. Erst mit den
Zahlen aus 20i entscheidet der Nutzer zwischen Wortindex-Zeile, Cron je Minute und GitHub Actions.

**Für 20i vorgemerkt: die Marktfrist** (Vorgabe des Nutzers vom 17.10.2026). Die Frist von 24 Stunden
setzt jedes Release auf die Uhrzeit seiner letzten Prüfung; was am Vortag spät im Fenster lag, wird
erst nach Fensterschluss wieder fällig – in der Nacht zum 17.10.2026 schloss das Fenster mit
`offen=16`. Jede Frist **≤ 21 Stunden** (24 minus 3 Stunden Fenster) macht alles zu Fensterbeginn
fällig; vorgeschlagen sind 20. Die Rechnung hängt an der Fensterlage und gehört mit dem Punkt
„Nachtläufe bis 05:00 UTC" unten neu geprüft.

**Danach, als eigener Nachtrag: der Marktschritt** – an der Regel „Abgleiche bereiten den Bestand
einmal vor" ausgerichtet: Titel einmal zerlegen statt je Prüfung, ein Wortindex je Aufruf statt
jedes Angebot gegen alle Spiele (Vorgabe des Nutzers vom 16.10.2026). Dazu gehört die **Auswahl,
die im Leerlauf 596 Zeilen liest** (10.1, Schritt 14; Tabelle unten). Derselbe Fehler wie bei `offen` steckt in
der Store-Zeile: `offen` zählt dort Releases ohne Stempel mit Produkt-Id im ganzen Bestand, nicht
das Fällige – nicht angefasst, notiert. Dazu gehört auch, dass diese Zählung (`offeneAnzahl`) in der
Produktion 412 Zeilen je Aufruf liest, obwohl ihr Kommentar `idx_release_store` nennt (D1-Analytics,
17.10.2026).

**Für 20i vorgemerkt, spätestens dort: der Bestand der Lesekosten-Messung** (Vorgabe des Nutzers vom
18.10.2026). Der Test liest im Wartungsleerlauf 2 218 Zeilen, die Produktion rund 2 590 – die drei
Auswahlen des Lage-Batches, exakt gemessen am 18.10.2026 über `meta.rows_read`, dieselben Anweisungen
aus dem Code (die Marktauswahl mit verschobener Frist, damit nichts fällig ist wie im Leerlauf):

| Auswahl | Test | Produktion | Plan | Woran der Abstand liegt |
|---|---|---|---|---|
| IGDB-Auffrischen | 431 | 480 | `SCAN game`, Sortierung über temporären Baum | **Menge** (430 gegen 479 Spiele) |
| Disc-Prüfung | 1 289 | 1 445 | `SCAN g`, je Spiel `idx_release_game` | **Menge** (430 gegen 490 Releases) |
| Gebrauchtpreise | 430 | 596 | ganzer `idx_release_markt` | **Verteilung**: 59 nie geprüfte Releases außerhalb der Auswahl (im Test 0) |

Die Schätzung „~2 870" aus der Stichprobe der D1-Analytics lag rund 10 % zu hoch; die Lücke zum Test
sind **17 %, nicht 30 %**. Der Test braucht also 479 Spiele, 490 Releases (manche Spiele mit zwei)
und 59 ungeprüfte Releases, die nie in die Auswahl kommen. **Die Ursache der Kosten selbst ist eine
andere:** Alle drei lesen im Leerlauf den ganzen Bestand, in Test und Produktion. Die IGDB-Auswahl
kann keinen Index nutzen (keiner auf `igdb_synced_at`, und `ORDER BY igdb_synced_at IS NOT NULL`
verhinderte ihn auch), die Disc-Auswahl geht von `game` statt vom kleinen Teil der Releases aus (171
`unbekannt`, davon 170 in der 30-Tage-Frist) – das ist Arbeit für einen Index-Nachtrag, nicht für
den Testbestand.

#### Stufe 18m: Betriebswarnungen in der App

Anforderung des Nutzers vom 17.10.2026: im Alltag mitbekommen, wenn die Automatik Probleme hat; vor
20g. Plan vorgelegt am 18.10.2026, Entscheidungen vom selben Tag. **Keine Migration, kein Eingriff
in den Cron** – die Stufe liest nur, was schon steht. **Die Fakten schreibt der Cron, das Urteil
entsteht beim Lesen:** `cron_stand` ([10-1-cron-verlauf.md](10-1-cron-verlauf.md)), die Sync-Läufe
des Crons, Status und Ablaufzeiten des Zugangs (nie das Geheimnis), der Sicherungsstand und die
Stände mit `fehlerAm`, gelesen in **einem** Batch aus Bausteinen (`src/db/baustein.ts`). Ein reines
Domain-Modul fällt das Urteil, **eine Route** liefert alle Warnungen; die drei Warnungen von heute
(13.2) ziehen dorthin um. Ermittelt beim Lesen, damit auch ein ganz ausgefallener Cron auffällt; eine
Meldung je Nacht und Art, die von selbst verschwindet, sobald ihre Fakten sie nicht mehr tragen;
gemeinsam mit dem Preisalarm aus 20g in der Glocke, optisch getrennt; Lesekosten **und CPU**
gemessen, weil die Prüfung bei jedem Öffnen läuft.

| Regel | Stufe |
|---|---|
| Ein Bereich seit über **26 h** ohne vermerkten Ausgang (auch: Stand fehlt ganz) | rot |
| Zugang abgelaufen oder ungültig – **sofort**, unabhängig von der Zahl der Nächte | rot |
| NPSSO läuft laut Sony in ≤ **3 Tagen** ab / in ≤ **14 Tagen** | rot / zur Kenntnis |
| Nacht-Sync gescheitert: **zwei Nächte hintereinander** / eine | rot / zur Kenntnis |
| Sicherung älter als acht Tage oder keine (14.2) | rot |
| Kette ohne Ausgang, gemeldet in den letzten 24 h | zur Kenntnis |
| Letzter Ausgang eines Bereichs mit Meldung; Kaufliste mit `fehlerAm` | zur Kenntnis |
| Schritt bis Fensterende nicht fertig (`offen > 0`) | zur Kenntnis, **erst nach 20i scharf** – bis dahin jede Nacht (`offen=18` am 18.10.) |

Das NPSSO-Datum ist, was Sony beim Eintragen angekündigt hat, nicht gemessen – der Text sagt deshalb
„läuft laut Sony am … ab". Am 18.10.2026: 28.11.2026. **Kurze Fehler, die sich im nächsten Aufruf
selbst beheben, zeigt 18m nicht:** `cron_stand` hält je Bereich nur den letzten Ausgang
(Entscheidung des Nutzers vom 18.10.2026).

**Offen bis zum Prototyp:** die Farben – das Gelb „zur Kenntnis" verwechselt sich mit dem Gelb der
Glocke („Arbeit wartet"), und der heutige gelbe Block ist inhaltlich das Rot –, und was die Zahl an
der Glocke zählt, wenn die Arten zusammenkommen.

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
