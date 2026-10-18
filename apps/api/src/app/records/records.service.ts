import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LineItemData } from '@org/db';
import type {
  ProductRow,
  ProductsQuery,
  RecordsPage,
  RecordsQuery,
  TotalsQuery,
  TotalsRow,
  Transaction,
  TransactionUpdate,
} from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { RepositoriesService } from '../database/repositories.service';
import { toTransaction } from './records.mapper';

@Injectable()
export class RecordsService {
  constructor(
    private readonly repos: RepositoriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(query: RecordsQuery): Promise<RecordsPage> {
    const page = await this.repos.records.list(query);
    return {
      items: page.items.map(toTransaction),
      nextCursor: page.nextCursor,
    };
  }

  /** Weekly or monthly totals; see the repository for what counts (research R11). */
  totals(query: TotalsQuery): Promise<TotalsRow[]> {
    return this.repos.records.totals({
      ...query,
      weekStart: this.config.weekStart,
    });
  }

  products(query: ProductsQuery): Promise<ProductRow[]> {
    return this.repos.records.products(query);
  }

  async update(id: string, patch: TransactionUpdate): Promise<Transaction> {
    const { lineItems, ...fields } = patch;
    const updated = await this.repos.records.update(id, {
      ...fields,
      ...(lineItems
        ? { lineItems: lineItems.map((item): LineItemData => ({ ...item })) }
        : {}),
    });
    if (!updated) throw new NotFoundException('Record not found');
    await this.syncFileStatus(updated.fileId);
    return toTransaction(updated);
  }

  async confirm(id: string): Promise<Transaction> {
    const row = await this.repos.records.confirm(id);
    if (!row) throw new NotFoundException('Record not found');
    await this.syncFileStatus(row.fileId);
    return toTransaction((await this.repos.records.findById(id))!);
  }

  async delete(id: string): Promise<void> {
    const row = await this.repos.records.delete(id);
    if (!row) throw new NotFoundException('Record not found');
    await this.syncFileStatus(row.fileId);
  }

  /**
   * A file waiting for review becomes "completed" once it has records and every one of them
   * has been confirmed or corrected by the owner.
   */
  private async syncFileStatus(fileId: string): Promise<void> {
    const file = await this.repos.files.findById(fileId);
    if (!file || file.status !== 'needs_review') return;
    const [records, unconfirmed] = await Promise.all([
      this.repos.records.listByFile(fileId),
      this.repos.records.countUnconfirmedByFile(fileId),
    ]);
    if (records.length > 0 && unconfirmed === 0) {
      await this.repos.files.update(fileId, {
        status: 'completed',
        failureReason: null,
      });
    }
  }
}
