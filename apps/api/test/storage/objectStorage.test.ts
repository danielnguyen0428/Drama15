import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client
} from '@aws-sdk/client-s3';
import {
  IllegalSignTtlError,
  MAX_SIGNED_URL_TTL_SECONDS,
  ObjectStorageService,
  OwnershipError,
  S3StorageAdapter
} from '../../src/storage/index.js';

interface FakeS3Client {
  send: ReturnType<typeof vi.fn>;
}

function makeFakeS3Client(): FakeS3Client & S3Client {
  const fake: FakeS3Client = { send: vi.fn().mockResolvedValue({}) };
  return fake as unknown as FakeS3Client & S3Client;
}

function buildService(opts?: {
  presigner?: ReturnType<typeof vi.fn>;
  client?: FakeS3Client & S3Client;
  now?: () => Date;
}) {
  const client = opts?.client ?? makeFakeS3Client();
  const presigner =
    opts?.presigner ??
    vi
      .fn()
      .mockImplementation(async (_c, _cmd, options: { expiresIn: number }) => {
        return `https://signed.example/object?X-Amz-Expires=${options.expiresIn}`;
      });

  const adapter = new S3StorageAdapter({
    client,
    bucket: 'drama15-stories',
    kmsKeyId: 'arn:aws:kms:us-east-1:111:key/abc',
    presigner
  });

  const service = new ObjectStorageService({
    adapter,
    now: opts?.now
  });

  return { service, adapter, client, presigner };
}

describe('ObjectStorageService.chapterKey', () => {
  it('builds users/{userId}/stories/{storyId}/chapters/{chapterId}.mp3', () => {
    const { service } = buildService();
    expect(service.chapterKey('u-1', 's-7', 3)).toBe(
      'users/u-1/stories/s-7/chapters/3.mp3'
    );
    expect(service.chapterKey('u-1', 's-7', 'c-abc')).toBe(
      'users/u-1/stories/s-7/chapters/c-abc.mp3'
    );
  });

  it('rejects ids that contain slashes or are empty', () => {
    const { service } = buildService();
    expect(() => service.chapterKey('u/1', 's-1', 1)).toThrow();
    expect(() => service.chapterKey('u-1', 's/1', 1)).toThrow();
    expect(() => service.chapterKey('u-1', 's-1', 'a/b')).toThrow();
    expect(() => service.chapterKey('u-1', '', 1)).toThrow();
    expect(() => service.chapterKey('u-1', 's-1', '')).toThrow();
  });
});

describe('ObjectStorageService.putChapterAudio', () => {
  let env: ReturnType<typeof buildService>;

  beforeEach(() => {
    env = buildService();
  });

  it('writes to S3 with SSE-KMS AES-256 and an owner-scoped key', async () => {
    const { service, client } = env;

    const result = await service.putChapterAudio({
      userId: 'u-1',
      storyId: 's-7',
      chapterId: 3,
      body: new Uint8Array([1, 2, 3]),
      contentType: 'audio/mpeg'
    });

    expect(result.key).toBe('users/u-1/stories/s-7/chapters/3.mp3');
    expect(client.send).toHaveBeenCalledTimes(1);

    const sent = client.send.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(PutObjectCommand);
    const input = (sent as PutObjectCommand).input;

    // owner-scoped key path (Requirement 15.2)
    expect(input.Key).toBe('users/u-1/stories/s-7/chapters/3.mp3');
    // server-side encryption flag is set (Requirement 15.1)
    expect(input.ServerSideEncryption).toBe('aws:kms');
    expect(input.SSEKMSKeyId).toBe('arn:aws:kms:us-east-1:111:key/abc');
    expect(input.ContentType).toBe('audio/mpeg');
    expect(input.Bucket).toBe('drama15-stories');
    expect(input.Metadata).toEqual({ owner: 'u-1' });
  });

  it('defaults the contentType to audio/mpeg when omitted', async () => {
    const { service, client } = env;

    await service.putChapterAudio({
      userId: 'u-2',
      storyId: 's-1',
      chapterId: 'c-1',
      body: 'data'
    });

    const sent = client.send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(sent.input.ContentType).toBe('audio/mpeg');
    expect(sent.input.Key).toBe('users/u-2/stories/s-1/chapters/c-1.mp3');
  });
});

describe('ObjectStorageService.signGet — TTL enforcement (Requirement 9.8)', () => {
  it('raises IllegalSignTtlError when ttlSeconds > 3600', async () => {
    const { service, presigner } = buildService();

    await expect(
      service.signGet({
        key: 'users/u-1/stories/s-1/chapters/1.mp3',
        ttlSeconds: 3601,
        requesterUserId: 'u-1'
      })
    ).rejects.toBeInstanceOf(IllegalSignTtlError);

    await expect(
      service.signGet({
        key: 'users/u-1/stories/s-1/chapters/1.mp3',
        ttlSeconds: 7200,
        requesterUserId: 'u-1'
      })
    ).rejects.toMatchObject({
      code: 'illegal_sign_ttl',
      requestedTtlSeconds: 7200,
      maxTtlSeconds: MAX_SIGNED_URL_TTL_SECONDS
    });

    expect(presigner).not.toHaveBeenCalled();
  });

  it('raises IllegalSignTtlError for non-positive or non-finite TTLs', async () => {
    const { service, presigner } = buildService();

    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        service.signGet({
          key: 'users/u-1/stories/s-1/chapters/1.mp3',
          ttlSeconds: bad,
          requesterUserId: 'u-1'
        })
      ).rejects.toBeInstanceOf(IllegalSignTtlError);
    }

    expect(presigner).not.toHaveBeenCalled();
  });

  it('accepts the boundary ttlSeconds = 3600', async () => {
    const { service, presigner } = buildService();

    const out = await service.signGet({
      key: 'users/u-1/stories/s-1/chapters/1.mp3',
      ttlSeconds: 3600,
      requesterUserId: 'u-1'
    });

    expect(presigner).toHaveBeenCalledTimes(1);
    expect(presigner.mock.calls[0]?.[2]).toEqual({ expiresIn: 3600 });
    expect(out.url).toBe('https://signed.example/object?X-Amz-Expires=3600');
  });
});

describe('ObjectStorageService.signGet — ownership (Requirement 15.2)', () => {
  it('raises OwnershipError when the requester is not the owner of the key', async () => {
    const { service, presigner } = buildService();

    await expect(
      service.signGet({
        key: 'users/owner-1/stories/s-1/chapters/1.mp3',
        ttlSeconds: 600,
        requesterUserId: 'attacker'
      })
    ).rejects.toBeInstanceOf(OwnershipError);

    await expect(
      service.signGet({
        key: 'users/owner-1/stories/s-1/chapters/1.mp3',
        ttlSeconds: 600,
        requesterUserId: 'attacker'
      })
    ).rejects.toMatchObject({ code: 'forbidden' });

    expect(presigner).not.toHaveBeenCalled();
  });

  it('raises OwnershipError for keys outside the users/{...}/ namespace', async () => {
    const { service, presigner } = buildService();

    await expect(
      service.signGet({
        key: 'random/key.bin',
        ttlSeconds: 600,
        requesterUserId: 'u-1'
      })
    ).rejects.toBeInstanceOf(OwnershipError);

    expect(presigner).not.toHaveBeenCalled();
  });

  it('raises OwnershipError when requesterUserId is empty', async () => {
    const { service } = buildService();

    await expect(
      service.signGet({
        key: 'users/u-1/stories/s-1/chapters/1.mp3',
        ttlSeconds: 600,
        requesterUserId: ''
      })
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe('ObjectStorageService.signGet — signed URL contents', () => {
  it('forwards a GetObjectCommand with the same key and the requested TTL', async () => {
    const { service, presigner, client } = buildService();

    await service.signGet({
      key: 'users/u-1/stories/s-1/chapters/1.mp3',
      ttlSeconds: 900,
      requesterUserId: 'u-1'
    });

    expect(presigner).toHaveBeenCalledTimes(1);
    const args = presigner.mock.calls[0];
    expect(args).toBeDefined();
    const [forwardedClient, command, options] = args!;
    expect(forwardedClient).toBe(client);
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input.Key).toBe(
      'users/u-1/stories/s-1/chapters/1.mp3'
    );
    expect(options).toEqual({ expiresIn: 900 });
  });

  it('returns a URL whose expiry parameter matches the requested TTL', async () => {
    const { service } = buildService();

    const out = await service.signGet({
      key: 'users/u-1/stories/s-1/chapters/1.mp3',
      ttlSeconds: 1200,
      requesterUserId: 'u-1'
    });

    expect(out.url).toContain('X-Amz-Expires=1200');
  });

  it('computes expiresAt = now + ttlSeconds (using the injected clock)', async () => {
    const fixed = new Date('2025-01-01T00:00:00.000Z');
    const { service } = buildService({ now: () => fixed });

    const out = await service.signGet({
      key: 'users/u-1/stories/s-1/chapters/1.mp3',
      ttlSeconds: 600,
      requesterUserId: 'u-1'
    });

    expect(out.expiresAt.toISOString()).toBe('2025-01-01T00:10:00.000Z');
    expect(out.expiresAt.getTime() - fixed.getTime()).toBe(600 * 1000);
  });
});
