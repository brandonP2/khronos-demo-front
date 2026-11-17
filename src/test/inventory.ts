// Inventory fixtures: products, suppliers, movements, purchase orders and the inventory report,
// with plain defaults that each test overrides.
import type { InventoryReport, Product, PurchaseOrder, PurchaseOrderLine, StockMovement, Supplier } from '../api/types'

export function product(id: number, patch: Partial<Product> = {}): Product {
  return {
    id,
    establishmentId: 1,
    name: `Producto ${id}`,
    category: 'SPIRITS',
    unit: 'BOTTLE',
    minStock: null,
    unitCost: null,
    supplierId: null,
    supplierName: null,
    isActive: true,
    currentStock: 0,
    stockValue: null,
    isLowStock: false,
    ...patch,
  }
}

export function supplier(id: number, name: string, patch: Partial<Supplier> = {}): Supplier {
  return { id, establishmentId: 1, name, phone: null, email: null, notes: null, ...patch }
}

export function movement(id: number, patch: Partial<StockMovement> = {}): StockMovement {
  return {
    id,
    productId: 1,
    productName: 'Producto 1',
    unit: 'BOTTLE',
    type: 'PURCHASE',
    quantity: 1,
    unitCost: null,
    value: null,
    reason: null,
    date: '2026-11-17',
    createdAt: '2026-11-17T10:00:00Z',
    createdByName: 'Ana Gil',
    purchaseOrderId: null,
    stockAfter: 1,
    ...patch,
  }
}

export function orderLine(id: number, patch: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return {
    id,
    productId: 1,
    productName: 'Producto 1',
    unit: 'BOTTLE',
    quantity: 1,
    unitCost: null,
    receivedQuantity: null,
    lineTotal: null,
    ...patch,
  }
}

export function order(id: number, patch: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id,
    establishmentId: 1,
    supplierId: 7,
    supplierName: 'Distribuciones Sur',
    status: 'DRAFT',
    orderDate: null,
    expectedDate: null,
    receivedDate: null,
    notes: null,
    lines: [],
    total: null,
    expenseId: null,
    createdAt: '2026-11-16T09:00:00Z',
    createdByName: 'Ana Gil',
    ...patch,
  }
}

export function inventoryReport(patch: Partial<InventoryReport> = {}): InventoryReport {
  return {
    from: '2026-11-16',
    to: '2026-11-22',
    currency: 'EUR',
    stockValue: 0,
    productsCount: 0,
    lowStockCount: 0,
    negativeStockCount: 0,
    purchasesValue: 0,
    wasteValue: 0,
    countDifferenceValue: 0,
    wasteByProduct: [],
    lowStock: [],
    ...patch,
  }
}
