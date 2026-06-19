import { addCollectionEvent, ensureCollectionsTables } from '@/lib/collections';
import { queryOpsDb } from '@/lib/opsDb';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { FreeScoutService } from '@/lib/services/FreeScoutService';

type EmailPayload = {
  customerId?: string | null;
  customerName?: string | null;
  amountDue: number;
  currencyCode: string;
  invoiceId?: string | null;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(Number(amount || 0) / 100);
}

function missedEmail(payload: EmailPayload, paymentUrl: string | null) {
  return `Hello ${payload.customerName || 'there'},

Our Collections team attempted to reach you regarding ${money(payload.amountDue, payload.currencyCode)} currently due on your Nomad Internet account.

Invoice reference: ${payload.invoiceId || 'See your account'}${paymentUrl ? `\nSecure payment link: ${paymentUrl}` : ''}

Please complete payment or reply to this email if you need assistance.

Thank you,
Nomad Internet Collections`;
}

export type CollectionEmailJobResult = {
  id: number;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
};

export async function processCollectionEmailJob(jobId: number): Promise<CollectionEmailJobResult> {
  await ensureCollectionsTables();
  const claimed = await queryOpsDb(
    `UPDATE ops_collection_email_jobs
     SET status='sending', retry_count=retry_count+1, updated_at=NOW()
     WHERE id=$1
       AND dismissed_at IS NULL
       AND (
         status IN ('queued','failed')
         OR (status='sending' AND updated_at < NOW() - INTERVAL '10 minutes')
       )
       AND retry_count < max_retries
       AND next_retry_at <= NOW()
     RETURNING *`,
    [jobId]
  );
  const job = claimed.rows[0];
  if (!job) return { id: jobId, status: 'skipped' };

  try {
    const payload = (job.payload || {}) as EmailPayload;
    const paymentLink = payload.customerId
      ? await new ChargebeeService().generatePaymentLink(payload.customerId)
      : { url: null };
    const message = missedEmail(payload, paymentLink.url);
    const freescout = new FreeScoutService();
    const [mailbox, agent] = await Promise.all([
      freescout.findComplianceMailbox(),
      freescout.findUserByEmail(job.agent_email),
    ]);

    let conversationId = job.freescout_conversation_id ? Number(job.freescout_conversation_id) : null;
    if (conversationId) {
      await freescout.assignConversation(conversationId, mailbox.id, agent.id, agent.id);
      await freescout.addReply(conversationId, message, 'active', agent.id);
    } else {
      conversationId = await freescout.createConversation(
        mailbox.id,
        job.customer_email,
        job.subject,
        message,
        agent.id,
        agent.id
      );
    }

    await queryOpsDb(
      `UPDATE ops_collection_email_jobs
       SET status='sent', freescout_conversation_id=$2, mailbox_id=$3, freescout_user_id=$4,
           last_error=NULL, sent_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [jobId, conversationId, mailbox.id, agent.id]
    );
    await queryOpsDb(
      `UPDATE ops_collection_attempts
       SET freescout_conversation_id=$2, email_delivery_status='sent',
           email_delivery_error=NULL, email_delivered_at=NOW()
       WHERE id=$1`,
      [job.attempt_id, conversationId]
    );
    await queryOpsDb(
      `UPDATE ops_collection_cases
       SET latest_freescout_conversation_id=$2, updated_at=NOW()
       WHERE id=$1`,
      [job.case_id, conversationId]
    );
    await addCollectionEvent(Number(job.case_id), job.agent_email, 'collection_email_sent', {
      jobId,
      attemptId: Number(job.attempt_id),
      conversationId,
      mailboxId: mailbox.id,
      freescoutUserId: agent.id,
      retryCount: Number(job.retry_count),
    });
    return { id: jobId, status: 'sent' };
  } catch (error: any) {
    const message = error?.message || 'FreeScout delivery failed.';
    const terminal = Number(job.retry_count) >= Number(job.max_retries);
    await queryOpsDb(
      `UPDATE ops_collection_email_jobs
       SET status='failed', last_error=$2,
           next_retry_at=CASE WHEN $3 THEN next_retry_at ELSE NOW() + INTERVAL '15 minutes' END,
           updated_at=NOW()
       WHERE id=$1`,
      [jobId, message, terminal]
    );
    await queryOpsDb(
      `UPDATE ops_collection_attempts
       SET email_delivery_status='failed', email_delivery_error=$2
       WHERE id=$1`,
      [job.attempt_id, message]
    );
    await addCollectionEvent(Number(job.case_id), job.agent_email, 'collection_email_failed', {
      jobId,
      attemptId: Number(job.attempt_id),
      error: message,
      retryCount: Number(job.retry_count),
      willRetry: !terminal,
    });
    return { id: jobId, status: 'failed', error: message };
  }
}

export async function processDueCollectionEmailJobs(limit = 10) {
  await ensureCollectionsTables();
  const jobs = await queryOpsDb(
    `SELECT id
     FROM ops_collection_email_jobs
     WHERE dismissed_at IS NULL
       AND (
         status IN ('queued','failed')
         OR (status='sending' AND updated_at < NOW() - INTERVAL '10 minutes')
       )
       AND retry_count < max_retries
       AND next_retry_at <= NOW()
     ORDER BY next_retry_at ASC, id ASC
     LIMIT $1`,
    [limit]
  );
  const results = await Promise.all(
    jobs.rows.map(row => processCollectionEmailJob(Number(row.id)))
  );
  return {
    emailJobsProcessed: results.length,
    emailJobsSent: results.filter(result => result.status === 'sent').length,
    emailJobsFailed: results.filter(result => result.status === 'failed').length,
  };
}
