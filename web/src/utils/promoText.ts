import type { Promo } from "../hooks/usePromotionsToday";
import { csvToIds } from "../hooks/usePromotionsToday";

export function buildPromoText(p: Promo, productNameById: (id: number) => string, categoryName?: string) {
  const triggerIds = csvToIds(p.triggerProductIds);
  const rewardIds = csvToIds(p.rewardProductIds);

  const triggerLabel =
    triggerIds.length > 0
      ? triggerIds.map(productNameById).join(" ou ")
      : (p.triggerCategory || "um item elegível");

  const rewardLabel =
    rewardIds.length > 0
      ? rewardIds.map(productNameById).join(" ou ")
      : (p.rewardCategory || "um item");

  if (p.rewardType === "ITEM_FREE") {
    const qtd = p.maxRewardQty || 1;
    return `Comprando ${triggerLabel}, ganha ${qtd} ${rewardLabel}`;
  }

  if (p.rewardType === "DISCOUNT_PERCENT") {
    return `Comprando ${triggerLabel}, ${rewardLabel} com ${p.discountPercent ?? 0}% OFF`;
  }

  if (p.rewardType === "FIXED_PRICE") {
    return `Comprando ${triggerLabel}, ${rewardLabel} por R$ ${Number(p.fixedPrice ?? 0).toFixed(2)}`;
  }

  if (p.rewardType === "OPTION_FREE") {
    return `Comprando ${triggerLabel}, ganha opção grátis (ex: borda)`;
  }

  return `Promoção: ${p.name}`;
}
