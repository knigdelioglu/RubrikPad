import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script = readFileSync(new URL('../../android/app/src/main/assets/native-asset-refresh.js', import.meta.url), 'utf8');

function createEnvironment({controlled = false, failUnregister = false} = {}) {
  const events: string[] = [];
  const cacheNames = new Set(['workbox-precache-v2-https://localhost/', 'teacher-documents']);
  const window = {
    __rubrikpadNativeAssetsReady: undefined as Promise<boolean> | undefined,
    stop: () => events.push('stop'),
    location: {reload: () => events.push('reload')},
    caches: {},
  };
  // Any access to durable application storage fails the test.
  for (const key of ['localStorage', 'indexedDB']) {
    Object.defineProperty(window, key, {get() { throw new Error(`Unexpected ${key} access`); }});
  }
  const context = {
    window,
    navigator: {
      serviceWorker: {
        controller: controlled ? {} : null,
        getRegistrations: async () => [{
          unregister: async () => {
            events.push('unregister');
            if (failUnregister) throw new Error('Worker unregister failed');
            return true;
          },
        }],
      },
    },
    caches: {
      keys: async () => [...cacheNames],
      delete: async (name: string) => {
        events.push(`delete:${name}`);
        return cacheNames.delete(name);
      },
    },
    document: {
      open: () => events.push('error-page'),
      write: (html: string) => { assert.match(html, /Yeniden Dene/); },
      close: () => {},
    },
    console: {error: () => events.push('error')},
  };
  return {context, events, cacheNames};
}

test('native upgrade stops old code, removes only asset caches and reloads after cleanup', async () => {
  const env = createEnvironment({controlled: true});
  runInNewContext(script, env.context);
  assert.equal(await env.context.window.__rubrikpadNativeAssetsReady, false);
  assert.deepEqual(env.events, ['stop', 'unregister', 'delete:workbox-precache-v2-https://localhost/', 'reload']);
  assert.deepEqual([...env.cacheNames], ['teacher-documents']);
});

test('uncontrolled native startup permits mounting without another reload', async () => {
  const env = createEnvironment();
  runInNewContext(script, env.context);
  assert.equal(await env.context.window.__rubrikpadNativeAssetsReady, true);
  assert.deepEqual(env.events, ['unregister', 'delete:workbox-precache-v2-https://localhost/']);
});

test('document-start and page-loaded callbacks share one cleanup and one reload', async () => {
  const env = createEnvironment({controlled: true});
  runInNewContext(script, env.context);
  const first = env.context.window.__rubrikpadNativeAssetsReady;
  runInNewContext(script, env.context);
  assert.equal(env.context.window.__rubrikpadNativeAssetsReady, first);
  await first;
  runInNewContext(script, env.context);
  assert.equal(env.events.filter(event => event === 'reload').length, 1);
  assert.equal(env.events.filter(event => event === 'unregister').length, 1);
});

test('failed legacy cleanup offers a retry without mounting stale code or looping', async () => {
  const env = createEnvironment({controlled: true, failUnregister: true});
  runInNewContext(script, env.context);
  assert.equal(await env.context.window.__rubrikpadNativeAssetsReady, false);
  assert.deepEqual(env.events, ['stop', 'unregister', 'error', 'error-page']);
  assert.equal(env.cacheNames.size, 2);
});

test('cleanup failure without an old controller still permits current APK code', async () => {
  const env = createEnvironment({failUnregister: true});
  runInNewContext(script, env.context);
  assert.equal(await env.context.window.__rubrikpadNativeAssetsReady, true);
  assert.deepEqual(env.events, ['unregister', 'error']);
});

test('startup also works when service worker and cache APIs are unavailable', async () => {
  const env = createEnvironment();
  Reflect.deleteProperty(env.context.navigator, 'serviceWorker');
  Reflect.deleteProperty(env.context.window, 'caches');
  runInNewContext(script, env.context);
  assert.equal(await env.context.window.__rubrikpadNativeAssetsReady, true);
  assert.deepEqual(env.events, []);
});
