import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';


function dayTextToDow(v: string): number | null {
  const s = String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .trim()

  const map: Record<string, number> = {
    "domingo": 0,
    "segunda": 1,
    "segunda-feira": 1,
    "terca": 2,
    "terca-feira": 2,
    "quarta": 3,
    "quarta-feira": 3,
    "quinta": 4,
    "quinta-feira": 4,
    "sexta": 5,
    "sexta-feira": 5,
    "sabado": 6,
  }

  return map[s] ?? null
}

function normalizeDaysOfWeek(input: any): string {
  // aceita: "6", "1,2,5", ["Sábado"], "Sábado"
  if (Array.isArray(input)) {
    // ex: ["Sábado"] ou [6]
    const nums = input
      .map((x) => {
        if (typeof x === "number") return x
        const asNum = Number(x)
        if (!Number.isNaN(asNum)) return asNum
        const dow = dayTextToDow(String(x))
        return dow === null ? null : dow
      })
      .filter((x) => x !== null) as number[]
    return nums.join(",")
  }

  if (typeof input === "number") return String(input)

  const s = String(input || "").trim()
  if (!s) return ""

  // já veio "1,2,5"
  if (/^[0-6](\s*,\s*[0-6])*$/.test(s)) return s

  // veio "Sábado"
  const dow = dayTextToDow(s)
  return dow === null ? "" : String(dow)
}

function arrToCsv(v: any) {
  if (!v || !Array.isArray(v) || v.length === 0) return null
  return v.join(',')
}




function getDowBR() {
  return new Date().getDay(); // 0..6
}

function promoIsActiveToday(p: any, dow: number) {
  const days = String(p.daysOfWeek || '')
    .split(',')
    .map((s: string) => Number(s.trim()))
    .filter((n: number) => !Number.isNaN(n));
  return !!p.active && days.includes(dow);
}


export async function marketingRoutes(app: FastifyInstance) {
  const promoSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  daysOfWeek: z.preprocess(
    (v) => normalizeDaysOfWeek(v),
    z.string().min(1)
  ),
  active: z.boolean().optional().default(true),

  triggerCategory: z.string().optional().nullable(),
  triggerProductIds: z.array(z.coerce.number().int()).optional().nullable(),
  triggerOptionItemIds: z.array(z.coerce.number().int()).optional().nullable(),

  rewardType: z.enum(['ITEM_FREE', 'DISCOUNT_PERCENT', 'FIXED_PRICE', 'OPTION_FREE']),
  rewardCategory: z.string().optional().nullable(),
  rewardProductIds: z.array(z.coerce.number().int()).optional().nullable(),
  rewardOptionItemIds: z.array(z.coerce.number().int()).optional().nullable(),

  discountPercent: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().min(0).max(100).optional().nullable()),
  fixedPrice: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().min(0).optional().nullable()),
  maxRewardQty: z.preprocess((v) => (v === "" ? 1 : v), z.coerce.number().int().min(1).optional().default(1)),
  showOnMenu: z.boolean().optional().default(true),
})


  // CREATE
  app.post('/promotions', async (request, reply) => {
  try {
    const data = promoSchema.parse(request.body)

    const cleaned: any = { ...data }
    for (const k of Object.keys(cleaned)) if (cleaned[k] === null) cleaned[k] = undefined

    cleaned.triggerProductIds = arrToCsv(cleaned.triggerProductIds) ?? undefined
    cleaned.triggerOptionItemIds = arrToCsv(cleaned.triggerOptionItemIds) ?? undefined
    cleaned.rewardProductIds = arrToCsv(cleaned.rewardProductIds) ?? undefined
    cleaned.rewardOptionItemIds = arrToCsv(cleaned.rewardOptionItemIds) ?? undefined

    const promo = await prisma.promotion.create({ data: cleaned })
    return reply.status(201).send(promo)
  } catch (err: any) {
    console.error('POST /promotions error:', err)
    return reply.status(400).send({
      error: 'Erro ao criar promoção',
      details: err?.message ?? String(err),
    })
  }
})

  // LIST
  app.get('/promotions', async () => {
    return await prisma.promotion.findMany({ orderBy: { id: 'desc' } });
  });

  // UPDATE (parcial)
  app.put('/promotions/:id', async (request) => {
    const paramsSchema = z.object({ id: z.coerce.number() });
    const { id } = paramsSchema.parse(request.params);

    const data = promoSchema.partial().parse(request.body);
    const cleaned: any = { ...data };
    for (const k of Object.keys(cleaned)) if (cleaned[k] === null) cleaned[k] = undefined;

    // arrays -> CSV
    if (cleaned.triggerProductIds) cleaned.triggerProductIds = arrToCsv(cleaned.triggerProductIds) ?? undefined;
    if (cleaned.triggerOptionItemIds) cleaned.triggerOptionItemIds = arrToCsv(cleaned.triggerOptionItemIds) ?? undefined;
    if (cleaned.rewardProductIds) cleaned.rewardProductIds = arrToCsv(cleaned.rewardProductIds) ?? undefined;
    if (cleaned.rewardOptionItemIds) cleaned.rewardOptionItemIds = arrToCsv(cleaned.rewardOptionItemIds) ?? undefined;

    return await prisma.promotion.update({ where: { id }, data: cleaned });
  });

  // DELETE
  app.delete('/promotions/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.coerce.number() });
    const { id } = paramsSchema.parse(request.params);
    await prisma.promotion.delete({ where: { id } });
    return reply.status(204).send();
  });

  // PUBLIC: promos ativas hoje (para o cardápio)
  app.get('/promotions/active-today', async (request) => {
    const querySchema = z.object({ dow: z.coerce.number().min(0).max(6).optional() });
    const { dow } = querySchema.parse((request as any).query || {});
    const useDow = typeof dow === 'number' ? dow : getDowBR();

    const promos = await prisma.promotion.findMany({ where: { active: true } });
    return promos.filter((p) => promoIsActiveToday(p, useDow));
  });

  // --- BANNER ---
  app.get('/settings', async () => {
    let settings = await prisma.storeSettings.findFirst();
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: { bannerText: "", bannerActive: false }
      });
    }
    return settings;
  });

  app.put('/settings', async (request) => {
    const settingsSchema = z.object({
      bannerText: z.string().optional(),
      bannerActive: z.boolean().optional(),
    });

    const data = settingsSchema.parse((request as any).body);
    const first = await prisma.storeSettings.findFirst();

    if (first) {
      return await prisma.storeSettings.update({
        where: { id: first.id },
        data
      });
    } else {
      return await prisma.storeSettings.create({ data });
    }
  });
}
