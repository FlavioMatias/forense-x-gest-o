import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditTables1761739200000 implements MigrationInterface {
  name = 'CreateAuditTables1761739200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id uuid PRIMARY KEY,
        sequence bigint NOT NULL,
        occurred_at timestamptz NOT NULL,
        event_type varchar(120) NOT NULL,
        actor_id uuid NULL,
        actor_role varchar(80) NULL,
        request_id uuid NULL,
        session_id uuid NULL,
        source_ip varchar(64) NULL,
        user_agent text NULL,
        result jsonb NOT NULL,
        hash varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_audit_events_sequence UNIQUE (sequence),
        CONSTRAINT uq_audit_events_hash UNIQUE (hash)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_resource_events (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL UNIQUE,
        resource_type varchar(80) NOT NULL,
        resource_id varchar(120) NOT NULL,
        operation varchar(80) NOT NULL,
        old_values jsonb NULL,
        new_values jsonb NULL,
        approver_id uuid NULL,
        CONSTRAINT fk_audit_resource_event FOREIGN KEY (event_id)
          REFERENCES audit_events(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_auth_events (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL UNIQUE,
        username varchar(255) NULL,
        action varchar(80) NOT NULL,
        success boolean NOT NULL,
        CONSTRAINT fk_audit_auth_event FOREIGN KEY (event_id)
          REFERENCES audit_events(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_meta_events (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL UNIQUE,
        action varchar(80) NOT NULL,
        scope varchar(180) NULL,
        CONSTRAINT fk_audit_meta_event FOREIGN KEY (event_id)
          REFERENCES audit_events(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ix_audit_resource_target ON audit_resource_events (resource_type, resource_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ix_audit_events_actor_occurred ON audit_events (actor_id, occurred_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS audit_meta_events');
    await queryRunner.query('DROP TABLE IF EXISTS audit_auth_events');
    await queryRunner.query('DROP TABLE IF EXISTS audit_resource_events');
    await queryRunner.query('DROP TABLE IF EXISTS audit_events');
  }
}