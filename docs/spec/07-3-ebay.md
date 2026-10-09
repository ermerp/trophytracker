← [Inhaltsverzeichnis](README.md)

### 7.3 Gebrauchtpreise und Disc-Nachweis aus eBay (Stufe 20)

**Ziel:** Gebrauchtpreise in Lücken und Kaufliste (Use Case 7, Teil 1) und ein automatischer Nachweis, dass es eine Disc gibt.

#### Warum eBay

**rebuy und medimops verkaufen ihren Bestand selbst über eBay** (`rebuy-shop`, `medimops_shop`), und die eBay Browse API läuft seit Stufe 17c live im Worker (5 000 Abfragen am Tag, rund 0,3 s, offizieller Zugang). Dieselben Händler, dieselben Zustandsstufen, dieselben Preise — ohne Affiliate-Vorwand und ohne Ablaufdatum.

**Zwei Abfragen je Release:**

1. `sellers:{rebuy-shop|medimops_shop}` — der gepflegte Händlerpreis.
2. Alle Verkäufer mit `conditionIds:{5000|4000|3000|2750|2500}` — der breite Gebrauchtmarkt als Rückfall.

Angezeigt wird der Händlerpreis zuerst, sonst der Markttreffer (Entscheidung des Nutzers vom 02.10.2026). `market_offer.anbieter` hält fest, wer es ist; daraus entsteht die Beschriftung „ab 12,77 € bei rebuy".

**Die Plattform kommt aus eBays strukturiertem Aspekt**, nicht aus dem Titel: `aspect_filter=categoryId:139973,Plattform:{Sony PlayStation 4}`. rebuy und medimops nennen die Plattform im Titel gar nicht („Bloodborne [Game Of The Year Edition]"); der erste Messlauf fand deshalb 0 von 90 Händlerangeboten. Der Aspekt kennt auch „Keine Angabe" — ein Angebot ohne Plattformangabe fällt heraus, genau wie 7.6 es für jede Fremdquelle verlangt.

**Zwei Fallstricke, beide gemessen und beide im Code beantwortet:**

- Der `filter`-Parameter wird von eBay **stillschweigend ignoriert**, wenn die Klammern nicht URL-kodiert sind — gleiche Trefferzahl, kein Eintrag in `warnings`. Der Client baut die Parameter deshalb über `URLSearchParams`.
- Der Plattform-Aspekt ist **verkäufergepflegt und manchmal falsch** (eine PS3-Disc unter dem PS4-Aspekt). Nennt der Angebotstitel eine *andere* PlayStation-Plattform und nicht auch die eigene, wird er verworfen.

#### Der Titelabgleich ist Pflicht

eBays Relevanzsortierung ist **keine** Zuordnung. Gemessen am 02.10.2026 über alle 490 Releases: Ohne Abgleich wäre der roh günstigste Markttreffer in **21 %** der Fälle ein anderes Spiel gewesen — „Blue Prince" → *Prince of Persia: The Lost Crown*, „Borderlands 2" → *Borderlands: The Handsome Collection*, „Brothers" → *Brothers in Arms*.

Ein Angebot zählt nur, wenn alle sechs Bedingungen zusammenkommen (`guenstigstesGeprueft`, `src/domain/markt.ts`):

1. `sammlungstreffer` aus 17c findet **genau dieses** Spiel und ist eindeutig — der Abgleich läuft von der Sammlung aus, nicht vom Angebotstext.
2. Kein Plattform-Widerspruch im Titel — weder eine der eigenen vier noch eine **fremde** wie PS2, Xbox oder Switch.
3. Das Angebot ist überhaupt ein **Datenträger**, kein Konto und keine Dienstleistung.
4. Bei ein- und zweiwortigen Titeln steht unser Wort **vorn**.
5. Kein fremdes Wort ist eine **blanke Ziffer**, solange unser Titel keine trägt.
6. Höchstens `max(1, n−1)` Worte, die im eigenen Titel nicht vorkommen (`n` = Inhaltsworte des eigenen Titels).

**Die Bedingungen 2 bis 5 stammen aus der Durchsicht der 79 Statuswechsel selbst** (02.10.2026) – fünf Fehlgriffe, von denen keiner in einer Kennzahl sichtbar war ([lehren.md](../lehren.md)):

| Release | Angebot | Ursache |
|---|---|---|
| Journey (PS4) | „Robinson: The Journey" | Einwort-Titel geht in einem längeren auf |
| SteamWorld Dig (PS4) | „SteamWorld Dig 2" | Nachfolger, die Ziffer ist das einzige fremde Wort |
| Metal Gear Solid 2 (PS3) | „Metal Gear Solid 3 PlayStation 2 Ps2" | PS2-Angebot; die Prüfung kannte nur die eigenen vier Plattformen |
| Genshin Impact (PS4) | „Genshin Impact Account", 261 € | kein Datenträger |
| Yakuza Kiwami 2 (PS5) | „… Platinum Trophy Service", 226 € | kein Datenträger |

Die vier Regeln beseitigen alle fünf und kosten dabei **einen** belegten und **vier** unbekannte Treffer (214 → 213 und 79 → 75). Bei Metal Gear Solid 2 wird aus dem Fehlgriff sogar ein Treffer: Nach dem Wegfallen des PS2-Angebots bleibt die HD Collection, auf der das Spiel tatsächlich ist.

Der Preis steht seit Stufe 20e in **Lücken, Kaufliste und am offenen Wunsch** und ist ein **Link auf das Angebot** (`market_offer.url`, in den Views seit Migration 0029). Der Link kann ins Leere führen – ein eBay-Angebot verschwindet, wenn es verkauft ist, und gefragt wird einmal am Tag –, und das `title` des Links sagt es, damit niemand einen Fehler vermutet. Sortiert wird nach ihm mit `sort=preis`, **ohne Preis ans Ende** (5.2); in der Lückenansicht nur für die obere Liste, denn im zweiten Block ist „eBay kennt kein Angebot" die Reihenfolge, die ihn abarbeitbar macht. In den Kacheln von Kauf- und Wunschliste erscheint die Angabe **nur, wenn es einen Preis gibt** – „Gebraucht unbekannt" an jedem der rund 350 Wünsche wäre Lärm. Wo der Preis eine Spalte ist, in der Lückenansicht, steht „unbekannt" ausgeschrieben.

Was bleibt, sind **Bündel**, die das Spiel enthalten („Goat Simulator The Bundle", „Syberia Collection"). Dort ist `ja` richtig — eine Disc existiert —, der Preis gilt aber fürs ganze Paket. Das ist die Asymmetrie aus Abschnitt 6: Ein Bündel belegt die Disc und taugt nicht als Preis.

Die dritte Bedingung ist an fünf Varianten gegen den echten Bestand gemessen. Eine flache Grenze von drei Zusatzworten ließ zwei Fehlgriffe stehen, beide vom selben Muster: Ein kurzer Titel geht in einem längeren fremden auf. „Disc Jam" schrumpft dabei auf ein einziges Wort, weil `disc` in `BALLAST` steht, und passt auf „Monster Jam Steel Titans". Mit der skalierten Grenze bleibt kein bekannter Fehlgriff; sie kostet 7 von 221 belegten und 21 von 100 unbekannten Treffern. Begründung wie in `scan-titel.ts`: lieber kein Vorschlag als ein falscher (Entscheidung des Nutzers vom 02.10.2026).

#### Ableitung von `physical_release_status`

Ein geprüfter Treffer setzt `unbekannt → ja`, `physical_source='ebay'`. Niemals ein `nein`, niemals ein bestehendes `ja` oder `nein` angefasst (Abschnitt 3). Protokolliert wird mit der reservierten Quelle `feed` und `detail='ebay'` (8.5).

**Das Ausbleiben ist der Hinweis für die Gegenrichtung.** Gemessen: Von 235 durch IGDB belegten Discs findet eBay **224 (95 %)**, und nur **8 (3 %)** haben gar kein Angebot in der Plattform-Kategorie. „eBay kennt hier nichts" ist damit ein belastbarer Hinweis auf eine reine Download-Fassung — und betrifft 125 der 255 unbekannten Releases. Er steht in Block B der Lückenansicht (5.3) neben den Ja/Nein-Knöpfen und sortiert ihn; **geschrieben wird `nein` weiterhin nur vom Nutzer.**

#### Die Sortierung in der Oberfläche (Stufe 20e)

Der Gebrauchtpreis ist in allen fünf sortierbaren Listen ein Kriterium; **ohne Preis ans Ende, nie
als 0**. Die Lückenansicht hat dafür überhaupt erst eine Sortierung bekommen. Bedienelement,
Richtung und die Regel „unbekannt bleibt in beiden Richtungen am Ende" stehen in
[5.2](05-1-favorit-und-sortierung.md).

#### Preise, nicht Werte

eBays **verkaufte** Preise sind nicht zu bekommen: `findCompletedItems` ist seit 2020 beschränkt, die Finding API am 05.02.2025 abgeschaltet, und die Marketplace Insights API ist „restricted and not open to new users". Bezahlte Alternativen wurden geprüft und verworfen: PriceCharting (49 $/Monat), Keepa (49 €/Monat), Amazon PA-API (Affiliate-Freigabe **plus** drei Verkäufe in 180 Tagen).

Scrapen ist kein Ausweg, und zwar nicht nur aus Höflichkeit: Nach § 44b UrhG wirkt ein Nutzungsvorbehalt, wenn er maschinenlesbar ist, und die `robots.txt` ist dafür das etablierte Mittel. rebuy sperrt `/kaufen/suchen`, jedes `?q=`/`?query=` und `*/api`; medimops sperrt `?condition=`, `fcIsSearch=` und `FatSearch`; Geizhals sperrt `/games/` ausdrücklich. Gesperrt ist also genau die Suche, die man bräuchte.

Was bleibt, ist eine **Forderung** — „so viel verlangt dieser Anbieter gerade". Die Oberfläche beschriftet sie als „ab X € bei rebuy" bzw. „bei eBay", nie als Wert, und zeigt „unbekannt" statt einer Null (Abschnitt 6 und die Risikozeile zum Händlerpreis).

#### Umfang und Takt

Der Schritt läuft im **Wartungsfenster** (`*/5 6-8`, 36 Aufrufe) — er fasst Sony nicht an. Zwanzig Releases je Aufruf, also zwanzig Fremdanfragen von erlaubten fünfzig (15.4). Gefragt werden **nicht alle** Releases, sondern dieselbe Menge, die 7.4 für die Store-Preise festlegt: was in der Lückenansicht auftaucht oder auf einer offenen Absicht steht. Ein Release wird **täglich** erneut gefragt (`MARKT_FRIST_TAGE = 1` seit Stufe 20e).

**Takt: täglich** (Entscheidung des Nutzers vom 02.10.2026). Nicht, weil Gebrauchtpreise sich täglich bewegen — sie tun es nicht —, sondern weil der Verlauf (20f) und der Preisalarm (20g) Punkte brauchen: Ein gleitender Median ist nur über genügend Werte robust gegen den einzelnen Verkäufer, der eine Disc für drei Euro einstellt, und melden kann ein Alarm nur, was er gesehen hat. Dafür ist das **Wartungsfenster auf drei Stunden** verlängert (`*/5 6-8`, 36 statt 24 Aufrufe) — es fasst Sony nicht an, und drei der fünf erlaubten Cron-Einträge sind weiterhin frei.

**Zwanzig Releases je Aufruf, nicht vierundzwanzig.** Vierzig von fünfzig erlaubten Fremdanfragen lassen zehn Reserve: Läuft das eBay-Token mitten in der Portion ab, kommen eine Token-Anfrage und ein zweiter Versuch dazu. Bei 431 Releases im Zuschnitt sind das rechnerisch 22 Aufrufe; **gemessen am 09.10.2026 waren es 24 von 36**, dazu IGDB (schubweise bis zu neun) und zwei billige Schritte – das Fenster ist damit voll ([10.1](10-1-cron.md)).

**Beide Kanäle kommen in den Verlauf** (`price_snapshot.kanal`, Migration 0030), jeder als eigene Reihe. Ein Händlerpreis bei rebuy oder medimops ist ein Katalogpreis und ändert sich bewusst; der Marktpreis ist das Minimum über die gerade eingestellten Angebote und springt mit jedem neuen. In einer Reihe vermischt wären beide unbrauchbar. `source` sagt weiterhin, **wer** das Angebot stellt — der kann innerhalb eines Kanals wechseln und taugt deshalb nicht als Schlüssel der Reihe. Die **Händlerreihe deckt knapp die Hälfte ab**: 116 von 250 Reihen (46 %, gemessen am 09.10.2026; am 02.10.2026 waren es 84 von 239). Die Glättung muss also die Hauptarbeit tragen, die Händlerbevorzugung ist der Bonus.

#### Wie sich die beiden Reihen bewegen (gemessen am 09.10.2026)

Sechs vollständige Tage im täglichen Takt, 366 Reihen mit Kanal. Gezählt ist jeder Punkt, der
ein **neues Minimum seiner Reihe** war, und wie tief er unter dem bisherigen Tief lag:

| Reihe | Reihen | neue Tiefs | Tiefe: Median | davon < 5 % | davon ≥ 20 % |
|---|---|---|---|---|---|
| gebraucht/händler | 116 | 121 | **3,7 %** | 66 % | 7 % |
| gebraucht/markt | 250 | 113 | **10,0 %** | 31 % | 27 % |
| psn_store | 65 | 17 | **80,0 %** | 0 % | 100 % |

**Die Marktreihe trägt ein Allzeittief, die Händlerreihe nicht von sich aus** – das kehrt die
Vermutung um, die der Entwurf zu 20g zuerst hatte. rebuy und medimops rücken ihren Katalogpreis
um Cents: zwei Drittel ihrer neuen Tiefs sind flacher als 5 %. Der Marktpreis bewegt sich
seltener und tiefer, und die Trefferrate fällt schnell — Anteil der Punkte, die ein neues Tief
sind, nach Position in der Reihe: **42 / 22 / 13 %** (Händler **74 / 66 / 50 %**). Ein reiner
Zufallslauf läge bei 1/n, also 50 / 33 / 25 %; der Marktpreis liegt **darunter**, ist also träge,
und ein spätes Tief ist entsprechend aussagekräftig. Der Store schlägt beide: Alle 17 Tiefs liegen
≥ 20 % unter dem bisherigen, im Median 80 % — das ist eine Rabattaktion.

Der Haken der Marktreihe ist nicht ihre Bewegung, sondern ihre Datenlage: Ein tiefes Markttief ist
genau das Muster eines untauglichen Angebots. Von 111 Releases mit **beiden** Kanälen liegt der
Markttreffer im Median bei 0,82 des Händlerpreises, aber **14 (13 %) unter der Hälfte** — Bündel,
falsche Fassung, Hülle ohne Disc. Deshalb steht die Angebotskorrektur (20h) vor dem Alarm
([16.2](16-2-offene-stufen.md)).

**Ein Aufruf liest 940 Zeilen** (gemessen am 02.10.2026 gegen 430 Listen): 30 für die Auswahl, 430 für die einmal zerlegte Sammlung, 50 fürs Schreiben und 430 für den offenen Zähler. Seit dem täglichen Takt sind es **24 Aufrufe je Nacht, also rund 22 600 Zeilen** — gegen 5 Millionen am Tag; die früheren „rund drei Aufrufe je Nacht“ galten für die abgelöste 14-Tage-Frist. Die erste Fassung las 2 059 je Aufruf, davon **1 549 für vier Zähler, die nur in der Verlaufszeile standen**; sie sind durch einen einzigen ersetzt, und `weiter` kommt jetzt aus der Portionsgröße statt aus einem Zähler. Dieselbe Form wie der `COUNT(*)` in der Feed-Route am 01.10.2026, nur kleiner — und derselbe Grund, warum ein Schreibschritt vollständig gemessen gehört und nicht nur in seiner Hauptabfrage.

Der Stand steht je Zeile in `release.markt_geprueft_am`, nicht als Marke in `app_setting`. Damit gibt es den Fehlerfall aus 18e hier nicht: Ein abgebrochener Lauf lässt die ungeprüften Releases ungestempelt, und der nächste Aufruf nimmt sie wieder — Erfolg und Fehler können keine gemeinsame Marke hinterlassen, weil es keine gibt.

**Keine Rohablage** (Regel in CLAUDE.md): Die Antworten sind klein, die Normalisierung ist Feldkopieren plus Titelabgleich, und jeder Abruf ist jederzeit wiederholbar.

**Drei Wege sind geprüft und verworfen** – ein Händlerfeed über AWIN, eBays strukturierter
Aspekt `Spielname` als Ersatz für den Titelabgleich und drei Quellen für „nur digital".
Die Messungen dazu stehen in [07-3-ebay-verworfen.md](07-3-ebay-verworfen.md), damit sie
nicht noch einmal gemacht werden.
