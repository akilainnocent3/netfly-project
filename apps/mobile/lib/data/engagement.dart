import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../api/generated/models/rating_input_request.dart';
import '../api/generated/models/value_enum.dart';
import '../core/api_error.dart';
import '../core/http.dart';
import '../core/session.dart';
import 'catalog.dart';

/// What the viewer did on this device that the last fetched data doesn't know yet: shown at once
/// (no spinner for a tap), reconciled when the call returns.
class Engagement {
  const Engagement({this.myList = const {}, this.ratings = const {}, this.reminders = const {}});

  final Map<int, bool> myList;
  final Map<int, int?> ratings; // -1 not for me, 1 like, 2 love, null cleared
  final Map<int, bool> reminders;

  Engagement copyWith({Map<int, bool>? myList, Map<int, int?>? ratings, Map<int, bool>? reminders}) => Engagement(
    myList: myList ?? this.myList,
    ratings: ratings ?? this.ratings,
    reminders: reminders ?? this.reminders,
  );
}

class EngagementController extends Notifier<Engagement> {
  @override
  Engagement build() {
    ref.watch(userProvider.select((u) => u?.id)); // a different viewer starts clean
    return const Engagement();
  }

  bool inMyList(int id, bool fromServer) => state.myList[id] ?? fromServer;
  int? rating(int id, int? fromServer) => state.ratings.containsKey(id) ? state.ratings[id] : fromServer;
  bool reminded(int id, bool fromServer) => state.reminders[id] ?? fromServer;

  Future<void> setMyList(int id, bool on) async {
    state = state.copyWith(myList: {...state.myList, id: on});
    try {
      final api = ref.read(apiProvider).myList;
      await (on ? api.myListAdd(titleId: id) : api.myListRemove(titleId: id));
      ref.invalidate(myListProvider);
    } catch (e) {
      state = state.copyWith(myList: {...state.myList}..remove(id));
      throw ApiError.from(e);
    }
  }

  Future<void> rate(int id, int? value) async {
    state = state.copyWith(ratings: {...state.ratings, id: value});
    try {
      final api = ref.read(apiProvider).ratings;
      if (value == null) {
        await api.unrateTitle(titleId: id);
      } else {
        final enumValue = ValueEnum.values.firstWhere((v) => v.json == value);
        await api.rateTitle(
          titleId: id,
          body: RatingInputRequest(value: enumValue),
        );
      }
    } catch (e) {
      state = state.copyWith(ratings: {...state.ratings}..remove(id));
      throw ApiError.from(e);
    }
  }

  Future<void> setReminder(int id, bool on) async {
    state = state.copyWith(reminders: {...state.reminders, id: on});
    try {
      final api = ref.read(apiProvider).reminders;
      await (on ? api.reminderAdd(titleId: id) : api.reminderRemove(titleId: id));
    } catch (e) {
      state = state.copyWith(reminders: {...state.reminders}..remove(id));
      throw ApiError.from(e);
    }
  }

  Future<void> hideFromContinueWatching(int id) async {
    await ref.read(apiProvider).continueWatching.continueWatchingRemove(titleId: id);
    ref.invalidate(homeFeedProvider);
  }
}

final engagementProvider = NotifierProvider<EngagementController, Engagement>(EngagementController.new);

/// Signed out, an action opens Welcome and comes back here afterwards (decision 50).
bool requireAccount(BuildContext context, WidgetRef ref) {
  if (ref.read(userProvider) != null) return true;
  final here = GoRouterState.of(context).uri.toString();
  context.push('/welcome?next=${Uri.encodeComponent(here)}');
  return false;
}

/// Run an engagement action with a haptic tap and a toast on failure.
Future<void> engage(BuildContext context, Future<void> Function() action, {String? done}) async {
  unawaited(HapticFeedback.lightImpact());
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    await action();
    if (done != null) messenger?.showSnackBar(SnackBar(content: Text(done), duration: const Duration(seconds: 2)));
  } on ApiError catch (e) {
    messenger?.showSnackBar(SnackBar(content: Text(e.message)));
  }
}
