// (staff) Clock in / out — the routed staff screen (staff dashboard + the
// notification deep-link route '/(staff)/clock-in-out').
// Batch B: rebuilt on the design system; shared ClockInPanel logic unchanged.
import React from 'react';
import ClockInPanel from '@/components/clock-in-panel';
import { Screen, PageHeader } from '@/components/ui/screen';

export default function StaffClockInOutScreen() {
  return (
    <Screen scroll>
      <PageHeader
        title="Clock in / out"
        subtitle="GPS-verified shifts • identity = signed-in account"
        showBack
        fallback="/(staff)/staff-dashboard"
      />
      <ClockInPanel />
    </Screen>
  );
}
