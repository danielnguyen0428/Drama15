/// Mô hình đồ thị quan hệ nhân vật và hàm chuẩn hóa tương thích web.
///
/// Ánh xạ 1-1 với cấu trúc `relationshipGraph` mà API trả về (qua sự kiện SSE
/// `relationshipGraph`, trong `storyPayload`, hoặc ở mức truyện). Hàm
/// [normalizeRelationshipGraph] tái hiện chính xác hành vi của
/// `normalizeRelationshipGraph` trong `apps/web/src/story/storyViewModel.ts`
/// (Req 5.7, 10.4): lọc node/edge theo trường bắt buộc và bỏ qua dữ liệu hỏng.
library;

/// Một nút (nhân vật) trong [RelationshipGraph].
class RelationshipNode {
  const RelationshipNode({
    required this.id,
    required this.name,
    required this.role,
    required this.description,
  });

  final String id;
  final String name;
  final String role;
  final String description;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'role': role,
    'description': description,
  };

  @override
  bool operator ==(Object other) =>
      other is RelationshipNode &&
      other.id == id &&
      other.name == name &&
      other.role == role &&
      other.description == description;

  @override
  int get hashCode => Object.hash(id, name, role, description);
}

/// Một cạnh (quan hệ) giữa hai nút trong [RelationshipGraph].
class RelationshipEdge {
  const RelationshipEdge({
    required this.source,
    required this.target,
    required this.label,
    required this.type,
    this.chapterNumber,
    this.confidence,
  });

  final String source;
  final String target;
  final String label;
  final String type;

  /// Số chương phát sinh quan hệ (tùy chọn).
  final int? chapterNumber;

  /// `'explicit'` hoặc `'inferred'` (tùy chọn).
  final String? confidence;

  Map<String, dynamic> toJson() => {
    'source': source,
    'target': target,
    'label': label,
    'type': type,
    if (chapterNumber != null) 'chapterNumber': chapterNumber,
    if (confidence != null) 'confidence': confidence,
  };

  @override
  bool operator ==(Object other) =>
      other is RelationshipEdge &&
      other.source == source &&
      other.target == target &&
      other.label == label &&
      other.type == type &&
      other.chapterNumber == chapterNumber &&
      other.confidence == confidence;

  @override
  int get hashCode =>
      Object.hash(source, target, label, type, chapterNumber, confidence);
}

/// Đồ thị quan hệ nhân vật gồm danh sách nút và cạnh.
class RelationshipGraph {
  const RelationshipGraph({
    required this.nodes,
    required this.edges,
    this.updatedAt,
  });

  final List<RelationshipNode> nodes;
  final List<RelationshipEdge> edges;
  final String? updatedAt;

  Map<String, dynamic> toJson() => {
    'nodes': nodes.map((node) => node.toJson()).toList(),
    'edges': edges.map((edge) => edge.toJson()).toList(),
    if (updatedAt != null) 'updatedAt': updatedAt,
  };
}

/// Chuẩn hóa một giá trị JSON bất kỳ thành [RelationshipGraph] hợp lệ, hoặc
/// `null` nếu không đủ dữ liệu — tái hiện `normalizeRelationshipGraph` của web.
///
/// Quy tắc (giống `storyViewModel.ts`):
/// - Trả `null` nếu [value] không phải `Map`.
/// - Trả `null` nếu `nodes` không phải `List`.
/// - Giữ lại node có `id`, `name`, `role` là chuỗi (các trường bắt buộc);
///   `description` đọc được thì giữ, thiếu thì mặc định chuỗi rỗng.
/// - Trả `null` nếu sau khi lọc không còn node nào.
/// - `edges`: nếu là `List` thì giữ cạnh có `source`, `target`, `label`,
///   `type` là chuỗi; ngược lại dùng danh sách rỗng.
/// - `updatedAt`: chỉ giữ khi là chuỗi.
RelationshipGraph? normalizeRelationshipGraph(Object? value) {
  if (value is! Map) {
    return null;
  }

  final rawNodes = value['nodes'];
  if (rawNodes is! List) {
    return null;
  }

  final nodes = rawNodes
      .map(_relationshipNodeFromJson)
      .whereType<RelationshipNode>()
      .toList();
  if (nodes.isEmpty) {
    return null;
  }

  final rawEdges = value['edges'];
  final edges = rawEdges is List
      ? rawEdges
            .map(_relationshipEdgeFromJson)
            .whereType<RelationshipEdge>()
            .toList()
      : <RelationshipEdge>[];

  final updatedAt = value['updatedAt'];

  return RelationshipGraph(
    nodes: nodes,
    edges: edges,
    updatedAt: updatedAt is String ? updatedAt : null,
  );
}

/// Trả về [RelationshipNode] khi [value] có đủ `id`/`name`/`role` là chuỗi,
/// ngược lại trả `null` (tương đương `isRelationshipNode` của web).
RelationshipNode? _relationshipNodeFromJson(Object? value) {
  if (value is! Map) {
    return null;
  }
  final id = value['id'];
  final name = value['name'];
  final role = value['role'];
  if (id is! String || name is! String || role is! String) {
    return null;
  }
  final description = value['description'];
  return RelationshipNode(
    id: id,
    name: name,
    role: role,
    description: description is String ? description : '',
  );
}

/// Trả về [RelationshipEdge] khi [value] có đủ `source`/`target`/`label`/`type`
/// là chuỗi, ngược lại trả `null` (tương đương `isRelationshipEdge` của web).
RelationshipEdge? _relationshipEdgeFromJson(Object? value) {
  if (value is! Map) {
    return null;
  }
  final source = value['source'];
  final target = value['target'];
  final label = value['label'];
  final type = value['type'];
  if (source is! String ||
      target is! String ||
      label is! String ||
      type is! String) {
    return null;
  }
  final chapterNumber = value['chapterNumber'];
  final confidence = value['confidence'];
  return RelationshipEdge(
    source: source,
    target: target,
    label: label,
    type: type,
    chapterNumber: chapterNumber is num ? chapterNumber.toInt() : null,
    confidence: confidence is String ? confidence : null,
  );
}
