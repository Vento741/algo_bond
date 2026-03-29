import { TrendingUp } from 'lucide-react'

function App() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <TrendingUp className="w-10 h-10 text-brand-profit" />
          <h1 className="text-4xl font-bold text-white">AlgoBond</h1>
        </div>
        <p className="text-brand-accent text-lg">
          Платформа алгоритмической торговли
        </p>
        <p className="text-gray-500 mt-2 font-data">v0.1.0</p>
      </div>
    </div>
  )
}

export default App
