FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --include=dev

COPY . .

CMD ["npm", "test"]
