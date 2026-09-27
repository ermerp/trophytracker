import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { Abweichungen } from './Abweichungen'
import { Aenderungen } from './Aenderungen'
import { Backlog } from './Backlog'
import { Luecken } from './Luecken'
import { Einstellungen } from './Einstellungen'
import { ErscheintBald } from './ErscheintBald'
import { Kaufliste } from './Kaufliste'
import { Igdb } from './Igdb'
import { IgdbZuordnung } from './IgdbZuordnung'
import { NachOben } from './NachOben'
import { Navigation } from './Navigation'
import { Offline } from './Offline'
import { Start } from './Start'
import { OhneZuordnung } from './OhneZuordnung'
import { Pruefliste } from './Pruefliste'
import { Sammlung } from './Sammlung'
import { Scannen } from './Scannen'
import { SammlungPruefen } from './SammlungPruefen'
import { Sicherung } from './Sicherung'
import { Todo } from './Todo'
import { Spieldetail } from './Spieldetail'
import { Trophaeen } from './Trophaeen'
import { Wunschliste } from './Wunschliste'
import { WunschlisteImport } from './WunschlisteImport'
import { Zuordnung } from './Zuordnung'
import './App.css'

/**
 * Ansichten nach Abschnitt 13. Der SPA-Fallback im Worker
 * (`not_found_handling: single-page-application`) liefert für jeden
 * unbekannten Pfad die index.html, sodass Direktaufrufe wie /spiel/42
 * funktionieren.
 */

/**
 * Ein neuer Ort beginnt oben (Nachbesserung zu 19c, 27.09.2026).
 *
 * React Router scrollt bei einem Wechsel nicht von selbst, und ohne diese
 * Zusicherung hängt die Scrollhöhe davon ab, was der Browser gerade für
 * richtig hält – Scroll-Anchoring, wiederhergestellte History-Einträge,
 * asynchron nachwachsender Inhalt.
 *
 * **Das ist eine Zusicherung, keine belegte Fehlerbehebung.** Der Nutzer hat
 * am 27.09.2026 gemeldet, dass ein Spiel auf dem Handy nach unten gescrollt
 * aufgeht; im Headless-Browser liess sich das **nicht** nachstellen – weder
 * lokal noch gegen die Produktion, beide öffneten bei 0. Die wahrscheinlichere
 * Ursache ist der fehlende Abstand über dem Cover (`.detail`): Es sass direkt
 * an der klebenden Kopfzeile, und schon ein kleiner Scroll schob es darunter.
 * Beides ist geändert, aber nur das Zweite ist gemessen – wer später sucht,
 * soll nicht glauben, hier stünde die Ursache.
 *
 * **Nur bei PUSH**, nicht bei POP: Ein „Zurück" soll die Liste dort zeigen,
 * wo man sie verlassen hat – dieselbe Absicht wie bei den Filtern in der URL
 * (Abschnitt 13). Gemessen: Der Rückweg stellt die Höhe heute ohnehin nicht
 * wieder her, weder mit noch ohne diese Zusicherung.
 */
function NeuerOrtBeginntOben() {
	const { pathname } = useLocation()
	const art = useNavigationType()

	useEffect(() => {
		if (art !== 'POP') window.scrollTo(0, 0)
	}, [pathname, art])

	return null
}

/** Werkzeuge, die keine Dauernavigation sind (Abschnitt 13). */
function Werkzeuge() {
  return (
    <section>
      <h2>Werkzeuge</h2>
      <ul>
        <li><Link to="/pruefliste">Prüfliste</Link> – Trophäenbestand einmal durchgehen, danach nur Änderungen</li>
        <li><Link to="/zuordnung">Zuordnung</Link> – Trophäenlisten zu Spielen und Releases machen</li>
        <li><Link to="/igdb">IGDB-Zuordnung</Link> – Spiele ohne eindeutigen IGDB-Treffer nachziehen</li>
        <li><Link to="/import">Wunschliste importieren</Link> – Textdateien einlesen, abgleichen, durchsehen</li>
        <li><Link to="/ohne-zuordnung">Ohne Zuordnung</Link> – alles ohne IGDB-Eintrag, listenübergreifend nachziehen</li>
        <li><Link to="/erscheint-bald">Erscheint bald</Link> – vorgemerkte Titel, die noch nicht erschienen sind</li>
        <li><Link to="/aenderungen">Änderungen</Link> – wer wann was geschrieben hat, nach Quelle</li>
        <li><Link to="/pruefen">Sammlung prüfen</Link> – alle Zuordnungen als Tabelle</li>
        <li><Link to="/trophaeen">Trophäen</Link> – die Rohliste von Sony</li>
      </ul>
    </section>
  )
}

function App() {
  return (
    <div className="app">
      <Navigation />
      <main>
        <NeuerOrtBeginntOben />
        <Offline />
        <Routes>
          {/* Die Startseite ist seit Stufe 19 ein eigener Ort; bis zum
              Dashboard (19a) traegt sie den Hinweisblock. */}
          <Route path="/" element={<Navigate to="/start" replace />} />
          <Route path="/start" element={<Start />} />
          <Route path="/sammlung" element={<Sammlung />} />
          <Route path="/spiel/:id" element={<Spieldetail />} />
          <Route path="/wunschliste" element={<Wunschliste />} />
          <Route path="/todo" element={<Todo />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/luecken" element={<Luecken />} />
          <Route path="/kaufliste" element={<Kaufliste />} />
          <Route path="/erscheint-bald" element={<ErscheintBald />} />
          <Route path="/scannen" element={<Scannen />} />
          <Route path="/pruefliste" element={<Pruefliste />} />
          <Route
            path="/einstellungen"
            element={
              <>
                <h1>Einstellungen</h1>
                <Einstellungen />
                <Igdb />
                <Sicherung />
                <Abweichungen />
                <Werkzeuge />
              </>
            }
          />
          <Route path="/zuordnung" element={<Zuordnung />} />
          <Route path="/igdb" element={<IgdbZuordnung />} />
          <Route path="/import" element={<WunschlisteImport />} />
          <Route path="/import/:id" element={<WunschlisteImport />} />
          <Route path="/ohne-zuordnung" element={<OhneZuordnung />} />
          <Route path="/pruefen" element={<SammlungPruefen />} />
          <Route path="/aenderungen" element={<Aenderungen />} />
          <Route path="/trophaeen" element={<Trophaeen />} />
          <Route path="*" element={<Navigate to="/start" replace />} />
        </Routes>
      </main>
      <NachOben />
    </div>
  )
}

export default App
