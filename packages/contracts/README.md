# @drama15/contracts

Shared TypeScript contracts (types + DTOs) for the Drama15 commercial web SaaS.
Consumed by `apps/api`, `apps/web`, and `apps/admin`.

This package contains **types only** — no runtime helpers, no validation, no
network code. It can be imported safely on both sides of the trust boundary
between `Web_Client` and `API_Gateway`.

## Modules

| Module      | Exports                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `auth`      | `AccessTokenClaims`, `RefreshCookieFlags`, `LoginCallback{Request,Response}`, `Refresh{Request,Response}`, `LogoutRequest` |
| `plan`      | `PlanType`, `PlanStatus`, `PlanState`, `PlanHistoryReason`                                       |
| `quota`     | `QuotaErrorCode`, `QuotaAction`, `QuotaDecision`                                                 |
| `errors`    | `ErrorCode`, `ApiError`                                                                          |
| `devices`   | `DeviceFingerprint`, `DeviceStatus`, `DeviceRecord`, `ListDevicesResponse`, `RemoveDeviceRequest`|
| `stories`   | `OutputLanguage`, `StorySetupConfig`, `StoryCreateMode`, `CreateStory{Request,Response}`, `Chapter`, `ChapterStatus`, `StoryStatus`, `StoryDetail`, `StoryListItem`, `ListStoriesResponse`, `ResumeStory{Request,Response}` |
| `rewrite`   | `RewriteMode`, `Rewrite{Request,Response}`                                                       |
| `automation`| `AutomationStatus`, `AutomationControlAction`, `AutomationCreateRequest`, `AutomationStoryProgress`, `AutomationJob`, `AutomationControlRequest` |
| `voice`     | `Voice`, `ListVoicesResponse`, `VoiceJobCreateRequest`, `VoiceJobStatus`, `VoiceChapterArtifact`, `VoiceJob`, `VoiceControlAction`, `VoiceControlRequest` |
| `export`    | `ExportPdf{Request,Response}`, `ExportMarkdownResponse`                                          |
| `admin`     | `AdminLookupKey`, `AdminLookupRequest`, `AdminUserSummary`, `AdminLookupResponse`, `AdminUpgradeRequest`, `AdminRevokeRequest`, `AdminFlagReason`, `AdminFlagRecord`, `AdminAuditQuery`, `AdminAuditEvent`, `AdminAuditResponse` |
| `locale`    | `UiLocale`                                                                                       |

The barrel `@drama15/contracts` re-exports every symbol above. Sub-paths
(e.g. `@drama15/contracts/auth`) are also available via the package's
`exports` map.

## Driving Requirements

These contracts implement the canonical shapes referenced by the
`commercial-web-saas` spec:

- **3.4** — server-authoritative authorization. `AccessTokenClaims` MUST NOT
  carry `plan`, `quota`, or `role`; consumers must always go through
  `License_Service`.
- **3.5** — Access_Token TTL ≤ 15 minutes. `LoginCallbackResponse.expiresInSeconds`
  is the SLA boundary.
- **5.9** — `rate_limited` and quota-exhausted responses MUST carry
  `retryAfterSeconds` / `resetAt`. Encoded in `QuotaDecision` and `ApiError`.
- **6.12** — output language is passed straight through to the upstream
  generator. Encoded in `StorySetupConfig.outputLanguage`.
- **19.3** — UI locale is fully separated from output language. Encoded in
  `UiLocale` (separate file) vs `OutputLanguage` in `stories`.

## Build

```bash
npm install
npm run build
```

Produces ESM JavaScript and `.d.ts` declarations in `dist/`.
