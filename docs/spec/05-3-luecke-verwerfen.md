← [Inhaltsverzeichnis](README.md)

### 5.3 Eine Lücke bewusst verwerfen

Nicht jede Lücke ist ein Kaufwunsch. Ein Spiel, das digital vorliegt und als Disc existiert, taucht
in `v_luecken` auf – aber vielleicht ist die physische Fassung gar nicht gewollt: kein
Sammlerinteresse, zu teuer, oder die digitale Fassung genügt.

**Dafür braucht es kein neues Feld.** Ein `plan_entry` mit `kind = 'kauf'`, `origin = 'luecke'` und
`status = 'verworfen'` sagt genau das aus: geprüft und entschieden. `resolved_at` hält fest, wann.

Die Entscheidung bleibt damit dort, wo alle Absichten liegen, und die Historie geht nicht verloren –
derselbe Grund, aus dem Wunschliste, To-Do, Backlog und Kaufliste in *einer* Tabelle stehen. Ein
späterer Sinneswandel ist ein Feld-Update auf `offen`, kein Neuanlegen.

**Folgen für die Sichten:**

- `v_kaufkandidaten` blendet Releases mit verworfenem Kaufeintrag aus. Ein Filter nur auf
  `status = 'offen'` genügt dafür nicht – er ließe den Kandidaten wieder auftauchen.
- `v_luecken` behält den Eintrag, kennzeichnet ihn aber über eine Spalte `verworfen`. Eine Lücke ist
  eine **Tatsache** (digital gespielt, Disc existiert, nicht im Regal); dass sie nicht geschlossen
  werden soll, ist eine **Absicht**. Die Tatsache zu löschen, weil die Absicht fehlt, wäre dieselbe
  Vermischung, die Abschnitt 1 als Designfehler benennt.
- Die Lückenansicht blendet verworfene Einträge **standardmäßig aus**, mit einem Umschalter für
  "auch verworfene zeigen". So verschwinden sie aus dem Blick, ohne aus den Daten zu verschwinden.

Umgesetzt in Stufe 14 (Lückenansicht, `POST /api/gaps/:releaseId/verwerfen`); seit Stufe 15 steht
derselbe Knopf am Lücken-Kandidaten der Kaufliste, und der verworfene Eintrag liegt dort unter „auch
erledigte und verworfene" – „wieder öffnen" macht ihn per Feld-Update zum offenen Kauf. Rückgängig
ist `DELETE /api/plans/:id` – dieselbe Mechanik wie „nicht vorgesehen" im Backlog (5.4): Der
verworfene Eintrag ist eine gespeicherte Ablehnung, kein Zustand des Releases. Ein zweiter
Kaufeintrag am selben Release (offen oder verworfen) wird mit `409` abgewiesen.

**`unbekannt` in der Ansicht (Entscheidung des Nutzers vom 16.09.2026, „Block B").** Nach dem
IGDB-Lauf tragen rund 200 der 481 Releases ein `ja`; der Rest bleibt `unbekannt`. Die Ansicht zeigt
belegte Lücken oben und darunter zugeklappt „Disc-Fassung unbekannt (n)": digital gespielt, nicht im
Regal, aber ohne Beleg für eine Disc – mit „Disc gibt es" / „gibt es nicht" / „physisch nicht
gewünscht" je Zeile. Dort entsteht das `nein` von Hand, das laut Entscheidung das Einzige ist, was
nicht aus einer Quelle kommt; der dritte Knopf (Wunsch des Nutzers vom 16.09.2026) lässt die Frage
nach der Disc offen und verwirft trotzdem – der Kaufeintrag hängt am Release, nicht an der
Disc-Fassung, und blendet das Release aus beiden Listen aus. Die
View `v_luecken` liefert dafür beide Fassungen mit einer Spalte `disc_fassung`; wer die Lücke als
**Tatsache** braucht – `v_kaufkandidaten`, `luecken.csv` –, filtert auf `ja`. Ein `nein` ist in
keiner der beiden Listen: Es ist ein Urteil, keine offene Frage.

**Block B kennt seit Stufe 20e nur noch zwei Knöpfe** — „Disc gibt es“ und „gibt es nicht“ (Entscheidung des Nutzers vom 02.10.2026). Das **kehrt seinen Wunsch vom 16.09.2026 um**, „physisch nicht gewünscht“ auch dort anzubieten. Begründung: Der Block stellt eine einzige Frage, nämlich ob es die Disc gibt. Ein dritter Knopf, der diese Frage offen lässt und die Zeile trotzdem ausblendet, gehört nicht in dieselbe Reihe; die Absicht entscheidet sich danach in der Lückenliste, wo die Disc-Fassung geklärt ist. In der oberen Liste bleibt „physisch nicht gewünscht“ unverändert.

**Block B seit Stufe 20 (7.3):** Jede Zeile nennt, was die eBay-Suche ergeben hat — „eBay kennt kein Angebot für diese Plattform (23.9.2026) – spricht für „nur digital"" oder „7 Angebote bei eBay, keines eindeutig diesem Spiel zuzuordnen". Der Block ist danach sortiert: die eindeutigen Fälle zuerst, dann das Ungeprüfte, dann das Mehrdeutige. Das macht aus 221 blinden Ja/Nein-Klicks eine abarbeitbare Liste — **entschieden wird sie weiterhin von Hand**, weil keine Quelle „nur digital" sicher belegt und die Eigenschaft nicht stabil ist (7.3).
