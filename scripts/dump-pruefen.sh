#!/usr/bin/env bash
#
# Prueft einen D1-Dump darauf, dass weder NPSSO noch Refresh- oder Access
# Token im Klartext darin stehen (Abnahmekriterium A der Stufe 8).
#
#   scripts/dump-pruefen.sh <backup.sql>
#
# Der Klartext ist diesem Skript weder bekannt noch darf er es sein. Geprueft
# wird deshalb nicht "kommt Wert X vor", sondern die Form:
#
#   1. Kein Feldname eines Klartext-Tokens taucht in einer INSERT-Zeile auf.
#   2. Die psn_credentials-Zeile traegt ausser Zeitstempeln und dem Status
#      ausschliesslich Werte, die gueltiges Base64 sind - also Chiffrat oder IV.
#   3. Keiner dieser Werte ist 64 Zeichen lang. Das ist die Laenge eines NPSSO
#      und die eigentliche Pruefung.
#   4. Die Dekodate haben eine Laenge, die zu AES-GCM passt: 12 Byte (IV) oder
#      mindestens 17 Byte (16 Byte Pruefsumme plus Inhalt).
#
# Warum Punkt 3 und nicht "sieht der Wert nach Klartext aus": Ein NPSSO besteht
# aus Buchstaben und Ziffern, ist also selbst gueltiges Base64 und dekodiert zu
# 48 Byte, die wie Zufall aussehen. Eine Pruefung auf druckbare Zeichen im
# Dekodat laeuft daran vorbei - gemessen, nicht vermutet. Die Laenge nicht:
# Chiffrat sind 108 Zeichen, ein IV 16, ein NPSSO 64.
#
# Ausgabe: nur Zahlen und "bestanden"/"nicht bestanden". Nie Inhalt - dieses
# Repository ist oeffentlich.
set -euo pipefail

dump="${1:?Aufruf: $0 <backup.sql>}"
test -s "$dump" || { echo "::error::$dump fehlt oder ist leer"; exit 1; }

fehler=0
meldung() { echo "::error::$1"; fehler=1; }

# --------------------------------------------------------------------------
# 1. Verbotene Bezeichner in Datenzeilen
#
# Nur INSERT-Zeilen, nicht das Schema: Die Spalten heissen npsso_ciphertext
# und refresh_ciphertext, ihre Namen im CREATE TABLE sind kein Fund.
# --------------------------------------------------------------------------
inserts=$(grep -c '^INSERT INTO' "$dump" || true)
echo "INSERT-Zeilen geprüft: $inserts"

for muster in 'access_token' 'refresh_token' '"npsso"' 'npsso='; do
  treffer=$(grep '^INSERT INTO' "$dump" | grep -c -F "$muster" || true)
  echo "  Muster '$muster': $treffer Treffer"
  [ "$treffer" = 0 ] || meldung "Muster '$muster' steht in $treffer Datenzeilen"
done

# --------------------------------------------------------------------------
# 2./3. Die psn_credentials-Zeile im Einzelnen
#
# Alle einfach gequoteten Literale einsammeln. Das traegt, weil dort nur
# Base64, Zeitstempel und ein Statuswort stehen - keiner davon enthaelt ein
# Anfuehrungszeichen.
# --------------------------------------------------------------------------
zeile=$(grep '^INSERT INTO "psn_credentials"' "$dump" || true)
if [ -z "$zeile" ]; then
  echo "psn_credentials: 0 Zeilen im Dump - nichts zu prüfen"
else
  werte=$(echo "$zeile" | grep -o "'[^']*'" | sed "s/^'//; s/'$//")
  anzahl=$(echo "$werte" | grep -c . || true)
  echo "psn_credentials: 1 Zeile, $anzahl Textwerte"

  base64_werte=0
  while IFS= read -r wert; do
    [ -n "$wert" ] || continue

    # Zeitstempel (YYYY-MM-DD...) und Statuswort sind erlaubter Klartext.
    case "$wert" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*) continue ;;
      ok|abgelaufen|fehler) continue ;;
    esac

    zeichen=${#wert}
    base64_werte=$((base64_werte + 1))

    if ! echo "$wert" | grep -qE '^[A-Za-z0-9+/]+={0,2}$'; then
      echo "  Wert $base64_werte: $zeichen Zeichen, kein Base64"
      meldung "psn_credentials trägt einen Wert, der weder Zeitstempel noch Base64 ist"
      continue
    fi

    if ! dekodiert=$(printf '%s' "$wert" | base64 -d 2>/dev/null | wc -c); then
      echo "  Wert $base64_werte: $zeichen Zeichen, nicht dekodierbar"
      meldung "psn_credentials trägt einen Wert, der kein gültiges Base64 ist"
      continue
    fi

    echo "  Wert $base64_werte: $zeichen Zeichen kodiert, $dekodiert Byte dekodiert"

    # Die eigentliche Pruefung. Ein NPSSO ist 64 Zeichen lang; Chiffrat und IV
    # sind es nie (108 beziehungsweise 16).
    [ "$zeichen" != 64 ] || meldung "Wert $base64_werte ist 64 Zeichen lang - die Länge eines NPSSO"

    # 12 Byte ist ein IV, alles andere muss mindestens die 16 Byte GCM-Prüfsumme
    # plus Inhalt tragen.
    if [ "$dekodiert" != 12 ] && [ "$dekodiert" -lt 17 ]; then
      meldung "Wert $base64_werte dekodiert zu $dekodiert Byte - weder IV noch AES-GCM-Chiffrat"
    fi
  done <<< "$werte"

  # Vier Chiffrat-/IV-Spalten: npsso_ciphertext, npsso_iv, refresh_ciphertext,
  # refresh_iv. Mehr Base64-Werte hiesse, dass eine fuenfte dazugekommen ist,
  # ohne dass dieses Skript sie kennt.
  echo "  Base64-Werte gesamt: $base64_werte (erwartet höchstens 4)"
  [ "$base64_werte" -le 4 ] || meldung "mehr Base64-Werte als die vier bekannten Chiffrat-/IV-Spalten"
fi

if [ "$fehler" = 0 ]; then
  echo "Klartext-Prüfung: bestanden"
else
  echo "Klartext-Prüfung: nicht bestanden"
  exit 1
fi
