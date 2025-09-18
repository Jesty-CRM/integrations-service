# Stage 1: Build stage to install dependencies
FROM node:alpine3.18 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# Stage 2: Final image
FROM node:alpine3.18

WORKDIR /app

# Copy only the necessary files from build stage
COPY --from=build /app/node_modules /app/node_modules

# Copy the rest of the application files
COPY . .

# Expose the port your service runs on
EXPOSE 3000

# Set environment variables
ENV PORT=3000

# Start the auth service
CMD ["node", "index.js"]