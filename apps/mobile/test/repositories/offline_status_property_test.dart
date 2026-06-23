// Property-based test: suy diễn Offline_Download_Status nhất quán (Req 16.9).
//
// Feature: flutter-drama-mobile-app, Property 17: Suy diễn Offline_Download_Status nhất quán

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/offline_download.dart';
import 'package:drama15_mobile/repositories/offline_repository.dart';

void main() {
  // Cặp mốc thời gian ISO-8601 (server có thể mới hơn/cũ hơn/bằng local).
  final tsGen = any.choose<String>(<String>[
    '2024-01-01T00:00:00.000Z',
    '2024-06-01T00:00:00.000Z',
    '2025-01-01T00:00:00.000Z',
  ]);

  Glados3<bool, bool, String>(
    any.bool, // isDownloaded
    any.bool, // isDownloading
    tsGen, // local
    ExploreConfig(numRuns: 100),
  ).test('deriveStatus và isUpdateAvailable nhất quán', (
    isDownloaded,
    isDownloading,
    local,
  ) {
    for (final server in const <String>[
      '2024-01-01T00:00:00.000Z',
      '2024-06-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
    ]) {
      final status = OfflineRepository.deriveStatus(
        isDownloaded: isDownloaded,
        isDownloading: isDownloading,
        localUpdatedAt: local,
        serverUpdatedAt: server,
      );

      final updateAvailable = OfflineRepository.isUpdateAvailable(
        local,
        server,
      );
      expect(
        updateAvailable,
        DateTime.parse(server).isAfter(DateTime.parse(local)),
      );

      final expected = isDownloading
          ? OfflineDownloadStatus.downloading
          : !isDownloaded
          ? OfflineDownloadStatus.notDownloaded
          : updateAvailable
          ? OfflineDownloadStatus.updateAvailable
          : OfflineDownloadStatus.downloaded;
      expect(status, expected);
    }
  });
}
