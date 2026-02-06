import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient, Prisma } from "@prisma/client";


import { Server } from 'socket.io'
import printerService from './services/PrintingService.js'
import backupService from './services/BackupService.js'
import whatsappService from './services/WhatsappService.js'
import { marketingRoutes } from './routes/marketing.routes.js'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import sharp from "sharp";

const app = Fastify({ bodyLimit: 50 * 1024 * 1024 })
const prisma = new PrismaClient();

let io: Server



let syncRunning = false

// 1. Configurar CORS
app.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
})

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const RESTAURANT_ID = process.env.RESTAURANT_ID || 'default'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Registrar rotas de Marketing
app.register(marketingRoutes)



function getDowBR() {
  // 0=Dom ... 6=Sáb
  const tz = 'America/Recife'
  const local = toZonedTime(new Date(), tz)
  return local.getDay()
}

function getProductPriceToday(p: any, dow: number) {
  if (!p.promoPrice || !p.promoDays) return Number(p.price)
  const days = String(p.promoDays)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n))
  if (days.includes(dow)) return Number(p.promoPrice)
  return Number(p.price)
}

function csvIds(v: any): number[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(Number).filter((n) => !Number.isNaN(n));
  const s = String(v).trim();
  if (!s) return [];
  return s
    .split(/[,\s|]+/g)
    .map((x) => Number(x))
    .filter((n) => !Number.isNaN(n));
}

function promoAppliesToProduct(promo: any, product: any) {
  const trigIds = csvIds(promo.triggerProductIds);
  const byId = trigIds.length ? trigIds.includes(Number(product.id)) : false;
  const byCat = promo.triggerCategory ? promo.triggerCategory === product.category : false;
  // se nenhum definido, não aplica
  if (!trigIds.length && !promo.triggerCategory) return false;
  return byId || byCat;
}

function getAdjustedOptionPrice(optionItem: any, promosToday: any[], product: any): { price: number; label: string | null } {
  const original = Number(optionItem.price || 0);
  let bestPrice = original;
  let bestLabel: string | null = null;

  for (const pr of promosToday || []) {
    if (!pr?.active) continue;

    // só vamos mexer em preço de option quando a promo é FIXED_PRICE ou DISCOUNT_PERCENT
    if (pr.rewardType !== "FIXED_PRICE" && pr.rewardType !== "DISCOUNT_PERCENT") continue;

    // tem que aplicar no produto (gatilho)
    if (!promoAppliesToProduct(pr, product)) continue;

    // precisa bater o optionItemIds (sabores selecionados na promo)
    const optIds = csvIds(pr.triggerOptionItemIds);
    if (optIds.length > 0 && !optIds.includes(Number(optionItem.id))) continue;

    // aplica ajuste
    if (pr.rewardType === "FIXED_PRICE") {
      const fp = Number(pr.fixedPrice || 0);
      if (fp >= 0 && fp < bestPrice) {
        bestPrice = fp;
        bestLabel = `FIXO R$ ${fp.toFixed(2)} (${pr.name})`;
      }
    }

    if (pr.rewardType === "DISCOUNT_PERCENT") {
      const pct = Number(pr.discountPercent || 0);
      if (pct > 0 && pct <= 100) {
        const np = Number((original * (100 - pct) / 100).toFixed(2));
        if (np < bestPrice) {
          bestPrice = np;
          bestLabel = `${pct}% OFF (${pr.name})`;
        }
      }
    }
  }

  return { price: bestPrice, label: bestLabel };
}

async function priceOneItem(prismaAny: any, payloadItem: any, dow: number, promosToday: any[]) {
  const productId = Number(payloadItem.productId);
  const quantity = Math.max(1, Number(payloadItem.quantity || 1));
  const optionItemIds = (payloadItem.optionItemIds || [])
    .map((x: any) => Number(x))
    .filter((n: number) => !Number.isNaN(n));

  const product = await prismaAny.product.findUnique({
    where: { id: productId },
    include: { optionGroups: { include: { items: true } } },
  });
  if (!product) throw new Error(`Produto ${productId} não encontrado`);
  if ((product as any).available === false) throw new Error(`Produto indisponível: ${product.name}`);

  // valida seleção por grupo (min/max)
  const selectedSet = new Set(optionItemIds);
  for (const g of product.optionGroups) {
    const selectedInGroup = g.items.filter((it: any) => selectedSet.has(it.id));
    if (selectedInGroup.length < Number(g.min || 0)) {
      throw new Error(`Seleção inválida: grupo "${g.title}" exige mínimo ${g.min}`);
    }
    if (selectedInGroup.length > Number(g.max || 999)) {
      throw new Error(`Seleção inválida: grupo "${g.title}" permite no máximo ${g.max}`);
    }
  }

  const base = getProductPriceToday(product, dow);

  let addons = 0;
  const pickedItems: any[] = [];

  for (const g of product.optionGroups) {
    const selectedInGroup = (g.items || []).filter((it: any) => selectedSet.has(it.id));
    if (!selectedInGroup.length) continue;

    if ((g as any).available === false) {
      throw new Error(`Grupo indisponível: ${g.title}`);
    }

    // preços ajustados (para promo em SABOR)
    const adjustedPrices: number[] = [];

    for (const it of selectedInGroup) {
      if ((it as any).available === false) {
        throw new Error(`Opção indisponível: ${it.name}`);
      }

      const adj = getAdjustedOptionPrice(it, promosToday, product);

      pickedItems.push({
        optionItemId: it.id,           // ✅ correto
        groupId: g.id,
        groupTitle: g.title,
        name: it.name,
        price: adj.price,              // ✅ preço já ajustado
        originalPrice: Number(it.price || 0),
        promoLabel: adj.label,
        imageUrl: it.imageUrl || null,
      });

      adjustedPrices.push(adj.price);
    }

    const mode = String((g as any).chargeMode || "SUM").toUpperCase();

    let groupAdd = 0;
    if (mode === "MAX") groupAdd = Math.max(...adjustedPrices);
    else if (mode === "MIN") groupAdd = Math.min(...adjustedPrices);
    else groupAdd = adjustedPrices.reduce((a: number, b: number) => a + b, 0);

    addons += groupAdd;
  }

  const unit = Number((base + addons).toFixed(2));
  const total = Number((unit * quantity).toFixed(2));

  return {
    productId,
    product,
    quantity,
    unit,
    total,
    pickedItems,
    appliedPromos: [],
    payloadObservation: payloadItem?.observation || "",
  };
}


// ================= PROMOÇÕES V2 (motor novo / IDs em CSV string) =================

function promotionIsActiveTodayV2(promo: any, dow: number) {
  const days = String(promo.daysOfWeek || '')
    .split(',')
    .map((s: string) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n))
  return !!promo.active && days.includes(dow)
}

function csvToIntArray(v: any): number[] {
  if (!v) return []
  return String(v)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n))
}

function itemMatchesTrigger(promo: any, ci: any) {
  const triggerCategory = promo.triggerCategory ? String(promo.triggerCategory) : ''
  const triggerProductIds = csvToIntArray(promo.triggerProductIds)
  const triggerOptionItemIds = csvToIntArray(promo.triggerOptionItemIds)

  const byCategory = triggerCategory ? String(ci.product.category) === triggerCategory : false
  const byProduct = triggerProductIds.length ? triggerProductIds.includes(Number(ci.product.id)) : false
  const okBase = byCategory || byProduct
  if (!okBase) return false

  if (triggerOptionItemIds.length) {
    const selectedIds = new Set(
      (ci.pickedItems || [])
        .map((p: any) => Number(p.optionItemId))
        .filter((n: number) => !Number.isNaN(n))
    )
    return triggerOptionItemIds.every((id: number) => selectedIds.has(id))
  }

  return true
}

function itemMatchesReward(promo: any, ci: any) {
  const rewardCategory = promo.rewardCategory ? String(promo.rewardCategory) : ''
  const rewardProductIds = csvToIntArray(promo.rewardProductIds)

  if (rewardCategory && String(ci.product.category) === rewardCategory) return true
  if (rewardProductIds.length && rewardProductIds.includes(Number(ci.product.id))) return true
  return false
}

function cloneComputedItem(ci: any) {
  return {
    ...ci,
    pickedItems: Array.isArray(ci.pickedItems) ? ci.pickedItems.map((p: any) => ({ ...p })) : [],
    appliedPromos: Array.isArray(ci.appliedPromos) ? [...ci.appliedPromos] : [],
  }
}

// Divide um item por quantidade (para 1 grátis e o resto pago)
function splitItemByQty(ci: any, freeQty: number) {
  const paidQty = Math.max(0, Number(ci.quantity) - freeQty)
  const res: any[] = []

  if (freeQty > 0) {
    const free = cloneComputedItem(ci)
    free.quantity = freeQty
    free.unit = 0
    free.total = 0
    res.push(free)
  }

  if (paidQty > 0) {
    const paid = cloneComputedItem(ci)
    paid.quantity = paidQty
    paid.total = Number((Number(paid.unit) * paidQty).toFixed(2))
    res.push(paid)
  }

  return res
}

function applyItemFree(items: any[], promo: any) {
  let remaining = Math.max(1, Number(promo.maxRewardQty || 1))
  const out: any[] = []

  for (const ci0 of items) {
    const ci = cloneComputedItem(ci0)

    if (!itemMatchesReward(promo, ci) || remaining <= 0) {
      out.push(ci)
      continue
    }

    const freeQty = Math.min(Number(ci.quantity), remaining)
    const parts = splitItemByQty(ci, freeQty)

    // marca promo no(s) itens grátis
    if (freeQty > 0) {
      parts[0].appliedPromos.push({
        id: promo.id,
        name: promo.name,
        type: promo.rewardType,
      })
    }

    out.push(...parts)
    remaining -= freeQty
  }

  return out
}

function applyDiscountPercent(items: any[], promo: any) {
  const pct = Math.max(0, Math.min(100, Number(promo.discountPercent || 0)))
  const factor = (100 - pct) / 100

  return items.map((ci0) => {
    const ci = cloneComputedItem(ci0)
    if (!itemMatchesReward(promo, ci)) return ci

    const newUnit = Number((Number(ci.unit) * factor).toFixed(2))
    ci.unit = newUnit
    ci.total = Number((newUnit * Number(ci.quantity)).toFixed(2))
    ci.appliedPromos.push({ id: promo.id, name: promo.name, type: promo.rewardType })
    return ci
  })
}

function applyFixedPrice(items: any[], promo: any) {
  const fixed = Number(promo.fixedPrice)
  if (!Number.isFinite(fixed)) return items

  return items.map((ci0) => {
    const ci = cloneComputedItem(ci0)
    if (!itemMatchesReward(promo, ci)) return ci

    ci.unit = Number(fixed.toFixed(2))
    ci.total = Number((ci.unit * Number(ci.quantity)).toFixed(2))
    ci.appliedPromos.push({ id: promo.id, name: promo.name, type: promo.rewardType })
    return ci
  })
}

// OPTION_FREE: subtrai o preço das opções selecionadas (ex: borda)
function applyOptionFree(items: any[], promo: any) {
  const rewardOptionIds = new Set(csvToIntArray(promo.rewardOptionItemIds))
  if (!rewardOptionIds.size) return items

  return items.map((ci0) => {
    const ci = cloneComputedItem(ci0)
    if (!ci.pickedItems || !ci.pickedItems.length) return ci

    const discount = ci.pickedItems
      .filter((p: any) => rewardOptionIds.has(Number(p.optionItemId)))
      .reduce((acc: number, p: any) => acc + Number(p.price || 0), 0)

    if (discount <= 0) return ci

    const newUnit = Number(Math.max(0, Number(ci.unit) - discount).toFixed(2))
    ci.unit = newUnit
    ci.total = Number((newUnit * Number(ci.quantity)).toFixed(2))
    ci.appliedPromos.push({ id: promo.id, name: promo.name, type: promo.rewardType })
    return ci
  })
}


export function applyPromotionsV2(computedItems: any[], promosToday: any[]) {
  const items = computedItems.map((it) => ({
    ...it,
    appliedPromos: Array.isArray(it.appliedPromos) ? it.appliedPromos : [],
  }));

  const qtyOfProduct = (productId: number) =>
    items
      .filter((x) => Number(x.productId) === Number(productId))
      .reduce((acc, x) => acc + Number(x.quantity || 0), 0);

  const triggerOk = (promo: any) => {
    const triggerIds = parseCsvIds(promo.triggerProductIds);

    if (triggerIds.length > 0) {
      return triggerIds.some((id: number) => qtyOfProduct(id) > 0);
    }

    if (promo.triggerCategory) {
      return items.some((it) => it.product?.category === promo.triggerCategory);
    }

    return false;
  };

  /**
   * ✅ Decide se "it" é alvo da promoção.
   *
   * Regras:
   * - Se a promo TEM reward (rewardProductIds/rewardCategory), aplica NO reward.
   * - Se a promo NÃO TEM reward (reward vazio), então é "self-target": aplica NO gatilho.
   *
   * Isso é essencial para OPTION_FREE (borda grátis) e promos de desconto no próprio item.
   */
  const promoTargetsItem = (promo: any, it: any) => {
    const rewardIds = parseCsvIds(promo.rewardProductIds);
    const triggerIds = parseCsvIds(promo.triggerProductIds);

    const hasRewardTarget = rewardIds.length > 0 || !!promo.rewardCategory;

    // Caso normal: aplica na recompensa (reward)
    if (hasRewardTarget) {
      const idMatch = rewardIds.length > 0 && rewardIds.includes(Number(it.productId));
      const catMatch = promo.rewardCategory && it.product?.category === promo.rewardCategory;
      return idMatch || catMatch;
    }

    // Caso self-target: sem reward definido -> aplica no gatilho
    if (triggerIds.length > 0 && triggerIds.includes(Number(it.productId))) return true;
    if (promo.triggerCategory && it.product?.category === promo.triggerCategory) return true;

    return false;
  };

  for (const promo of promosToday) {
    if (!promo?.active) continue;
    if (!triggerOk(promo)) continue;

    const targets = items.filter((it) => promoTargetsItem(promo, it));
    if (targets.length === 0) continue;

    // DISCOUNT_PERCENT
    if (promo.rewardType === "DISCOUNT_PERCENT") {
      const pct = Number(promo.discountPercent || 0);

      for (const it of targets) {
        const baseUnit = Number(it.unit || 0);
        const newUnit = Number((baseUnit * (100 - pct) / 100).toFixed(2));
        it.unit = newUnit;
        it.total = Number((newUnit * Number(it.quantity || 1)).toFixed(2));
        it.appliedPromos.push({ id: promo.id, name: promo.name, type: promo.rewardType });
      }
      continue;
    }

    // FIXED_PRICE
    if (promo.rewardType === "FIXED_PRICE") {
      const fp = Number(promo.fixedPrice || 0);

      for (const it of targets) {
        it.unit = Number(fp.toFixed(2));
        it.total = Number((it.unit * Number(it.quantity || 1)).toFixed(2));
        it.appliedPromos.push({ id: promo.id, name: promo.name, type: promo.rewardType });
      }
      continue;
    }

    // ITEM_FREE (1 grátis e o resto pago)
    if (promo.rewardType === "ITEM_FREE") {
      let remainingFree = Number(promo.maxRewardQty || 1);

      const sortedTargets = [...targets].sort(
        (a, b) => Number(a.unit || 0) - Number(b.unit || 0)
      );

      for (const it of sortedTargets) {
        if (remainingFree <= 0) break;

        const q = Number(it.quantity || 1);

        if (q <= remainingFree) {
          it.unit = 0;
          it.total = 0;
          it.appliedPromos.push({
            id: promo.id,
            name: promo.name,
            type: promo.rewardType,
            freeQty: q,
          });
          remainingFree -= q;
        } else {
          const freeQty = remainingFree;
          const paidQty = q - freeQty;

          const paidUnit = Number(it.unit || 0);

          // item atual vira "pago"
          it.quantity = paidQty;
          it.total = Number((paidUnit * paidQty).toFixed(2));

          // cria linha grátis separada
          const freeLine = {
            ...it,
            quantity: freeQty,
            unit: 0,
            total: 0,
            appliedPromos: [
              ...it.appliedPromos,
              { id: promo.id, name: promo.name, type: promo.rewardType, freeQty },
            ],
          };

          items.push(freeLine);
          remainingFree = 0;
        }
      }
      continue;
    }

    /**
     * ✅ OPTION_FREE (ex: borda grátis)
     * Agora aplica em "targets" (que podem ser reward OU self-target dependendo da promo)
     */
    if (promo.rewardType === "OPTION_FREE") {
      const freeOptionIds = parseCsvIds(promo.rewardOptionItemIds);
      if (freeOptionIds.length === 0) continue;

      for (const it of targets) {
        const discount = (it.pickedItems || [])
          .filter((p: any) => freeOptionIds.includes(Number(p.optionItemId)))
          .reduce((acc: number, p: any) => acc + Number(p.price || 0), 0);

        if (discount <= 0) continue;

        // zera preço dessas opções (pra ficar coerente na impressão/PDV/status)
        for (const p of (it.pickedItems || [])) {
          if (freeOptionIds.includes(Number(p.optionItemId))) {
            p.price = 0;
          }
        }

        // desconta do unit/total
        it.unit = Number(Math.max(0, Number(it.unit || 0) - discount).toFixed(2));
        it.total = Number((Number(it.unit) * Number(it.quantity || 1)).toFixed(2));

        it.appliedPromos.push({ id: promo.id, name: promo.name, type: promo.rewardType });
      }

      continue;
    }
  }

  return items;
}



function parseCsvIds(v?: string | null): number[] {
  if (!v) return [];
  return String(v)
    .trim()
    .split(/[;,|\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}








// 🔥 Helper: transforma pickedItems em strings (flavors / border / additions / extras)
function buildItemStrings(pickedItems: any[]) {
  const lower = (s: string) => String(s || '').toLowerCase()

  const flavors = pickedItems
    .filter((p) => lower(p.groupTitle).includes('sabor'))
    .map((p) => p.name)
    .join(', ')

  const border = pickedItems
    .filter((p) => lower(p.groupTitle).includes('borda'))
    .map((p) => p.name)
    .join(', ')

  const additions = pickedItems
    .filter((p) => lower(p.groupTitle).includes('adicional'))
    .map((p) => p.name)
    .join(', ')

  const extras = pickedItems
    .filter(
      (p) =>
        !lower(p.groupTitle).includes('sabor') &&
        !lower(p.groupTitle).includes('borda') &&
        !lower(p.groupTitle).includes('adicional')
    )
    .map((p) => p.name)
    .join(', ')

  return { flavors, border, additions, extras }
}

function promotionIsActiveToday(promo: any, dow: number) {
  const days = String(promo.daysOfWeek || '')
    .split(',')
    .map((s: string) => Number(s.trim()))
  return promo.active && days.includes(dow)
}

function cartMatchesTrigger(promo: any, computedItems: any[]) {
  if (promo.triggerType === 'CATEGORY') {
    return computedItems.some((ci) => ci.product.category === promo.triggerValue)
  }
  if (promo.triggerType === 'NAME_CONTAINS') {
    const v = String(promo.triggerValue || '').toLowerCase()
    return computedItems.some((ci) =>
      String(ci.product.name).toLowerCase().includes(v)
    )
  }
  return false
}




// 2. ATUALIZE A ROTA GET /products PARA TRAZER A CATEGORIA CERTA
// Procure a rota app.get('/products'...) e mude o include:

app.get('/products', async (request: any, reply: any) => {
  try {
    const products = await prisma.product.findMany({
      // Ordena pela relação agora
      orderBy: [{ categoryRel: { name: 'asc' } }, { name: 'asc' }],
      include: {
        categoryRel: true, // <--- TRAZ O OBJETO CATEGORIA
        optionGroups: {
          include: { items: true },
          orderBy: { id: 'asc' },
        },
      },
    })
    
    // Mapeia para o frontend não quebrar (mantém o campo .category preenchido)
    const formatted = products.map((p: any) => ({
      ...p,
      // Se tiver relação, usa o nome dela. Se não, usa o texto antigo.
      category: p.categoryRel ? p.categoryRel.name : p.category
    }))

    return reply.send(formatted)
  } catch (err: any) {
    return reply.status(500).send({ error: err?.message })
  }
})





app.get('/products/:id', async (req: any, reply: any) => {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      optionGroups: {
        orderBy: { id: 'asc' },
        include: {
          items: { orderBy: { id: 'asc' } },
        },
      },
    },
  })

  if (!product) return reply.status(404).send({ error: 'Produto não encontrado' })
  return reply.send(product)
})

// ARQUIVO: server.ts (Adicione estas rotas)

// --- BAIRROS (TAXAS DE ENTREGA) ---

// ARQUIVO: src/server.ts

// =========================================
// 🛵 ROTAS DE BAIRROS (TAXAS DE ENTREGA)
// =========================================

// Listar todos
app.get('/neighborhoods', async () => {
  return await prisma.neighborhood.findMany({
    orderBy: { name: 'asc' },
  })
})

// Criar novo
app.post('/neighborhoods', async (req: any, reply: any) => {
  const { name, price } = req.body
  try {
    const created = await prisma.neighborhood.create({
      data: {
        name,
        price: Number(price || 0),
        active: true
      }
    })
    return created
  } catch (e) {
    return reply.status(500).send({ error: "Erro ao criar bairro" })
  }
})

// Atualizar (Ativar/Desativar ou Mudar Preço)
app.put('/neighborhoods/:id', async (req: any, reply: any) => {
  const { id } = req.params
  const { name, price, active } = req.body
  try {
    const updated = await prisma.neighborhood.update({
      where: { id: Number(id) },
      data: {
        name,
        price: price !== undefined ? Number(price) : undefined,
        active: active !== undefined ? Boolean(active) : undefined
      }
    })
    return updated
  } catch (e) {
    return reply.status(500).send({ error: "Erro ao atualizar" })
  }
})

// Excluir
app.delete('/neighborhoods/:id', async (req: any, reply: any) => {
  const { id } = req.params
  try {
    await prisma.neighborhood.delete({ where: { id: Number(id) } })
    return { ok: true }
  } catch (e) {
    return reply.status(500).send({ error: "Erro ao excluir" })
  }
})


app.post("/products", async (request: any, reply: any) => {
  const data = request.body;

  try {
    // 1. Tenta descobrir o ID da categoria baseada no nome que veio do frontend
    let catId = null;
    if (data.category) {
      const cat = await prisma.category.findUnique({
        where: { name: data.category.toUpperCase().trim() }
      });
      if (cat) catId = cat.id;
    }

    const created = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        price: Number(data.price || 0),
        promoPrice: data.promoPrice != null && data.promoPrice !== ""
          ? Number(data.promoPrice)
          : null,
        promoDays: data.promoDays ?? "",
        image: data.image ?? "🍔",
        
        // ✅ AQUI ESTÁ A MÁGICA:
        category: data.category ?? "OUTROS", // Mantém o texto (por compatibilidade)
        categoryId: catId,                   // Salva o ID (o vínculo forte)

        available: data.available ?? true,

        optionGroups: {
          create: (data.optionGroups || []).map((g: any) => ({
            title: g.title,
            min: Number(g.min || 0),
            max: Number(g.max || 1),
            chargeMode: String(g.chargeRule ?? g.chargeMode ?? "SUM").toUpperCase(),
            items: {
              create: (g.items || []).map((it: any) => ({
                name: it.name,
                price: Number(it.price || 0),
                description: it.description ?? null,
                imageUrl: it.imageUrl ?? null,
                available: it.available ?? true,
              })),
            },
          })),
        },
      },
      include: { optionGroups: { include: { items: true } } },
    });

    io?.emit("products:updated");
    return reply.send(created);
  } catch (err: any) {
    console.error("POST /products ERROR =>", err);
    return reply.status(400).send({ error: err?.message || "Erro ao criar produto" });
  }
});

app.put("/products/:id", async (request: any, reply: any) => {
  const productId = Number(request.params.id)
  const data = request.body

  try {
    // 1. Tenta descobrir o ID da categoria nova (igual fizemos no POST)
    let catId = null;
    if (data.category) {
      const cat = await prisma.category.findUnique({
        where: { name: data.category.toUpperCase().trim() }
      });
      if (cat) catId = cat.id;
    }

    // 2. Remove grupos antigos (Lógica existente)
    const oldGroups = await prisma.productOptionGroup.findMany({
      where: { productId },
      select: { id: true },
    })
    const oldGroupIds = oldGroups.map((g) => g.id)

    if (oldGroupIds.length) {
      await prisma.productOptionItem.deleteMany({
        where: { groupId: { in: oldGroupIds } },
      })
      await prisma.productOptionGroup.deleteMany({ where: { productId } })
    }

    // 3. Atualiza o produto com o novo categoryId
    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        name: data.name,
        description: data.description ?? null,
        price: Number(data.price || 0),
        promoPrice: data.promoPrice != null && data.promoPrice !== ""
          ? Number(data.promoPrice)
          : null,
        promoDays: data.promoDays ?? "",
        image: data.image ?? "🍔",
        available: data.available ?? true,

        // ✅ ATUALIZAÇÃO DUPLA (Texto + ID)
        category: data.category ?? "OUTROS",
        categoryId: catId,

        optionGroups: {
          create: (data.optionGroups || []).map((g: any) => ({
            title: g.title,
            min: Number(g.min || 0),
            max: Number(g.max || 1),
            chargeMode: String(g.chargeRule ?? g.chargeMode ?? "SUM").toUpperCase(),
            items: {
              create: (g.items || []).map((it: any) => ({
                name: it.name,
                price: Number(it.price || 0),
                description: it.description ?? null,
                imageUrl: it.imageUrl ?? null,
                available: it.available ?? true,
              })),
            },
          })),
        },
      },
      include: { optionGroups: { include: { items: true } } },
    })

    io?.emit("products:updated")
    return reply.send(updated)
  } catch (err: any) {
    console.error("PUT /products/:id ERROR =>", err)
    return reply.status(500).send({ error: err?.message || "Erro ao atualizar produto" })
  }
})

// =========================
// 📂 CATEGORIAS
// =========================
app.get("/categories", async (_req: any, reply: any) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return reply.send(cats);
  } catch (err: any) {
    return reply.status(500).send({ error: err?.message || "Erro ao listar categorias" });
  }
});

app.post("/categories", async (req: any, reply: any) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return reply.status(400).send({ error: "Nome da categoria é obrigatório" });

    // normaliza um pouco (opcional)
    const normalized = name.toUpperCase();

    const created = await prisma.category.create({
      data: { name: normalized },
    });

    // se quiser atualizar telas em tempo real:
    io?.emit("categories:updated");

    return reply.send(created);
  } catch (err: any) {
    // categoria repetida
    if (String(err?.code) === "P2002") {
      return reply.status(409).send({ error: "Essa categoria já existe" });
    }
    return reply.status(500).send({ error: err?.message || "Erro ao criar categoria" });
  }
});


// =========================
// 🗑️ APAGAR PRODUTO (com cascade manual)
// =========================
app.delete('/products/:id', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  try {
    // 1. Limpa os opcionais primeiro (isso não tem problema apagar)
    const groups = await prisma.productOptionGroup.findMany({ where: { productId: id }, select: { id: true } })
    const groupIds = groups.map((g: any) => g.id)

    if (groupIds.length > 0) {
      await prisma.productOptionItem.deleteMany({ where: { groupId: { in: groupIds } } })
    }
    await prisma.productOptionGroup.deleteMany({ where: { productId: id } })

    // 2. Tenta apagar o produto fisicamente
    await prisma.product.delete({ where: { id } })

    io?.emit('products:updated')
    return reply.send({ ok: true })

  } catch (err: any) {
    // SE DER ERRO PORQUE JÁ TEM VENDAS (Foreign Key / P2003):
    if (err.code === 'P2003' || err.message.includes('Foreign key constraint')) {
      try {
        // "Soft Delete": Desativa, renomeia e joga para o fim da lista
        await prisma.product.update({
          where: { id },
          data: {
            available: false,
            name: `(DEL) Produto ${id}`, // Renomeia para liberar o nome original
            category: 'LIXEIRA'          // Joga para uma categoria oculta
          }
        })
        io?.emit('products:updated')
        // Retorna sucesso para o usuário achar que apagou (na prática, sumiu da vista)
        return reply.send({ ok: true, message: "Produto arquivado pois possuía vendas." })
      } catch (updateErr) {
        return reply.status(500).send({ error: 'Erro ao arquivar produto.' })
      }
    }

    console.error("Erro ao deletar produto:", err)
    return reply.status(500).send({ error: 'Erro interno ao deletar.' })
  }
})


app.delete("/categories/:id", async (req: any, reply: any) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.status(400).send({ error: "ID inválido" });

    // 1. Acha a categoria
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return reply.status(404).send({ error: "Categoria não encontrada" });

    // 2. MODO TRATOR: Move qualquer produto que esteja nela para 'OUTROS'
    // (Mesmo que o count seja 0, executamos para garantir contra bugs de string)
    await prisma.product.updateMany({
      where: { category: cat.name },
      data: { category: 'OUTROS' }
    });

    // 3. Apaga a categoria
    await prisma.category.delete({ where: { id } });
    
    io?.emit("categories:updated");
    io?.emit("products:updated"); // Atualiza produtos também pois mudaram de categoria

    return reply.send({ ok: true });
  } catch (err: any) {
    console.error("Erro ao apagar categoria:", err);
    return reply.status(500).send({ error: err?.message || "Erro ao apagar categoria" });
  }
});


// ARQUIVO: server.ts

// ✅ ROTA DE EDITAR CATEGORIA (Atualiza nome + produtos)
app.put("/categories/:id", async (req: any, reply: any) => {
  const id = Number(req.params.id);
  const { name } = req.body;

  if (!Number.isFinite(id)) return reply.status(400).send({ error: "ID inválido" });
  if (!name || !name.trim()) return reply.status(400).send({ error: "Nome é obrigatório" });

  const newName = String(name).toUpperCase().trim();

  try {
    // 1. Pega o nome antigo antes de mudar
    const oldCat = await prisma.category.findUnique({ where: { id } });
    if (!oldCat) return reply.status(404).send({ error: "Categoria não encontrada" });

    // 2. Atualiza a tabela de Categorias
    const updatedCat = await prisma.category.update({
      where: { id },
      data: { name: newName },
    });

    // 3. SE O NOME MUDOU, atualiza todos os produtos que usavam o nome velho
    if (oldCat.name !== newName) {
      const updateResult = await prisma.product.updateMany({
        where: { category: oldCat.name },
        data: { category: newName },
      });
      console.log(`Categoria renomeada. ${updateResult.count} produtos atualizados.`);
    }

    // 4. Avisa os apps conectados
    io?.emit("categories:updated");
    io?.emit("products:updated");

    return reply.send(updatedCat);
  } catch (err: any) {
    if (String(err?.code) === "P2002") {
      return reply.status(409).send({ error: "Já existe uma categoria com esse nome!" });
    }
    return reply.status(500).send({ error: err?.message || "Erro ao editar categoria" });
  }
});










// --- ROTA FINANCEIRA COMPLETA ---
async function syncFinanceToSupabase(limit = 200) {
  if (!supabase) {
    console.log('⚠️ Supabase não configurado. Pulando sync.')
    return { ok: false, reason: 'missing_supabase_env' }
  }

  const orders = await prisma.order.findMany({
    where: {
      status: 'CLOSED',
      syncedAt: null,
      closedAt: { not: null },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    include: {
      items: true,
      table: true,
      payments: true,
    },
  })

  if (orders.length === 0) return { ok: true, synced: 0 }

  const ids = orders.map((o: any) => o.idString).filter(Boolean)

  const financeOrders = orders.map((o: any) => ({
    restaurant_id: RESTAURANT_ID,
    order_idstring: o.idString,
    origin: o.origin || 'LOCAL',
    payment_method: o.paymentMethod || '',
    total: Number(o.total || 0),
    delivery_fee: Number(o.deliveryFee || 0),
    closed_at: o.closedAt ? new Date(o.closedAt).toISOString() : null,
    created_at_local: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    customer_name:
      o.customerName ||
      o.customer?.name ||
      o.table?.customerName ||
      o.table?.name ||
      null,
    table_id: o.tableId || null,
  }))

  const financeItems = orders.flatMap((o: any) =>
    (o.items || []).map((it: any) => ({
      restaurant_id: RESTAURANT_ID,
      order_idstring: o.idString,
      product: it.product || '',
      category: it.category || 'GERAL',
      quantity: Number(it.quantity || 1),
      price: Number(it.price || 0),
    }))
  )

  const financePayments = orders.flatMap((o: any) =>
    (o.payments || []).map((p: any) => ({
      restaurant_id: RESTAURANT_ID,
      order_idstring: o.idString,
      method: String(p.method || '').trim(),
      amount: Number(p.amount || 0),
    }))
  )

  const up1 = await supabase
    .from('finance_orders')
    .upsert(financeOrders, { onConflict: 'restaurant_id,order_idstring' })

  if (up1.error) {
    console.error('❌ Supabase upsert finance_orders:', up1.error)
    return { ok: false, reason: 'upsert_orders_failed', error: up1.error.message }
  }

  const delItems = await supabase
    .from('finance_order_items')
    .delete()
    .eq('restaurant_id', RESTAURANT_ID)
    .in('order_idstring', ids)

  if (delItems.error) {
    console.error('❌ Supabase delete finance_order_items:', delItems.error)
    return { ok: false, reason: 'delete_items_failed', error: delItems.error.message }
  }

  const insItems = await supabase.from('finance_order_items').insert(financeItems)
  if (insItems.error) {
    console.error('❌ Supabase insert finance_order_items:', insItems.error)
    return { ok: false, reason: 'insert_items_failed', error: insItems.error.message }
  }

  if (financePayments.length) {
    const delPay = await supabase
      .from('finance_order_payments')
      .delete()
      .eq('restaurant_id', RESTAURANT_ID)
      .in('order_idstring', ids)

    if (delPay.error) {
      console.error('❌ Supabase delete finance_order_payments:', delPay.error)
      return {
        ok: false,
        reason: 'delete_payments_failed',
        error: delPay.error.message,
      }
    }

    const insPay = await supabase.from('finance_order_payments').insert(financePayments)
    if (insPay.error) {
      console.error('❌ Supabase insert finance_order_payments:', insPay.error)
      return {
        ok: false,
        reason: 'insert_payments_failed',
        error: insPay.error.message,
      }
    }
  }

  await prisma.order.updateMany({
    where: { idString: { in: ids } },
    data: { syncedAt: new Date() },
  })

  console.log(`✅ Sync Supabase: ${orders.length} pedidos`)
  return { ok: true, synced: orders.length }
}

// --- FECHAMENTO SEGURO (Backup final + Sync final) ---
let closeInProgress = false

async function forceSyncAllPending() {
  let total = 0
  let loops = 0

  while (true) {
    loops += 1
    const res: any = await syncFinanceToSupabase(200)

    if (!res?.ok) {
      return {
        ok: false,
        totalSynced: total,
        reason: res?.reason || 'sync_failed',
        error: res?.error,
      }
    }

    const syncedNowRaw = res.synced
    const syncedNow = Number.isFinite(Number(syncedNowRaw)) ? Number(syncedNowRaw) : 0

    total += syncedNow

    if (syncedNow <= 0) break
    if (loops >= 60) break
    if (total >= 5000) break
  }

  return { ok: true, totalSynced: total }
}

async function syncFinanceDayToSupabase(dateStr?: string) {
  if (!supabase) return { ok: false, reason: 'missing_supabase_env' }

  const TZ = 'America/Sao_Paulo'
  const dia =
    typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  const startOfDay = fromZonedTime(`${dia} 00:00:00`, TZ)
  const endOfDay = fromZonedTime(`${dia} 23:59:59.999`, TZ)

  const orders = await prisma.order.findMany({
    where: {
      status: 'CLOSED',
      closedAt: { gte: startOfDay, lte: endOfDay },
    },
    include: { items: true, table: true, payments: true },
    orderBy: { closedAt: 'asc' },
  })

  if (!orders.length) return { ok: true, synced: 0 }

  const ids = orders.map((o: any) => o.idString).filter(Boolean)

  const financeOrders = orders.map((o: any) => ({
    restaurant_id: RESTAURANT_ID,
    order_idstring: o.idString,
    origin: o.origin || 'LOCAL',
    payment_method: o.paymentMethod || '',
    total: Number(o.total || 0),
    delivery_fee: Number(o.deliveryFee || 0),
    closed_at: o.closedAt ? new Date(o.closedAt).toISOString() : null,
    created_at_local: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    customer_name: o.customerName || o.customer?.name || o.table?.customerName || null,
    table_id: o.tableId || null,
  }))

  const financeItems = orders.flatMap((o: any) =>
    (o.items || []).map((it: any) => ({
      restaurant_id: RESTAURANT_ID,
      order_idstring: o.idString,
      product: it.product || '',
      category: it.category || 'GERAL',
      quantity: Number(it.quantity || 1),
      price: Number(it.price || 0),
    }))
  )

  const financePayments = orders.flatMap((o: any) =>
    (o.payments || []).map((p: any) => ({
      restaurant_id: RESTAURANT_ID,
      order_idstring: o.idString,
      method: String(p.method || '').trim(),
      amount: Number(p.amount || 0),
    }))
  )

  const up1 = await supabase
    .from('finance_orders')
    .upsert(financeOrders, { onConflict: 'restaurant_id,order_idstring' })
  if (up1.error) return { ok: false, reason: 'upsert_orders_failed', error: up1.error.message }

  const delItems = await supabase
    .from('finance_order_items')
    .delete()
    .eq('restaurant_id', RESTAURANT_ID)
    .in('order_idstring', ids)
  if (delItems.error) return { ok: false, reason: 'delete_items_failed', error: delItems.error.message }

  const insItems = await supabase.from('finance_order_items').insert(financeItems)
  if (insItems.error) return { ok: false, reason: 'insert_items_failed', error: insItems.error.message }

  if (financePayments.length) {
    const delPay = await supabase
      .from('finance_order_payments')
      .delete()
      .eq('restaurant_id', RESTAURANT_ID)
      .in('order_idstring', ids)
    if (delPay.error) return { ok: false, reason: 'delete_payments_failed', error: delPay.error.message }

    const insPay = await supabase.from('finance_order_payments').insert(financePayments)
    if (insPay.error) return { ok: false, reason: 'insert_payments_failed', error: insPay.error.message }
  }

  await prisma.order.updateMany({
    where: { idString: { in: ids } },
    data: { syncedAt: new Date() },
  })

  return { ok: true, synced: orders.length, day: dia }
}

app.post('/admin/close-system', async (req: any, reply: any) => {
  if (closeInProgress) {
    return reply
      .status(409)
      .send({ ok: false, reason: 'already_running', message: 'Fechamento já está em andamento.' })
  }

  closeInProgress = true
  try {
    const syncRes = await syncFinanceDayToSupabase()

    if (!syncRes.ok) {
      return reply.status(500).send({ ok: false, step: 'sync', ...syncRes })
    }

    const backupRes: any = await backupService.runNow('close_system')
    if (!backupRes?.ok) {
      return reply.status(500).send({
        ok: false,
        step: 'backup',
        ...backupRes,
        synced: syncRes.synced,
        day: syncRes.day,
      })
    }

    return reply.send({
      ok: true,
      synced: syncRes.synced,
      day: syncRes.day,
      lastBackupAt: backupRes.lastBackupAt,
      filename: backupRes.filename,
      sentTo: backupRes.sentTo,
      message: 'Sincronização e backup final concluídos. Pode desligar o sistema.',
    })
  } catch (e: any) {
    console.error('❌ Erro no fechamento seguro:', e)
    return reply.status(500).send({ ok: false, reason: 'close_failed', message: 'Falha no fechamento seguro.' })
  } finally {
    closeInProgress = false
  }
})

app.get('/admin/backup-status', async () => {
  return {
    ok: true,
    lastBackupAt: backupService.getLastBackupAt(),
    closeInProgress,
  }
})

app.get('/admin/stats', async (req: any, reply: any) => {
  const { date } = req.query

  const TZ = 'America/Sao_Paulo'

  const dateStr =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  const startOfDay = fromZonedTime(`${dateStr} 00:00:00`, TZ)
  const endOfDay = fromZonedTime(`${dateStr} 23:59:59.999`, TZ)

  const orders = await prisma.order.findMany({
    where: {
      closedAt: { gte: startOfDay, lte: endOfDay },
      status: 'CLOSED',
    },
    include: { items: true, payments: true },
    orderBy: { updatedAt: 'desc' },
  })

  const totalRevenue = orders.reduce((acc, o) => acc + (o.total || 0), 0)

  const categoryStats: Record<
    string,
    { qtd: number; total: number; itemsMap: Record<string, number> }
  > = {}

  const paymentStats: Record<string, number> = {
    DINHEIRO: 0,
    PIX: 0,
    CARTAO: 0,
  }

  const normalizePayment = (m: any) => {
    const raw = String(m || '').toUpperCase().trim()
    if (!raw) return 'OUTROS'
    if (raw.includes('PIX')) return 'PIX'
    if (raw.includes('DINHEIRO') || raw.includes('CASH')) return 'DINHEIRO'
    if (
      raw.includes('CARTAO') ||
      raw.includes('CRÉDITO') ||
      raw.includes('CREDITO') ||
      raw.includes('DÉBITO') ||
      raw.includes('DEBITO')
    )
      return 'CARTAO'
    return raw
  }

  orders.forEach((o: any) => {
    if (Array.isArray(o.payments) && o.payments.length > 0) {
      o.payments.forEach((p: any) => {
        const metodo = normalizePayment(p.method)
        paymentStats[metodo] = (paymentStats[metodo] || 0) + Number(p.amount || 0)
      })
    } else {
      const metodo = normalizePayment(o.paymentMethod)
      paymentStats[metodo] = (paymentStats[metodo] || 0) + (o.total || 0)
    }

    o.items.forEach((item: any) => {
      const cat = item.category || 'OUTROS'

      if (!categoryStats[cat]) {
        categoryStats[cat] = { qtd: 0, total: 0, itemsMap: {} }
      }

      categoryStats[cat].qtd += Number(item.quantity || 0)
      categoryStats[cat].total += Number(item.price || 0) * Number(item.quantity || 0)

      const nomeProduto = item.flavors ? `${item.product} (${item.flavors})` : item.product
      categoryStats[cat].itemsMap[nomeProduto] =
        (categoryStats[cat].itemsMap[nomeProduto] || 0) + Number(item.quantity || 0)
    })
  })

  const categoriesList = Object.entries(categoryStats)
    .map(([name, data]) => {
      const productsList = Object.entries(data.itemsMap)
        .map(([prodName, prodQtd]) => ({ name: prodName, qtd: prodQtd }))
        .sort((a, b) => b.qtd - a.qtd)

      return {
        name,
        qtd: data.qtd,
        total: data.total,
        products: productsList,
      }
    })
    .sort((a, b) => b.total - a.total)

  return reply.send({
    totalRevenue,
    ticketAverage: orders.length > 0 ? totalRevenue / orders.length : 0,
    totalOrders: orders.length,
    byPayment: paymentStats,
    byCategory: categoriesList,
    history: orders,
  })
})

// --- RELATÓRIO DE PERFORMANCE DE GARÇONS ---
app.get('/admin/stats/waiters', async (req: any) => {
  const { date } = req.query
  const startOfDay = date ? new Date(date) : new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setHours(23, 59, 59, 999)

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: 'CLOSED',
    },
    include: {
      items: true,
      waiter: true,
    },
  })

  const stats: any = {}

  orders.forEach((order) => {
    const wId = (order as any).waiterId
    if (!wId) return

    if (!stats[wId]) {
      stats[wId] = {
        name: (order as any).waiter?.name || 'Desconhecido',
        totalSales: 0,
        tablesCount: new Set(),
        products: {},
      }
    }

    stats[wId].totalSales += (order as any).total

    if ((order as any).tableId) {
      stats[wId].tablesCount.add((order as any).tableId)
    }

    ;(order as any).items.forEach((item: any) => {
      const prodName = item.product
      if (!stats[wId].products[prodName]) stats[wId].products[prodName] = 0
      stats[wId].products[prodName] += item.quantity
    })
  })

  const report = Object.keys(stats).map((wId) => {
    const data = stats[wId]

    const sortedProducts = Object.entries(data.products).sort(([, a]: any, [, b]: any) => b - a)

    const bestSeller = sortedProducts.length > 0 ? `${sortedProducts[0][0]} (${sortedProducts[0][1]}x)` : 'Nenhum'

    return {
      garcom: data.name,
      totalVendido: data.totalSales,
      mesasAtendidas: data.tablesCount.size,
      produtoCampeao: bestSeller,
    }
  })

  return report
})

// Cancelar Pedido (some do painel e não entra no financeiro)
app.patch('/orders/:id/cancel', async (req: any, reply: any) => {
  const { id } = req.params
  const { reason } = req.body || {}

  try {
    const order = await prisma.order.findUnique({
      where: { idString: id },
      include: { items: true, table: true },
    })

    if (!order) return reply.status(404).send({ error: 'Pedido não encontrado' })

    if (order.status === 'CLOSED') {
      return reply.status(400).send({ error: 'Pedido já foi fechado, não pode cancelar.' })
    }

    const updatedOrder = await prisma.order.update({
      where: { idString: id },
      data: {
        status: 'CANCELED',
      },
      include: { items: true, table: true },
    })

    io.emit(`order:updated:${id}`, updatedOrder)
    io.emit('orders:updated', updatedOrder)
    io.emit('tables:updated')

    return updatedOrder
  } catch (error) {
    console.error(error)
    return reply.status(500).send({ error: 'Erro ao cancelar pedido' })
  }
})

// --- ROTA PARA CRIAR USUÁRIOS (ADMIN OU GARÇOM) ---
app.post('/users', async (req: any, reply: any) => {
  const { name, pin, role } = req.body

  try {
    const existingUser = await prisma.user.findUnique({ where: { pin } })
    if (existingUser) {
      return reply.status(400).send({ error: 'Esse PIN já está em uso!' })
    }

    const user = await prisma.user.create({
      data: {
        name,
        pin,
        role: role || 'WAITER',
      },
    })

    return user
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao criar usuário' })
  }
})

app.get('/users', async () => {
  return await prisma.user.findMany({
    orderBy: { name: 'asc' },
  })
})

app.delete('/users/:id', async (req: any, reply: any) => {
  const { id } = req.params
  try {
    await prisma.user.delete({ where: { id: Number(id) } })
    return { ok: true }
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao excluir' })
  }
})

// --- MESAS ---
app.get('/tables', async (_req, reply) => {
  const tables = await prisma.table.findMany({ orderBy: { id: 'asc' } })

  const tablesWithOrders = await Promise.all(
    tables.map(async (t) => {
      const orders = await prisma.order.findMany({
        where: {
          tableId: t.id,
          status: { notIn: ['CLOSED', 'CANCELED'] },
          tableSessionId: t.currentSessionId ?? undefined,
        },
        include: { items: true },
      })
      return { ...t, orders }
    })
  )

  return reply.send(tablesWithOrders)
})


app.get('/tables/:id', async (req: any, reply: any) => {
  const id = Number(req.params.id)

  const table = await prisma.table.findUnique({ where: { id } })
  if (!table) return reply.status(404).send({ error: 'Mesa não encontrada' })

  const orders = await prisma.order.findMany({
    where: {
      tableId: id,
      status: { notIn: ['CLOSED', 'CANCELED'] },
      tableSessionId: table.currentSessionId ?? undefined,
    },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  })

  return { ...table, orders }
})


app.post('/tables/:id/open', async (req: any) => {
  const { id } = req.params
  const { customerName, waiterName } = req.body

  const sessionId = Math.random().toString(36).substring(2, 6).toUpperCase()
  const sessionCode = makeSessionCode(4)

  const updatedTable = await prisma.table.update({
    where: { id: Number(id) },
    data: {
      status: 'BUSY',
      customerName: customerName || 'Cliente',
      waiterName: waiterName || 'Garçom',
      currentSessionId: sessionId,
      currentSessionCode: sessionCode,
    },
  })

  io.emit('tables:updated')
  return updatedTable
})

// --- TROCA DE MESA ---
app.post('/tables/:id/transfer', async (req: any, reply: any) => {
  const { id } = req.params
  const { targetTableId } = req.body
  try {
    const mesaAtual = await prisma.table.findUnique({ where: { id: Number(id) } })
    if (!mesaAtual) return reply.status(404).send({ error: 'Mesa não encontrada' })

    await prisma.table.update({
      where: { id: Number(targetTableId) },
      data: {
        status: 'BUSY',
        customerName: mesaAtual.customerName,
        waiterName: mesaAtual.waiterName,
        currentSessionId: mesaAtual.currentSessionId,
        currentSessionCode: mesaAtual.currentSessionCode,
      },
    })
    await prisma.order.updateMany({
      where: { tableId: Number(id), status: { not: 'CLOSED' } },
      data: { tableId: Number(targetTableId) },
    })
    await prisma.table.update({
      where: { id: Number(id) },
      data: {
        status: 'OPEN',
        customerName: null,
        waiterName: null,
        currentSessionId: null,
        currentSessionCode: null,
      },
    })
    const mesaNova = await prisma.table.findUnique({
      where: { id: Number(targetTableId) },
      include: { orders: { where: { status: { not: 'CLOSED' } }, include: { items: true } } },
    })
    if (mesaNova) await printerService.printAccount(mesaNova, 'TROCA DE MESA')

    io.emit('tables:updated')
    return { ok: true }
  } catch (e) {
    return reply.status(500).send({ error: 'Erro na troca' })
  }
})

app.post('/tables/:id/close', async (req: any, reply: any) => {
  const { id } = req.params
  const { paymentMethod, payments } = req.body as {
    paymentMethod?: string
    payments?: Array<{ method: string; amount: number }>
  }

  const tableData = await prisma.table.findUnique({
    where: { id: Number(id) },
    include: {
      orders: {
        where: { status: { not: 'CLOSED' } },
        include: { items: true },
      },
    },
  })
  const openOrders = tableData?.orders ?? []
  const totalGeral = openOrders.reduce((acc: number, o: any) => acc + (Number(o.total) || 0), 0)

  const hasSplitPayments = Array.isArray(payments) && payments.length > 0
  let finalPaymentLabel = paymentMethod || 'A CONFERIR'

  if (hasSplitPayments) {
    const normalized = payments
      .filter((p) => p && typeof p.method === 'string')
      .map((p) => ({
        method: String(p.method).trim().toUpperCase(),
        amount: Number(p.amount) || 0,
      }))
      .filter((p) => p.method && p.amount > 0)

    const sum = normalized.reduce((a, p) => a + p.amount, 0)

    if (totalGeral > 0 && Math.abs(sum - totalGeral) > 0.05) {
      return reply.status(400).send({
        error: 'Soma dos pagamentos não bate com o total da mesa.',
        total: totalGeral,
        sum,
      })
    }

    finalPaymentLabel =
      normalized.length === 1
        ? normalized[0].method
        : `MISTO: ${normalized.map((p) => `${p.method} R$ ${p.amount.toFixed(2)}`).join(' + ')}`

    for (const order of openOrders) {
      await prisma.orderPayment.deleteMany({ where: { orderId: (order as any).idString } })

      const ratio = totalGeral > 0 ? (Number((order as any).total) || 0) / totalGeral : 0
      const rows = normalized.map((p) => ({
        orderId: (order as any).idString,
        method: p.method,
        amount: Number((p.amount * ratio).toFixed(2)),
      }))

      const rowsSum = rows.reduce((a, r) => a + r.amount, 0)
      const diff = Number(((Number((order as any).total) || 0) - rowsSum).toFixed(2))
      if (rows.length > 0 && Math.abs(diff) >= 0.01) {
        rows[rows.length - 1].amount = Number((rows[rows.length - 1].amount + diff).toFixed(2))
      }

      await prisma.orderPayment.createMany({ data: rows })
    }
  }

  if (tableData) {
    try {
      await printerService.printAccount(tableData, finalPaymentLabel)
    } catch (e) {
      console.error('Erro na impressão do fechamento:', e)
    }
  }

  await prisma.order.updateMany({
    where: {
      tableId: Number(id),
      tableSessionId: tableData?.currentSessionId ?? undefined,
      status: { not: 'CLOSED' },
    },
    data: { status: 'CLOSED', paymentMethod: finalPaymentLabel, closedAt: new Date(), syncedAt: null },
  })

  try {
    await syncFinanceToSupabase(200)
  } catch (e) {
    console.error('Sync no fechamento da mesa falhou:', e)
  }

  const result = await prisma.table.update({
    where: { id: Number(id) },
    data: {
      status: 'OPEN',
      customerName: null,
      waiterName: null,
      currentSessionId: null,
      currentSessionCode: null,
    },
  })

  io.emit('tables:updated')
  return result
})

function makeSessionCode(len = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

app.post('/tables/:id/qr/session', async (request: any, reply: any) => {
  const tableId = Number(request.params.id)

  if (isNaN(tableId)) return reply.status(400).send({ error: 'Mesa inválida' })

  const table = await prisma.table.findUnique({ where: { id: tableId } })
  if (!table) return reply.status(404).send({ error: 'Mesa não encontrada' })

  if (table.currentSessionId) {
    return reply.send({ sessionId: table.currentSessionId, sessionCode: table.currentSessionCode })
  }

  const sessionId = crypto.randomUUID()
  const sessionCode = makeSessionCode(4)
  await prisma.table.update({
    where: { id: tableId },
    data: {
      currentSessionId: sessionId,
      currentSessionCode: sessionCode,
      status: 'BUSY',
    },
  })
  io.emit('tables:updated')

  return reply.send({ sessionId, sessionCode })
})

// --- CLIENTES (HISTÓRICO) ---
app.get('/customers/phone/:phone', async (req: any, reply: any) => {
  const { phone } = req.params

  const customer = await prisma.customer.findFirst({
    where: { phone },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { items: true },
      },
    },
  })

  if (!customer) {
    return reply.status(404).send({ message: 'Cliente não encontrado' })
  }

  return customer
})

// --- PEDIDOS ---


// ====== DISPONIBILIDADE + CRUD (Produtos / Grupos / Opções) ======

// Substitua a rota app.patch('/products/:id/availability'...) por esta:
app.patch('/products/:id/availability', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  const body = request.body as any

  // 1. Log para você ver no terminal se o ID e o corpo chegaram certos
  console.log('PATCH REQUISITADO:', { id, body })

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: { available: !!body?.available }, // Garante que é true/false
      include: { optionGroups: { include: { items: true } } },
    })

    // 2. Tente COMENTAR essa linha abaixo com // na frente para testar
    // Se parar de dar erro, o problema é 100% o socket.
    if (typeof io !== 'undefined') {
        io.emit('products:updated')
    }

    return reply.send(updated)
  } catch (err: any) {
    console.error('ERRO FATAL:', err)

    // 3. Aqui está o segredo: enviamos o motivo exato do erro para sua tela
    return reply.status(500).send({ 
      error: 'Erro Interno Detalhado', 
      mensagem_do_erro: err.message, // <--- Isso vai aparecer no seu alerta
      tipo_do_erro: err.name 
    })
  }
})


app.post('/products/:productId/option-groups', async (request: any, reply: any) => {
  const productId = Number(request.params.productId)
  const data = request.body || {}
  if (Number.isNaN(productId)) return reply.status(400).send({ error: 'productId inválido' })

  const group = await prisma.productOptionGroup.create({
    data: {
      productId,
      title: data.title,
      min: Number(data.min || 0),
      max: Number(data.max || 1),
      chargeMode: String(data.chargeMode || 'SUM').toUpperCase(),
      available: data.available ?? true,
      items: {
        create: (data.items || []).map((it: any) => ({
          name: it.name,
          price: Number(it.price || 0),
          description: it.description ?? null,
          imageUrl: it.imageUrl ?? null,
          available: it.available ?? true,
        })),
      },
    },
    include: { items: true },
  })

  io?.emit('products:updated')
  return reply.send(group)
})

app.put('/option-groups/:id', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  const data = request.body || {}
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  const group = await prisma.productOptionGroup.update({
    where: { id },
    data: {
      title: data.title,
      min: Number(data.min ?? 0),
      max: Number(data.max ?? 1),
      chargeMode: data.chargeMode ? String(data.chargeMode).toUpperCase() : undefined,
      available: data.available != null ? !!data.available : undefined,
    },
    include: { items: true },
  })

  io?.emit('products:updated')
  return reply.send(group)
})

app.patch('/option-groups/:id/availability', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  const { available } = request.body || {}
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  const group = await prisma.productOptionGroup.update({
    where: { id },
    data: { available: !!available },
    include: { items: true },
  })

  io?.emit('products:updated')
  return reply.send(group)
})

app.delete('/option-groups/:id', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  await prisma.productOptionGroup.delete({ where: { id } })
  io?.emit('products:updated')
  return reply.send({ ok: true })
})

app.post('/option-groups/:groupId/items', async (request: any, reply: any) => {
  const groupId = Number(request.params.groupId)
  const data = request.body || {}
  if (Number.isNaN(groupId)) return reply.status(400).send({ error: 'groupId inválido' })

  const item = await prisma.productOptionItem.create({
    data: {
      groupId,
      name: data.name,
      price: Number(data.price || 0),
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      available: data.available ?? true,
    },
  })

  io?.emit('products:updated')
  return reply.send(item)
})

app.put('/option-items/:id', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  const data = request.body || {}
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  const item = await prisma.productOptionItem.update({
    where: { id },
    data: {
      name: data.name,
      price: data.price != null ? Number(data.price) : undefined,
      description: data.description !== undefined ? (data.description ?? null) : undefined,
      imageUrl: data.imageUrl !== undefined ? (data.imageUrl ?? null) : undefined,
      available: data.available != null ? !!data.available : undefined,
    },
  })

  io?.emit('products:updated')
  return reply.send(item)
})

app.patch('/option-items/:id/availability', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  const { available } = request.body || {}
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  const item = await prisma.productOptionItem.update({
    where: { id },
    data: { available: !!available },
  })

  io?.emit('products:updated')
  return reply.send(item)
})

app.delete('/option-items/:id', async (request: any, reply: any) => {
  const id = Number(request.params.id)
  if (Number.isNaN(id)) return reply.status(400).send({ error: 'ID inválido' })

  await prisma.productOptionItem.delete({ where: { id } })
  io?.emit('products:updated')
  return reply.send({ ok: true })
})

// Upload simples via Base64 -> Supabase Storage (bucket "menu" por padrão)
// Body: { base64, contentType, fileName?, folder? }
// Retorna: { url, path }


app.post("/upload/base64", async (request: any, reply: any) => {
  try {
    if (!supabase) {
      return reply.status(500).send({
        error:
          "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (e reinicie o servidor).",
      });
    }

    const { base64, contentType, fileName, folder } = request.body || {};
    if (!base64 || !contentType) {
      return reply.status(400).send({ error: "base64 e contentType são obrigatórios" });
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "product-images";
    const safeName = String(fileName || `img-${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const dir = String(folder || "products").replace(/[^a-zA-Z0-9/_-]/g, "");
    const path = `${dir}/${Date.now()}-${safeName}`; // ✅ caminho completo no bucket

    const b64 = String(base64).includes(",") ? String(base64).split(",").pop() : String(base64);
    const buffer = Buffer.from(b64 as string, "base64");

    // ✅ otimiza
    const optimizedBuffer = await sharp(buffer)
      .rotate() // ✅ respeita orientação (foto de celular)
      .resize({ width: 800, withoutEnlargement: true }) // ✅ no máx 800px
      .jpeg({ quality: 80 }) // ✅ compressão
      .toBuffer();

    // ✅ sobe no bucket correto e no path correto
    const up = await supabase.storage.from(bucket).upload(path, optimizedBuffer, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });

    if (up.error) {
      return reply.status(400).send({ error: up.error.message });
    }

    const pub = supabase.storage.from(bucket).getPublicUrl(path);
    return reply.send({ url: pub.data.publicUrl, path });
  } catch (e: any) {
    return reply.status(500).send({ error: e?.message || "Falha no upload" });
  }
});



app.get('/orders', async () => {
  return await prisma.order.findMany({
    where: { status: { notIn: ['CLOSED', 'CANCELED'] } },
    include: { items: true, table: true },
    orderBy: { createdAt: 'desc' },
  })
})

app.get('/orders/track/:id', async (req: any, reply: any) => {
  const { id } = req.params
  try {
    const order = await prisma.order.findUnique({
      where: { idString: id },
      include: { items: true, table: true },
    })
    if (!order) return reply.status(404).send({ error: 'Pedido não encontrado' })
    return order
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao buscar pedido' })
  }
})

app.get('/orders/:id', async (req: any, reply: any) => {
  const { id } = req.params
  try {
    const order = await prisma.order.findUnique({
      where: { idString: id },
      include: { items: true, table: true },
    })
    if (!order) return reply.status(404).send({ error: 'Pedido não encontrado' })
    return order
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao buscar pedido' })
  }
})

// ✅ CRIAR PEDIDO COM PREÇO 100% NO BACKEND (evita bug de "produto 0 / grátis")
app.post('/orders', async (request: any, reply: any) => {
  let { customerName } = request.body

  const {
    waiterName,
    waiterId,
    tableId,
    origin,
    items,
    customerPhone,
    customerAddress,
    paymentMethod,
    deliveryFee,
    observation,
    isTakeout,
    tableSessionId: clientTableSessionId,
  } = request.body

  if (!Array.isArray(items) || items.length === 0) {
    return reply.status(400).send({ error: 'Carrinho vazio.' })
  }

  // --- Lógica da Mesa (QR + sessão) ---
  let tableSessionId: string | null = null

  if (tableId) {
    const table = await prisma.table.findUnique({ where: { id: Number(tableId) } })
    if (!table) return reply.status(404).send({ error: 'Mesa não encontrada.' })

    const isTableQR = origin === 'TABLE_QR'

    if (!table.currentSessionId) {
      const newSessionId = crypto.randomUUID()
      await prisma.table.update({
        where: { id: Number(tableId) },
        data: { currentSessionId: newSessionId, status: 'BUSY' },
      })
      tableSessionId = newSessionId
    } else {
      tableSessionId = table.currentSessionId
    }

    if (isTableQR && clientTableSessionId && clientTableSessionId !== tableSessionId) {
      return reply.status(409).send({
        error: 'Sessão da mesa inválida. Recarregue o QR da mesa e tente novamente.',
      })
    }

    if (isTableQR && !clientTableSessionId) {
      return reply.status(400).send({ error: 'Sessão da mesa ausente. Recarregue o QR da mesa.' })
    }

    if (!customerName && table.customerName) customerName = table.customerName

    if (origin === 'TABLE_QR' && customerName) {
      await prisma.table.update({
        where: { id: Number(tableId) },
        data: { customerName },
      })
    }
  }

  // --- cálculo 100% backend ---
  const dow = getDowBR()

  let computedItems: any[] = []
  try {
    // --- carrega promoções do dia primeiro ---
      const promosAll = await prisma.promotion.findMany({ where: { active: true } })
      const promosToday = promosAll.filter((p: any) => promotionIsActiveTodayV2(p, dow))

      // --- calcula itens já com ajuste de OPTION (preço fixo do sabor) ---
      computedItems = await Promise.all(items.map((it: any) => priceOneItem(prisma, it, dow, promosToday)))

      // --- aplica promoções V2 (item grátis, etc) ---
      computedItems = applyPromotionsV2(computedItems, promosToday)


  } catch (e: any) {
    return reply.status(400).send({ error: e?.message || 'Erro ao calcular itens.' })
  }

  const itemsTotal = computedItems.reduce((acc, ci) => acc + Number(ci.total || 0), 0)
  const finalDeliveryFee = Number(deliveryFee) || 0
  const finalTotal = Number((itemsTotal + finalDeliveryFee).toFixed(2))

  // --- Criação do Pedido ---
  const order = await prisma.order.create({
    data: {
      customerName: customerName || 'Consumidor',
      waiterName: waiterName || 'Nao informado',
      waiterId: waiterId ? Number(waiterId) : null,
      customerPhone,
      customerAddress,
      paymentMethod,
      observation: observation || '',
      tableId: tableId ? Number(tableId) : null,
      tableSessionId,
      total: finalTotal,
      deliveryFee: finalDeliveryFee,
      origin: origin || 'LOCAL',
      isTakeout: isTakeout || false,
      items: {
        create: computedItems.map((ci: any) => {
          const { flavors, border, additions, extras } = buildItemStrings(ci.pickedItems || [])

          return {
            product: ci.product.name,
            quantity: ci.quantity,
            price: Number(ci.unit),
            category: ci.product.category || 'GERAL',
            observation: ci.payloadObservation || '',
            additions,
            flavors,
            border,
            extras,
            promoApplied: (ci.appliedPromos && ci.appliedPromos.length)
              ? ci.appliedPromos.map((p:any)=>p.name).join(' | ')
              : null,

          }
        }),
      },
    },
    include: { items: true, table: true },
  })

  try {
  await printerService.printOrder(order as any) // ✅ só itens novos
} catch (e) {
  console.error('Erro na impressão:', e)
}

  io.emit('new-order', order)
  return order
})

app.post('/tables/:id/print-kitchen', async (req: any, reply: any) => {
  const { id } = req.params

  const table = await prisma.table.findUnique({
    where: { id: Number(id) },
  })
  if (!table) return reply.status(404).send({ error: 'Mesa não encontrada' })

  const orders = await prisma.order.findMany({
    where: {
      tableId: Number(id),
      status: { notIn: ['CLOSED', 'CANCELED'] },
      tableSessionId: table.currentSessionId ?? undefined, // ✅ trava na sessão atual
    },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  })

  const items = orders.flatMap((o: any) => o.items || [])
  const total = items.reduce(
    (acc: number, it: any) => acc + Number(it.price) * Number(it.quantity),
    0
  )

  const orderLike = {
    idString: `M${String(table.id).padStart(3, '0')}`,
    origin: 'LOCAL',
    isTakeout: false,
    tableId: table.id,
    customerName: table.customerName || '',
    waiterName: table.waiterName || '',
    customerPhone: null,
    customerAddress: null,
    deliveryFee: 0,
    paymentMethod: '',
    total,
    items,
  }

  await printerService.printOrder(orderLike as any)
  return { ok: true }
})

// Alterar Status
app.patch('/orders/:id/status', async (req: any, reply: any) => {
  const { id } = req.params
  const { status } = req.body
  const isClosing = String(status).toUpperCase() === 'CLOSED'

  try {
    const updatedOrder = await prisma.order.update({
      where: { idString: id },
      data: {
        status,
        ...(isClosing ? { closedAt: new Date(), syncedAt: null } : {}),
      },
      include: { items: true, table: true },
    })

    io.emit(`order:updated:${id}`, updatedOrder)
    io.emit('orders:updated', updatedOrder)

    if (isClosing) {
      try {
        await syncFinanceToSupabase(200)
      } catch (e) {
        console.error('Sync ao fechar pedido falhou:', e)
      }
    }

    return updatedOrder
  } catch (error) {
    console.error(error)
    return reply.status(500).send({ error: 'Erro ao atualizar status' })
  }
})

app.delete('/orders/:orderId/items/:itemId', async (req: any) => {
  const { orderId, itemId } = req.params
  await prisma.orderItem.delete({ where: { idString: itemId } })
  const itens = await prisma.orderItem.findMany({ where: { orderId } })
  const novoTotal = itens.reduce((acc, it) => acc + it.price * it.quantity, 0)

  const updatedOrder = await prisma.order.update({
    where: { idString: orderId },
    data: { total: novoTotal },
    include: { items: true },
  })

  io.emit(`order:updated:${orderId}`, updatedOrder)
  return { ok: true }
})

// Rotas de Reimpressão
app.post('/orders/:id/print', async (req: any, reply: any) => {
  const { id } = req.params
  const order = await prisma.order.findUnique({
    where: { idString: id },
    include: { items: true, table: true },
  })
  if (!order) return reply.status(404).send({ error: 'Não encontrado' })
  await printerService.printOrder(order as any)
  return { ok: true }
})

app.post('/tables/:id/print-account', async (req: any) => {
  const { id } = req.params
  const { paymentMethod } = req.body
  const tableData = await prisma.table.findUnique({
    where: { id: Number(id) },
    include: { orders: { where: { status: { not: 'CLOSED' } }, include: { items: true } } },
  })
  if (tableData) await printerService.printAccount(tableData as any, paymentMethod || 'CONFERENCIA')
  return { ok: true }
})

app.post('/login', async (req: any, reply: any) => {
  const { pin } = req.body
  const user = await prisma.user.findUnique({ where: { pin } })
  if (!user) return reply.status(401).send({ error: 'Senha incorreta!' })
  return { id: user.id, name: user.name, role: user.role }
})

// --- INICIALIZAÇÃO DO SERVIDOR ---
backupService.start()

app.ready().then(() => {
  io = new Server(app.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH'],
    },
  })

  io?.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id)
    socket.on('disconnect', () => {
      console.log('Cliente desconectou:', socket.id)
    })
  })

  app.listen({ port: 3333, host: '0.0.0.0' }).then((addr) => {
    console.log(`🔥 Servidor rodando em ${addr}`)
    console.log(`📡 Socket.io pronto para conexões`)
  })
})

