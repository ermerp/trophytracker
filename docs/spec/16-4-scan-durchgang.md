← [Inhaltsverzeichnis](README.md) · [16.4 Finale Stufen](16-4-finale-stufen.md)

## 16.4 Finale Stufe 1 – der Scan-Durchgang (ab 28.11.2026)

**Stand 28.11.2026:** Scanner gebaut und deployt in f1g (Karten je Fall, Ton/Vibration, letzte Scans), f1h (Collection-Disc als Exemplar je Spiel mit gleichem Code, Abschnitt 3) und f1i (IGDB-Bundle in Fall 3), [9.1](09-1-scanner-am-handy.md). Durchgang: PS3, PS4, PS5 und Vita gescannt (46 / 40 / 19 / 7 Discs), **offen sind die fünf Collections** (drei PS3: God of War, Metal Gear Solid Legacy, Far Cry Wild Expedition – die falsch angelegten Collection-Spiele und die codelose Disc an God of War II hat der Nutzer gelöscht –, zwei PS4). Von den zwölf alten Codes in `unresolved_scan` sind **zwei** übrig. **Nächster Schritt:** nach den Collections die zwei Codes lesend auflisten und mit dem Nutzer durchgehen, dann `unresolved_scan` in zwei Deployments entfernen, dann der Prüfbericht.

**Befunde aus dem Durchgang, offen:**

1. Der Abgleich übergeht eine Zahl im eBay-Titel – „Call of Duty 4 Modern Warfare" traf „Call of Duty Modern Warfare" (2019), CoD 4 stand gar nicht in der Sammlung; ein Fall, erst bei einem zweiten messen (9.3).
2. Baldur's Gate III steht in „Letzte Scans" als „abgebrochen", obwohl Disc und Mapping richtig angelegt sind – nicht belegt, ein erneuter Scan klärt es.
3. `.nav` ist content-box: auf dem Gerät 99 px statt 81, `main` hält unten 89 frei.
4. `release_angelegt` im `vorhanden`-Pfad von `POST /api/games` trägt den Text „für einen Listeneintrag".
5. Nur die Bundle-Abfrage hat eine IGDB-Zeitgrenze, die übrigen IGDB-Abrufe nicht.
6. Der Lesekosten-Test „Trophäen eines Spiels (19b)" scheiterte einmal im Volllauf, sonst grün.
