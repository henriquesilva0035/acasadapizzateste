import { useEffect, useState } from "react";
import { API_URL } from "../config";

export type Promo = {
 
  id: number;
  name: string;
  active: boolean;
  daysOfWeek: string;

  triggerCategory?: string | null;
  triggerProductIds?: string | null;
  triggerOptionItemIds?: string | null;   // ✅ ADD

  rewardType: "ITEM_FREE" | "OPTION_FREE" | "DISCOUNT_PERCENT" | "FIXED_PRICE"; // ✅ inclua FIXED_PRICE
  rewardCategory?: string | null;
  rewardProductIds?: string | null;
  rewardOptionItemIds?: string | null;    // ✅ ADD

  discountPercent?: number | null;
  fixedPrice?: number | null;             // ✅ ADD
  maxRewardQty?: number | null;
  showOnMenu?: boolean | null;

  createdAt?: string;
  updatedAt?: string;
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
