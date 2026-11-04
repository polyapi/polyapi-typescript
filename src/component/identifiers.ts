// Same rules as the API NameIdentifier and ContextIdentifier validators.
// Names cannot contain hyphens, so a file such as nav-bar.ts is rejected here.
const COMPONENT_NAME_PATTERN = /^(?:[a-zA-Z_])\w*$/;
const COMPONENT_CONTEXT_PATTERN =
  /^(?!.*\.\.)[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export const componentNameError = (name: string) => {
  if (COMPONENT_NAME_PATTERN.test(name)) return undefined;
  return `Component name "${name}" is not accepted. Names must start with a letter or underscore and contain only letters, numbers, and underscores.`;
};

export const componentContextError = (context: string) => {
  if (!context || COMPONENT_CONTEXT_PATTERN.test(context)) return undefined;
  return `Component context "${context}" is not accepted. Contexts must start with a letter or underscore and contain only letters, numbers, underscores, and dots.`;
};

export const assertComponentIdentifiers = (
  nodes: Array<{ name: string; context: string; file?: string }>,
) => {
  const errors: string[] = [];
  for (const node of nodes) {
    const where = node.file ? ` (${node.file})` : '';
    const nameError = componentNameError(node.name);
    if (nameError) errors.push(`${nameError}${where}`);
    const contextError = componentContextError(node.context);
    if (contextError) errors.push(`${contextError}${where}`);
  }
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
};
