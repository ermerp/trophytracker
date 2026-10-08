← [Inhaltsverzeichnis](README.md)

### 7.2 Das Matching-Problem

PSN-Trophäentitel lassen sich nicht zuverlässig automatisch auf Releases abbilden: abweichende Editionsnamen, regionale Varianten mit eigener `npCommunicationId`, Cross-Gen-Titel mit geteilter Trophäenliste, Spiele mit mehreren Listen.

**Kein vollautomatisches Matching bauen.** Stattdessen:

1. Vorschlag per normalisiertem Titelvergleich (`src/domain/titel.ts`): Kleinschreibung, Diakritika
   gefaltet, Markenzeichen und Sonderzeichen entfernt, Editions- und Listenzusätze abgeschnitten
2. Eindeutiger Treffer mit hoher Ähnlichkeit → automatisch zuordnen. Konkret: **genau ein** Release,
   dessen Spiel denselben Titelschlüssel trägt und dessen Plattform in der Liste vorkommt, und das
   noch keine Liste trägt. Zwei Kandidaten bedeuten, dass die Entscheidung dem Nutzer gehört
3. Alles andere landet in "nicht zugeordnet"
4. Eigene Oberfläche zum Zuordnen, inklusive Anlegen von Spiel und Release aus dem Trophäeneintrag heraus
5. Einmal gesetzte Zuordnungen sind dauerhaft und werden nie automatisch überschrieben.
   `matched_source` hält fest, ob sie automatisch entstand oder vom Nutzer gesetzt wurde

**Gruppierung.** Trophäenlisten mit gleichem Titelschlüssel werden als *ein* Spiel mit je einem
Release vorgeschlagen – GTA V mit seinen drei Listen wird ein `game` mit drei `release`-Zeilen.
Beanspruchen zwei Listen dieselbe Plattform, werden sie **getrennt** vorgeschlagen: `UNIQUE
(game_id, platform, edition, region)` ließe das nicht zu, und meist sind es tatsächlich
verschiedene Spiele. In den echten Daten trifft es „Call of Duty Modern Warfare" (2019) und
„Call of Duty: Modern Warfare Remastered" (2016), die der Editionsfilter zusammenzieht.

**Geteilte Listen.** 33 der 431 Listen gelten für mehrere Plattformen (`PS3,PSVITA,PS4`). Sony
teilt dort den Fortschritt: Es gibt einen Wert und ein mögliches Platin, und die Antwort verrät
nicht, wo gespielt wurde. Daraus entsteht **ein** Release, dessen Plattform der Nutzer wählt –
vorausgewählt ist die neueste. Ein Release steht für das eigene Exemplar, die Trophäenliste für
Sonys Zählung; beide Releases anzulegen würde Besitz behaupten, den es vielleicht nicht gibt.

**Getrennte Listen sind unabhängig.** Hotline Miami 2 hat eine PS5-Liste bei 82 % und eine
`PS3,PSVITA,PS4`-Liste bei 3 %. Mehrfaches Platin ist damit möglich und wird getrennt geführt.

**Die Trophäenstruktur ist ein Signal, kein Beweis.** Ein portiertes Spiel behält seine Liste, ein
Remake bekommt eine neue. Gemessen an der Sammlung trennt das zuverlässig: Shadow of the Colossus
PS3 18/6/6/1 gegen PS4 25/7/5/1, Uncharted PS3 36/8/3/1 gegen PS4 41/8/4/1 — jeweils verschiedene
Spiele. Aber GTA V hat PS3 47/8/3/1 und PS4/PS5 59/15/3/1, weil die neueren Fassungen
Online-Trophäen brachten, und ist trotzdem ein Spiel. Abweichungen erzeugen deshalb einen
**Hinweis**, keine Trennung.

**„Remastered" und „Remake" werden nicht abgeschnitten**, Editionszusätze schon. Grund aus den
Daten: 20 Titel tragen „Remastered" und sind eigenständige Spiele mit eigener Liste. Dagegen haben
„BioShock Infinite" (PS3) und „BioShock Infinite: The Complete Edition" (PS4) exakt dieselbe
Struktur 55/24/1/1 — dasselbe Spiel mit DLC.

**Zuordnungen sind korrigierbar.** `PATCH /api/games/:id` benennt um,
`POST /api/games/release/:id/abtrennen` löst ein Release in ein neues Spiel heraus. Das sind die
einzigen Stellen, die eine bestehende Zuordnung verändern — auf ausdrückliche Anweisung des
Nutzers. Die Regel, dass **kein automatischer Prozess** eine Zuordnung überschreibt, bleibt
unberührt.

Dieselbe Regel gilt für `market_offer` → `release`.
