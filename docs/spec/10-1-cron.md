← [Inhaltsverzeichnis](README.md)

### 10.1 Automatik: der Cron Trigger (Stufe 18)

`wrangler.jsonc` trägt **zwei** Cron-Einträge (Stufe 18e, Entscheidung des Nutzers vom 27.09.2026;
bis dahin einen). Der Free Tier erlaubt fünf je Konto – gegen Cloudflares Dokumentation geprüft am
27.09.2026, dort steht auch die 10-ms-CPU-Grenze für Cron-Aufrufe:

| Eintrag | Ausdruck | Aufrufe | Arbeit |
|---|---|---|---|
| PSN | `*/5 3-5 * * *` | 36 (05–08 Uhr MESZ) | Hänger abbrechen, Sync-Schritt, Spielzeit, Kaufliste, Einzeltrophäen, Store-Preise |
| Wartung | `*/5 6-8 * * *` | 36 (08–11 Uhr MESZ) | erschienene Titel freigeben, IGDB-Auffrischen, Disc-Fassungen, **Gebrauchtpreise**, Trophäen je Jahr, alte Rohantworten |

**Warum aufgeteilt.** Ein Fenster trug die Arbeit nicht mehr: elf Aufrufe Sync, zwei Spielzeit,
fünfzehn Kaufliste und – nach einem IGDB-Rückstand – acht Auffrischen sind **37 von 36**
(nachgerechnet am 24.09.2026, siehe „Die Auffrisch-Last kommt in Schüben"). Der Schnitt liegt bei
„fasst PSN an oder nicht": Die PSN-Kette braucht viele Aufrufe und hängt an einer inoffiziellen
Schnittstelle, die Wartung ist billig und beliebig verschiebbar. So passen beide Hälften bequem
(28 von 36 an einer Kaufliste-Nacht, in der Wartung seit dem täglichen Preisabruf rund 33 von 36),
und die beiden Lastspitzen liegen
nicht mehr in derselben Stunde. Der Ansatz ist der des Nutzers vom 24.09.2026; das eine Nachtfenster
war seine Entscheidung vom 19.09.2026 und bleibt es für alles, was PSN anfasst.

Welcher Eintrag gefeuert hat, steht in `event.cron`; `bereichFuerAusdruck` bildet es auf
`psn` / `wartung` ab. Die Ausdrücke stehen als Konstanten `CRON_PSN` und `CRON_WARTUNG` in
`src/sync/cron.ts` – ein **unbekannter** Ausdruck bekommt `alles` und tut beides, damit eine
Änderung an `wrangler.jsonc` nicht die halbe Automatik still abschaltet. Lokal (`--test-scheduled`)
und im Test ist `alles` der Normalfall.

Der Einstieg ist `scheduled` in `src/index.ts`, die Logik `cronSchritt` in `src/sync/cron.ts` –
eine reine Funktion über Repositories und Clients, gegen die lokale D1 getestet (`test/cron.spec.ts`).

**Ein Aufruf, eine schwere Arbeit.** Die 10-ms-CPU-Grenze gilt auch für Cron-Aufrufe (Abschnitt 2);
ein Aufruf schafft eine Seite holen (≈ 3 ms) oder eine Seite auswerten (5–7 ms), nicht beides.
Deshalb tut jeder Aufruf in dieser Reihenfolge genau **eines** und hört dann auf. Die Schritte 1
bis 8 gehören dem PSN-Fenster, 9 bis 15 der Wartung:

1. **Hängengebliebene Läufe abbrechen.** Ein Lauf mit `status = 'laufend'`, dessen letzter
   Fortschritt älter als **drei Stunden** ist (die Länge des Fensters), wird auf `fehler` gesetzt
   mit dem festen Text „Abgebrochen: seit über 3 Stunden kein Fortschritt." Der letzte Fortschritt
   wird **abgeleitet, nicht gespeichert**: das Neueste aus `started_at`, `psn_raw_response.fetched_at`
   und `normalized_at` des Laufs (Index auf `sync_run_id`, fünf Zeilen). Warum: `syncSchritt`
   fängt Fehler und schließt den Lauf ab, aber ein Abbruch des Workers (CPU-Grenze, D1-Fehler)
   oder eine Ausnahme im Abschluss der Normalisierung lässt ihn auf `laufend` stehen, und
   `laufenderLauf()` fände ihn jede Nacht wieder – ein einzelner Abbruch legte den Sync dauerhaft
   still (Ergänzung des Nutzers vom 19.09.2026). Ein Lauf, der vor weniger als drei Stunden noch
   Fortschritt hatte – etwa ein am Abend vom Nutzer abgebrochener –, wird in Schritt 2
   **fortgesetzt**, nicht verworfen. Kein `game_event` dafür: `psn_sync_run.error_message` ist das
   Protokoll des Laufs.
2. Läuft ein Sync (`laufenderLauf()`), ein `syncSchritt` – egal, wer ihn startete. Die Schritte
   sind idempotent (UPSERT, `naechsteUnverarbeitete`); ein gleichzeitiger Klick auf „Jetzt
   abrufen" ist harmlos. **Seit Stufe 18e gehört dazu ein Lauf, dessen letzter Aufruf an einer
   Seite scheiterte:** Ein Abrufsfehler ohne Auth-Bezug (503, Ratenlimit, Netzfehler) lässt den
   Lauf auf `laufend` und zählt `failed_attempts` hoch (Migration 0024); der nächste Aufruf holt
   fünf Minuten später dieselbe Seite ab `next_offset` erneut. Nach **drei** Fehlversuchen ohne
   Fortschritt gilt der Lauf als gescheitert, erst dann steht der Zugang auf `fehler`. Jeder
   Fortschritt setzt den Zähler zurück – gezählt werden Versuche an derselben Stelle, nicht über
   die Nacht verteilte. Ein abgelehnter Token (`PsnAuthError`) bekommt **keinen** zweiten Anlauf:
   Er wird in fünf Minuten nicht gültig. **Anlass:** In der Nacht zum 27.09.2026 scheiterte die
   dritte von fünf Seiten um 03:10; der Lauf ging auf `fehler`, Schritt 3 startete wegen „ein
   Versuch je Nacht" keinen neuen, und die restlichen 29 Aufrufe taten nichts – 431 Titel blieben
   einen Tag alt, obwohl derselbe Endpunkt um 03:16 wieder antwortete (der Spielzeit-Schritt lief
   erfolgreich). Dieselbe Seite war am Morgen von Hand abrufbar: Der Fehler war vorübergehend.
3. Sonst, wenn PSN eingerichtet ist **und** `status <> 'abgelaufen'` **und** heute (UTC-Datum)
   weder ein Cron-Lauf gestartet noch irgendein Lauf erfolgreich war: einen Lauf mit
   `started_by = 'cron'` starten. Daraus folgt: **ein Cron-Versuch je Nacht**, auch nach `fehler`
   (keine Wiederholung, Entscheidung des Nutzers vom 19.09.2026); ein erfolgreicher Handabruf vom
   selben Tag macht den Nachtlauf überflüssig; ein fehlgeschlagener oder in Schritt 1 abgebrochener
   Handlauf blockiert ihn nicht. Bei `abgelaufen` entsteht gar kein Lauf – sonst stünde jede Nacht
   eine Fehlerzeile in der Historie; ein neues NPSSO setzt `ok`, dann geht es von allein weiter.
4. Sonst, mit PSN-Zugang: **Spielzeit** (7.7) – eine Seite je Aufruf, täglich; der Stand steht als `datum:offset[:versuche]` in `app_setting`, ein abgeschlossener Tag ruht. **Ein Abrufsfehler beendet den Tag seit Stufe 18f nicht mehr:** Der Offset bleibt stehen, der nächste Aufruf holt fünf Minuten später dieselbe Seite, nach drei Anläufen ruht der Tag (`FEHLVERSUCHE_HOECHSTENS`, dieselbe Zahl wie beim Sync). **Anlass war die Nacht zum 01.10.2026:** Die erste Seite kam durch, die zweite bekam `403`, und weil jeder Fehler damals `-1` schrieb, blieben **179 von 379 Titeln** ohne frische Spielzeit, während 20 Aufrufe des Fensters leer liefen – derselbe Fall, den 18e für den Sync gelöst hatte, nur an einem Schritt, der älter ist als diese Einsicht. Die Verlaufszeile nennt `versuch=n/3` wie beim Sync.
5. Sonst **Kaufliste** (7.7) – eine Seite je Aufruf, wöchentlich; der Stand hält Blätterung und die bisher gesehenen PS+-Releases. Erst nach der letzten Seite wird aufgeräumt, ein abgebrochener Lauf löscht nichts. **Ein Fehler schreibt `{fehlerAm}`, nicht `{fertigAm}`** (Stufe 18e): Vorher hinterließen beide Ausgänge dieselbe Marke, ein gescheiterter Lauf sah aus wie ein vollständiger und legte den Schritt für sieben Tage still – genau daran blieb der Ausfall aus 18c vier Tage unentdeckt (7.7). Von Hand anstoßen lässt er sich über `POST /api/sync/besitz` und den Knopf „Kaufliste jetzt abrufen" in den Einstellungen; das überspringt die Frist, nicht die Blätterung. Ein erfolgreicher PSN-Schritt räumt ausserdem ein altes `fehler` am Zugang weg – am Morgen des 27.09.2026 stand dort „Fehler beim letzten Versuch", obwohl zwei Abrufe kurz danach durchgelaufen waren; `last_success_at` bleibt dem Sync vorbehalten.
6. Sonst **Einzeltrophäen** (7.7, Stufe 19b) – eine Liste je Aufruf. Ganz hinten in der
   PSN-Kette, weil der Portionsknopf der Hauptweg ist: Dieser Schritt ist das Netz für den Fall,
   dass niemand drückt, und die Nachführung für Listen, an denen sich etwas geändert hat. Beides
   ist **dieselbe Auswahl** – `naechsteZumFuellen` fragt „Stempel fehlt **oder** Zählersumme weicht
   ab". Kein eigener Fehlversuchszähler: Hier hängt kein Offset an einem Lauf, den ein Fehler
   verlieren könnte; scheitert der Abruf, wird nicht gestempelt, und derselbe Aufruf wählt die
   Liste in fünf Minuten erneut – die Wiederholung **ist** die Auswahl. Gemessen: 430 gelesene
   Zeilen je Aufruf im Dauerbetrieb, 15 480 je Nacht.
7. Sonst das **Trophäen-Level** (`trophySummary`), höchstens einmal am Tag und nur, wenn nichts
   mehr zu füllen ist: ein einzelner Abruf, der nie einen Aufruf kostet, den die Erstbefüllung
   braucht. Schlägt er fehl, bleibt der alte Stand stehen.
8. Sonst **Store-Preise** (7.4, Stufe 21) – zehn Releases je Aufruf, täglich. Steht im PSN-Fenster,
   aber **ausserhalb der Zugangsprüfung**: Es ist Sonys Schnittstelle, sie braucht aber kein Token,
   und ein abgelaufenes NPSSO darf die Preise nicht stilllegen. Ganz hinten in der PSN-Kette, damit
   er keinen Aufruf belegt, den eine schwere Arbeit braucht – dieselbe Begründung wie beim
   Trophäen-Level –, und in eigenem `try/catch` wie die IGDB-Schritte (18b). Die Portion ist nach
   **Fremdanfragen** geschnitten, nicht nach Dauer: Beim ersten Mal kostet ein Release bis zu vier
   (Concept plus bis zu drei Produktseiten), danach genau eine; der Schritt zählt mit und hört bei
   vierzig auf. Der Stand steht je Zeile in `release.store_geprueft_am` – auch hier gibt es den
   Fehlerfall aus 18e nicht. Ein Aufruf liest **791 Zeilen** (7.4).
9. **Wartung, immer zuerst:** `erschieneneFreigeben` (8.4) – nur SQL, kein CPU, protokolliert selbst; im PSN-Fenster passiert das nicht.
10. Sonst, mit IGDB-Zugang: `igdbAuffrischSchritt` mit Frist sieben Tage (7.6), wenn etwas fällig ist. Spiele, die IGDB nicht zurückgibt, werden trotzdem gestempelt – sonst wählt der nächste Aufruf dieselben und der Schritt dreht sich im Kreis (Befund vom 21.09.2026). Die Schritte 10 und 11 laufen in `try/catch`: Eine Ausnahme darf nicht den ganzen Aufruf reißen.
11. Sonst `igdbPhysischSchritt` (30-Tage-Frist in `DISC_OFFEN`), wenn etwas fällig ist.
12. Sonst **Gebrauchtpreise und Disc-Nachweis aus eBay** (7.3, Stufe 20): zwanzig Releases je Aufruf, zwei Suchen je Release – also vierzig von fünfzig erlaubten Fremdanfragen, zehn Reserve für eine Token-Erneuerung mitten in der Portion. Gefragt wird **täglich** (Stufe 20e) und nur, was in der Lückenansicht auftaucht oder auf einer offenen Absicht steht – derselbe Zuschnitt, den 7.4 für die Store-Preise festlegt. Bei 431 Releases sind das rund 22 Aufrufe. **Der Stand steht je Zeile in `release.markt_geprueft_am`, nicht als Marke in `app_setting`:** Damit gibt es den Fehlerfall aus 18e hier nicht – ein abgebrochener Lauf lässt die ungeprüften Releases ungestempelt, und Erfolg und Fehler können keine gemeinsame Marke hinterlassen, weil es keine gibt. Ein Aufruf liest 940 Zeilen.
13. Sonst die **Trophäen je Jahr** durchrechnen (Stufe 19b) – einmal am Tag, im billigen Fenster. 18 060 gelesene Zeilen sind für die Startseite zu teuer (Abschnitt 2); hier stören sie niemanden, und das Dashboard liest danach eine Zeile aus `app_setting`.
14. Sonst **alte Rohantworten aufräumen** (Stufe 18d): `psn_raw_response` behält die Seiten der jüngsten **drei** Läufe, die überhaupt Seiten haben, und **alles noch nicht Normalisierte** – unabhängig vom Alter, denn das ist unerledigte Arbeit, kein Archiv. **Die Lücke dabei ist seit Stufe 18e geschlossen:** Die Seiten eines endgültig gescheiterten Laufs sind keine unerledigte Arbeit mehr – `naechsteUnverarbeitete` filtert auf die Lauf-Id, der nächste Lauf holt alles neu. Sie blieben trotzdem dauerhaft liegen und wanderten in jede Sicherung; in der Nacht zum 27.09.2026 waren es zwei Seiten und 117 KiB aus Lauf 13. Jetzt räumt der Schritt auch sie weg, sobald ihr Lauf aus dem Fenster der jüngsten drei fällt – bis dahin sind sie das Beweisstück zum Fehler, und ein Lauf mit bloßen Fehlversuchen steht ohnehin noch auf `laufend`. Ein einzelnes `DELETE` über den Index auf `sync_run_id`, also die leichteste Arbeit der Reihenfolge; sie steht ganz hinten und belegt einen Aufruf, der sonst „nichts" täte. Kein `game_event`: Es ändert sich kein Spiel und keine Entscheidung, nur Fremddaten, die jederzeit neu abrufbar sind (8.5). **Warum überhaupt:** Der Zweck der Rohablage ist eine ohne PSN wiederholbare Normalisierung (7.1), nicht ein Archiv jeder Nacht. Am 23.09.2026 waren **2,31 von 3,26 MB** der Datenbank Rohantworten – fünf Seiten je Nacht, immer dieselben 431 Titel, 263 KiB täglich –, und nichts löschte sie je. Über `d1 export` wandern sie zusätzlich in jede wöchentliche Sicherung und damit dauerhaft in die Historie des privaten Backup-Repositorys (14.2).
15. Sonst nichts.

Bei 431 Titeln braucht der Sync rund elf Aufrufe (fünf Seiten holen, fünf auswerten, Abschluss);
danach frischt der Rest der Nacht in Portionen à 50 auf und räumt zuletzt die alten Rohantworten
weg.

**Die Auffrisch-Last kommt in Schüben, nicht gleichmäßig.** „Ein bis zwei Aufrufe für IGDB" gilt
im Beharrungszustand, nicht nach einem Rückstand: Am 24.09.2026 trugen **368 der 477 verknüpften
Spiele denselben Stempel** – eine Nacht hatte den Rückstand aus 18b in einem Zug abgearbeitet, und
sie werden deshalb alle in derselben Nacht wieder fällig und brauchen bei fünfzig je Aufruf
**acht** Aufrufe.

**Eine volle Nacht sind 31 Aufrufe:** elf Sync, zwei Spielzeit, fünfzehn Kaufliste, ein bis acht
IGDB und einer Aufräumen. In **einem** Fenster wären das **37 von 36** – genau die Rechnung, die zur
Aufteilung in Stufe 18e geführt hat. Seither stehen 28 Aufrufe im PSN-Fenster (von 36) und 9 in der
Wartung (von 36, seit Stufe 20e `*/5 6-8`). **Wer dem Cron einen Schritt hinzufügt, rechnet gegen
die Hälfte, in die er gehört**, nicht gegen 36 für alles zusammen.

Die Lesekosten sinken mit der Aufteilung, weil jedes Fenster nur noch seine eigenen Abfragen
liest: Die drei teuren (erschienene Titel, IGDB-Auswahl, Disc-Auswahl) laufen nicht mehr im
PSN-Fenster mit. Gemessen in `test/lesekosten.spec.ts` bei 430 Listen: ein Leerlauf im PSN-Fenster
liest **15** Zeilen (`psn_sync_run`) plus vier für die Store-Auswahl seit 21b, einer in der Wartung
**2 226** – weit unter dem Tagesbudget von fünf Millionen.

**Der Leerlauf einer Nacht summiert sich auf rund 80 800 Zeilen** (19 × 36 + 2 226 × 36) –
gerechnet aus den gemessenen Einzelkosten, nicht frisch über 24 Stunden gemessen; die letzte
24-Stunden-Messung (116 040 Zeilen am 01.10.2026, 15.4) liegt vor der Erweiterung des
Wartungsfensters.

**Der Leerlauf ist aber nicht die Nacht.** Die *arbeitenden* Aufrufe kosten mehr: Der
Spielzeit-Schritt allein las über einen Titelabgleich ohne Index rund **145 000** Zeilen je Nacht,
die wöchentliche Kaufliste rund **350 000** (Abschnitt 2, Migration 0025); eine Nacht lag damit bei
gut **200 000**, und zusammen mit einer Arbeitssitzung ergab das am 28.09.2026 **1 335 628**
gelesene Zeilen in 24 Stunden. Seit dem Index sind es je Abgleich vier statt 480. **Eine Messung,
die nur den Leerlauf zählt, beschreibt nicht die Nacht** ([lehren.md](../lehren.md)).

**Wie eine Nacht nachträglich lesbar ist** – `cron_verlauf`, die Verdichtung und der
örtliche Aufruf: [10-1-cron-verlauf.md](10-1-cron-verlauf.md).
