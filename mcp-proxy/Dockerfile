FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY sequential-thinking-server.js ./

EXPOSE 3001

CMD ["npm", "start"]
