# Poly TypeScript/JavaScript client

This is the client library and CLI for users of PolyAPI to help create and manage your Poly definitions.

## Usage

Make sure you have set your npm registry in .npmrc file.

Install the package with `npm install polyapi`.

Run `npx poly generate` to set up your Poly connection (only for the first time) and generate Poly functions.
Whenever you update your Poly functions, run `npx poly generate` again to update your local functions.

You will need an API Key to to access Poly. Please head to https://polyapi.io to request an API key!

### Using Poly functions

After you have run `npx poly generate` you can use your Poly client in your code:

```
import poly from 'polyapi';

const location = 'Eiffel Tower, Paris';

poly.maps.google.getXY(location)
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

### Using error handler

Poly functions can throw errors. You can catch them with try/catch or you can register an error handler for function path:

```
import poly, {errorHandler} from 'polyapi';

errorHandler.on('myContext.myFunction', (error) => {
  // handle error
});
```

Or you can register an error handler for all functions in context:

```
errorHandler.on('myContext', (error) => {
  // handle error
});
```

To remove error handler for function path:

```
errorHandler.off('myContext.myFunction');
```

### Using Webhook handlers

Similar to error handlers, you can register handlers for Webhooks:

```
import poly from 'polyapi';

poly.myWebhookContext.paymentReceieved(event => {
  // handle event
});
```

Webhook handlers have their context and function name. To remove a handler call the returned function:

```
const unregister = poly.myWebhookContext.paymentReceieved(event => {
  // handle event
});
...
unregister();
```

Happy hacking!
.