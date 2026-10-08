← [Inhaltsverzeichnis](README.md)

### 7.4 PSN Store-Preise – Befunde und Anzeige

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

**Eine Weiterleitung ist eine Antwort, kein Fehlschlag** (Nachtrag 21e). Ergäben `302` und „Seite da, aber nicht lesbar" denselben Befund `unlesbar`, versuchte es der Nachtlauf endlos, weil `unlesbar` absichtlich nicht stempelt – bei *Dying Light* (Concept `201129`, der deutsche Store antwortet mit `302`) blieb das Release so **fünf Nächte** hintereinander ungestempelt. Ein `302` auf die Concept-Seite ist deshalb ein `ohne_id` – endgültig, gestempelt, und in der Nachpflegeliste, wo es hingehört. `unlesbar` bleibt dem Fall vorbehalten, der wirklich einen zweiten Versuch verdient. **`ohne_id` heißt seither „kein *brauchbarer* Store-Eintrag bekannt"** und deckt beides ab: IGDB kennt keinen, oder der genannte führt ins Leere.

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

**Eine gespeicherte Produkt-Id wird nicht erneut aufgelöst** – das ist der billige Weg (eine Anfrage statt bis zu vier), hat aber eine Folge: **Eine Änderung an der Auswahlregel erreicht nur, was danach frisch aufgelöst wird.** Die Korrektur aus 21c hat *Outcast: Second Contact* deshalb nicht von selbst eingeholt – dort stand weiter die Deluxe Edition ([lehren.md](../lehren.md)). Der Weg dafür ist das Feld im Spieldetail: **Leeren setzt die Zuordnung zurück und löst sofort neu auf** (seit 21e im selben Zug, vorher wäre sie bis zum nächsten Morgen stumm geblieben).

Sale-Preise tragen `is_sale = 1` im Verlauf, damit ein Rabattzeitraum ihn nicht verfälscht; `store_is_sale` ist dabei nicht geraten, sondern `discountedValue < basePriceValue`.

#### Was der Nutzer sieht

Beide Kanäle stehen **nebeneinander mit ihrer Bezeichnung** und werden nie zu einem Wert verrechnet (Abschnitt 6): „Gebraucht: ab 12,52 € bei rebuy" und „Digital 32,43 €". Im Angebot kommt der Grundpreis dazu („Digital 8,93 € statt 25,54 €") – ein Rabatt bedeutet nur gegen seinen Ausgangswert etwas. **Der Link umfasst nur den Preis**, nicht das „statt": Im Bild lief die Unterstreichung sonst über beide Zahlen und las sich wie ein zweiter Preis zum Anklicken.

„im PS Plus-Katalog" steht als **Beschriftung** daneben, nie als gezeichnetes Zeichen – ein gemaltes „PS+" wäre ein Monogramm (Abschnitt 13).

**Sonys Produktname steht da, wo er abweicht** – und nur dort. Gemessen heißt das Produkt in 20 von 57 Fällen anders: mal nur die deutsche Fassung, mal wirklich eine andere („NieR: Automata Game of the YoRHa Edition"). Den Unterschied kann nur der Nutzer bewerten, also bekommt er ihn zu sehen, statt dass der Preis vorgibt, zum eigenen Titel zu gehören. **In den Listen bleibt er weg**: Im Bild bei 360 px machte er aus einer Kachelzeile drei, und in einer 171 px breiten Kachel ist das zu teuer für einen Hinweis, der erst beim Vergleichen nützt. Im Spieldetail steht er voll da.

Sortiert wird **nicht** nach dem Store-Preis (Entscheidung des Nutzers vom 02.10.2026): Zwei Preissortierungen in einem Menü wären bei 360 px unübersichtlich.
