import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // 1. Cria ou Reseta as Mesas
  for (let i = 11; i <= 20; i++) {
    await prisma.table.upsert({
      where: { id: i },
      update: {},
      create: { id: i, label: `Mesa ${i}`, status: 'OPEN' }
    })
  }

  // 2. Cria Usuário GERENTE (Admin)
  await prisma.user.upsert({
    where: { pin: '1234' },
    update: {},
    create: { name: 'Gerente Master', pin: '1234', role: 'ADMIN' }
  })

  // 3. Cria Usuário GARÇOM
  await prisma.user.upsert({
    where: { pin: '0000' },
    update: {},
    create: { name: 'Garçom 01', pin: '0000', role: 'WAITER' }
  })

  console.log('✅ Banco Semeado: Mesas + Usuários (1234 e 0000)')
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })