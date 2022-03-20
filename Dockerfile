FROM node:lts-alpine3.13
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

ARG websocket="-w"
ARG argPort="80"

ENV WS=$websocket
ENV myPORT=$argPort

EXPOSE $myPORT

ENTRYPOINT npm run start -- $WS -p $myPORT