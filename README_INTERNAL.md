# README INTERNAL

So you want to hack on this npm package locally?

Here's how!

## Verdaccio

We recommend using [Verdaccio](https://verdaccio.org/)

First let's install Verdaccio globally.

```bash
npm install -g verdaccio
```

Then let's start verdaccio up in a new terminal:

```bash
verdaccio
```

Now add a user:

```bash
npm adduser --registry=http://localhost:4873/
```

Enter whatever you want for username/password/email.

## Make a Small Change

Now let's go to your JS polyapi client folder:

https://github.com/polyapi/poly-alpha/tree/develop/packages/client

Let's make a tiny tweak to the `README.md`. Just so we can make sure we are installing our local changes.

Add the line "HELLO WORLD" to the end of `README.md`

Then run this command to publish to your local Verdaccio instance:

```bash
./scripts/publish_local.sh
```

## Install Your Updated NPM Package Locally

Now let's create a polyapi project where we can test our npm changes locally.

First, create a new folder, for example `$HOME/poly/jslocal`, then cd into the folder.

Run the following command:

```bash
echo 'registry=http://localhost:4873' > .npmrc
```

Then run this command to make sure you have the latest version of the library from Verdaccio:

```bash
npm uninstall polyapi && npm install polyapi
```

Finally run this command:

```bash
cat node_modules/polyapi/README.md
```

You should see "HELLO WORLD" at the bottom of the README!

## Conclusion

That's it! Happy hacking!

# PolyAPI TypeScript/JavaScript Client

## Adding a new kind of deployable for `poly prepare` and `poly sync`

1. Update user-facing typedef exports in `types.ts` to add a new type and any custom configuration it might have. Follow the existing naming convention: `PolyThing`.

2. Update typedefs in `src/deployments.ts`.

   a. Add type to DeployableTypes (matching collection id as used in canopy collection url).

   b. Add type to DeployableTypeNames matching the type added in the `types.ts` file.

   c. Add entry to DeployableTypeEntries mapping the new DeployableTypeName to the new DeployableType

3. Update transpiler to support the new type and add a function if you need to parse more than the type and config object. See `parseDeployable` in `src/transpiler.ts`.

4. Add function to write this new type of deployable back to its source file. See `writeUpdatedDeployable` in `src/deployments.ts`.

5. Update poly prepare to support filling in missing details for this new type. See `fillInMissingDetails` in `src/commands/prepare.ts`.

6. Update poly sync to support syncing and removing this new type. See `syncDeployableAndGetId` and `removeDeployable`  in `src/commands/sync.ts`.