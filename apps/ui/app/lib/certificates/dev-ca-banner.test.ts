import { describe, expect, test } from 'vitest';

import {
  formatIosTrustBanner,
  formatQrCaption,
  indentBannerBlock,
  readDevRootCommonNameFromCertificatePem,
} from '#lib/certificates/dev-ca-banner.js';

/** OpenSSL-generated fixture with CN=test-mkcert-root-local */
const testMkcertFixturePem = `-----BEGIN CERTIFICATE-----
MIIDIzCCAgugAwIBAgIUbIWshLIE4qN49seAt3i6YEFlvf4wDQYJKoZIhvcNAQEL
BQAwITEfMB0GA1UEAwwWdGVzdC1ta2NlcnQtcm9vdC1sb2NhbDAeFw0yNjA1MDYw
MDEyMzhaFw0zNjA1MDMwMDEyMzhaMCExHzAdBgNVBAMMFnRlc3QtbWtjZXJ0LXJv
b3QtbG9jYWwwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDaGgV0l9aj
fgaqfi3HeFP7jlPrhQr1l9kW8OSZM8pU9RLztOFIYSSayI1PFlT8du60CiZGZ66x
1ztG1iWNn0uAd27apUcBjpSePORjB2TZhZ9dUgu8CrBklzgmqIBtIiKtT0ZFHS4Q
A5bcGEy2yHlMPWDh0qVAks73To3+oE8VJHfKJRhMIZtgAyuQPKEDeqfhrZcwYdAi
s1ythxQs0w35JrKr7m9iv9qTS0CcQ0BVsZ+lJrtyaD93HyyFwptZlkhldUvsm8l6
nMgIPU2nO5bn++QtEBbuA5+/7Dw3LWXizBUjL7iEpTQD3uYscnOv+IL2TC5XuLLC
MrtptvIDzbNnAgMBAAGjUzBRMB0GA1UdDgQWBBRjf5aea4Bt41OK0OfXwiLs78Oh
cDAfBgNVHSMEGDAWgBRjf5aea4Bt41OK0OfXwiLs78OhcDAPBgNVHRMBAf8EBTAD
AQH/MA0GCSqGSIb3DQEBCwUAA4IBAQByBsIPhDj1YN5QuSIpds5qfwCKNno8Dbf9
8QhtUAa2CgObNX/5dTQ8khw24Po3G4Nw5GU2ewe+h8IJatnVi66rArHp4cx0tc7f
myO/XxbGGcF1tZVJkkEkHCly30SWgoVhcbiJmZ++THbp/JoIWbUJhz7ATCNv7beK
FOhWZTEm4MhCxWvw1KbQxUAD/QZZJDvov/QnuKSm0Y4q6c8RXVbZMWTKMY/YLFaF
jxX24zmqkypz73qxCYJsX4X/TYw5Alr0FrKn9mQXpMMO/udJ6WJVwSbMlmuClXqy
JTvc9YffMPlTvWzimGpuCwtPWaQiX/ormIudyYXIiPT3bbt4Oy5P
-----END CERTIFICATE-----
`;

describe('readDevRootCommonNameFromCertificatePem', () => {
  test('extracts CN from mkcert-shaped root PEM', () => {
    expect(readDevRootCommonNameFromCertificatePem(testMkcertFixturePem)).toBe('test-mkcert-root-local');
  });

  test('falls back when PEM is malformed', () => {
    expect(readDevRootCommonNameFromCertificatePem('-----BEGIN CERTIFICATE-----\nwat\n')).toBe('the mkcert dev CA');
  });
});

describe('formatIosTrustBanner', () => {
  test('renders condensed iOS checklist with rationale header and numbered steps', () => {
    const { header, steps } = formatIosTrustBanner({
      httpsUrl: 'https://203.0.113.42:3000',
      rootCommonName: 'mkcert alice@notebook',
    });

    expect(header).toContain('Trust the mkcert dev CA');
    expect(header).toContain(`${'─'.repeat(67)}`);
    expect(header).toContain('SharedArrayBuffer');
    expect(header).toContain('cross-origin');
    expect(header).toContain('https://203.0.113.42:3000');
    expect(header).toContain('https://docs.tau.new/runtime/guides/cross-origin-isolation');

    expect(steps).toContain('Certificate Trust Settings');
    expect(steps).toContain('mkcert alice@notebook');
    expect(steps).toContain('  1. Tap "Allow"');
    expect(steps).toContain('  2. Settings -> General -> VPN & Device Management');
    expect(steps).toContain('  3. Settings -> General -> About -> Certificate Trust Settings');
    expect(steps).toContain('  4. Reload https://203.0.113.42:3000 in Safari');
    expect(steps).not.toContain('Or open this URL on the device');
  });
});

describe('formatQrCaption', () => {
  test('renders single-line headline and URL with two-space indent', () => {
    const caption = formatQrCaption({
      headline: 'Step 1: install dev CA (HTTP)',
      url: 'http://203.0.113.42:3010/_dev/ca.crt',
    });

    expect(caption).toBe('  Step 1: install dev CA (HTTP)  ·  http://203.0.113.42:3010/_dev/ca.crt');
  });

  test('appends extra LAN URLs under an "Other LAN URLs" heading when supplied', () => {
    const caption = formatQrCaption({
      extraUrls: ['http://198.51.100.77:3010/_dev/ca.crt', 'http://10.0.0.5:3010/_dev/ca.crt'],
      headline: 'Step 1: install dev CA (HTTP)',
      url: 'http://203.0.113.42:3010/_dev/ca.crt',
    });

    expect(caption).toContain('Step 1: install dev CA (HTTP)  ·  http://203.0.113.42:3010/_dev/ca.crt');
    expect(caption).toContain('  Other LAN URLs:');
    expect(caption).toContain('    http://198.51.100.77:3010/_dev/ca.crt');
    expect(caption).toContain('    http://10.0.0.5:3010/_dev/ca.crt');
  });

  test('omits the extras block when no extra URLs are supplied', () => {
    const caption = formatQrCaption({
      headline: 'Step 4: open Tau (HTTPS)',
      url: 'https://203.0.113.42:3000',
    });

    expect(caption).not.toContain('Other LAN URLs');
    expect(caption.split('\n')).toHaveLength(1);
  });
});

describe('indentBannerBlock', () => {
  test('prefixes each non-empty line with two spaces and preserves blank lines', () => {
    const indented = indentBannerBlock('line one\n\nline three\n');
    expect(indented).toBe('  line one\n\n  line three\n');
  });
});
