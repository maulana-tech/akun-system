FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN npx prisma generate

# Make start script executable
RUN chmod +x ./start.sh

EXPOSE 3000

CMD ["./start.sh"]
