# ---- Build Stage ----
FROM node:20-alpine AS build

# Strapi/sharp brauchen ein paar native Build-Tools
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev nasm bash vips-dev git

WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npm run build

# ---- Runtime Stage ----
FROM node:20-alpine

RUN apk add --no-cache vips-dev

WORKDIR /opt/app
ENV NODE_ENV=production

COPY --from=build /opt/app ./

EXPOSE 1337
CMD ["npm", "run", "start"]