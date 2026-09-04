# Trophytracker

Single-User-Webanwendung zur Verwaltung einer PlayStation-Spielesammlung (PS3, PS4, PS5):
Besitz, Trophäenfortschritt, eigene Bewertung, Wunsch- und Kaufliste.

Die vollständige Spezifikation steht in [`docs/spezifikation.md`](docs/spezifikation.md).

> **Die PSN-Anbindung ist inoffiziell.** Sony stellt kein öffentliches API für
> Trophäendaten bereit; die Anwendung nutzt die Endpunkte, die auch die
> PlayStation-App verwendet. Sie können sich jederzeit ändern oder wegfallen.
> Die Anwendung ist darauf ausgelegt: Ein fehlgeschlagener Sync lässt vorhandene
> Daten unangetastet und macht nichts unbenutzbar.

## Stand

Stufe 0 der [Umsetzungsreihenfolge](docs/spezifikation.md#16-umsetzungsreihenfolge):
Deployment-Pipeline und Zugriffsschutz stehen. Die Anwendung ist noch leer –
das Datenmodell kommt in Stufe 1.

## Architektur in einem Absatz

**Ein** Cloudflare Worker liefert sowohl das gebaute React-Frontend (als Static
Assets) als auch die API unter `/api/*`. Dadurch teilen sich beide eine Origin:
kein CORS, ein Deploy-Pfad, eine Access-Richtlinie. Die Daten liegen in
Cloudflare D1.

## Lokale Entwicklung

```bash
npm ci
npm run build        # Frontend nach frontend/dist

# Zwei Terminals:
npx wrangler dev     # Worker + Assets + lokale D1 auf :8787
npm run dev          # Vite mit HMR auf :5173, proxyt /api auf :8787
```

Für die Arbeit am Frontend ist `npm run dev` der richtige Einstieg. Um zu prüfen,
was produktiv tatsächlich ausgeliefert wird, `npm run build` und dann
`npx wrangler dev` allein aufrufen.

Die lokale Entwicklung läuft gegen eine **lokale** D1 in `.wrangler/`, nicht gegen
die produktive Datenbank. Nur Befehle mit `--remote` fassen die echten Daten an.

```bash
npm test             # Vitest
```

## Einrichtung eines eigenen Kontos

Das Repository ist ohne die Daten vollständig nachvollziehbar. Wer es nachbauen
will, braucht ein eigenes Cloudflare-Konto und ein eigenes NPSSO.

1. **D1-Datenbank anlegen**

   ```bash
   npx wrangler login
   npx wrangler d1 create trophytracker
   ```

   Wrangler trägt das Binding selbst in `wrangler.jsonc` ein – **hängt dabei aber
   einen zusätzlichen Eintrag an, statt einen vorhandenen zu füllen**, und benennt
   das Binding nach der Datenbank. Danach kontrollieren, dass genau ein Eintrag
   unter `d1_databases` steht und das Binding `DB` heißt; der Code greift über
   `env.DB` darauf zu.

   `database_id` und `account_id` sind Bezeichner, keine Zugangsdaten, und dürfen
   im öffentlichen Repository stehen.

   Prüfen lässt sich das Ergebnis ohne Deployment:

   ```bash
   npx wrangler deploy --dry-run   # muss env.DB und env.ASSETS zeigen, sonst nichts
   npx wrangler d1 info trophytracker
   ```

2. **`workers.dev`-Subdomain anlegen.** Einmal Dashboard → Workers & Pages
   öffnen; die Subdomain wird dabei automatisch erzeugt und du wählst ihren
   Namen. Ohne sie hat `wrangler deploy` kein Ziel und die Deploy-Action
   scheitert im letzten Schritt – anlegen kann Wrangler sie in CI nicht, weil
   das eine interaktive Eingabe wäre.

   ```bash
   # Gegenprobe, bevor die Action laeuft:
   curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/<account_id>/workers/subdomain"
   ```

3. **Cloudflare-API-Token erstellen** (My Profile → API Tokens → Custom token),
   bewusst eng geschnitten:

   | Bereich | Berechtigung |
   |---|---|
   | Account → Workers Scripts | Edit |
   | Account → D1 | Edit |
   | Account → Account Settings | Read |

   Keine Zone- und keine Pages-Berechtigung nötig.

4. **GitHub Secrets** hinterlegen (Settings → Secrets and variables → Actions):

   | Secret | Wofür | Ab Stufe |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | Deploy-Action | 0 |
   | `CLOUDFLARE_ACCOUNT_ID` | Deploy-Action | 0 |
   | `BACKUP_REPO_TOKEN` | Fine-grained PAT, nur auf das private Backup-Repo | 8 |

5. **Zugriffsschutz einrichten** – siehe unten.

6. **Geheimnisse für die externen Anbindungen** kommen als Cloudflare Secrets
   dazu, sobald die jeweilige Stufe erreicht ist (NPSSO und PSN-Refresh-Token ab
   Stufe 2, IGDB/Twitch ab Stufe 9, AWIN-Feed-URL ab Stufe 18). Lokal gehören sie
   in `.dev.vars`, niemals ins Repository.

## Zugriffsschutz

Die `workers.dev`-Adresse ist öffentlich erreichbar, deshalb steht
**Cloudflare Access** davor. Zero Trust ist für bis zu 50 Nutzer kostenlos –
beim Onboarding verlangt Cloudflare trotzdem Zahlungsdaten. Laut Dokumentation:
*"If you chose the Zero Trust Free plan, this step is still needed but you will
not be charged."* Siehe [Kosten](#kosten).

1. Dashboard → Zero Trust → Team-Namen wählen (ergibt
   `<team>.cloudflareaccess.com`, den Login-Endpunkt). Die Team-Domain hostet
   nichts, sie führt nur die Anmeldung durch.
2. Zero Trust → **Integrations → Identity providers** → *Add new* →
   **One-time PIN**. Neue Zero-Trust-Organisationen bekommen OTP **nicht** mehr
   automatisch ("OTP is no longer added automatically"); ohne Eintrag greift der
   Cloudflare-eigene Anbieter, der an eine bestehende Cloudflare-Sitzung
   gebunden ist. OTP schickt stattdessen einen Code an die E-Mail-Adresse und
   funktioniert dadurch auf jedem Gerät – am Handy der praktischere Weg.

   Prüfen lässt sich der Stand ohne Dashboard:

   ```bash
   curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/<account_id>/access/identity_providers"
   ```
3. Nach dem ersten erfolgreichen Deploy: Workers & Pages → `trophytracker` →
   Tab **Access** → *Protect this Worker behind Access* → **All traffic**.
4. Richtlinie anlegen – das ist ein **zweiter, eigener Schritt** neben der
   Login-Methode. Die Login-Methode klärt, *wie* jemand sich ausweist; die
   Richtlinie, *wer* durchgelassen wird:

   | Feld | Wert |
   |---|---|
   | Action | `Allow` |
   | Selector | `Emails` |
   | Value | die eine erlaubte Adresse |

   Genau eine Adresse, wie in Abschnitt 15.3 gefordert.

Die Richtlinie hängt am Worker, nicht an einem Hostnamen – deshalb ist **keine
eigene Domain nötig**, und sie deckt `workers.dev`-Adresse, Preview-URLs und
spätere Custom Domains gemeinsam ab. Einschränkung: WebSockets werden hinter
Worker-Level-Access nicht unterstützt (403 beim Upgrade); die Anwendung nutzt
keine.

Prüfen, dass es greift:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://trophytracker.<subdomain>.workers.dev/api/health
# 302 (auf cloudflareaccess.com) oder 403 – niemals 200
```

### Maschinen-Endpunkte

`POST /api/imports/feed` und `GET /api/export/backup.json` werden von GitHub
Actions aufgerufen und können keinen Browser-Login durchlaufen. Wie sie
abgesichert werden – Access Service Token oder eigenes Bearer-Token –
**ist noch nicht entschieden und wird in Stufe 8 festgelegt**, wenn mit der
Backup-Action der erste dieser Endpunkte tatsächlich existiert. Siehe
[Abschnitt 15.3](docs/spezifikation.md#153-zugriffsschutz).

## Deployment

Jeder Push auf `main` löst [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
aus. Die Reihenfolge ist der eigentliche Inhalt:

1. `npm ci`, `npm test`, `npm run build`
2. `wrangler d1 export` – **Sicherung vor jeder Schemaänderung**
3. `wrangler d1 migrations apply --remote`
4. `wrangler deploy`

Schritt 2 ist der Grund, warum das eine Action ist und kein Klick im Dashboard:
Eine fehlerhafte Migration ist der wahrscheinlichste Weg, Daten zu verlieren,
und der einzige Zeitpunkt, an dem ein frisches Backup zählt, ist die Sekunde
davor.

Migrationen laufen **vor** dem Deployment, damit neuer Code nie auf ein altes
Schema trifft. Umgekehrt müssen sie **abwärtskompatibel** sein, weil in diesem
Moment noch der alte Worker läuft: Spalten hinzufügen ist unkritisch, Spalten
umbenennen braucht zwei Deployments.

Der Dump aus Schritt 2 wird bewusst **nicht** als Workflow-Artifact hochgeladen –
Artifacts eines öffentlichen Repositories sind über den Run-Link herunterladbar.
Er sichert diesen einen Lauf ab. Die dauerhafte Sicherung ins private Repository
`trophytracker-backup` kommt in Stufe 8.

Pull Requests durchlaufen Tests und Build, deployen aber nicht.

## Wiederherstellung

Einmal testweise durchspielen, solange nichts kaputt ist – ein ungetestetes
Backup ist eine Vermutung.

```bash
npx wrangler d1 create trophytracker-restore
npx wrangler d1 execute trophytracker-restore --remote --file=backup.sql
```

Danach die `database_id` in `wrangler.jsonc` auf die neue Datenbank umstellen und
deployen.

Zusätzlich bietet Cloudflare `wrangler d1 time-travel` zum Zurückstellen auf
einen Zeitpunkt. Das hilft gegen Bedienfehler, aber nicht gegen ein verlorenes
Konto – dafür ist der wöchentliche Export in das private Repository zuständig.

## Kosten

Der gesamte Stack liegt im Free-Tier. Wichtiger als die Grenzen ist, wie
Cloudflare mit dem Überschreiten umgeht: Die Free-Pläne **blocken**, statt in
eine Überziehung hineinzurechnen.

| Dienst | Free-Grenze | Bei Überschreitung |
|---|---|---|
| Workers (inkl. Static Assets) | 100.000 Anfragen/Tag | Fehler 1027 bzw. 429, keine Abrechnung |
| D1 | 5 GB, 5 Mio. gelesene / 100.000 geschriebene Zeilen pro Tag | Abfragen schlagen fehl, keine Abrechnung |
| Zero Trust Access | 50 Sitze | weitere Nutzer werden abgewiesen |

Der Wechsel in einen Bezahlmodus ist deshalb immer eine ausdrückliche Handlung,
kein Nebeneffekt von Nutzung. Für einen einzelnen Nutzer sind die Grenzen um
Größenordnungen entfernt.

## Was niemals ins Repository gehört

NPSSO und PSN-Refresh-Token, IGDB/Twitch-Zugangsdaten, AWIN-Feed-URLs (sie
enthalten die Publisher-ID), API-Bearer-Token, der Cloudflare-API-Token – und
unter keinen Umständen ein Datenbank-Dump. `.dev.vars`, `.wrangler/` und `*.sql`
stehen in der `.gitignore`; `migrations/*.sql` ist davon ausgenommen, weil die
Migrationen eingecheckt sein müssen.
