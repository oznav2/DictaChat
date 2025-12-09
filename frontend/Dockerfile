# Use a lightweight Node image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install bun
RUN npm install -g bun

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Expose port 8003
EXPOSE 8003

# Start the application
CMD ["bun", "run", "start"]
