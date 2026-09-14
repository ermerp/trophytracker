#!/usr/bin/env bash
#
# Prueft einen D1-Dump gegen die Zeilenzahlen der Datenbank.
#
#   scripts/sicherung-pruefen.sh <dump.sql> [datenbank]
#
# Braucht CLOUDFLARE_API_TOKEN und CLOUDFLARE_ACCOUNT_ID in der Umgebung.
#
# Ein Export, den niemand prueft, ist eine Sicherung nur dem Namen nach. Der
# Dump schreibt eine INSERT-Zeile je Datensatz; die Zahlen werden je Tabelle
# gegen COUNT(*) gehalten. Weicht eine ab, endet das Skript mit Rueckgabewert
# 1 - im Deploy-Job VOR der Migration, in der Backup-Action vor dem Commit.
#
# Ins Log kommen ausschliesslich Zahlen, nie Inhalt: Der Dump enthaelt die
# vollstaendige Spielhistorie, und dieses Repository ist oeffentlich.
set -euo pipefail

dump="${1:?Aufruf: $0 <dump.sql> [datenbank]}"
datenbank="${2:-trophytracker}"

test -s "$dump" || { echo "::error::$dump fehlt oder ist leer"; exit 1; }
echo "Dump: $(wc -c < "$dump") Byte, $(grep -c 'INSERT INTO' "$dump" || true) INSERT-Zeilen"

# app_setting steht seit Stufe 8 mit in der Liste: Dort liegt der Vermerk der
# letzten Sicherung, die Tabelle ist also nicht mehr nur Konfiguration.
tabellen="trophy_progress game release physical_copy digital_entitlement play_status review_queue plan_entry app_setting"

abfrage=""
for t in $tabellen; do abfrage="$abfrage (SELECT COUNT(*) FROM $t) AS $t,"; done
zaehlung=$(npx wrangler d1 execute "$datenbank" --remote --json \
  --command "SELECT ${abfrage%,}" | jq -c '.[0].results[0]')
echo "Datenbank: $zaehlung"

fehler=0
for t in $tabellen; do
  in_db=$(echo "$zaehlung" | jq -r ".$t")
  im_dump=$(grep -c "INSERT INTO \"$t\"" "$dump" || true)
  if [ "$in_db" = "$im_dump" ]; then
    echo "  $t: $in_db in DB, $im_dump im Dump"
  else
    echo "::error::$t: $in_db in DB, aber $im_dump im Dump"
    fehler=1
  fi
done

[ "$fehler" = 0 ] || { echo "::error::Sicherung unvollständig"; exit 1; }
echo "Sicherung vollständig: bestanden"
