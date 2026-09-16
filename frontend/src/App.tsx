import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Abweichungen } from './Abweichungen'
import { Aenderungen } from './Aenderungen'
import { Backlog } from './Backlog'
import { Luecken } from './Luecken'
import { Einstellungen } from './Einstellungen'
import { ErscheintBald } from './ErscheintBald'
import { Kaufliste } from './Kaufliste'
import { Igdb } from './Igdb'
import { IgdbZuordnung } from './IgdbZuordnung'
import { Navigation } from './Navigation'
import { OhneZuordnung } from './OhneZuordnung'
import { Pruefliste } from './Pruefliste'
import { Sammlung } from './Sammlung'
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
        <Routes>
          <Route path="/" element={<Navigate to="/sammlung" replace />} />
          <Route path="/sammlung" element={<Sammlung />} />
          <Route path="/spiel/:id" element={<Spieldetail />} />
          <Route path="/wunschliste" element={<Wunschliste />} />
          <Route path="/todo" element={<Todo />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/luecken" element={<Luecken />} />
          <Route path="/kaufliste" element={<Kaufliste />} />
          <Route path="/erscheint-bald" element={<ErscheintBald />} />
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
          <Route path="*" element={<Navigate to="/sammlung" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
