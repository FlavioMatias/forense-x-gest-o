import { ScenarioActor } from './test-fixtures.js';

export function authHeaders(actor: ScenarioActor) {
  return { Authorization: `Bearer ${actor.token}` };
}