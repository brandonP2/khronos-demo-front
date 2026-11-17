// Inventory, for the owner only: stock (the main screen), the physical count, the movements'
// history, purchase orders with their reception, and suppliers. Each has its own address under
// /inventory, so the summary and the screens can link to a filter, an order or a product.
import { Navigate, Route, Routes } from 'react-router-dom'
import StockTab from './StockTab'

export default function InventoryPage() {
  return (
    <Routes>
      <Route index element={<StockTab />} />
      <Route path="*" element={<Navigate to="/inventory" replace />} />
    </Routes>
  )
}
