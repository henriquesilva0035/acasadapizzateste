import { FastifyInstance } from 'fastify';
import { z } from 'zod'; // Para validar os dados
import { prisma } from '../lib/prisma.js'; // Ou onde estiver seu prisma client

export async function marketingRoutes(app: FastifyInstance) {

  // --- 1. CRIAR UMA NOVA PROMOÇÃO ---
  app.post('/promotions', async (request, reply) => {
    // Validação dos dados que vêm do Front (Gerente)
    const createPromoSchema = z.object({
      name: z.string(),
      description: z.string().optional(),
      daysOfWeek: z.string(), // Ex: "1,2,5"
      type: z.string(),       // "FREE_ITEM" ou "DISCOUNT"
      triggerType: z.string(), // "CATEGORY" ou "NAME_CONTAINS"
      triggerValue: z.string(), // "Pizzas" ou "GG"
      targetType: z.string(),   // "BORDER" ou "PRODUCT_NAME"
      targetValue: z.string(),  // "Catupiry" ou "Guarana"
      discountPercent: z.number(), // 100 para grátis
      active: z.boolean().default(true)
    });

    const data = createPromoSchema.parse(request.body);

    const promo = await prisma.promotion.create({
      data
    });

    return reply.status(201).send(promo);
  });

  // --- 2. LISTAR TODAS AS PROMOÇÕES ---
  app.get('/promotions', async () => {
    return await prisma.promotion.findMany({
      orderBy: { id: 'desc' }
    });
  });

  // --- 3. ATUALIZAR / DESATIVAR PROMOÇÃO ---
  app.put('/promotions/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.coerce.number() });
    const { id } = paramsSchema.parse(request.params);
    
    // Permite atualizar qualquer campo
    const updatePromoSchema = z.object({
      name: z.string().optional(),
      active: z.boolean().optional(),
      daysOfWeek: z.string().optional(),
      // ... adicione outros se quiser permitir editar tudo
    });

    const data = updatePromoSchema.parse(request.body);

    const promo = await prisma.promotion.update({
      where: { id },
      data
    });

    return promo;
  });

  // --- 4. EXCLUIR PROMOÇÃO ---
  app.delete('/promotions/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.coerce.number() });
    const { id } = paramsSchema.parse(request.params);

    await prisma.promotion.delete({ where: { id } });
    return reply.status(204).send();
  });

  // --- 5. CONFIGURAÇÃO DO BANNER (LOJA) ---
  
  // Pegar Config Atual
  app.get('/settings', async () => {
    // Pega a primeira config ou cria uma padrão se não existir
    let settings = await prisma.storeSettings.findFirst();
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: { bannerText: "", bannerActive: false }
      });
    }
    return settings;
  });

  // Atualizar Banner
  app.put('/settings', async (request) => {
    const settingsSchema = z.object({
      bannerText: z.string().optional(),
      bannerActive: z.boolean().optional(),
    });

    const data = settingsSchema.parse(request.body);

    // Atualiza o primeiro registro que encontrar
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