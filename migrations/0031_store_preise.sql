-- Migration 0031: PSN Store-Preise (Stufe 21, Abschnitt 7.4)
--
-- Use Case 7, zweite Haelfte: was ein Titel NEU DIGITAL kostet, neben dem
-- Gebrauchtpreis aus Stufe 20. Beide Kanaele duerfen nie zu einem Wert
-- verrechnet werden (Abschnitt 6) - deshalb keine Zeile in `market_offer`,
-- das die Gebrauchtangebote fuehrt, sondern eigene Spalten hier und der
-- Verlauf in `price_snapshot` mit `channel = 'psn_store'`. Beide Tabellen
-- stehen schon in EXPORT_TABELLEN; es faehrt nichts ungesichert mit.
--
-- Keine neue Tabelle und kein Fortschrittsschluessel in `app_setting`: Der
-- Stand steht je Zeile, wie `markt_geprueft_am` seit 0028. Damit gibt es den
-- Fehlerfall aus 18e hier gar nicht - ein abgebrochener Lauf laesst die
-- ungeprueften Releases ungestempelt, und Erfolg und Fehler koennen keine
-- gemeinsame Marke hinterlassen, weil es keine gibt.
--
-- Zur Vorbedingung aus 7.4: `psn_product_id` war bei 0 von 490 Releases
-- gefuellt, und das las sich wie eine Sperre. Gemessen am 02.10.2026 fuellt
-- sie sich selbst - IGDB nennt in `external_games` (Quelle 36) eine
-- CONCEPT-Id (66 von 79 Releases des Zuschnitts), und die Concept-Seite des
-- Store listet daraus die Produkte je Plattform. `psn_product_id` ist das
-- Ergebnis und bleibt von Hand korrigierbar (Spieldetail, Punktmenue).
--
-- ADD COLUMN ist hier unkritisch: Keine View liest diese Spalten, und
-- v_luecken wie v_kaufkandidaten zaehlen ihre Spalten ohnehin explizit auf
-- (Projektregel, test/migration.spec.ts). Abwaertskompatibel - der alte
-- Worker laeuft waehrend der Migration weiter und liest sie nicht.

-- Ausgangspunkt der Aufloesung: die Concept-Id aus IGDB. Sie haengt am
-- SPIEL, nicht am Release - ein Concept deckt alle Fassungen ab, bei
-- Horizon Forbidden West die PS4- und die PS5-Fassung unter derselben Id
-- 10000886. Erst die Concept-Seite trennt sie in Produkte je Plattform, und
-- das Ergebnis landet in release.psn_product_id, die es seit 0001 gibt.
--
-- `store_concept_am` ist der Stempel "schon gefragt". Ohne ihn fragte der
-- Schritt jede Nacht erneut nach den 13 Spielen, zu denen IGDB keinen
-- Store-Eintrag kennt. Mit ihm ruht die Frage und wird nach 30 Tagen
-- wiederholt - IGDB waechst, und ein Eintrag kann nachkommen.
ALTER TABLE game ADD COLUMN store_concept_id TEXT;
ALTER TABLE game ADD COLUMN store_concept_am TEXT;

-- Sonys Produktname. Er wird ANGEZEIGT, wo er vom eigenen Titel abweicht:
-- Gemessen am 02.10.2026 heisst das Produkt in 20 von 57 Faellen anders -
-- mal nur die deutsche Fassung ("Mittelerde: Schatten des Krieges"), mal
-- wirklich eine andere Fassung ("NieR: Automata Game of the YoRHa Edition").
-- Den Unterschied kann nur der Nutzer bewerten, also bekommt er ihn zu sehen,
-- statt dass der Preis vorgibt, zum eigenen Titel zu gehoeren.
ALTER TABLE release ADD COLUMN store_produkt_name TEXT;

-- Der Kaufpreis und der Grundpreis, beide in Cent, beide aus demselben
-- Kaufknopf. `store_is_sale` ist nicht geraten, sondern
-- discountedValue < basePriceValue (7.4).
ALTER TABLE release ADD COLUMN store_price_cents INTEGER;
ALTER TABLE release ADD COLUMN store_base_price_cents INTEGER;
ALTER TABLE release ADD COLUMN store_is_sale INTEGER NOT NULL DEFAULT 0;

-- Liegt der Titel im PS-Plus-Katalog? Nur aus dem Knopf
-- UPSELL_PS_PLUS_GAME_CATALOG - ein PS-Plus-PROBESPIEL ist keine
-- Mitgliedschaft im Katalog und zaehlt hier nicht (gemessen am 02.10.2026 an
-- Baldur's Gate 3, dessen Probe-Knopf 0,00 EUR nannte, waehrend der Kauf
-- 48,99 EUR kostete).
ALTER TABLE release ADD COLUMN store_plus INTEGER NOT NULL DEFAULT 0;

-- Warum kein Preis da ist - und zwar unterscheidbar, nicht als Boolean
-- (Abschnitt 3, dieselbe Linie wie markt_geprueft_am gegen
-- markt_rohangebote):
--   'preis'      ein Kaufknopf mit Preis gefunden
--   'ohne_id'    IGDB kennt keinen Store-Eintrag zu diesem Spiel (13 von 79)
--   'delistet'   der Store fuehrt kein Produkt mehr (4 von 79)
--   'ohne_kauf'  Produkt da, aber nicht kaeuflich (UNAVAILABLE)
--   'fremd'      kein Produkt fuer DIESE Plattform (3 von 79)
--   'unlesbar'   Seite nicht lesbar - der naechste Lauf versucht es erneut
-- Fehlender Preis bleibt NULL und wird "unbekannt" angezeigt, nie "0".
ALTER TABLE release ADD COLUMN store_befund TEXT;

ALTER TABLE release ADD COLUMN store_geprueft_am TEXT;

-- Pflicht, nicht Vorsicht: Der naechtliche Schritt sucht in einer Schleife
-- ueber diese Spalte - genau der Fall, den Migration 0025 fuer
-- game.sort_title nachholen musste. Mit ihm kann die Auswahlabfrage nach
-- LIMIT abbrechen, statt alle Releases zu sortieren.
CREATE INDEX idx_release_store ON release(store_geprueft_am);
