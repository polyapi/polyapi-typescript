import { Visibility } from './shared';

export interface SnippetDetailsDto {
  id: string;
  createdAt: string;
  name: string;
  context: string;
  contextName: string;
  description: string;
  language: string;
  visibility: Visibility;
  ownerUserId?: string | null;
  code: string;
}

export interface CreateSnippetDto {
  /**
   * * Must start with an underscore or a letter.
   * * Rest of string can have numbers, letters and underscores.
   */
  name: string;
  /**
   * * Must start with an underscore or a letter.
   * * Rest of string can have numbers, letters, underscores and dots.
   * * String must not finish with a single dot.
   */
  context?: string;
  description?: string;
  code: string;
  visibility?: Visibility;
  ownerUserId?: string | null;
  language: string;
}
