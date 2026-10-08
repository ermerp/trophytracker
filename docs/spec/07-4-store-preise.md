← [Inhaltsverzeichnis](README.md)

### 7.4 PSN Store-Preise (Stufe 21)

Die zweite Hälfte von Use Case 7: was ein Titel **neu digital** kostet, neben dem Gebrauchtpreis aus Stufe 20. Ohne sie ist die Kaufentscheidung einseitig – bei einem reinen Download-Titel gibt es gar keinen Preis, und bei allen anderen fehlt der Vergleichspunkt, gegen den „ab 12,77 € gebraucht" erst etwas bedeutet.

**Nicht vorziehbar** (Entscheidung des Nutzers vom 27.09.2026): Die Preisermittlung braucht eigene Planung, und der Abruf gehört ins PSN-Fenster – dieselbe Abhängigkeit wie 19b.

#### Welcher Endpunkt (gemessen am 02.10.2026)

Welcher Endpunkt es ist, ist gemessen – und die naheliegende Antwort war die falsche.

**GraphQL ist zu.** `web.np.playstation.com/api/graphql/v1/op` ist unauthentifiziert erreichbar, führt aber eine Allowlist: Ein unbekannter Hash antwortet `400 {"message":"Query … not whitelisted"}`, und ein mitgesendeter Query-Text ebenso. Die Hashes sind Apollo-APQ-Prüfsummen über den Query-Text aus Sonys Bundle und rotieren mit jedem Store-Deploy. Als Grundlage für einen Nachtlauf taugt das nicht.

**Die Produktseite trägt den Preis im HTML.** `store.playstation.com/de-de/product/<id>` liefert ihn serverseitig gerendert mit – ohne Anmeldung, ohne User-Agent. Er steht in einem `<script id="env:…" type="application/json">`-Block mit `{args, overrides, cache, translations}`; im `cache` liegen `Concept:`, `Product:` und `GameCTA:`. Gemessen an fünf Seiten liegt der Block bei Byte 56 975 bis 64 668 von 380 998 bis 1 407 018 – **5 bis 14 % der Seite**, und er selbst ist 3,2 bis 7,1 KB groß.

**Rechtlich ohne Vorbehalt:** Die `robots.txt` des Store sperrt genau zwei Pfade, `/chihiro-api/` und `/event/batch`. Die Produktseite ist nicht darunter – anders als bei rebuy, medimops und Geizhals, wo nach § 44b UrhG genau die Suche gesperrt ist, die man bräuchte (7.3). `web.np.playstation.com` liefert gar keine robots.txt (403 von Akamai).

#### Wie gelesen wird

Die Seite wird als **Strom** gelesen: Jeder vollständige Block wird geprüft, und sobald der richtige da ist, bricht der Leser ab (`reader.cancel()`). Gemessen liest er damit **69 292, 81 920 und 69 167 Byte** statt 994 083, 923 747 und 1 407 018 – fünf bis neun Prozent. Die ganze Seite zu parsen wäre gegen die 10-ms-CPU-Grenze unvernünftig; eine Obergrenze von 256 KB fängt den Fall ab, dass Sony das Gerüst umbaut. Ein `Range`-Kopf hilft nicht: Sony beantwortet ihn mit der vollen Seite.

**Keine Rohablage** (Regel in CLAUDE.md): kleiner Abruf, Normalisierung ist Feldkopieren, jede Seite jederzeit wiederholbar – alle drei Merkmale fehlen.

#### Drei Fallen, die erst das Lesen der Zeilen fand

Drei Regeln, die aus dem Lesen der 79 Zeilen entstanden sind – keine davon war in einer Summe zu sehen ([lehren.md](../lehren.md)).

1. **`activeCtaId` ist nicht der Kaufknopf.** Bei Abo-Titeln zeigt er auf die PS-Plus-Werbung. Baldur's Gate 3 kam so mit **0,00 €** heraus, während der Kauf 48,99 € statt 69,99 € kostet – 17 von 57 Titeln waren betroffen. Genommen wird der Knopf mit einem Kauftyp (`ADD_TO_CART`, `BUY_NOW`, `PRE_ORDER`) und `serviceBranding: ["NONE"]`.
2. **Eine Seite trägt zwölf bis vierzehn Blöcke**, einen je Oberflächenbaustein, und mehrere davon einen `ADD_TO_CART` **ohne** Preis. Bei Horizon Forbidden West hat der Block bei 50 111 den Knopf ohne, der bei 62 420 denselben mit Preis. Gesucht wird deshalb der Block, der einen Knopf **mit** Preis **zu diesem Produkt** führt – die Knopf-Kennung enthält die Produkt-Id, und weiter unten auf derselben Seite stehen die anderen Fassungen samt ihren Preisen.
3. **Ein Rückfall ohne Schranke nimmt die Demo.** Für „Resident Evil 7: Biohazard" wählte er das Produkt „Kitchen [demo]" für **0,25 €**. Ein Rückfallkandidat muss jetzt ein *verwandter* Titel sein: ein `titelSchluessel` steckt im anderen.

**Das PS-Plus-Zeichen hängt am Knopftyp, nicht am Feld.** Nur `UPSELL_PS_PLUS_GAME_CATALOG` heißt „im Katalog"; ein Probespiel (`UPSELL_PS_PLUS_TRIAL`, `UPSELL_PS_PLUS_FULL_GAME_TRIAL`) ist keine Mitgliedschaft. `isTiedToSubscription` taugt dafür nicht – bei Mass Effect: Andromeda stand es am Probe-Knopf auf `false`.

#### Die Produkt-Id löst sich selbst auf

`release.psn_product_id` war bei **0 von 490** Releases gefüllt und las sich wie eine Sperre für diese Stufe. Gemessen ist sie keine: Die Id entsteht aus IGDBs Concept-Id und der Concept-Seite des Store.

**IGDB nennt eine Concept-Id.** In `external_games` mit `external_game_source = 36` steht die Id der Store-Seite (`uid`), für **66 von 79** Releases des Zuschnitts. Sie ist regionsunabhängig: IGDB nennt die Adresse mit `/en-us/`, dieselbe Id beantwortet `/de-de/` mit Preisen in Euro. (IGDBs alte Spalte `category` ist abgekündigt und kommt nicht mehr zurück – gefragt wird `external_game_source`.)

**Die Concept-Seite trennt die Plattformen.** Sie listet alle Fassungen eines Spiels mit ihrer Produkt-Id, und die trägt Sonys Titel-Id in der Mitte: `EP9000-`**`CUSA13323_00`**`-GHOSTSHIP0000000`. Das Präfix sagt die Plattform (`CUSA` = PS4, `PPSA` = PS5, `BLES`/`NPEB`/… = PS3, `PCSB`/… = Vita) – der einzige verlässliche Weg, denn die Nebenprodukte tragen im Cache nur `id` und `name`. Horizon Forbidden West hat ein Concept und zwei Preise: PS5 59,99 €, PS4 49,99 €.

Gewählt wird in drei Stufen: **Titelschlüssel** (42 von 57 Treffern; er trägt Editionszusätze bereits weg und verwirft Demos), dann **Sonys `defaultProduct`** (15 weitere, auch bei übersetzten Namen wie „Mittelerde: Schatten des Krieges"), dann ein **Rückfall nur bei verwandtem Namen**. Höchstens drei Produktseiten je Release – Sonys Standardprodukt ist nicht immer käuflich, bei Mass Effect: Andromeda antwortet es mit `UNAVAILABLE`.

**Innerhalb der Treffergruppe gewinnt der kürzeste Name, nicht Sonys Standardprodukt** (Nachtrag 21c). Der Fall, der die Regel erzwang, ist *Outcast: Second Contact*: Das Concept führt „Outcast - Second Contact" für **14,99 €** und „Outcast – Second Contact Deluxe Edition" für **49,99 €**, Sonys `defaultProduct` ist die Deluxe – und weil `titelSchluessel` „deluxe edition" wegträgt, tragen **beide denselben Schlüssel**. Die Regel dahinter: Wer schon weiß, dass alle Kandidaten dasselbe Spiel sind, braucht Sonys Vorschlag nicht mehr – dann ist der schlichteste Name das Basisspiel. Außerhalb der Gruppe bleibt der Standard die beste Auskunft, weil es dort keinen Titelbeleg gibt. Dass die Regel nur greift, wo sie neu auflöst, steht weiter unten.

Der Fehler fällt nur auf, wenn der Zusatz in der Abkürzungsliste von `titelSchluessel` steht: „SnowRunner - 5-Year Anniversary Edition" wird zu „snowrunner 5 year anniversary" und landet gar nicht erst in der Gruppe – deshalb griff dort schon die erste Fassung richtig. **Gegen alle 57 Treffer gemessen: genau ein Fall.**

Das Ergebnis landet in `release.psn_product_id` und ist damit auch **von Hand korrigierbar** (Spieldetail, Punktmenü) – die Regel „Zuordnungen müssen korrigierbar sein" gilt hier wie überall. Der Weg dorthin steht in `game.store_concept_id`; `game.store_concept_am` ist der Stempel „schon gefragt", damit die dreizehn Spiele ohne Store-Eintrag nicht jede Nacht erneut gefragt werden. Nach 30 Tagen wird die Frage wiederholt – IGDB wächst.

#### PS3 und Vita werden gar nicht erst gefragt

Für diese beiden Plattformen führt der Web-Store keine Produktseiten mehr; erreichbar sind sie nur noch an der Konsole. Der Schritt setzt den Befund deshalb **lokal, ohne einen einzigen Abruf** – weder IGDB noch den Store (`OHNE_WEBSTORE`, Nachtrag 21d). Gemessen am 03.10.2026 auf drei Wegen:

| Messung | Ergebnis |
|---|---|
| 30 reine PS3-Spiele der Sammlung → Concept-Id bei IGDB | 2 von 30 |
| Deren Concept-Seiten → Produkte mit PS3-Präfix | **0** – die Seiten führen nur PS4- und PS5-Fassungen |
| 20 reine Vita-Spiele → Concept-Id, davon mit Vita-Produkt | 2 von 20 → **0** |
| Drei echte PS3-Produkt-Ids direkt abgerufen (`EP9000-NPEA00412_00-MOVEFITBUND00001` u. a.) | **alle 302**, in `de-de` wie `en-us` |

Der Befund ist `plattform`, und die Oberfläche sagt „unbekannt" mit der Begründung. Das ist hier keine Lücke, sondern die Auskunft (Abschnitt 3). **Die Nachpflegeliste schliesst diese Plattformen zusätzlich aus**, auch wenn an einem Release noch ein `ohne_id` aus einem Lauf vor 21d steht: Eine Arbeitsliste mit unerledigbaren Posten wird nach zwei Wochen ignoriert – die Lehre aus den offenen Scans (9.3).

#### Zuschnitt und Takt

Gefragt wird **nicht die ganze Sammlung**: offene Absichten (Wunsch- und Kaufliste) und Titel mit `physical_release_status = 'nein'`. **Ausgenommen sind Releases mit einer digitalen Berechtigung `source = 'kauf'`** (Entscheidung des Nutzers vom 02.10.2026): Die besitzt er dauerhaft, der Neupreis hilft dort so wenig wie bei einer Lücke. `plus` schließt nicht aus – ein Katalogtitel ist geliehen und kann morgen aus dem Katalog fallen. Gemessen am 02.10.2026 sind das **79 von 490 Releases**; 87 haben eine offene Absicht, acht davon sind gekauft. `physical_release_status = 'nein'` trägt heute **nichts** bei, weil der Wert ausschließlich vom Nutzer gesetzt wird und noch bei keinem Release steht (Abschnitt 3) – die Menge wächst, sobald Block B der Lückenansicht abgearbeitet ist.

**Takt: täglich**, wie der Gebrauchtpreis seit 20e, und hier mit mehr Grund: Store-Angebote laufen ab. Gemessen standen **18 von 57** Titeln gerade im Angebot, und ein Rabatt, den man zwei Tage später erfährt, ist keiner.

Der Schritt läuft als achter Schritt des **PSN-Fensters** (`*/5 3-5`), aber **außerhalb der Zugangsprüfung**: Es ist Sonys Schnittstelle, sie braucht aber kein Token, und ein abgelaufenes NPSSO darf die Preise nicht stilllegen. Zehn Releases je Aufruf; die Portion ist nach der Zahl der **Fremdanfragen** geschnitten, nicht nach Dauer – beim ersten Mal kostet ein Release bis zu vier (Concept plus bis zu drei Produktseiten), danach genau eine. Der Schritt zählt mit und hört bei vierzig auf, zehn unter den erlaubten fünfzig. Dieselbe Concept-Seite wird innerhalb eines Aufrufs nur einmal geholt – bei einem Cross-Gen-Titel stehen PS4- und PS5-Release beide in der Portion.

Der Stand steht je Zeile in `release.store_geprueft_am`, nicht als Marke in `app_setting`. Damit gibt es den Fehlerfall aus 18e hier nicht: Ein abgebrochener Lauf lässt die ungeprüften Releases ungestempelt, Erfolg und Fehler können keine gemeinsame Marke hinterlassen, weil es keine gibt.

**Ein Aufruf liest 791 Zeilen** (gemessen gegen 430 Listen): 341 für die Auswahl, je zwei für Protokoll und Verlauf eines Releases, 430 für den offenen Zähler.

**Die Auswahl kostete erst den Leerlauf** (Nachtrag 21b, Migration 0032). Die erste Fassung fragte `EXISTS (plan_entry …) OR physical_release_status = 'nein'`. Mit Arbeit war das die billigste Form – 90 Zeilen –, im Leerlauf die teuerste: Weil `physical_release_status` keinen Index trägt, musste SQLite jede der 430 Zeilen anfassen, nur um festzustellen, dass keine fällig war. Der Schritt läuft aber in **jedem** der 36 Aufrufe des PSN-Fensters, und damit stieg dessen Leerlauf von 15 auf 445 gelesene Zeilen und die Nacht um rund 15 000 Zeilen – genau die Art Zuwachs, die Stufe 18e klein gemacht hatte.

Die Zielmenge kommt jetzt als CTE aus zwei Index-Lookups: `plan_entry` liefert seine offenen Einträge, ein **Teilindex** `idx_release_nur_digital` die rein digitalen Releases. Der Teilindex passt hier besser als ein gewöhnlicher: Er enthält nur die Zeilen mit `'nein'` – heute keine einzige –, und ein Index über drei Werte bräuchte dieselbe Arbeit. Gemessen:

| Fassung | mit Arbeit | im Leerlauf | je Nacht |
|---|---|---|---|
| `OR` (erste) | 90 | 430 | 12 760 |
| `IN` + `UNION` | 431 | 4 | 3 560 |
| CTE (gebaut) | 341 | 4 | 2 840 |

Der Leerlauf überwiegt: Der Schritt arbeitet an rund acht der 36 Aufrufe, in den übrigen 28 stellt er nur fest, dass nichts zu tun ist. Deshalb misst `test/lesekosten.spec.ts` seit 21b auch den **Leerlauf** jeder Cron-Abfrage, nicht nur die Fassung mit Arbeit ([lehren.md](../lehren.md)).

**Was dasteht, wenn kein Preis zu holen ist** – die sieben Befunde von `store_befund`, die
Nachpflegeliste an der Glocke und die drei dafür geprüften und verworfenen Ersatzquellen –
und **was der Nutzer sieht**: [07-4-store-befunde.md](07-4-store-befunde.md).
