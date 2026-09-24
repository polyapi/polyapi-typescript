### 0.27.5
* Bumping some transitive dependencies to close open CVEs.
* Adding code to generate method to create local references when possible to enable "Go to Definition" command in VS Code to actually go to the function code instead of the SDK typedefs.

### 0.27.4
* Replacing axios with an undici `request` HTTP client. Thrown errors still use the `AxiosError` name and `isAxiosError` flag. `instanceof` against axios's own class is not preserved.
* Fixing bug where vari inject() was failing to be serialized as an argument to an api or server function.

### 0.27.3
* Adding support for 429 throttle handling under the hood

### 0.27.2
* Removing some extraneous dependencies and fixing additional vulnerabilities

### 0.27.1
* Bumping several dependencies