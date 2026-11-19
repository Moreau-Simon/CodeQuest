import { Injectable } from '@nestjs/common';

/**
 * Horloge serveur UTC unique (source de vérité des échéances d'event, des
 * rounds, de la régénération de PV et de l'expiration des sessions).
 *
 * Toute la logique métier passe par cette classe : les tests peuvent la
 * remplacer par une horloge figée (`FrozenClock`) sans toucher au reste du code.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}
