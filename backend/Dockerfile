FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure uploads directory exists
RUN mkdir -p uploads

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]
