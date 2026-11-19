import { Global, Module } from '@nestjs/common';
import { Clock } from './clock';

/** Horloge partagée par tous les modules métier. */
@Global()
@Module({
  providers: [Clock],
  exports: [Clock]
})
export class ClockModule {}
