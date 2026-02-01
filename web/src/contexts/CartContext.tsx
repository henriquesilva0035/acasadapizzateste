// ARQUIVO: src/contexts/CartContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  productId: number;
  name: string;
  unitPrice: number;
  qty: number;
  notes?: string;
  optionSummary?: string; 
  optionIds?: number[];
};

type CartContextData = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  // ✅ ATUALIZADO: Agora pede optionSummary para saber qual excluir
  removeItem: (productId: number, optionSummary?: string) => void;
  setQty: (productId: number, optionSummary: string | undefined, qty: number) => void;
  clear: () => void;
  total: number;
};

const CartContext = createContext<CartContextData>({} as CartContextData);
const STORAGE_KEY = "cart_online_v2";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addItem(item: Omit<CartItem, "qty">, qty: number = 1) {
    setItems((prev) => {
      const idx = prev.findIndex(
  (x) => x.productId === item.productId && x.optionSummary === item.optionSummary && x.unitPrice === item.unitPrice
);

      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].qty += qty;
        return copy;
      }
      return [...prev, { ...item, qty }];
    });
  }

  // ✅ CORREÇÃO AQUI: Remove apenas se ID e Opções forem iguais
  function removeItem(productId: number, optionSummary?: string) {
    setItems((prev) => 
      prev.filter((x) => !(x.productId === productId && x.optionSummary === optionSummary))
    );
  }

  // ✅ CORREÇÃO AQUI: Atualiza quantidade do item específico
  function setQty(productId: number, optionSummary: string | undefined, qty: number) {
    setItems((prev) =>
      prev
        .map((x) => {
          if (x.productId === productId && x.optionSummary === optionSummary) {
            return { ...x, qty };
          }
          return x;
        })
        .filter((x) => x.qty > 0)
    );
  }

  function clear() {
    setItems([]);
  }

  const total = useMemo(() => {
    return items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
  }, [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, setQty, clear, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}