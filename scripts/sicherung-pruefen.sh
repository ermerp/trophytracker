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
# psn_zugang kam mit Stufe 19e dazu (Migration 0026): Zeitpunkte, keine
# Geheimnisse - und die Zeitreihe ist nach einem Verlust nicht
# wiederherstellbar, also gehoert sie in den Abgleich.
# trophy und trophy_group kamen mit Stufe 19b dazu (Migration 0027). Sie sind
# die mit Abstand groesste Tabelle der Sicherung - rund 18 400 Zeilen -, und
# eine abgeschnittene Sicherung faellt gerade dort am ehesten auf.
tabellen="trophy_progress trophy trophy_group game release physical_copy digital_entitlement play_status review_queue plan_entry app_setting psn_zugang"

# NUR pruefen, was es in der Datenbank schon gibt.
#
# Dieses Skript laeuft im Deploy-Job VOR der Migration - eine Tabelle, die
# erst diese Migration anlegt, kann es hier noch nicht geben. Bis zum
# 01.10.2026 ging die Liste ungeprueft in ein SELECT mit einer Unterabfrage je
# Tabelle; eine fehlende liess die ganze Abfrage scheitern, jq brach mit
# "Cannot index object with number" ab, und der Deploy der Stufe 19b blieb
# stehen, bevor die Migration lief. Fehlende Tabellen werden deshalb genannt
# und uebersprungen - beim naechsten Deploy sind sie da und werden gezaehlt.
# Eine Tabelle, die aus der Produktion VERSCHWINDET, faellt in dieser Zeile
# genauso auf.
vorhanden=$(npx wrangler d1 execute "$datenbank" --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type = 'table'" | jq -r '.[0].results[].name')

zu_pruefen=""
fehlend=""
for t in $tabellen; do
  if echo "$vorhanden" | grep -qx "$t"; then zu_pruefen="$zu_pruefen $t"; else fehlend="$fehlend $t"; fi
done
[ -z "$fehlend" ] || echo "Noch nicht in der Datenbank (kommt mit einer Migration):$fehlend"
tabellen="$zu_pruefen"

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
