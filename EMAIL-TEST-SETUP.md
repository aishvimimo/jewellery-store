# Resend test recipient setup

Keep EMAIL_DRIVER=disabled until this source update has deployed successfully.

Railway api service variables:
- EMAIL_TEST_RECIPIENT: the email associated with your Resend account, without quotes.
- EMAIL_FROM: onboarding@resend.dev
- RESEND_API_KEY: the working private sending key.
- EMAIL_DRIVER: resend, only after deploying this patch and saving EMAIL_TEST_RECIPIENT.
- EMAIL_SITE_URL: https://jewellery-store-test.pages.dev
Keep EMAIL_ENCRYPTION_KEY unchanged.

Only the matching recipient is processed, including existing queued emails for that mailbox. Other recipients remain queued with their encrypted content and no new attempts. No recipient is rewritten. Queued matching expired verification/reset messages still expire normally; request fresh links for testing.

After deployment, sign in on the storefront using your Resend account email and request verification. Open the delivered link. Then test Forgot password with the same email, set a new password using its link, and sign in again. Check spam if needed. Admin Emails shows sent when the provider accepts a message, not necessarily when it arrives.

For customer mail later: verify your owned sender domain in Resend, change EMAIL_FROM, and remove EMAIL_TEST_RECIPIENT only when ready to process all eligible queued messages. Review old demo messages first, as removing the restriction makes them eligible again.

Validation: 22 accounts/returns/email tests passed; API typecheck and build passed. No migrations or existing records were changed by this patch.
