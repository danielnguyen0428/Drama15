// Kiểm thử smoke cơ bản cho khung ứng dụng "Drama 15".
//
// Xác nhận khung ứng dụng tối thiểu dựng được và hiển thị nội dung placeholder.
// Các kiểm thử widget chi tiết theo từng màn hình sẽ được bổ sung ở tác vụ 8.7.

import 'package:flutter_test/flutter_test.dart';

import 'package:drama15_mobile/main.dart';

void main() {
  testWidgets('Khung ứng dụng dựng được và hiển thị placeholder', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const Drama15App());

    expect(find.text('Drama 15 — Xưởng viết tiểu thuyết ngắn'), findsOneWidget);
  });
}
