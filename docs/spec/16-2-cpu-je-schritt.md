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
  P99 unter 10) bleibt verfehlt. PSN-Leerlauf 4–11, Median 5 (n = 13; EWR 4–5, IAD 5–11, ORD 5–8).
  **Nacht zum 21.10.2026:** Wartungs-Leerlauf 4–14 ms, Median 6,8 (n = 34; DFW 5,2 gegen 6,5, SJC 8,8
  gegen 9,4, LAX 8,6 gegen 6,9) – je Standort unverändert, das Budget weiter verfehlt; PSN-Leerlauf
  5–14, Median 6,1 (n = 14; EWR 5,6, ORD 6,4, IAD 13,9). `rows_read_24h` 129 870,
  `rows_written_24h` 3 638 (keine Kaufliste-Nacht). **Nacht zum 22.10.:** Wartungs-Leerlauf 4–15 ms,
  Median 6,3 (n = 30; DFW 6,1, LAX 8,3, SJC 9,8), fünf über 10; PSN-Leerlauf 4–10, Median 6,5 (n = 14),
  keiner über 10. **Nacht zum 23.10., die erste ohne Store im PSN-Fenster:** alle 72 `ok`; PSN-Leerlauf
  3–8, Median 5 (n = 22; EWR 4,4, IAD 5,7, ATL 7,1), keiner über 10; das PSN-Fenster las 14 231 statt
  27 607 Zeilen, je Leerlauf-Aufruf rund 142 (189 weniger, die Store-Auswahl). Wartungs-Leerlauf 3–16,
  Median 5 (n = 33; DFW 5,0, SJC 9,6), vier über 10, alle SJC/LAX – unverändert, rund 2 000 Zeilen je
  Aufruf. Sync 10–20, Spielzeit 26 und 30 ms. `rows_read_24h` 686 129, davon die Nacht rund 115 000,
  der Rest Deploys und Probelauf am 22.10. **Nacht zum 24.10.:** alle 72 `ok`, die Standorte erstmals
  weltweit verteilt (FRA, AMS, LHR, CDG, VIE, PRG, ARN, LIS, MAD, OTP, HKG, NRT, KIX, SYD, BNE neben den
  US-Standorten; bis zum 23.10. nur USA). Wartungs-Leerlauf 3–10, **Median 4** (n = 34), keiner über 10;
  PSN-Leerlauf 3–13, Median 5 (n = 22), drei über 10 (SJC 11/13, LAX 13). **Der bessere
  Wartungs-Leerlauf kommt vom Standortwechsel, nicht vom Code:** Am Cron hat sich nichts geändert, die
  Zeilen je Aufruf sind unverändert rund 2 000 (23 928 je Leerlauf-Stunde), und die US-Standorte liegen
  wie zuvor (DFW 4, SJC 10). **Das Budget für den Leerlauf gilt damit nicht als erreicht** – es hinge an
  einem Standort, den niemand festlegt (Entscheidung des Nutzers vom 24.10.2026). Sync 8–18, Spielzeit
  19 (EWR) und 23 ms (LHR), Level 8, Jahre 8, IGDB-Auffrischen 9 (ein Spiel fällig). `rows_read_24h`
  234 148, `rows_written_24h` 3 507; die Nacht (03–09 UTC) rund 108 500, davon PSN 14 330, der Rest der
  Deploy von 20i-c (115 804) und die Abendläufe (rund 9 900). **Nacht zum 25.10., eine Kaufliste-Nacht:**
  alle 72 `ok`, wieder weltweit verteilt; Wartungs-Leerlauf 3–10, Median 5 (n = 35), keiner über 10,
  je Standort wie zuvor (EWR 4, AMS 5, ORD 6–10, SJC 9); PSN-Leerlauf 3–10, Median 4 (n = 7, die
  Kaufliste belegte 15 Aufrufe). Kaufliste 11–26 ms, Median 19 (n = 15; FRA 12, MXP 11/12, DFW 18–23,
  SEA 26/26) statt 35–108 vor 18k-b. Sync 8–17, Median 11 (n = 11), Spielzeit 24 / 24 ms (LHR, 200 / 179
  Titel), Level 12, Jahre 8; kein IGDB-Auffrischen – nach dem Auffrischen von Hand am 24.10. ist
  nichts fällig. Die Nächte ab dem 26.10. stehen in [16-2-naechte.md](16-2-naechte.md). `rows_read_24h` 821 435, `rows_written_24h` 4 042; die Nacht (03–09 UTC) 185 006,
  davon PSN 17 896, Jahre rund 22 300 und die wöchentliche Sicherung rund 73 000; 626 592 sind Bau
  und Produktionsprüfung von Stufe 22 am 24.10. (10–14 UTC), 9 837 die Abendläufe. Die Sicherung
  (`GET /api/export/backup.json`) brauchte **212 ms CPU** (SEA) und lief ohne Abbruch – einmal je
  Woche, bisher nirgends gemessen; nur notiert. Je Standort über die Nächte 20.–22.10. (Leerlauf, Median): EWR 4,8, DFW 5,6, IAD 6,1,
  ORD/ATL 7,2, LAX 7,6, MIA 7,9, SJC 9,8, SEA 10,7 (n = 2) – der langsamste Standort braucht knapp das
  Doppelte des schnellsten. `rows_read_24h` 382 042, davon die Nacht (03–09 UTC) rund 128 000; der Rest
  ist App-Nutzung am Abend des 21.10. (Zähler von Statistik und Einstellungen, Stichprobe der D1-Analytics). Am 18.10. **gab es den PSN-Leerlauf nicht:** In einer Kaufliste-Nacht
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
  **Nacht zum 21.10.:** IAD 30 (200), ATL 20 (179). **22.10.:** ORD 29 (200), ORD 21 (179).
- **Sync** (5–6 Abfragen, ein Batch mit 104 Anweisungen): rund 4 ms D1, 3 ms Rechnen, dazu die
  echte Seite aus dem Netz – grenzwertig. **Nacht zum 20.10.2026:** Abruf 12–16 ms, Normalisierung
  11–21, Median 13 (n = 9); Level 11. **Nacht zum 21.10.:** 9–20, Median 13 (n = 11); Level 13. **22.10.:** 10–30, Median 17 (n = 11; ORD 25,
  IAD 21, EWR 10); Level ORD 20.
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
  ms je Aufruf (EWR 29–39, IAD 34–41). **Nacht zum 21.10.:** wieder 04:10–04:45, acht Aufrufe,
  `offen=0`, **33–103 ms**, Median 48 – je Standort: IAD 38/43 wie am Vortag, ATL 33–65, MIA 35,
  **ORD 71/103**; der Anstieg kommt vom Standort, nicht vom Code. **22.10.:** dieselbe Zeit, 79 geprüft,
  29–76 ms, Median 41 (EWR 29–46, ATL 37–52, IAD 76). **Der Store geht in eine GitHub Action** (Entscheidung des
  Nutzers vom 20.10.2026, [16-2-cpu-und-betrieb.md](16-2-cpu-und-betrieb.md)).
- **Gebrauchtpreise – seit 20i eine GitHub Action:** Im Cron lag die Grundlast eines Aufrufs (vier
  Abfragen, Sammlung laden und vorbereiten) schon bei 5–8 ms, jedes Release kostete 3–4 ms mehr (94 ms
  für 20 mit echter D1), und **kein** Cron-Aufruf traf eine warme Instanz (0 von 28 im Minutentakt).
  Verworfen damit auch der Wortindex **als eine Zeile** (Berechnetes, das gespeichert würde). Als
  Action in der Nacht zum 20.10.2026: je Portion von sechs Releases Median 2, P90 4, höchstens 15 ms,
  am 21.10. Median 3, P90 6, höchstens 12, am 22.10. Median 2, P90 4, höchstens 13, am ersten Vorabend
  (23.10.) Median 2, vier von 72 ab 8, höchstens 20 ([7.3](07-3-ebay-betrieb.md)).
- **Die Lage der Markt-Action** (`GET /api/sync/markt/lage`) – 7 ms (IAD, 20.10.), 19 (SEA, 21.10.),
  18 ms (MSP, 22.10.); **untersucht am 22.10.2026**. Sie ist **ein** D1-Aufruf mit drei Anweisungen und
  liest in der Produktion **1 954 Zeilen** (Auswahl 1 473 für 431 Ziele, alle 479 Spieltitel, Sperrliste
  2; im Leerlauf liest die Auswahl 596), Antwort rund 64 KB. Gemessen in einem Messworker mit
  Wegwerf-D1 (DUS, erfundene Zeilen gleicher Form, kalt = erste Anfrage einer frischen Version):
  **910 zurückgegebene Zeilen kosten kalt 3–6, warm 2–5 ms**, 80 Zeilen kalt 3–4, warm 2; dieselbe
  Antwort ohne D1 kalt 2, warm 1. **Teuer ist das Umwandeln der D1-Zeilen, nicht das JSON**; baut
  SQLite das JSON selbst (`json_group_array`, eine Zeile statt 910), sinkt es in DUS um rund 1 ms –
  so groß wie die Streuung zwischen zwei Runden. **Erklärt ist der Wert nur zum Teil:** Der
  Standortfaktor aus dem Leerlauf (SEA rund 1,75 × IAD) macht aus 7 ms rund 12; der Rest ist eine
  **Vermutung** – eine kalte Instanz der Anwendung: Die erste Portion einer frischen Instanz kostete
  10–13 ms (ORD, SEA) statt 2–3, am 20.10. in IAD nur 4, und dort war auch die Lage billig.
  Messworker und Wegwerf-D1 sind gelöscht. **Zurückgestellt** (Entscheidung vom 22.10.2026): eine
  Verbesserung der Markt-Lage (etwa `json_group_array`), bis die Store-Lage gemessen ist – sie hat
  79 statt 910 Zeilen; bleibt sie klar darunter, hängt es an den Zeilen. **Der Vorwärm-Versuch ist
  gestrichen** (Entscheidung vom 23.10.2026): Beide Actions rufen vor der Lage schon „Ausgang begonnen"
  auf – das ist der geplante Vorwärm-Aufruf. Am 22./23.10. trafen beide denselben Standort (IAD, DFW),
  0,3 s nacheinander über dieselbe Verbindung, und die Store-Lage brauchte trotzdem 13 ms in IAD, bei
  **null** fälligen Zeilen (DFW 6). Ob dieselbe Instanz antwortete, zeigt die Telemetry nicht – das
  zeigte sie einem eigens eingebauten Vorwärm-Aufruf ebenso wenig. Die Markt-Lage brauchte am 23.10.
  9 ms in IAD bei 1 954 Zeilen: Weder Zeilen noch Vorwärmen erklären die Streuung; offen.
  **Store-Lage im Probelauf vom 22.10.2026:** 13 ms in IAD bei **79** Zeilen (ein D1-Aufruf, eine
  Abfrage) – die Markt-Lage brauchte dort am 20.10. 7 ms bei 910. **An der Zeilenzahl liegt es also
  nicht** (zum Vorwärmen oben). Portionen der Store-Action: Median 2–3,5, höchstens 9 ms (die jeweils
  erste je Standort), Concept-Route 2 ms. **Erste Abende, 22.10.2026** (beide leer): „Ausgang begonnen"
  7 ms, Lage 13 (IAD) / 6 ms (DFW), **Ausgang „ende" mit drei D1-Aufrufen 6 / 4 ms** – im Budget.
  **Erste Abende mit Arbeit, 23.10.2026:** Markt 23:08 statt 20:17 (2 h 51 zu spät), 431 geprüft in
  72 Portionen, 0 offen, Rückfall 00:47 leer, kein `markt_leer`; Store 23:30 statt 20:47 (2 h 43), 79
  geprüft in acht Portionen (2–23 ms, Median 5), 0 offen, Rückfall 01:07 leer. **Store-Lage 16 ms (ORD)
  bei 79 Zeilen**, im leeren Rückfall 7 (SJC); Markt-Lage 4 ms (IAD) bei 1 954, im Rückfall 4 (LAX);
  Ausgang 4–14 ms. **Beide Lagen werden nur weiter beobachtet**, keine eigene Untersuchung
  (Entscheidung des Nutzers vom 24.10.2026). **Abende des 24.10.:** Markt 22:28 statt 20:17 (2 h 11
  zu spät), 431 geprüft in 72 Portionen (Median 2,5, P90 5, sieben ab 8, höchstens 19 ms, LAX), 0
  offen; Store 22:43 statt 20:47 (1 h 56), 79 geprüft in acht Portionen (2–14 ms), 0 offen; beide
  Rückfälle (00:22 / 00:31) leer, kein `markt_leer`. **Store-Lage 2 ms (MSP) bei 79 Zeilen, im leeren
  Rückfall 11 (EWR)**; Markt-Lage 7 (LAX), im Rückfall 7 (SEA); Ausgang 3–13 ms.
- **IGDB-Auffrischen** (Frist sieben Tage, 50 Spiele je Aufruf, 10.1 Schritt 12) – **erstmals gemessen
  in der Nacht zum 20.10.2026:** neun Aufrufe von 06:05 bis 06:45, **20–54 ms**, Median 34 (MIA 25–28,
  EWR 28, IAD 39, SJC 20, vier ohne Standort 34–54); acht mit Logzeile, darin 370 angefragt und 369
  aktualisiert. Am 21.10. ein Aufruf, 47 Spiele, 28 ms (EWR).
  Einmal je Woche, aber jeder Aufruf über dem Budget; Ursache nicht untersucht. Bleibt im Worker
  (16.2) – ob das so bleibt, ist offen. **Seit 18n** höchstens ⌈Spiele ÷ 200⌉ Aufrufe je Nacht
  ([10.1](10-1-cron-schritte.md) Schritt 12): Das begrenzt, wie viele Aufrufe über dem Budget in einer
  Nacht laufen, nicht ihre Kosten.

