# Usage Stats Auto-Refresh And Dashboard Fusion Design

## Background

The target is the official CLIProxyAPI Management Center usage statistics page. The current page already provides usable filters, cards, and charts, but it lacks automatic refresh and its visual system can be pushed further toward a "techy + professional control console" feel.

This work stays within the official management center architecture and keeps single-file build compatibility. It is an incremental enhancement, not a rewrite.

## Goals

1. Add configurable automatic refresh to the usage statistics page.
2. Refresh only when the page is actually active, to avoid unnecessary requests.
3. Keep manual refresh fully available and ensure auto-refresh never creates overlapping requests.
4. Upgrade the usage page visual language with the approved A + C fusion direction:
   - A: stronger real-time control room atmosphere, glow, signal, and motion cues
   - C: disciplined enterprise dashboard structure, readability, and data hierarchy

## Non-Goals

1. No backend API changes unless strictly required by an implementation issue discovered later.
2. No full management center redesign.
3. No auto-refresh for unrelated pages in this task.
4. No background polling when the usage page is hidden, unfocused, or not visible.

## User-Approved Product Decisions

### Auto-Refresh Behavior

1. Auto-refresh is enabled by default on the usage statistics page.
2. Users can enable or disable it explicitly.
3. Users can choose from preset intervals and also enter a custom interval in seconds.
4. The default preset interval is 60 seconds, and that value is pre-selected on first load.
5. Auto-refresh should only execute when all of the following are true:
   - the current page is the usage statistics page
   - the browser tab is visible
   - the browser window is focused
6. If any gating condition fails, the page should not send the refresh request.

### Visual Direction

1. Keep the official management center as the base.
2. Visually evolve the current usage page instead of replacing the whole interface.
3. Apply the approved A + C fusion:
   - real-time dashboard mood
   - clearer metric grouping
   - stronger high-value highlight treatment
   - more deliberate depth, contrast, and panel layering
   - restrained neon accents instead of noisy decoration

## UX Design

### Auto-Refresh Controls

The usage page header area gets a dedicated auto-refresh control cluster that feels native to the existing toolbar:

1. A primary toggle switch for auto-refresh.
2. A preset interval selector for common values such as 15s, 30s, 60s, and 120s.
3. A custom input path for users who want a specific interval in seconds.
4. Custom interval values must stay within 15 to 3600 seconds.
5. A compact status label showing the current refresh state.

The control should not compete with the main time-range and export actions. It belongs in the operational control area rather than inside the chart body.

### Runtime State Feedback

The page should expose why refresh is or is not running. Expected states:

1. Running: auto-refresh enabled and gating conditions satisfied.
2. Paused - tab hidden.
3. Paused - window inactive.
4. Paused - auto-refresh disabled.
5. Refreshing now.
6. Last refreshed at `<time>`.

The user should be able to understand at a glance whether the dashboard is live, idle, or blocked by browser state.

### Visual Dashboard Upgrade

The page keeps its existing information architecture, but the visual treatment becomes more intentional:

1. Stronger hero metric presentation for key totals and cost indicators.
2. Refined card backgrounds with layered surfaces, subtle grid or glow treatment, and clearer depth separation.
3. More deliberate typography contrast between labels, values, and trend context.
4. Improved chart framing so analytics areas feel like instrument panels rather than plain containers.
5. Better spacing and grouping in the toolbar and summary sections.

The result should feel like an operations console, but still trustworthy for day-to-day administrative work.

## Functional Requirements

### Refresh Scheduler

The scheduler must:

1. Start from persisted or default settings when the usage page mounts.
2. Re-evaluate browser activity conditions before each scheduled refresh.
3. Stop firing when auto-refresh is disabled.
4. Re-arm cleanly when the interval changes.
5. Dispose timers and listeners on unmount.

### Gating Rules

Refresh is allowed only when:

1. The usage page component is mounted and active.
2. `document.visibilityState === "visible"`.
3. The window is focused.
4. No current usage fetch is already in flight.

Any failed gate skips that tick without surfacing an error toast.

### Concurrency Guard

Auto-refresh must not create overlapping requests. If a scheduled tick happens while a fetch is already running:

1. The new tick is skipped.
2. The UI remains in the current loading state.
3. No duplicate fetch queue is created.

Manual refresh should reuse the same guarded load path so behavior stays consistent.

### Persistence

The following settings should persist locally for the current browser:

1. auto-refresh enabled state
2. selected preset or custom mode
3. effective interval seconds

Persistence should follow the existing page preference style already used in the management center where practical.

## Technical Design

### Likely Integration Points

This feature should be implemented within the existing usage page composition instead of introducing a parallel data flow. Expected integration points include:

1. `src/pages/UsagePage.tsx`
   - own the page-level refresh control UI
   - wire browser activity listeners
   - connect scheduler state to `loadUsage`
2. `src/hooks/useInterval.ts`
   - reuse if it matches the needed behavior
   - extend only if necessary
3. usage page styles under `src/pages/UsagePage.module.scss`
   - add the dashboard fusion styling
4. existing i18n locale files
   - add any usage-page-specific auto-refresh labels and pause reason text

### State Model

The page should maintain a compact, explicit refresh state model:

1. `enabled`
2. `intervalSeconds`
3. `isWindowFocused`
4. `isDocumentVisible`
5. `isRefreshing`
6. `lastRefreshAt`

Derived UI state should come from these primitives instead of ad hoc string conditions spread across the render tree.

### Event Sources

The page should listen to:

1. `visibilitychange`
2. `focus`
3. `blur`

These events are sufficient for the approved gating behavior and avoid unnecessary complexity.

## Visual Design Notes

### A + C Fusion Rules

1. Use a cooler, technical highlight system, but keep the base surface disciplined and readable.
2. Emphasize metrics with contrast, shape, and hierarchy before using stronger color.
3. Reserve glow effects for high-value accents, active states, and real-time cues.
4. Keep charts readable first; decoration must never obscure axes, legends, or data density.
5. Use motion sparingly for page load and state transitions only.

### Page Areas To Improve

1. Header control strip
2. KPI summary cards
3. chart containers and section framing
4. filter/action spacing
5. live-state indicator styling

## Error Handling

1. Failed scheduled refreshes should surface through the page's normal data-loading error behavior.
2. Browser inactivity should not be treated as an error.
3. Invalid custom interval input should always clamp to the nearest valid boundary instead of being rejected silently.
4. Values below 15 seconds should clamp to 15 seconds, and values above 3600 seconds should clamp to 3600 seconds.
5. When clamping occurs, the UI should show inline guidance explaining that the interval must stay between 15 and 3600 seconds and that the value was adjusted automatically.
6. Auto-refresh must never trap the page in a permanent loading state after a failed request.

## Accessibility And Usability

1. All auto-refresh controls must be keyboard reachable.
2. Toggle, interval selector, and custom input need clear labels.
3. Live status text should remain understandable without relying on color alone.
4. Contrast changes introduced by the new visual styling must preserve readability.

## Validation Plan

### Functional Checks

1. Auto-refresh is on by default when opening the usage page.
2. Scheduled refresh fires at the selected interval while the page is visible and focused.
3. Scheduled refresh pauses when the tab is hidden.
4. Scheduled refresh pauses when the window loses focus.
5. Scheduled refresh resumes when the page becomes active again.
6. Manual refresh still works with auto-refresh on or off.
7. No overlapping refresh requests occur under slow network conditions.
8. Interval changes take effect without page reload.
9. Persisted settings restore correctly after reload.
10. Leaving the usage page stops scheduled refresh and disposes the active timer/listener set.
11. Entering a custom value below 15 seconds clamps the value to 15, shows inline guidance, and schedules with 15 seconds only.
12. Entering a custom value above 3600 seconds clamps the value to 3600, shows inline guidance, and schedules with 3600 seconds only.

### UI Checks

1. Control cluster integrates cleanly on desktop and mobile widths.
2. Summary cards and chart panels reflect the approved dashboard fusion direction.
3. Live status remains readable in loading, paused, and active states.

## Delivery Notes

This task should be implemented as an incremental enhancement to the official management center so that the resulting built artifact can still be used as the single `management.html` entry for CLIProxyAPI deployment.
