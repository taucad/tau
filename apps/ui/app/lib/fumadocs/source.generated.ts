/// <reference types="vite/client" />
import { fromConfig } from 'fumadocs-mdx/runtime/vite';
import type * as Config from '#lib/fumadocs/source.config';

export const create = fromConfig<typeof Config>();

export const docs: {
  doc: ReturnType<typeof create.doc>;
  meta: ReturnType<typeof create.meta>;
} = {
  doc: create.doc("docs", "../../../content/docs", import.meta.glob(["./**/*.{mdx,md}"], {
    "base": "../../../content/docs",
    "query": {
      "collection": "docs"
    }
  })),
  meta: create.meta("docs", "../../../content/docs", import.meta.glob(["./**/*.{json,yaml}"], {
    "import": "default",
    "base": "../../../content/docs",
    "query": {
      "collection": "docs"
    }
  }))
};
