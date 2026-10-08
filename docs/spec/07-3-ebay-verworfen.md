← [Inhaltsverzeichnis](README.md)

### 7.3 Gebrauchtpreise – geprüft und verworfen

#### Geprüft und verworfen: ein Händlerfeed über AWIN

Ein Produktdatenfeed von rebuy und medimops über AWIN war bis zum 02.10.2026 der vorgesehene Weg und ist verworfen – nicht an der Einstiegshürde (5 € Kaution, Bearbeitung binnen eines Werktags, keine Mindestreichweite), sondern an drei Punkten, die nicht zu umgehen sind:

- Das Bewerbungsformular verlangt die **URL, auf der Affiliate Marketing betrieben wird**. Diese Anwendung steht hinter Cloudflare Access, hat keine Öffentlichkeit und soll keine Werbung tragen.
- Den Feed gibt **jeder Händler einzeln** frei – es bräuchte die Partnerschaft mit rebuy *und* medimops, jede mit Prüfung der Seite.
- **AWIN schließt ein Publisher-Konto, dem binnen zwei Jahren keine Provision gutgeschrieben wurde.** Hier wird nie eine gutgeschrieben: Der Zugang hätte ein eingebautes Ablaufdatum gehabt, und mit ihm die Preisspalte und der Physisch-Status, die darauf stehen.

#### Geprüft und verworfen: eBays Aspekt `Spielname`

Der Titelabgleich verfehlt 17 der 197 von IGDB belegten Discs, und die Ursachen sind benennbar: kurze Titel (bei ein bis zwei Inhaltsworten erlaubt die Schwelle nur *ein* fremdes Wort), Jahreszahlen im eigenen Titel („Shadow of the Colossus (2018)") und Abkürzungen („PvZ" gegen „Plants vs. Zombies"). Naheliegend war, statt des Freitext-Titels eBays **strukturierten Aspekt `Spielname`** zu benutzen — `aspect_filter=…,Spielname:{Dishonored}` liefert tatsächlich 317 saubere Treffer, darunter „Dishonored – Die Maske des Zorns", das der Wortabgleich verwirft.

**Gemessen am 02.10.2026 über alle 490 Releases (676 Abfragen) — und verworfen:**

| | Wortabgleich | Aspekt `Spielname` |
|---|---|---|
| Treffer gesamt | **293** | 178 |
| rettet von den 17 verfehlten IGDB-Belegen | — | **2** (davon einer falsch) |
| findet zusätzlich | — | 17 Releases, **rund die Hälfte davon falsch** |

Zwei Gründe. Erstens ist der Aspekt **oft gar nicht gepflegt**: Bei der Mehrzahl der verfehlten Fälle kennt eBay keinen `Spielname`-Wert, und wo einer existiert, scheitert die Zuordnung an denselben Jahreszahlen und Abkürzungen wie beim Titel. Zweitens ist er **verkäufergepflegt wie der Plattform-Aspekt**: „Batman" führt zu *LEGO Batman 3*, „Killzone" zu *Killzone 3*, und „Spiele Auswahl"-Angebote tragen ihn für jedes aufgelistete Spiel – genau die, die der Wortabgleich wegen vieler fremder Worte verwirft. Die Plattformprüfung aus dem Titel bleibt auch dort nötig: Sie fängt zwei Fehlgriffe ab, die der Aspekt allein zurückgebracht hätte (Borderlands 2 und BioShock Infinite, beide PS3-Discs unter dem PS4-Aspekt).

**Was bliebe, wäre ein Zugewinn von rund acht richtigen Treffern bei ebenso vielen falschen** – der falsche Tausch („lieber kein Vorschlag als ein falscher", `scan-titel.ts`). Der eine Fall, den nur der Aspekt löst, ist die deutsche Zweitbezeichnung („Dishonored – Die Maske des Zorns"), zu selten für eine eigene Mechanik.


#### Geprüfte und verworfene Quellen für „nur digital"

Es gibt **keine** Quelle, die eine reine Download-Fassung sicher belegt — geprüft am 02.10.2026:

| Quelle | Befund |
|---|---|
| **Wikidata** `P437` (Vertriebsformat) | **Verworfen.** 48 der 235 durch IGDB belegten Discs führt Wikidata als „nur digital" — **20 % Fehlrate**, darunter Assassin's Creed Unity, Call of Duty: Black Ops III, Apex Legends. Die Eigenschaft wird ergänzt, nicht gepflegt; „nur digital" heißt dort „niemand hat die Disc eingetragen". Dazu gilt sie für das **Spiel über alle Plattformen und Epochen** — bei *Another World* nennt sie „compact disc / floppy disk / ROM cartridge", also den Amiga von 1991 |
| **IGDB** `external_games.media` | Unbrauchbar: Bei den 249 verknüpften Spielen mit unbekannter Disc-Fassung haben **1 447 Händlereinträge gar keinen Wert**, 128 „physisch", 34 „digital". Nur 12 Spiele hätten „digital und kein physisch" |
| **MobyGames** | Die einzige Quelle, die „nur Download" modelliert — seit 2024 kostenpflichtig (9,99 $/Monat), Website hinter einer Cloudflare-Challenge, nie gemessen |

**Der grundsätzliche Grund:** „nur digital" ist keine stabile Tatsache. *Broken Age*, *Donut County* und *Ether One* stehen als digitale Indies, und eBay fand für jedes eine physische Fassung; Limited Run Games hat über 160 solcher Auflagen gemacht und kündigt 20–30 je Zyklus an. Ein 2018 digital-only Titel kann 2024 eine Disc bekommen, ohne dass sich in unseren Daten etwas ändert. Dass `nein` nach Abschnitt 3 ausschließlich der Nutzer setzt, ist deshalb sachlich richtig und kein Behelf.
