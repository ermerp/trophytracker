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
  mit echter D1 in der Messung von 18h. Die Wirkung in der Produktion wird je Standort gegen die Nacht
  zum 17.10.2026 gemessen: PSN-Leerlauf in EWR 11,5 ms, IAD ~16, ATL ~17, ORD ~13,5; Wartung in SJC
  ~12, LAX ~16. **Erwartet sind 3–6 ms – eine Vermutung**, gerechnet aus dem Verhältnis in 18h mal dem
  Standortfaktor.
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
Leerlauf der Wartung läse dann fünfmal so viele Zeilen je Nacht (gerechnet am 16.10.2026: rund
480 000 statt 96 000; seit 18j liest ein Wartungsleerlauf 2 218 statt 2 659 Zeilen). **Es hilft nur
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
die im Leerlauf 430 Zeilen liest** (10.1, Schritt 14). Derselbe Fehler wie bei `offen` steckt in
der Store-Zeile: `offen` zählt dort Releases ohne Stempel mit Produkt-Id im ganzen Bestand, nicht
das Fällige – nicht angefasst, notiert. Dazu gehört auch, dass diese Zählung (`offeneAnzahl`) in der
Produktion 412 Zeilen je Aufruf liest, obwohl ihr Kommentar `idx_release_store` nennt (D1-Analytics,
17.10.2026).

#### Nächste Stufe nach 18j: Betriebswarnungen in der App

Anforderung des Nutzers vom 17.10.2026: im Alltag mitbekommen, wenn die Automatik Probleme hat.
**Der Plan entsteht erst, wenn 18j deployt ist**; vor 20g. Ausgangspunkt ist, was es schon gibt
(13.2, Stufe 19a): der gelbe Block für Stillstand (abgelaufener Zugang, fehlgeschlagener Nachtlauf
jünger als 24 h, überfällige Sicherung) und die Glocke für wartende Arbeit.

Vorschlag des Nutzers: **Rot** für Handlungsbedarf (Automatik über ~26 h nicht gelaufen, NPSSO
abgelaufen oder bald fällig, Sync mehrfach gescheitert, Sicherung zu alt), **eine zweite Stufe zur
Kenntnis** (Aufrufe ohne Ausgang, Schritt bis Fensterende nicht fertig, Schritt ruht wegen Fehler);
**ermittelt beim Lesen**, damit auch ein ganz ausgefallener Cron auffällt; eine Meldung je Nacht und
Art, die von selbst verschwindet; gemeinsam mit dem Preisalarm aus 20g in der Glocke, optisch
getrennt; Lesekosten **und CPU** der Prüfungen gemessen, weil sie bei jedem Öffnen laufen.

**Die Fakten schreibt der Cron, das Urteil entsteht beim Lesen.** Was sich nur aus den Textzeilen von
`cron_verlauf` ergäbe (Abbrüche, Rest bei Fensterschluss), legt seit 18j der Ausgangs-Batch als Zahlen
unter `cron_stand` ab ([10-1-cron-verlauf.md](10-1-cron-verlauf.md)) – die Stufe selbst fasst den Cron
nicht an. Die Prüfungen beim Lesen gehören in **einen** Batch; die Bausteine aus 18j
(`src/db/baustein.ts`) lassen sich dafür mitbenutzen.

**Offen, ausdrücklich:**

- **Farben:** Das Gelb „zur Kenntnis" verwechselt sich mit dem Gelb der Glocke („Arbeit wartet"), und
  der heutige gelbe Block ist inhaltlich das Rot des Vorschlags. Was die Zahl an der Glocke zählt,
  wenn vier Arten zusammenkommen, wird im **Prototyp** entschieden.
- **„Bis Fensterende nicht fertig"** wäre bis 20i jede Nacht gelb (Marktfrist, oben) und wird erst
  danach scharf geschaltet.

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
