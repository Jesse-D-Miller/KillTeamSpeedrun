import './App.css'
import UnitCard from './components/UnitCard'
import kommandos from './data/kommandos.json'

function App() {

  return (
    <div className="App">
      {kommandos.map((unit) => (
        <UnitCard key={unit.id} unit={unit} />
      ))}
    </div>
  )
}

export default App
