import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountsToChown } from '../lib/actions.mjs';

const VOLUME = { Type: 'volume', Name: 'carta-ut-1_db-data', Source: '/var/lib/docker/volumes/carta-ut-1_db-data/_data', Destination: '/app/data' };
const BIND = { Type: 'bind', Source: '/tmp/carta-upgrade-test/run/uploads', Destination: '/app/uploads' };
const OTHER = { Type: 'bind', Source: '/etc/localtime', Destination: '/etc/localtime' };

test('mountsToChown gives the volume name and the host folder, in the order asked', () => {
  assert.deepEqual(mountsToChown([BIND, OTHER, VOLUME], ['/app/data', '/app/uploads']), [
    { destination: '/app/data', type: 'volume', source: 'carta-ut-1_db-data' },
    { destination: '/app/uploads', type: 'bind', source: '/tmp/carta-upgrade-test/run/uploads' },
  ]);
});

test('mountsToChown leaves out a destination without a mount', () => {
  assert.deepEqual(mountsToChown([VOLUME], ['/app/data', '/app/uploads']), [
    { destination: '/app/data', type: 'volume', source: 'carta-ut-1_db-data' },
  ]);
  assert.deepEqual(mountsToChown([OTHER], ['/app/data']), []);
});
