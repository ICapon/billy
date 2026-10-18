import { Injectable, Logger } from '@nestjs/common';
import type { TransactionRow } from '@org/db';
import { RepositoriesService } from '../database/repositories.service';

/** Lower case, no accents, letters and digits only: "Súper  Mercado, S.A." -> "supermercadosa". */
export function normalizeCounterparty(name: string | null): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Same counterparty after normalizing; one containing the other (4+ chars) counts too. */
export function sameCounterparty(a: string | null, b: string | null): boolean {
  const x = normalizeCounterparty(a);
  const y = normalizeCounterparty(b);
  if (!x && !y) return true; // neither document names a counterparty
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}

/**
 * Flags records that look like the same transaction appearing in two files (an invoice and
 * a bank statement, say). It only creates candidates: the owner decides, nothing is merged.
 */
@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);

  constructor(private readonly repos: RepositoriesService) {}

  async detectFor(records: TransactionRow[]): Promise<number> {
    let flagged = 0;
    for (const record of records) {
      const sameDay = await this.repos.duplicates.findSameDateAndAmount(record);
      for (const other of sameDay) {
        if (!sameCounterparty(record.counterparty, other.counterparty))
          continue;
        await this.repos.duplicates.insertPair(record.id, other.id);
        flagged += 1;
      }
    }
    if (flagged > 0)
      this.logger.log(`flagged ${flagged} likely duplicate pair(s)`);
    return flagged;
  }
}
