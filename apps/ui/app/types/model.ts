export interface Model {
  id: string;
  name: string;
  description?: string;
  provider: string;
  contextLength: number;
  parameters?: Record<string, unknown>;
}
