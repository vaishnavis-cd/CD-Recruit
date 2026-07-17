-- CreateEnum
CREATE TYPE "ProctoringEventType" AS ENUM ('FACE_MISSING', 'MULTIPLE_FACES', 'LOOKING_AWAY', 'SEAT_EXIT', 'EXCESSIVE_MOVEMENT', 'PHONE_DETECTED', 'HEADPHONES_DETECTED', 'BOOK_DETECTED');

-- CreateTable
CREATE TABLE "proctoring_event" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" "ProctoringEventType" NOT NULL,
    "severity" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "clip_url" TEXT,
    "model_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctoring_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proctoring_event_session_id_idx" ON "proctoring_event"("session_id");

-- AddForeignKey
ALTER TABLE "proctoring_event" ADD CONSTRAINT "proctoring_event_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
