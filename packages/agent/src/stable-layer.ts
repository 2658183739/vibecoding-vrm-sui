export interface StableLayerClient {
  submitTask(input: Record<string, unknown>): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<{ status: "pending" | "done" | "failed"; output?: unknown }>;
}

export class InMemoryStableLayerClient implements StableLayerClient {
  private readonly store = new Map<
    string,
    { status: "pending" | "done" | "failed"; output?: unknown }
  >();

  async submitTask(input: Record<string, unknown>): Promise<{ taskId: string }> {
    const taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    this.store.set(taskId, { status: "done", output: input });
    return { taskId };
  }

  async getTask(
    taskId: string
  ): Promise<{ status: "pending" | "done" | "failed"; output?: unknown }> {
    return this.store.get(taskId) ?? { status: "failed" };
  }
}
