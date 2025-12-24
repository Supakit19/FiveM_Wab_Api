import type { PrismaClient } from '@prisma/client'

declare module 'elysia' {
  interface Context {
    db: PrismaClient
    jwt: {
      sign: (payload: any) => Promise<string>
      verify: (token: string) => Promise<any>
    }
    currentUser: {
      id: number
      role: 'ADMIN' | 'USER'
      inGameName: string
    }
  }
}

export {}
