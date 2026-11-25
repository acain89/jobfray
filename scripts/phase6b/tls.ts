import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Public ISRG Root X1, already trusted by Node's bundled Mozilla CA set.
// Never learn trust from the database's presented certificate.
export const rootCertPath = resolve('prisma/certs/isrg-root-x1.pem');
export function trustedCA():string {
  const pem=readFileSync(rootCertPath,'utf8'),cert=new X509Certificate(pem);
  if(cert.fingerprint256!=='96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6' || !cert.ca || Date.now()<Date.parse(cert.validFrom) || Date.now()>=Date.parse(cert.validTo))
    throw new Error('Pinned public CA is invalid, expired or changed. Review the trusted CA before continuing.');
  return pem;
}
// Prisma 5.22 supports require + strict + sslcert, not libpq's verify-full
// or sslrootcert. Keep the DNS hostname intact for native TLS verification.
export function prismaMigrationURL(url:URL):URL {
  trustedCA();
  const result=new URL(url);
  result.searchParams.set('sslmode','require');
  result.searchParams.set('sslaccept','strict');
  result.searchParams.set('sslcert',rootCertPath.replaceAll('\\','/'));
  return result;
}
export function libpqTLS():Record<string,string> {
  trustedCA();
  return {PGSSLMODE:'verify-full',PGSSLROOTCERT:rootCertPath,PGSSLMINPROTOCOLVERSION:'TLSv1.2'};
}
