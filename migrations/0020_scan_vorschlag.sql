-- Migration 0020: Titelvorschlag je offenem Scan (Stufe 17b, Abschnitt 9.3)
--
-- Ein gescannter Barcode ist eine Zahl. Damit sich ein Code ohne die Huelle in
-- der Hand zuordnen laesst, braucht es einen Titel von aussen. Den holt ein
-- Job ausserhalb des Workers (GitHub Action, wie bei schweren Importen
-- vorgesehen) und legt ihn hier ab: Fremddatum, deshalb gespeichert.
--
-- Der Abgleich mit der eigenen Sammlung wird NICHT gespeichert. Er haengt an
-- den Spieltiteln des Nutzers und waere nach einer Umbenennung oder einem neu
-- angelegten Spiel falsch; er entsteht beim Lesen (src/domain/scan-titel.ts).
--
-- checked_at haelt fest, wann zuletzt gefragt wurde - auch wenn die Quelle
-- den Code nicht kannte. Sonst fragt der Job dieselben erfolglosen Codes
-- jeden Tag erneut und verbraucht das Tageskontingent damit.

ALTER TABLE unresolved_scan ADD COLUMN title_raw TEXT;
ALTER TABLE unresolved_scan ADD COLUMN title_source TEXT;
ALTER TABLE unresolved_scan ADD COLUMN checked_at TEXT;
