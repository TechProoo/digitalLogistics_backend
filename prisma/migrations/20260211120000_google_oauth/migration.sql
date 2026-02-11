-- Make password optional for social-login accounts
ALTER TABLE "Customer" ALTER COLUMN "passwordHash" DROP NOT NULL;
