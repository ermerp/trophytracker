← [Inhaltsverzeichnis](README.md) · [7.3 eBay](07-3-ebay.md)

### 7.3 Wie sich die Preisreihen bewegen (gemessen am 09.10.2026)

Ausgelagert aus [7.3](07-3-ebay.md), weil die Datei sonst über 15 KB läge. Diese Zahlen
tragen den Preisalarm aus 20g ([16.2](16-2-offene-stufen.md)) – sie beschreiben nicht den
laufenden Betrieb, sondern was eine Reihe überhaupt hergibt.

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
