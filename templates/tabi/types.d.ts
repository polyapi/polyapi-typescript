
// Utility to collapse the generics down to a raw object
type Clean<T extends Record<string, unknown>> = T extends infer U ? { [K in keyof U]: U[K] } : never;

// Utility to ensure at least one of the object's properties is defined
type Subset<T> = {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>
}[keyof T];

type OptionalPolyColumns<T extends Record<string, unknown>> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

type QueryMode = 'default' | 'insensitive';

type ColumnFilter<C extends any, Single extends string, Many extends string> = Clean<{
  [K in Single]?: C;
} & {
  [K in Many]?: C[];
} & {
  not?: C | ColumnFilter<C, Single, Many>;
}>

type Filter<C extends any> = C extends string
  ? Clean<ColumnFilter<C, 'equals' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'startsWith' | 'endsWith', 'in' | 'notIn'> & { mode?: QueryMode }>
  : C extends number
  ? ColumnFilter<C, 'equals' | 'lt' | 'lte' | 'gt' | 'gte', 'in' | 'notIn'>
  : ColumnFilter<C, 'equals', 'in' | 'notIn'>

type Where<T extends Record<string, unknown>> = Clean<{
  [C in keyof T]?: T[C] | Filter<T[C]>;
} & {
  AND?: Where<T> | Where<T>[];
  OR?: Where<T>[];
  NOT?: Where<T> | Where<T>[];
}>;

type PolyCountQuery<T extends Record<string, unknown>> = Clean<{
  where?: Where<T>;
}>;

type PolySelectOneQuery<T extends Record<string, unknown>> = Clean<{
  where?: Where<T>;
  orderBy?: Partial<Record<keyof T, 'asc' | 'desc'>>;
}>;

type PolySelectManyQuery<T extends Record<string, unknown>> = Clean<{
  where?: Where<T>;
  limit?: number; // 1000 is max limit for now
  offset?: number;
  orderBy?: Partial<Record<keyof T, 'asc' | 'desc'>>;
}>;

type PolyDeleteQuery<T extends Record<string, unknown>> = Clean<{
  where?: Where<T>;
}>;

type PolyInsertOneQuery<T extends Record<string, unknown>> = Clean<{
  data: OptionalPolyColumns<T>;
}>;

type PolyInsertManyQuery<T extends Record<string, unknown>> = Clean<{
  data: OptionalPolyColumns<T>[];
}>;

type PolyUpdateQuery<T extends Record<string, unknown>> = Clean<{
  where?: Where<T>;
  data: Subset<T>;
}>;

type PolyQueryResults<T extends Record<string, unknown>> = Clean<{
  results: T[];
  pagination: null;
}>;

type PolyQueryResult<T extends Record<string, unknown>> = Clean<T> | null;

type PolyDeleteResults = {
  deleted: number;
}

type PolyDeleteResult = {
  deleted: boolean;
}

type PolyCountResult = {
  count: number;
}