CREATE TABLE public.paystack_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    recipient_code TEXT NOT NULL,
    bank_code TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast queries by profileId
CREATE INDEX idx_paystack_recipients_profileid ON public.paystack_recipients ("profileId");

-- Optional: ensure users don't save the exact same bank account multiple times
CREATE UNIQUE INDEX unique_active_account_per_user ON public.paystack_recipients ("profileId", account_number) WHERE is_active = true;
