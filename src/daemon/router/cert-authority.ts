import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

import {
  caKeyPath as defaultCaKeyPath,
  caPath as defaultCaPath,
  leafKeyPath as defaultLeafKeyPath,
  leafPath as defaultLeafPath,
  trustMarkerPath as defaultTrustMarkerPath,
} from '@/shared/utils/paths'

const CA_DAYS = 3650
const LEAF_DAYS = 825

const openssl = (args: string[]): void => {
  execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] })
}

const ensureDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

export interface CertAuthorityPaths {
  ca: string
  caKey: string
  leaf: string
  leafKey: string
  trustMarker: string
}

/**
 * The local CA plus one always-current leaf certificate covering every
 * registered hostname. Minting is openssl subprocesses, never a bundled
 * crypto library. Trust enrolment needs root and a terminal for the sudo
 * prompt, so it is exported for the foreground (`outrider on`, a TUI repair
 * action) to call — the daemon itself never elevates.
 */
export class CertAuthority {
  private readonly paths: CertAuthorityPaths
  private mintedSans?: string[]

  /** Defaults to the real data-dir cert paths; overridable so tests never touch them. */
  constructor(paths?: Partial<CertAuthorityPaths>) {
    this.paths = {
      ca: paths?.ca ?? defaultCaPath,
      caKey: paths?.caKey ?? defaultCaKeyPath,
      leaf: paths?.leaf ?? defaultLeafPath,
      leafKey: paths?.leafKey ?? defaultLeafKeyPath,
      trustMarker: paths?.trustMarker ?? defaultTrustMarkerPath,
    }
  }

  /** Create the CA key and self-signed cert on first use; idempotent. */
  ensureCA(): void {
    const { ca, caKey } = this.paths
    if (existsSync(ca) && existsSync(caKey)) return
    ensureDir(ca)
    openssl(['genrsa', '-out', caKey, '2048'])
    openssl([
      'req',
      '-x509',
      '-new',
      '-nodes',
      '-key',
      caKey,
      '-sha256',
      '-days',
      String(CA_DAYS),
      '-out',
      ca,
      '-subj',
      '/CN=outrider local CA',
    ])
    chmodSync(caKey, 0o600)
  }

  /** Re-mint the leaf only when the hostname set actually changed. */
  ensureLeaf(hostnames: string[]): boolean {
    const sans = [...new Set(hostnames)].sort()
    if (this.mintedSans && sans.length === this.mintedSans.length && existsSync(this.paths.leaf)) {
      if (sans.every((h, i) => h === this.mintedSans?.[i])) return false
    }
    this.mintLeaf(sans)
    this.mintedSans = sans
    return true
  }

  private mintLeaf(sans: string[]): void {
    this.ensureCA()
    const { ca, caKey, leaf, leafKey } = this.paths
    const csrPath = `${leaf}.csr`
    const extPath = `${leaf}.ext`
    const cn = sans[0] ?? 'outrider.localhost'
    writeFileSync(extPath, `subjectAltName = ${sans.map((h) => `DNS:${h}`).join(',')}\n`)
    openssl(['genrsa', '-out', leafKey, '2048'])
    openssl(['req', '-new', '-key', leafKey, '-out', csrPath, '-subj', `/CN=${cn}`])
    openssl([
      'x509',
      '-req',
      '-in',
      csrPath,
      '-CA',
      ca,
      '-CAkey',
      caKey,
      '-CAcreateserial',
      '-out',
      leaf,
      '-days',
      String(LEAF_DAYS),
      '-sha256',
      '-extfile',
      extPath,
    ])
    unlinkSync(csrPath)
    unlinkSync(extPath)
  }

  leafKey(): Buffer {
    return readFileSync(this.paths.leafKey)
  }

  leafCert(): Buffer {
    return readFileSync(this.paths.leaf)
  }

  caCert(): Buffer {
    return readFileSync(this.paths.ca)
  }

  /** Read-only: has a previous `trust()` call succeeded since the CA was (re)minted? */
  isTrusted(): boolean {
    const { trustMarker, ca } = this.paths
    if (!existsSync(trustMarker) || !existsSync(ca)) return false
    return statSync(trustMarker).mtimeMs >= statSync(ca).mtimeMs
  }

  /**
   * Enrol the CA into the system trust store. Needs root and a terminal —
   * call only from a foreground command, never from the daemon.
   */
  trust(): { ok: boolean; message: string } {
    this.ensureCA()
    const { ca, trustMarker } = this.paths
    try {
      if (process.platform === 'darwin') {
        execFileSync('security', [
          'add-trusted-cert',
          '-d',
          '-r',
          'trustRoot',
          '-k',
          `${process.env.HOME}/Library/Keychains/login.keychain-db`,
          ca,
        ])
      } else if (existsSync('/etc/pki/ca-trust/source/anchors')) {
        execFileSync('sudo', ['cp', ca, '/etc/pki/ca-trust/source/anchors/outrider-ca.pem'])
        execFileSync('sudo', ['update-ca-trust'])
      } else {
        execFileSync('sudo', ['cp', ca, '/usr/local/share/ca-certificates/outrider-ca.crt'])
        execFileSync('sudo', ['update-ca-certificates'])
      }
      writeFileSync(trustMarker, new Date().toISOString())
      return { ok: true, message: 'the outrider CA is now trusted system-wide' }
    } catch (err) {
      return { ok: false, message: `trust enrolment failed: ${(err as Error).message}` }
    }
  }
}
