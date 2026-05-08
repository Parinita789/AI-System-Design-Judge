import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const bootstrapLogger = new Logger('Bootstrap');

// Surface unhandled async errors instead of letting Node print
// "UnhandledPromiseRejection" with no context. We don't crash the
// process — long-running services often see one-off LLM rate limits
// or network blips that aren't worth losing all in-flight work over.
// If the same error keeps firing, it'll show up clearly in the log
// and the operator can intervene.
process.on('unhandledRejection', (reason) => {
  const err = reason as Error;
  bootstrapLogger.error(
    `Unhandled promise rejection: ${err?.message ?? String(reason)}`,
    err?.stack,
  );
});
process.on('uncaughtException', (err) => {
  bootstrapLogger.error(`Uncaught exception: ${err.message}`, err.stack);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173' });

  // Enables Nest's onModuleDestroy / beforeApplicationShutdown /
  // onApplicationShutdown lifecycle hooks. Without this, SIGTERM/SIGINT
  // terminates the process without giving Prisma a chance to close its
  // connection pool or letting BackgroundTaskTracker drain in-flight
  // LLM calls.
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Interview Assistant API')
    .setDescription(
      'REST endpoints for the practice-and-feedback interview tool. Sessions, snapshots, hints, evaluations, and the two post-eval coaching layers (mentor + signal-mentor).',
    )
    .setVersion('1.0')
    .addTag('questions', 'Question prompts (the design problems candidates pick from)')
    .addTag('sessions', 'Attempt lifecycle — start, pause, end')
    .addTag('snapshots', 'plan.md autosaves')
    .addTag('evaluations', 'Rubric-driven LLM scoring')
    .addTag('rubrics', 'Rubric YAML access (read-only)')
    .addTag('hints', 'Socratic-coach chat during a session')
    .addTag('mentor', 'Post-eval deep-dive teaching artifact')
    .addTag('signal-mentor', 'Post-eval per-signal inline coaching')
    .addTag('dashboard', 'Cross-session aggregates')
    .addTag('build-sessions', 'CLI watcher integration: token mint + event batch + finish')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  bootstrapLogger.log(`Backend listening on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  // Without this, a thrown bootstrap error prints the stack with no
  // context and exits 1 silently. Log via the same Logger plumbing so
  // it's consistent with the rest of the app.
  bootstrapLogger.error(
    `Bootstrap failed: ${(err as Error).message}`,
    (err as Error).stack,
  );
  process.exit(1);
});
