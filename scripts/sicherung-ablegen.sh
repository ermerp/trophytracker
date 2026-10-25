#!/usr/bin/env bash
#
# Legt die Sicherung im privaten Repository ab (Abschnitt 14.2).
#
#   scripts/sicherung-ablegen.sh <exportverzeichnis> <repo-url> <json: ja|nein>
#
# Der Dump (backup.sql) wird IMMER abgelegt, auch wenn der JSON-Export
# gescheitert ist: Er ist die Sicherung, die sich wieder einspielen laesst,
# backup.json nur die lesbare Zweitform. Bis zum 25.10.2026 brach ein
# gescheiterter JSON-Export den ganzen Lauf ab, und der schon gepruefte Dump
# derselben Woche ging mit verloren (16-2-bewertung-02-11.md). Bei "nein"
# bleibt die backup.json der Vorwoche liegen; ihr Feld `exportiertAm` sagt,
# von wann sie ist. Rot endet der Lauf trotzdem - das macht ein eigener
# Schritt in backup.yml, nach dem Vermerk.
#
# Schreibt `commit=<hash>` (leer bei unveraendertem Stand) nach
# $GITHUB_OUTPUT, wenn gesetzt. Ins Log kommen nur Zahlen und der Hash.
set -euo pipefail

export_dir="${1:?Aufruf: $0 <exportverzeichnis> <repo-url> <ja|nein>}"
url="${2:?Aufruf: $0 <exportverzeichnis> <repo-url> <ja|nein>}"
json="${3:?Aufruf: $0 <exportverzeichnis> <repo-url> <ja|nein>}"
export_dir="$(cd "$export_dir" && pwd)"

test -s "$export_dir/backup.sql" || { echo "::error::backup.sql fehlt oder ist leer"; exit 1; }
if [ "$json" = "ja" ]; then
	test -s "$export_dir/backup.json" || { echo "::error::backup.json fehlt oder ist leer"; exit 1; }
fi

arbeit="$(mktemp -d)"
trap 'rm -rf "$arbeit"' EXIT

# --depth 1, weil der Verlauf hier jede Woche um einen Dump waechst und
# dieses Skript ihn nicht braucht.
git clone -q --depth 1 "$url" "$arbeit/ziel" 2>/dev/null || git clone -q "$url" "$arbeit/ziel"
cd "$arbeit/ziel"
# Ein frisch angelegtes Repository hat noch keinen Commit und damit keinen
# Branch. symbolic-ref taugt fuer beide Faelle: Es zeigt HEAD auf main, ob der
# Branch nun schon existiert oder erst entsteht.
git rev-parse --verify HEAD >/dev/null 2>&1 || git symbolic-ref HEAD refs/heads/main

cp "$export_dir/backup.sql" .
if [ "$json" = "ja" ]; then
	cp "$export_dir/backup.json" .
fi

cat > README.md <<'ENDE'
# trophytracker-backup

Woechentliche Sicherung von [trophytracker](https://github.com/ermerp/trophytracker).
Geschrieben von `.github/workflows/backup.yml` dort, nicht von Hand.

| Datei | Inhalt |
|---|---|
| `backup.sql` | vollstaendiger D1-Dump, zum Wiedereinspielen |
| `backup.json` | dieselben Daten als lesbare Zweitform, ohne Rohantworten und Zugangsdaten |

**Der Dump wird auch abgelegt, wenn der JSON-Export scheitert.** Der Commit
heisst dann "nur backup.sql", und `backup.json` ist die einer frueheren Woche -
von wann, steht in ihrem Feld `exportiertAm`.

**Dieses Repository ist privat und muss es bleiben.** Es enthaelt die
vollstaendige Spielhistorie. Zugangsdaten stehen nicht darin: NPSSO und
Refresh-Token liegen AES-GCM-verschluesselt in D1, der Schluessel als
Cloudflare Secret.

## Wiederherstellung

**`backup.sql` laesst sich NICHT unveraendert einspielen.** `d1 export`
schreibt die Tabellen in sqlite_master-Reihenfolge; nach dem Neuaufbau
von `release` in Migration 0003 steht sie dort hinter den neun
Tabellen, die auf sie verweisen. Ein direkter Import scheitert mit
`no such table: main.release` (gemessen am 14.09.2026).

Der Dump muss vorher umgeordnet werden. Das Skript dafuer liegt im
Haupt-Repository:

```
npx wrangler d1 create trophytracker-restore
node scripts/wiederherstellung-vorbereiten.mjs backup.sql restore.sql
npx wrangler d1 execute trophytracker-restore --remote --file=restore.sql
npx wrangler d1 execute trophytracker-restore --remote --command "PRAGMA foreign_key_check"
```

Der letzte Befehl muss **leer** bleiben: Der Import laeuft mit
abgeschalteter Fremdschluesselpruefung, erst er belegt den Bestand.

Der vollstaendige Ablauf mit Zeilenzahl-Vergleich steht in der README
des Haupt-Repositories unter "Wiederherstellung".
ENDE

git config user.name "trophytracker-backup"
git config user.email "actions@github.com"
git add -A

hash=""
if git diff --cached --quiet; then
	echo "Unverändert - kein Commit"
else
	nachricht="Sicherung $(date -u +%Y-%m-%d)"
	[ "$json" = "ja" ] || nachricht="$nachricht (nur backup.sql - backup.json gescheitert)"
	git commit -q -m "$nachricht"
	git push -q origin HEAD:main
	hash=$(git rev-parse --short HEAD)
	echo "Commit $hash"
fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
	echo "commit=$hash" >> "$GITHUB_OUTPUT"
fi

echo "backup.sql: $(wc -c < backup.sql) Byte"
if [ "$json" = "ja" ]; then
	echo "backup.json: $(wc -c < backup.json) Byte"
else
	echo "backup.json: nicht erneuert"
fi
