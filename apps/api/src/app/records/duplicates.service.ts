import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DuplicateCandidate, ResolveDuplicate } from '@org/shared';
import { RepositoriesService } from '../database/repositories.service';
import { toTransaction } from './records.mapper';

@Injectable()
export class DuplicatesService {
  constructor(private readonly repos: RepositoriesService) {}

  async listPending(): Promise<DuplicateCandidate[]> {
    const candidates = await this.repos.duplicates.listPending();
    const result: DuplicateCandidate[] = [];
    for (const candidate of candidates) {
      const [a, b] = await Promise.all([
        this.repos.records.findById(candidate.transactionId),
        this.repos.records.findById(candidate.matchesTransactionId),
      ]);
      if (!a || !b) continue;
      result.push({
        id: candidate.id,
        status: candidate.status,
        a: toTransaction(a),
        b: toTransaction(b),
      });
    }
    return result;
  }

  /** Keep both, or merge: the loser stops counting in totals. Never done automatically. */
  async resolve(id: string, input: ResolveDuplicate): Promise<void> {
    const candidate = await this.repos.duplicates.findById(id);
    if (!candidate)
      throw new NotFoundException('Duplicate candidate not found');
    if (candidate.status !== 'pending') {
      throw new ConflictException('This pair was already resolved');
    }

    if (input.action === 'keep_both') {
      await this.repos.duplicates.resolve(id, 'kept_both');
      return;
    }

    const pair = [candidate.transactionId, candidate.matchesTransactionId];
    if (!input.keepTransactionId || !pair.includes(input.keepTransactionId)) {
      throw new BadRequestException(
        'keepTransactionId must be one of the two records',
      );
    }
    const loser = pair.find((tid) => tid !== input.keepTransactionId) as string;
    await this.repos.records.excludeAsMerged(loser);
    await this.repos.duplicates.resolve(id, 'merged');
  }
}
