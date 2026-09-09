const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../dist/index.js');
function sdk(execute) {
  delete require.cache[modulePath];
  global.NitroPushNativeScript = { shared: { executeCompletion: execute } };
  return require(modulePath);
}
test('sync coalesces concurrent and reentrant calls and stages for cold restart', async () => {
  let checks = 0; let finish;
  const api = sdk((operation, callback) => { assert.equal(operation, 'sync'); checks++; finish = callback; });
  const client = api.configure();
  const statuses = [];
  let reentrant;
  const first = api.sync(client, {}, status => { statuses.push(status); reentrant = api.sync(client); });
  assert.equal(api.sync(client), first);
  await Promise.resolve();
  assert.equal(reentrant, first);
  assert.equal(checks, 1);
  finish('{"status":"UPDATE_INSTALLED"}', null);
  assert.equal(await first, api.SyncStatus.UPDATE_INSTALLED);
  assert.deepEqual(statuses, ['CHECKING_FOR_UPDATE', 'UPDATE_INSTALLED']);
});
test('ready is explicit and invalid modes never contact native', async () => {
  const operations = [];
  const api = sdk((operation, callback) => { operations.push(operation); callback('null', null); });
  const client = api.configure();
  assert.deepEqual(operations, []);
  await assert.rejects(api.sync(client, { installMode: 'IMMEDIATE' }), /ON_NEXT_RESTART/);
  await client.notifyAppReady();
  assert.deepEqual(operations, ['ready']);
});
test('native failures and malformed responses report UNKNOWN_ERROR and permit retry', async () => {
  let calls = 0;
  const api = sdk((operation, callback) => { calls++; callback(calls === 1 ? '{bad' : '{"status":"UP_TO_DATE"}', null); });
  const client = api.configure();
  assert.equal(await api.sync(client), api.SyncStatus.UNKNOWN_ERROR);
  assert.equal(await api.sync(client), api.SyncStatus.UP_TO_DATE);
});
test('missing native bootstrap produces an actionable error', () => {
  delete global.NitroPushNativeScript; delete require.cache[modulePath];
  assert.throws(() => require(modulePath).configure(), /bootstrap is missing/);
});
test('pending rollback delegates to native without confirming or clearing the running release', async () => {
  const operations = [];
  const api = sdk((operation, callback) => { operations.push(operation); callback('null', null); });
  await api.configure().clearPendingUpdate();
  assert.deepEqual(operations, ['clearPending']);
});
