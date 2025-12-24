
import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const dbUrl = new URL(process.env.DATABASE_URL)
const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: dbUrl.port ? Number(dbUrl.port) : 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ''),
  connectionLimit: 5,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const items = await prisma.item.findMany()
  console.log('Total items:', items.length)
  console.log(items.map(i => i.name))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
