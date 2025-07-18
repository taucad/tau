-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create replicad_chunks table
CREATE TABLE IF NOT EXISTS replicad_chunks (
  id         text PRIMARY KEY,
  signature  text NOT NULL,
  jsdoc      text NOT NULL,
  embedding  vector(1536)         -- OpenAI ada-002 / text-embedding-3-small
);

-- Create index for similarity search
CREATE INDEX IF NOT EXISTS replicad_chunks_embedding_idx ON replicad_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create text search index for signature and jsdoc
CREATE INDEX IF NOT EXISTS replicad_chunks_text_idx ON replicad_chunks 
USING gin (to_tsvector('english', signature || ' ' || jsdoc)); 
