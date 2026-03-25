FROM node:20-bookworm

RUN apt-get update && apt-get install -y openjdk-17-jdk && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production

RUN java -version && javac -version && node -v

EXPOSE 10000

CMD ["npm", "start"]