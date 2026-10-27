# Poly TypeScript/JavaScript client

This is the client library and CLI for users of PolyAPI to help create and manage your Poly definitions.

## Usage

Make sure you have set your npm registry in .npmrc file.

Install the package with `npm install polyapi`.

Run `npx poly setup` to set up your Poly connection (only for the first time) and generate Poly functions.
Whenever you update your Poly functions, run `npx poly generate` to update your local functions.

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

### Deployment receipts for automation

`poly function add <name> <file> --server` (or `--client`) accepts
`--result-file <new-path>`. It reserves a new file with mode `0600` before
provider requests and writes a `poly.function-deployment.v1` JSON receipt.
An existing file is never replaced. Bind the receipt to the requested function
kind, context, name and source SHA-256; inspect it together with the process exit
code instead of parsing console output.

The receipt preserves upload acceptance, HTTP status, function/deployment-job
identifiers, warning presence and generation outcome. Provider bodies and warning
text are omitted; the underlying create API returns its complete `HttpResponse`
to its caller. A generation failure retains the earlier upload facts and returns
a nonzero exit code. HTTP 202 remains pending, including its job identifier.
Uploads do not automatically retry throttling or socket failures. Missing or
empty receipts and uncertain uploads need recovery/readback before another send.

`verification: "not_checked"` is explicit: upload acceptance and local SDK
generation do not prove compiled artifacts, current revision health or a business
outcome. Verify those independently before running dependent operations.
