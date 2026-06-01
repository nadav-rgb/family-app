# Founder Test Findings - Wave 2

Structured bug board from founder testing before wider tester release.

## Release Blockers

### 1. No "enter app" CTA after invite/create

- What happened: After creating or joining through invite, there is no clear "enter app" call to action. The back arrow incorrectly acts like the way to continue.
- Why it hurts tester UX: Testers can finish onboarding and still feel stuck. Using a back arrow as the primary continuation path is confusing and makes the app feel broken.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: After create/join success, show a clear primary CTA to enter the app or continue to the family dashboard.
- Suggested verification test: Create a new group and join via invite on a second device. Confirm both flows end with a clear forward CTA and do not require using the back arrow.

### 2. Friend 1-4 placeholders still shown

- What happened: Placeholder members like Friend 1-4 are still visible instead of rendering real names.
- Why it hurts tester UX: Testers cannot trust that joining, identity, or family membership worked. It also makes the product look unfinished.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: Only real joined members should appear, using their chosen display names.
- Suggested verification test: Create a group, join with two real names, and confirm no Friend placeholders appear anywhere.

### 3. Static 4 default members shown

- What happened: The app shows four default members even when the actual group does not have four real members.
- Why it hurts tester UX: It makes ownership, assignments, and visibility impossible to validate because fake members are mixed with real ones.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: Member lists should be dynamic and reflect only actual group members.
- Suggested verification test: Start with one creator, then add one invitee. Confirm the member list shows exactly two members.

### 6. Wrong owner/avatar rendering

- What happened: Owner/avatar rendering is wrong. The orange circle should represent the creator, but it does not reliably map to the creator.
- Why it hurts tester UX: Testers cannot tell who owns or created a task. This breaks trust in assignment and family identity.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: The creator should render consistently with the correct avatar/color identity wherever creator ownership is shown.
- Suggested verification test: Create a task as the creator, then view it on both devices. Confirm the creator identity and avatar are identical and correct.

### 7. Visibility defaults broken

- What happened: The creator does not always see their own task by default.
- Why it hurts tester UX: A tester can create a task and think it disappeared. This is a core trust failure.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: The creator should always have visibility on any task they create.
- Suggested verification test: Create tasks with and without assignees from the creator account. Confirm the creator can always see them after refresh and on another device.

### 8. Notification defaults broken

- What happened: If a task has a time, the creator is not reliably notified by default.
- Why it hurts tester UX: Timed reminders are a core promise. Missing reminders make the app feel unreliable.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: When a creator makes a timed task, the creator should be included in notifications by default unless explicitly removed.
- Suggested verification test: Create a timed task due soon as the creator. Confirm notification settings include the creator and a notification arrives at the expected time.

### 9. Split recursion bug: "עם הערכת חוזה"

- What happened: The phrase "עם הערכת חוזה" triggers a split recursion bug.
- Why it hurts tester UX: A normal Hebrew phrase can cause repeated or broken parsing behavior, making voice task creation unreliable.
- Severity: 5
- Release blocker? yes
- Expected correct behavior: The parser should either create a sensible single task or ask for clarification, without recursive splitting or repeated output.
- Suggested verification test: Submit a voice/text task containing "עם הערכת חוזה" and confirm parsing completes once with stable output.

### 10. Latency problem: about 7 seconds for medium speech

- What happened: Medium-length speech takes about 7 seconds to process.
- Why it hurts tester UX: The app feels slow and possibly stuck, especially for a voice-first workflow.
- Severity: 4
- Release blocker? yes
- Expected correct behavior: Medium speech should feel fast enough for live use, ideally around 2 seconds or with clear progress feedback if longer.
- Suggested verification test: Record a medium sentence around 10-15 seconds. Measure time from recording end to usable task output and confirm progress UX appears if processing is not immediate.

## High Priority

### 4. Default role labels

- What happened: Default role labels such as הורה/ילד are being forced.
- Why it hurts tester UX: Families may not fit preset labels, and forced roles can feel awkward or wrong.
- Severity: 4
- Release blocker? no
- Expected correct behavior: Role labels should be optional, editable, or freely chosen. The app should not force inaccurate family roles.
- Suggested verification test: Create and join a group with custom names and no desired role. Confirm the app does not force הורה/ילד or other unwanted labels.

### 5. No useful avatar/member editing

- What happened: There is no useful way to edit avatars or member details.
- Why it hurts tester UX: If a tester enters the wrong name, role, or avatar, they cannot correct it easily. This makes early testing messy.
- Severity: 3
- Release blocker? no
- Expected correct behavior: Members should have a clear way to edit display name, role label, and avatar/color where relevant.
- Suggested verification test: Join with a typo in the name, then try to correct it. Confirm the corrected identity appears across member lists and tasks.

### 11. Hero image crop issue

- What happened: The hero image crop hides the children too much.
- Why it hurts tester UX: The first impression loses the family context and can feel visually off.
- Severity: 3
- Release blocker? no
- Expected correct behavior: The hero crop should keep the important family subjects visible across common mobile and desktop viewports.
- Suggested verification test: Open onboarding on a small phone, large phone, and desktop width. Confirm the children remain visible and not overly cropped.

### 12. Gray bottom panel in invite screen

- What happened: A gray bottom panel appears in the invite screen.
- Why it hurts tester UX: It looks unfinished or like a layout bug, reducing confidence during the invite flow.
- Severity: 3
- Release blocker? no
- Expected correct behavior: The invite screen should have a clean, intentional layout without unexplained gray panels.
- Suggested verification test: Open the invite screen after creating a group and on a joined device. Confirm there is no stray gray panel at the bottom.

## Polish Later

No separate polish-only issues were identified beyond the high-priority visual and editing items above. Revisit this section after release blockers are fixed and the first 3 pilot testers complete a run.

