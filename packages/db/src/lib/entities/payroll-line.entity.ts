import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { numberTransformer } from './columns';
import { ExtractedDocumentEntity } from './extracted-document.entity';
import { OwnedEntity } from './owned-entity';

@Entity('payroll_lines')
@Index('payroll_lines_document_idx', ['documentId'])
@Index('payroll_lines_owner_employee_idx', ['ownerId', 'employeeKey'])
export class PayrollLineEntity extends OwnedEntity {
  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => ExtractedDocumentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document?: ExtractedDocumentEntity;

  /** As printed on the document. */
  @Column({ name: 'employee_name', type: 'varchar', length: 200 })
  employeeName!: string;

  /** Normalized with `employeeKey` from @org/shared. */
  @Column({ name: 'employee_key', type: 'text' })
  employeeKey!: string;

  @Column({
    name: 'gross_minor',
    type: 'bigint',
    transformer: numberTransformer,
  })
  grossMinor!: number;

  @Column({
    name: 'deductions_minor',
    type: 'bigint',
    transformer: numberTransformer,
  })
  deductionsMinor!: number;

  @Column({ name: 'net_minor', type: 'bigint', transformer: numberTransformer })
  netMinor!: number;
}
