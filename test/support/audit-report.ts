import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { ScenarioContext } from './test-fixtures.js';

const auditTables = [
  { name: 'audit_events', orderBy: 'sequence' },
  { name: 'audit_resource_events', orderBy: 'id' },
  { name: 'audit_auth_events', orderBy: 'id' },
  { name: 'audit_meta_events', orderBy: 'id' },
] as const;

function markdownCell(value: unknown): string {
  return (JSON.stringify(value) ?? String(value)).replace(/\|/g, '\\|');
}

export async function writeAuditReport(context: ScenarioContext, scenario: string) {
  const dataSource = context.app.get(DataSource);
  const lines = [
    `# Relatório de auditoria: ${scenario}`,
    '',
    'Dados capturados do banco de teste antes da limpeza dos dados do cenário.',
  ];

  for (const table of auditTables) {
    const columns = (await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1
       ORDER BY ordinal_position`,
      [table.name],
    )) as Array<{ column_name: string }>;
    const rows = (await dataSource.query(
      `SELECT * FROM "${table.name}" ORDER BY "${table.orderBy}"`,
    )) as Array<Record<string, unknown>>;
    const columnNames = columns.map(({ column_name }) => column_name);

    lines.push('', `## ${table.name}`, '', `Registros: ${rows.length}`, '');
    lines.push(
      `| ${columnNames.join(' | ')} |`,
      `| ${columnNames.map(() => '---').join(' | ')} |`,
    );
    for (const row of rows) {
      lines.push(`| ${columnNames.map((column) => markdownCell(row[column])).join(' | ')} |`);
    }
    if (rows.length === 0) lines.push(`| ${columnNames.map(() => '-').join(' | ')} |`);
  }

  const logDirectory = resolve(process.cwd(), 'log');
  await mkdir(logDirectory, { recursive: true });
  await writeFile(resolve(logDirectory, `${scenario}.md`), `${lines.join('\n')}\n`, 'utf8');
}