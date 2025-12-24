FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies
RUN bun install --frozen-lockfile

# Generate Prisma Client (Needs dummy URL for validation)
RUN DATABASE_URL="mysql://u:p@localhost:3306/db" bunx prisma generate

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["bun", "start"]
