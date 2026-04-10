import { Routes, Route } from 'react-router-dom'
import './App.css'
import SearchPage from './SearchPage'
import AdminPage from './AdminPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<SearchPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  )
}

export default App