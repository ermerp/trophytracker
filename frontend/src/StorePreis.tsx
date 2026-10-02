import { storeGrundpreisText, storeUrl, storepreisText, type StorePreis as StorePreisDaten } from './api'

/**
 * Der Neupreis der digitalen Fassung (Stufe 21, Abschnitt 7.4).
 *
 * Eine eigene Datei aus demselben Grund wie `Preis.tsx`: Drei Listen und das
 * Spieldetail brauchen ihn, und die Beschriftung soll an einer Stelle stehen.
 *
 * Drei Dinge stehen hier bewusst zusammen:
 *
 * - **„Digital"** als Kanalbezeichnung. Store- und Gebrauchtpreis dürfen nie
 *   zu einem Wert verrechnet werden (Abschnitt 6), und zwei nackte Zahlen
 *   nebeneinander wären genau das.
 * - **„im PS Plus-Katalog"** als Beschriftung, nie als gezeichnetes Zeichen –
 *   ein gemaltes „PS+" wäre ein Monogramm (Markenregel in CLAUDE.md). Es
 *   steht nur da, wo der Store einen Katalog-Knopf nennt, nicht bei einem
 *   bloßen Probespiel.
 * - **Der Produktname**, wenn er vom eigenen Titel abweicht. Sony verkauft
 *   manche Spiele nur noch als Edition („NieR: Automata Game of the YoRHa
 *   Edition"), und manchmal ist es bloß die deutsche Fassung desselben
 *   Namens. Welches von beidem, kann nur der Nutzer entscheiden – also
 *   bekommt er es zu sehen, statt dass der Preis vorgibt, zum eigenen Titel
 *   zu gehören.
 *
 * Ohne Preis steht „unbekannt", nie „0", „–" oder „nicht verfügbar"
 * (Abschnitt 3).
 *
 * `knapp` lässt den Produktnamen weg. Das ist die Fassung für die Listen:
 * Im Bild bei 360 px machte „· als ‚Spiel 8'" aus einer Kachelzeile drei,
 * und in einer 171 px breiten Kachel ist das zu teuer für einen Hinweis, der
 * erst beim Vergleichen etwas nützt. Im Spieldetail steht er voll da – dort
 * ist Platz, und dort wird entschieden.
 */
export function StorePreis({ store, knapp = false }: { store: StorePreisDaten | null; knapp?: boolean }) {
  const text = storepreisText(store)
  if (store === null) return <>{text}</>
  const url = storeUrl(store.produktId)
  // Der Link umfasst NUR den Preis. „statt 25,54 €" ist Zusammenhang, kein
  // Ziel - im Bild bei 1280 px lief die Unterstreichung sonst ueber beide
  // Zahlen und las sich wie ein zweiter Preis zum Anklicken.
  return (
    <>
      {url === null ? (
        text
      ) : (
        <a href={url} target="_blank" rel="noreferrer noopener" title="Im PlayStation Store ansehen">
          {text}
        </a>
      )}
      {storeGrundpreisText(store) !== null && <span className="still">{storeGrundpreisText(store)}</span>}
      {store.imPlusKatalog && <span className="still"> · im PS Plus-Katalog</span>}
      {!knapp && store.produktName !== null && <span className="still"> · als „{store.produktName}"</span>}
    </>
  )
}
