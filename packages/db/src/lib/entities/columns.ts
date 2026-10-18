import type { ValueTransformer } from 'typeorm';

/** bigint and numeric columns come back from pg as strings; money and quantities are JS numbers. */
export const numberTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? value : Number(value),
};

/** pgvector columns are text on the wire: "[0.1,0.2,...]". */
export const vectorTransformer: ValueTransformer = {
  to: (value?: number[] | null) =>
    value === null || value === undefined ? value : `[${value.join(',')}]`,
  from: (value?: string | null) =>
    value === null || value === undefined
      ? value
      : value.slice(1, -1).split(',').map(Number),
};

/** Dimension of the embedding column. Changing it requires re-embedding every chunk. */
export const EMBEDDING_DIMENSIONS = 1024;
