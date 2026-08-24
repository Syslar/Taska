// supabase/functions/send-notification/index.ts
// POST https://<project>.supabase.co/functions/v1/send-notification
//
// Centralized notification dispatcher for Taska:
//   1. Generates branded, responsive HTML transactional emails with Taska design system
//   2. Dispatches emails via Resend API
//   3. Inserts in-app notification records into public.Notification table
//
// Supported types:
//   - DEPOSIT_SUCCESS
//   - WITHDRAWAL_INITIATED
//   - WITHDRAWAL_SUCCESS
//   - WITHDRAWAL_FAILED
//   - TASK_POSTED
//   - NEW_APPLICATION
//   - HIRED_ESCROW_LOCKED
//   - DELIVERABLE_SUBMITTED
//   - REVISION_REQUESTED
//   - ESCROW_RELEASED
//   - KYC_VERIFIED
//   - CUSTOM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@4.15.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Taska <onboarding@resend.dev>';
const FRONTEND_API_URL = Deno.env.get('FRONTEND_API_URL') || 'https://modest-sturgeon-45.clerk.accounts.dev';
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://taska.ng';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JWKS = createRemoteJWKSet(new URL(`${FRONTEND_API_URL}/.well-known/jwks.json`));

// Helper: Format Money in Naira
function formatNaira(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return '₦0';
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ── HTML Email Template Generator ──────────────────────────────────────────────
interface EmailTemplateData {
  recipientName?: string;
  type: string;
  title: string;
  headline: string;
  body: string;
  badgeText?: string;
  badgeBg?: string;
  badgeColor?: string;
  details?: Array<{ label: string; value: string }>;
  ctaText?: string;
  ctaUrl?: string;
  notice?: string;
}

function generateEmailHtml(data: EmailTemplateData): string {
  const recipient = data.recipientName || 'Valued User';
  const badgeHtml = data.badgeText
    ? `<div style="display:inline-block; padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 20px; background-color: ${data.badgeBg || '#E1F5E8'}; color: ${data.badgeColor || '#0E3A22'}; margin-bottom: 16px;">${data.badgeText}</div>`
    : '';

  let detailsTableHtml = '';
  if (data.details && data.details.length > 0) {
    const rows = data.details.map((d) => `
      <tr style="border-bottom: 1px solid #EDEFE9;">
        <td style="padding: 10px 14px; font-size: 13px; color: #6B776E; font-weight: 500; width: 38%;">${d.label}</td>
        <td style="padding: 10px 14px; font-size: 13px; color: #12201A; font-weight: 600; font-family: 'IBM Plex Mono', monospace, sans-serif; text-align: right;">${d.value}</td>
      </tr>
    `).join('');

    detailsTableHtml = `
      <div style="margin: 24px 0; background-color: #FBFCF9; border: 1px solid #E4E7E0; border-radius: 12px; overflow: hidden;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
          ${rows}
        </table>
      </div>
    `;
  }

  const ctaButtonHtml = (data.ctaText && data.ctaUrl)
    ? `
      <div style="margin: 28px 0 16px 0; text-align: center;">
        <a href="${data.ctaUrl}" style="display: inline-block; background-color: #146C34; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(20,108,52,0.2);">
          ${data.ctaText} &rarr;
        </a>
      </div>
    `
    : '';

  const noticeHtml = data.notice
    ? `<p style="margin: 16px 0 0 0; font-size: 12px; color: #6B776E; line-height: 1.5; text-align: center; background-color: #F1FAF4; padding: 10px 14px; border-radius: 8px;">${data.notice}</p>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F6F7F3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #12201A; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; }
  </style>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #F6F7F3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E4E7E0; overflow: hidden; box-shadow: 0 4px 12px rgba(18,32,26,0.04);">
          
          <!-- Header Bar -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #0E3A22 0%, #146C34 100%); text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-family: 'Space Grotesk', -apple-system, sans-serif; font-size: 22px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">Taska<span style="color: #CDEEDA;">.</span></span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 600; color: #CDEEDA; letter-spacing: 0.5px; text-transform: uppercase;">Account Alert</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 28px 32px;">
              ${badgeHtml}
              <h1 style="margin: 0 0 12px 0; font-family: 'Space Grotesk', -apple-system, sans-serif; font-size: 20px; font-weight: 700; color: #0E3A22; line-height: 1.3;">${data.headline}</h1>
              
              <p style="margin: 0 0 14px 0; font-size: 14px; color: #33403A; line-height: 1.6;">Hello <strong>${recipient}</strong>,</p>
              
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #33403A; line-height: 1.6;">${data.body}</p>

              ${detailsTableHtml}

              ${ctaButtonHtml}

              ${noticeHtml}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;"><div style="height: 1px; background-color: #EDEFE9;"></div></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #FBFCF9; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6B776E; line-height: 1.5;">
                This is an automated transactional notification for your Taska account.
              </p>
              <p style="margin: 0; font-size: 11px; color: #9AA39C;">
                &copy; ${new Date().getFullYear()} Taska Technologies Inc. All rights reserved. &bull; <a href="https://taska.ng/support" style="color: #146C34; text-decoration: none;">Help &amp; Support</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ── Notification Payload Dispatcher ─────────────────────────────────────────────
interface NotificationRequest {
  type: string;
  userId?: string;          // Clerk User ID or Profile ID
  profileId?: string;
  toEmail?: string;
  recipientName?: string;
  data?: Record<string, any>;
  customSubject?: string;
  customBody?: string;
  customCtaUrl?: string;
  customCtaText?: string;
}

function buildNotificationContent(req: NotificationRequest, profile: any) {
  const d = req.data || {};
  const name = req.recipientName || profile?.firstName || profile?.username || 'Taska User';
  const appUrl = APP_BASE_URL.replace(/\/$/, '');

  let subject = '';
  let headline = '';
  let body = '';
  let badgeText = 'NOTIFICATION';
  let badgeBg = '#E1F5E8';
  let badgeColor = '#0E3A22';
  let details: Array<{ label: string; value: string }> = [];
  let ctaText = 'View in App';
  let ctaUrl = `${appUrl}/Dashboard/index.html`;
  let notice = '';
  let inAppTitle = '';
  let inAppBody = '';

  switch (req.type) {
    case 'DEPOSIT_SUCCESS': {
      const amountStr = formatNaira(d.amountNaira || (d.amountKobo ? d.amountKobo / 100 : 0));
      subject = `Deposit Confirmed — ${amountStr} credited to your Taska Wallet`;
      headline = `₦${amountStr.replace('₦', '')} Added to Your Wallet`;
      body = `Your wallet deposit of <strong>${amountStr}</strong> has been successfully verified and added to your available balance.`;
      badgeText = 'WALLET CREDIT';
      badgeBg = '#E1F5E8';
      badgeColor = '#0E3A22';
      details = [
        { label: 'Amount Credited', value: amountStr },
        { label: 'Payment Channel', value: (d.channel || 'Paystack Card / Transfer').toUpperCase() },
        { label: 'Transaction Reference', value: d.reference || '—' },
        { label: 'Date & Time', value: new Date().toLocaleString('en-NG') },
      ];
      ctaText = 'View Wallet Balance';
      ctaUrl = `${appUrl}/Wallet/wallet.html`;
      inAppTitle = 'Wallet Deposit Confirmed';
      inAppBody = `${amountStr} was successfully credited to your wallet.`;
      break;
    }

    case 'WITHDRAWAL_INITIATED': {
      const amountStr = formatNaira(d.amountNaira);
      subject = `Withdrawal Request Received — ${amountStr}`;
      headline = `Withdrawal of ${amountStr} is Processing`;
      body = `We have received your withdrawal request of <strong>${amountStr}</strong> to your <strong>${d.bankName || 'Bank'}</strong> account (<code>${d.accountNumber || '••••'}</code>). Funds are being transferred via Paystack.`;
      badgeText = 'PAYOUT IN PROGRESS';
      badgeBg = '#FBF0DA';
      badgeColor = '#A6720B';
      details = [
        { label: 'Requested Amount', value: amountStr },
        { label: 'Destination Bank', value: d.bankName || '—' },
        { label: 'Account Number', value: d.accountNumber || '—' },
        { label: 'Reference', value: d.reference || '—' },
      ];
      ctaText = 'Track in Wallet';
      ctaUrl = `${appUrl}/Wallet/wallet.html`;
      inAppTitle = 'Withdrawal Processing';
      inAppBody = `Your withdrawal request of ${amountStr} to ${d.bankName || 'bank'} is in progress.`;
      break;
    }

    case 'WITHDRAWAL_SUCCESS': {
      const amountStr = formatNaira(d.amountNaira || (d.amountKobo ? d.amountKobo / 100 : 0));
      subject = `Payout Complete — ${amountStr} sent to your bank account`;
      headline = `Withdrawal of ${amountStr} Successful`;
      body = `Good news! Your withdrawal of <strong>${amountStr}</strong> has been successfully settled to your bank account.`;
      badgeText = 'PAYOUT COMPLETE';
      badgeBg = '#E1F5E8';
      badgeColor = '#0E3A22';
      details = [
        { label: 'Transferred Amount', value: amountStr },
        { label: 'Payout Reference', value: d.reference || '—' },
        { label: 'Date Completed', value: new Date().toLocaleString('en-NG') },
      ];
      ctaText = 'View Wallet History';
      ctaUrl = `${appUrl}/Wallet/wallet.html`;
      inAppTitle = 'Withdrawal Successful';
      inAppBody = `${amountStr} has been transferred to your bank account.`;
      break;
    }

    case 'WITHDRAWAL_FAILED': {
      const amountStr = formatNaira(d.amountNaira || (d.amountKobo ? d.amountKobo / 100 : 0));
      subject = `Withdrawal Notice — Transfer could not be completed`;
      headline = `Withdrawal Refunded to Wallet`;
      body = `Your withdrawal request of <strong>${amountStr}</strong> could not be completed by the banking network (<em>${d.failureReason || 'Bank transfer rejected'}</em>). The full amount has been instantly refunded to your Taska wallet balance.`;
      badgeText = 'WITHDRAWAL REFUNDED';
      badgeBg = '#FBEAE7';
      badgeColor = '#B23A2E';
      details = [
        { label: 'Refunded Amount', value: amountStr },
        { label: 'Reason', value: d.failureReason || 'Bank transfer failed' },
        { label: 'Reference', value: d.reference || '—' },
      ];
      ctaText = 'Check Wallet Balance';
      ctaUrl = `${appUrl}/Wallet/wallet.html`;
      notice = 'Please verify your bank account details or try withdrawing to a different commercial bank account.';
      inAppTitle = 'Withdrawal Failed & Refunded';
      inAppBody = `Your withdrawal of ${amountStr} could not be completed and was refunded to your wallet.`;
      break;
    }

    case 'TASK_POSTED': {
      const taskTitle = d.taskTitle || 'Your Task';
      const budgetStr = formatNaira(d.budget);
      subject = `Task Published — "${taskTitle}" is now live!`;
      headline = `Your Task is Live on Taska`;
      body = `Your task <strong>"${taskTitle}"</strong> has been successfully published. Verified Taskers across Nigeria can now submit applications and bids.`;
      badgeText = 'TASK PUBLISHED';
      badgeBg = '#E1F5E8';
      badgeColor = '#0E3A22';
      details = [
        { label: 'Task Title', value: taskTitle },
        { label: 'Budget', value: budgetStr },
        { label: 'Category', value: d.category || 'General' },
        { label: 'Location / Mode', value: d.location || 'Remote / Physical' },
      ];
      ctaText = 'View Task Proposals';
      ctaUrl = `${appUrl}/Poster/MyTasks/index.html`;
      inAppTitle = 'Task Live';
      inAppBody = `"${taskTitle}" is live. You will receive notifications as Taskers apply.`;
      break;
    }

    case 'NEW_APPLICATION': {
      const taskTitle = d.taskTitle || 'Your Task';
      const taskerName = d.taskerName || 'A Tasker';
      const bidStr = formatNaira(d.bidAmount);
      subject = `New Proposal Received for "${taskTitle}"`;
      headline = `New Proposal from ${taskerName}`;
      body = `<strong>${taskerName}</strong> has submitted a proposal for your task <strong>"${taskTitle}"</strong>. Review their proposed rate and profile to hire the right fit.`;
      badgeText = 'NEW PROPOSAL';
      badgeBg = '#F1FAF4';
      badgeColor = '#146C34';
      details = [
        { label: 'Task', value: taskTitle },
        { label: 'Applicant', value: taskerName },
        { label: 'Proposed Rate', value: bidStr },
      ];
      ctaText = 'Review & Hire';
      ctaUrl = `${appUrl}/Poster/MyTasks/index.html`;
      inAppTitle = 'New Proposal Received';
      inAppBody = `${taskerName} applied for "${taskTitle}" with bid ${bidStr}.`;
      break;
    }

    case 'HIRED_ESCROW_LOCKED': {
      const taskTitle = d.taskTitle || 'Task';
      const escrowStr = formatNaira(d.escrowAmount || d.agreedBudget);
      const isTasker = d.roleTarget === 'TASKER' || profile?.activeRole === 'TASKER';

      if (isTasker) {
        subject = `You're Hired! — "${taskTitle}" (${escrowStr} Escrow Secured)`;
        headline = `Congratulations, You've Been Hired!`;
        body = `<strong>${d.posterName || 'The client'}</strong> has accepted your proposal for <strong>"${taskTitle}"</strong>. Payment of <strong>${escrowStr}</strong> has been secured in Taska Escrow. You may now commence work safely!`;
        badgeText = 'HIRED & SECURED';
        badgeBg = '#E1F5E8';
        badgeColor = '#0E3A22';
        details = [
          { label: 'Task Title', value: taskTitle },
          { label: 'Secured Escrow', value: escrowStr },
          { label: 'Poster', value: d.posterName || 'Task Poster' },
        ];
        ctaText = 'View Task & Start Work';
        ctaUrl = `${appUrl}/Tasker/MyApplications/index.html`;
        inAppTitle = 'You Were Hired!';
        inAppBody = `Hired for "${taskTitle}". ${escrowStr} is secured in escrow.`;
      } else {
        subject = `Task Escrow Secured — "${taskTitle}"`;
        headline = `Escrow Funds Locked`;
        body = `You hired <strong>${d.taskerName || 'the Tasker'}</strong> for <strong>"${taskTitle}"</strong>. <strong>${escrowStr}</strong> is securely locked in Escrow and will only be released once you approve the completed work.`;
        badgeText = 'ESCROW LOCKED';
        badgeBg = '#E1F5E8';
        badgeColor = '#0E3A22';
        details = [
          { label: 'Task Title', value: taskTitle },
          { label: 'Hired Tasker', value: d.taskerName || 'Verified Tasker' },
          { label: 'Escrow Amount', value: escrowStr },
        ];
        ctaText = 'Track Task Progress';
        ctaUrl = `${appUrl}/Poster/MyTasks/index.html`;
        inAppTitle = 'Escrow Locked';
        inAppBody = `${escrowStr} locked in escrow for "${taskTitle}".`;
      }
      break;
    }

    case 'DELIVERABLE_SUBMITTED': {
      const taskTitle = d.taskTitle || 'Task';
      const taskerName = d.taskerName || 'Your Tasker';
      subject = `Work Submitted for Review — "${taskTitle}"`;
      headline = `Deliverable Ready for Review`;
      body = `<strong>${taskerName}</strong> has completed the work on <strong>"${taskTitle}"</strong> and uploaded proof of completion. Please inspect the deliverable and approve to release payment.`;
      badgeText = 'WORK SUBMITTED';
      badgeBg = '#FBF0DA';
      badgeColor = '#A6720B';
      details = [
        { label: 'Task', value: taskTitle },
        { label: 'Submitted By', value: taskerName },
        { label: 'Review Window', value: '7 Days Auto-Approval' },
      ];
      ctaText = 'Inspect Deliverable';
      ctaUrl = `${appUrl}/Poster/MyTasks/index.html`;
      notice = 'If no action is taken within 7 days, escrow will automatically release to the Tasker.';
      inAppTitle = 'Deliverable Submitted';
      inAppBody = `${taskerName} submitted work for "${taskTitle}". Please review.`;
      break;
    }

    case 'REVISION_REQUESTED': {
      const taskTitle = d.taskTitle || 'Task';
      subject = `Revision Requested — "${taskTitle}"`;
      headline = `Changes Requested on Deliverable`;
      body = `<strong>${d.posterName || 'The client'}</strong> has reviewed your submission for <strong>"${taskTitle}"</strong> and requested revisions:`;
      if (d.revisionNotes) {
        body += `<br><br><blockquote style="margin: 12px 0; padding: 12px 16px; background-color: #F6F7F3; border-left: 4px solid #A6720B; font-style: italic; color: #33403A;">"${d.revisionNotes}"</blockquote>`;
      }
      badgeText = 'REVISION REQUESTED';
      badgeBg = '#FBF0DA';
      badgeColor = '#A6720B';
      details = [
        { label: 'Task', value: taskTitle },
        { label: 'Client', value: d.posterName || 'Client' },
      ];
      ctaText = 'Upload Revised Work';
      ctaUrl = `${appUrl}/Tasker/MyApplications/index.html`;
      inAppTitle = 'Revision Requested';
      inAppBody = `Changes requested on "${taskTitle}": ${d.revisionNotes || 'See details'}`;
      break;
    }

    case 'ESCROW_RELEASED': {
      const taskTitle = d.taskTitle || 'Task';
      const isTasker = d.roleTarget === 'TASKER' || profile?.activeRole === 'TASKER';
      const payoutStr = formatNaira(d.payoutNaira || d.payoutAmount);

      if (isTasker) {
        subject = `Payment Released! — ${payoutStr} credited to your wallet`;
        headline = `Task Payment Released!`;
        body = `Awesome job! <strong>${d.posterName || 'The client'}</strong> approved your work on <strong>"${taskTitle}"</strong>. <strong>${payoutStr}</strong> (net payout) has been credited to your Taska wallet balance.`;
        badgeText = 'PAYMENT CREDITED';
        badgeBg = '#E1F5E8';
        badgeColor = '#0E3A22';
        details = [
          { label: 'Task Title', value: taskTitle },
          { label: 'Net Payout', value: payoutStr },
          { label: 'Date Released', value: new Date().toLocaleString('en-NG') },
        ];
        ctaText = 'View Wallet & Withdraw';
        ctaUrl = `${appUrl}/Wallet/wallet.html`;
        inAppTitle = 'Payment Released';
        inAppBody = `${payoutStr} credited to your wallet for completing "${taskTitle}".`;
      } else {
        subject = `Task Completed — "${taskTitle}"`;
        headline = `Task Completed & Closed`;
        body = `You approved the work on <strong>"${taskTitle}"</strong> and payment was released to <strong>${d.taskerName || 'the Tasker'}</strong>. Thank you for using Taska! Please take a moment to leave a review.`;
        badgeText = 'TASK COMPLETED';
        badgeBg = '#E1F5E8';
        badgeColor = '#0E3A22';
        details = [
          { label: 'Task Title', value: taskTitle },
          { label: 'Tasker', value: d.taskerName || 'Verified Tasker' },
        ];
        ctaText = 'Leave a Review';
        ctaUrl = `${appUrl}/Poster/MyTasks/index.html`;
        inAppTitle = 'Task Completed';
        inAppBody = `Escrow released for "${taskTitle}". Leave a review for ${d.taskerName || 'your tasker'}.`;
      }
      break;
    }

    case 'KYC_VERIFIED': {
      subject = `Identity Verified — You're Verified on Taska`;
      headline = `Identity Verification Approved!`;
      body = `Congratulations! Your identity verification has been successfully approved by Dojah. Your Tasker profile now features the official <strong>Taska Verified Badge</strong>, boosting your credibility and hiring rates.`;
      badgeText = 'KYC VERIFIED';
      badgeBg = '#E1F5E8';
      badgeColor = '#0E3A22';
      details = [
        { label: 'Verification Status', value: 'APPROVED' },
        { label: 'ID Type', value: (d.idType || 'National ID / BVN').toUpperCase() },
        { label: 'Date Verified', value: new Date().toLocaleDateString('en-NG') },
      ];
      ctaText = 'View Verified Profile';
      ctaUrl = `${appUrl}/Tasker/Profile/index.html`;
      inAppTitle = 'Identity Verified';
      inAppBody = 'Your profile is now verified with the official Taska badge!';
      break;
    }

    case 'CUSTOM':
    default: {
      subject = req.customSubject || d.subject || 'Taska Account Update';
      headline = d.headline || req.customSubject || 'Account Notification';
      body = req.customBody || d.body || 'You have a new update regarding your Taska account.';
      badgeText = d.badgeText || 'ALERT';
      ctaText = req.customCtaText || d.ctaText || 'View in Taska';
      ctaUrl = req.customCtaUrl || d.ctaUrl || `${appUrl}/Dashboard/index.html`;
      inAppTitle = d.title || subject;
      inAppBody = body.replace(/<[^>]*>?/gm, '');
      break;
    }
  }

  const html = generateEmailHtml({
    recipientName: name,
    type: req.type,
    title: subject,
    headline,
    body,
    badgeText,
    badgeBg,
    badgeColor,
    details,
    ctaText,
    ctaUrl,
    notice,
  });

  const plainText = `${headline}\n\nHello ${name},\n\n${body.replace(/<[^>]*>?/gm, '')}\n\n${ctaText}: ${ctaUrl}\n\n© Taska Technologies`;

  return {
    subject,
    html,
    plainText,
    inAppTitle,
    inAppBody,
    ctaUrl,
  };
}

// ── Main Edge Handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: NotificationRequest;
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Invalid JSON payload' }, 400);
  }

  if (!body.type) {
    return respond({ error: 'Notification type is required' }, 400);
  }

  try {
    // 1. Resolve Recipient Profile & Email
    let recipientProfile: any = null;
    let targetEmail = body.toEmail;
    let targetClerkUserId = body.userId;

    if (body.profileId) {
      const { data: p } = await supabase
        .from('Profile')
        .select('id, userId, email, firstName, lastName, username, activeRole')
        .eq('id', body.profileId)
        .maybeSingle();
      if (p) {
        recipientProfile = p;
        if (!targetEmail) targetEmail = p.email;
        if (!targetClerkUserId) targetClerkUserId = p.userId;
      }
    } else if (body.userId) {
      const { data: p } = await supabase
        .from('Profile')
        .select('id, userId, email, firstName, lastName, username, activeRole')
        .eq('userId', body.userId)
        .maybeSingle();
      if (p) {
        recipientProfile = p;
        if (!targetEmail) targetEmail = p.email;
      }
    }

    if (!targetEmail && recipientProfile?.email) {
      targetEmail = recipientProfile.email;
    }

    // 2. Build template content
    const content = buildNotificationContent(body, recipientProfile);

    // 3. Send email via Resend API
    let resendResult: any = null;
    if (targetEmail) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: RESEND_FROM_EMAIL,
            to: [targetEmail],
            subject: content.subject,
            html: content.html,
            text: content.plainText,
          }),
        });

        resendResult = await resendRes.json();
        if (!resendRes.ok) {
          console.error('[send-notification] Resend API error:', resendResult);
        } else {
          console.log('[send-notification] Email sent successfully via Resend to:', targetEmail, 'ID:', resendResult.id);
        }
      } catch (emailErr: any) {
        console.error('[send-notification] Failed to call Resend API:', emailErr.message || emailErr);
      }
    } else {
      console.warn('[send-notification] No recipient email resolved for notification:', body.type);
    }

    // 4. Record In-App Notification in public.Notification
    let notificationRecord: any = null;
    if (targetClerkUserId) {
      try {
        const { data: inserted, error: notifError } = await supabase
          .from('Notification')
          .insert({
            userId: targetClerkUserId,
            type: body.type,
            title: content.inAppTitle,
            body: content.inAppBody,
            isRead: false,
            link: content.ctaUrl,
            createdAt: new Date().toISOString(),
          })
          .select()
          .single();

        if (notifError) {
          console.error('[send-notification] DB Notification insert error:', notifError);
        } else {
          notificationRecord = inserted;
        }
      } catch (dbErr: any) {
        console.error('[send-notification] Exception writing in-app notification:', dbErr);
      }
    }

    return respond({
      success: true,
      emailSent: Boolean(resendResult?.id),
      emailId: resendResult?.id || null,
      notification: notificationRecord,
      recipient: targetEmail || targetClerkUserId,
    });

  } catch (err: any) {
    console.error('[send-notification] Unhandled error:', err);
    return respond({ error: 'Failed to process notification', details: err.message || err }, 500);
  }
});
