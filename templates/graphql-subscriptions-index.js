const set = require('lodash/set');
const { subscriptions } = require('./subscriptions');

const registerGraphQLSubscriptionEventListener = (clientID, getSocket, getApiKey, subscriptionId, callback) => {
  const socket = getSocket();
  socket.emit('registerSubscriptionHandler', {
    clientID,
    subscriptionId,
    apiKey: getApiKey(),
  }, registered => {
    if (registered) {
      socket.on(
        `handleSubscriptionEvent:${subscriptionId}`,
        async ({ event, params, executionId }) => {
          await callback(event, params, { executionId });
        }
      );
    } else {
      console.log(`Could not register GraphQL subscription event handler for ${subscriptionId}`);
    }
  });

  return () => {
    socket.emit('unregisterSubscriptionHandler', {
      clientID,
      subscriptionId,
      apiKey: getApiKey(),
    });
  }
};

module.exports = (clientID, getSocket, getApiKey) => subscriptions.reduce(
  (acc, [path, id]) => set(acc, path, (callback) => registerGraphQLSubscriptionEventListener(clientID, getSocket, getApiKey, id, callback)),
  {}
);
