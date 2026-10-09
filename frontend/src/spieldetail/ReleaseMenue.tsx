import { DISCQUELLE, DISC_FASSUNGEN, QUELLENTEXT, anfrage } from '../api'
import { PsnProduktId } from './PsnProduktId'
import type { Release } from './typen'
import { useEscape } from './useEscape'

/** Das Punktmenü des Release: Disc-Fassung, PSN-Id, Entfernen, Löschen. */
export function ReleaseMenue({
  release: r,
  laeuft,
  schliessen,
  tue,
  onLoeschen,
}: {
  release: Release
  laeuft: boolean
  schliessen: () => void
  tue: (aktion: () => Promise<unknown>, erfolg?: string) => Promise<void>
  onLoeschen: () => void
}) {
  useEscape(schliessen)
  return (
    <div className="tafel menuetafel" role="menu">
      {r.trophaeen && (
        <>
          {/* Der Rohtitel von Sony steht hier statt auf der Karte: Er weicht
              bei 132 der 431 Listen ab (gemessen 27.09.2026) und wäre dort
              auf jedem dritten Spiel eine zweite Zeile. Gebraucht wird er
              beim Zweifel an der Zuordnung – und dafür schlägt man nach. */}
          <div className="tafelname">Trophäenliste</div>
          <p className="menuezeile">
            <span className="still">
              bei Sony: „{r.trophaeen.rohTitel}"
              <br />
              {r.trophaeen.npCommunicationId}
            </span>
          </p>
        </>
      )}

      <div className="tafelname">Disc-Fassung</div>
      <p className="menuezeile">
        <label>
          <select
            value={r.discFassung}
            disabled={laeuft}
            onChange={(ev) => {
              schliessen()
              void tue(
                () => anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { discFassung: ev.target.value } }),
                'Disc-Fassung gespeichert.',
              )
            }}
          >
            {DISC_FASSUNGEN.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        {r.discQuelle && <span className="still"> {DISCQUELLE[r.discQuelle] ?? r.discQuelle}</span>}
      </p>

      <div className="tafelname">Store-Adresse</div>
      <PsnProduktId
        key={r.psnProductId ?? ''}
        release={r}
        laeuft={laeuft}
        onSpeichern={(wert) => {
          schliessen()
          // Leeren setzt die Zuordnung zurück – und löst danach sofort neu
          // auf (Stufe 21e). Ohne den zweiten Schritt bliebe die Zeile wegen
          // der Tagesfrist bis zum nächsten Morgen stumm, und genau das ist
          // der Weg, mit dem man eine falsche Zuordnung loswird.
          if (wert === null) {
            void tue(async () => {
              await anfrage(`/api/releases/${r.id}`, { methode: 'PATCH', koerper: { psnProductId: null } })
              return anfrage(`/api/sync/store/${r.id}`, { methode: 'POST', koerper: {} })
            }, 'Zurückgesetzt und neu aufgelöst.')
            return
          }
          void tue(
            () => anfrage(`/api/sync/store/${r.id}`, { methode: 'POST', koerper: { adresse: wert } }),
            'Eingetragen, Preis geholt.',
          )
        }}
      />

      {(r.exemplare.length > 0 || r.digital.some((d) => d.herkunft === 'nutzer')) && (
        <>
          <div className="tafelname">Besitz entfernen</div>
          {r.exemplare.map((e) => (
            <p key={e.id} className="menuezeile">
              <span>
                Disc
                {/* Die EAN bleibt der Zuordnung erhalten: Sie steht in
                    `ean_mapping` am Release, nicht am Exemplar, und ein
                    gelöschtes Exemplar fasst sie nicht an (Abschnitt 9.2). */}
                {e.ean && <span className="still"> · EAN {e.ean}</span>}
              </span>
              <button
                type="button"
                className="knopf gefahr"
                disabled={laeuft}
                onClick={() => {
                  if (!confirm('Diese Disc entfernen? Die gescannte EAN bleibt dem Release zugeordnet.')) return
                  schliessen()
                  void tue(() => anfrage(`/api/physical-copies/${e.id}`, { methode: 'DELETE' }), 'Disc entfernt.')
                }}
              >
                entfernen
              </button>
            </p>
          ))}
          {r.digital
            .filter((d) => d.herkunft === 'nutzer')
            .map((d) => (
              <p key={d.id} className="menuezeile">
                <span>{QUELLENTEXT[d.quelle]}</span>
                <button
                  type="button"
                  className="knopf gefahr"
                  disabled={laeuft}
                  onClick={() => {
                    if (!confirm(`„${QUELLENTEXT[d.quelle]}" entfernen?`)) return
                    schliessen()
                    void tue(() => anfrage(`/api/digital-entitlements/${d.id}`, { methode: 'DELETE' }), 'Entfernt.')
                  }}
                >
                  entfernen
                </button>
              </p>
            ))}
        </>
      )}

      <div className="tafelname gefahr">Gefährlich</div>
      <p className="menuezeile">
        <button
          type="button"
          className="knopf gefahr"
          disabled={laeuft}
          onClick={() => {
            schliessen()
            onLoeschen()
          }}
        >
          Release löschen
        </button>
      </p>
    </div>
  )
}
