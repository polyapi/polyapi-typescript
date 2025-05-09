const localErrorHandlers = {
}
const createErrorHandler = (getApiKey, getSocket) => ({
  on: (path, callback, options) => {
    const socket = getSocket();
    let handlerId = null;
    socket.emit('registerErrorHandler', {
      ...options,
      path,
      apiKey: getApiKey(),
    }, (id) => {
      handlerId = id;
      socket.on(`handleError:${handlerId}`, callback);
    });
    localErrorHandlers[path] = [
      ...(localErrorHandlers[path] || []),
      callback,
    ];

    return () => {
      if (handlerId) {
        socket.off(`handleError:${handlerId}`);
        socket.emit('unregisterErrorHandler', {
          id: handlerId,
          path,
          apiKey: getApiKey(),
        });
      }
      localErrorHandlers[path] = localErrorHandlers[path].filter((cb) => cb !== callback);
    };
  },
});

const sendLocalErrorEvent = (functionId, path, errorMessage) => {
  const filterByPath = (path, handlerPath) => {
    return handlerPath === '' || path === handlerPath || path.startsWith(`${handlerPath}.`) || path.endsWith(`.${handlerPath}`)
  }

  const event = {
    functionId,
    path,
    message: errorMessage,
  };
  const pathHandlers = Object.keys(localErrorHandlers)
    .filter(handlerPath => filterByPath(path, handlerPath))
    .map((handlerPath) => localErrorHandlers[handlerPath])
    .flat();
  if (pathHandlers.length === 0) {
    return false;
  }

  pathHandlers.forEach((handler) => handler(event));
  return true;
}

module.exports = {
  createErrorHandler,
  sendLocalErrorEvent,
}
