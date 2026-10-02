/**
 * Ein Gebrauchtpreis, bei vorhandenem Angebot als Link (Stufe 20e).
 *
 * Eine eigene Datei, weil ihn drei Listen und das Spieldetail brauchen und
 * die Beschriftung an einer Stelle stehen soll: Die Zahl ist eine **Forderung
 * bei einem Anbieter**, kein Wert – verkaufte Preise gibt eBay nicht heraus
 * (7.3). Ohne Angebot steht „unbekannt", nie „0" oder „–" (Abschnitt 3).
 *
 * Der Link kann ins Leere führen: Ein eBay-Angebot verschwindet, wenn es
 * verkauft ist, und wir fragen einmal am Tag nach. Das `title` sagt es, damit
 * niemand einen Fehler vermutet, wo keiner ist.
 */
export function Preis({ text, url }: { text: string; url: string | null }) {
  if (url === null) return <>{text}</>
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" title="Angebot bei eBay – kann inzwischen verkauft sein">
      {text}
    </a>
  )
}
