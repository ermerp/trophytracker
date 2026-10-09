import { Zeichen } from '../Symbole'

/**
 * Ein Besitzknopf. Gesetzt ist hell, fehlend steht gestrichelt da und lädt
 * zum Erfassen ein – dieselbe Regel wie überall: vorhanden hell, fehlend im
 * `--aus`-Ton (Abschnitt 13).
 *
 * **Entfernt wird hier nicht** (Entscheidung des Nutzers vom 27.09.2026): Das
 * liegt im Punktmenü des Release. In der Praxis wird selten etwas entfernt,
 * und ein Fehltipp auf einem Knopf, der beides kann, hätte die gescannte EAN
 * gekostet.
 */
export function BesitzKnopf({
  name,
  wort,
  satz,
  gesetzt,
  laeuft,
  onErfassen,
}: {
  name: 'disc' | 'wolke' | 'psplus'
  wort: string
  /** Die Nebenzeile – nur im offenen Zustand sichtbar, sonst der `title`. */
  satz: string
  gesetzt: boolean
  laeuft: boolean
  onErfassen: () => void
}) {
  const zeichen = <Zeichen name={name} groesse={22} strich={1.4} />

  // Gesetzt: reine Anzeige, kein Knopf – entfernt wird im Punktmenü. Und
  // **ohne Nebenzeile**: Seit die Knöpfe neben dem Kennzeichen stehen, bleiben
  // je rund 110 px, und „2× im Regal" wurde zu „2× im R…" (gesehen im Bild vom
  // 27.09.2026). Das Wort sagt, was es ist, der helle Ton sagt, dass es da
  // ist – die Herkunft steht im `title` und im Menü. Nur eine Stückzahl über
  // eins kommt ans Wort, weil sie sonst verschwände.
  if (gesetzt) {
    return (
      <span className="besitzknopf" title={`${wort} – ${satz}`}>
        {zeichen}
        <span className="wort">
          <b>{wort}</b>
        </span>
      </span>
    )
  }
  return (
    <button type="button" className="besitzknopf aus" disabled={laeuft} onClick={onErfassen} title={`${wort} erfassen`}>
      {zeichen}
      <span className="wort">
        <b>{wort}</b>
        <span>{satz}</span>
      </span>
    </button>
  )
}
