import { Injectable, Logger } from '@nestjs/common';

/**
 * Posts a Slack-compatible `{ text }` payload to a project's configured webhook URL.
 * Deliberately generic (just a URL + a message) rather than aware of Run/SuiteRun shapes —
 * callers build the message, this just delivers it. Never throws: a broken or slow webhook
 * must not be able to affect run finalization, which is why every call is wrapped and time-
 * boxed here rather than left to each call site.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async post(webhookUrl: string, text: string): Promise<void> {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.logger.warn(`Webhook POST to ${webhookUrl} returned ${res.status}`);
    } catch (err) {
      this.logger.warn(`Webhook POST to ${webhookUrl} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
