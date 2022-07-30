FROM node:lts-alpine3.13
WORKDIR /app
COPY . .
RUN npm install
#MS: need this to get typescript compiler tsc. But don't know why it's not needed with same install locally.
RUN npm install -g typescript
RUN npm run build

ARG websocket="-w"
ARG argPort="80"

ENV WS=$websocket
ENV myPORT=$argPort

EXPOSE $myPORT

ENTRYPOINT npm run start -- $WS -p $myPORT
