← [Inhaltsverzeichnis](README.md)

### 7.4 PSN Store-Preise (Stufe 21)

Die zweite Hälfte von Use Case 7: was ein Titel **neu digital** kostet, neben dem Gebrauchtpreis aus Stufe 20. Ohne sie ist die Kaufentscheidung einseitig – bei einem reinen Download-Titel gibt es gar keinen Preis, und bei allen anderen fehlt der Vergleichspunkt, gegen den „ab 12,77 € gebraucht" erst etwas bedeutet.

**Nicht vorziehbar** (Entscheidung des Nutzers vom 27.09.2026): Die Preisermittlung braucht eigene Planung, und der Abruf gehört ins PSN-Fenster – dieselbe Abhängigkeit wie 19b.

#### Welcher Endpunkt (gemessen am 02.10.2026)

Dieser Abschnitt sagte bis Version 71 nur „über die Katalog-Endpunkte des Store". Welche das sind, ist jetzt gemessen – und die naheliegende Antwort war die falsche.

**GraphQL ist zu.** `web.np.playstation.com/api/graphql/v1/op` ist unauthentifiziert erreichbar, führt aber eine Allowlist: Ein unbekannter Hash antwortet `400 {"message":"Query … not whitelisted"}`, und ein mitgesendeter Query-Text ebenso. Die Hashes sind Apollo-APQ-Prüfsummen über den Query-Text aus Sonys Bundle und rotieren mit jedem Store-Deploy. Als Grundlage für einen Nachtlauf taugt das nicht.

**Die Produktseite trägt den Preis im HTML.** `store.playstation.com/de-de/product/<id>` liefert ihn serverseitig gerendert mit – ohne Anmeldung, ohne User-Agent. Er steht in einem `<script id="env:…" type="application/json">`-Block mit `{args, overrides, cache, translations}`; im `cache` liegen `Concept:`, `Product:` und `GameCTA:`. Gemessen an fünf Seiten liegt der Block bei Byte 56 975 bis 64 668 von 380 998 bis 1 407 018 – **5 bis 14 % der Seite**, und er selbst ist 3,2 bis 7,1 KB groß.

**Rechtlich ohne Vorbehalt:** Die `robots.txt` des Store sperrt genau zwei Pfade, `/chihiro-api/` und `/event/batch`. Die Produktseite ist nicht darunter – anders als bei rebuy, medimops und Geizhals, wo nach § 44b UrhG genau die Suche gesperrt ist, die man bräuchte (7.3). `web.np.playstation.com` liefert gar keine robots.txt (403 von Akamai).

#### Wie gelesen wird

Die Seite wird als **Strom** gelesen: Jeder vollständige Block wird geprüft, und sobald der richtige da ist, bricht der Leser ab (`reader.cancel()`). Gemessen liest er damit **69 292, 81 920 und 69 167 Byte** statt 994 083, 923 747 und 1 407 018 – fünf bis neun Prozent. Die ganze Seite zu parsen wäre gegen die 10-ms-CPU-Grenze unvernünftig; eine Obergrenze von 256 KB fängt den Fall ab, dass Sony das Gerüst umbaut. Ein `Range`-Kopf hilft nicht: Sony beantwortet ihn mit der vollen Seite.

**Keine Rohablage** (Regel in CLAUDE.md): kleiner Abruf, Normalisierung ist Feldkopieren, jede Seite jederzeit wiederholbar – alle drei Merkmale fehlen.

#### Drei Fallen, die erst das Lesen der Zeilen fand

Jede Kennzahl sprach für den ersten Entwurf; die Fehler standen in keiner Summe.

1. **`activeCtaId` ist nicht der Kaufknopf.** Bei Abo-Titeln zeigt er auf die PS-Plus-Werbung. Baldur's Gate 3 kam so mit **0,00 €** heraus, während der Kauf 48,99 € statt 69,99 € kostet – 17 von 57 Titeln waren betroffen. Genommen wird der Knopf mit einem Kauftyp (`ADD_TO_CART`, `BUY_NOW`, `PRE_ORDER`) und `serviceBranding: ["NONE"]`.
2. **Eine Seite trägt zwölf bis vierzehn Blöcke**, einen je Oberflächenbaustein, und mehrere davon einen `ADD_TO_CART` **ohne** Preis. Bei Horizon Forbidden West hat der Block bei 50 111 den Knopf ohne, der bei 62 420 denselben mit Preis. Gesucht wird deshalb der Block, der einen Knopf **mit** Preis **zu diesem Produkt** führt – die Knopf-Kennung enthält die Produkt-Id, und weiter unten auf derselben Seite stehen die anderen Fassungen samt ihren Preisen.
3. **Ein Rückfall ohne Schranke nimmt die Demo.** Für „Resident Evil 7: Biohazard" wählte er das Produkt „Kitchen [demo]" für **0,25 €**. Ein Rückfallkandidat muss jetzt ein *verwandter* Titel sein: ein `titelSchluessel` steckt im anderen.

**Das PS-Plus-Zeichen hängt am Knopftyp, nicht am Feld.** Nur `UPSELL_PS_PLUS_GAME_CATALOG` heißt „im Katalog"; ein Probespiel (`UPSELL_PS_PLUS_TRIAL`, `UPSELL_PS_PLUS_FULL_GAME_TRIAL`) ist keine Mitgliedschaft. `isTiedToSubscription` taugt dafür nicht – bei Mass Effect: Andromeda stand es am Probe-Knopf auf `false`.

#### Die Produkt-Id löst sich selbst auf

Die alte Vorbedingung lautete: `release.psn_product_id`, „beim Trophäen-Matching oder manuell gepflegt". Sie war bei **0 von 490** Releases gefüllt und las sich wie eine Sperre. Gemessen ist sie keine.

**IGDB nennt eine Concept-Id.** In `external_games` mit `external_game_source = 36` steht die Id der Store-Seite (`uid`), für **66 von 79** Releases des Zuschnitts. Sie ist regionsunabhängig: IGDB nennt die Adresse mit `/en-us/`, dieselbe Id beantwortet `/de-de/` mit Preisen in Euro. (IGDBs alte Spalte `category` ist abgekündigt und kommt nicht mehr zurück – gefragt wird `external_game_source`.)

**Die Concept-Seite trennt die Plattformen.** Sie listet alle Fassungen eines Spiels mit ihrer Produkt-Id, und die trägt Sonys Titel-Id in der Mitte: `EP9000-`**`CUSA13323_00`**`-GHOSTSHIP0000000`. Das Präfix sagt die Plattform (`CUSA` = PS4, `PPSA` = PS5, `BLES`/`NPEB`/… = PS3, `PCSB`/… = Vita) – der einzige verlässliche Weg, denn die Nebenprodukte tragen im Cache nur `id` und `name`. Horizon Forbidden West hat ein Concept und zwei Preise: PS5 59,99 €, PS4 49,99 €.

Gewählt wird in drei Stufen: **Titelschlüssel** (42 von 57 Treffern; er trägt Editionszusätze bereits weg und verwirft Demos), dann **Sonys `defaultProduct`** (15 weitere, auch bei übersetzten Namen wie „Mittelerde: Schatten des Krieges"), dann ein **Rückfall nur bei verwandtem Namen**. Höchstens drei Produktseiten je Release – Sonys Standardprodukt ist nicht immer käuflich, bei Mass Effect: Andromeda antwortet es mit `UNAVAILABLE`.

**Innerhalb der Treffergruppe gewinnt der kürzeste Name, nicht Sonys Standardprodukt** (Nachtrag 21c, Befund aus der Abnahme am 03.10.2026). Der erste Entwurf hatte es umgekehrt, und bei *Outcast: Second Contact* kostete das den Faktor 3,3: Das Concept führt „Outcast - Second Contact" für **14,99 €** und „Outcast – Second Contact Deluxe Edition" für **49,99 €**, Sonys `defaultProduct` ist die Deluxe – und weil `titelSchluessel` „deluxe edition" wegträgt, tragen **beide denselben Schlüssel**. Die Regel dahinter: Wer schon weiß, dass alle Kandidaten dasselbe Spiel sind, braucht Sonys Vorschlag nicht mehr – dann ist der schlichteste Name das Basisspiel. Außerhalb der Gruppe bleibt der Standard die beste Auskunft, weil es dort keinen Titelbeleg gibt.

Der Fehler fällt nur auf, wenn der Zusatz in der Abkürzungsliste von `titelSchluessel` steht: „SnowRunner - 5-Year Anniversary Edition" wird zu „snowrunner 5 year anniversary" und landet gar nicht erst in der Gruppe – deshalb griff dort schon die erste Fassung richtig. **Gegen alle 57 Treffer gemessen: genau ein Fall.** Gefunden hat ihn der Nutzer beim Durchsehen der Liste, nicht die Messung.

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

**Die Auswahl kostete erst den Leerlauf** (Nachtrag 21b, Migration 0032). Die erste Fassung fragte `EXISTS (plan_entry …) OR physical_release_status = 'nein'`. Mit Arbeit war das die billigste Form – 90 Zeilen –, im Leerlauf die teuerste: Weil `physical_release_status` keinen Index trägt, musste SQLite jede der 430 Zeilen anfassen, nur um festzustellen, dass keine fällig war. Der Schritt läuft aber in **jedem** der 36 Aufrufe des PSN-Fensters, und damit stieg dessen Leerlauf von 15 auf 445 gelesene Zeilen und die Nacht von rund 54 000 auf 69 444 – genau die Zahl, die Stufe 18e klein gemacht hatte.

Die Zielmenge kommt jetzt als CTE aus zwei Index-Lookups: `plan_entry` liefert seine offenen Einträge, ein **Teilindex** `idx_release_nur_digital` die rein digitalen Releases. Der Teilindex passt hier besser als ein gewöhnlicher: Er enthält nur die Zeilen mit `'nein'` – heute keine einzige –, und ein Index über drei Werte bräuchte dieselbe Arbeit. Gemessen:

| Fassung | mit Arbeit | im Leerlauf | je Nacht |
|---|---|---|---|
| `OR` (erste) | 90 | 430 | 12 760 |
| `IN` + `UNION` | 431 | 4 | 3 560 |
| CTE (gebaut) | 341 | 4 | 2 840 |

Der Leerlauf überwiegt: Der Schritt arbeitet an rund acht der 36 Aufrufe, in den übrigen 28 stellt er nur fest, dass nichts zu tun ist. **Gefunden hat das die Lesekosten-Messung unmittelbar nach dem Deploy** – der Test maß bis dahin nur die Abfrage mit Arbeit, nicht den Leerlauf, und das ist dieselbe Lücke wie am 01.10.2026 beim Feed: Wer eine Route misst, zählt alles, was sie tut.

#### Was ohne Preis dasteht

`release.store_befund` sagt, **warum** – und zwar unterscheidbar, nicht als Boolean (Abschnitt 3). Von 79 Releases am 02.10.2026:

| Befund | Zahl | Bedeutung |
|---|---|---|
| `preis` | 57 | Ein Kaufknopf mit Preis |
| `ohne_id` | 13 | IGDB kennt keinen Store-Eintrag (darunter alle vier PS3-Titel) |
| `delistet` | 4 | Der Store führt kein Produkt mehr (`products: []`, die Seite schreibt „Angekündigt") |
| `fremd` | 3 | Kein Produkt für diese Plattform |
| `regional` | – | Der deutsche Store führt den Titel nicht, ein anderer schon (21f) |
| `unlesbar` | 1 | Seite nicht lesbar – **stempelt nicht**, der nächste Lauf nimmt das Release wieder |
| `ohne_kauf` | – | Produkt da, aber `UNAVAILABLE` |

**`ohne_id` heißt „IGDB kennt den Store-Eintrag nicht", nicht „der Store hat das Spiel nicht".** Am 03.10.2026 am Beispiel *Assassin's Creed III Remastered* nachgemessen: IGDB führt zu diesem Spiel sechzehn `external_games` – vierzehn Amazon-Artikelnummern, einen Microsoft-Store- und einen Twitch-Eintrag –, aber **keinen mit Quelle 36**. Der deutsche Store führt den Titel sehr wohl, unter Concept 231856 und `EP0001-CUSA11560_00-AC3GAMEPS4000001`, für 9,99 € statt 39,99 € und im PS-Plus-Katalog. Es ist also eine Lücke in IGDB, keine im Store.

**Geprüft und verworfen: drei automatische Ersatzquellen** (03.10.2026). Die Frage „lässt sich die Lücke umgehen?" ist gemessen beantwortet, damit sie nicht in einem halben Jahr erneut gestellt wird:

| Weg | Ergebnis |
|---|---|
| Eine andere `external_game_source` bei IGDB mit Store-Adresse | **keine** – nur Quelle 36 führt welche |
| Die Concept-Id des **Elternspiels** (`parent_game`, `version_parent`) | 3 von 13 – und beim DLC *Return to Jurassic Park* ergäbe das den Preis des **Hauptspiels**, also einen falschen. Belastbar wären 2, mit Fehlgriffrisiko |
| Sonys eigene Spielseiten `playstation.com/de-de/games/<slug>/` | **1 von 13** – elfmal `404`, weil IGDBs Slug nicht Sonys Slug ist, einmal Seite ohne Store-Link |
| Sonys Titel-Id aus `psn_played_title` | Die Produkt-Id braucht zusätzlich das 16-stellige SKU-Stück, das daraus nicht ableitbar ist; von dreizehn Fällen hätte ohnehin nur einer überhaupt eine Titel-Id |

Dazu kommt eine rechtliche Schranke: Die Suche auf `playstation.com` sperrt die `robots.txt` ausdrücklich (`Disallow: */search/?q*`) – dieselbe Lage wie bei rebuy, medimops und Geizhals (7.3), und Sonys Store-Suche liegt ohnehin hinter der Allowlist.

**Was stattdessen greift, ist Sichtbarkeit statt Verhinderung** (Nachtrag 21d). Verhindern lässt sich die Lücke nicht, sie sitzt in fremden Daten. Drei Dinge sorgen dafür, dass sie nicht still bleibt:

- **Ein neuer Eintrag wird zuerst geprüft, nicht zuletzt.** Die Auswahl sortiert nach `store_geprueft_am`, und ein nie geprüftes Release trägt `NULL` – das steht in SQLite aufsteigend vorn. Wer heute einen Wunsch anlegt, hat am nächsten Morgen entweder einen Preis oder einen Befund.
- **Die 30-Tage-Nachfrage holt nach.** Trägt jemand den Store-Eintrag bei IGDB nach, erscheint der Preis von selbst und der Posten verschwindet.
- **Der Befund steht an der Glocke**, als Information neben Prüfliste und IGDB-Zuordnung: „*n* Einträge haben keinen Store-Eintrag." Dahinter liegt die Nachpflegeliste im Einstellungen-Block „Store-Preise" – Titel, Plattform und ein Feld für die aus dem Browser kopierte Adresse.

**Eingefügt wird die Adresse, nicht die Id** (`storeAdresse`, `src/domain/store.ts`). Erlaubt sind die Produkt- und die Concept-Adresse in jeder Sprachfassung sowie die blosse Id; alles andere wird mit `400` abgewiesen statt geraten – an der Id hängt der Preis, und ein falscher wäre schlimmer als keiner. Die beiden Formen tun Verschiedenes: Eine **Produkt**-Id hängt am Release und gilt für eine Plattform, eine **Concept**-Id am Spiel und löst bei einem Cross-Gen-Titel beide Fassungen auf einmal auf.

**Gespeichert wird und der Preis kommt im selben Aufruf** (`POST /api/sync/store/:releaseId`). Das ist kein Komfort, sondern Voraussetzung: Die Tagesfrist steht auf dem Release, der Portionsweg überspränge es, und die Zeile bliebe bis zum nächsten Morgen stumm. Dieselbe Lücke war am 03.10.2026 schon einmal spürbar, als sich der falsche Outcast-Preis nach der Korrektur nicht erneuern liess. Die Route ist derselbe Weg wie im Nachtlauf, nur mit einer einelementigen Portion – damit kann die Auswahlregel nicht auseinanderlaufen. Die Zuordnung von Hand läuft über `releaseAendern` und steht deshalb mit Quelle **`nutzer`** im Protokoll (8.5); der Preisschritt schreibt dann kein zweites Ereignis, weil die Id schon stimmt.

Jeder Befund außer `unlesbar` stempelt und räumt einen alten Preis weg: Ein Titel, den der Store nicht mehr führt, hat keinen Preis mehr, und der letzte wäre eine Lüge. `psn_product_id` bleibt dabei stehen – sie ist eine Zuordnung und wird von keinem automatischen Prozess zurückgenommen.

**Eine Weiterleitung ist eine Antwort, kein Fehlschlag** (Nachtrag 21e). Bis dahin ergaben `302` und „Seite da, aber nicht lesbar" denselben Befund `unlesbar` – und weil der absichtlich nicht stempelt, versuchte es der Nachtlauf endlos. Genau das ist passiert: IGDB nennt für *Dying Light* das Concept `201129`, der deutsche Store antwortet darauf mit `302`, und das Release blieb **fünf Nächte** hintereinander ungestempelt. Jetzt ist ein `302` auf die Concept-Seite ein `ohne_id` – endgültig, gestempelt, und in der Nachpflegeliste, wo es hingehört. `unlesbar` bleibt dem Fall vorbehalten, der wirklich einen zweiten Versuch verdient. **`ohne_id` heißt seither „kein *brauchbarer* Store-Eintrag bekannt"** und deckt beides ab: IGDB kennt keinen, oder der genannte führt ins Leere.

**Ein `302` kann an der Region liegen, nicht am Spiel** (Nachtrag 21f). Antwortet die Concept-Seite in `de-de` nicht, fragt der Schritt **einmal** in `en-gb` nach. Kennt der dortige Store Produkte, ist der Befund `regional` statt `ohne_id`: Der deutsche Store führt den Titel nicht, ein anderer schon. Gemessen am 08.10.2026 an *Dying Light* – `302` in `de-de` **und** `at-de`, `200` mit drei Produkten in `en-gb`, `en-us` und `fr-fr`; alle drei Produkt-Ids ebenso. Für die deutschsprachigen Stores gibt es den Titel schlicht nicht.

Das ist aus zwei Gründen eine eigene Kategorie. Erstens gibt es **nichts nachzutragen** – die Zeile gehört damit so wenig in die Nachpflegeliste wie ein PS3-Titel, und ohne die Unterscheidung stünde dort ein Posten, an dem niemand arbeiten kann (dieselbe Lehre wie 17d). Zweitens ist es für den Nutzer die **interessantere Auskunft**: Wer ungeschnittene Fassungen sucht, will wissen, wo ein Titel hier fehlt. Das Spieldetail sagt schlicht „im deutschen Store nicht erhältlich" (Wunsch des Nutzers vom 08.10.2026 – kürzer ist hier besser, den Rest sagt der Link) und verlinkt die britische Seite – **ohne deren Preis**, denn der steht in Pfund, und zwei Währungen nebeneinander wären zwei Zahlen, von denen niemand weiß, welche gilt (dieselbe Linie wie bei den zwei Preiskanälen in Abschnitt 6).

**Geprüft und verworfen: eine Quelle für „geschnitten oder ungeschnitten"** (08.10.2026, Wunsch des Nutzers – er will grundsätzlich die ungeschnittenen Fassungen). Es gibt keine, die wir benutzen dürfen oder die die Frage beantwortet:

| Quelle | Befund |
|---|---|
| schnittberichte.com – die kanonische deutsche Datenbank | **Sperrt `ClaudeBot` und `anthropic-ai` ausdrücklich** in der `robots.txt`, dazu `GPTBot`, `CCBot` und weitere. Ein maschinenlesbarer Nutzungsvorbehalt gegen genau diese Verwendung – dieselbe Linie wie bei rebuy, medimops und Geizhals (7.3) |
| USK | Bewertet die **eingereichte** Fassung und sagt nicht, ob sie gekürzt ist. Beantwortet die Frage also gar nicht |
| Wikidata | Für die einfachere Eigenschaft „Vertriebsformat" schon mit 20 % Fehlrate gemessen (7.3); für Schnittfassungen deutlich dünner |

Was bleibt, ist das Store-Signal selbst – und gemessen über die **ganze** Sammlung trägt es genau einen Fall: Von 357 Spielen mit PS4/PS5-Release haben 319 eine Concept-Id, davon sind **315 in `de-de` erreichbar, 4 nirgends und genau eines nur anderswo** (Dying Light). Eine eigene Maschinerie für „geschnitten" lohnt dafür nicht; der Befund `regional` zeigt den Fall bereits an und fängt künftige im Zuschnitt von selbst.

**Die Grenze dieses Signals gehört dazu:** Es misst nur, was der Web-Store führt, also **PS4 und PS5**. Für PS3 und Vita gibt es gar keine Seiten (21d) – und das sind die Jahrgänge, in denen deutsche Schnittfassungen am häufigsten waren. Dort sagt das Signal nichts, und es tut auch nicht so.

**Gemessen, wie selten das ist:** Von neun Releases ohne Preis am 08.10.2026 war **genau eines** regional. Die vier `delistet` führen auch in `en-gb` null Produkte, die vier `fremd` dieselben wie hier. Die Gegenprobe kostet deshalb eine Anfrage im Ausnahmefall, nicht im Regelfall.

**„Im PS-Plus-Katalog" überlebt einen fehlenden Kaufknopf** (Nachtrag 21e). *Shadow of the Tomb Raider* wird einzeln nicht mehr verkauft – die Produktseite trägt nur einen `UPSELL_PS_PLUS_GAME_CATALOG`. Der Befund ist richtig `ohne_kauf`, aber die Auskunft „liegt in deinem Katalog" ist für eine Kaufentscheidung **mehr wert als der fehlende Preis** und ging vorher verloren. `store_plus` wird deshalb auch ohne Preis gesetzt, und die Zeile lautet „Digital: im Store, aber nicht einzeln käuflich · im PS Plus-Katalog".

**Eine gespeicherte Produkt-Id wird nicht erneut aufgelöst** – das ist der billige Weg (eine Anfrage statt bis zu vier), hat aber eine Folge, die am 03.10.2026 übersehen wurde: Eine Änderung an der **Auswahlregel** erreicht nur, was danach frisch aufgelöst wird. Die Korrektur aus 21c hat *Outcast: Second Contact* deshalb **nicht** eingeholt; dort stand weiter die Deluxe Edition, und mein Satz „der Nachtlauf schreibt den Wert heute Nacht selbst um" war falsch. Der Weg dafür ist das Feld im Spieldetail: **Leeren setzt die Zuordnung zurück und löst sofort neu auf** (seit 21e im selben Zug, vorher wäre sie bis zum nächsten Morgen stumm geblieben).

Sale-Preise tragen `is_sale = 1` im Verlauf, damit ein Rabattzeitraum ihn nicht verfälscht; `store_is_sale` ist dabei nicht geraten, sondern `discountedValue < basePriceValue`.

#### Was der Nutzer sieht

Beide Kanäle stehen **nebeneinander mit ihrer Bezeichnung** und werden nie zu einem Wert verrechnet (Abschnitt 6): „Gebraucht: ab 12,52 € bei rebuy" und „Digital 32,43 €". Im Angebot kommt der Grundpreis dazu („Digital 8,93 € statt 25,54 €") – ein Rabatt bedeutet nur gegen seinen Ausgangswert etwas. **Der Link umfasst nur den Preis**, nicht das „statt": Im Bild lief die Unterstreichung sonst über beide Zahlen und las sich wie ein zweiter Preis zum Anklicken.

„im PS Plus-Katalog" steht als **Beschriftung** daneben, nie als gezeichnetes Zeichen – ein gemaltes „PS+" wäre ein Monogramm (Abschnitt 13).

**Sonys Produktname steht da, wo er abweicht** – und nur dort. Gemessen heißt das Produkt in 20 von 57 Fällen anders: mal nur die deutsche Fassung, mal wirklich eine andere („NieR: Automata Game of the YoRHa Edition"). Den Unterschied kann nur der Nutzer bewerten, also bekommt er ihn zu sehen, statt dass der Preis vorgibt, zum eigenen Titel zu gehören. **In den Listen bleibt er weg**: Im Bild bei 360 px machte er aus einer Kachelzeile drei, und in einer 171 px breiten Kachel ist das zu teuer für einen Hinweis, der erst beim Vergleichen nützt. Im Spieldetail steht er voll da.

Sortiert wird **nicht** nach dem Store-Preis (Entscheidung des Nutzers vom 02.10.2026): Zwei Preissortierungen in einem Menü wären bei 360 px unübersichtlich.
