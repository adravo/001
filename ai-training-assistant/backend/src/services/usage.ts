interface TenantUsage {
  messageCount: number;
  sessionSecondsEstimate: number;
}

const SECONDS_PER_MESSAGE_ESTIMATE = 25;

/**
 * Minimal in-memory usage counters as a stub for usage-based billing
 * (API calls / session minutes). A production billing integration would
 * push these events to Stripe metered billing or similar instead of
 * holding them in process memory.
 */
class UsageTracker {
  private tenants = new Map<string, TenantUsage>();

  recordMessage(tenantId: string) {
    const usage = this.tenants.get(tenantId) || { messageCount: 0, sessionSecondsEstimate: 0 };
    usage.messageCount += 1;
    usage.sessionSecondsEstimate += SECONDS_PER_MESSAGE_ESTIMATE;
    this.tenants.set(tenantId, usage);
  }

  get(tenantId: string): TenantUsage {
    return this.tenants.get(tenantId) || { messageCount: 0, sessionSecondsEstimate: 0 };
  }
}

export const usageTracker = new UsageTracker();
