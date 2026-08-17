CREATE TABLE `analysisEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int,
	`analysisRunId` int,
	`eventType` varchar(64) NOT NULL,
	`durationMs` int NOT NULL DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysisEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysisRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int NOT NULL,
	`conversationId` int,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`generatedSql` text,
	`safeSql` text,
	`status` enum('succeeded','failed','blocked') NOT NULL,
	`toolsUsed` json,
	`columnsUsed` json,
	`result` json,
	`visualization` json,
	`analysisDetails` json,
	`metrics` json,
	`durationMs` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysisRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversationMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`analysisRunId` int,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`sourceKind` enum('upload','sample') NOT NULL DEFAULT 'upload',
	`fileKey` varchar(512) NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`bytes` int NOT NULL,
	`status` enum('ready','failed','processing') NOT NULL DEFAULT 'processing',
	`rowCount` int NOT NULL DEFAULT 0,
	`columnCount` int NOT NULL DEFAULT 0,
	`profile` json,
	`schema` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `datasets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `savedInsights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`analysisRunId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedInsights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `analysis_events_user_created_idx` ON `analysisEvents` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `analysis_runs_user_created_idx` ON `analysisRuns` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `analysis_runs_dataset_idx` ON `analysisRuns` (`datasetId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `conversationMessages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `conversations_user_dataset_idx` ON `conversations` (`userId`,`datasetId`);--> statement-breakpoint
CREATE INDEX `datasets_user_created_idx` ON `datasets` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `saved_insights_user_created_idx` ON `savedInsights` (`userId`,`createdAt`);