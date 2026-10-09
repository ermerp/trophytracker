import { useState } from 'react'
import {
  PLAN_ARTTEXT,
  QUELLENTEXT,
  STATUSTEXT,
  anfrage,
  datum,
  gebrauchtpreisText,
  marktBefund,
  produktNameAbweichend,
  storeBefundText,
  storeUrlAndereRegion,
  type ErfasstAntwort,
} from '../api'
import { PlattformChip, TrophaeenStufen, zustandsFarbe } from '../SpielTeile'
import { StorePreis } from '../StorePreis'
import { Trophaeenliste } from '../Trophaeenliste'
import { Zeichen } from '../Symbole'
import { spielzeitText } from '../spielzeit'
import { BesitzKnopf } from './BesitzKnopf'
import { QuellenTafel } from './QuellenTafel'
import { ReleaseMenue } from './ReleaseMenue'
import { ZustandTafel } from './ZustandTafel'
import type { Release, Spiel, Stufen } from './typen'

/**
 * Eine Release-Karte: Besitz, Trophäen, Zustand.
 *
 * Die Reihenfolge ist die Entscheidung des Nutzers vom 27.09.2026 – erst der
 * Prozentwert mit Balken, dann der eigene Zustand, dann die Stufen. So
 * schliesst der Zustand den Fortschritt ab und leitet zu dem über, was ab
 * Stufe 19b darunter aufklappt: die einzelnen Trophäen.
 */
export function ReleaseKarte({
  release: r,
  spiel,
  laeuft,
  tue,
  erfassen,
  onLoeschen,
}: {
  release: Release
  spiel: Spiel
  laeuft: boolean
  tue: (aktion: () => Promise<unknown>, erfolg?: string) => Promise<void>
  erfassen: (aktion: () => Promise<ErfasstAntwort>, erfolg: string) => Promise<void>
  onLoeschen: () => void
}) {
  const [menue, setMenue] = useState(false)
  const [zustand, setZustand] = useState(false)
  const [quellenwahl, setQuellenwahl] = useState(false)

  const disc = r.exemplare.length > 0
  const gekauft = r.digital.find((d) => d.quelle !== 'plus')
  const plus = r.digital.find((d) => d.quelle === 'plus')
  const digital = gekauft ?? plus ?? null
  const status = r.bewertung?.status ?? null
  const listenEintrag = spiel.plaene.find((p) => p.releaseId === r.id && (p.art === 'todo' || p.art === 'backlog'))

  // Spielzeit gibt es nur für PS4 und PS5 (7.7). Bei PS3 und Vita steht
  // deshalb gar nichts statt „unbekannt": Sie ist dort nicht unbekannt,
  // sondern nicht vorgesehen – dieselbe Dreiwertigkeit wie beim
  // Platin-Zeichen (Entscheidung des Nutzers vom 27.09.2026).
  const spielzeitVorgesehen = r.plattform === 'PS4' || r.plattform === 'PS5'

  const erspielt = r.trophaeen ? summe(r.trophaeen.erspielt) : 0
  const definiert = r.trophaeen ? summe(r.trophaeen.definiert) : 0

  return (
    <section className="karte release">
      {/* Plattform, Besitz und das Punktmenü stehen in **einer** Zeile
          (Wunsch des Nutzers vom 27.09.2026). Der Besitz stand vorher als
          eigener Block darunter und schob die Trophäen nach unten, obwohl er
          zusammen mit dem Kennzeichen dieselbe Frage beantwortet: Was habe
          ich hier, und auf welcher Plattform. */}
      <div className="releasekopf">
        <PlattformChip plattform={r.plattform} gross />

        <div className="besitzknoepfe">
        <BesitzKnopf
          name="disc"
          wort="Disc"
          gesetzt={disc}
          satz={disc ? 'im Regal' : 'erfassen'}
          laeuft={laeuft}
          onErfassen={() => {
            if (!confirm(`Disc für ${r.plattform} erfassen?`)) return
            void erfassen(() => anfrage<ErfasstAntwort>('/api/physical-copies', { methode: 'POST', koerper: { releaseId: r.id } }), 'Disc erfasst.')
          }}
        />
        <BesitzKnopf
          name={digital && !gekauft ? 'psplus' : 'wolke'}
          wort={digital ? QUELLENTEXT[digital.quelle] : 'Digital'}
          // Von PSN erkannt heisst: kein Knopf. Der nächste Lauf legte die
          // Zeile ohnehin wieder an (7.7).
          gesetzt={digital !== null}
          satz={digital ? (digital.herkunft === 'psn' ? 'von PSN erkannt' : datum(digital.erworbenAm)) : 'wählen'}
          laeuft={laeuft}
          // Kein stiller Standardwert: Die erste Fassung von 19c legte ohne
          // Rückfrage „Kauf" an – genau der vorbelegte Wert, der in der
          // Produktion acht falsche Einträge erzeugt hat, alle am Anfang des
          // Alphabets (Befund vom 27.09.2026). Ein freiwilliges Feld bleibt
          // leer, statt mit einem plausiblen Wert vorbelegt zu werden
          // (Abschnitt 3).
          onErfassen={() => setQuellenwahl(!quellenwahl)}
        />
        </div>

        <span className="menueanker">
          <button
            type="button"
            className="ikone klein"
            aria-label={`Mehr zum ${r.plattform}-Release`}
            aria-expanded={menue}
            onClick={() => setMenue(!menue)}
          >
            <Zeichen name="mehr" groesse={20} />
          </button>
          {menue && (
            <ReleaseMenue
              release={r}
              laeuft={laeuft}
              schliessen={() => setMenue(false)}
              tue={tue}
              onLoeschen={onLoeschen}
            />
          )}
        </span>
      </div>

      {quellenwahl && (
        <QuellenTafel
          belegt={r.digital.map((d) => d.quelle)}
          laeuft={laeuft}
          schliessen={() => setQuellenwahl(false)}
          onWaehlen={(q) => {
            setQuellenwahl(false)
            void erfassen(
              () => anfrage<ErfasstAntwort>('/api/digital-entitlements', { methode: 'POST', koerper: { releaseId: r.id, quelle: q } }),
              `„${QUELLENTEXT[q]}" erfasst.`,
            )
          }}
        />
      )}

      {r.trophaeen ? (
        <>
          <p className="trophzeile">
            <span className="prozent" style={{ color: zustandsFarbe(status) }}>
              {r.trophaeen.fortschritt}&thinsp;%
            </span>
            <span className="still">
              <span className="zahl">{erspielt}</span> von <span className="zahl">{definiert}</span> Trophäen
            </span>
          </p>
          <div className="balken">
            <div style={{ width: `${r.trophaeen.fortschritt}%`, background: zustandsFarbe(status) }} />
          </div>
        </>
      ) : (
        <p className="still">Keine Trophäenliste – dieses Release ist keiner Liste von Sony zugeordnet.</p>
      )}

      <div className="zustandzeile">
        <span className="zustand">
          <span className="punkt" style={{ background: zustandsFarbe(status) }} />
          {status ? STATUSTEXT[status] : 'kein Status'}
        </span>
        {listenEintrag && <span className="still">· auf {PLAN_ARTTEXT[listenEintrag.art]}</span>}
        <button type="button" className="knopf leiser" disabled={laeuft} onClick={() => setZustand(!zustand)}>
          ändern
        </button>
      </div>

      {/* Der Gebrauchtpreis steht nur da, wenn die Disc NICHT im Regal liegt:
          Wer sie hat, braucht kein Angebot. „ab" und der Anbietername sind
          Pflicht – die Zahl ist eine Forderung, kein Wert (Abschnitt 6). */}
      {!disc && r.markt && (
        <p className="still">
          {r.markt.preisCents !== null ? (
            <>
              Gebraucht: {gebrauchtpreisText(r.markt.preisCents, r.markt.anbieter)}
              {r.markt.zustand && ` (${r.markt.zustand})`}
              {/* Eigene Zeile statt „· Angebot ansehen" hinter dem Preis: Bei
                  360 px brach die Zeile dort um und begann mit dem Trennpunkt. */}
              {r.markt.url && (
                <>
                  <br />
                  <a href={r.markt.url} target="_blank" rel="noreferrer noopener">Angebot ansehen</a>
                </>
              )}
            </>
          ) : (
            (marktBefund(r.markt.rohangebote, r.markt.geprueftAm) ?? 'Gebraucht: unbekannt')
          )}
        </p>
      )}

      {/* Der Store-Preis steht UNTER dem Gebrauchtpreis und unabhängig davon,
          ob die Disc im Regal liegt: Wer die Disc hat, kann die digitale
          Fassung trotzdem noch kaufen wollen – und bei einem Titel ohne Disc
          ist das hier der einzige Preis. Nie mit dem Gebrauchtpreis zu einem
          Wert verrechnet (Abschnitt 6). */}
      {r.store && (
        <p className="still">
          {r.store.preisCents !== null ? (
            <StorePreis
              store={{
                preisCents: r.store.preisCents,
                grundpreisCents: r.store.grundpreisCents,
                imAngebot: r.store.imAngebot,
                imPlusKatalog: r.store.imPlusKatalog,
                produktName: produktNameAbweichend(r.store.produktName, spiel.titel),
                produktId: r.store.produktId,
              }}
            />
          ) : (
            <>
              {storeBefundText(r.store.befund, r.store.geprueftAm, r.store.imPlusKatalog)}
              {/* Nur beim regionalen Fall: Der Titel existiert, bloß nicht
                  hier. Der Preis dort steht in Pfund und bleibt deshalb weg
                  – gezeigt wird der Weg, nicht eine zweite Währung. */}
              {r.store.befund === 'regional' && storeUrlAndereRegion(r.store.conceptId) !== null && (
                <>
                  <br />
                  <a
                    href={storeUrlAndereRegion(r.store.conceptId) ?? undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    im britischen Store ansehen
                  </a>
                </>
              )}
            </>
          )}
        </p>
      )}

      {zustand && (
        <ZustandTafel
          aktuell={status}
          laeuft={laeuft}
          schliessen={() => setZustand(false)}
          onWaehlen={(s) => {
            setZustand(false)
            void tue(
              () => anfrage(`/api/releases/${r.id}/play-status`, { methode: 'PUT', koerper: { status: s } }),
              `Zustand: ${STATUSTEXT[s]}.`,
            )
          }}
        />
      )}

      {/* Überschrift mit Zahl und Pfeil, darunter die Zeichen, darunter – beim
          Aufklappen – die einzelnen Trophäen (Stufe 19b, Rückmeldung des
          Nutzers vom 01.10.2026). Die Zeichen bleiben beim Öffnen stehen.
          Geladen wird erst beim Öffnen: Eine Liste sind rund 91 gelesene
          Zeilen, und ein Spiel mit drei Releases soll sie nicht alle
          mitbringen. */}
      {r.trophaeen && (
        <Trophaeenliste
          releaseId={r.id}
          erspielt={erspielt}
          definiert={definiert}
        >
          <TrophaeenStufen erspielt={r.trophaeen.erspielt} definiert={r.trophaeen.definiert} />
        </Trophaeenliste>
      )}

      {/* Zwei feste Zeilen statt eines Flusses mit „·": Auf dem Handy brach
          der Text ohnehin um, und der Umbruch lag je nach Datumslänge
          woanders (Wunsch des Nutzers vom 27.09.2026). */}
      <p className="still fusszeile">
        {r.trophaeen && <span className="reihe">zuletzt gespielt {datum(r.trophaeen.zuletztGespielt)}</span>}
        {spielzeitVorgesehen && (
          <span className="reihe">
            Spielzeit <span className="zahl">{spielzeitText(r.spielzeit?.sekunden ?? null)}</span>
            {r.spielzeit?.anzahl ? <> in <span className="zahl">{r.spielzeit.anzahl}</span> Sitzungen</> : null}
          </span>
        )}
      </p>
    </section>
  )
}

const summe = (s: Stufen) => s.bronze + s.silber + s.gold + s.platin
