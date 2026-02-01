import { useEffect, useState } from "react";
import { API_URL } from "../config";

export type Promo = {
  id: number;
  name: string;
  active: boolean;
  daysOfWeek: string;

  triggerCategory?: string | null;
  triggerProductIds?: string | null;

  rewardType: "ITEM_FREE" | "DISCOUNT_PERCENT" | "FIXED_PRICE" | "OPTION_FREE";
  rewardCategory?: string | null;
  rewardProductIds?: string | null;

  discountPercent?: number | null;
  fixedPrice?: number | null;
  maxRewardQty: number;
  showOnMenu: boolean;
};

export function csvToIds(v?: string | null): number[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

export function usePromotionsToday() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/promotions/active-today`);
        const data = await res.json();
        setPromos(Array.isArray(data) ? data : []);
      } catch {
        setPromos([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { promos, loading };
}
