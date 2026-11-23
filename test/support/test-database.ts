import { ScenarioContext } from './test-fixtures.js';
import { createScenarioApp } from './test-app.js';

export async function startScenario(): Promise<ScenarioContext> {
  const context = new ScenarioContext(await createScenarioApp());
  await context.clearAuditEvents();
  return context;
}

export async function stopScenario(context?: ScenarioContext) {
  if (!context) return;
  try {
    await context.cleanup();
  } finally {
    await context.app.close();
  }
}