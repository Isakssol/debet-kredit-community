-- Onboarding: spåra när grundinställningen är klar (styr första-gången-wizarden)
alter table settings add column onboarded_at timestamptz;
