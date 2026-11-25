import { test } from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { libpqTLS, prismaMigrationURL, rootCertPath, trustedCA } from '../scripts/phase6b/tls';
import { targetFrom } from '../scripts/phase6b/initialize';

test('explicit public root is in the runtime trust set and libpq gets an absolute CA path',()=>{
 const pem=trustedCA();
 assert.ok(rootCertificates.some(root=>new X509Certificate(root).fingerprint256===new X509Certificate(pem).fingerprint256));
 assert.deepEqual(libpqTLS(),{PGSSLMODE:'verify-full',PGSSLROOTCERT:rootCertPath,PGSSLMINPROTOCOLVERSION:'TLSv1.2'});
});
test('Prisma 5 migration URL preserves hostname and encoded credentials and enforces supported strict TLS',()=>{
 const target=targetFrom('postgresql://jobfray_owner:p%40ss%2Fword@dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com/jobfray?sslmode=verify-full');
 const url=prismaMigrationURL(target.url);
 assert.equal(url.hostname,target.url.hostname);assert.equal(url.password,target.url.password);
 assert.equal(url.searchParams.get('sslmode'),'require');assert.equal(url.searchParams.get('sslaccept'),'strict');
 assert.equal(url.searchParams.get('sslcert'),rootCertPath.replaceAll('\\','/'));
 assert.equal(url.searchParams.has('sslrootcert'),false);assert.equal(target.url.searchParams.get('sslmode'),'verify-full');
});
