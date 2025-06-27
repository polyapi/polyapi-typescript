const merge = require('lodash/merge');
const { io } = require('socket.io-client');
const apiFunctions = require('./api');
const clientFunctions = require('./client');
const webhooks = require('./webhooks');
const authFunctions = require('./auth');
const serverFunctions = require('./server');
const vari = require('./vari');
const tabi = require('./tabi');
const polyCustom = require('./poly-custom');
const { createErrorHandler, sendLocalErrorEvent } = require('./error-handler');
const { CLIENT_ID, API_KEY, API_BASE_URL } = require('./constants');

const nodeEnv = process.env.NODE_ENV;
const isDevEnv = nodeEnv === 'development';

let socket = null;
let listenersCount = 0;

const getSocket = () => {
  let apiBaseUrl = API_BASE_URL;
  if (!isDevEnv) {
    apiBaseUrl = apiBaseUrl.replace(/^http:/, 'https:');
  }

  if (!socket) {
    socket = io(`${apiBaseUrl}/events`, {
      transports: ['websocket']
    });
  }

  return new Proxy(socket, {
    get(target, property, receiver) {
      const value = target[property];

      if (property === 'emit') {
        return function emit(...args) {
          const [event] = args;

          if (event.match(/^register/)) {
            listenersCount+=1;
          }

          if (event.match(/^unregister*/) && listenersCount > 0) {
            listenersCount = listenersCount - 1;
          }

          if (listenersCount === 0) {
            socket.disconnect();
            socket = null;
          } else {
            return value.apply(this === receiver ? target : this, args);
          }
        }
      }

      return Reflect.get(...arguments);
    }
  });
};
const getApiKey = () => polyCustom.executionApiKey || API_KEY;
const poly = {};

merge(
  poly,
  apiFunctions(CLIENT_ID, polyCustom),
  clientFunctions(poly, sendLocalErrorEvent),
  serverFunctions(CLIENT_ID, polyCustom),
  authFunctions(CLIENT_ID, getSocket, getApiKey),
  webhooks(CLIENT_ID, getSocket, getApiKey),
),
module.exports = {
  ...poly,
  errorHandler: createErrorHandler(getApiKey, getSocket),
  vari: vari(CLIENT_ID, getSocket, getApiKey),
  tabi: tabi(CLIENT_ID, polyCustom),
  polyCustom,
};
