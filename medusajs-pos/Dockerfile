# Build Stage
FROM node:24-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Define build arguments for public environment variables
ARG PUBLIC_MEDUSA_BACKEND_URL

# Set environment variables for the build stage (Vite inlines these)
ENV PUBLIC_MEDUSA_BACKEND_URL=${PUBLIC_MEDUSA_BACKEND_URL}

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build site
RUN npm run build

# Production Stage
FROM node:24-alpine AS runtime

WORKDIR /app

# Redefine build arguments for the runtime stage to ensure ENV picks them up
ARG PUBLIC_MEDUSA_BACKEND_URL

# Copy built assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Install production dependencies
RUN npm install --omit=dev

# Set environment variables for runtime
ENV PUBLIC_MEDUSA_BACKEND_URL=${PUBLIC_MEDUSA_BACKEND_URL}
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

# Start the server
CMD ["node", "./dist/server/entry.mjs"]
