// file: prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import * as bcrypt from 'bcrypt'

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
  // 1. Hash รหัสผ่าน
  const hashedPassword = await bcrypt.hash('admin123', 10)

  // 2. สร้าง Admin คนแรก
  const adminUser = await prisma.user.upsert({
    where: { phoneNumber: '123456' },
    update: {},
    create: {
      inGameName: 'Master Admin',
      phoneNumber: '123456',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })
  console.log(`Created admin user: ${adminUser.inGameName}`)

  const defaultItems: Array<{ name: string; currentStock: number }> = [
    // Original Items (Optional - kept for compatibility if needed, or can be removed if user wants ONLY the new list. 
    // User said "The system must support... as follows", implying these are key. I will append them or replace if they overlap)
    { name: 'Medkit', currentStock: 250 },
    { name: 'Bandage', currentStock: 500 },
    { name: 'Ammo 9mm', currentStock: 2000 },
    { name: 'Ammo 5.56', currentStock: 1500 },
    { name: 'Repair Kit', currentStock: 200 },
    { name: 'Lockpick', currentStock: 300 },
    { name: 'Food Box', currentStock: 600 },
    { name: 'Water', currentStock: 800 },
    { name: 'Radio', currentStock: 120 },
    { name: 'Armor', currentStock: 180 },
    // New Requested Items
    { name: 'Jade', currentStock: 0 },
    { name: 'Mythril', currentStock: 0 },
    { name: 'เหรียญธนาคาร', currentStock: 0 },
    { name: 'เศษแร่ม่วง', currentStock: 0 },
    { name: 'เศษแร่เขียว', currentStock: 0 },
    { name: 'เศษแร่เงิน', currentStock: 0 },
    { name: 'เศษแร่ทอง', currentStock: 0 },
    { name: 'อีลู', currentStock: 0 },
    { name: 'ชิ้นส่วน', currentStock: 0 },
    { name: 'เศษชิ้นส่วน', currentStock: 0 },
    { name: 'เศษไวเบ', currentStock: 0 },
    { name: 'เกาะ', currentStock: 0 },
    { name: 'AED', currentStock: 0 },
    { name: 'ยาปั้ม', currentStock: 0 },
  ]

  for (const item of defaultItems) {
    await prisma.item.upsert({
      where: { name: item.name },
      update: {
        currentStock: item.currentStock,
        lastUpdated: new Date(),
      },
      create: {
        name: item.name,
        currentStock: item.currentStock,
      },
    })
  }
  console.log(`Seeded ${defaultItems.length} items`)

  // 3. ตั้งค่าเงินรวมเริ่มต้น
  await prisma.globalSetting.upsert({
    where: { key: 'total_money_pool' },
    update: {},
    create: {
      key: 'total_money_pool',
      value: '10000', // เริ่มต้นด้วย 10,000 บาท
      description: 'ยอดเงินรวมทั้งหมดของระบบ'
    },
  })

  console.log('Initialized total money pool: 10,000 บาท')

  // 4. ตั้งค่าเวลาเช็คชื่อสาย/ขาด
  await prisma.globalSetting.upsert({
    where: { key: 'attendance_deadline' },
    update: {},
    create: {
      key: 'attendance_deadline',
      value: '10:00', // Default Cutoff time
      description: 'กำหนดเวลาเช็คชื่อล่าสุด (HH:mm) เกินนี้ถือว่าขาด'
    },
  })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })