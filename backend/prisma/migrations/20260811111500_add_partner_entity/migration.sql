-- CreateTable
CREATE TABLE "partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashed_api_key" TEXT NOT NULL,
    "callback_url" TEXT,
    "rate_limit" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);
