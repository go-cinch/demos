# Audit pages

PC routes `/audit/login` and `/audit/operation` are grouped under Audit / 审计.
This implementation is independent; no scaffold-master code, styles or assets
were imported. It uses Vben's shell, EchartsUI/useEcharts and ScrollArea, Ant
Design Vue controls, and the shared Go Cinch management toolbar.

## Data and scopes

Five metrics describe the header time range with the current search filters. Selecting a heatmap cell or
trend interval narrows the insight panel and records to exact timestamp bounds.
Search, result/module and related account/IP/path filters update metrics, charts,
insights and records together. Sorting and pagination affect records only.
Time drilldown preserves the overview range and applies all current filters;
monthly hourly heatmaps refresh their parent day even when an hour is selected. Export uses the last successfully
displayed filter and sort snapshot, with a separate export permission.

Login heatmaps use native buttons with localized tooltips and keyboard navigation:

- Last 24 hours: 24 consecutive hourly cells ending at the range endpoint.
- Last 7 days: actual local dates by hour, including today and six earlier dates.
- Last 30 days: 30 local calendar-date cells, including today.

Calendar ranges begin at local midnight on the first included date. Today is
clipped to the snapshot endpoint; future hours are not selectable. The backend
returns `started_at`/`ended_at` per cell, without merging recurring weekdays.
Dates render in the user's selected timezone. Empty periods remain empty.

The monthly heatmap exposes Day/Hour only after selecting a date. Hour reuses its
scoped summary and shows 24 equal-sized slots, with disabled placeholders for
unavailable hours. Repeated DST hours share one wall-clock slot. Returning to Day
restores the selected date. Forward/upward wheel input selects the hovered date
and expands its hours; backward/downward input returns to that date. Normal
scrolling and modified browser-zoom gestures remain available outside this scope.
A short gesture lock absorbs inertia. Tooltip suppression precedes transitions.

The selected date is the origin of a 20px-to-50px lens animation, reversed on
return. Motion respects reduced-motion preferences. Both rank sections always
reserve five 24px rows, including sparse and empty results. The scope title reserves three lines (start, separator, end), and loading/error feedback overlays
the reserved content area. Account counts therefore never resize either card or
the heatmap cells. The heatmap uses its actual row count for 24-hour, 7-day,
30-day and monthly day/hour views. Level controls expand and collapse smoothly.

## Presentation and investigation

Blue intensity represents activity. When failures exceed successes, red intensity
represents the failure ratio; cells have no failure corner marker. With a result
filter, only that result is charted: blue for successes and red for failures,
with heat intensity proportional to the filtered count. The global
success-rate bar uses blue for success and red for its failure remainder.

Period insights show at most ten ranked failure accounts and source IPs. Labels
always read Top 10 / 前 10 名, even for sparse or empty scopes. Each native Vben
ScrollArea appears only for more than five rows; shorter and empty results use
a plain container of the same height, without a scrollbar. Overflow scrollbars
appear only while hovering the corresponding list and hide on pointer leave.
Rank links toggle their own exact filter independently, with a pressed state.
Search suggestions use matching audit records to identify the matched account,
IP, path or trace ID. Field labels and values are separated; literal matches are
red, long values wrap in a wider popup, and selecting a suggestion preserves its
field value rather than replacing it with an account name. Clearing the query
immediately removes backend suggestions and invalidates pending lookups; only
the separately labeled search history remains.
Demo data is seeded separately in the local database with marked account names,
documentation IPs and trace IDs; it is not part of a template migration.

Search fields and active filter tags share a dedicated card, with tags above the
form. A 16px gap separates it from the records workspace. Record ordering uses
Segmented controls alongside the table toolbar in the results card. Fullscreen
includes both the search and results regions. Reset clears record filters,
ordering and selected scope. Total records use native table pagination.
Trend selection uses chart clicks and the native ECharts data-zoom slider, with
no extra time-bucket dropdown. Operation details stay beside the table and can
expand into an Ant Design drawer. Detail facts retain the technical `auth` module
code. Expanded details place the labeled User Agent immediately after Trace ID,
before the investigation actions. Trace IDs require `tracer.enabled: true` in
the running auth service; enabling it affects new requests, not historical rows.

Operation records reserve a 660px table body, including sparse or empty results.
Ten default-density rows fit without vertical scrolling; larger page sizes such
as 50 rows retain this height and show a scrollbar only when content overflows.
The adjacent detail pane follows the records' height and scrolls internally, so
opening or changing an event cannot stretch the card or leave unused space below
pagination. At narrower widths the detail pane stacks below the records with a
bounded height. Login records keep their existing compact table and detail drawer.
Detail content grows naturally inside the bounded pane, with bottom spacing so
the final investigation actions scroll fully into view above the floating
back-to-top control.

Range changes show a fixed-height native Skeleton until the matching summary is
available and the layout has completed two animation frames. Old hourly data is
never presented in a new daily layout. Request generations discard stale results;
leaving the page or changing account invalidates pending requests and cached data.
All text is bilingual and styles derive from Vben/Ant Design theme tokens.

## Validation and design references

The generated preview runs on port 5666 with auth on port 8081. Black-box coverage
lives in `e2e/tests/vben-antd-vue3/audit.spec.ts`. Follow LOCAL_DEV_WORKFLOW.md,
including type checks, discovery, the complete headless local full suite and
verified fixture cleanup.

Research informed interaction concepts, not copied layouts or source code:

- https://clerk.com/docs/guides/dashboard/logs/overview
- https://workos.com/docs/audit-logs
- https://docs.datadoghq.com/account_management/audit_trail/
- https://auth0.com/docs/deploy-monitor/logs/view-log-events
- https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/users-page
- https://echarts.apache.org/examples/en/editor.html?c=heatmap-cartesian

## Operation parameters

Operation details show the operation type, target type/ID, request parameters,
and response parameters. Payloads are fetched by the detail endpoint only and
rendered as plain text in keyboard-accessible, bounded scrolling regions. They
are never interpreted as HTML. Sensitive values are fully hidden by the backend;
files appear as `file`, missing payloads use localized empty text, and omitted
payloads retain the backend's omission marker. Login details remain metadata-only.

`audit-params.spec.ts` verifies encrypted credential redaction, nested secret
filtering, ordinary values, expanded details, safe text rendering and scroll
bounds. `audit-permissions.spec.ts` verifies independent login/operation menus,
read/export buttons, manual-route denial, and export-only grants without read
access. All mutations use disposable users/dictionaries and UI cleanup.
