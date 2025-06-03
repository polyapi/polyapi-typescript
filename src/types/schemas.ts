import { Visibility } from './shared';

export interface CreateSchemaDto {
  name: string;
  context?: string;
  /**
   * A valid json schema object. If $schema is not provided, poly defaults to draft-6.
   */
  definition: Record<string, any>;
  visibility?: Visibility;
  ownerUserId?: string | null;
}

export interface SchemaDto {
  id: string;
  name: string;
  context: string;
  contextName: string;
  visibility: Visibility;
  ownerUserId?: string | null;
}
