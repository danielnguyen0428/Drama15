import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client
} from '@aws-sdk/client-s3';
import {
  MAX_SIGNED_URL_TTL_SECONDS,
  S3StorageAdapter,
  ownerKey
} from '../../src/storage/index.js';

interface FakeClient {
  send: ReturnType<typeof vi.fn>;
}

function makeFakeClient(): FakeClient & S3Client {
  const fake: FakeClient = { send: vi.fn().mockResolvedValue({}) };
  // We only use the `send` method, so casting is safe for tests.
  return fake as unknown as FakeClient & S3Client;
}

describe('ownerKey', () => {
  it('builds users/{userId}/{suffix}', () => {
    expect(ownerKey('u-1', 'voice/s-1/c-3.mp3')).toBe('users/u-1/voice/s-1/c-3.mp3');
  });

  it('strips a leading slash on the suffix', () => {
    expect(ownerKey('u-1', '/voice/s-1/c-3.mp3')).toBe('users/u-1/voice/s-1/c-3.mp3');
  });

  it('rejects userIds containing slashes', () => {
    expect(() => ownerKey('u/1', 'x')).toThrow();
    expect(() => ownerKey('', 'x')).toThrow();
  });

  it('rejects empty suffixes', () => {
    expect(() => ownerKey('u-1', '')).toThrow();
    expect(() => ownerKey('u-1', '/')).toThrow();
  });
});

describe('S3StorageAdapter.putObject', () => {
  let client: FakeClient & S3Client;

  beforeEach(() => {
    client = makeFakeClient();
  });

  it('issues a PutObjectCommand with SSE-KMS AES-256 and the configured key id', async () => {
    const adapter = new S3StorageAdapter({
      client,
      bucket: 'drama15-stories',
      kmsKeyId: 'arn:aws:kms:us-east-1:111:key/abc'
    });

    await adapter.putObject({
      key: 'users/u-1/voice/s-1/c-3.mp3',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'audio/mpeg',
      ownerUserId: 'u-1'
    });

    expect(client.send).toHaveBeenCalledTimes(1);
    const sentCommand = client.send.mock.calls[0]?.[0];
    expect(sentCommand).toBeInstanceOf(PutObjectCommand);
    const input = (sentCommand as PutObjectCommand).input;
    expect(input.Bucket).toBe('drama15-stories');
    expect(input.Key).toBe('users/u-1/voice/s-1/c-3.mp3');
    expect(input.ContentType).toBe('audio/mpeg');
    expect(input.ServerSideEncryption).toBe('aws:kms');
    expect(input.SSEKMSKeyId).toBe('arn:aws:kms:us-east-1:111:key/abc');
    expect(input.Metadata).toEqual({ owner: 'u-1' });
  });

  it('rejects keys that are not owner-scoped to the supplied user', async () => {
    const adapter = new S3StorageAdapter({
      client,
      bucket: 'b',
      kmsKeyId: 'k'
    });

    await expect(
      adapter.putObject({
        key: 'users/other-user/voice/s-1.mp3',
        body: 'x',
        ownerUserId: 'u-1'
      })
    ).rejects.toThrow(/owner-scoped/);

    await expect(
      adapter.putObject({
        key: 'random/key.bin',
        body: 'x',
        ownerUserId: 'u-1'
      })
    ).rejects.toThrow(/owner-scoped/);

    expect(client.send).not.toHaveBeenCalled();
  });
});

describe('S3StorageAdapter.deleteObject', () => {
  it('issues a DeleteObjectCommand with the configured bucket', async () => {
    const client = makeFakeClient();
    const adapter = new S3StorageAdapter({ client, bucket: 'b', kmsKeyId: 'k' });

    await adapter.deleteObject({ key: 'users/u-1/x.bin' });

    const sent = client.send.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(DeleteObjectCommand);
    const input = (sent as DeleteObjectCommand).input;
    expect(input.Bucket).toBe('b');
    expect(input.Key).toBe('users/u-1/x.bin');
  });
});

describe('S3StorageAdapter.getSignedUrl', () => {
  it('clamps expiresInSeconds to 3600 when given 7200 and forwards a GetObjectCommand', async () => {
    const client = makeFakeClient();
    const presigner = vi.fn().mockResolvedValue('https://signed.example/object?Expires=3600');

    const adapter = new S3StorageAdapter({
      client,
      bucket: 'b',
      kmsKeyId: 'k',
      presigner
    });

    const url = await adapter.getSignedUrl({
      key: 'users/u-1/x.bin',
      expiresInSeconds: 7200
    });

    expect(url).toBe('https://signed.example/object?Expires=3600');
    expect(presigner).toHaveBeenCalledTimes(1);
    const args = presigner.mock.calls[0];
    expect(args).toBeDefined();
    const [forwardedClient, command, options] = args!;
    expect(forwardedClient).toBe(client);
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input.Bucket).toBe('b');
    expect((command as GetObjectCommand).input.Key).toBe('users/u-1/x.bin');
    expect(options).toEqual({ expiresIn: MAX_SIGNED_URL_TTL_SECONDS });
  });

  it('honours TTLs below the 3600s ceiling', async () => {
    const client = makeFakeClient();
    const presigner = vi.fn().mockResolvedValue('https://signed.example');

    const adapter = new S3StorageAdapter({
      client,
      bucket: 'b',
      kmsKeyId: 'k',
      presigner
    });

    await adapter.getSignedUrl({ key: 'users/u-1/x.bin', expiresInSeconds: 600 });

    const options = presigner.mock.calls[0]?.[2];
    expect(options).toEqual({ expiresIn: 600 });
  });

  it('uses the adapter default when expiresInSeconds is omitted', async () => {
    const client = makeFakeClient();
    const presigner = vi.fn().mockResolvedValue('https://signed.example');

    const adapter = new S3StorageAdapter({
      client,
      bucket: 'b',
      kmsKeyId: 'k',
      defaultExpiresInSeconds: 1200,
      presigner
    });

    await adapter.getSignedUrl({ key: 'users/u-1/x.bin' });

    expect(presigner.mock.calls[0]?.[2]).toEqual({ expiresIn: 1200 });
  });

  it('clamps an over-large constructor default to 3600', async () => {
    const client = makeFakeClient();
    const presigner = vi.fn().mockResolvedValue('https://signed.example');

    const adapter = new S3StorageAdapter({
      client,
      bucket: 'b',
      kmsKeyId: 'k',
      defaultExpiresInSeconds: 99999,
      presigner
    });

    await adapter.getSignedUrl({ key: 'users/u-1/x.bin' });

    expect(presigner.mock.calls[0]?.[2]).toEqual({
      expiresIn: MAX_SIGNED_URL_TTL_SECONDS
    });
  });

  it('rejects expiresInSeconds <= 0', async () => {
    const client = makeFakeClient();
    const presigner = vi.fn();
    const adapter = new S3StorageAdapter({
      client,
      bucket: 'b',
      kmsKeyId: 'k',
      presigner
    });

    await expect(
      adapter.getSignedUrl({ key: 'users/u-1/x.bin', expiresInSeconds: 0 })
    ).rejects.toThrow();
    await expect(
      adapter.getSignedUrl({ key: 'users/u-1/x.bin', expiresInSeconds: -1 })
    ).rejects.toThrow();
    expect(presigner).not.toHaveBeenCalled();
  });

  it('rejects a non-positive constructor default', () => {
    const client = makeFakeClient();
    expect(
      () =>
        new S3StorageAdapter({
          client,
          bucket: 'b',
          kmsKeyId: 'k',
          defaultExpiresInSeconds: 0
        })
    ).toThrow();
  });
});
