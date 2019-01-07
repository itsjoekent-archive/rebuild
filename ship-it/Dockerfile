FROM node:10-alpine

ADD package.json /package.json
ADD package-lock.json /package-lock.json
WORKDIR /
COPY . /

RUN npm install

ENTRYPOINT ["node", "/index.js"]
