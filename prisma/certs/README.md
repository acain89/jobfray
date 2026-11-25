# Render external PostgreSQL trust anchor

`isrg-root-x1.pem` is the public, self-signed ISRG Root X1 certificate,
extracted from Node 22.20.0's bundled Mozilla trusted CA list. It contains no
credentials or private key. SHA-256 fingerprint:

`96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6`

Official certificate and chain information: https://letsencrypt.org/certificates/
Render external connection guidance: https://render.com/tutorials/postgres-on-render/connection-strings

The initialization workflow validates this fingerprint and validity period before
use. Node's diagnostic and libpq use this explicit anchor. Prisma 5.22's migration
connection adds it using `sslcert` with `sslmode=require&sslaccept=strict`;
native TLS retains hostname verification. `sslrootcert` and `verify-full` are
libpq settings and must not be copied into Prisma 5.22 connections.

Trust is never derived from a server-presented leaf certificate. An unexpected
chain, expired certificate, or hostname mismatch stops initialization. If Render
changes to a chain that does not reach this anchor, review the provider's public
CA chain and update the reviewed trust configuration; do not weaken verification.
