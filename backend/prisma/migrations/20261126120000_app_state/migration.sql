-- State of the instance (in-app upgrade guide). The table starts empty: the
-- first start records its version without any notice, as the version that ran
-- before is unknown. Nothing else changes.
-- CreateTable
CREATE TABLE "AppState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "lastRunVersion" TEXT,
    "pendingNoticeFrom" TEXT,
    "pendingNoticeTo" TEXT,
    "noticeAcknowledgedAt" DATETIME
);
