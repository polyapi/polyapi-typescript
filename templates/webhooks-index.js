const set = require('lodash/set');
const { handles } = require('./handles');

const registerWebhookEventListener = (clientID, getSocket, getApiKey, webhookHandleID, options, callback) => {
  const socket = getSocket();
  socket.emit('registerWebhookEventHandler', {
    clientID,
    webhookHandleID,
    apiKey: getApiKey(),
    waitForResponse: options.waitForResponse || false
  }, registered => {
    if (registered) {
      socket.on(
        `handleWebhookEvent:${webhookHandleID}`,
        async ({ body, headers, params, executionId }) => {
          const polyCustom = {};
          const data = await callback(body, headers, params, polyCustom);

          if (options.waitForResponse) {
            socket.emit('setWebhookListenerResponse', {
              webhookHandleID,
              apiKey: getApiKey(),
              clientID,
              executionId,
              response: {
                data: typeof data === 'undefined' ? null : data,
                statusCode: polyCustom.responseStatusCode || null,
                contentType: polyCustom.responseContentType || null
              },
            })
          }
        }
      );
    } else {
      console.log(`Could not register webhook event handler for ${webhookHandleID}`);
    }
  });

  return () => {
    socket.emit('unregisterWebhookEventHandler', {
      clientID,
      webhookHandleID,
      apiKey: getApiKey(),
    });
  }
};

module.exports = (clientID, getSocket, getApiKey) => handles.reduce(
  (acc, [path, id]) => set(acc, path, (callback, options = {}) => registerWebhookEventListener(clientID, getSocket, getApiKey, id, options, callback)),
  {}
);
