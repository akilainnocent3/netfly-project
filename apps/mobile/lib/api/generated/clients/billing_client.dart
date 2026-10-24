// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/auto_renew_request.dart';
import '../models/checkout.dart';
import '../models/checkout_start_request.dart';
import '../models/checkout_start_result.dart';
import '../models/choose_plan_request.dart';
import '../models/choose_plan_result.dart';
import '../models/membership.dart';
import '../models/payment.dart';
import '../models/phone_override_request.dart';
import '../models/plans_response.dart';
import '../models/subscription.dart';
import '../models/usage_snapshot.dart';

part 'billing_client.g.dart';

@RestApi()
abstract class BillingClient {
  factory BillingClient(Dio dio, {String? baseUrl}) = _BillingClient;

  @POST('/api/v1/billing/auto-renew')
  Future<Subscription> billingAutoRenew({@Body() required AutoRenewRequest body});

  /// What's left before a paid plan or a trial starts (verify email → phone → pay / trial).
  @GET('/api/v1/billing/checkout')
  Future<Checkout> billingCheckout({@Query('plan') String? plan, @Query('trial') bool? trial});

  /// Start the free trial (no charge) or push the plan's payment request to the phone.
  /// The amount comes from the plan on the server; a second tap returns the pending request.
  @POST('/api/v1/billing/checkout/start')
  Future<CheckoutStartResult> billingCheckoutStart({@Body() required CheckoutStartRequest body});

  @GET('/api/v1/billing/membership')
  Future<Membership> billingMembership();

  @POST('/api/v1/billing/notice/dismiss')
  Future<void> billingNoticeDismiss();

  /// Payment history (Account → Membership).
  @GET('/api/v1/billing/payments')
  Future<List<Payment>> billingPayments();

  /// Polled every few seconds by "Check your phone" (reads our DB, kept fresh by the.
  /// webhook and the reconcile job).
  @GET('/api/v1/billing/payments/{payment_id}')
  Future<Payment> billingPayment({@Path('payment_id') required String paymentId});

  /// A new request (new idempotency key) for the same plan, optionally to another number.
  @POST('/api/v1/billing/payments/{payment_id}/resend')
  Future<Payment> billingPaymentResend({
    @Path('payment_id') required String paymentId,
    @Body() PhoneOverrideRequest? body,
  });

  /// Free applies at once. Paid plans / trials return the steps still needed (verify, pay);.
  /// a downgrade from a paid plan waits for the end of the paid period.
  @POST('/api/v1/billing/plan')
  Future<ChoosePlanResult> billingChoosePlan({@Body() required ChoosePlanRequest body});

  /// Public plan list for the plan picker (cached; Studio edits clear it).
  @GET('/api/v1/billing/plans')
  Future<PlansResponse> billingPlans();

  /// Account → Renew now: pay the next period at once (past due, grace, or early).
  @POST('/api/v1/billing/renew-now')
  Future<Payment> billingRenewNow({@Body() PhoneOverrideRequest? body});

  /// Lightweight usage snapshot (profile menu, Play button, re-sync every 30 s).
  @GET('/api/v1/billing/usage')
  Future<UsageSnapshot> billingUsage();
}
