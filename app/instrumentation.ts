export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RAPTOR_INDEXER_ENABLED !== "true") return;
  const { startIndexer } = await import("./lib/indexer/worker");
  startIndexer();
}
