← [Inhaltsverzeichnis](README.md) · [16.2 CPU-Grenze](16-2-cpu-und-betrieb.md)

## 16. CPU-Grenze – was je Schritt folgt

Ausgelagert aus [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md), weil die Datei sonst über 15 KB läge.

**Was daraus je Schritt folgt** – gerechnet mit den gemessenen Einzelkosten:

- **Leerlauf – gebaut in 18j:** zwei D1-Aufrufe statt zehn (Wartung) bzw. 16 (PSN, gemessen in 18h vor 18i), ein
  Lese- und ein Schreib-Batch ([10.1](10-1-cron.md), „Ein Lese- und ein Schreib-Batch"). Vorher 7–11 ms
  mit echter D1 in der Messung von 18h. **Gemessen in der Nacht zum 18.10.2026** (alle 72 Aufrufe
  `success`, keiner ohne Ausgang): Wartungs-Leerlauf 4,1–7,5 ms, Median 4,8 (n = 12; SJC 4,5 gegen
  10,9–12,9 am 17.10., EWR 4,1–5,5, DFW 4,4–7,5) – die Vermutung von 3–6 ms trifft im Median, drei
  von zwölf lagen darüber, alle unter 10. **Nacht zum 19.10.2026:** PSN-Leerlauf erstmals gemessen,
  4,5–8,7 ms, Median 5,7 (n = 15; EWR 4,5/4,7, IAD 5,1–8,6, ATL 5,4–8,7; am 17.10. EWR 11,5, IAD ~16,
  ATL ~17); Wartungs-Leerlauf 4,5–13,8, Median 7,3 (n = 14), **zwei über 10** (ORD 13,8, SJC 12,3).
  Über beide Nächte und Fenster: Median 5,8 ms (n = 41) – der Leerlauf allein füllt das Budget von
  ~5 ms. **Nacht zum 20.10.2026**, die erste ohne Marktauswahl im Lage-Batch (im Test 1 788 statt
  2 218 Zeilen): Wartungs-Leerlauf 4–12 ms, **Median 7** (n = 25; SJC 5–12, Median 9, gegen 4,5 am
  18.10.; DFW 5–9), vier über 10 – **keine Wirkung sichtbar**, das Budget für den Leerlauf (Median um 5,
  P99 unter 10) bleibt verfehlt. PSN-Leerlauf 4–11, Median 5 (n = 13; EWR 4–5, IAD 5–11, ORD 5–8). Am 18.10. **gab es den PSN-Leerlauf nicht:** In einer Kaufliste-Nacht
  belegt die Arbeit alle 36 Aufrufe (Sync 11, Spielzeit 2, Besitz 15, Level 1, Store 7, der Store
  fertig im letzten); Vergleichswerte vom 17.10.: EWR 11,5 ms, IAD ~16, ATL ~17, ORD ~13,5. Sync,
  Store und Markt blieben je Standort unverändert – 18j spart den Rahmen, nicht die Arbeit. **Die
  zwei D1-Aufrufe sind in der Produktion nicht zählbar** (die D1-Analytics zählen Anweisungen, als
  Stichprobe; D1 zählt nicht als `subrequests`): In den Leerlauf-Minuten kamen nur die zwölf
  Anweisungsarten der beiden Batches vor. Die Zahl selbst hält `test/cron-lage.spec.ts`.
- **Spielzeit – gebaut in 18k (18.10.2026):** Kandidaten der ganzen Seite in `IN`-Listen zu je
  100 Schlüsseln (`releasesNachSchluesseln`) in **einem** Lese-Batch, die Seite als mehrzeilige
  Upserts zu je zwölf Titeln in **einem** Schreib-Batch. **2 D1-Aufrufe je Seite statt 217**,
  gemessen in `test/lesekosten.spec.ts` (200 Titel, die Hälfte zugeordnet), die Ausgangszahl im
  unberührten Stand: gelesene Zeilen 1 100 / 1 300 (erste / jede weitere Nacht) statt 900 / 1 100,
  geschrieben unverändert 600 / 400. **Erwartung, nicht gemessen:** aus den Einzelkosten von 18h
  rund 3 ms D1 plus 6 ms Rechnen – also weiter grenzwertig; die Seitengröße bleibt bei 200
  (`GESPIELTE_JE_SEITE`). **Gemessen in der Nacht zum 19.10.2026:** EWR 18,6 ms (200 Titel), IAD
  29,3 ms (179) gegen EWR 115–150 und ORD 119–148 vorher – **rund 85 % weniger**, aber doppelt so
  viel wie erwartet und weiter über 10. **Nacht zum 20.10.2026:** IAD 22 ms (200 Titel), ORD 24 (179).
- **Sync** (5–6 Abfragen, ein Batch mit 104 Anweisungen): rund 4 ms D1, 3 ms Rechnen, dazu die
  echte Seite aus dem Netz – grenzwertig. **Nacht zum 20.10.2026:** Abruf 12–16 ms, Normalisierung
  11–21, Median 13 (n = 9); Level 11.
- **Store** (je Release ein Batch, die Seite als Strom): rund 1 ms D1 plus 3 ms Lesen je Release;
  **ein Release je Aufruf** trägt, zehn nicht. Am Stück zu lesen wäre billiger, aber dann wird die
  ganze Seite geholt (380 KB bis 1,4 MB, 7.4). **Leser gebaut in 18l (18.10.2026):** weiter ein
  Strom, aber gesucht wird nur im neuen Teil, behalten nur der Rest (`BlockStrom`, 7.4). **Ob das die
  3 ms trifft, ist offen:** In Node (nachgebaute Seite, 1 MB, Block bei 67 KB) liegen alter und neuer
  Leser ab 4-KB-Stücken kalt wie warm unter 1,1 ms, nur bei 1-KB-Stücken warm 0,70 gegen 0,21 ms – die
  3 ms sitzen vermutlich in den Stücken selbst, nicht in der Suche (Vermutung). **Die Portion bleibt
  bei zehn** (Entscheidung des Nutzers vom 18.10.2026): Für 79 Ziele (18.10.: 53 PS4, 22 PS5, 4 PS3)
  bräuchte ein Release je Aufruf rund 75 Aufrufe, frei sind ohne Kaufliste 22 – kein PSN-Leerlauf
  mehr, nur ~22 frische Preise je Nacht. **Gemessen in der Nacht zum 19.10.2026** (Aufruf minus
  Leerlauf desselben Standorts, geteilt durch Releases): **2,2–6,1 ms je Release** (EWR 2,2, MIA und
  ATL 2,2–2,9, ORD 3,1–4,3, IAD 6,1); am 18.10., vor 18l, 3,0–6,5. **Eine Wirkung von 18l ist im
  Produktionsmaß nicht zu sehen.** Ins Budget von ~5 ms passt kein Release, denn der Leerlauf allein
  braucht es; ein Release je Aufruf läge bei rund 7 (EWR) bis 12 ms (IAD). **Nacht zum 20.10.2026**,
  die erste mit 20 Stunden Frist: am Stück 04:10–04:45, 79 Releases in acht Aufrufen, `offen=0`, 29–41
  ms je Aufruf (EWR 29–39, IAD 34–41). **Der Store geht in eine GitHub Action** (Entscheidung des
  Nutzers vom 20.10.2026, [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).
- **Gebrauchtpreise – seit 20i eine GitHub Action:** Im Cron lag die Grundlast eines Aufrufs (vier
  Abfragen, Sammlung laden und vorbereiten) schon bei 5–8 ms, jedes Release kostete 3–4 ms mehr (94 ms
  für 20 mit echter D1), und **kein** Cron-Aufruf traf eine warme Instanz (0 von 28 im Minutentakt).
  Verworfen damit auch der Wortindex **als eine Zeile** (Berechnetes, das gespeichert würde). Als
  Action in der Nacht zum 20.10.2026: je Portion von sechs Releases Median 2, P90 4, höchstens 15 ms
  ([7.3](07-3-ebay-betrieb.md)).
- **IGDB-Auffrischen** (Frist sieben Tage, 50 Spiele je Aufruf, 10.1 Schritt 12) – **erstmals gemessen
  in der Nacht zum 20.10.2026:** neun Aufrufe von 06:05 bis 06:45, **20–54 ms**, Median 34 (MIA 25–28,
  EWR 28, IAD 39, SJC 20, vier ohne Standort 34–54); acht mit Logzeile, darin 370 angefragt und 369
  aktualisiert.
  Einmal je Woche, aber jeder Aufruf über dem Budget; Ursache nicht untersucht. Bleibt im Worker
  (16.2) – ob das so bleibt, ist offen.

