← [Inhaltsverzeichnis](README.md)

### 7.1 PSN-Trophäen

Kein offizielles API. Ablauf: NPSSO-Cookie aus dem eingeloggten Browser → Access Code → Access Token und Refresh Token.

Endpunkt `GET /api/trophy/v1/users/me/trophyTitles`, paginiert. Die v2-Trophy-API deckt PS5, PS4, PS3 und Vita gemeinsam ab.

**Der Refresh Token läuft ab.** Das ist kein Fehlerfall, sondern ein regulärer Zustand und wird als solcher gebaut:

- `psn_credentials.status` wird `abgelaufen`
- Dashboard zeigt einen deutlichen Hinweis
- Einstellungen bieten ein Feld für den neuen NPSSO
- Der Sync bricht sauber ab, vorhandene Daten bleiben unangetastet

#### Den Zugang erneuern (Stufe 19e)

**Der Kopierschritt lässt sich nicht abschaffen, nur kürzen — gemessen am 29.09.2026.** Das NPSSO ist
ein Cookie auf `ca.account.sony.com`. Ein Abruf der Seite `api/v1/ssocookie` **aus der Anwendung
heraus** wurde geprüft, und zwar in einem angemeldeten Browser: Sony spiegelt die fremde Origin
zurück und erlaubt Anmeldedaten (`Access-Control-Allow-Origin`, `…-Credentials: true`), **CORS ist
also offen** — der Abruf kam durch und war lesbar. Er bekam trotzdem `403`, während dieselbe Adresse
im selben Browser direkt aufgerufen den Wert lieferte: Der Browser hängt das Cookie bei einer
Anfrage fremder Herkunft nicht an (`SameSite`). Damit ist der Weg zu, und zwar aus Absicht — gäbe es
ihn, könnte jede besuchte Seite eine fremde PSN-Sitzung mitlesen. Ein neues Tab hilft auch nicht:
Die Same-Origin-Policy verbietet einer Seite, den Inhalt eines Tabs fremder Herkunft zu lesen, egal
wer es geöffnet hat.

**Daraus folgt der Zuschnitt:** Das Web lässt den *Nutzer* Daten über Herkunftsgrenzen tragen, nie
die *Seite*. Jede Abkürzung läuft deshalb über eine Geste — Kopieren. Der Ablauf ist:

1. Knopf **„Zugang erneuern"** öffnet Sonys Seite in einem neuen Tab.
2. Dort kopieren. Auf dem Handy am einfachsten mit einem **langen Tippen auf die Zeichenfolge** –
   die Anführungszeichen begrenzen sie, sie wird also am Stück markiert; „Alles auswählen" geht
   genauso. Sonys Seite gibt rohes JSON aus und stellt es **sehr klein** dar (Rückmeldung des
   Nutzers vom 29.09.2026, am Gerät geprüft) – lesen muss man es nicht, und vergrößern lässt es
   sich nicht: Es ist eine fremde Seite. **Nichts heraussuchen:** Das Feld nimmt den blanken Wert, das
   ganze JSON und die ganze Seite an (`npssoAusText`, `src/domain/npsso.ts`) — gesucht wird der Wert
   selbst, 64 freistehende Zeichen aus Buchstaben und Ziffern. Genau einer muss es sein; bei keinem
   oder mehreren wird abgelehnt statt geraten.
3. Zurück in der Anwendung liest sie die Zwischenablage (`visibilitychange`) und prüft den Zugang
   gegen PSN. Fehlt die Berechtigung oder steht nichts Passendes darin, bleibt der Weg von Hand.

**Wie lange ein Zugang hält, wird aufgezeichnet statt geschätzt** (Migration 0026, Frage des Nutzers
vom 29.09.2026). Sony nennt beim Ausstellen ein `expires_in` — gemessen **5 182 926 Sekunden, rund
60 Tage**. Gehalten hat der Zugang vom 04.09.2026 aber nur **25 Tage**. Angekündigt und tatsächlich
fallen also auseinander, und ein Messpunkt sagt nicht, ob das die Regel war. `psn_zugang` hält
deshalb je Zugang fest, wann er eingetragen wurde, was angekündigt war, bis wann er nachweislich
lief und wie er endete. **Zwei Ausgänge, und nur einer ist eine Messung:** `gestorben_am` (von PSN
abgelehnt) zählt, `ersetzt_am` (der Nutzer hat früher erneuert) nicht — wie lange dieser Zugang
gehalten hätte, erfährt niemand. Die Tabelle enthält ausschließlich Zeitpunkte und steht deshalb in
`EXPORT_TABELLEN`; die Zeitreihe ist ihr ganzer Zweck und nach einem Verlust nicht
wiederherstellbar.

**Gewarnt wird nach dem gemessenen Alter, nicht nach Sonys Zahl:** ab **18 Tagen**, also sieben Tage
Vorlauf auf die bisher einzige gemessene Lebensdauer. Sonys Frist steht daneben als Tatsache. Das
ist ausdrücklich eine Faustregel auf einem Messpunkt — sie wird nachgezogen, sobald die
Aufzeichnung mehr hergibt.

**Was nicht gebaut wird, und warum** (Entscheidung des Nutzers vom 29.09.2026, nach Abwägung): Sonys
Anmeldung nachzubauen — Passwort und 2FA-Geheimnis hinterlegen, Headless-Browser gegen Akamais
Bot-Abwehr (`_abck`, `bm_sz` in der Antwort) — wäre ein Rückschritt für die Sicherheit (ein
Passwort statt eines Cookies mit Frist) und ein dauernder Wettlauf. Ein dauerhaft angemeldetes
Browserprofil auf einer eigenen Maschine verschiebt die Anmeldung nur und braucht ein Teil, das
dieses Projekt bewusst nicht hat. Eine Browser-Erweiterung dürfte das Cookie lesen, gibt es auf
Android-Chrome aber nicht — und dort passiert es.

**Sync-Ablauf:** `psn_sync_run` anlegen → alle Seiten abrufen und roh in `psn_raw_response` schreiben → daraus `trophy_progress` per UPSERT normalisieren → `release_id` und `play_status` unangetastet lassen → Status setzen. Die Trennung von Abruf und Normalisierung erlaubt beliebiges Wiederholen ohne PSN-Zugriff und liefert echte Testdaten. Die Rohablage ist deshalb **kein Archiv**: Seit Stufe 18d behält sie die Seiten der jüngsten drei Läufe und alles noch nicht Normalisierte, den Rest räumt der Cron als letzten Schritt der Nacht weg (10.1).

Seit Stufe 18 stößt ein Cron Trigger den Lauf **nachts einmal** von allein an – über dieselben Pfade wie der Knopf „Jetzt abrufen", deshalb protokolliert er ohne Zusatzcode mit Quelle `sync` (8.5). `psn_sync_run.started_by` (`nutzer` / `cron`, Migration 0021) sagt, wer es war. Ein fehlgeschlagener Nachtlauf wird in derselben Nacht nicht wiederholt; bei `status = 'abgelaufen'` legt der Cron gar keinen Lauf an, bis ein neues NPSSO eingetragen ist (10.1).

**Ablage der Zugangsdaten.** „Tokens liegen als Cloudflare Secret, nicht in D1" und ein Eingabefeld
für ein neues NPSSO schließen sich aus: Ein Worker kann keine Cloudflare Secrets schreiben, und
Secrets-Store-Bindings sind zur Laufzeit ausschließlich lesbar – ein Eingabefeld braucht aber eine
zur Laufzeit beschreibbare Ablage.

Deshalb: **NPSSO und Refresh-Token liegen AES-GCM-verschlüsselt in `psn_credentials`**, der
Schlüssel als Cloudflare Secret `NPSSO_KEY`. Damit bleibt die Eingabe über die Oberfläche möglich –
auch vom Handy –, und ein Datenbank-Dump enthält keinen verwertbaren Zugang. Der Sinn der
ursprünglichen Regel ist erfüllt, ihr Wortlaut nicht.

Der Refresh-Token nimmt denselben Weg, weil er rotiert und damit genau das Problem hat, an dem die
Secret-Lösung scheitert.

**Reihenfolge beim Anmelden:**

1. Refresh-Token vorhanden und `refresh_expires_at` in der Zukunft → damit einen Access Token holen
2. Schlägt das fehl oder fehlt der Token → aus dem NPSSO neu ableiten, frischen Refresh-Token ablegen
3. Scheitert auch das → `status = 'abgelaufen'`, vorhandene Daten bleiben unangetastet

Der normale Sync fasst das NPSSO damit gar nicht an – schonend gegenüber einer inoffiziellen
Schnittstelle.

**Der Refresh-Token hält zehn Tage, und die Frist rollt mit jeder Erneuerung weiter** – gemessen am
09.10.2026 gegen die Produktion. Am 01.10.2026 stand `refresh_expires_at` auf dem 09.10.2026, exakt
zehn Tage nach der NPSSO-Eintragung vom 29.09., und zwei Nachtläufe hatten den Zeitpunkt scheinbar
nicht bewegt; daraus war die Vermutung entstanden, Sonys `refresh_token_expires_in` zähle auf einen
**festen Punkt** herunter, sodass der Lauf am 09.10. auf Schritt 2 zurückfallen müsste.

**Diese Vermutung ist widerlegt.** Am 09.10.2026 um 03:05 hat der Nachtlauf den Token erneuert, und
`refresh_expires_at` steht seither auf dem **19.10.2026 03:05** – zehn Tage ab der Erneuerung, nicht
ab der NPSSO-Eintragung. Der Zugang vom 29.09. trägt in `psn_zugang` weiterhin `ausgang = 'offen'`,
es gibt also keine neue Kette und keinen Rückfall auf das NPSSO. Der Sync hat an diesem Morgen
regulär 431 Titel geholt.

Praktische Folge: Solange der Nachtlauf läuft, läuft der Refresh-Token mit und das NPSSO wird gar
nicht angefasst. Bleibt der Lauf länger als zehn Tage aus, fällt der nächste auf Schritt 2 zurück –
dafür muss das NPSSO noch gültig sein (hier bis 28.11.2026).

**Weder NPSSO noch Refresh- oder Access Token dürfen jemals in einer API-Antwort oder im Log
erscheinen, auch nicht gekürzt.** Durchgesetzt wird das über eine Hülle `Geheimnis`, deren
`toString()` und `toJSON()` redigieren; der Klartext ist nur über einen ausdrücklichen Aufruf
erreichbar. Daraus folgt außerdem: Die Antwort des Token-Endpunkts wird **nie** in
`psn_raw_response` geschrieben – sie enthält den Refresh-Token und stünde sonst in jedem Dump.
